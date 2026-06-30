// src/pages/api/scrape-ingest.ts
// API endpoint to ingest scraped reports from the browser extension.
// Protected by X-Scrape-Key header.
import type { APIRoute } from 'astro';
import { createReport, checkReportExistsByPostUrl } from '../../utils/db';
import type { PendingReport } from './report';
import { getEnv } from '../../utils/env';
import { classifyScrapedPost } from '../../utils/scanner';

interface ScrapedIdentifier {
  value: string;
  type: string; // e.g., 'bKash Number', 'Facebook Page'
}

interface ScrapedPost {
  postUrl: string;
  postText: string;
  posterName: string;
  posterUrl?: string;
  postDate: string;
  identifiers?: ScrapedIdentifier[];
  images?: string[];
}

function extractPhoneNumbers(text: string): ScrapedIdentifier[] {
  const identifiers: ScrapedIdentifier[] = [];
  // Matches Bangladeshi phone numbers: 013-019 followed by 8 digits
  const phoneRegex = /\b01[3-9]\d{8}\b/g;
  const matches = text.match(phoneRegex);
  if (matches) {
    const uniqueMatches = Array.from(new Set(matches));
    for (const phone of uniqueMatches) {
      identifiers.push({ value: phone, type: 'bKash Number' });
    }
  }
  return identifiers;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Scrape-Key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
};

export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  try {
    const env = await getEnv();
    const scrapeKey = env?.SCRAPE_INGEST_KEY || 'dev-scrape-key-change-in-production';

    // ── Authentication Check ──
    const authHeader = request.headers.get('X-Scrape-Key');
    const url = new URL(request.url);
    const authParam = url.searchParams.get('key');
    const providedKey = authHeader ?? authParam ?? '';

    if (providedKey !== scrapeKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // ── Parse Body ──
    let posts: ScrapedPost[];
    try {
      posts = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (!Array.isArray(posts)) {
      return new Response(JSON.stringify({ error: 'Body must be a JSON array of posts' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    let ingestedReportsCount = 0;
    let skippedCount = 0;
    let autoRejectedCount = 0;

    for (const post of posts) {
      if (!post.postText || !post.postUrl) {
        continue;
      }

      // Check if report already exists in database (de-duplication check)
      const exists = await checkReportExistsByPostUrl(post.postUrl);
      if (exists) {
        console.log(`[Scraper Ingestion] Post already exists, skipping: "${post.postUrl}"`);
        skippedCount++;
        continue;
      }

      // Collect identifiers (either pre-parsed by the extension, or extracted dynamically via regex)
      let idents = post.identifiers || [];
      if (idents.length === 0) {
        idents = extractPhoneNumbers(post.postText);
      }

      // If still no identifiers, default to using the post URL itself as a "Facebook Page/Post" tracker
      if (idents.length === 0) {
        idents.push({
          value: post.postUrl,
          type: 'Facebook Page',
        });
      }

      // Download scraped images and save to R2 or convert to Base64
      const processedImages: string[] = [];
      if (post.images && post.images.length > 0) {
        for (const imgUrl of post.images) {
          try {
            const res = await fetch(imgUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              },
            });
            if (res.ok) {
              const contentType = res.headers.get('Content-Type') || 'image/jpeg';
              const buffer = await res.arrayBuffer();
              
              const bucket = env?.EVIDENCE_BUCKET;
              if (bucket) {
                const fileExtension = contentType.split('/')[1] || 'jpg';
                const key = `scraped-evidence/${crypto.randomUUID()}.${fileExtension}`;
                await bucket.put(key, buffer, {
                  httpMetadata: { contentType },
                });
                processedImages.push(key);
              } else {
                let binary = '';
                const bytes = new Uint8Array(buffer);
                const len = bytes.byteLength;
                for (let i = 0; i < len; i++) {
                  binary += String.fromCharCode(bytes[i]);
                }
                const base64 = btoa(binary);
                processedImages.push(`data:${contentType};base64,${base64}`);
              }
            } else {
              processedImages.push(imgUrl);
            }
          } catch (e) {
            console.error('[scrape-ingest] Failed to download scraped image:', e);
            processedImages.push(imgUrl);
          }
        }
      }

      // Run AI/heuristic classification on the post caption to check if it's a real scam report
      console.log(`\n[Scraper Ingestion] 📥 Received post: "${post.postUrl}"`);
      const startTime = Date.now();
      const classification = await classifyScrapedPost(post.postText, env?.GROQ_API_KEY, env?.GEMINI_API_KEY);
      const isScamReport = classification.isScamReport;
      const duration = Date.now() - startTime;

      console.log(`[Scraper Ingestion] 🤖 AI classification finished in ${duration}ms:`);
      console.log(`   ├─ Scam Complaint?: ${isScamReport ? 'YES ✅' : 'NO ❌'}`);
      console.log(`   ├─ Action: ${isScamReport ? 'Sent to Pending queue' : 'Sent to Rejected queue'}`);
      console.log(`   └─ Explanation: "${classification.explanation}"`);

      if (!isScamReport) {
        autoRejectedCount++;
      }

      // Format report body content combining caption and photos as structured JSON
      const complaintBodyObj = {
        scraped: true,
        postUrl: post.postUrl,
        posterName: post.posterName || 'Unknown User',
        posterUrl: post.posterUrl || '',
        postText: post.postText.trim(),
        images: processedImages,
        autoRejected: !isScamReport,
        rejectionReason: !isScamReport ? classification.explanation : undefined,
      };
      const complaintBody = JSON.stringify(complaintBodyObj);

      for (const ident of idents) {
        const report: PendingReport = {
          id: crypto.randomUUID(),
          reporterType: 'BUYER', // Default to BUYER (crowdsourced complaints are mostly buyer reports)
          entityIdentifier: ident.value.trim(),
          entityType: ident.type || 'Facebook Page',
          incidentDate: post.postDate || new Date().toISOString().split('T')[0],
          complaintText: complaintBody.trim(),
          evidenceFileName: post.postUrl, // Store the post URL as the evidence key/filename
          status: isScamReport ? 'PENDING' : 'REJECTED',
          createdAt: new Date().toISOString(),
          source: 'SCRAPED',
        };

        await createReport(report, null, locals);
        ingestedReportsCount++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: `Processed ${posts.length} posts.`,
        count: ingestedReportsCount,
        skipped: skippedCount,
        rejected: autoRejectedCount,
      }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  } catch (err) {
    console.error('[api/scrape-ingest] Ingestion error:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
};

// src/pages/api/admin/retry-ai-classification.ts
import type { APIRoute } from 'astro';
import { getEnv } from '../../../utils/env';
import { classifyScrapedPost } from '../../../utils/scanner';

export const POST: APIRoute = async (context) => {
  const { url } = context;
  const key = url.searchParams.get('key') || '';

  try {
    const env = await getEnv();
    const adminSecret = env.ADMIN_SECRET_KEY || 'dev-admin-key-change-in-production';

    // ── 1. Authentication Check ──
    if (key !== adminSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = env?.DB;
    const aiBinding = env?.AI;
    const geminiKey = env?.GEMINI_API_KEY;

    if (!db) {
      return new Response(JSON.stringify({ error: 'D1 Database connection missing.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Fetch all PENDING reports ──
    const pendingResult = await db.prepare("SELECT * FROM reports WHERE status = 'PENDING'").all();
    const reports = pendingResult.results || [];

    let processedCount = 0;
    let reclassifiedScamCount = 0;
    let reclassifiedRejectedCount = 0;
    const now = new Date().toISOString();

    // ── 3. Find and retry reports with aiFailed = true ──
    for (const r of reports) {
      try {
        if (!r.complaint_text) continue;

        let parsed: any;
        try {
          parsed = JSON.parse(r.complaint_text);
        } catch {
          continue; // not structured JSON
        }

        if (parsed.aiFailed !== true) continue;

        processedCount++;
        const postText = parsed.postText || '';

        // Run AI classification (Workers AI -> Gemini)
        const classification = await classifyScrapedPost(postText, aiBinding, geminiKey);
        const isScamReport = classification.isScamReport;

        if (isScamReport === null) {
          // AI failed again, skip to try next time
          console.warn(`[RetryAI] AI failed again for report ${r.id}`);
          continue;
        }

        if (isScamReport === true) {
          // It is a scam! Keep as PENDING, but clear the aiFailed flag
          const updatedBody = {
            ...parsed,
            aiFailed: undefined,
            autoRejected: false,
            rejectionReason: undefined
          };
          await db
            .prepare("UPDATE reports SET complaint_text = ? WHERE id = ?")
            .bind(JSON.stringify(updatedBody), r.id)
            .run();
          
          reclassifiedScamCount++;
          console.log(`[RetryAI] Report ${r.id} successfully classified as scam (kept PENDING)`);
        } else {
          // Not a scam! Auto-reject
          const updatedBody = {
            ...parsed,
            aiFailed: undefined,
            autoRejected: true,
            rejectionReason: classification.explanation
          };
          await db
            .prepare("UPDATE reports SET status = 'REJECTED', complaint_text = ?, reviewed_at = ? WHERE id = ?")
            .bind(JSON.stringify(updatedBody), now, r.id)
            .run();

          reclassifiedRejectedCount++;
          console.log(`[RetryAI] Report ${r.id} successfully classified as safe (moved to REJECTED)`);
        }
      } catch (err) {
        console.error(`[RetryAI] Error processing report ${r.id}:`, err);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      processedCount,
      reclassifiedScamCount,
      reclassifiedRejectedCount
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[RetryAI API] Error:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error', message: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

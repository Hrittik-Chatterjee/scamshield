// src/utils/scanner.ts

// Platform domains to skip WHOIS/URLScan checks on
const PLATFORM_DOMAINS = [
  'facebook.com', 'www.facebook.com', 'fb.com', 'm.facebook.com',
  'instagram.com', 'www.instagram.com',
  'youtube.com', 'www.youtube.com', 'youtu.be',
  'tiktok.com', 'www.tiktok.com',
  'twitter.com', 'x.com',
  'linkedin.com', 'pinterest.com',
  'github.com', 'google.com'
];

export interface ScanResult {
  whoisAgeDays?: number;
  safeBrowsingOk: boolean;
  urlscanVerdict: string;
  webSearchSummary: string;
  flags: string[];
  riskVerdict: 'safe' | 'caution' | 'high' | 'confirmed';
  explanation: string;
}

// ── Domain Extractor ────────────────────────────────────────────────
export function extractDomain(input: string): string | null {
  const clean = input.trim().toLowerCase();
  if (clean.includes(' ')) return null; // Has spaces, not a domain
  if (/^\+?[0-9\-]+$/.test(clean)) return null; // Looks like a phone number

  let hostname = clean;
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    hostname = 'http://' + clean;
  }
  try {
    const url = new URL(hostname);
    const host = url.hostname.replace(/^www\./, '');
    if (host.includes('.') && host.split('.').pop()!.length >= 2) {
      if (PLATFORM_DOMAINS.includes(host) || PLATFORM_DOMAINS.includes('www.' + host)) {
        return null; // Skip platforms
      }
      return host;
    }
  } catch {}
  return null;
}

// ── WHOIS/RDAP Scanner ──────────────────────────────────────────────
export async function getDomainAgeInDays(domain: string): Promise<number | undefined> {
  try {
    console.log(`[Scanner] Fetching RDAP for domain: ${domain}`);
    const res = await fetch(`https://rdap.org/domain/${domain}`, {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) {
      console.warn(`[Scanner] RDAP query failed: ${res.status}`);
      return undefined;
    }
    const data: any = await res.json();
    const events: any[] = data.events || [];
    const registrationEvent = events.find(
      (e) => e.eventAction === 'registration' || e.eventAction === 'creation'
    );
    if (registrationEvent?.eventDate) {
      const regDate = new Date(registrationEvent.eventDate);
      const diffMs = Date.now() - regDate.getTime();
      return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }
  } catch (err) {
    console.error(`[Scanner] Error fetching domain age for ${domain}:`, err);
  }
  return undefined;
}

// ── Google Safe Browsing Lookup ─────────────────────────────────────
export async function checkGoogleSafeBrowsing(url: string, apiKey?: string): Promise<boolean> {
  if (!apiKey) {
    console.warn('[Scanner] GOOGLE_SAFE_BROWSING_KEY is missing. Safe Browsing check skipped.');
    return true; // assume safe when skipped
  }
  try {
    console.log(`[Scanner] Running Google Safe Browsing on: ${url}`);
    const endpoint = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`;
    const payload = {
      client: {
        clientId: 'scamshieldbd',
        clientVersion: '1.0.0'
      },
      threatInfo: {
        threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'],
        platformTypes: ['ANY_PLATFORM'],
        threatEntryTypes: ['URL'],
        threatEntries: [{ url }]
      }
    };
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.warn(`[Scanner] Google Safe Browsing API returned error: ${res.status}`);
      return true;
    }
    const data: any = await res.json();
    // Safe Browsing returns threat matches if flagged
    return !(data.matches && data.matches.length > 0);
  } catch (err) {
    console.error('[Scanner] Google Safe Browsing error:', err);
    return true;
  }
}

// ── URLScan.io Lookup ───────────────────────────────────────────────
export async function checkURLScan(domain: string, apiKey?: string): Promise<string> {
  try {
    console.log(`[Scanner] Checking URLScan.io for domain: ${domain}`);
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (apiKey) {
      headers['API-Key'] = apiKey;
    }
    const res = await fetch(`https://urlscan.io/api/v1/malicious/domain/${domain}`, { headers });
    if (!res.ok) {
      console.warn(`[Scanner] URLScan.io returned error: ${res.status}`);
      return 'unknown';
    }
    const data: any = await res.json();
    if (data.count && data.count > 0) {
      return `malicious (flagged in ${data.count} scans)`;
    }
    return 'clean';
  } catch (err) {
    console.error('[Scanner] URLScan.io error:', err);
    return 'unknown';
  }
}

// ── Bing Search Snippets ─────────────────────────────────────────────
export async function getWebSearchSnippets(query: string, apiKey?: string): Promise<string> {
  if (!apiKey) {
    console.warn('[Scanner] BING_SEARCH_KEY is missing. Search snippets check skipped.');
    return '';
  }
  try {
    console.log(`[Scanner] Searching Bing for: ${query}`);
    const escapedQuery = encodeURIComponent(`"${query}" scam complaint Bangladesh`);
    const endpoint = `https://api.bing.microsoft.com/v7.0/search?q=${escapedQuery}&count=5`;
    const res = await fetch(endpoint, {
      headers: { 'Ocp-Apim-Subscription-Key': apiKey }
    });
    if (!res.ok) {
      console.warn(`[Scanner] Bing Search API returned error: ${res.status}`);
      return '';
    }
    const data: any = await res.json();
    const pages = data.webPages?.value || [];
    if (pages.length === 0) return 'No web complaints or reviews found in search results.';
    return pages
      .map((p: any, i: number) => `Result ${i + 1}: ${p.name}\nSnippet: ${p.snippet}\nSource: ${p.url}`)
      .join('\n\n');
  } catch (err) {
    console.error('[Scanner] Bing Search error:', err);
    return '';
  }
}

// ── AI Inference ────────────────────────────────────────────────────
export async function runAIInference(
  prompt: string,
  groqKey?: string | string[],
  geminiKey?: string,
  diagnostics?: { whoisAgeDays?: number; safeBrowsingOk: boolean; urlscanVerdict: string }
): Promise<{
  riskVerdict: 'safe' | 'caution' | 'high' | 'confirmed';
  explanation: string;
  flags: string[];
}> {
  // Collect all available Groq keys to try in sequence
  const keysToTry: string[] = [];
  if (Array.isArray(groqKey)) {
    keysToTry.push(...groqKey.filter(Boolean));
  } else if (groqKey) {
    keysToTry.push(groqKey);
  }

  for (const key of keysToTry) {
    try {
      console.log('[Scanner] Triggering Groq API...');
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'You are ScamShield BD\'s AI risk engine. You evaluate Bangladeshi online sellers/buyers for scam/fraud indicators and return structured verdicts in JSON. Return strictly a JSON object.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          response_format: { type: 'json_object' }
        })
      });

      if (res.ok) {
        const data: any = await res.json();
        const contentText = data.choices?.[0]?.message?.content;
        if (contentText) {
          const parsed = JSON.parse(contentText);
          return {
            riskVerdict: parsed.riskVerdict || 'caution',
            explanation: parsed.explanation || 'Analyzed via primary AI.',
            flags: parsed.flags || []
          };
        }
      } else {
        console.warn(`[Scanner] Groq API returned error: ${res.status}`);
      }
    } catch (err) {
      console.error('[Scanner] Groq inference error, trying next key:', err);
    }
  }

  // ── 2. Gemini Inference (Fallback) ──
  if (geminiKey) {
    try {
      console.log('[Scanner] Triggering Gemini API fallback...');
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{
                text: `${prompt}\n\nRespond strictly with a JSON object containing: riskVerdict (safe/caution/high/confirmed), explanation (string), and flags (array of strings).`
              }]
            }
          ],
          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      });

      if (res.ok) {
        const data: any = await res.json();
        const contentText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (contentText) {
          const parsed = JSON.parse(contentText);
          return {
            riskVerdict: parsed.riskVerdict || 'caution',
            explanation: parsed.explanation || 'Analyzed via Gemini fallback.',
            flags: parsed.flags || []
          };
        }
      } else {
        console.warn(`[Scanner] Gemini API returned error: ${res.status}`);
      }
    } catch (err) {
      console.error('[Scanner] Gemini inference error:', err);
    }
  }

  // ── 3. Static Default Fallback (if both AI APIs fail or keys are missing) ──
  console.warn('[Scanner] Both AI inference APIs failed or keys are missing. Using static fallback.');
  
  // Basic static heuristic
  let verdict: 'safe' | 'caution' | 'high' | 'confirmed' = 'safe';
  let explanation = 'Could not run real-time AI scan because API keys are not configured. Evaluated using local heuristics only.';
  const flags: string[] = [];

  if (diagnostics) {
    if (diagnostics.whoisAgeDays !== undefined && diagnostics.whoisAgeDays < 90) {
      verdict = 'caution';
      flags.push('young_website');
      explanation += ' The website domain is very new (registered under 90 days ago) which is a common indicator of temporary scam storefronts.';
    }
    if (!diagnostics.safeBrowsingOk) {
      verdict = 'high';
      flags.push('malicious_url');
      explanation += ' This URL has been flagged in security databases for phishing or malware.';
    }
    if (diagnostics.urlscanVerdict !== 'clean' && diagnostics.urlscanVerdict !== 'unknown') {
      verdict = 'high';
      flags.push('malicious_url');
      explanation += ' This URL has been flagged as malicious in the URLScan database.';
    }
  }

  if (flags.length === 0) {
    verdict = 'safe';
    explanation = 'No negative indicators found. Evaluated using local database and registry checks.';
  }

  return { riskVerdict: verdict, explanation, flags };
}

export async function classifyScrapedPost(
  text: string,
  aiBinding?: any,
  geminiKey?: string
): Promise<{ isScamReport: boolean | null; explanation: string }> {
  const prompt = `You are ScamShield BD's post classification model.
Analyze the following Facebook post text from a Bangladeshi buyer safety group.
Classify whether the post is:
1. A report/complaint about a scam, fraud, cheating, money loss, or receiving fake/damaged/duplicate products from a seller (isScamReport = true).
2. A general recommendation request, suggestion query, product lookup, or general greeting/question (isScamReport = false). E.g. "I want to buy a charger, suggest authentic page", "is this shop authentic?", "where can I buy X?"

Post Text:
"""
${text}
"""

Respond ONLY with a JSON object in this format:
{
  "isScamReport": true | false,
  "explanation": "Brief explanation in English (1 sentence)."
}`;

  // ── 1. Cloudflare Workers AI (Primary for Scraper) ──
  if (aiBinding) {
    try {
      console.log('[Scanner] Classifying post via Cloudflare Workers AI...');
      const res = await aiBinding.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
          { role: 'system', content: 'You are ScamShield BD\'s post classifier. Return strictly a JSON object.' },
          { role: 'user', content: prompt }
        ]
      });

      const contentText = res.response || '';
      if (contentText) {
        let jsonText = contentText.trim();
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonText = jsonMatch[0];
        }
        const parsed = JSON.parse(jsonText);
        return {
          isScamReport: parsed.isScamReport === true,
          explanation: parsed.explanation || 'Analyzed via Cloudflare Workers AI.'
        };
      }
    } catch (err) {
      console.error('[Scanner] Cloudflare Workers AI classification error, falling back:', err);
    }
  }

  // ── 2. Gemini Inference (Fallback) ──
  if (geminiKey && geminiKey !== 'paste_your_gemini_api_key_here') {
    try {
      console.log('[Scanner] Classifying post via Gemini fallback...');
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{
                text: `${prompt}\n\nRespond strictly with a JSON object containing: isScamReport (boolean) and explanation (string).`
              }]
            }
          ],
          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      });

      if (res.ok) {
        const data: any = await res.json();
        const contentText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (contentText) {
          const parsed = JSON.parse(contentText);
          return {
            isScamReport: parsed.isScamReport === true,
            explanation: parsed.explanation || 'Analyzed via Gemini fallback.'
          };
        }
      }
    } catch (err) {
      console.error('[Scanner] Gemini classification error:', err);
    }
  }

  // ── 3. Failure State (Queue for Manual Review) ──
  console.warn('[Scanner] Both Cloudflare AI and Gemini failed to classify the post.');
  return {
    isScamReport: null,
    explanation: 'AI Classification failed (Rate Limited / Service Offline).'
  };
}

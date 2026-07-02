// src/pages/api/ai-scan.ts
import type { APIRoute } from 'astro';
import { getAICache, setAICache } from '../../utils/db';
import { getEnv } from '../../utils/env';
import {
  extractDomain,
  getDomainAgeInDays,
  checkGoogleSafeBrowsing,
  checkURLScan,
  getWebSearchSnippets,
  runAIInference,
} from '../../utils/scanner';

export const GET: APIRoute = async (context) => {
  const { url, locals } = context;
  const query = url.searchParams.get('q')?.trim() ?? '';
  const mode  = url.searchParams.get('mode') === 'seller' ? 'seller' : 'buyer';

  if (!query) {
    return new Response(JSON.stringify({ error: 'Query parameter "q" is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // ── 1. Check AI Cache (24h TTL) ──────────────────────────────────
    const cacheCheck = await getAICache(query, locals);
    if (cacheCheck.cached) {
      console.log(`[ai-scan] Cache hit for query: "${query}"`);
      return new Response(JSON.stringify(cacheCheck.data), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`[ai-scan] Cache miss. Initiating scan for query: "${query}"`);
    const env = await getEnv();

    // ── 2. Run Parallel Scans ─────────────────────────────────────────
    const domain = extractDomain(query);
    let whoisAgeDays: number | undefined = undefined;
    let safeBrowsingOk = true;
    let urlscanVerdict = 'clean';
    let webSearchSummary = '';

    const promises: Promise<any>[] = [];

    // Run domain-specific queries
    if (domain) {
      promises.push(
        getDomainAgeInDays(domain).then(age => whoisAgeDays = age),
        checkURLScan(domain, env.URLSCAN_API_KEY).then(verdict => urlscanVerdict = verdict)
      );
    }

    // Google Safe Browsing
    const scanUrl = domain ? `http://${domain}` : query;
    promises.push(
      checkGoogleSafeBrowsing(scanUrl, env.GOOGLE_SAFE_BROWSING_KEY).then(ok => safeBrowsingOk = ok)
    );

    // Bing Search snippets
    promises.push(
      getWebSearchSnippets(query, env.BING_SEARCH_KEY).then(summary => webSearchSummary = summary)
    );

    // Wait for all lookups to resolve concurrently
    await Promise.all(promises);

    // ── 3. Build Prompt for AI ────────────────────────────────────────
    let domainAgeMessage = 'N/A (Not a custom domain name)';
    if (domain) {
      domainAgeMessage = whoisAgeDays !== undefined 
        ? `${whoisAgeDays} days old` 
        : 'Unknown registry age (lookup failed or domain inactive)';
    }

    const prompt = `You are ScamShield BD's AI risk engine. You evaluate Bangladeshi online sellers/buyers for scam/fraud indicators.
Analyze the following safety scan signals and decide on a risk verdict.

Entity Identifier: "${query}"
Entity Type: ${mode === 'buyer' ? 'Seller / Shop' : 'Buyer Profile / Phone'}

Safety Scan Diagnostics:
- Domain Registration Age: ${domainAgeMessage}
- Google Safe Browsing: ${safeBrowsingOk ? 'Safe (not listed in phishing/malware threat database)' : 'Flagged as MALWARE/SOCIAL_ENGINEERING'}
- URLScan.io Verdict: ${urlscanVerdict}
- Web Search Snippets (Search query: "${query} scam complaint Bangladesh"):
"""
${webSearchSummary || 'No search results found.'}
"""

Instructions:
1. Classify the risk as one of:
   - "safe": No negative signals, normal domain age if applicable.
   - "caution": Mild indicators, newly registered domain (under 90 days), or unverified search rumors.
   - "high": Confirmed phishing warnings, multiple independent scam complaints in search snippets, or highly suspect details.
   - "confirmed": Verified scam database history.
2. Formulate a short, readable explanation of your decision in English (1-2 sentences).
3. If risk indicators are found, select matching flag keys from:
   - "young_website" (if domain is registered <90 days)
   - "malicious_url" (if Safe Browsing fails or URLScan flags it)
   - "web_complaints" (if search snippets show complaints)
   - "suspicious_history" (if general trading red flags are spotted)

Respond ONLY with a JSON object in this format:
{
  "riskVerdict": "safe" | "caution" | "high" | "confirmed",
  "explanation": "Short detailed explanation...",
  "flags": ["young_website", "malicious_url", "web_complaints", "suspicious_history"]
}`;

    // ── 4. AI Inference ───────────────────────────────────────────────
    const aiResponse = await runAIInference(
      prompt,
      [env.GROQ_API_KEY_CHAT_1, env.GROQ_API_KEY_CHAT_2],
      env.GEMINI_API_KEY,
      { whoisAgeDays, safeBrowsingOk, urlscanVerdict }
    );

    // ── 5. Cache & Return ─────────────────────────────────────────────
    const finalResult = {
      whoisAgeDays,
      safeBrowsingOk,
      urlscanVerdict,
      webSearchSummary: webSearchSummary ? webSearchSummary.slice(0, 500) : '', // keep cache compact
      flags: aiResponse.flags,
      riskVerdict: aiResponse.riskVerdict,
      explanation: aiResponse.explanation,
      analyzedAt: new Date().toISOString()
    };

    await setAICache(query, finalResult, locals);

    return new Response(JSON.stringify(finalResult), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('[ai-scan] API endpoint error:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error', message: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

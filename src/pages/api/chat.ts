// src/pages/api/chat.ts
import type { APIRoute } from 'astro';
import { getEnv } from '../../utils/env';
import { generateEmbedding, queryVectors } from '../../utils/vector';
import { createReport } from '../../utils/db';
import type { PendingReport } from './report';

// In-memory rate limiting map (cleared on worker restarts)
const ipRateLimit = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = ipRateLimit.get(ip) || [];
  
  // Filter out timestamps older than 1 minute
  const activeTimestamps = timestamps.filter(t => now - t < 60000);
  activeTimestamps.push(now);
  ipRateLimit.set(ip, activeTimestamps);

  // Limit to max 5 requests per minute
  return activeTimestamps.length > 5;
}

// ── Nara Router: Dynamic Model Selection ──────────────────────────────
// Free models in plan priority order (best first).
const NARA_MODEL_PRIORITY = [
  'claude-sonnet-4.5',
  'claude-haiku-4.5',
  'mistral-large',
  'mistral-medium-3-5',
];

// Keep track of models that return 402 (Payment Required) or 400 (Bad Request/Invalid) in memory.
const unusableModels = new Set<string>();

// Hardcoded fallback if /v1/models is unreachable
const NARA_FALLBACK_MODELS = ['claude-sonnet-4.5', 'claude-haiku-4.5', 'mistral-large', 'mistral-medium-3-5'];

// In-memory cache for available Nara models (cleared on worker restarts)
let naraModelCache: { models: string[]; fetchedAt: number } | null = null;
const NARA_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getNaraModels(apiKey: string): Promise<string[]> {
  // Return cached list filtered of unusable models if still fresh
  if (naraModelCache && Date.now() - naraModelCache.fetchedAt < NARA_CACHE_TTL_MS) {
    return naraModelCache.models.filter(m => !unusableModels.has(m));
  }

  try {
    console.log('[Nara] Fetching available models from /v1/models...');
    const res = await fetch('https://router.bynara.id/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (res.ok) {
      const data: any = await res.json();
      const available = (data.data || []).map((m: any) => m.id as string);
      console.log(`[Nara] Available models: ${available.join(', ')}`);

      // Filter out unusable models
      const freeAvailable = available.filter((m: string) => !unusableModels.has(m));

      // Sort by priority: preferred models first, then any extras alphabetically
      const prioritized = NARA_MODEL_PRIORITY.filter(m => freeAvailable.includes(m));
      const extras = freeAvailable.filter((m: string) => !NARA_MODEL_PRIORITY.includes(m)).sort();
      const sorted = [...prioritized, ...extras];

      naraModelCache = { models: sorted, fetchedAt: Date.now() };
      return sorted;
    } else {
      console.warn(`[Nara] /v1/models failed: ${res.status}, using fallback list`);
    }
  } catch (err) {
    console.error('[Nara] Error fetching models:', err);
  }

  return NARA_FALLBACK_MODELS.filter(m => !unusableModels.has(m));
}

export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  const clientIp = request.headers.get('CF-Connecting-IP') || '127.0.0.1';

  if (isRateLimited(clientIp)) {
    return new Response(JSON.stringify({
      message: 'Too many requests. Please wait a minute before sending another message.',
      action: null,
      requiresReportField: null
    }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  // ── 1. Security Check: Rate Limiting 

  try {
    const body = await request.json();
    const { messages, uploadedFileKey, uploadedFileName } = body;

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid messages array' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const env = await getEnv();
    const db = env?.DB;
    const aiBinding = env?.AI;
    const vectorizeBinding = env?.VECTORIZE;

    // ── 2. RAG Pipeline: Vector search for database context ──
    const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop()?.content || '';
    let ragContext = 'No relevant database records found for this query.';
    let matchedReportsList: any[] = [];

    // ── Dynamic Intent Classification via Cloudflare Workers AI ──
    let classifiedIntent: 'SEARCH' | 'REPORT' | 'CHAT' = 'CHAT';
    let searchTarget = lastUserMessage;

    if (lastUserMessage && aiBinding) {
      try {
        console.log('[RAG] Classifying intent via Cloudflare Workers AI...');
        const classificationPrompt = `Classify the user's intent in this Bangladeshi online shopping scam assistant chat.
User message: "${lastUserMessage}"

Intent options:
- "SEARCH": The user wants to search/lookup/check a page name, link, phone number, website, or shop for scams (e.g., "is FakeShop BD a scam?", "check this number 01712345678", "facebook.com/shop").
- "REPORT": The user explicitly wants to report a scam, submit a scam story, or start the reporting process (e.g., "I want to report a scam", "help me submit a scam report").
- "CHAT": Greetings, general questions, comments, or chit-chat (e.g., "hello", "hi", "how does this work?").

Respond STRICTLY with a JSON object in this format:
{
  "intent": "SEARCH" | "REPORT" | "CHAT",
  "extractedTarget": "string or null" (only extract the clean shop name, phone number, website, or URL if the intent is SEARCH)
}`;
        const classificationRes = await aiBinding.run('@cf/meta/llama-3.2-3b-instruct', {
          messages: [
            { role: 'system', content: 'You are ScamShield BD\'s message router. Respond strictly with JSON.' },
            { role: 'user', content: classificationPrompt }
          ]
        });

        const responseObj = classificationRes.response;
        if (responseObj && typeof responseObj === 'object') {
          classifiedIntent = responseObj.intent || 'CHAT';
          if (classifiedIntent === 'SEARCH' && responseObj.extractedTarget) {
            searchTarget = responseObj.extractedTarget;
          }
        } else if (responseObj && typeof responseObj === 'string') {
          // Fallback if string is returned in other environments
          const jsonMatch = responseObj.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            classifiedIntent = parsed.intent || 'CHAT';
            if (classifiedIntent === 'SEARCH' && parsed.extractedTarget) {
              searchTarget = parsed.extractedTarget;
            }
          }
        }
        console.log(`[RAG] Classified intent: ${classifiedIntent}, Target: "${searchTarget}"`);
      } catch (err) {
        console.error('[RAG] Workers AI classification error, falling back to heuristics:', err);
        // Heuristics fallback
        const cleanMessage = lastUserMessage.trim().toLowerCase();
        const isGreeting = ['hello', 'hi', 'hey', 'yo', 'halo', 'greetings', 'test'].includes(cleanMessage) || cleanMessage.length < 3;
        const isGenericReportingIntent = 
          /^(i\s+)?want\s+to\s+report/i.test(cleanMessage) || 
          /^how\s+to\s+report/i.test(cleanMessage) || 
          /^report\s+a\s+scam/i.test(cleanMessage) ||
          cleanMessage === 'report' ||
          cleanMessage === 'help';
        const hasIdentifierPattern = 
          /\b(01\d{9})\b/.test(cleanMessage) ||
          /facebook\.com/i.test(cleanMessage) ||
          /http[s]?:\/\//i.test(cleanMessage) ||
          /\.[a-z]{2,6}\b/i.test(cleanMessage) ||
          (cleanMessage.length > 5 && !cleanMessage.includes(' ') && !isGenericReportingIntent);

        if (!isGreeting && !isGenericReportingIntent && (hasIdentifierPattern || cleanMessage.length > 8)) {
          classifiedIntent = 'SEARCH';
        }
      }
    }

    const shouldSearchRAG = (classifiedIntent === 'SEARCH') && searchTarget.length > 0;

    if (lastUserMessage && shouldSearchRAG && aiBinding && vectorizeBinding) {
      try {
        console.log(`[RAG] Generating embedding for target: "${searchTarget}"`);
        const queryVector = await generateEmbedding(searchTarget, aiBinding);
        if (queryVector && queryVector.length > 0) {
          const matches = await queryVectors(vectorizeBinding, queryVector, 6);
          console.log(`[RAG] Raw Vectorize matches for query "${lastUserMessage}":`, matches);
          
          const matchedIds = matches.filter(m => m.score > 0.5).map(m => m.id);
          
          if (matchedIds.length > 0 && db) {
            console.log(`[RAG] Matches above threshold (0.5):`, matchedIds);
            const placeholders = matchedIds.map(() => '?').join(',');
            const reportsResult = await db
              .prepare(`SELECT * FROM reports WHERE id IN (${placeholders}) AND status = 'APPROVED'`)
              .bind(...matchedIds)
              .all();
            
            if (reportsResult && reportsResult.results && reportsResult.results.length > 0) {
              matchedReportsList = reportsResult.results.map((r: any) => ({
                id: r.id,
                entityIdentifier: r.entity_identifier,
                entityType: r.entity_type,
                incidentDate: r.incident_date,
                amountLost: r.amount_lost || undefined,
                complaintText: r.complaint_text,
                evidenceFileName: r.evidence_r2_key || undefined
              }));

              ragContext = reportsResult.results.map((r: any) => {
                let complaintText = r.complaint_text;
                try {
                  const parsed = JSON.parse(r.complaint_text);
                  complaintText = parsed.postText || r.complaint_text;
                } catch {}
                return `- Report ID: ${r.id}
  Target Shop/Phone: ${r.entity_identifier} (Type: ${r.entity_type})
  Date of Incident: ${r.incident_date}
  Amount Lost: ${r.amount_lost || 'Unknown'} BDT
  Details: ${complaintText}
`;
              }).join('\n');
            }
          }
        }
      } catch (ragErr) {
        console.error('[RAG] Error fetching contextual records:', ragErr);
      }
    }

    // ── 3. Build Agent Instructions ──
    const systemPrompt = `You are ScamShield BD's Conversational Reporting Agent.
Your goal is to:
1. Help users search for scam histories (using the Database Context below).
2. Answer questions about online shop fraud in Bangladesh.
3. Help users submit a scam report through a natural, friendly conversation.

DATABASE CONTEXT (Scams already reported in our system):
\"\"\"
${ragContext}
\"\"\"

REPORT SUBMISSION RULES (HOW TO FILE A REPORT):
To submit a report, you must guide the user to collect ALL of the following details:
- Scammer Identifier: Must be a specific Facebook page URL/name, website domain, or bKash/Nagad phone number.
- Scammer Type: Categorize it as "Facebook Page", "Website", "bKash Number", nagad/phone, etc.
- Incident Date: The date the incident occurred (YYYY-MM-DD). If they say "yesterday" or "last week", calculate it relative to today: ${new Date().toISOString().split('T')[0]}.
- Amount Lost: Optional, but ask for it (must be a number in BDT).
- Description: Details of what happened (must be a coherent sentence of at least 20 characters. Reject gibberish like "asd asd").
- Evidence: Confirm they have uploaded a screenshot of the chat/payment receipt. Note: If the user provides a key or filename in the metadata, you have the evidence.

If they want to report a scam but are missing details, ask them for the missing details politely.
Do not fabricate or guess any field values. Set them to null or leave them out if not explicitly given.

Once you have ALL required fields (Identifier, Type, Date, Description, and Evidence):
1. Respond with a confirmation message.
2. Set "action" to "SUBMIT_REPORT".
3. Populate "reportData" in the JSON response exactly matching the schema.

JSON RESPONSE FORMAT:
You MUST respond strictly with a JSON object. No Markdown outside the JSON. Format:
{
  "message": "Write your reply to the user here. Use markdown formatting for lists or bold text.",
  "requiresReportField": "identifier" | "date" | "amount" | "description" | "evidence" | null,
  "action": "SUBMIT_REPORT" | null,
  "reportData": {
    "entityIdentifier": "...",
    "entityType": "...",
    "incidentDate": "YYYY-MM-DD",
    "amountLost": 1500,
    "complaintText": "..."
  }
}`;

    // Add current uploaded file key if any as metadata inside the LLM prompt
    let userPrompt = lastUserMessage;
    if (uploadedFileKey) {
      userPrompt += `\n\n[System Metadata: User has successfully uploaded evidence file "${uploadedFileName || 'receipt.png'}" with R2 key: "${uploadedFileKey}"]`;
    }

    // ── 4. Trigger Groq / Gemini / Nara Fallback Engine ──
    let chatResponseText = '';
    let apiUsed = 'None';

    // 4.1 Try Groq Keys (Primary)
    const groqKeys = [
      env.GROQ_API_KEY_CHAT_1,
      env.GROQ_API_KEY_CHAT_2,
      env.GROQ_API_KEY // Backward compatibility
    ].filter(Boolean);

    if (!chatResponseText) {
      for (let i = 0; i < groqKeys.length; i++) {
        try {
          console.log(`[Chatbot] Querying Groq Key ${i + 1}...`);
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${groqKeys[i]}`
            },
            body: JSON.stringify({
              model: 'llama-3.3-70b-versatile',
              messages: [
                { role: 'system', content: systemPrompt },
                ...messages.map((m: any) => ({ role: m.role, content: m.content })),
                ...(uploadedFileKey ? [{ role: 'user', content: `I have uploaded the screenshot evidence file. R2 key: "${uploadedFileKey}"` }] : [])
              ],
              response_format: { type: 'json_object' }
            })
          });

          if (res.ok) {
            const data: any = await res.json();
            chatResponseText = data.choices?.[0]?.message?.content || '';
            apiUsed = `Groq Key ${i + 1}`;
            break;
          } else {
            console.warn(`[Chatbot] Groq Key ${i + 1} failed: ${res.status}`);
          }
        } catch (err) {
          console.error(`[Chatbot] Groq Key ${i + 1} error:`, err);
        }
      }
    }

    // 4.2 Try Gemini (Fallback 1)
    if (!chatResponseText && env.GEMINI_API_KEY) {
      try {
        console.log('[Chatbot] Querying Gemini Fallback...');
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [{
                  text: `${systemPrompt}\n\nUser messages history:\n${JSON.stringify(messages)}\n\nRespond strictly with a JSON object containing: message (string), requiresReportField (string/null), action (string/null), and reportData (object/null).`
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
          chatResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          apiUsed = 'Gemini';
        }
      } catch (gemErr) {
        console.error('[Chatbot] Gemini Fallback error:', gemErr);
      }
    }

    // 4.3 Try Nara Router (Fallback 2 - Last Resort) — with dynamic model selection
    if (!chatResponseText && env.NARA_API_KEY) {
      const naraModels = await getNaraModels(env.NARA_API_KEY);

      for (const model of naraModels) {
        try {
          const isAnthropic = model.startsWith('claude-');
          const requestBody: any = {
            model,
            messages: isAnthropic
              ? [
                  ...messages.map((m: any) => ({ role: m.role, content: m.content })),
                  ...(uploadedFileKey ? [{ role: 'user', content: `I have uploaded the screenshot evidence file. R2 key: "${uploadedFileKey}"` }] : [])
                ]
              : [
                  { role: 'system', content: systemPrompt },
                  ...messages.map((m: any) => ({ role: m.role, content: m.content })),
                  ...(uploadedFileKey ? [{ role: 'user', content: `I have uploaded the screenshot evidence file. R2 key: "${uploadedFileKey}"` }] : [])
                ]
          };

          // Only include response_format if it is NOT an Anthropic model (causes 400 errors upstream)
          if (!isAnthropic) {
            requestBody.response_format = { type: 'json_object' };
          } else {
            // Include top-level system property for Anthropic-compatible routing
            requestBody.system = systemPrompt;
          }

          console.log(`[Chatbot] Querying Nara Router → ${model}...`);
          const res = await fetch('https://router.bynara.id/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${env.NARA_API_KEY}`
            },
            body: JSON.stringify(requestBody)
          });

          if (res.ok) {
            const data: any = await res.json();
            chatResponseText = data.choices?.[0]?.message?.content || '';
            if (chatResponseText) {
              apiUsed = `Nara Router (${model})`;
              break;
            }
          } else {
            console.warn(`[Chatbot] Nara Router → ${model} failed: ${res.status}`);
            if (res.status === 402 || res.status === 400) {
              console.log(`[Nara] Model ${model} is unusable (Status ${res.status}). Adding to unusable list.`);
              unusableModels.add(model);
            }
          }
        } catch (naraErr) {
          console.error(`[Chatbot] Nara Router → ${model} error:`, naraErr);
        }
      }
    }

    if (!chatResponseText) {
      return new Response(JSON.stringify({
        message: 'The AI chat service is temporarily busy. Please try again in a few moments.',
      action: null,
      requiresReportField: null
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`[Chatbot] AI response received via ${apiUsed}.`);
    const parsed = JSON.parse(chatResponseText);

    // ── 5. Action Handler: Automatically submit report to DB ──
    if (parsed.action === 'SUBMIT_REPORT' && parsed.reportData) {
      console.log('[Chatbot] Agent triggered SUBMIT_REPORT action!');
      const data = parsed.reportData;
      
      const complaintBody = JSON.stringify({
        scraped: false,
        posterName: 'Conversational Chat User',
        postText: data.complaintText || '',
        images: uploadedFileKey ? [uploadedFileKey] : [],
        conversationHistory: messages
      });

      const report: PendingReport = {
        id: crypto.randomUUID(),
        reporterType: 'BUYER',
        entityIdentifier: data.entityIdentifier,
        entityType: data.entityType || 'Facebook Page',
        incidentDate: data.incidentDate || new Date().toISOString().split('T')[0],
        amountLost: data.amountLost || undefined,
        complaintText: complaintBody,
        evidenceFileName: uploadedFileName || 'chat-upload.png',
        evidenceR2Key: uploadedFileKey || undefined,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      };

      await createReport(report, null, locals);
      console.log(`[Chatbot] Automatically submitted report: ${report.id}`);
      parsed.message = `✅ **Report Submitted Successfully!**\n\nI have submitted the scam report for **${data.entityIdentifier}** to the admin queue. Our moderation team will review the evidence screenshot and details shortly.\n\n${parsed.message}`;
    }

    const responsePayload = {
      ...parsed,
      reports: matchedReportsList.length > 0 ? matchedReportsList : undefined
    };

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('[Chatbot API] Error:', err);
    return new Response(JSON.stringify({
      message: 'An error occurred while processing your request. Please try again.',
      action: null,
      requiresReportField: null
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

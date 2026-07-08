import type { APIRoute } from 'astro';
import { getEnv } from '../../utils/env';
import { generateEmbedding, queryVectors } from '../../utils/vector';
import { createReport } from '../../utils/db';
import type { PendingReport } from './report';

// ── GET Handler: Meta Webhook Verification ──────────────────────────
export const GET: APIRoute = async ({ request }) => {
  try {
    const env = await getEnv();
    const url = new URL(request.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
      console.log('[WhatsApp Webhook] Verification successful!');
      return new Response(challenge, { status: 200 });
    }

    console.warn('[WhatsApp Webhook] Verification failed: token mismatch');
    return new Response('Forbidden', { status: 403 });
  } catch (err) {
    console.error('[WhatsApp Webhook] Error during verification:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
};

// ── Nara Router helper for model selection ──────────────────────────
const NARA_MODEL_PRIORITY = [
  'claude-sonnet-4.5',
  'claude-haiku-4.5',
  'mistral-large',
  'mistral-medium-3-5',
];
const unusableModels = new Set<string>();
const NARA_FALLBACK_MODELS = ['claude-sonnet-4.5', 'claude-haiku-4.5', 'mistral-large', 'mistral-medium-3-5'];
let naraModelCache: { models: string[]; fetchedAt: number } | null = null;
const NARA_CACHE_TTL_MS = 10 * 60 * 1000;

async function getNaraModels(apiKey: string): Promise<string[]> {
  if (naraModelCache && Date.now() - naraModelCache.fetchedAt < NARA_CACHE_TTL_MS) {
    return naraModelCache.models.filter(m => !unusableModels.has(m));
  }

  try {
    const res = await fetch('https://router.bynara.id/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (res.ok) {
      const data: any = await res.json();
      const available = (data.data || []).map((m: any) => m.id as string);
      const freeAvailable = available.filter((m: string) => !unusableModels.has(m));
      const prioritized = NARA_MODEL_PRIORITY.filter(m => freeAvailable.includes(m));
      const extras = freeAvailable.filter((m: string) => !NARA_MODEL_PRIORITY.includes(m)).sort();
      const sorted = [...prioritized, ...extras];

      naraModelCache = { models: sorted, fetchedAt: Date.now() };
      return sorted;
    }
  } catch (err) {
    console.error('[WhatsApp/Nara] Error fetching models:', err);
  }

  return NARA_FALLBACK_MODELS.filter(m => !unusableModels.has(m));
}

// Helper to download Meta media and upload to Cloudflare R2
async function downloadAndUploadMetaMediaToR2(mediaId: string, whatsappToken: string, bucket: any): Promise<string> {
  console.log(`[WhatsApp Media] Retrieving download URL for media ID: ${mediaId}`);
  const metadataRes = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
    headers: { 'Authorization': `Bearer ${whatsappToken}` }
  });

  if (!metadataRes.ok) {
    throw new Error(`Failed to retrieve media metadata: ${metadataRes.statusText}`);
  }

  const metadata: any = await metadataRes.json();
  const downloadUrl = metadata.url;
  if (!downloadUrl) {
    throw new Error('No media download URL found in Meta metadata response.');
  }

  console.log(`[WhatsApp Media] Downloading media file from: ${downloadUrl}`);
  const mediaFileRes = await fetch(downloadUrl, {
    headers: { 'Authorization': `Bearer ${whatsappToken}` }
  });

  if (!mediaFileRes.ok) {
    throw new Error(`Failed to download media file: ${mediaFileRes.statusText}`);
  }

  const mediaBuffer = await mediaFileRes.arrayBuffer();
  const contentType = metadata.mime_type || 'image/png';
  const extension = contentType.split('/')[1] || 'png';
  const fileKey = `evidence/${crypto.randomUUID()}.${extension}`;

  console.log(`[WhatsApp Media] Uploading file to R2: ${fileKey}`);
  await bucket.put(fileKey, mediaBuffer, {
    httpMetadata: { contentType }
  });

  return fileKey;
}

// Helper to send a reply back to WhatsApp
async function sendWhatsAppMessage(toPhone: string, textBody: string, whatsappToken: string, phoneId: string) {
  console.log(`[WhatsApp Outgoing] Sending message to ${toPhone}...`);
  const res = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${whatsappToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toPhone,
      type: 'text',
      text: {
        preview_url: false,
        body: textBody
      }
    })
  });

  if (!res.ok) {
    const errorDetails = await res.text();
    console.error(`[WhatsApp Outgoing] Failed to send message to ${toPhone}: ${res.status} - ${errorDetails}`);
  } else {
    console.log(`[WhatsApp Outgoing] Message sent successfully to ${toPhone}`);
  }
}

// Helper to send an image back to WhatsApp
async function sendWhatsAppImage(toPhone: string, imageUrl: string, whatsappToken: string, phoneId: string) {
  console.log(`[WhatsApp Outgoing] Sending image ${imageUrl} to ${toPhone}...`);
  const res = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${whatsappToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toPhone,
      type: 'image',
      image: {
        link: imageUrl
      }
    })
  });

  if (!res.ok) {
    const errorDetails = await res.text();
    console.error(`[WhatsApp Outgoing] Failed to send image to ${toPhone}: ${res.status} - ${errorDetails}`);
  } else {
    console.log(`[WhatsApp Outgoing] Image sent successfully to ${toPhone}`);
  }
}


// ── POST Handler: Handle Incoming Message from Meta ──────────────────
export const POST: APIRoute = async (context) => {
  const { request, locals } = context;

  try {
    const env = await getEnv();
    const db = env?.DB;
    const aiBinding = env?.AI;
    const vectorizeBinding = env?.VECTORIZE;
    const bucket = env?.EVIDENCE_BUCKET;

    if (!db) {
      console.error('[WhatsApp Webhook] Database binding DB not found!');
      return new Response('Database missing', { status: 500 });
    }

    const payload = await request.json();
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messageObj = value?.messages?.[0];
    const metadataObj = value?.metadata;

    if (!messageObj) {
      return new Response('OK', { status: 200 }); // Status update / non-message event
    }

    const userPhone = messageObj.from;
    const phoneId = metadataObj?.phone_number_id;

    console.log(`[WhatsApp Webhook] Incoming message from user: ${userPhone}, phoneId: ${phoneId}`);
    const tokenPreview = env.WHATSAPP_TOKEN ? `${env.WHATSAPP_TOKEN.substring(0, 15)}... (${env.WHATSAPP_TOKEN.length} chars)` : 'MISSING';
    console.log(`[WhatsApp Webhook] Using token: ${tokenPreview}`);

    if (!userPhone || !phoneId) {
      console.warn('[WhatsApp Webhook] Missing from phone number or phone_number_id.');
      return new Response('OK', { status: 200 });
    }

    // 1. Extract message text or media details
    const userText = messageObj.text?.body || '';
    const imageObj = messageObj.image;

    // 2. Fetch Conversation History from D1
    console.log(`[WhatsApp Webhook] Fetching history for phone: ${userPhone}`);
    const historyResult = await db
      .prepare(`SELECT role, content FROM whatsapp_chat_history WHERE phone = ? ORDER BY created_at ASC LIMIT 15`)
      .bind(userPhone)
      .all();
    const dbHistory = historyResult?.results || [];

    // Map history to match chatbot format
    const messages = dbHistory.map((h: any) => ({
      role: h.role,
      content: h.content
    }));

    // 3. Handle media upload (if user sent an image screenshot)
    let uploadedFileKey = '';
    let uploadedFileName = '';
    if (imageObj && imageObj.id && bucket && env.WHATSAPP_TOKEN) {
      try {
        uploadedFileName = `whatsapp-screenshot-${imageObj.id}.png`;
        uploadedFileKey = await downloadAndUploadMetaMediaToR2(imageObj.id, env.WHATSAPP_TOKEN, bucket);
        console.log(`[WhatsApp Media] Image uploaded successfully. R2 Key: ${uploadedFileKey}`);
      } catch (err) {
        console.error('[WhatsApp Media] Error processing media upload:', err);
      }
    }

    // Append new user message to the pipeline input
    messages.push({ role: 'user', content: userText });

    // 4. Intent Classification
    let classifiedIntent: 'SEARCH' | 'REPORT' | 'CHAT' = 'CHAT';
    let searchTarget = userText;
    let classificationSuccess = false;

    if (userText && aiBinding) {
      try {
        const classificationPrompt = `Classify the user's intent in this Bangladeshi online shopping scam assistant chat.
User message: "${userText}"

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
          classificationSuccess = true;
        } else if (responseObj && typeof responseObj === 'string') {
          // Fallback: parse JSON from string response
          const jsonMatch = responseObj.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            classifiedIntent = parsed.intent || 'CHAT';
            if (classifiedIntent === 'SEARCH' && parsed.extractedTarget) {
              searchTarget = parsed.extractedTarget;
            }
            classificationSuccess = true;
          }
        }
        console.log(`[WhatsApp Webhook] Workers AI Classified intent: ${classifiedIntent}, Target: "${searchTarget}"`);
      } catch (err) {
        console.warn('[WhatsApp Webhook] Workers AI classification error, attempting Gemini Fallback:', err);
      }
    }

    // Gemini Fallback if Workers AI failed or did not resolve correctly
    if (!classificationSuccess && env.GEMINI_API_KEY && userText) {
      try {
        console.log('[WhatsApp Webhook] Classifying intent via Gemini...');
        const classificationPrompt = `Classify the user's intent in this Bangladeshi online shopping scam assistant chat.
User message: "${userText}"

Intent options:
- "SEARCH": The user wants to search/lookup/check a page name, link, phone number, website, or shop for scams (e.g., "is FakeShop BD a scam?", "check this number 01712345678", "facebook.com/shop").
- "REPORT": The user explicitly wants to report a scam, submit a scam story, or start the reporting process (e.g., "I want to report a scam", "help me submit a scam report").
- "CHAT": Greetings, general questions, comments, or chit-chat (e.g., "hello", "hi", "how does this work?").

Respond STRICTLY with a JSON object in this format:
{
  "intent": "SEARCH" | "REPORT" | "CHAT",
  "extractedTarget": "string or null" (only extract the clean shop name, phone number, website, or URL if the intent is SEARCH)
}`;
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: classificationPrompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        });

        if (geminiRes.ok) {
          const data: any = await geminiRes.json();
          const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            classifiedIntent = parsed.intent || 'CHAT';
            if (classifiedIntent === 'SEARCH' && parsed.extractedTarget) {
              searchTarget = parsed.extractedTarget;
            }
            classificationSuccess = true;
            console.log(`[WhatsApp Webhook] Gemini Fallback Classified intent: ${classifiedIntent}, Target: "${searchTarget}"`);
          }
        }
      } catch (gemErr) {
        console.error('[WhatsApp Webhook] Gemini intent classification fallback error:', gemErr);
      }
    }

    // Last-resort regex heuristics if both AIs failed or classified as CHAT but looks like a search query
    if (userText && (!classificationSuccess || classifiedIntent === 'CHAT')) {
      const cleanMessage = userText.trim().toLowerCase();
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
        // Clean up search query for target (remove leading question patterns like "is there any scam related to", "check")
        let cleanedTarget = userText.replace(/^(is there any|scam related to|check|lookup|search for|about)\s+/gi, '');
        cleanedTarget = cleanedTarget.replace(/\?+$/, '').trim();
        searchTarget = cleanedTarget || userText;
        console.log(`[WhatsApp Webhook] Regex Fallback Classified intent: SEARCH, Target: "${searchTarget}"`);
      }
    }

    // 5. RAG Database search context (Hybrid Direct SQL + Semantic Vector search)
    let ragContext = 'No relevant database records found for this query.';
    let matchedReportsList: any[] = [];
    const shouldSearchRAG = (classifiedIntent === 'SEARCH') && searchTarget.length > 0;
    console.log(`[WhatsApp Webhook] shouldSearchRAG: ${shouldSearchRAG}, aiBinding: ${!!aiBinding}, vectorizeBinding: ${!!vectorizeBinding}`);

    if (userText && shouldSearchRAG) {
      try {
        const reportsMap = new Map<string, any>();

        // 5a. Direct SQL Search (high priority for exact/partial text matches)
        if (db) {
          console.log(`[WhatsApp Webhook] Hybrid Search - SQL text matching for "${searchTarget}"...`);
          
          // Check for exact/partial identifier match first
          const sqlResult = await db
            .prepare(`SELECT * FROM reports WHERE (entity_identifier LIKE ?1 OR entity_identifier LIKE ?2) AND status = 'APPROVED' LIMIT 5`)
            .bind(`%${searchTarget}%`, `%${searchTarget.toLowerCase()}%`)
            .all();
          
          if (sqlResult && sqlResult.results && sqlResult.results.length > 0) {
            console.log(`[WhatsApp Webhook] Hybrid Search - Direct SQL matched ${sqlResult.results.length} record(s).`);
            sqlResult.results.forEach((r: any) => {
              reportsMap.set(r.id, r);
            });
          }
        }

        // 5b. Vector Search (semantic fallback if we have space or need broader matches)
        if (aiBinding && vectorizeBinding && reportsMap.size < 3) {
          console.log(`[WhatsApp Webhook] Hybrid Search - Semantic Vector search for "${searchTarget}"...`);
          const queryVector = await generateEmbedding(searchTarget, aiBinding);
          if (queryVector && queryVector.length > 0) {
            const matches = await queryVectors(vectorizeBinding, queryVector, 6);
            console.log(`[WhatsApp Webhook] Raw Vectorize matches:`, JSON.stringify(matches.map(m => ({ id: m.id, score: m.score }))));
            const matchedIds = matches.filter(m => m.score > 0.5).map(m => m.id);

            if (matchedIds.length > 0 && db) {
              const placeholders = matchedIds.map(() => '?').join(',');
              const reportsResult = await db
                .prepare(`SELECT * FROM reports WHERE id IN (${placeholders}) AND status = 'APPROVED'`)
                .bind(...matchedIds)
                .all();

              if (reportsResult && reportsResult.results && reportsResult.results.length > 0) {
                reportsResult.results.forEach((r: any) => {
                  if (!reportsMap.has(r.id)) {
                    reportsMap.set(r.id, r);
                  }
                });
              }
            }
          }
        }

        // Compile combined map results
        const combinedResults = Array.from(reportsMap.values());
        if (combinedResults.length > 0) {
          matchedReportsList = combinedResults.map((r: any) => ({
            id: r.id,
            entityIdentifier: r.entity_identifier,
            entityType: r.entity_type,
            incidentDate: r.incident_date,
            amountLost: r.amount_lost || undefined,
            complaintText: r.complaint_text,
            evidenceR2Key: r.evidence_r2_key || undefined
          }));

          ragContext = combinedResults.map((r: any) => {
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

      } catch (searchErr) {
        console.error('[WhatsApp Webhook] Hybrid search error:', searchErr);
      }
    }



    // 6. Chatbot Instructions
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

    let userPrompt = userText;
    if (uploadedFileKey) {
      userPrompt += `\n\n[System Metadata: User has successfully uploaded evidence file "${uploadedFileName}" with R2 key: "${uploadedFileKey}"]`;
    }

    // 7. Trigger LLM
    let chatResponseText = '';
    const groqKeys = [
      env.GROQ_API_KEY_CHAT_1,
      env.GROQ_API_KEY_CHAT_2,
      env.GROQ_API_KEY
    ].filter(Boolean);

    // 7.1 Try Groq
    if (!chatResponseText) {
      for (let i = 0; i < groqKeys.length; i++) {
        try {
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
                ...messages,
                ...(uploadedFileKey ? [{ role: 'user', content: `I have uploaded the screenshot evidence file. R2 key: "${uploadedFileKey}"` }] : [])
              ],
              response_format: { type: 'json_object' }
            })
          });

          if (res.ok) {
            const data: any = await res.ok ? await res.json() : {};
            chatResponseText = data.choices?.[0]?.message?.content || '';
            break;
          }
        } catch (err) {
          console.error(`[WhatsApp Webhook] Groq key ${i+1} error:`, err);
        }
      }
    }

    // 7.2 Try Gemini Fallback
    if (!chatResponseText && env.GEMINI_API_KEY) {
      try {
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
            generationConfig: { responseMimeType: 'application/json' }
          })
        });

        if (res.ok) {
          const data: any = await res.json();
          chatResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }
      } catch (gemErr) {
        console.error('[WhatsApp Webhook] Gemini Fallback error:', gemErr);
      }
    }

    // 7.3 Try Nara Router Fallback
    if (!chatResponseText && env.NARA_API_KEY) {
      const naraModels = await getNaraModels(env.NARA_API_KEY);
      for (const model of naraModels) {
        try {
          const isAnthropic = model.startsWith('claude-');
          const requestBody: any = {
            model,
            messages: isAnthropic
              ? [
                  ...messages,
                  ...(uploadedFileKey ? [{ role: 'user', content: `I have uploaded the screenshot evidence file. R2 key: "${uploadedFileKey}"` }] : [])
                ]
              : [
                  { role: 'system', content: systemPrompt },
                  ...messages,
                  ...(uploadedFileKey ? [{ role: 'user', content: `I have uploaded the screenshot evidence file. R2 key: "${uploadedFileKey}"` }] : [])
                ]
          };

          if (!isAnthropic) {
            requestBody.response_format = { type: 'json_object' };
          } else {
            requestBody.system = systemPrompt;
          }

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
            if (chatResponseText) break;
          }
        } catch (naraErr) {
          console.error(`[WhatsApp Webhook] Nara Router model ${model} error:`, naraErr);
        }
      }
    }

    if (!chatResponseText) {
      throw new Error('All AI chat engines failed.');
    }

    const parsed = JSON.parse(chatResponseText);
    let replyText = parsed.message || 'I received your message!';

    // 8. Handle Auto-Report Submission action
    if (parsed.action === 'SUBMIT_REPORT' && parsed.reportData) {
      const data = parsed.reportData;
      
      let finalR2Key = uploadedFileKey;
      let finalFileName = uploadedFileName;

      // Scan history for R2 key if missing
      if (!finalR2Key && Array.isArray(messages)) {
        for (const msg of messages) {
          if (msg.content && typeof msg.content === 'string') {
            const keyMatch = msg.content.match(/R2 key:\s*"([^"]+)"/);
            const fileMatch = msg.content.match(/evidence file\s*"([^"]+)"/);
            if (keyMatch) finalR2Key = keyMatch[1];
            if (fileMatch) finalFileName = fileMatch[1];
          }
        }
      }

      const complaintBody = JSON.stringify({
        scraped: false,
        posterName: 'WhatsApp User',
        postText: data.complaintText || '',
        images: finalR2Key ? [finalR2Key] : [],
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
        evidenceFileName: finalFileName || 'whatsapp-upload.png',
        evidenceR2Key: finalR2Key || undefined,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      };

      await createReport(report, null, locals);
      console.log(`[WhatsApp Webhook] Automatically submitted report: ${report.id}`);
      replyText = `✅ *Report Submitted Successfully!*\n\nI have submitted the scam report for *${data.entityIdentifier}* to the admin queue. Our moderation team will review the evidence screenshot and details shortly.\n\n${replyText}`;
    }

    // 8b. Append matched records block to replyText for WhatsApp rich formatting
    if (matchedReportsList.length > 0 && classifiedIntent === 'SEARCH') {
      const displayReports = matchedReportsList.slice(0, 3);
      let recordsBlock = `\n\n🔍 *MATCHED DATABASE RECORDS (${displayReports.length} shown of ${matchedReportsList.length})*\n`;
      
      displayReports.forEach((r: any, idx: number) => {
        let complaintText = r.complaintText;
        try {
          const parsedText = JSON.parse(r.complaintText);
          complaintText = parsedText.postText || r.complaintText;
        } catch {}

        if (complaintText && complaintText.length > 100) {
          complaintText = complaintText.substring(0, 100) + '...';
        }

        recordsBlock += `\n*Report #${idx + 1}*`;
        recordsBlock += `\n• *Target:* ${r.entityIdentifier}`;
        recordsBlock += `\n• *Type:* ${r.entityType}`;
        recordsBlock += `\n• *Date:* ${r.incidentDate}`;
        if (r.amountLost) {
          recordsBlock += `\n• *Amount:* ${r.amountLost} BDT`;
        }
        recordsBlock += `\n• *Details:* ${complaintText}`;
        recordsBlock += `\n`;
      });

      // Add prominent direct link to website search page
      recordsBlock += `\n👉 *View full details, safety scan, & screenshots on our website:*\nhttps://scamshield.hrittik0chatterjee.workers.dev/search?q=${encodeURIComponent(searchTarget)}`;
      replyText += recordsBlock;
    }

    // 9. Save conversation history exchange to D1
    const now = new Date().toISOString();
    
    // Save user message
    await db
      .prepare(`INSERT INTO whatsapp_chat_history (phone, role, content, created_at) VALUES (?, ?, ?, ?)`)
      .bind(userPhone, 'user', userText || `[Image Sent: R2 Key ${uploadedFileKey}]`, now)
      .run();

    // Save assistant message
    await db
      .prepare(`INSERT INTO whatsapp_chat_history (phone, role, content, created_at) VALUES (?, ?, ?, ?)`)
      .bind(userPhone, 'assistant', replyText, now)
      .run();

    // 10. Send reply back to Meta API
    if (env.WHATSAPP_TOKEN) {
      await sendWhatsAppMessage(userPhone, replyText, env.WHATSAPP_TOKEN, phoneId);
    } else {
      console.warn('[WhatsApp Webhook] WHATSAPP_TOKEN not found, unable to send reply message.');
    }

    return new Response('OK', { status: 200 });

  } catch (err) {
    console.error('[WhatsApp Webhook POST] Error processing webhook event:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
};

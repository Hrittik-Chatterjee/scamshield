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

    if (lastUserMessage && aiBinding && vectorizeBinding) {
      try {
        console.log(`[RAG] Generating embedding for query: "${lastUserMessage}"`);
        const queryVector = await generateEmbedding(lastUserMessage, aiBinding);
        if (queryVector && queryVector.length > 0) {
          const matches = await queryVectors(vectorizeBinding, queryVector, 6);
          console.log(`[RAG] Raw Vectorize matches for query "${lastUserMessage}":`, matches);
          
          const matchedIds = matches.filter(m => m.score > 0.3).map(m => m.id);
          
          if (matchedIds.length > 0 && db) {
            console.log(`[RAG] Matches above threshold (0.3):`, matchedIds);
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

    // ── 4. Trigger Dual-Groq / Gemini Fallback Engine ──
    const groqKeys = [
      env.GROQ_API_KEY_CHAT_1,
      env.GROQ_API_KEY_CHAT_2,
      env.GROQ_API_KEY // Backward compatibility
    ].filter(Boolean);

    let chatResponseText = '';
    let apiUsed = 'None';

    // 4.1 Try Groq Keys
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

    // 4.2 Try Gemini Fallback
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

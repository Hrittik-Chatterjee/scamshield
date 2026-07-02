// src/pages/api/admin/index-vectors.ts
import type { APIRoute } from 'astro';
import { getEnv } from '../../../utils/env';
import { generateEmbedding, upsertVector } from '../../../utils/vector';

export const GET: APIRoute = async (context) => {
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
    const vectorizeBinding = env?.VECTORIZE;

    if (!db || !aiBinding || !vectorizeBinding) {
      return new Response(JSON.stringify({ error: 'Database or AI bindings missing.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Fetch all approved reports ──
    const approvedReports = await db.prepare("SELECT * FROM reports WHERE status = 'APPROVED'").all();
    const reports = approvedReports.results || [];
    // ── 3. Index approved reports in small batches of 5 concurrently ──
    const batchSize = 5;
    let successCount = 0;
    const failedReports: { id: string; error: string }[] = [];

    for (let i = 0; i < reports.length; i += batchSize) {
      const batch = reports.slice(i, i + batchSize);
      const batchPromises = batch.map(async (r) => {
        try {
          let textToEmbed = r.complaint_text || '';
          try {
            const parsed = JSON.parse(r.complaint_text);
            textToEmbed = parsed.postText || r.complaint_text;
          } catch {}

          // Slice to 800 chars to avoid token limits
          const embeddingText = `Identifier: ${r.entity_identifier}\nComplaint: ${textToEmbed}`.slice(0, 800);
          const embedding = await generateEmbedding(embeddingText, aiBinding);
          
          if (embedding && embedding.length > 0) {
            const ok = await upsertVector(vectorizeBinding, r.id, embedding, {
              identifier: r.entity_identifier,
              type: r.entity_type
            });
            if (ok) return { success: true, id: r.id };
          }
          return { success: false, id: r.id, error: 'Empty embedding or Vectorize upsert failed' };
        } catch (err: any) {
          console.error(`[IndexVectors] Failed to index report ${r.id}:`, err);
          return { success: false, id: r.id, error: err.message || String(err) };
        }
      });

      const results = await Promise.all(batchPromises);
      for (const res of results) {
        if (res.success) {
          successCount++;
        } else {
          failedReports.push({ id: res.id, error: res.error || 'Unknown error' });
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      message: `Indexed approved reports in batched parallel.`,
      totalApproved: reports.length,
      successCount,
      failCount: failedReports.length,
      failedReports
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[IndexVectors] Error:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error', message: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

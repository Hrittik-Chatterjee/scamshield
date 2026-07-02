// src/pages/api/chat/upload.ts
import type { APIRoute } from 'astro';
import { getEnv } from '../../../utils/env';

export const POST: APIRoute = async (context) => {
  const { request } = context;
  try {
    const env = await getEnv();
    const bucket = env?.EVIDENCE_BUCKET;
    const form = await request.formData();
    const file = form.get('file') as File | null;

    if (!file || file.size === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'No file uploaded.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── 1. Security Check: File Size Limit (5MB) ──
    if (file.size > 5 * 1024 * 1024) {
      return new Response(JSON.stringify({ ok: false, error: 'File size exceeds the 5MB limit.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Security Check: File Type Whitelist ──
    const whitelistedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!whitelistedTypes.includes(file.type)) {
      return new Response(JSON.stringify({ ok: false, error: 'Only JPEG, PNG, and WEBP image uploads are allowed.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const fileExtension = file.type.split('/')[1] || 'jpg';
    const key = `evidence/chat-${crypto.randomUUID()}.${fileExtension}`;

    if (bucket) {
      // ── Upload to Cloudflare R2 ──
      const arrayBuffer = await file.arrayBuffer();
      await bucket.put(key, arrayBuffer, {
        httpMetadata: { contentType: file.type }
      });
    } else {
      console.warn('[Chat Upload] No R2 bucket found, using mock path in local dev.');
    }

    return new Response(JSON.stringify({
      ok: true,
      key: key,
      filename: file.name,
      contentType: file.type,
      size: file.size
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('[Chat Upload] Upload error:', err);
    return new Response(JSON.stringify({ ok: false, error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

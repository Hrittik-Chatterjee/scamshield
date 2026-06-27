import type { APIRoute } from 'astro';
import { getEnv } from '../../utils/env';

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    if (!key) {
      return new Response(JSON.stringify({ error: 'Missing key parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const env = await getEnv();
    const bucket = env?.EVIDENCE_BUCKET;

    if (!bucket) {
      return new Response(JSON.stringify({ error: 'R2 bucket binding not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const object = await bucket.get(key);
    if (!object) {
      return new Response(JSON.stringify({ error: 'Evidence file not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000');

    return new Response(object.body, {
      headers,
    });
  } catch (err) {
    console.error('[api/evidence] Fetch error:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

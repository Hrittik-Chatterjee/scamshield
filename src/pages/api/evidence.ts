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
      if (key.startsWith('r2-key-')) {
        let placeholder = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=60';
        if (key.includes('receipt') || key.includes('slip')) {
          placeholder = 'https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?w=600&auto=format&fit=crop&q=60';
        } else if (key.includes('brick') || key.includes('box') || key.includes('watch') || key.includes('sandal')) {
          placeholder = 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=600&auto=format&fit=crop&q=60';
        } else if (key.includes('chat') || key.includes('disappeared') || key.includes('address')) {
          placeholder = 'https://images.unsplash.com/photo-1611606698335-84d4737c36d5?w=600&auto=format&fit=crop&q=60';
        }
        return Response.redirect(placeholder, 302);
      }
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

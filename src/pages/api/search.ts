// src/pages/api/search.ts
import type { APIRoute } from 'astro';
import { getEntity } from '../../utils/db';

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
    const searchResult = await getEntity(query, mode, locals);
    return new Response(JSON.stringify(searchResult), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/search] Error processing search:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

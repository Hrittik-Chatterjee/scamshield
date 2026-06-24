// src/pages/api/admin/queue.ts
// Returns pending reports for the admin dashboard. Protected by ADMIN_SECRET_KEY.
import type { APIRoute } from 'astro';
import { getPendingQueue } from '../../../utils/db';

const ADMIN_KEY = import.meta.env.ADMIN_SECRET_KEY ?? 'dev-admin-key-change-in-production';

export const GET: APIRoute = async (context) => {
  const { request, locals } = context;
  // Auth check — accept key via Authorization header or ?key= param
  const url    = new URL(request.url);
  const header = request.headers.get('Authorization')?.replace('Bearer ', '');
  const param  = url.searchParams.get('key');
  const provided = header ?? param ?? '';

  if (provided !== ADMIN_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const status = (url.searchParams.get('status') ?? 'PENDING') as 'PENDING' | 'APPROVED' | 'REJECTED';
  try {
    const queueData = await getPendingQueue(status, locals);
    return new Response(JSON.stringify({ ok: true, reports: queueData.reports, total: queueData.total }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/admin/queue] Queue fetch error:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

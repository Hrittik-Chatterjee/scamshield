// src/pages/api/admin/queue.ts
// Returns pending reports for the admin dashboard. Protected by ADMIN_SECRET_KEY.
import type { APIRoute } from 'astro';
import { PENDING_REPORTS } from '../report';

const ADMIN_KEY = import.meta.env.ADMIN_SECRET_KEY ?? 'dev-admin-key-change-in-production';

export const GET: APIRoute = async ({ request }) => {
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

  const status = url.searchParams.get('status') ?? 'PENDING';
  const reports = PENDING_REPORTS.filter(r => r.status === status);

  return new Response(JSON.stringify({ ok: true, reports, total: reports.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

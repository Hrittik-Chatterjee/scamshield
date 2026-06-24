// src/pages/api/admin/review.ts
// Approve or reject a pending report. Protected by ADMIN_SECRET_KEY.
import type { APIRoute } from 'astro';
import { PENDING_REPORTS } from '../report';

const ADMIN_KEY = import.meta.env.ADMIN_SECRET_KEY ?? 'dev-admin-key-change-in-production';

export const POST: APIRoute = async ({ request }) => {
  const header   = request.headers.get('Authorization')?.replace('Bearer ', '');
  const body     = await request.json() as { key?: string; reportId: string; action: 'approve' | 'reject' };
  const provided = header ?? body.key ?? '';

  if (provided !== ADMIN_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { reportId, action } = body;
  if (!reportId || !['approve', 'reject'].includes(action)) {
    return new Response(JSON.stringify({ error: 'reportId and action (approve|reject) are required' }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const idx = PENDING_REPORTS.findIndex(r => r.id === reportId);
  if (idx === -1) {
    return new Response(JSON.stringify({ error: 'Report not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  PENDING_REPORTS[idx].status = action === 'approve' ? 'APPROVED' : 'REJECTED';

  return new Response(JSON.stringify({ ok: true, reportId, newStatus: PENDING_REPORTS[idx].status }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

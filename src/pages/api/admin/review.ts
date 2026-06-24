// src/pages/api/admin/review.ts
// Approve or reject a pending report. Protected by ADMIN_SECRET_KEY.
import type { APIRoute } from 'astro';
import { updateReportStatus } from '../../../utils/db';

const ADMIN_KEY = import.meta.env.ADMIN_SECRET_KEY ?? 'dev-admin-key-change-in-production';

export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  
  let body: { key?: string; reportId: string; action: 'approve' | 'reject' };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const header   = request.headers.get('Authorization')?.replace('Bearer ', '');
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

  try {
    await updateReportStatus(reportId, action, locals);
    return new Response(JSON.stringify({ ok: true, reportId, newStatus: action === 'approve' ? 'APPROVED' : 'REJECTED' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/admin/review] Review action error:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

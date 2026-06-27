// src/pages/api/report.ts
// Accepts fraud report submissions. Uses unified db utility for D1 / local fallback.
import type { APIRoute } from 'astro';
import { createReport } from '../../utils/db';

// Pure JS base64 encoder for workerd compatibility
function uint8ArrayToBase64(arr: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const len = arr.length;
  for (let i = 0; i < len; i += 3) {
    const chunk = (arr[i] << 16) | 
                  ((i + 1 < len ? arr[i + 1] : 0) << 8) | 
                  (i + 2 < len ? arr[i + 2] : 0);
    const c0 = (chunk >> 18) & 63;
    const c1 = (chunk >> 12) & 63;
    const c2 = (chunk >> 6) & 63;
    const c3 = chunk & 63;
    result += chars[c0] + chars[c1] +
              (i + 1 < len ? chars[c2] : '=') +
              (i + 2 < len ? chars[c3] : '=');
  }
  return result;
}

export interface PendingReport {
  id: string;
  reporterType: 'BUYER' | 'SELLER';
  entityIdentifier: string;   // shop name / page / phone being reported
  entityType: string;         // 'Shop', 'Facebook Page', 'bKash Number', 'Buyer Number'
  incidentDate: string;
  amountLost?: number;
  complaintText: string;
  evidenceFileName: string;   // original filename
  evidenceDataUrl?: string;   // base64 preview (dev only)
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  source?: 'CROWDSOURCED' | 'SCRAPED';
}

// ── Handler ────────────────────────────────────────────────────────────
export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  try {
    const form = await request.formData();

    const reporterType = form.get('reporterType') as 'BUYER' | 'SELLER';
    const entityIdentifier = form.get('entityIdentifier') as string;
    const entityType       = form.get('entityType') as string;
    const incidentDate     = form.get('incidentDate') as string;
    const amountLost       = parseFloat(form.get('amountLost') as string) || undefined;
    const complaintText    = form.get('complaintText') as string;
    const evidenceFile     = form.get('evidence') as File | null;

    // ── Validation ─────────────────────────────────────────────────────
    const errors: string[] = [];
    if (!reporterType)      errors.push('Reporter type is required');
    if (!entityIdentifier?.trim()) errors.push('Entity identifier is required');
    if (!incidentDate)      errors.push('Incident date is required');
    if (!complaintText?.trim() || complaintText.trim().length < 20)
      errors.push('Complaint description must be at least 20 characters');
    if (!evidenceFile || evidenceFile.size === 0)
      errors.push('Evidence screenshot is required');
    if (evidenceFile && evidenceFile.size > 5 * 1024 * 1024)
      errors.push('Evidence file must be under 5MB');

    if (errors.length > 0) {
      return new Response(JSON.stringify({ ok: false, errors }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Read file as base64 for local dev preview ──────────────────
    let evidenceDataUrl: string | undefined;
    const db = locals?.runtime?.env?.DB;
    if (!db && evidenceFile) {
      // Only generate base64 preview if we are NOT on Cloudflare (dev fallback)
      const buffer = await evidenceFile.arrayBuffer();
      const base64 = uint8ArrayToBase64(new Uint8Array(buffer));
      evidenceDataUrl = `data:${evidenceFile.type};base64,${base64}`;
    }

    // ── Create report object ───────────────────────────────────────────
    const report: PendingReport = {
      id: crypto.randomUUID(),
      reporterType,
      entityIdentifier: entityIdentifier.trim(),
      entityType: entityType || 'Unknown',
      incidentDate,
      amountLost,
      complaintText: complaintText.trim(),
      evidenceFileName: evidenceFile?.name ?? 'unknown',
      evidenceDataUrl,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    await createReport(report, evidenceFile, locals);

    return new Response(JSON.stringify({ ok: true, referenceId: report.id.slice(0, 8).toUpperCase() }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/report]', err);
    return new Response(JSON.stringify({ ok: false, errors: ['Server error. Please try again.'] }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

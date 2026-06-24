// src/pages/api/report.ts
// Accepts fraud report submissions. In Phase 3 uses in-memory store (mock).
// Phase 3+ will replace with real D1 inserts + R2 uploads.
import type { APIRoute } from 'astro';

// Pure JS base64 encoder for workerd compatibility (no node:buffer needed)
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

// ── In-memory pending store (replaced by D1 in production) ─────────────
// Exported so admin queue endpoint can read it in the same process.
export const PENDING_REPORTS: PendingReport[] = [];

export interface PendingReport {
  id: string;
  reporterType: 'BUYER' | 'SELLER';
  // Seller-reported fields
  entityIdentifier: string;   // shop name / page / phone being reported
  entityType: string;         // 'Shop', 'Facebook Page', 'bKash Number', 'Buyer Number'
  // Common fields
  incidentDate: string;
  amountLost?: number;
  complaintText: string;
  evidenceFileName: string;   // original filename (R2 key in production)
  evidenceDataUrl?: string;   // base64 preview (dev only — not stored in prod)
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

// ── Handler ────────────────────────────────────────────────────────────
export const POST: APIRoute = async ({ request }) => {
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

    // ── In dev: read file as base64 for admin preview ──────────────────
    let evidenceDataUrl: string | undefined;
    if (evidenceFile) {
      const buffer = await evidenceFile.arrayBuffer();
      const base64 = uint8ArrayToBase64(new Uint8Array(buffer));
      evidenceDataUrl = `data:${evidenceFile.type};base64,${base64}`;
    }

    // ── Store report ───────────────────────────────────────────────────
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

    PENDING_REPORTS.unshift(report); // newest first

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

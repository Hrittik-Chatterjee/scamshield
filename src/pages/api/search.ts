// src/pages/api/search.ts
// Phase 2: Mock search endpoint — will be replaced with real D1 queries in Phase 3
import type { APIRoute } from 'astro';

// ── Mock database (replace with D1 queries later) ──────────────────────────
const MOCK_DB = [
  {
    id: '1',
    identifiers: ['01712345678', '01712 345678'],
    name: '01712345678',
    type: 'bKash Number',
    risk: 'confirmed',
    complaintCount: 14,
    reports: [
      { id: 'r1', date: '2026-06-20', summary: 'Took ৳3,500 for a jacket. Never delivered. Phone now switched off.', source: 'community' },
      { id: 'r2', date: '2026-06-18', summary: 'Ordered shoes worth ৳2,200. Got a package with bricks inside.', source: 'crowdsourced' },
      { id: 'r3', date: '2026-06-15', summary: 'Paid ৳1,800 advance for a mobile phone. Scammer blocked after payment.', source: 'community' },
    ],
    aiFlags: [],
    firstSeen: '2026-05-01',
  },
  {
    id: '2',
    identifiers: ['trendyclosetbd', 'trendy closet bd', 'trendy closet bangladesh'],
    name: 'TrendyClosetBD',
    type: 'Facebook Shop',
    risk: 'high',
    complaintCount: 7,
    reports: [
      { id: 'r4', date: '2026-06-21', summary: 'Sent ৳4,500 for saree. Product arrived but quality was completely different from photos.', source: 'crowdsourced' },
      { id: 'r5', date: '2026-06-19', summary: 'No cash-on-delivery option. Refused refund after wrong item delivered.', source: 'community' },
    ],
    aiFlags: ['advance_payment_only', 'young_website'],
    firstSeen: '2026-06-01',
  },
  {
    id: '3',
    identifiers: ['gadgetkingbd', 'gadget king bd'],
    name: 'GadgetKingBD',
    type: 'Online Store',
    risk: 'confirmed',
    complaintCount: 22,
    reports: [
      { id: 'r6', date: '2026-06-22', summary: 'Phone ordered for ৳15,000. Received a box of sand with a cheap cover on top.', source: 'crowdsourced' },
      { id: 'r7', date: '2026-06-20', summary: 'Fake iPhone 15 delivered instead of genuine. Shop has disappeared from Facebook.', source: 'community' },
    ],
    aiFlags: ['fake_reviews', 'advance_payment_only'],
    firstSeen: '2026-03-15',
  },
  {
    id: '4',
    identifiers: ['01987654321'],
    name: '01987654321',
    type: 'Buyer Number',
    risk: 'high',
    mode: 'seller',
    complaintCount: 5,
    reports: [
      { id: 'r8', date: '2026-06-21', summary: 'Placed COD order, refused delivery 3 times. Courier fee lost.', source: 'crowdsourced' },
      { id: 'r9', date: '2026-06-10', summary: 'Same number placed order with our group. Gave false address, never answerable.', source: 'crowdsourced' },
    ],
    aiFlags: [],
    firstSeen: '2026-05-20',
  },
];

const AI_FLAG_LABELS: Record<string, { icon: string; label: string; desc: string }> = {
  advance_payment_only: { icon: '🚩', label: 'Advance Payment Only', desc: 'No cash-on-delivery option offered — a primary fraud indicator in BD market.' },
  young_website:        { icon: '🚩', label: 'Very New Website', desc: 'Associated website registered under 90 days ago — scam shops are disposable.' },
  fake_reviews:         { icon: '🚩', label: 'Suspicious Reviews', desc: 'Abnormal spike in 5-star reviews in a short window — pattern consistent with fabricated social proof.' },
};

const RISK_LABELS: Record<string, string> = {
  confirmed: 'CONFIRMED SCAM',
  high:      'HIGH RISK',
  caution:   'CAUTION',
  safe:      'SAFE',
};

// ── Normalize query for matching ──────────────────────────────────────────
function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-().]/g, '');
}

// ── Handler ───────────────────────────────────────────────────────────────
export const GET: APIRoute = async ({ url }) => {
  const query = url.searchParams.get('q')?.trim() ?? '';
  const mode  = url.searchParams.get('mode') === 'seller' ? 'seller' : 'buyer';

  if (!query) {
    return new Response(JSON.stringify({ error: 'Query is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await new Promise(r => setTimeout(r, 150)); // simulate DB latency

  const nq = normalize(query);
  const match = MOCK_DB.find(entity => {
    const modeMatch = mode === 'seller' ? entity.mode === 'seller' : entity.mode !== 'seller';
    const textMatch = entity.identifiers.some(id => normalize(id).includes(nq) || nq.includes(normalize(id)));
    return modeMatch && textMatch;
  });

  if (match) {
    return new Response(JSON.stringify({
      found: true,
      entity: {
        ...match,
        riskLabel: RISK_LABELS[match.risk] ?? match.risk,
        aiFlags: match.aiFlags.map(f => AI_FLAG_LABELS[f]).filter(Boolean),
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Not found — return AI scan placeholder (Phase 4 will do real scan)
  return new Response(JSON.stringify({
    found: false,
    query,
    mode,
    aiScan: {
      status: 'no_record',
      message: 'No community complaints found for this entity in our database.',
      checkedAt: new Date().toISOString(),
    },
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

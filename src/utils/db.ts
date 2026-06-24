// src/utils/db.ts
import type { PendingReport } from '../pages/api/report';
import { getEnv } from './env';

export interface Entity {
  id: string;
  type: string;
  identifier: string;
  normalized: string;
  risk: 'confirmed' | 'high' | 'caution' | 'safe' | 'unknown';
  complaintCount: number;
  firstSeen: string;
  updatedAt: string;
  mode?: 'buyer' | 'seller';
}

export interface DatabaseReport {
  id: string;
  entityId?: string;
  reporterType: 'BUYER' | 'SELLER';
  complaintText: string;
  incidentDate: string;
  amountLost?: number;
  evidenceFileName: string;
  evidenceDataUrl?: string; // base64 preview (dev only)
  evidenceR2Key?: string;   // R2 key (production)
  source: 'CROWDSOURCED' | 'SCRAPED';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  reviewedAt?: string;
}

export interface AICacheEntry {
  entityId: string; // normalized identifier
  whoisAgeDays?: number;
  safeBrowsingOk: number; // 1 = safe, 0 = flagged
  urlscanVerdict?: string;
  webSearchSummary?: string;
  flagsJson: string; // JSON array string
  riskVerdict: 'safe' | 'caution' | 'high' | 'confirmed';
  analyzedAt: string;
}

// ── Initial Mock Entities (from Phase 2) ──────────────────────────
const INITIAL_MOCK_ENTITIES: Entity[] = [
  {
    id: '1',
    identifier: '01712345678',
    normalized: '01712345678',
    type: 'bKash Number',
    risk: 'confirmed',
    complaintCount: 14,
    firstSeen: '2026-05-01',
    updatedAt: '2026-06-20',
  },
  {
    id: '2',
    identifier: 'TrendyClosetBD',
    normalized: 'trendyclosetbd',
    type: 'Facebook Shop',
    risk: 'high',
    complaintCount: 7,
    firstSeen: '2026-06-01',
    updatedAt: '2026-06-21',
  },
  {
    id: '3',
    identifier: 'GadgetKingBD',
    normalized: 'gadgetkingbd',
    type: 'Online Store',
    risk: 'confirmed',
    complaintCount: 22,
    firstSeen: '2026-03-15',
    updatedAt: '2026-06-22',
  },
  {
    id: '4',
    identifier: '01987654321',
    normalized: '01987654321',
    type: 'Buyer Number',
    risk: 'high',
    mode: 'seller',
    complaintCount: 5,
    firstSeen: '2026-05-20',
    updatedAt: '2026-06-21',
  },
];

const INITIAL_MOCK_REPORTS: DatabaseReport[] = [
  {
    id: 'r1',
    entityId: '1',
    reporterType: 'BUYER',
    complaintText: 'Took ৳3,500 for a jacket. Never delivered. Phone now switched off.',
    incidentDate: '2026-06-20',
    amountLost: 3500,
    evidenceFileName: 'chat_screenshot.png',
    source: 'CROWDSOURCED',
    status: 'APPROVED',
    createdAt: '2026-06-20T10:00:00Z',
  },
  {
    id: 'r2',
    entityId: '1',
    reporterType: 'BUYER',
    complaintText: 'Ordered shoes worth ৳2,200. Got a package with bricks inside.',
    incidentDate: '2026-06-18',
    amountLost: 2200,
    evidenceFileName: 'package_brick.png',
    source: 'CROWDSOURCED',
    status: 'APPROVED',
    createdAt: '2026-06-18T14:30:00Z',
  },
  {
    id: 'r3',
    entityId: '1',
    reporterType: 'BUYER',
    complaintText: 'Paid ৳1,800 advance for a mobile phone. Scammer blocked after payment.',
    incidentDate: '2026-06-15',
    amountLost: 1800,
    evidenceFileName: 'bkash_receipt.png',
    source: 'CROWDSOURCED',
    status: 'APPROVED',
    createdAt: '2026-06-15T09:15:00Z',
  },
  {
    id: 'r4',
    entityId: '2',
    reporterType: 'BUYER',
    complaintText: 'Sent ৳4,500 for saree. Product arrived but quality was completely different from photos.',
    incidentDate: '2026-06-21',
    amountLost: 4500,
    evidenceFileName: 'saree_diff.png',
    source: 'CROWDSOURCED',
    status: 'APPROVED',
    createdAt: '2026-06-21T18:40:00Z',
  },
  {
    id: 'r5',
    entityId: '2',
    reporterType: 'BUYER',
    complaintText: 'No cash-on-delivery option. Refused refund after wrong item delivered.',
    incidentDate: '2026-06-19',
    evidenceFileName: 'refund_refusal.png',
    source: 'CROWDSOURCED',
    status: 'APPROVED',
    createdAt: '2026-06-19T11:20:00Z',
  },
  {
    id: 'r6',
    entityId: '3',
    reporterType: 'BUYER',
    complaintText: 'Phone ordered for ৳15,000. Received a box of sand with a cheap cover on top.',
    incidentDate: '2026-06-22',
    amountLost: 15000,
    evidenceFileName: 'sand_box.png',
    source: 'CROWDSOURCED',
    status: 'APPROVED',
    createdAt: '2026-06-22T08:00:00Z',
  },
  {
    id: 'r7',
    entityId: '3',
    reporterType: 'BUYER',
    complaintText: 'Fake iPhone 15 delivered instead of genuine. Shop has disappeared from Facebook.',
    incidentDate: '2026-06-20',
    evidenceFileName: 'chat_disappeared.png',
    source: 'CROWDSOURCED',
    status: 'APPROVED',
    createdAt: '2026-06-20T21:10:00Z',
  },
  {
    id: 'r8',
    entityId: '4',
    reporterType: 'SELLER',
    complaintText: 'Placed COD order, refused delivery 3 times. Courier fee lost.',
    incidentDate: '2026-06-21',
    evidenceFileName: 'delivery_slip.png',
    source: 'CROWDSOURCED',
    status: 'APPROVED',
    createdAt: '2026-06-21T16:00:00Z',
  },
  {
    id: 'r9',
    entityId: '4',
    reporterType: 'SELLER',
    complaintText: 'Same number placed order with our group. Gave false address, never answerable.',
    incidentDate: '2026-06-10',
    evidenceFileName: 'fake_address_chat.png',
    source: 'CROWDSOURCED',
    status: 'APPROVED',
    createdAt: '2026-06-10T12:00:00Z',
  },
];

// ── persistent global store for local hot module reloading ──────────
const g = globalThis as any;
if (!g.__mock_db) {
  g.__mock_db = {};
}
g.__mock_db.entities = g.__mock_db.entities || [...INITIAL_MOCK_ENTITIES];
g.__mock_db.reports = g.__mock_db.reports || [...INITIAL_MOCK_REPORTS];
g.__mock_db.ai_cache = g.__mock_db.ai_cache || {} as Record<string, AICacheEntry>;

const mockDb = g.__mock_db;

// Normalize key
function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-().]/g, '');
}

// Helper to determine risk dynamically based on reports
function calculateRisk(count: number): 'confirmed' | 'high' | 'caution' | 'safe' {
  if (count >= 10) return 'confirmed';
  if (count >= 3) return 'high';
  if (count >= 1) return 'caution';
  return 'safe';
}

// ── DB Access Functions ──────────────────────────────────────────────

export async function getEntity(query: string, mode: 'buyer' | 'seller', _locals?: any) {
  const nq = normalize(query);
  const env = await getEnv();
  const db = env?.DB;

  if (db) {
    // ── Cloudflare D1 Query ──
    const matchMode = mode === 'seller' ? 'BUYER' : 'SELLER'; // seller searches for buyers, buyer searches for sellers
    const entityResult = await db
      .prepare(
        `SELECT * FROM entities 
         WHERE type = ? 
         AND (normalized = ? OR ? LIKE '%' || normalized || '%')`
      )
      .bind(matchMode, nq, nq)
      .first();

    if (entityResult) {
      // Fetch associated reports
      const reports = await db
        .prepare(`SELECT * FROM reports WHERE entity_id = ? AND status = 'APPROVED' ORDER BY created_at DESC`)
        .bind(entityResult.id)
        .all();

      return {
        found: true,
        entity: {
          id: entityResult.id,
          name: entityResult.identifier,
          type: entityResult.type === 'BUYER' ? 'Buyer Phone Number' : entityResult.type,
          risk: entityResult.risk,
          complaintCount: entityResult.complaint_count,
          firstSeen: entityResult.first_seen,
          updatedAt: entityResult.updated_at,
          reports: reports.results.map((r: any) => ({
            id: r.id,
            date: r.incident_date,
            summary: r.complaint_text,
            source: r.source === 'CROWDSOURCED' ? 'crowdsourced' : 'scraped',
            evidenceFileName: r.evidence_r2_key,
          })),
          aiFlags: [], // Populated separately or from metadata
        },
      };
    }
  } else {
    // ── Local Mock Fallback ──
    const match = mockDb.entities.find((e: Entity) => {
      const modeMatch = mode === 'seller' ? e.mode === 'seller' : e.mode !== 'seller';
      const textMatch = normalize(e.identifier).includes(nq) || nq.includes(normalize(e.identifier));
      return modeMatch && textMatch;
    });

    if (match) {
      const reports = mockDb.reports.filter(
        (r: DatabaseReport) => r.entityId === match.id && r.status === 'APPROVED'
      );
      return {
        found: true,
        entity: {
          id: match.id,
          name: match.identifier,
          type: match.type,
          risk: match.risk,
          complaintCount: reports.length,
          firstSeen: match.firstSeen,
          updatedAt: match.updatedAt,
          reports: reports.map((r: DatabaseReport) => ({
            id: r.id,
            date: r.incidentDate,
            summary: r.complaintText,
            source: r.source.toLowerCase(),
            evidenceFileName: r.evidenceFileName,
            evidenceDataUrl: r.evidenceDataUrl,
          })),
          aiFlags: match.aiFlags || [],
        },
      };
    }
  }

  return { found: false };
}

export async function createReport(reportData: PendingReport, evidenceFile: File | null, _locals?: any) {
  const env = await getEnv();
  const db = env?.DB;
  const bucket = env?.EVIDENCE_BUCKET;

  let evidenceR2Key = '';
  if (db && bucket && evidenceFile) {
    // ── Cloudflare R2 Upload ──
    evidenceR2Key = `${crypto.randomUUID()}-${evidenceFile.name}`;
    await bucket.put(evidenceR2Key, evidenceFile);

    // ── D1 Insert Report ──
    await db
      .prepare(
        `INSERT INTO reports (id, reporter_type, complaint_text, incident_date, amount_lost, evidence_r2_key, source, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        reportData.id,
        reportData.reporterType,
        reportData.complaintText,
        reportData.incidentDate,
        reportData.amountLost || null,
        evidenceR2Key,
        'CROWDSOURCED',
        'PENDING',
        reportData.createdAt
      )
      .run();
  } else {
    // ── Local Mock Fallback ──
    const report: DatabaseReport = {
      id: reportData.id,
      reporterType: reportData.reporterType,
      entityIdentifier: reportData.entityIdentifier,
      entityType: reportData.entityType,
      complaintText: reportData.complaintText,
      incidentDate: reportData.incidentDate,
      amountLost: reportData.amountLost,
      evidenceFileName: reportData.evidenceFileName,
      evidenceDataUrl: reportData.evidenceDataUrl,
      source: 'CROWDSOURCED',
      status: 'PENDING',
      createdAt: reportData.createdAt,
    };
    mockDb.reports.unshift(report);
  }
}

export async function getPendingQueue(status: 'PENDING' | 'APPROVED' | 'REJECTED', _locals?: any) {
  const env = await getEnv();
  const db = env?.DB;

  if (db) {
    // ── Cloudflare D1 Fetch ──
    const reportsResult = await db
      .prepare(
        `SELECT * FROM reports WHERE status = ? ORDER BY created_at DESC`
      )
      .bind(status)
      .all();

    return {
      total: reportsResult.results.length,
      reports: reportsResult.results.map((r: any) => ({
        id: r.id,
        reporterType: r.reporter_type,
        entityIdentifier: r.entity_identifier || 'Unknown', // mapped identifier
        entityType: r.entity_type || 'Unknown',
        incidentDate: r.incident_date,
        amountLost: r.amount_lost,
        evidenceFileName: r.evidence_r2_key,
        evidenceR2Key: r.evidence_r2_key,
        status: r.status,
        createdAt: r.created_at,
      })),
    };
  } else {
    // ── Local Mock Fallback ──
    const filtered = mockDb.reports.filter((r: DatabaseReport) => r.status === status);
    return {
      total: filtered.length,
      reports: filtered.map((r: DatabaseReport) => ({
        id: r.id,
        reporterType: r.reporterType,
        entityIdentifier: r.entityIdentifier || (r.reporterType === 'BUYER' ? 'Mock Shop Entity' : 'Mock Buyer Entity'),
        entityType: r.entityType || (r.reporterType === 'BUYER' ? 'Facebook Shop' : 'Buyer Phone Number'),
        incidentDate: r.incidentDate,
        amountLost: r.amountLost,
        evidenceFileName: r.evidenceFileName,
        evidenceDataUrl: r.evidenceDataUrl,
        status: r.status,
        createdAt: r.createdAt,
      })),
    };
  }
}

export async function updateReportStatus(reportId: string, action: 'approve' | 'reject', _locals?: any) {
  const env = await getEnv();
  const db = env?.DB;
  const status = action === 'approve' ? 'APPROVED' : 'REJECTED';
  const now = new Date().toISOString();

  if (db) {
    // ── Cloudflare D1 Update ──
    await db.prepare(`UPDATE reports SET status = ?, reviewed_at = ? WHERE id = ?`).bind(status, now, reportId).run();

    if (status === 'APPROVED') {
      // Get report details to update entities
      const report = await db.prepare(`SELECT * FROM reports WHERE id = ?`).bind(reportId).first();
      if (report) {
        const type = report.reporter_type === 'BUYER' ? 'SELLER' : 'BUYER';
        const identifier = report.entity_identifier;
        const nq = normalize(identifier);

        // Check if entity exists
        const existing = await db.prepare(`SELECT * FROM entities WHERE normalized = ?`).bind(nq).first();
        if (existing) {
          const newCount = existing.complaint_count + 1;
          const newRisk = calculateRisk(newCount);
          await db
            .prepare(`UPDATE entities SET complaint_count = ?, risk = ?, updated_at = ? WHERE id = ?`)
            .bind(newCount, newRisk, now, existing.id)
            .run();
        } else {
          const newId = crypto.randomUUID();
          const risk = calculateRisk(1);
          await db
            .prepare(
              `INSERT INTO entities (id, type, identifier, normalized, risk, complaint_count, first_seen, updated_at)
               VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
            )
            .bind(newId, type, identifier, nq, risk, now, now)
            .run();
        }
      }
    }
  } else {
    // ── Local Mock Fallback ──
    const reportIndex = mockDb.reports.findIndex((r: DatabaseReport) => r.id === reportId);
    if (reportIndex !== -1) {
      mockDb.reports[reportIndex].status = status;
      mockDb.reports[reportIndex].reviewedAt = now;

      if (status === 'APPROVED') {
        const report = mockDb.reports[reportIndex];
        const isBuyerReport = report.reporterType === 'BUYER';
        const identifier = report.entityIdentifier || (isBuyerReport ? 'Mock Shop Entity' : 'Mock Buyer Entity');
        const nq = normalize(identifier);

        // Find or create entity
        const existingIndex = mockDb.entities.findIndex((e: Entity) => e.normalized === nq);
        if (existingIndex !== -1) {
          const reports = mockDb.reports.filter(
            (r: DatabaseReport) => r.entityId === mockDb.entities[existingIndex].id && r.status === 'APPROVED'
          );
          mockDb.entities[existingIndex].complaintCount = reports.length + 1;
          mockDb.entities[existingIndex].risk = calculateRisk(reports.length + 1);
          mockDb.entities[existingIndex].updatedAt = now;
        } else {
          const newId = crypto.randomUUID();
          const entity: Entity = {
            id: newId,
            identifier,
            normalized: nq,
            type: isBuyerReport ? 'Facebook Shop' : 'Buyer Phone Number',
            risk: 'caution',
            complaintCount: 1,
            firstSeen: now,
            updatedAt: now,
            mode: isBuyerReport ? 'buyer' : 'seller',
          };
          mockDb.entities.push(entity);
          mockDb.reports[reportIndex].entityId = newId;
        }
      }
    }
  }
}

export async function getAICache(query: string, _locals?: any) {
  const nq = normalize(query);
  const env = await getEnv();
  const db = env?.DB;

  if (db) {
    const cached = await db.prepare(`SELECT * FROM ai_cache WHERE entity_id = ?`).bind(nq).first();
    if (cached) {
      const ageMs = Date.now() - new Date(cached.analyzed_at).getTime();
      const ageHours = ageMs / (1000 * 60 * 60);
      if (ageHours < 24) {
        return {
          cached: true,
          data: {
            whoisAgeDays: cached.whois_age_days,
            safeBrowsingOk: cached.safe_browsing_ok === 1,
            urlscanVerdict: cached.urlscan_verdict,
            webSearchSummary: cached.web_search_summary,
            flags: JSON.parse(cached.flags_json),
            riskVerdict: cached.risk_verdict,
            analyzedAt: cached.analyzed_at,
          },
        };
      }
    }
  } else {
    const cached = mockDb.ai_cache[nq];
    if (cached) {
      const ageMs = Date.now() - new Date(cached.analyzedAt).getTime();
      const ageHours = ageMs / (1000 * 60 * 60);
      if (ageHours < 24) {
        return {
          cached: true,
          data: {
            whoisAgeDays: cached.whoisAgeDays,
            safeBrowsingOk: cached.safeBrowsingOk === 1,
            urlscanVerdict: cached.urlscanVerdict,
            webSearchSummary: cached.webSearchSummary,
            flags: JSON.parse(cached.flagsJson),
            riskVerdict: cached.riskVerdict,
            analyzedAt: cached.analyzedAt,
          },
        };
      }
    }
  }
  return { cached: false };
}

export async function setAICache(query: string, data: any, _locals?: any) {
  const nq = normalize(query);
  const env = await getEnv();
  const db = env?.DB;
  const now = new Date().toISOString();

  if (db) {
    await db
      .prepare(
        `INSERT OR REPLACE INTO ai_cache (entity_id, whois_age_days, safe_browsing_ok, urlscan_verdict, web_search_summary, flags_json, risk_verdict, analyzed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        nq,
        data.whoisAgeDays !== undefined ? data.whoisAgeDays : null,
        data.safeBrowsingOk ? 1 : 0,
        data.urlscanVerdict || null,
        data.webSearchSummary || null,
        JSON.stringify(data.flags || []),
        data.riskVerdict,
        now
      )
      .run();
  } else {
    mockDb.ai_cache[nq] = {
      entityId: nq,
      whoisAgeDays: data.whoisAgeDays,
      safeBrowsingOk: data.safeBrowsingOk ? 1 : 0,
      urlscanVerdict: data.urlscanVerdict,
      webSearchSummary: data.webSearchSummary,
      flagsJson: JSON.stringify(data.flags || []),
      riskVerdict: data.riskVerdict,
      analyzedAt: now,
    };
  }
}

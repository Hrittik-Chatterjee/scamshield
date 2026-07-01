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
  entityIdentifier?: string;
  entityType?: string;
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
const INITIAL_MOCK_ENTITIES: Entity[] = [];

const INITIAL_MOCK_REPORTS: DatabaseReport[] = [];

// ── persistent global store for local hot module reloading ──────────
const g = globalThis as any;
if (!g.__mock_db) {
  g.__mock_db = {};
}
g.__mock_db.entities = g.__mock_db.entities || [...INITIAL_MOCK_ENTITIES];
g.__mock_db.reports = g.__mock_db.reports || [...INITIAL_MOCK_REPORTS];
g.__mock_db.ai_cache = g.__mock_db.ai_cache || {} as Record<string, AICacheEntry>;

const mockDb = g.__mock_db;

// Helper to extract clean base Facebook URL (Page, Group, or Profile ID)
export function cleanFacebookUrl(url: string): string {
  let cleaned = url.trim();
  if (!cleaned) return cleaned;
  
  // If it's not a URL (no dot or slash), return as-is
  if (!cleaned.includes('.') && !cleaned.includes('/')) {
    return cleaned;
  }
  
  try {
    let testUrl = cleaned;
    if (!/^https?:\/\//i.test(testUrl)) {
      testUrl = 'https://' + testUrl;
    }
    const parsed = new URL(testUrl);
    const host = parsed.hostname.toLowerCase();
    
    if (host.includes('facebook.com') || host.includes('fb.com')) {
      let path = parsed.pathname;
      
      // Handle groups
      const groupMatch = path.match(/^\/groups\/([^\/]+)/i);
      if (groupMatch) {
        // If it's a specific post inside a group, do NOT normalize it to the group URL
        if (path.includes('/permalink/') || path.includes('/posts/')) {
          return url;
        }
        return `https://www.facebook.com/groups/${groupMatch[1]}`;
      }
      
      // Handle profile.php or permalink.php with search param 'id'
      if (path.toLowerCase() === '/profile.php' || path.toLowerCase() === '/permalink.php') {
        const idParam = parsed.searchParams.get('id');
        if (idParam) {
          return `https://www.facebook.com/profile.php?id=${idParam}`;
        }
      }
      
      // Handle pages and other profiles
      const segments = path.split('/').filter(Boolean);
      if (segments.length > 0) {
        const firstSegment = segments[0];
        const systemSegments = ['photo', 'photo.php', 'permalink.php', 'profile.php', 'groups', 'marketplace', 'events', 'watch', 'reel'];
        if (!systemSegments.includes(firstSegment.toLowerCase())) {
          return `https://www.facebook.com/${firstSegment}`;
        }
      }
    }
  } catch (e) {
    // Return original if URL parsing fails
  }
  return url;
}

// Normalize key
function normalize(s: string): string {
  const base = cleanFacebookUrl(s);
  return base.toLowerCase().replace(/[\s\-().]/g, '');
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
    let entitiesResult = await db
      .prepare(
        `SELECT * FROM entities 
         WHERE type = ? 
         AND (normalized = ? OR instr(normalized, ?) > 0 OR instr(?, normalized) > 0)`
      )
      .bind(matchMode, nq, nq, nq)
      .all();

    if (!entitiesResult || !entitiesResult.results || entitiesResult.results.length === 0) {
      // Fallback: search reports table for approved reports containing the search query in identifier or text
      const reporterType = matchMode === 'SELLER' ? 'BUYER' : 'SELLER';
      const wildcard = `%${query}%`;
      const reportsSearch = await db
        .prepare(
          `SELECT DISTINCT entity_id FROM reports 
           WHERE status = 'APPROVED' 
           AND reporter_type = ? 
           AND entity_id IS NOT NULL 
           AND (entity_identifier LIKE ? OR complaint_text LIKE ?)`
        )
        .bind(reporterType, wildcard, wildcard)
        .all();

      if (reportsSearch && reportsSearch.results && reportsSearch.results.length > 0) {
        const entityIds = reportsSearch.results.map((r: any) => r.entity_id);
        const placeholders = entityIds.map(() => '?').join(',');
        entitiesResult = await db
          .prepare(`SELECT * FROM entities WHERE id IN (${placeholders})`)
          .bind(...entityIds)
          .all();
      }
    }

    if (entitiesResult && entitiesResult.results && entitiesResult.results.length > 0) {
      const results = entitiesResult.results;
      if (results.length === 1) {
        const entityResult = results[0];
        // Fetch associated reports
        const reports = await db
          .prepare(`SELECT * FROM reports WHERE entity_id = ? AND status = 'APPROVED' ORDER BY created_at DESC`)
          .bind(entityResult.id)
          .all();

        const complaintCount = reports.results.length;

        return {
          found: true,
          isMultiple: false,
          entity: {
            id: entityResult.id,
            name: entityResult.identifier,
            type: entityResult.type === 'BUYER' ? 'Buyer Phone Number' : entityResult.type,
            risk: calculateRisk(complaintCount),
            complaintCount,
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
      } else {
        // Multiple matches
        const entitiesWithPreviews = [];
        for (const e of results) {
          const report = await db
            .prepare(`SELECT complaint_text FROM reports WHERE entity_id = ? AND status = 'APPROVED' ORDER BY created_at DESC LIMIT 1`)
            .bind(e.id)
            .first();

          const countResult = await db
            .prepare(`SELECT COUNT(*) as cnt FROM reports WHERE entity_id = ? AND status = 'APPROVED'`)
            .bind(e.id)
            .first();
          const complaintCount = countResult ? (countResult.cnt as number) : 0;

          let snippet = '';
          if (report && report.complaint_text) {
            const rawText = report.complaint_text;
            if (rawText.trim().startsWith('{') && rawText.trim().endsWith('}')) {
              try {
                const parsed = JSON.parse(rawText);
                snippet = parsed.postText || '';
              } catch {}
            } else {
              snippet = rawText;
            }
          }

          if (snippet.length > 120) {
            snippet = snippet.substring(0, 120) + '...';
          }

          entitiesWithPreviews.push({
            id: e.id,
            name: e.identifier,
            type: e.type === 'BUYER' ? 'Buyer Phone Number' : e.type,
            risk: calculateRisk(complaintCount),
            complaintCount: complaintCount,
            firstSeen: e.first_seen,
            updatedAt: e.updated_at,
            preview: snippet,
          });
        }

        return {
          found: true,
          isMultiple: true,
          entities: entitiesWithPreviews,
        };
      }
    }
  } else {
    // ── Local Mock Fallback ──
    let matches = mockDb.entities.filter((e: Entity) => {
      const modeMatch = mode === 'seller' ? e.mode === 'seller' : e.mode !== 'seller';
      const textMatch = normalize(e.identifier).includes(nq) || nq.includes(normalize(e.identifier));
      return modeMatch && textMatch;
    });

    if (matches.length === 0) {
      const reporterType = mode === 'seller' ? 'SELLER' : 'BUYER';
      const matchingReports = mockDb.reports.filter(
        (r: DatabaseReport) =>
          r.status === 'APPROVED' &&
          r.reporterType === reporterType &&
          r.entityId &&
          (r.entityIdentifier?.toLowerCase().includes(query.toLowerCase()) ||
            r.complaintText.toLowerCase().includes(query.toLowerCase()))
      );
      if (matchingReports.length > 0) {
        const entityIds = Array.from(new Set(matchingReports.map((r) => r.entityId)));
        matches = mockDb.entities.filter((e: Entity) => entityIds.includes(e.id));
      }
    }

    if (matches.length > 0) {
      if (matches.length === 1) {
        const match = matches[0];
        const reports = mockDb.reports.filter(
          (r: DatabaseReport) => r.entityId === match.id && r.status === 'APPROVED'
        );
        return {
          found: true,
          isMultiple: false,
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
      } else {
        const entitiesWithPreviews = matches.map((m: any) => {
          const matchingReports = mockDb.reports.filter(
            (r: DatabaseReport) => r.entityId === m.id && r.status === 'APPROVED'
          );
          let snippet = '';
          if (matchingReports.length > 0) {
            const rawText = matchingReports[0].complaintText;
            if (rawText.trim().startsWith('{') && rawText.trim().endsWith('}')) {
              try {
                const parsed = JSON.parse(rawText);
                snippet = parsed.postText || '';
              } catch {}
            } else {
              snippet = rawText;
            }
          }

          if (snippet.length > 120) {
            snippet = snippet.substring(0, 120) + '...';
          }

          return {
            id: m.id,
            name: m.identifier,
            type: m.type,
            risk: m.risk,
            complaintCount: matchingReports.length,
            firstSeen: m.firstSeen,
            updatedAt: m.updatedAt,
            preview: snippet,
          };
        });

        return {
          found: true,
          isMultiple: true,
          entities: entitiesWithPreviews,
        };
      }
    }
  }

  return { found: false };
}

export async function createReport(reportData: PendingReport, evidenceFile: File | null, _locals?: any) {
  const env = await getEnv();
  const db = env?.DB;
  const bucket = env?.EVIDENCE_BUCKET;

  if (db) {
    let evidenceR2Key = '';
    if (bucket && evidenceFile) {
      // ── Cloudflare R2 Upload ──
      evidenceR2Key = `${crypto.randomUUID()}-${evidenceFile.name}`;
      await bucket.put(evidenceR2Key, evidenceFile);
    } else {
      evidenceR2Key = reportData.evidenceFileName || '';
    }

    // ── D1 Insert Report ──
    await db
      .prepare(
        `INSERT INTO reports (id, reporter_type, entity_identifier, entity_type, complaint_text, incident_date, amount_lost, evidence_r2_key, source, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        reportData.id,
        reportData.reporterType,
        reportData.entityIdentifier,
        reportData.entityType,
        reportData.complaintText,
        reportData.incidentDate,
        reportData.amountLost || null,
        evidenceR2Key || null,
        reportData.source || 'CROWDSOURCED',
        reportData.status || 'PENDING',
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
      evidenceFileName: reportData.evidenceFileName || 'unknown',
      evidenceDataUrl: reportData.evidenceDataUrl,
      source: reportData.source || 'CROWDSOURCED',
      status: reportData.status || 'PENDING',
      createdAt: reportData.createdAt,
    };
    mockDb.reports.unshift(report);
  }
}

export async function checkReportExistsByPostUrl(postUrl: string): Promise<boolean> {
  const env = await getEnv();
  const db = env?.DB;
  if (db) {
    const existing = await db
      .prepare('SELECT id FROM reports WHERE evidence_r2_key = ? LIMIT 1')
      .bind(postUrl)
      .first();
    return !!existing;
  } else {
    // Local mock fallback check
    return mockDb.reports.some((r: any) => r.evidenceFileName === postUrl);
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
        complaintText: r.complaint_text, // Map complaint_text from D1
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
        complaintText: r.complaintText, // Map complaintText from mock DB
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
          // Link report to the existing entity
          await db.prepare(`UPDATE reports SET entity_id = ? WHERE id = ?`).bind(existing.id, reportId).run();
        } else {
          const newId = crypto.randomUUID();
          const risk = calculateRisk(1);
          const cleanIdentifier = cleanFacebookUrl(identifier);
          await db
            .prepare(
              `INSERT INTO entities (id, type, identifier, normalized, risk, complaint_count, first_seen, updated_at)
               VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
            )
            .bind(newId, type, cleanIdentifier, nq, risk, now, now)
            .run();
          // Link report to the newly created entity
          await db.prepare(`UPDATE reports SET entity_id = ? WHERE id = ?`).bind(newId, reportId).run();
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
          const cleanIdentifier = cleanFacebookUrl(identifier);
          const entity: Entity = {
            id: newId,
            identifier: cleanIdentifier,
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

export async function deleteReport(reportId: string, _locals?: any) {
  const env = await getEnv();
  const db = env?.DB;
  const now = new Date().toISOString();

  if (db) {
    // Get report details to see if it was approved and linked
    const report = await db.prepare(`SELECT * FROM reports WHERE id = ?`).bind(reportId).first();
    if (report) {
      const entityId = report.entity_id;
      const status = report.status;
      
      // Delete the report
      await db.prepare(`DELETE FROM reports WHERE id = ?`).bind(reportId).run();
      
      // If it was approved, decrement the entity complaint count
      if (status === 'APPROVED' && entityId) {
        const entity = await db.prepare(`SELECT * FROM entities WHERE id = ?`).bind(entityId).first();
        if (entity) {
          const newCount = Math.max(0, entity.complaint_count - 1);
          if (newCount === 0) {
            await db.prepare(`DELETE FROM entities WHERE id = ?`).bind(entityId).run();
          } else {
            const newRisk = calculateRisk(newCount);
            await db.prepare(`UPDATE entities SET complaint_count = ?, risk = ?, updated_at = ? WHERE id = ?`)
              .bind(newCount, newRisk, now, entityId)
              .run();
          }
        }
      }
    }
  } else {
    // ── Local Mock Fallback ──
    const reportIndex = mockDb.reports.findIndex((r: DatabaseReport) => r.id === reportId);
    if (reportIndex !== -1) {
      const report = mockDb.reports[reportIndex];
      const entityId = report.entityId;
      const status = report.status;
      
      mockDb.reports.splice(reportIndex, 1);
      
      if (status === 'APPROVED' && entityId) {
        const entityIndex = mockDb.entities.findIndex((e: Entity) => e.id === entityId);
        if (entityIndex !== -1) {
          const newCount = Math.max(0, mockDb.entities[entityIndex].complaintCount - 1);
          if (newCount === 0) {
            mockDb.entities.splice(entityIndex, 1);
          } else {
            mockDb.entities[entityIndex].complaintCount = newCount;
            mockDb.entities[entityIndex].risk = calculateRisk(newCount);
            mockDb.entities[entityIndex].updatedAt = now;
          }
        }
      }
    }
  }
}

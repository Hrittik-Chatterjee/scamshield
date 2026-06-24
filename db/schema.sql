-- db/schema.sql

-- Entities being tracked (shops, phone numbers, Facebook pages, buyer profiles)
CREATE TABLE IF NOT EXISTS entities (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL,          -- 'SELLER' or 'BUYER'
  identifier      TEXT NOT NULL,          -- original input (phone, URL, shop name)
  normalized      TEXT NOT NULL,          -- lowercase, stripped for matching
  risk            TEXT DEFAULT 'unknown', -- 'confirmed', 'high', 'caution', 'safe', 'unknown'
  complaint_count INTEGER DEFAULT 0,
  first_seen      TEXT,
  updated_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_entities_normalized ON entities(normalized);

-- Individual complaint reports
CREATE TABLE IF NOT EXISTS reports (
  id              TEXT PRIMARY KEY,
  entity_id       TEXT REFERENCES entities(id),
  reporter_type   TEXT NOT NULL,          -- 'BUYER' or 'SELLER'
  entity_identifier TEXT NOT NULL,        -- name/identifier associated with the report
  entity_type     TEXT NOT NULL,          -- e.g., 'Facebook Shop', 'bKash Number'
  complaint_text  TEXT NOT NULL,
  incident_date   TEXT NOT NULL,
  amount_lost     REAL,
  evidence_r2_key TEXT,                   -- R2 object key for screenshot
  source          TEXT DEFAULT 'CROWDSOURCED', -- 'CROWDSOURCED' or 'SCRAPED'
  status          TEXT DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
  reviewed_at     TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

-- AI analysis cache (24-hour TTL)
CREATE TABLE IF NOT EXISTS ai_cache (
  entity_id       TEXT PRIMARY KEY,
  whois_age_days  INTEGER,
  safe_browsing_ok INTEGER,              -- 1 = safe, 0 = flagged
  urlscan_verdict TEXT,
  web_search_summary TEXT,
  flags_json      TEXT,                   -- JSON array of detected fraud flags
  risk_verdict    TEXT NOT NULL,
  analyzed_at     TEXT NOT NULL           -- ISO timestamp; expire after 24h
);

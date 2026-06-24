-- db/seed.sql

-- Clear existing data (optional, for clean seed)
DELETE FROM reports;
DELETE FROM entities;
DELETE FROM ai_cache;

-- Insert entities
INSERT INTO entities (id, type, identifier, normalized, risk, complaint_count, first_seen, updated_at) VALUES 
('1', 'SELLER', '01712345678', '01712345678', 'confirmed', 3, '2026-05-01', '2026-06-20'),
('2', 'SELLER', 'TrendyClosetBD', 'trendyclosetbd', 'high', 2, '2026-06-01', '2026-06-21'),
('3', 'SELLER', 'GadgetKingBD', 'gadgetkingbd', 'confirmed', 2, '2026-03-15', '2026-06-22'),
('4', 'BUYER', '01987654321', '01987654321', 'high', 2, '2026-05-20', '2026-06-21');

-- Insert approved reports
INSERT INTO reports (id, entity_id, reporter_type, entity_identifier, entity_type, complaint_text, incident_date, amount_lost, evidence_r2_key, source, status, created_at) VALUES
('r1', '1', 'BUYER', '01712345678', 'bKash Number', 'Took ৳3,500 for a jacket. Never delivered. Phone now switched off.', '2026-06-20', 3500, 'r2-key-chat_screenshot', 'CROWDSOURCED', 'APPROVED', '2026-06-20T10:00:00Z'),
('r2', '1', 'BUYER', '01712345678', 'bKash Number', 'Ordered shoes worth ৳2,200. Got a package with bricks inside.', '2026-06-18', 2200, 'r2-key-package_brick', 'CROWDSOURCED', 'APPROVED', '2026-06-18T14:30:00Z'),
('r3', '1', 'BUYER', '01712345678', 'bKash Number', 'Paid ৳1,800 advance for a mobile phone. Scammer blocked after payment.', '2026-06-15', 1800, 'r2-key-bkash_receipt', 'CROWDSOURCED', 'APPROVED', '2026-06-15T09:15:00Z'),
('r4', '2', 'BUYER', 'TrendyClosetBD', 'Facebook Shop', 'Sent ৳4,500 for saree. Product arrived but quality was completely different from photos.', '2026-06-21', 4500, 'r2-key-saree_diff', 'CROWDSOURCED', 'APPROVED', '2026-06-21T18:40:00Z'),
('r5', '2', 'BUYER', 'TrendyClosetBD', 'Facebook Shop', 'No cash-on-delivery option. Refused refund after wrong item delivered.', '2026-06-19', NULL, 'r2-key-refund_refusal', 'CROWDSOURCED', 'APPROVED', '2026-06-19T11:20:00Z'),
('r6', '3', 'BUYER', 'GadgetKingBD', 'Online Store', 'Phone ordered for ৳15,000. Received a box of sand with a cheap cover on top.', '2026-06-22', 15000, 'r2-key-sand_box', 'CROWDSOURCED', 'APPROVED', '2026-06-22T08:00:00Z'),
('r7', '3', 'BUYER', 'GadgetKingBD', 'Online Store', 'Fake iPhone 15 delivered instead of genuine. Shop has disappeared from Facebook.', '2026-06-20', NULL, 'r2-key-chat_disappeared', 'CROWDSOURCED', 'APPROVED', '2026-06-20T21:10:00Z'),
('r8', '4', 'SELLER', '01987654321', 'Buyer Phone Number', 'Placed COD order, refused delivery 3 times. Courier fee lost.', '2026-06-21', NULL, 'r2-key-delivery_slip', 'CROWDSOURCED', 'APPROVED', '2026-06-21T16:00:00Z'),
('r9', '4', 'SELLER', '01987654321', 'Buyer Phone Number', 'Same number placed order with our group. Gave false address, never answerable.', '2026-06-10', NULL, 'r2-key-fake_address_chat', 'CROWDSOURCED', 'APPROVED', '2026-06-10T12:00:00Z');

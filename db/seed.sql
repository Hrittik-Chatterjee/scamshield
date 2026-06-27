-- db/seed.sql
-- Clear existing data
DELETE FROM reports;
DELETE FROM entities;
DELETE FROM ai_cache;

-- Insert entities (approved and established risk profiles)
INSERT INTO entities (id, type, identifier, normalized, risk, complaint_count, first_seen, updated_at) VALUES 
('e1', 'SELLER', '01712345678', '01712345678', 'confirmed', 3, '2026-05-01', '2026-06-20'),
('e2', 'SELLER', 'TrendyClosetBD', 'trendyclosetbd', 'high', 2, '2026-06-01', '2026-06-21'),
('e3', 'SELLER', 'GadgetKingBD', 'gadgetkingbd', 'confirmed', 2, '2026-03-15', '2026-06-22'),
('e4', 'BUYER', '01987654321', '01987654321', 'high', 2, '2026-05-20', '2026-06-21'),
('e5', 'SELLER', '01911223344', '01911223344', 'caution', 1, '2026-06-22', '2026-06-24'),
('e6', 'SELLER', 'Gadgets BD Store', 'gadgetsbdstore', 'caution', 1, '2026-06-23', '2026-06-24'),
('e7', 'BUYER', '01511223344', '01511223344', 'caution', 1, '2026-06-20', '2026-06-24');

-- Insert approved reports (historical data for search)
INSERT INTO reports (id, entity_id, reporter_type, entity_identifier, entity_type, complaint_text, incident_date, amount_lost, evidence_r2_key, source, status, created_at) VALUES
('r1', 'e1', 'BUYER', '01712345678', 'bKash Number', 'Took ৳3,500 for a Punjabi. Never delivered. Phone now switched off.', '2026-06-20', 3500, 'r2-key-chat_screenshot', 'CROWDSOURCED', 'APPROVED', '2026-06-20T10:00:00Z'),
('r2', 'e1', 'BUYER', '01712345678', 'bKash Number', 'Ordered shoes worth ৳2,200. Got a package with bricks inside.', '2026-06-18', 2200, 'r2-key-package_brick', 'CROWDSOURCED', 'APPROVED', '2026-06-18T14:30:00Z'),
('r3', 'e1', 'BUYER', '01712345678', 'bKash Number', 'Paid ৳1,800 advance for a mobile phone. Scammer blocked after payment.', '2026-06-15', 1800, 'r2-key-bkash_receipt', 'CROWDSOURCED', 'APPROVED', '2026-06-15T09:15:00Z'),
('r4', 'e2', 'BUYER', 'TrendyClosetBD', 'Facebook Shop', 'Sent ৳4,500 for saree. Product arrived but quality was completely different from photos.', '2026-06-21', 4500, 'r2-key-saree_diff', 'CROWDSOURCED', 'APPROVED', '2026-06-21T18:40:00Z'),
('r5', 'e2', 'BUYER', 'TrendyClosetBD', 'Facebook Shop', 'No cash-on-delivery option. Refused refund after wrong item delivered.', '2026-06-19', NULL, 'r2-key-refund_refusal', 'CROWDSOURCED', 'APPROVED', '2026-06-19T11:20:00Z'),
('r6', 'e3', 'BUYER', 'GadgetKingBD', 'Online Store', 'Phone ordered for ৳15,000. Received a box of sand with a cheap cover on top.', '2026-06-22', 15000, 'r2-key-sand_box', 'CROWDSOURCED', 'APPROVED', '2026-06-22T08:00:00Z'),
('r7', 'e3', 'BUYER', 'GadgetKingBD', 'Online Store', 'Fake iPhone 15 delivered instead of genuine. Shop has disappeared from Facebook.', '2026-06-20', NULL, 'r2-key-chat_disappeared', 'CROWDSOURCED', 'APPROVED', '2026-06-20T21:10:00Z'),
('r8', 'e4', 'SELLER', '01987654321', 'Buyer Phone Number', 'Placed COD order, refused delivery 3 times. Courier fee lost.', '2026-06-21', NULL, 'r2-key-delivery_slip', 'CROWDSOURCED', 'APPROVED', '2026-06-21T16:00:00Z'),
('r9', 'e4', 'SELLER', '01987654321', 'Buyer Phone Number', 'Same number placed order with our group. Gave false address, never answerable.', '2026-06-10', NULL, 'r2-key-fake_address_chat', 'CROWDSOURCED', 'APPROVED', '2026-06-10T12:00:00Z'),
('r10', 'e5', 'BUYER', '01911223344', 'Nagad Number', 'Prepayment scam for custom dress. Blocked me immediately.', '2026-06-22', 1500, 'r2-key-nagad_scam', 'CROWDSOURCED', 'APPROVED', '2026-06-22T19:30:00Z'),
('r11', 'e6', 'BUYER', 'Gadgets BD Store', 'Facebook Page / Shop', 'Took advance for smart watch, sent dummy plastic box.', '2026-06-23', 2500, 'r2-key-dummy_watch', 'CROWDSOURCED', 'APPROVED', '2026-06-23T11:45:00Z'),
('r12', 'e7', 'SELLER', '01511223344', 'Buyer Phone Number', 'Refused Cash on Delivery package at Dhaka EPZ area. Courier cost lost.', '2026-06-20', 150, 'r2-key-refusal_slip', 'CROWDSOURCED', 'APPROVED', '2026-06-20T17:15:00Z');

-- Insert pending reports (includes crowdsourced and scraped test data with photos/comments)
INSERT INTO reports (id, entity_id, reporter_type, entity_identifier, entity_type, complaint_text, incident_date, amount_lost, evidence_r2_key, source, status, created_at) VALUES
('p1', NULL, 'BUYER', '01799887766', 'bKash Number', 'Took ৳4,000 for leather shoes. Sent a cheap rubber sandal and blocked my profile.', '2026-06-24', 4000, 'r2-key-shoes_scam', 'CROWDSOURCED', 'PENDING', '2026-06-24T22:30:00Z'),
('p2', NULL, 'BUYER', 'Dhaka Fashion Zone', 'Facebook Page / Shop', 'They are selling replica jackets claiming they are authentic. Refusing refunds.', '2026-06-24', 3200, 'r2-key-jacket_scam', 'CROWDSOURCED', 'PENDING', '2026-06-24T23:15:00Z'),
('p3', NULL, 'SELLER', '01899112233', 'Buyer Phone Number', 'Ordered high-value gadgets Cash on Delivery, then switched off phone when delivery rider arrived.', '2026-06-25', NULL, 'r2-key-buyer_refusal', 'CROWDSOURCED', 'PENDING', '2026-06-25T10:00:00Z'),

-- Scraped pending report 1 (contains images)
('p4', NULL, 'BUYER', '01911223344', 'Nagad Number', 
'[Scraped from Facebook Post] (https://www.facebook.com/groups/scambd/posts/1122334455/)
Poster: Tanvir Rahman

Beware of Gadgets BD Store! They took 3500 TK advance on Nagad 01911223344 and blocked me. Here are the screenshots of our conversation and the payment.

--- Captured Photos ---
Photo 1: https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=500
Photo 2: https://images.unsplash.com/photo-1563013544-824ae1d704d3?w=500', '2026-06-25', NULL, 'https://www.facebook.com/groups/scambd/posts/1122334455/', 'SCRAPED', 'PENDING', '2026-06-25T11:00:00Z'),

-- Scraped pending report 2 (contains a page link entity and images)
('p5', NULL, 'BUYER', 'https://facebook.com/trendywear.dhaka', 'Facebook Page', 
'[Scraped from Facebook Post] (https://www.facebook.com/groups/scambd/posts/9988776655/)
Poster: Rumana Islam

Trendy Wear Dhaka is a scam page! They sent completely damaged and dirty sarees. Now they are ignoring all my messages. See evidence.

--- Captured Photos ---
Photo 1: https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=500', '2026-06-25', NULL, 'https://www.facebook.com/groups/scambd/posts/9988776655/', 'SCRAPED', 'PENDING', '2026-06-25T12:00:00Z');

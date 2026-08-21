-- TEST DATA SEED SCRIPT
-- All test data is prefixed with [TEST] for easy identification and removal
-- Run: DELETE FROM player_profiles WHERE display_name LIKE '[TEST]%';
-- Or use the cleanup section at the bottom

-- ============================================
-- 1. TEST USERS & PLAYER PROFILES
-- ============================================

-- Note: In Supabase, we need to create auth.users first, but for seeding we'll use service role
-- These UUIDs are deterministic so we can reference them

-- Create test player profiles (assuming auth users exist or using service role bypass)
INSERT INTO player_profiles (id, user_id, display_name, bio, city, province, dominant_hand, preferred_position, skill_level, is_public, created_at)
VALUES
  ('11111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111101', '[TEST] Juan Santos', 'Weekend warrior, loves doubles!', 'Makati', 'Metro Manila', 'right', 'backhand', 4.2, true, NOW()),
  ('11111111-1111-1111-1111-111111111102', '11111111-1111-1111-1111-111111111102', '[TEST] Maria Garcia', 'Former tennis player, new to pickleball', 'Quezon City', 'Metro Manila', 'right', 'forehand', 3.8, true, NOW()),
  ('11111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111103', '[TEST] Carlos Reyes', 'Competitive player, looking for partners', 'Cebu City', 'Cebu', 'left', 'both', 5.1, true, NOW()),
  ('11111111-1111-1111-1111-111111111104', '11111111-1111-1111-1111-111111111104', '[TEST] Ana Cruz', 'Club organizer and player', 'Davao City', 'Davao del Sur', 'right', 'forehand', 4.5, true, NOW()),
  ('11111111-1111-1111-1111-111111111105', '11111111-1111-1111-1111-111111111105', '[TEST] Miguel Torres', 'Pro level, coaching available', 'Pasig', 'Metro Manila', 'right', 'both', 5.8, true, NOW()),
  ('11111111-1111-1111-1111-111111111106', '11111111-1111-1111-1111-111111111106', '[TEST] Sofia Lim', 'Beginner, eager to learn', 'Taguig', 'Metro Manila', 'right', 'forehand', 2.8, true, NOW()),
  ('11111111-1111-1111-1111-111111111107', '11111111-1111-1111-1111-111111111107', '[TEST] David Tan', 'Intermediate player, available weekends', 'Mandaluyong', 'Metro Manila', 'right', 'backhand', 3.5, true, NOW()),
  ('11111111-1111-1111-1111-111111111108', '11111111-1111-1111-1111-111111111108', '[TEST] Isabella Ramos', 'Advanced doubles specialist', 'Paranaque', 'Metro Manila', 'left', 'forehand', 4.8, true, NOW()),
  ('11111111-1111-1111-1111-111111111109', '11111111-1111-1111-1111-111111111109', '[TEST] Gabriel Mendoza', 'Tournament champion 2024', 'Iloilo City', 'Iloilo', 'right', 'both', 5.5, true, NOW()),
  ('11111111-1111-1111-1111-111111111110', '11111111-1111-1111-1111-111111111110', '[TEST] Luna Aquino', 'Mixed doubles enthusiast', 'Baguio', 'Benguet', 'right', 'forehand', 4.0, true, NOW())
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 2. TEST PLAYER RATINGS
-- ============================================

INSERT INTO player_ratings (id, player_id, rating_type, rating_value, matches_played, wins, losses, created_at, updated_at)
VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111101', 'singles', 4.20, 45, 28, 17, NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111101', 'doubles', 4.35, 32, 22, 10, NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111102', 'singles', 3.80, 28, 15, 13, NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111102', 'doubles', 3.95, 20, 12, 8, NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111103', 'singles', 5.10, 89, 62, 27, NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111103', 'doubles', 5.25, 67, 48, 19, NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111104', 'singles', 4.50, 56, 38, 18, NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111104', 'doubles', 4.65, 44, 31, 13, NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111105', 'singles', 5.80, 120, 98, 22, NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111105', 'doubles', 5.90, 95, 80, 15, NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111106', 'singles', 2.80, 12, 4, 8, NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111107', 'singles', 3.50, 35, 18, 17, NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111107', 'doubles', 3.60, 28, 15, 13, NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111108', 'singles', 4.80, 72, 52, 20, NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111108', 'doubles', 5.00, 85, 65, 20, NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111109', 'singles', 5.50, 95, 72, 23, NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111109', 'doubles', 5.65, 78, 60, 18, NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111110', 'singles', 4.00, 40, 22, 18, NOW(), NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111110', 'doubles', 4.15, 35, 20, 15, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ============================================
-- 3. TEST CLUBS
-- ============================================

INSERT INTO clubs (id, name, description, city, province, contact_email, verification_status, created_by, created_at)
VALUES
  ('22222222-2222-2222-2222-222222222201', '[TEST] Metro Manila Pickleball Club', 'The largest pickleball community in Metro Manila. Weekly open play, tournaments, and coaching.', 'Makati', 'Metro Manila', 'test-mmpc@example.com', 'verified', '11111111-1111-1111-1111-111111111104', NOW()),
  ('22222222-2222-2222-2222-222222222202', '[TEST] Cebu Picklers Association', 'Cebu''s premier pickleball club. All skill levels welcome!', 'Cebu City', 'Cebu', 'test-cpa@example.com', 'verified', '11111111-1111-1111-1111-111111111103', NOW()),
  ('22222222-2222-2222-2222-222222222203', '[TEST] Davao Dink Dynasty', 'Southern Philippines pickleball headquarters. Competitive and recreational play.', 'Davao City', 'Davao del Sur', 'test-ddd@example.com', 'verified', '11111111-1111-1111-1111-111111111104', NOW()),
  ('22222222-2222-2222-2222-222222222204', '[TEST] BGC Paddle Sports', 'Premium pickleball facility in Bonifacio Global City. Members-only events.', 'Taguig', 'Metro Manila', 'test-bgc@example.com', 'pending', '11111111-1111-1111-1111-111111111105', NOW()),
  ('22222222-2222-2222-2222-222222222205', '[TEST] Iloilo Pickleball Society', 'Western Visayas pickleball community. Beginners to pros.', 'Iloilo City', 'Iloilo', 'test-ips@example.com', 'verified', '11111111-1111-1111-1111-111111111109', NOW()),
  ('22222222-2222-2222-2222-222222222206', '[TEST] Baguio Mountain Picklers', 'Cool mountain air, hot pickleball action!', 'Baguio', 'Benguet', 'test-bmp@example.com', 'pending', '11111111-1111-1111-1111-111111111110', NOW())
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 4. TEST CLUB MEMBERSHIPS
-- ============================================

INSERT INTO club_memberships (id, club_id, player_id, role, status, joined_at, created_at)
VALUES
  -- Metro Manila Pickleball Club members
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111104', 'owner', 'active', NOW(), NOW()),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101', 'member', 'active', NOW(), NOW()),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111102', 'member', 'active', NOW(), NOW()),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111105', 'admin', 'active', NOW(), NOW()),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111106', 'member', 'pending', NOW(), NOW()),
  -- Cebu Picklers Association members
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111103', 'owner', 'active', NOW(), NOW()),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111108', 'member', 'active', NOW(), NOW()),
  -- Davao Dink Dynasty members
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111104', 'owner', 'active', NOW(), NOW()),
  -- BGC Paddle Sports members
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111105', 'owner', 'active', NOW(), NOW()),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111108', 'member', 'active', NOW(), NOW()),
  -- Iloilo Pickleball Society members
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222205', '11111111-1111-1111-1111-111111111109', 'owner', 'active', NOW(), NOW()),
  -- Baguio Mountain Picklers members
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222206', '11111111-1111-1111-1111-111111111110', 'owner', 'active', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ============================================
-- 5. TEST EVENTS (TOURNAMENTS)
-- ============================================

INSERT INTO events (id, name, description, event_type, venue, city, province, start_date, end_date, registration_opens, registration_closes, max_participants, status, club_id, created_by, created_at)
VALUES
  -- Upcoming Tournaments
  ('33333333-3333-3333-3333-333333333301', '[TEST] Metro Manila Open 2024', 'The biggest pickleball tournament in the Philippines! Singles and doubles divisions for all skill levels.', 'tournament', 'SM Aura Premier', 'Taguig', 'Metro Manila', NOW() + INTERVAL '14 days', NOW() + INTERVAL '16 days', NOW() - INTERVAL '7 days', NOW() + INTERVAL '10 days', 128, 'published', '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111104', NOW()),

  ('33333333-3333-3333-3333-333333333302', '[TEST] Cebu Summer Slam', 'Annual summer tournament featuring top players from Visayas and Mindanao.', 'tournament', 'Cebu Coliseum', 'Cebu City', 'Cebu', NOW() + INTERVAL '21 days', NOW() + INTERVAL '22 days', NOW() - INTERVAL '14 days', NOW() + INTERVAL '18 days', 64, 'published', '22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111103', NOW()),

  ('33333333-3333-3333-3333-333333333303', '[TEST] BGC Pro Challenge', 'Elite tournament for 5.0+ rated players. Prize pool: PHP 100,000', 'tournament', 'Track 30th BGC', 'Taguig', 'Metro Manila', NOW() + INTERVAL '30 days', NOW() + INTERVAL '31 days', NOW(), NOW() + INTERVAL '25 days', 32, 'published', '22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111105', NOW()),

  ('33333333-3333-3333-3333-333333333304', '[TEST] Iloilo Friendship Cup', 'Beginner-friendly tournament. Great for first-timers!', 'tournament', 'Iloilo Sports Complex', 'Iloilo City', 'Iloilo', NOW() + INTERVAL '7 days', NOW() + INTERVAL '7 days', NOW() - INTERVAL '21 days', NOW() + INTERVAL '5 days', 48, 'published', '22222222-2222-2222-2222-222222222205', '11111111-1111-1111-1111-111111111109', NOW()),

  -- Open Play Events
  ('33333333-3333-3333-3333-333333333305', '[TEST] Saturday Morning Open Play', 'Weekly open play session. All levels welcome! Bring your own paddle.', 'open_play', 'Makati Sports Club', 'Makati', 'Metro Manila', NOW() + INTERVAL '3 days', NOW() + INTERVAL '3 days', NOW() - INTERVAL '7 days', NOW() + INTERVAL '2 days', 24, 'published', '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111104', NOW()),

  ('33333333-3333-3333-3333-333333333306', '[TEST] Wednesday Night Lights', 'After-work pickleball under the lights. Intermediate+ players.', 'open_play', 'BGC Active Zone', 'Taguig', 'Metro Manila', NOW() + INTERVAL '5 days', NOW() + INTERVAL '5 days', NOW(), NOW() + INTERVAL '4 days', 16, 'published', '22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111105', NOW()),

  ('33333333-3333-3333-3333-333333333307', '[TEST] Baguio Cool Pickles', 'Morning open play with mountain views. Beginners encouraged!', 'open_play', 'Burnham Park Courts', 'Baguio', 'Benguet', NOW() + INTERVAL '4 days', NOW() + INTERVAL '4 days', NOW() - INTERVAL '3 days', NOW() + INTERVAL '3 days', 20, 'published', '22222222-2222-2222-2222-222222222206', '11111111-1111-1111-1111-111111111110', NOW()),

  ('33333333-3333-3333-3333-333333333308', '[TEST] Davao Sunday Funday', 'Casual open play every Sunday. Family-friendly atmosphere.', 'open_play', 'Davao Recreation Center', 'Davao City', 'Davao del Sur', NOW() + INTERVAL '6 days', NOW() + INTERVAL '6 days', NOW(), NOW() + INTERVAL '5 days', 30, 'published', '22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111104', NOW()),

  -- Past/Completed Tournament
  ('33333333-3333-3333-3333-333333333309', '[TEST] New Year Kickoff 2024', 'Season opener tournament - completed', 'tournament', 'MOA Arena', 'Pasay', 'Metro Manila', NOW() - INTERVAL '30 days', NOW() - INTERVAL '28 days', NOW() - INTERVAL '60 days', NOW() - INTERVAL '35 days', 64, 'completed', '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111104', NOW() - INTERVAL '60 days'),

  -- Draft Event
  ('33333333-3333-3333-3333-333333333310', '[TEST] December Championship (Draft)', 'End of year tournament - still planning', 'tournament', 'TBA', 'Manila', 'Metro Manila', NOW() + INTERVAL '120 days', NOW() + INTERVAL '122 days', NULL, NULL, 128, 'draft', '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111104', NOW())
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 6. TEST TOURNAMENTS (linked to events)
-- ============================================

INSERT INTO tournaments (id, event_id, name, format, scoring_type, match_format, min_rating, max_rating, created_at)
VALUES
  -- Metro Manila Open tournaments
  ('44444444-4444-4444-4444-444444444401', '33333333-3333-3333-3333-333333333301', 'Singles Open', 'single_elimination', 'standard', 'best_of_3', NULL, NULL, NOW()),
  ('44444444-4444-4444-4444-444444444402', '33333333-3333-3333-3333-333333333301', 'Doubles Open', 'single_elimination', 'standard', 'best_of_3', NULL, NULL, NOW()),
  ('44444444-4444-4444-4444-444444444403', '33333333-3333-3333-3333-333333333301', 'Mixed Doubles', 'single_elimination', 'standard', 'best_of_3', NULL, NULL, NOW()),
  ('44444444-4444-4444-4444-444444444404', '33333333-3333-3333-3333-333333333301', 'Seniors 50+ Singles', 'round_robin', 'standard', 'best_of_3', NULL, NULL, NOW()),

  -- Cebu Summer Slam tournaments
  ('44444444-4444-4444-4444-444444444405', '33333333-3333-3333-3333-333333333302', 'Pro Singles (5.0+)', 'single_elimination', 'standard', 'best_of_5', 5.0, NULL, NOW()),
  ('44444444-4444-4444-4444-444444444406', '33333333-3333-3333-3333-333333333302', 'Amateur Singles (3.5-4.5)', 'single_elimination', 'standard', 'best_of_3', 3.5, 4.5, NOW()),
  ('44444444-4444-4444-4444-444444444407', '33333333-3333-3333-3333-333333333302', 'Pro Doubles', 'double_elimination', 'standard', 'best_of_3', 5.0, NULL, NOW()),

  -- BGC Pro Challenge
  ('44444444-4444-4444-4444-444444444408', '33333333-3333-3333-3333-333333333303', 'Elite Singles', 'single_elimination', 'rally', 'best_of_5', 5.0, NULL, NOW()),
  ('44444444-4444-4444-4444-444444444409', '33333333-3333-3333-3333-333333333303', 'Elite Doubles', 'single_elimination', 'rally', 'best_of_5', 5.0, NULL, NOW()),

  -- Iloilo Friendship Cup
  ('44444444-4444-4444-4444-444444444410', '33333333-3333-3333-3333-333333333304', 'Beginner Singles', 'round_robin', 'standard', 'best_of_3', NULL, 3.5, NOW()),
  ('44444444-4444-4444-4444-444444444411', '33333333-3333-3333-3333-333333333304', 'Beginner Doubles', 'round_robin', 'standard', 'best_of_3', NULL, 3.5, NOW()),
  ('44444444-4444-4444-4444-444444444412', '33333333-3333-3333-3333-333333333304', 'Intermediate Singles', 'single_elimination', 'standard', 'best_of_3', 3.5, 4.5, NOW()),

  -- Open Play (simple format)
  ('44444444-4444-4444-4444-444444444413', '33333333-3333-3333-3333-333333333305', 'Open Play Session', 'round_robin', 'standard', 'single_game', NULL, NULL, NOW()),
  ('44444444-4444-4444-4444-444444444414', '33333333-3333-3333-3333-333333333306', 'Night Session', 'round_robin', 'standard', 'single_game', 3.5, NULL, NOW()),
  ('44444444-4444-4444-4444-444444444415', '33333333-3333-3333-3333-333333333307', 'Morning Session', 'round_robin', 'standard', 'single_game', NULL, NULL, NOW()),
  ('44444444-4444-4444-4444-444444444416', '33333333-3333-3333-3333-333333333308', 'Sunday Session', 'round_robin', 'standard', 'single_game', NULL, NULL, NOW())
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 7. TEST TOURNAMENT CATEGORIES
-- ============================================

INSERT INTO tournament_categories (id, tournament_id, name, description, min_rating, max_rating, gender_restriction, age_min, age_max, max_participants, entry_fee, created_at)
VALUES
  -- Metro Manila Open categories
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444401', 'Open Division', 'All skill levels', NULL, NULL, NULL, NULL, NULL, 32, 500.00, NOW()),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444401', '4.0+ Division', 'Advanced players only', 4.0, NULL, NULL, NULL, NULL, 16, 750.00, NOW()),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444402', 'Open Division', 'All skill levels', NULL, NULL, NULL, NULL, NULL, 32, 800.00, NOW()),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444403', 'Open Division', 'Mixed doubles, all levels', NULL, NULL, 'mixed', NULL, NULL, 24, 800.00, NOW()),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444404', '50+ Division', 'Seniors only', NULL, NULL, NULL, 50, NULL, 16, 400.00, NOW()),

  -- Cebu categories
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444405', 'Pro Division', 'Elite players', 5.0, NULL, NULL, NULL, NULL, 16, 1500.00, NOW()),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444406', '3.5-4.0', 'Intermediate', 3.5, 4.0, NULL, NULL, NULL, 24, 500.00, NOW()),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444406', '4.0-4.5', 'Upper Intermediate', 4.0, 4.5, NULL, NULL, NULL, 24, 500.00, NOW()),

  -- BGC Pro categories
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444408', 'Men''s Pro', 'Men 5.0+', 5.0, NULL, 'male', NULL, NULL, 16, 2000.00, NOW()),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444408', 'Women''s Pro', 'Women 5.0+', 5.0, NULL, 'female', NULL, NULL, 16, 2000.00, NOW()),

  -- Iloilo Beginner categories
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444410', 'True Beginner', 'First tournament!', NULL, 3.0, NULL, NULL, NULL, 16, 200.00, NOW()),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444410', 'Novice', 'Some experience', 2.5, 3.5, NULL, NULL, NULL, 16, 200.00, NOW())
ON CONFLICT DO NOTHING;

-- ============================================
-- 8. TEST TOURNAMENT REGISTRATIONS
-- ============================================

INSERT INTO tournament_registrations (id, tournament_id, player_id, partner_player_id, status, registered_at, created_at)
VALUES
  -- Metro Manila Open registrations
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444401', '11111111-1111-1111-1111-111111111101', NULL, 'confirmed', NOW(), NOW()),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444401', '11111111-1111-1111-1111-111111111103', NULL, 'confirmed', NOW(), NOW()),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444401', '11111111-1111-1111-1111-111111111105', NULL, 'confirmed', NOW(), NOW()),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444402', '11111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111102', 'confirmed', NOW(), NOW()),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444402', '11111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111108', 'confirmed', NOW(), NOW()),

  -- Open Play registrations
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444413', '11111111-1111-1111-1111-111111111101', NULL, 'confirmed', NOW(), NOW()),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444413', '11111111-1111-1111-1111-111111111102', NULL, 'confirmed', NOW(), NOW()),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444413', '11111111-1111-1111-1111-111111111106', NULL, 'confirmed', NOW(), NOW()),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444413', '11111111-1111-1111-1111-111111111107', NULL, 'confirmed', NOW(), NOW()),

  -- Pending registrations
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444401', '11111111-1111-1111-1111-111111111109', NULL, 'pending', NOW(), NOW()),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444405', '11111111-1111-1111-1111-111111111103', NULL, 'pending', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ============================================
-- 9. TEST PARTNERSHIPS
-- ============================================

INSERT INTO partnerships (id, player1_id, player2_id, created_at)
VALUES
  -- Note: player1_id < player2_id constraint
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111102', NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111108', NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111104', '11111111-1111-1111-1111-111111111105', NOW())
ON CONFLICT DO NOTHING;

-- ============================================
-- 10. TEST PARTNER REQUESTS
-- ============================================

INSERT INTO partner_requests (id, from_player_id, to_player_id, status, message, created_at)
VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111106', '11111111-1111-1111-1111-111111111107', 'pending', 'Hey! Want to team up for doubles?', NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111109', '11111111-1111-1111-1111-111111111110', 'pending', 'Looking for a mixed doubles partner!', NOW())
ON CONFLICT DO NOTHING;

-- ============================================
-- 11. TEST SHOUTOUTS
-- ============================================

INSERT INTO player_shoutouts (id, player_id, message, is_active, created_at)
VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111101', 'Looking for doubles partner for Metro Manila Open!', true, NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111103', 'Coaching sessions available - DM me!', true, NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111105', 'Pro tips every Tuesday at BGC courts', true, NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111106', 'Newbie looking for patient practice partners', true, NOW()),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111109', 'Tournament champion ready for new challenges!', true, NOW())
ON CONFLICT DO NOTHING;

-- ============================================
-- 12. TEST ACTIVITIES (for feed)
-- ============================================

INSERT INTO activities (id, actor_player_id, actor_club_id, activity_type, reference_type, reference_id, visibility, metadata, created_at)
VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111105', NULL, 'match.verified', 'match', NULL, 'public', '{"match_type": "singles", "opponent": "Carlos Reyes"}', NOW() - INTERVAL '1 hour'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111103', NULL, 'rating.changed', 'rating', NULL, 'public', '{"rating_type": "singles", "old_rating": 5.05, "new_rating": 5.10}', NOW() - INTERVAL '2 hours'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111101', NULL, 'social.shoutout', NULL, NULL, 'public', '{"message": "Looking for doubles partner for Metro Manila Open!"}', NOW() - INTERVAL '3 hours'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111104', '22222222-2222-2222-2222-222222222201', 'club.event_created', 'event', '33333333-3333-3333-3333-333333333301', 'public', '{"event_name": "Metro Manila Open 2024"}', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111106', '22222222-2222-2222-2222-222222222201', 'club.member_joined', 'club', '22222222-2222-2222-2222-222222222201', 'club', '{"club_name": "Metro Manila Pickleball Club"}', NOW() - INTERVAL '2 days'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111109', NULL, 'achievement.earned', 'achievement', NULL, 'public', '{"achievement_name": "Tournament Champion"}', NOW() - INTERVAL '3 days')
ON CONFLICT DO NOTHING;

-- ============================================
-- CLEANUP SCRIPT (run to remove all test data)
-- ============================================
--
-- To remove all test data, run these commands in order:
--
-- DELETE FROM activities WHERE actor_player_id IN (SELECT id FROM player_profiles WHERE display_name LIKE '[TEST]%');
-- DELETE FROM player_shoutouts WHERE player_id IN (SELECT id FROM player_profiles WHERE display_name LIKE '[TEST]%');
-- DELETE FROM partner_requests WHERE from_player_id IN (SELECT id FROM player_profiles WHERE display_name LIKE '[TEST]%');
-- DELETE FROM partnerships WHERE player1_id IN (SELECT id FROM player_profiles WHERE display_name LIKE '[TEST]%');
-- DELETE FROM tournament_registrations WHERE player_id IN (SELECT id FROM player_profiles WHERE display_name LIKE '[TEST]%');
-- DELETE FROM tournament_categories WHERE tournament_id IN (SELECT id FROM tournaments WHERE name LIKE '[TEST]%');
-- DELETE FROM tournaments WHERE event_id IN (SELECT id FROM events WHERE name LIKE '[TEST]%');
-- DELETE FROM events WHERE name LIKE '[TEST]%';
-- DELETE FROM club_memberships WHERE club_id IN (SELECT id FROM clubs WHERE name LIKE '[TEST]%');
-- DELETE FROM clubs WHERE name LIKE '[TEST]%';
-- DELETE FROM player_ratings WHERE player_id IN (SELECT id FROM player_profiles WHERE display_name LIKE '[TEST]%');
-- DELETE FROM player_profiles WHERE display_name LIKE '[TEST]%';
--
-- ============================================

SELECT 'Test data seeded successfully!' as status;

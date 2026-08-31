-- =====================================================================
-- DEMO SEED — 05 FEED
-- =====================================================================
-- ~230 activity rows across every activity type the feed can render,
-- plus notifications.
-- Requires: 00-config.sql, 01..04.
--
-- Two rules make or break this file:
--
-- 1. visibility MUST be 'public'. fn_feed_for_player (039) filters on it.
--    The app's own writers use 'followers' for social.started_following
--    and 'club' for club.member_joined, which is exactly why those two
--    never appear in the live feed. Seeded as 'public' here so you can
--    actually see what they look like.
--
-- 2. metadata must match formatActivityText() in apps/web/pages/feed.vue,
--    or the item renders as "someone" / "?" instead of a sentence.
--
-- achievement.earned, profile.updated and club.announcement are never
-- written by any handler in the app, so seeding is the only way to see
-- them rendered at all.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- match.verified — metadata: match_type, opponent_ids[]
-- ---------------------------------------------------------------------
INSERT INTO activities (
    id, actor_player_id, actor_club_id, activity_type,
    reference_type, reference_id, visibility, metadata, created_at
)
SELECT
    public.fn_demo_id('act:match:' || m.id),
    winner.player_id,
    NULL,
    'match.verified',
    'match',
    m.id,
    'public',
    jsonb_build_object('match_type', m.match_type, 'opponent_ids', losers.ids),
    m.verified_at
FROM (
    SELECT id, match_type, verified_at
    FROM matches
    WHERE id::text LIKE 'deadbeef-%' AND status = 'verified'
    ORDER BY verified_at DESC
    LIMIT 45
) m
JOIN LATERAL (
    SELECT player_id FROM match_participants
    WHERE match_id = m.id AND result_status = 'won'
    ORDER BY player_id LIMIT 1
) winner ON true
JOIN LATERAL (
    SELECT jsonb_agg(player_id) AS ids FROM match_participants
    WHERE match_id = m.id AND result_status = 'lost'
) losers ON true
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- rating.changed — metadata: rating_type, old_rating, new_rating
-- ---------------------------------------------------------------------
INSERT INTO activities (
    id, actor_player_id, actor_club_id, activity_type,
    reference_type, reference_id, visibility, metadata, created_at
)
SELECT
    public.fn_demo_id('act:rating:' || rt.id),
    rt.player_id,
    NULL,
    'rating.changed',
    'rating',
    rt.id,
    'public',
    jsonb_build_object(
        'rating_type', rt.rating_type,
        'old_rating', rt.old_rating,
        'new_rating', rt.new_rating
    ),
    rt.created_at
FROM (
    SELECT id, player_id, rating_type, old_rating, new_rating, created_at
    FROM rating_transactions
    WHERE id::text LIKE 'deadbeef-%'
    ORDER BY created_at DESC
    LIMIT 40
) rt
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- social.shoutout — metadata: message, optional event_id
-- ---------------------------------------------------------------------
INSERT INTO activities (
    id, actor_player_id, actor_club_id, activity_type,
    reference_type, reference_id, visibility, metadata, created_at
)
SELECT
    public.fn_demo_id('act:shout:' || s.id),
    s.player_id,
    NULL,
    'social.shoutout',
    NULL,
    NULL,
    'public',
    jsonb_build_object('message', s.message)
        || CASE WHEN s.event_id IS NOT NULL
                THEN jsonb_build_object('event_id', s.event_id)
                ELSE '{}'::jsonb END,
    s.created_at
FROM player_shoutouts s
WHERE s.id::text LIKE 'deadbeef-%'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- social.started_following — metadata: target_display_name
-- Seeded 'public' on purpose (the app writes these as 'followers', which
-- the feed then filters out).
-- ---------------------------------------------------------------------
INSERT INTO activities (
    id, actor_player_id, actor_club_id, activity_type,
    reference_type, reference_id, visibility, metadata, created_at
)
SELECT
    public.fn_demo_id('act:follow:' || r.id),
    r.from_player_id,
    NULL,
    'social.started_following',
    NULL,
    r.to_player_id,
    'public',
    jsonb_build_object('target_display_name', target.display_name),
    now() - (row_number() OVER (ORDER BY r.id) * 37) * interval '1 minute'
FROM (
    SELECT id, from_player_id, to_player_id
    FROM player_relationships
    WHERE id::text LIKE 'deadbeef-%' AND relationship_type = 'follow'
    ORDER BY id
    LIMIT 30
) r
JOIN player_profiles target ON target.id = r.to_player_id
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- achievement.earned — metadata: achievement_name
-- ---------------------------------------------------------------------
INSERT INTO activities (
    id, actor_player_id, actor_club_id, activity_type,
    reference_type, reference_id, visibility, metadata, created_at
)
SELECT
    public.fn_demo_id('act:ach:' || pa.id),
    pa.player_id,
    NULL,
    'achievement.earned',
    'achievement',
    pa.achievement_id,
    'public',
    jsonb_build_object('achievement_name', ad.name),
    now() - (row_number() OVER (ORDER BY pa.id) * 53) * interval '1 minute'
FROM (
    SELECT id, player_id, achievement_id
    FROM player_achievements
    WHERE id::text LIKE 'deadbeef-%'
    ORDER BY id
    LIMIT 30
) pa
JOIN achievement_definitions ad ON ad.id = pa.achievement_id
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- club.member_joined — metadata: club_name (also 'public' on purpose)
-- ---------------------------------------------------------------------
INSERT INTO activities (
    id, actor_player_id, actor_club_id, activity_type,
    reference_type, reference_id, visibility, metadata, created_at
)
SELECT
    public.fn_demo_id('act:join:' || cm.id),
    cm.player_id,
    cm.club_id,
    'club.member_joined',
    'club',
    cm.club_id,
    'public',
    jsonb_build_object('club_name', c.name),
    now() - (row_number() OVER (ORDER BY cm.id) * 71) * interval '1 minute'
FROM (
    SELECT id, player_id, club_id
    FROM club_memberships
    WHERE id::text LIKE 'deadbeef-%' AND status = 'active'
    ORDER BY joined_at DESC
    LIMIT 25
) cm
JOIN clubs c ON c.id = cm.club_id
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- club.event_created — metadata: event_name. Club-actor rows, so these
-- also exercise the feed's verified_score tiebreak (verified clubs are
-- 1..8, unverified 9..12).
-- ---------------------------------------------------------------------
INSERT INTO activities (
    id, actor_player_id, actor_club_id, activity_type,
    reference_type, reference_id, visibility, metadata, created_at
)
SELECT
    public.fn_demo_id('act:event:' || e.id),
    e.created_by_player_id,
    e.club_id,
    'club.event_created',
    'event',
    e.id,
    'public',
    jsonb_build_object('event_name', e.name),
    now() - (row_number() OVER (ORDER BY e.id) * 43) * interval '1 minute'
FROM (
    SELECT id, name, club_id, created_by_player_id
    FROM events
    WHERE id::text LIKE 'deadbeef-%'
      AND status = 'published'
      AND visibility = 'public'
    ORDER BY start_date
    LIMIT 35
) e
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- club.announcement (no metadata keys are read by the UI)
-- ---------------------------------------------------------------------
INSERT INTO activities (
    id, actor_player_id, actor_club_id, activity_type,
    reference_type, reference_id, visibility, metadata, created_at
)
SELECT
    public.fn_demo_id('act:ann:' || a.id),
    a.author_player_id,
    a.club_id,
    'club.announcement',
    'club_announcement',
    a.id,
    'public',
    jsonb_build_object('title', a.title),
    a.published_at
FROM (
    SELECT id, club_id, author_player_id, title, published_at
    FROM club_announcements
    WHERE id::text LIKE 'deadbeef-%' AND status = 'published'
    ORDER BY published_at DESC
    LIMIT 20
) a
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- tournament.registered — metadata: tournament_name
-- ---------------------------------------------------------------------
INSERT INTO activities (
    id, actor_player_id, actor_club_id, activity_type,
    reference_type, reference_id, visibility, metadata, created_at
)
SELECT
    public.fn_demo_id('act:treg:' || tr.id),
    tr.player_id,
    NULL,
    'tournament.registered',
    'tournament',
    tr.tournament_id,
    'public',
    jsonb_build_object('tournament_name', t.name),
    now() - (row_number() OVER (ORDER BY tr.id) * 61) * interval '1 minute'
FROM (
    SELECT id, player_id, tournament_id
    FROM tournament_registrations
    WHERE id::text LIKE 'deadbeef-%'
    ORDER BY registered_at DESC
    LIMIT 20
) tr
JOIN tournaments t ON t.id = tr.tournament_id
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- profile.updated (no metadata keys are read by the UI)
-- ---------------------------------------------------------------------
INSERT INTO activities (
    id, actor_player_id, actor_club_id, activity_type,
    reference_type, reference_id, visibility, metadata, created_at
)
SELECT
    public.fn_demo_id('act:profile:' || p.n),
    p.player_id,
    NULL,
    'profile.updated',
    'player',
    p.player_id,
    'public',
    '{}'::jsonb,
    now() - (p.n * 17) * interval '1 minute'
FROM public.v_demo_players p
WHERE p.n % 10 = 4
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Notifications
--
-- user_id references users(id) — NOT player_profiles(id).
-- ---------------------------------------------------------------------
INSERT INTO notifications (
    id, user_id, type, title, body, reference_type, reference_id, read_at, created_at
)
SELECT
    public.fn_demo_id('notif:' || pp.id || ':' || k),
    pp.user_id,
    (ARRAY['match.verification_requested', 'match.verified', 'rating.updated',
           'club.announcement', 'partner.request_received', 'club.membership_approved'])[1 + (k % 6)],
    (ARRAY['A match needs your confirmation', 'Match verified', 'Your rating changed',
           'New club announcement', 'New partner request', 'Club membership approved'])[1 + (k % 6)],
    (ARRAY['Confirm the score your opponent submitted.',
           'The match you played has been verified by all participants.',
           'Your rating moved after your latest verified match.',
           'Your club posted an announcement — open the club page to read it.',
           'Someone wants to partner up with you.',
           'You are now an active member.'])[1 + (k % 6)],
    NULL,
    NULL,
    CASE WHEN k % 3 = 0 THEN now() - (k * 2) * interval '1 hour' ELSE NULL END,
    now() - (k * 3) * interval '1 hour'
FROM public.v_demo_players dp
JOIN player_profiles pp ON pp.id = dp.player_id
CROSS JOIN generate_series(1, 6) AS g(k)
WHERE dp.n % 4 = 0
ON CONFLICT DO NOTHING;

-- A denser, mixed read/unread inbox for the linked real account.
INSERT INTO notifications (
    id, user_id, type, title, body, reference_type, reference_id, read_at, created_at
)
SELECT
    public.fn_demo_id('notif:link:' || k),
    pp.user_id,
    (ARRAY['match.verification_requested', 'match.verified', 'rating.updated',
           'club.announcement', 'partner.request_received', 'team_up.invited',
           'club.membership_approved', 'club.role_changed'])[1 + (k % 8)],
    (ARRAY['A match needs your confirmation', 'Match verified', 'Your rating changed',
           'New club announcement', 'New partner request', 'Team-up invite',
           'Club membership approved', 'Your club role changed'])[1 + (k % 8)],
    'Demo notification so the bell badge and the notifications list are not empty.',
    NULL,
    NULL,
    CASE WHEN k > 12 THEN now() - k * interval '1 hour' ELSE NULL END,
    now() - (k * 2) * interval '1 hour'
FROM generate_series(1, 40) AS g(k)
JOIN player_profiles pp ON pp.id = public.fn_demo_link_player()
WHERE public.fn_demo_link_player() IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;

SELECT 'demo 05-feed' AS step,
       (SELECT count(*) FROM activities    WHERE id::text LIKE 'deadbeef-%') AS activities,
       (SELECT count(*) FROM notifications WHERE id::text LIKE 'deadbeef-%') AS notifications;

-- Proof that every activity type the feed renders is represented, and
-- that all of them are visible to fn_feed_for_player.
SELECT activity_type, visibility, count(*) AS rows
FROM activities
WHERE id::text LIKE 'deadbeef-%'
GROUP BY activity_type, visibility
ORDER BY activity_type;

# Super Admin Specification

## Overview

A single Super Admin account with complete platform control, including branding, theming, icons, and feature visibility.

---

## 1. Authentication

### Super Admin Identity

- **Single account only** — one designated user is the Super Admin
- Stored in `platform_config.super_admin_id` (UUID reference to `users.id`)
- Initial setup: first user to access `/admin/setup` claims Super Admin role (one-time)
- Supabase Auth handles the actual authentication; app-level code checks the ID match

### Access Control

```
Super Admin can:
- Access /admin/* routes
- Modify platform_config
- Upload to platform/ storage bucket
- Toggle feature flags
- View all data across the platform

Regular users:
- Cannot see /admin routes at all
- Subject to feature flag visibility
```

---

## 2. Platform Configuration

### 2.1 Branding

| Setting | Type | Description |
|---------|------|-------------|
| `app_name` | text | Platform name (default: "DinkAndLadder") |
| `logo_url` | text | Main logo (Supabase Storage URL) |
| `favicon_url` | text | Browser tab icon |

### 2.2 Color Palette (4-Color Structure)

Inspired by [ColorHunt](https://colorhunt.co/) — exactly 4 colors that define the entire theme.

| Slot | Semantic Use | Default |
|------|--------------|---------|
| `color_1` | Primary / Brand | `#3B82F6` (blue) |
| `color_2` | Secondary / Accent | `#10B981` (green) |
| `color_3` | Background / Surface | `#F8FAFC` (light gray) |
| `color_4` | Text / Contrast | `#1E293B` (dark slate) |

The admin UI will show a 4-swatch picker. Colors are injected as CSS custom properties:

```css
:root {
  --color-primary: var(--platform-color-1);
  --color-secondary: var(--platform-color-2);
  --color-surface: var(--platform-color-3);
  --color-text: var(--platform-color-4);
}
```

### 2.3 Hero / Landing Page

| Setting | Type | Description |
|---------|------|-------------|
| `hero_background_url` | text | Background image URL |
| `hero_overlay_color` | text | Overlay color (hex) |
| `hero_overlay_opacity` | decimal | 0.0 - 1.0 |
| `hero_title` | text | Main headline |
| `hero_subtitle` | text | Tagline |

### 2.4 Custom Icons

Icons can be assigned to navigation items and action buttons.

**Sources:**
1. **Icon Library** — Lucide icons (400+ icons, MIT licensed)
2. **Custom Upload** — SVG files uploaded to Supabase Storage

**Icon Slots:**

| Category | Slots |
|----------|-------|
| **Navigation** | `nav.dashboard`, `nav.rankings`, `nav.clubs`, `nav.events`, `nav.feed`, `nav.achievements`, `nav.settings` |
| **Actions** | `btn.submit`, `btn.create`, `btn.join`, `btn.follow`, `btn.verify`, `btn.cancel` |
| **Status** | `status.verified`, `status.pending`, `status.rejected`, `status.disputed` |

Storage format:
```json
{
  "nav.dashboard": { "type": "library", "name": "layout-dashboard" },
  "nav.rankings": { "type": "library", "name": "trophy" },
  "btn.submit": { "type": "custom", "url": "https://...storage.../icons/submit.svg" }
}
```

### 2.5 Feature Flags

When a flag is **OFF**, the feature is completely hidden:
- UI components don't render
- API routes return 404 (not 403)
- Navigation links don't appear
- No "coming soon" indication — simply invisible

| Flag | Controls | Default |
|------|----------|---------|
| `feature.payments` | Subscriptions, sponsorships, billing UI | OFF |
| `feature.tournaments` | Events, brackets, registrations | ON |
| `feature.achievements` | Achievement system, badges | ON |
| `feature.social` | Follow/block, activity feed | ON |
| `feature.publicApi` | API keys, webhooks, /api/public/* | OFF |
| `feature.analytics` | Player/club stats, insights | ON |
| `feature.announcements` | Club announcements | ON |

---

## 3. Database Schema

```sql
-- Single-row platform configuration
CREATE TABLE platform_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Super Admin
  super_admin_id uuid REFERENCES users(id),
  
  -- Branding
  app_name text NOT NULL DEFAULT 'DinkAndLadder',
  logo_url text,
  favicon_url text,
  
  -- 4-Color Palette
  color_1 text NOT NULL DEFAULT '#3B82F6',
  color_2 text NOT NULL DEFAULT '#10B981',
  color_3 text NOT NULL DEFAULT '#F8FAFC',
  color_4 text NOT NULL DEFAULT '#1E293B',
  
  -- Hero
  hero_background_url text,
  hero_overlay_color text DEFAULT '#000000',
  hero_overlay_opacity decimal DEFAULT 0.5,
  hero_title text DEFAULT 'Philippine Pickleball Platform',
  hero_subtitle text DEFAULT 'Track your ratings. Join clubs. Compete.',
  
  -- Icons (JSON map)
  custom_icons jsonb NOT NULL DEFAULT '{}',
  
  -- Feature Flags (JSON map)
  feature_flags jsonb NOT NULL DEFAULT '{
    "payments": false,
    "tournaments": true,
    "achievements": true,
    "social": true,
    "publicApi": false,
    "analytics": true,
    "announcements": true
  }',
  
  -- Metadata
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure single row
  CONSTRAINT single_config CHECK (id = '00000000-0000-0000-0000-000000000001'::uuid)
);

-- Seed the single row
INSERT INTO platform_config (id) VALUES ('00000000-0000-0000-0000-000000000001');
```

### RLS Policies

```sql
-- Anyone can read (needed for theming)
CREATE POLICY platform_config_select_all ON platform_config
  FOR SELECT USING (true);

-- Only super admin can update
CREATE POLICY platform_config_update_super_admin ON platform_config
  FOR UPDATE USING (
    auth.uid() = (SELECT super_admin_id FROM platform_config LIMIT 1)
  );
```

---

## 4. Admin UI

### Routes

| Route | Purpose |
|-------|---------|
| `/admin` | Dashboard overview |
| `/admin/setup` | One-time super admin claim (if unclaimed) |
| `/admin/branding` | Logo, favicon, app name |
| `/admin/theme` | 4-color palette picker |
| `/admin/hero` | Landing page background & text |
| `/admin/icons` | Icon assignment (library + upload) |
| `/admin/features` | Feature flag toggles |

### Live Preview

All admin pages include a **preview panel**:
- Split-screen layout: controls on left, preview on right
- Preview updates in real-time as settings change
- "Apply Changes" button commits to database
- "Reset" button reverts to saved state

### Color Picker

4-swatch interface inspired by ColorHunt:
```
┌─────────────────────────────────────┐
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐       │
│  │ C1 │ │ C2 │ │ C3 │ │ C4 │       │
│  └────┘ └────┘ └────┘ └────┘       │
│                                     │
│  Primary  Secondary  Surface  Text  │
└─────────────────────────────────────┘
```

Click any swatch to open a full color picker.

### Icon Selector

```
┌─────────────────────────────────────┐
│ Navigation Icons                    │
│ ┌──────────────┬──────────────────┐ │
│ │ Dashboard    │ [icon] ▼ Change  │ │
│ │ Rankings     │ [icon] ▼ Change  │ │
│ │ Clubs        │ [icon] ▼ Change  │ │
│ └──────────────┴──────────────────┘ │
│                                     │
│ [Change] opens:                     │
│ ┌─────────────────────────────────┐ │
│ │ ○ Library    ○ Upload Custom    │ │
│ │ ┌───┬───┬───┬───┬───┬───┐      │ │
│ │ │ 🏠 │ 🏆 │ 👥 │ 📅 │ ⚡ │ ... │ │
│ │ └───┴───┴───┴───┴───┴───┘      │ │
│ │ Search: [____________]          │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

---

## 5. Storage Bucket

```
Supabase Storage:
└── platform/
    ├── logo.png
    ├── favicon.ico
    ├── hero-bg.jpg
    └── icons/
        ├── custom-submit.svg
        └── ...
```

**Bucket Policy:** Public read, Super Admin write only.

---

## 6. Implementation Checklist

### Database
- [ ] `017-admin.changelog.xml` — platform_config table
- [ ] RLS policies for super admin

### Domain
- [ ] `apps/web/server/domains/admin/` — dto, repository, service
- [ ] Platform config caching (read once, cache in memory)

### API Endpoints
- [ ] `GET /api/v1/admin/config` — read config (super admin only)
- [ ] `PATCH /api/v1/admin/config` — update config
- [ ] `POST /api/v1/admin/setup` — claim super admin (one-time)
- [ ] `POST /api/v1/admin/upload` — upload asset to platform/ bucket

### Middleware
- [ ] `server/middleware/feature-flags.ts` — hide disabled features
- [ ] `server/middleware/theme.ts` — inject CSS variables

### UI
- [ ] `/admin/setup` — claim page
- [ ] `/admin/branding` — logo/favicon
- [ ] `/admin/theme` — 4-color picker with live preview
- [ ] `/admin/hero` — background/text editor
- [ ] `/admin/icons` — icon assignment
- [ ] `/admin/features` — toggle switches

### Composables
- [ ] `usePlatformConfig()` — reactive config access
- [ ] `useFeatureFlag(flag)` — check if feature enabled
- [ ] `useTheme()` — access color palette

---

## 7. Feature Flag Integration

### Server-side (API routes)

```typescript
// In any protected endpoint
import { useFeatureFlag } from '~/server/utils/feature-flags'

export default defineEventHandler(async (event) => {
  if (!await useFeatureFlag(event, 'payments')) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }
  // ... rest of handler
})
```

### Client-side (Components)

```vue
<template>
  <div v-if="features.payments">
    <!-- Payment UI -->
  </div>
</template>

<script setup>
const { features } = usePlatformConfig()
</script>
```

### Navigation

```typescript
// In navigation config
const navItems = computed(() => [
  { label: 'Dashboard', to: '/dashboard', icon: icons['nav.dashboard'] },
  { label: 'Rankings', to: '/rankings', icon: icons['nav.rankings'] },
  features.tournaments && { label: 'Events', to: '/events', icon: icons['nav.events'] },
  features.achievements && { label: 'Achievements', to: '/achievements', icon: icons['nav.achievements'] },
].filter(Boolean))
```

---

## 8. Decisions

1. **Super Admin recovery** — Supabase only. If super admin loses access, recovery is via direct database update (`UPDATE platform_config SET super_admin_id = '...'`). No in-app recovery flow.

2. **Config versioning** — Yes. Keep at least 10 history entries for rollback. See `platform_config_history` table below.

3. **Dark mode** — No. Single 4-color palette only. No dark mode variant.

---

## 9. Config History (Rollback Support)

```sql
CREATE TABLE platform_config_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Snapshot of config at time of change
  config_snapshot jsonb NOT NULL,
  
  -- What changed
  changed_fields text[] NOT NULL,
  
  -- Metadata
  changed_at timestamptz DEFAULT now(),
  changed_by uuid REFERENCES users(id),
  
  -- Keep only last 10
  version_number int NOT NULL
);

-- Index for ordering
CREATE INDEX idx_config_history_version ON platform_config_history(version_number DESC);
```

### Rollback Flow

1. Admin clicks "History" in admin panel
2. Shows last 10 versions with timestamps and changed fields
3. "Preview" shows diff against current
4. "Restore" applies that snapshot as current config
5. Restoring creates a new history entry (so you can undo a rollback)

### Cleanup Trigger

```sql
-- After insert, delete entries beyond 10
CREATE OR REPLACE FUNCTION cleanup_config_history()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM platform_config_history
  WHERE id NOT IN (
    SELECT id FROM platform_config_history
    ORDER BY version_number DESC
    LIMIT 10
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cleanup_config_history
AFTER INSERT ON platform_config_history
EXECUTE FUNCTION cleanup_config_history();
```

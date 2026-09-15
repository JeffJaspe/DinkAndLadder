# Legal & Policy Pages — Plan

Written 2026-09-12. This is a **plan**, not a spec: the wording of every policy
needs a lawyer's review before production. What this document decides is the
*engineering* shape — where the text lives, what the product must be able to do
before the text can promise it, and which business inputs are still missing.

Jurisdiction: **Philippines** — decided by Jeff 2026-09-12, not assumed. The
governing law is the **Data Privacy Act of 2012 (RA 10173)** and its NPC
implementing rules; the **Consumer Act (RA 7394)** and **E-Commerce Act
(RA 8792)** cover refunds and online contracts. GDPR is noted where it costs
nothing to satisfy, but it is not the target.

### What choosing the Philippines commits us to (beyond the policy text)
| Obligation | Source | Where it lands in this plan |
|---|---|---|
| Appoint a **Data Protection Officer** and publish contact details | RA 10173 §21, NPC Circular 16-01 | §5 DPO mailbox, §9 input |
| **NPC registration** of the DPO and data processing systems once thresholds are met (≥250 employees, or ≥1,000 data subjects' sensitive data, or processing likely to pose risk) — a national ranking of named players with location and phone numbers will cross the "1,000 data subjects" line early | NPC Circular 17-01 / 2022-04 | Ops task, tracked in §5 |
| **Breach notification to NPC and affected users within 72 hours** of discovery for sensitive/identity-enabling data | RA 10173 §20, NPC Circular 16-03 | Needs an incident-response runbook in docs/07 — added to §5 |
| **Cross-border transfer**: data hosted in Tokyo/Seoul must be disclosed and covered by contractual safeguards (Supabase DPA suffices) | RA 10173 §21, NPC rules §44 | Privacy policy sub-processor section; link Supabase DPA |
| **Consent must be freely given, specific, informed, evidenced** — a pre-ticked box or the current unlinked sentence does not qualify | RA 10173 §3(b) | §4 acceptance table + unchecked checkbox |
| **Minors**: no statutory age in RA 10173 itself, but NPC advisory treats under-18s' data as requiring parental consent | NPC Advisory 2017-01 | §5 minimum-age gate; §9 input |
| Consumer refund rights for **defective or undelivered** paid services cannot be waived by policy text | RA 7394 Title III | Constrains §7 once ADR-007 closes |
| Online contract formation and electronic records are valid; keep the acceptance record as evidence | RA 8792 | `policy_acceptances` table (§4) |
| Privacy policy must be in **English or Filipino**; English alone is acceptable | NPC rules §31 | English |

---

## 1. What we actually do today (the policies must describe this, not a wish)

### Personal data collected
| Data | Where | Source |
|---|---|---|
| Email, password hash | `auth.users` (Supabase) | registration |
| Google name / avatar / email | `auth.users` identities | Google OAuth |
| Display name, bio, photo, city/province, phone, skill/rating fields | `player_profiles` | onboarding / profile edit |
| Match results, ratings, rankings, head-to-head | `matches`, `ratings`, … | gameplay — **public by design** |
| Club membership, staff roles, event entries | club/event tables | product use |
| Notifications, follows, feed activity | social tables | product use |
| IP + user agent | Supabase auth logs, Vercel logs, Turnstile | infrastructure |

### Cookies set (all first-party, all strictly necessary)
| Cookie | Purpose | Lifetime |
|---|---|---|
| `sb-<ref>-auth-token` (+ chunks) | Supabase session | session/refresh |
| `account_mode` | player vs club account switcher (`useAccountMode.ts`) | persistent |
| `active_club_id` | which club the switcher is on | persistent |
| theme cookie (`useTheme.ts`) | light/dark, read on SSR | persistent |
| Cloudflare (`__cf_bm`, `cf_clearance` if proxied) | bot protection | short |

**No analytics, advertising, or tracking cookies exist.** Consequence: a cookie
*notice page* is required; a consent *banner* is not (strictly-necessary
exemption, both under NPC guidance and GDPR/ePrivacy). Do not ship a banner
until a non-essential cookie is added — see §6.

### Processors / sub-processors
Supabase (DB + auth, **Tokyo dev / Seoul prod** — cross-border), Vercel
(hosting, logs), Resend (transactional email), Cloudflare (Turnstile, edge),
Google (OAuth). Stripe and PayMongo are **not live** (webhooks return 501,
ADR-005) and must not be listed as active processors until they are.

### Money flows (why the refund policy is mostly TBD)
1. **Club subscriptions** — simulated zero-charge gateway, no paid plan on sale,
   prices unset (ADR-007 open). See the club-subscriptions plan.
2. **Tournament entry fees** — settlement shape undecided (ADR-006). The
   offering doc's stance is "platform never holds club funds", which if adopted
   makes entry-fee refunds the *club's* obligation and the platform's
   convenience fee a separate question.

### Rights the product cannot honour yet
RA 10173 §16 grants access, rectification, erasure/blocking, and data
portability. Today: rectification ✅ (profile edit); access ⚠️ (only via UI, no
export); **erasure ❌ (no delete-account endpoint)**; **portability ❌**.
A privacy policy that promises these before they exist is a false statement to
users and to the NPC. §5 puts the endpoints *before* the policy text.

---

## 2. Documents to produce

| Key | Route | Required now? | Notes |
|---|---|---|---|
| `terms` | `/legal/terms` | **Yes** — `register.vue:235` already claims it | Account rules, UGC (match results, photos), club/organiser responsibilities, rating integrity (fabricated results → sanctions), termination, liability, governing law |
| `privacy` | `/legal/privacy` | **Yes** | RA 10173 mandatory contents: identity of the PIC, purposes, lawful basis, recipients/sub-processors incl. cross-border, retention, rights + how to exercise, DPO contact, NPC complaint route |
| `cookies` | `/legal/cookies` | Yes (cheap) | Table from §1; statement that no consent banner is shown because none is needed |
| `refunds` | `/legal/refunds` | **Only once money moves** | Ship as a stub that says no paid product is on sale; expand when ADR-006/007 close |
| `community` | `/legal/community-guidelines` | Later | Conduct, harassment, fair play — can start as a section of Terms |

Each document carries `version` (date-based, e.g. `2026-09-12`), `effectiveAt`,
`requiresReacceptance`, and a change-log block at the bottom.

---

## 3. Where the text lives (no new library)

Nuxt Content is **not** installed and is not justified for five static pages.

```
apps/web/
  content/legal/            ← plain markdown, one file per policy
    terms.md
    privacy.md
    cookies.md
    refunds.md
  server/domains/legal/
    dto/legal.dto.ts        ← PolicyDto { key, title, version, effectiveAt, html }
    repositories/policy.repository.ts   ← reads content/legal at build time
    services/legal.service.ts           ← current version lookup, acceptance logic
  server/api/v1/legal/
    [key].get.ts            ← public, returns PolicyDto (mobile reads this too)
    acceptances.post.ts     ← authed, records acceptance
    acceptances/me.get.ts   ← authed, which versions this user has accepted
  pages/legal/[key].vue     ← SSR page, prose styling, ToC, "last updated"
  components/legal/PolicyFooterLinks.vue
```

Markdown → HTML: use `marked` **only if** it is already a transitive dependency;
otherwise keep the markdown as the editable source and hand-roll the pages as
`.vue`. Decide at implementation time; do not add a dependency for this alone.

Serving the policy through `/api/v1/legal/{key}` keeps Flutter on the same
contract instead of hard-coding legal text in the app binary.

---

## 4. Database — acceptance tracking

One Liquibase changeset, `057-policy-acceptances`:

```
policy_acceptances
  id            uuid pk
  user_id       uuid fk auth.users  not null
  policy_key    text not null          -- 'terms' | 'privacy' | ...
  version       text not null
  accepted_at   timestamptz not null default now()
  ip_hash       text null              -- sha256(ip + salt); never raw IP
  user_agent    text null
  created_at / updated_at
  unique (user_id, policy_key, version)
  index (user_id)
```

RLS: users `SELECT`/`INSERT` their own rows only; no `UPDATE`/`DELETE` for
anyone but service role. SuperAdmin reads via service role in the admin UI.

Why a table and not a column on `player_profiles`: the Terms will change, and
the question "which version did this user accept, and when" is the thing a
dispute turns on. A single column overwrites the history.

Acceptance is recorded **at registration** (the checkbox that `register.vue`'s
sentence implies but does not have — make it a real, unchecked-by-default
checkbox) and **re-prompted** when `currentVersion !== lastAcceptedVersion` for
a material change, via a blocking interstitial after login. Non-material edits
(typos) bump the version without re-prompting — `requiresReacceptance: false`
in the policy frontmatter.

---

## 5. Product work the Privacy Policy depends on (do these first)

| Backlog item | Layer | Why |
|---|---|---|
| **Delete account** — `DELETE /api/v1/players/me`. Service anonymises `player_profiles` (name → "Deleted player", clear photo/bio/phone/location), **keeps match rows** (other players' records and ratings depend on them — this is the legitimate-interest carve-out the policy must state), removes follows/notifications, revokes sessions, deletes `auth.users` via admin API. Settings UI with typed confirmation. | DB → Svc → Ctrl → UI | RA 10173 erasure right |
| **Export my data** — `GET /api/v1/players/me/export` → JSON of profile, matches, rating history, club memberships, acceptances. Synchronous, rate-limited (1/hour); no email job needed at this scale. | Svc → Ctrl → UI | Portability right |
| **Retention schedule** — document what is deleted when (Supabase auth logs, notifications, deleted-account residue with a 30-day grace). Implement only the ones that need code. | DevOps | Policy must state retention |
| **DPO mailbox** — `privacy@` or `dpo@` address and a named DPO. Required for NPC registration. | Ops | Mandatory content |
| **NPC registration** — register the DPO and processing systems; do it before public launch rather than after crossing the 1,000-subject threshold. | Ops | NPC Circular 2022-04 |
| **Breach runbook** — a section in `docs/07-SECURITY-ARCHITECTURE.md`: detection → contain → assess → notify NPC + users ≤72h → post-mortem. Template notification text kept with the policies. | DevOps/Security | 72-hour rule |
| Terms checkbox on `/register`, plus the Google-OAuth path (acceptance recorded on first `/onboarding` submit, since OAuth bypasses the form) | UI → Ctrl | Enforceability |
| Footer links on `default.vue` and `auth.vue` layouts; real links in the `register.vue` sentence | UI | Discoverability |
| Minors: minimum-age gate (`birth_date` is optional in the blueprint) or an explicit age attestation | UI + Terms | NPC treats minors' data as sensitive |

Everything in this table is standard product work and follows the normal
Database → DTO → Repo → Service → Controller → UI → Tests → RLS sequence.

---

## 6. Cookie consent — decision: **banner from day one** (Jeff, 2026-09-12)

Not legally required while only essential cookies exist, but shipped anyway
for trust and so the plumbing is already in place when analytics (docs/27)
lands. Because the banner exists, it must be honest: it must not claim to
block anything that isn't there, and it must actually gate anything that is
added later.

### Behaviour
- First visit (no `cookie_consent` cookie): a bottom bar on every page, both
  layouts, above the mobile tab bar. Two equal-weight buttons —
  **Essential only** and **Accept all** — plus a link to `/legal/cookies`.
  No "×" that silently means accept; dismissal without choice keeps the bar.
- Choice stored in a first-party `cookie_consent` cookie: `essential` | `all`,
  with a `v` (consent version) and `at` timestamp, 12-month expiry, `SameSite=Lax`.
- The bar never re-appears once a choice is stored, unless the consent
  version bumps (a new non-essential category was added).
- Choice is changeable any time from `/legal/cookies` ("Change your choice")
  and from `/settings` → Privacy.
- No consent → treated as `essential`. Analytics never boots before a choice.
- Logged-out and logged-in visitors are treated the same; the cookie is
  per-browser, not per-account (consent attaches to the device that sets the
  cookies).

### Implementation
```
composables/useConsent.ts        ← reads/writes cookie_consent via useCookie (SSR-safe,
                                    same pattern as useTheme); exposes
                                    { choice, hasChosen, accept(level), categories }
components/legal/CookieBanner.vue ← rendered from both layouts; v-if="!hasChosen";
                                    role="dialog" aria-live, focusable, Esc does NOT dismiss
plugins/analytics.client.ts      ← future; boots only when useConsent().choice === 'all'
                                    and re-checks on change
```
- Categories are a typed const: `essential` (always on, shown as locked) and
  `analytics` (off until used). Add categories here, never inline in the banner.
- The `/legal/cookies` page renders its table from the same const, so the
  page and the banner cannot drift.
- No third-party consent library — the whole thing is one cookie and one
  composable, matching how `account_mode` and the theme already work.
- Playwright: bar shows on first visit; "Essential only" hides it and sets
  the cookie; reload does not re-show; `/legal/cookies` can flip the choice;
  `public-audit.spec.ts` runs with a pre-set cookie so the bar doesn't sit on
  top of every screenshot.

### Consent versioning
`CONSENT_VERSION` lives beside the categories. Adding a non-essential category
bumps it, which re-shows the bar with the new category explained. Bumping it
for copy edits is not allowed — the bar should be rare.

---

## 7. Refund policy — what can and cannot be written today

Can be written now (true statements):
- No paid plan is currently on sale; the platform does not charge players.
- Tournament entry fees are set, collected and refunded by the **organising
  club**; the platform is not a party to that transaction and does not hold
  the funds. (Matches the docs/36 stance and the per-category withdraw note in
  PROJECT-STATUS: "any refund is theirs to make".)
- Withdrawal from a pending entry is self-service; after confirmation it is
  between player and organiser.

**Must not be written until decided** (CLAUDE.md §7 — do not invent rules):
| Open question | Owner | Blocks |
|---|---|---|
| Subscription refund window (none / 7-day / pro-rata) | ADR-007 | subscriptions section |
| Is the platform convenience fee refundable when a club refunds an entry? | ADR-006 | entry-fee section |
| Who refunds if a *verified* club cancels an event — club only, or platform-mediated? | ADR-006 | entry-fee section |
| Chargeback handling and who absorbs the gateway fee | ADR-006 | entry-fee section |

The refunds page therefore ships as a **stub with the true statements above**
and an `<!-- ADR-006 / ADR-007 -->` marker where the rest goes.

---

## 8. Execution order

1. `057-policy-acceptances` changeset + RLS (review before code).
2. Legal domain: DTO, repository (markdown loader), service, `GET /api/v1/legal/{key}`, acceptance endpoints. Unit tests for version comparison and re-acceptance logic.
3. `pages/legal/[key].vue`, footer links, register checkbox, OAuth-path acceptance on onboarding, re-acceptance interstitial.
3b. `useConsent` + `CookieBanner` in both layouts, choice control on `/legal/cookies` and `/settings` (§6). Independent of steps 1–2; can go first.
4. Draft the four markdown documents from §1's facts — engineer's draft, clearly marked *DRAFT — pending legal review* in the page header until Jeff removes the flag.
5. Delete-account + export endpoints and settings UI (§5) — **before** the privacy policy's rights section is un-flagged.
6. Playwright: add `/legal/*` to `public-audit.spec.ts`; authed test that a stale acceptance triggers the interstitial; delete-account journey.
7. Security/RLS review; ADR-008 "Legal policy versioning and acceptance"; update `PROJECT-STATUS.md`, `10-IMPLEMENTATION-BACKLOG.md`, `30-UI-FUNCTIONALITY-MAP.md`.
8. Lawyer review → remove DRAFT flag → bump version → users re-accept.

---

## 9. Inputs needed from Jeff before step 4 can be finished

- Legal entity name and address that appears as the Personal Information Controller.
- DPO name and contact mailbox.
- Minimum age (13 with parental consent, 16, or 18) — decides whether `birth_date` becomes required.
- Governing law / venue clause (city for disputes).
- Whether to state the Tokyo/Seoul hosting explicitly or generically ("servers in the Asia-Pacific region").
- Whether Community Guidelines are a separate page now or a Terms section.

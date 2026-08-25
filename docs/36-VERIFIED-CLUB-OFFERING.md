# What to Offer Verified Clubs

Written after the club-limit work (Liquibase 034–035, `assertWithinClubLimits`).
This is a **proposal**, not an implemented spec — prices in particular are
placeholders. Nothing here is a business rule until the backlog moves it.

---

## The one thing worth pricing on

**Collecting entry fees online.**

Everything else on the list below is nice. Fee collection is the only item that
pays for itself for the club, and it happens to be the one that genuinely
*requires* verification rather than merely being gated behind it — because money
is moving to a real bank account owned by a real organisation, and the platform
has to know who that is.

That alignment is the whole argument. A verification tier is resented when it
withholds features that have no reason to be withheld. It is accepted when the
thing behind the gate is the thing the gate exists for.

The club's arithmetic is simple: a weekend with 48 entries at ₱500 is ₱24,000
that currently arrives as cash in an envelope, counted by hand at a desk, with
no record of who paid. Charging for the tooling that removes that is an easy
conversation. Charging for a badge is not.

---

## The tiers

### Unverified — free

Already enforced in `EventService.assertWithinClubLimits`:

- **1 live tournament** and **1 live open play** at a time
- **1 draft**
- No online fee collection — cash at the door
- Standard listing in search and the feed

The limits are deliberately enough to run a real event. A club should be able to
try the platform properly before being asked for anything; what they cannot do
is use it as unlimited free listing space.

### Verified — paid

**Money**
- Collect entry fees online, direct to the club's own PayMongo account. The
  platform never holds club funds; it takes only the convenience fee.
  *(Settlement shape is ADR-006 and is not decided.)*
- Refunds and withdrawal handling through the platform rather than by
  negotiation
- A revenue view per event: what was collected, what is outstanding, who has
  not paid

**Scale**
- Unlimited drafts and concurrent live events
- Multiple categories per tournament with independent capacity — already built,
  and the thing an unverified club hits first
- Club staff roles (`OWNER` / `ADMIN` / `MODERATOR`) for registration review, so
  the entry queue is not one person's job

**Standing**
- Verified badge, and priority placement in search and the feed
- A club page with cover art and sponsor slots
- Announcements to followers

**Records**
- Exportable entrant lists and results (CSV) — the thing organisers currently
  rebuild by hand in a spreadsheet
- Attendance history across events

**The strongest hook: rated events.**
Results from a verified club's tournaments move the national ranking. This is
worth more than everything above put together, because it changes what entering
the event *means* for a player — and therefore how many enter. It is also the
item with the clearest integrity argument for restricting it: a rating system is
only as trustworthy as the weakest event feeding it, so requiring a verified
organisation behind rated results protects the ladder rather than merely
upselling.

---

## Sequencing

1. **Now, free:** the limits above, which are live.
2. **Next, still free:** exports and the club page. Cheap to build, immediately
   useful, and they make verification feel like a place worth getting to.
3. **On payments going live:** fee collection becomes the paid tier. Not before
   — a paid tier whose headline feature is switched off is a refund queue.
4. **Once rating is settled:** rated events. This depends on the rating
   algorithm decision that is still open (`CLAUDE.md` §7), so it cannot be
   promised until that is closed.

---

## What NOT to put behind the gate

Worth stating, because each of these is tempting and each would cost more in
goodwill than it earns:

- **Basic event creation.** A club that cannot run one event cannot evaluate the
  platform.
- **Player-facing features.** Entrants are not the customer here. Making a
  player's experience worse because their club has not paid punishes the wrong
  person and thins the field for everyone.
- **The bracket generator, results, or standings.** These are what an event *is*.
  Charging for them makes the free tier a demo rather than a product.
- **Rating for individual matches.** Only *event* rating should depend on
  verification; a casual match between two players has nothing to do with a
  club's paperwork.

---

## Open questions

- **Price.** Nothing here is costed. A per-event fee, a subscription, or a share
  of the convenience fee are all plausible and they imply different behaviour
  from clubs.
- **Existing clubs.** Anything currently running that would breach the new
  limits needs either grandfathering or a migration window. The limits count
  only `published`/`active` events, so a club with several completed ones is
  unaffected — but one mid-season with two live events is.
- **Verification throughput.** The gate is only fair if approval is quick. The
  flow exists (`club-verification.service.ts`, `/admin/clubs/verification`) but
  nothing measures how long it takes, and a queue nobody works turns a tier into
  a wall.

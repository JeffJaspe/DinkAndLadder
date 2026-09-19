/**
 * Club tiers, as the client reads them.
 *
 * The server holds the rule per action (ClubService, event.service,
 * assertCanRunEvent); these are the two groupings every page was re-typing by
 * hand, one of them inconsistently: the account switcher only let OWNER and
 * ADMIN into club mode, while the server lets a MODERATOR run an event — which
 * requires club mode. A moderator was therefore allowed on paper and locked out
 * in practice.
 *
 *   staff  — OWNER, ADMIN, MODERATOR: run events, review join requests.
 *   admin  — OWNER, ADMIN: create events, edit the club, billing.
 */
export const CLUB_STAFF_ROLES = ['OWNER', 'ADMIN', 'MODERATOR'] as const
export const CLUB_ADMIN_ROLES = ['OWNER', 'ADMIN'] as const

export function isClubStaffRole(role: string | null | undefined): boolean {
  return !!role && (CLUB_STAFF_ROLES as readonly string[]).includes(role)
}

export function isClubAdminRole(role: string | null | undefined): boolean {
  return !!role && (CLUB_ADMIN_ROLES as readonly string[]).includes(role)
}

export const CLUB_ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MODERATOR: 'Moderator',
  MEMBER: 'Member'
}

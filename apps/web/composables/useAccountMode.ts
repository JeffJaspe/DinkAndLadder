export type AccountMode = 'player' | 'club'

/**
 * Cookie-backed (not plain useState) so the mode survives a full page reload — a
 * mode switch is a deliberate, session-spanning choice, not per-navigation UI state.
 * No DB column backs this: account_type is not persisted anywhere in the schema (see
 * onboarding.post.ts — both the player and club onboarding paths create the same
 * player_profiles row), so this is purely a client-side navigation concept.
 */
export function useAccountMode() {
  const accountMode = useCookie<AccountMode>('account_mode', { default: () => 'player' })
  const activeClubId = useCookie<string | null>('active_club_id', { default: () => null })

  function switchToClub(clubId: string) {
    accountMode.value = 'club'
    activeClubId.value = clubId
  }

  function switchToPlayer() {
    accountMode.value = 'player'
    activeClubId.value = null
  }

  return { accountMode, activeClubId, switchToClub, switchToPlayer }
}

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

  /**
   * The organiser half of the product lives behind this.
   *
   * Owning an event is necessary to manage it but not sufficient: management
   * only appears in club mode. Player mode is deliberately read-and-register
   * only — register, see who else registered, follow the bracket and matches —
   * even for the person who created the event. Anything that creates, edits,
   * publishes, deletes or runs an event belongs to the club they are acting as,
   * so the answer to "may I change this?" is always ownership AND club mode,
   * never ownership alone.
   */
  const isClubMode = computed(() => accountMode.value === 'club')
  const isPlayerMode = computed(() => accountMode.value === 'player')

  function switchToClub(clubId: string) {
    accountMode.value = 'club'
    activeClubId.value = clubId
  }

  function switchToPlayer() {
    accountMode.value = 'player'
    activeClubId.value = null
  }

  return { accountMode, activeClubId, isClubMode, isPlayerMode, switchToClub, switchToPlayer }
}

import type { MyClubMembershipDto } from '~/server/domains/club/dto/club-membership.dto'
import type { EventCoOrganizerDto } from '~/server/domains/event/dto/event-co-organizer.dto'
import { isClubStaffRole } from '~/utils/club-roles'

/**
 * Who may run an event, decided once for every organiser screen.
 *
 * The server admits three parties (`assertCanRunEvent`): the creator, an
 * appointed co-organiser, and active staff — owner, admin, moderator — of the
 * hosting club. Each page used to re-derive its own subset of that rule, and
 * two of them recognised only the creator. A club admin in club mode, on a
 * tournament a colleague had set up, therefore got the player view with no
 * scoring controls while the API would have accepted every write. This is the
 * rule in one place, with the club-mode condition the product applies to it.
 *
 * Club mode gates the creator and the staff — running an event is club work,
 * and an owner browsing as a player is a participant. A co-organiser is
 * exempt: they were appointed as a person and may have no club mode to enter.
 */
export function useEventRunner(
  eventId: MaybeRefOrGetter<string>,
  event: Ref<{ created_by_player_id: string | null; club_id: string | null } | null>,
  myProfile: Ref<{ id: string } | null>,
  options: {
    /** Supply when the page already holds the co-organiser list. */
    coOrganizers?: Ref<EventCoOrganizerDto[]>
  } = {}
) {
  const user = useSupabaseUser()
  const { isClubMode, switchToClub } = useAccountMode()

  const ownCoOrganizers = options.coOrganizers
    ? null
    : useFetch<{ data: EventCoOrganizerDto[] }>(
        () => `/api/v1/events/${toValue(eventId)}/co-organizers`,
        { server: false, ignoreResponseError: true, default: () => ({ data: [] }) }
      )
  const coOrganizers = computed(
    () => options.coOrganizers?.value ?? ownCoOrganizers?.data.value?.data ?? []
  )

  // Signed-in only and client-only: this decides which controls render,
  // never what the public page says, so the server render does not wait.
  const { data: myClubsData } = useFetch<{ items: MyClubMembershipDto[] }>('/api/v1/clubs/mine', {
    server: false,
    immediate: !!user.value,
    ignoreResponseError: true,
    default: () => ({ items: [] as MyClubMembershipDto[] })
  })

  /** The person who made the event. The only one who may delete it or change its co-organisers. */
  const isCreator = computed(
    () =>
      !!myProfile.value && !!event.value && event.value.created_by_player_id === myProfile.value.id
  )

  const isCoOrganizer = computed(
    () => !!myProfile.value && coOrganizers.value.some((c) => c.player_id === myProfile.value!.id)
  )

  const isClubStaff = computed(
    () =>
      !!event.value?.club_id &&
      (myClubsData.value?.items ?? []).some(
        (m) =>
          m.club_id === event.value?.club_id && m.status === 'active' && isClubStaffRole(m.role)
      )
  )

  /** Any of the three. Almost nothing should branch on this directly — use `canManage`. */
  const isOrganizer = computed(() => isCreator.value || isCoOrganizer.value || isClubStaff.value)

  /** The gate every organiser control hangs off. */
  const canManage = computed(
    () => ((isCreator.value || isClubStaff.value) && isClubMode.value) || isCoOrganizer.value
  )

  /** Someone who could run this event, looking at it without the controls to. */
  const lockedOut = computed(
    () => (isCreator.value || isClubStaff.value) && !canManage.value && !!event.value?.club_id
  )

  function resumeAsClub() {
    if (event.value?.club_id) switchToClub(event.value.club_id)
  }

  return { isCreator, isCoOrganizer, isClubStaff, isOrganizer, canManage, lockedOut, resumeAsClub }
}

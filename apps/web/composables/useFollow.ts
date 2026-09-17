/**
 * Follow state for one player, and the two actions that change it.
 *
 * Follow was built end to end and never reachable: the endpoints, the
 * `/following` page and the `social_butterfly` achievement all existed, but no
 * screen in the product could create a follow — the profile's Follow button had
 * been replaced by a team-up control. So the feature shipped, and nobody in the
 * product's history has ever followed anybody. This composable is what makes it
 * real, and it is shared so every surface that offers Follow behaves the same.
 *
 * Both directions are tracked, not just yours, because "Follow" and "Follow
 * back" are different invitations and only the second one is true when they
 * already follow you. Mutual is what lets one of you enter the other into a
 * session (066), so it is worth naming on screen rather than leaving people to
 * infer it.
 */
export interface FollowState {
  /** You follow them. */
  following: boolean
  /** They follow you. */
  follows_you: boolean
}

export function useFollow(playerId: Ref<string | undefined> | (() => string | undefined)) {
  const id = computed(() => (typeof playerId === 'function' ? playerId() : playerId.value))

  const state = ref<FollowState>({ following: false, follows_you: false })
  const pending = ref(false)
  const error = ref('')

  const { data, refresh } = useFetch<{ data: FollowState }>(
    () => `/api/v1/players/${id.value}/follow-state`,
    {
      // Client-only: this is a per-reader fact on an otherwise public page, and
      // rendering it on the server would make the profile uncacheable for the
      // sake of one button.
      server: false,
      immediate: !!id.value,
      default: () => ({ data: { following: false, follows_you: false } })
    }
  )

  watch(
    data,
    (value) => {
      if (value?.data) state.value = value.data
    },
    { immediate: true }
  )

  const isMutual = computed(() => state.value.following && state.value.follows_you)

  /**
   * What the button says.
   *
   * "Follow back" when they got there first — it names the thing you are
   * actually doing and is a stronger prompt than a bare "Follow".
   */
  const label = computed(() => {
    if (state.value.following) return isMutual.value ? 'Following each other' : 'Following'
    return state.value.follows_you ? 'Follow back' : 'Follow'
  })

  async function toggle() {
    if (!id.value || pending.value) return
    pending.value = true
    error.value = ''

    const wasFollowing = state.value.following
    // Optimistic: the round trip is short and the button is the whole
    // interaction, so waiting on it to change reads as a dropped tap.
    state.value = { ...state.value, following: !wasFollowing }

    try {
      await $fetch(`/api/v1/players/${id.value}/follow`, {
        method: wasFollowing ? 'DELETE' : 'POST'
      })
      await refresh()
    } catch (err) {
      state.value = { ...state.value, following: wasFollowing }
      error.value = apiErrorMessage(err, wasFollowing ? 'Could not unfollow.' : 'Could not follow.')
    } finally {
      pending.value = false
    }
  }

  return { state, isMutual, label, pending, error, toggle, refresh }
}

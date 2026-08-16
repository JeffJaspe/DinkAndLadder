<script setup lang="ts">
interface FollowRelation {
  player_id: string
  display_name: string
  created_at: string
}

const activeTab = ref<'following' | 'followers'>('following')

const { data: followingData, status: followingStatus, refresh: refreshFollowing } = await useFetch<{ following: FollowRelation[] }>('/api/v1/players/me/following')
const { data: followersData, status: followersStatus, refresh: refreshFollowers } = await useFetch<{ followers: FollowRelation[] }>('/api/v1/players/me/followers')
const { data: statsData } = await useFetch<{ following_count: number; followers_count: number }>('/api/v1/players/me/social-stats')

const following = computed(() => followingData.value?.following ?? [])
const followers = computed(() => followersData.value?.followers ?? [])
const stats = computed(() => statsData.value ?? { following_count: 0, followers_count: 0 })

const currentList = computed(() => activeTab.value === 'following' ? following.value : followers.value)
const currentStatus = computed(() => activeTab.value === 'following' ? followingStatus.value : followersStatus.value)

async function unfollow(playerId: string) {
  await $fetch(`/api/v1/players/${playerId}/follow`, { method: 'DELETE' })
  refreshFollowing()
}
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <div class="mx-auto max-w-2xl">
      <!-- Header -->
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-white">Social</h1>
        <p class="mt-1 text-sm text-[#6B7B75]">Manage your connections</p>
      </div>

      <!-- Tabs -->
      <div class="mb-6 flex gap-1 rounded-xl bg-[#1E2E2A] p-1">
        <button
          class="flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors"
          :class="activeTab === 'following'
            ? 'bg-[#4DB175] text-white'
            : 'text-[#A6ABA7] hover:text-white'"
          @click="activeTab = 'following'"
        >
          Following ({{ stats.following_count }})
        </button>
        <button
          class="flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors"
          :class="activeTab === 'followers'
            ? 'bg-[#4DB175] text-white'
            : 'text-[#A6ABA7] hover:text-white'"
          @click="activeTab = 'followers'"
        >
          Followers ({{ stats.followers_count }})
        </button>
      </div>

      <!-- Loading -->
      <div v-if="currentStatus === 'pending'" class="space-y-3">
        <div v-for="i in 5" :key="i" class="h-16 animate-pulse rounded-xl bg-[#1E2E2A]" />
      </div>

      <!-- Empty -->
      <div v-else-if="currentList.length === 0" class="rounded-xl bg-[#1E2E2A] p-12 text-center">
        <p class="text-4xl">{{ activeTab === 'following' ? '👤' : '🤝' }}</p>
        <h3 class="mt-4 text-lg font-semibold text-white">
          {{ activeTab === 'following' ? 'Not following anyone' : 'No followers yet' }}
        </h3>
        <p class="mt-2 text-sm text-[#6B7B75]">
          {{ activeTab === 'following'
            ? 'Find players to follow and see their activity'
            : 'Share your profile to get followers' }}
        </p>
        <NuxtLink
          v-if="activeTab === 'following'"
          to="/players"
          class="mt-4 inline-block rounded-lg bg-[#4DB175] px-4 py-2 text-white"
        >
          Find Players
        </NuxtLink>
      </div>

      <!-- List -->
      <div v-else class="space-y-2">
        <div
          v-for="relation in currentList"
          :key="relation.player_id"
          class="flex items-center justify-between rounded-xl bg-[#1E2E2A] p-4"
        >
          <NuxtLink
            :to="`/players/${relation.player_id}`"
            class="flex items-center gap-3"
          >
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-[#2E4540] text-sm font-bold text-[#A6ABA7]">
              {{ relation.display_name.charAt(0).toUpperCase() }}
            </div>
            <span class="font-medium text-white hover:text-[#4DB175]">
              {{ relation.display_name }}
            </span>
          </NuxtLink>
          <button
            v-if="activeTab === 'following'"
            class="rounded-lg border border-[#3A5750] px-4 py-1.5 text-sm font-medium text-[#A6ABA7] hover:border-red-400 hover:text-red-400"
            @click="unfollow(relation.player_id)"
          >
            Unfollow
          </button>
        </div>
      </div>

      <!-- Find More -->
      <div class="mt-8 text-center">
        <NuxtLink to="/players" class="text-sm text-[#4DB175] hover:underline">
          Find more players
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ClubDto } from '~/server/domains/club/dto/club.dto'

const form = reactive({
  name: '',
  slug: '',
  description: '',
  province: '',
  city: '',
  visibility: 'public' as 'public' | 'private'
})

const saving = ref(false)
const errorMessage = ref('')

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function handleNameInput() {
  if (!form.slug) form.slug = slugify(form.name)
}

async function handleCreate() {
  errorMessage.value = ''
  saving.value = true
  try {
    const response = await $fetch<{ data: ClubDto }>('/api/v1/clubs', {
      method: 'POST',
      body: {
        name: form.name,
        slug: form.slug,
        description: form.description || null,
        province: form.province || null,
        city: form.city || null,
        visibility: form.visibility
      }
    })
    await navigateTo(`/clubs/${response.data.id}`)
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    errorMessage.value = fetchError.data?.message ?? 'Could not create the club.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="mx-auto max-w-xl px-4 py-10">
    <h1 class="text-2xl font-semibold">Create a club</h1>
    <form class="mt-6 flex flex-col gap-3" @submit.prevent="handleCreate">
      <label class="flex flex-col gap-1 text-sm">
        Name
        <input
          v-model="form.name"
          required
          class="rounded border px-3 py-2"
          @input="handleNameInput"
        />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Slug
        <input v-model="form.slug" required class="rounded border px-3 py-2" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Description
        <textarea v-model="form.description" rows="3" class="rounded border px-3 py-2" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Province
        <input v-model="form.province" class="rounded border px-3 py-2" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        City
        <input v-model="form.city" class="rounded border px-3 py-2" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Visibility
        <select v-model="form.visibility" class="rounded border px-3 py-2">
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
      </label>
      <p v-if="errorMessage" role="alert" class="text-sm text-red-600">{{ errorMessage }}</p>
      <button
        type="submit"
        :disabled="saving"
        class="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
      >
        {{ saving ? 'Creating…' : 'Create club' }}
      </button>
    </form>
    <NuxtLink to="/dashboard" class="mt-4 inline-block text-sm underline"
      >Back to dashboard</NuxtLink
    >
  </main>
</template>

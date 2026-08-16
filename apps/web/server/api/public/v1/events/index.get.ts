import { serverSupabaseClient } from '#supabase/server'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import { toEventDto } from '~/server/domains/event/dto/event.dto'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  const limit = Math.min(parseInt(query.limit as string) || 20, 50)
  const offset = parseInt(query.offset as string) || 0
  const status = (query.status as string) || 'published'

  const client = await serverSupabaseClient(event)
  const repo = createEventRepository(client)

  const events = await repo.search({
    status: status as 'published',
    visibility: 'public',
    limit,
    offset
  })

  return { events: events.map(toEventDto) }
})

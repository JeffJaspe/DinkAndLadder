import { apiError } from '~/server/utils/api-error'
import { listCoOrganizerDtos } from '~/server/utils/co-organizers'

/** Who is running this event alongside its creator. Readable by anyone signed in. */
export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) throw apiError(400, 'VALIDATION_ERROR', 'eventId is required.')
  return { data: await listCoOrganizerDtos(event, eventId) }
})

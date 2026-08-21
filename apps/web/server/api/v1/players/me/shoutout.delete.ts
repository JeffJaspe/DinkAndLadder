import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async () => {
  throw apiError(
    400,
    'DELETION_NOT_ALLOWED',
    'Shout-outs cannot be deleted. They expire automatically after 24 hours, or you can edit your message.'
  )
})

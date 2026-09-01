import { serverSupabaseServiceRole } from '#supabase/server'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import { createPlatformAdminService } from '~/server/domains/platform/services/platform-admin.service'
import { apiError } from '~/server/utils/api-error'
import type { FeeType } from '~/utils/convenience-fee'
import { getOptionalUser } from '~/server/utils/optional-user'

interface RuleBody {
  id?: string
  fee_type?: FeeType
  value?: number
  min_amount_cents?: number
  max_amount_cents?: number | null
  min_fee_cents?: number | null
  max_fee_cents?: number | null
  is_active?: boolean
  sort_order?: number
}

/**
 * Replace the whole convenience-fee ladder in one call.
 *
 * A PUT of the entire set rather than per-row CRUD, because a fee ladder is
 * only meaningful as a whole: the bands have to tile the range, and an admin
 * editing one band's upper bound almost always has to move the next band's
 * lower bound with it. Sending them separately would leave a gap live between
 * the two requests, and an amount landing in that gap would be charged nothing.
 *
 * Service role: `platform_fee_rules` grants SELECT to everyone (so the
 * registration screen can quote a total) and INSERT/UPDATE to nobody, the same
 * shape platform_config uses.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to change platform settings.')
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const admin = createPlatformAdminService(createPlatformConfigRepository(serviceClient))
  if (!(await admin.isSuperAdmin(claims.sub))) {
    throw apiError(403, 'FORBIDDEN', 'Only the platform administrator can set fees.')
  }

  const body = await readBody<{ rules?: RuleBody[] }>(event)
  if (!Array.isArray(body?.rules)) {
    throw apiError(400, 'VALIDATION_ERROR', 'A rules array is required.')
  }

  // Validated here rather than trusted to the CHECK constraints, so a bad
  // ladder comes back as a sentence instead of a constraint violation.
  const rules = body.rules.map((rule, index) => {
    if (rule.fee_type !== 'percentage' && rule.fee_type !== 'fixed') {
      throw apiError(
        400,
        'VALIDATION_ERROR',
        `Rule ${index + 1}: type must be percentage or fixed.`
      )
    }
    if (typeof rule.value !== 'number' || rule.value < 0) {
      throw apiError(400, 'VALIDATION_ERROR', `Rule ${index + 1}: value must be zero or more.`)
    }
    const min = rule.min_amount_cents ?? 0
    const max = rule.max_amount_cents ?? null
    if (max !== null && max < min) {
      throw apiError(400, 'VALIDATION_ERROR', `Rule ${index + 1}: the band ends before it starts.`)
    }
    // A percentage with no cap on an open-ended band can bill any amount at
    // all; that is a mistake worth catching before it reaches a payer.
    if (rule.fee_type === 'percentage' && max === null && (rule.max_fee_cents ?? null) === null) {
      throw apiError(
        400,
        'VALIDATION_ERROR',
        `Rule ${index + 1}: an open-ended percentage band needs a maximum fee.`
      )
    }

    return {
      fee_type: rule.fee_type,
      value: rule.value,
      min_amount_cents: min,
      max_amount_cents: max,
      min_fee_cents: rule.min_fee_cents ?? null,
      max_fee_cents: rule.max_fee_cents ?? null,
      is_active: rule.is_active ?? true,
      sort_order: rule.sort_order ?? index + 1
    }
  })

  // Replace wholesale. No transaction is available through PostgREST, so the
  // window between delete and insert is real but tiny, and the failure mode is
  // "no fee charged" rather than "wrong fee charged" — the safer of the two.
  const { error: deleteError } = await serviceClient
    .from('platform_fee_rules')
    .delete()
    .not('id', 'is', null)
  if (deleteError) {
    console.error('[PUT /api/v1/admin/fee-rules] clear failed:', deleteError)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not replace the fee rules.')
  }

  if (!rules.length) return { data: [] }

  const { data, error } = await serviceClient.from('platform_fee_rules').insert(rules).select()
  if (error) {
    console.error('[PUT /api/v1/admin/fee-rules] insert failed:', error)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not save the fee rules.')
  }

  return { data: data ?? [], request_id: crypto.randomUUID() }
})

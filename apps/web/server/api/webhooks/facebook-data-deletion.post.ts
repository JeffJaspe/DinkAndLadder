import crypto from 'crypto'
import { serverSupabaseServiceRole } from '#supabase/server'
import { apiError } from '~/server/utils/api-error'

interface FacebookDeletionRequest {
  user_id: string
  signed_request: string
}

interface ParsedSignedRequest {
  algorithm: string
  issued_at: number
  user_id: string
}

function base64UrlDecode(input: string): string {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = base64.length % 4
  if (pad) base64 += '='.repeat(4 - pad)
  return Buffer.from(base64, 'base64').toString('utf-8')
}

function parseSignedRequest(
  signedRequest: string,
  appSecret: string
): ParsedSignedRequest | null {
  const parts = signedRequest.split('.')
  if (parts.length !== 2) return null

  const [encodedSig, payload] = parts
  const sig = Buffer.from(base64UrlDecode(encodedSig), 'latin1')
  const data = JSON.parse(base64UrlDecode(payload)) as ParsedSignedRequest

  if (data.algorithm?.toUpperCase() !== 'HMAC-SHA256') return null

  const expectedSig = crypto
    .createHmac('sha256', appSecret)
    .update(payload)
    .digest()

  if (!crypto.timingSafeEqual(sig, expectedSig)) return null

  return data
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const facebookAppSecret = config.facebookAppSecret

  if (!facebookAppSecret) {
    throw apiError(500, 'CONFIG_ERROR', 'Facebook app secret not configured')
  }

  const body = await readBody<FacebookDeletionRequest>(event)

  if (!body?.signed_request) {
    throw apiError(400, 'INVALID_REQUEST', 'Missing signed_request parameter')
  }

  const parsedRequest = parseSignedRequest(body.signed_request, facebookAppSecret)
  if (!parsedRequest) {
    throw apiError(400, 'INVALID_SIGNATURE', 'Invalid signed request')
  }

  const facebookUserId = parsedRequest.user_id

  const supabase = serverSupabaseServiceRole(event)
  const { data: users } = await supabase.auth.admin.listUsers()

  const userToDelete = users?.users?.find((u) =>
    u.identities?.some(
      (identity) => identity.provider === 'facebook' && identity.id === facebookUserId
    )
  )

  const confirmationCode = crypto.randomBytes(16).toString('hex')

  if (userToDelete) {
    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('auth_id', userToDelete.id)
      .single()

    if (player) {
      await supabase.from('players').update({ deleted_at: new Date().toISOString() }).eq('id', player.id)
    }

    await supabase.auth.admin.deleteUser(userToDelete.id)
  }

  const siteUrl = config.public.siteUrl || 'https://dinkandladder.com'
  const statusUrl = `${siteUrl}/data-deletion-status?code=${confirmationCode}`

  return {
    url: statusUrl,
    confirmation_code: confirmationCode
  }
})

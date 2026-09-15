import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { readFileSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Programmatic sign-in for the authenticated e2e suite.
 *
 * Login/register go through Cloudflare Turnstile, so the form cannot be driven
 * by a headless browser against the real site key. Instead this mints a session
 * the way the app's own client would: `@supabase/ssr` with a captured cookie
 * jar, so the browser context receives exactly the chunked
 * `sb-<ref>-auth-token` cookies the Nuxt module reads back on the SSR pass.
 *
 * Accounts are the two long-lived dev-project test users. Their passwords are
 * deliberately not persisted anywhere; each run sets a fresh throwaway through
 * the Admin API — the established practice for *these* accounts only.
 *
 * Refuses to run against anything but the dev project ref.
 */

export const DEV_PROJECT_REF = 'ycwgksyqvkoshdojujkz'

export const TEST_ACCOUNTS = {
  owner: 'claude-test-owner@example.com',
  member: 'claude-test-member@example.com'
} as const

export type Role = keyof typeof TEST_ACCOUNTS

interface Env {
  url: string
  anonKey: string
  secretKey: string
}

export function loadEnv(): Env {
  const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
  const get = (k: string) =>
    process.env[k] ??
    raw
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${k}=`))
      ?.slice(k.length + 1)
      .trim()
  const url = get('NUXT_PUBLIC_SUPABASE_URL')
  const anonKey = get('NUXT_PUBLIC_SUPABASE_KEY')
  const secretKey = get('NUXT_SUPABASE_SECRET_KEY')
  if (!url || !anonKey || !secretKey) throw new Error('Supabase env is incomplete')
  const ref = new URL(url).hostname.split('.')[0]
  if (ref !== DEV_PROJECT_REF) {
    throw new Error(
      `Refusing to seed e2e sessions against project "${ref}" (dev is ${DEV_PROJECT_REF})`
    )
  }
  return { url, anonKey, secretKey }
}

interface AdminUser {
  id: string
  email?: string
}

/** The Admin API occasionally answers 502/504; one retry is enough in practice. */
async function fetchWithRetry(input: string, init: RequestInit, attempts = 3): Promise<Response> {
  let last: Response | undefined
  for (let i = 0; i < attempts; i++) {
    last = await fetch(input, init)
    if (last.status < 500) return last
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)))
  }
  return last!
}

async function findUserByEmail(env: Env, email: string): Promise<AdminUser> {
  // GoTrue's ?email= filter is unreliable on this version — it can return the
  // whole list. Always filter client-side and insist on exactly one match.
  const res = await fetchWithRetry(`${env.url}/auth/v1/admin/users?per_page=1000`, {
    headers: { apikey: env.secretKey, Authorization: `Bearer ${env.secretKey}` }
  })
  if (!res.ok) throw new Error(`admin list users failed: ${res.status} ${await res.text()}`)
  const body = (await res.json()) as { users: AdminUser[] }
  const matches = body.users.filter((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (matches.length !== 1) {
    throw new Error(`expected exactly one user for ${email}, found ${matches.length}`)
  }
  return matches[0]
}

async function setPassword(env: Env, userId: string, password: string) {
  const res = await fetchWithRetry(`${env.url}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: {
      apikey: env.secretKey,
      Authorization: `Bearer ${env.secretKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ password, email_confirm: true })
  })
  if (!res.ok) throw new Error(`admin set password failed: ${res.status} ${await res.text()}`)
}

/**
 * Strips any two-factor state a previous run left behind. The MFA journey
 * (authed/mfa.spec.ts) enrols and then unenrols the account; if it dies in
 * between, the next seeded session would be aal1 on an enrolled account and
 * the API gate would refuse every request in every spec. Factors live in
 * Supabase (Admin API); the app's own flag and recovery codes live in our
 * tables (PostgREST with the service key, which bypasses RLS).
 */
async function clearMfa(env: Env, userId: string) {
  const auth = { apikey: env.secretKey, Authorization: `Bearer ${env.secretKey}` }

  const listed = await fetchWithRetry(`${env.url}/auth/v1/admin/users/${userId}/factors`, {
    headers: auth
  })
  if (listed.ok) {
    const factors = (await listed.json()) as { id: string }[]
    for (const factor of factors) {
      await fetchWithRetry(`${env.url}/auth/v1/admin/users/${userId}/factors/${factor.id}`, {
        method: 'DELETE',
        headers: auth
      })
    }
  }

  const rest = { ...auth, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
  await fetchWithRetry(`${env.url}/rest/v1/mfa_recovery_codes?user_id=eq.${userId}`, {
    method: 'DELETE',
    headers: rest
  })
  await fetchWithRetry(`${env.url}/rest/v1/users?id=eq.${userId}`, {
    method: 'PATCH',
    headers: rest,
    body: JSON.stringify({ mfa_enrolled_at: null })
  })
}

/**
 * `@supabase/ssr` is a transitive dep of the Nuxt module; resolve it from
 * there. Typed locally to the two members used, since the package is not a
 * direct dependency and so has no types on this side.
 */
interface SsrCookie {
  name: string
  value: string
}
interface SsrModule {
  createServerClient: (
    url: string,
    key: string,
    options: {
      cookieOptions: { name: string }
      cookies: { getAll: () => SsrCookie[]; setAll: (list: SsrCookie[]) => void }
    }
  ) => {
    auth: {
      signInWithPassword: (creds: {
        email: string
        password: string
      }) => Promise<{ error: { message: string } | null }>
    }
  }
}
async function loadSsr() {
  // The module's package.json is not in its `exports`, so resolve its real
  // (pnpm-store) directory via the symlink and require from inside it.
  const modulePkg = resolve(
    realpathSync(resolve(process.cwd(), 'node_modules/@nuxtjs/supabase')),
    'package.json'
  )
  const inner = createRequire(modulePkg)
  const ssrPath = inner.resolve('@supabase/ssr')
  return import(pathToFileURL(ssrPath).href) as Promise<SsrModule>
}

export interface SeededCookie {
  name: string
  value: string
  domain: string
  path: string
  httpOnly: boolean
  secure: boolean
  sameSite: 'Lax'
}

export async function signInAs(
  role: Role,
  baseURL: string
): Promise<{ cookies: SeededCookie[]; userId: string }> {
  const env = loadEnv()
  const email = TEST_ACCOUNTS[role]
  const password = `e2e-${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const user = await findUserByEmail(env, email)
  await clearMfa(env, user.id)
  await setPassword(env, user.id, password)

  const { createServerClient } = await loadSsr()
  const jar = new Map<string, string>()
  const client = createServerClient(env.url, env.anonKey, {
    cookieOptions: { name: `sb-${DEV_PROJECT_REF}-auth-token` },
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach((c) => jar.set(c.name, c.value))
    }
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`sign-in as ${role} failed: ${error.message}`)
  if (jar.size === 0) throw new Error('sign-in produced no cookies')

  const { hostname } = new URL(baseURL)
  const cookies: SeededCookie[] = [...jar.entries()].map(([name, value]) => ({
    name,
    value,
    domain: hostname,
    path: '/',
    httpOnly: false,
    secure: false,
    sameSite: 'Lax'
  }))
  return { cookies, userId: user.id }
}

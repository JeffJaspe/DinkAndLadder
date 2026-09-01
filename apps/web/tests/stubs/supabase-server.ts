/**
 * Resolution stub for the `#supabase/server` alias.
 *
 * That alias is created by @nuxtjs/supabase at build time, so under plain
 * Vitest — which does not boot Nuxt (see vitest.config.ts) — an import of it
 * fails to resolve before `vi.mock` ever gets a chance to intercept it. This
 * file gives the alias something real to point at; specs still replace the
 * behaviour with `vi.mock('#supabase/server', …)`.
 *
 * The bodies throw rather than return a fake session: a spec that reaches one
 * of these has forgotten to mock, and a silent null would look like a
 * signed-out caller instead of a missing stub.
 */
function notMocked(name: string): never {
  throw new Error(`${name} was called without a vi.mock('#supabase/server') factory.`)
}

export const serverSupabaseUser = () => notMocked('serverSupabaseUser')
export const serverSupabaseClient = () => notMocked('serverSupabaseClient')
export const serverSupabaseServiceRole = () => notMocked('serverSupabaseServiceRole')

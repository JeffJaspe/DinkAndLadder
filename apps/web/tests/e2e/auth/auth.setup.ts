import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test as setup } from '@playwright/test'
import { signInAs, type Role } from './seed'

export const AUTH_DIR = resolve(process.cwd(), 'test-results/.auth')
export const storagePath = (role: Role) => resolve(AUTH_DIR, `${role}.json`)

for (const role of ['owner', 'member'] as const) {
  setup(`seed ${role} session`, async ({ baseURL }) => {
    const { cookies, userId } = await signInAs(role, baseURL!)
    mkdirSync(AUTH_DIR, { recursive: true })
    writeFileSync(
      storagePath(role),
      JSON.stringify({ cookies: cookies.map((c) => ({ ...c, expires: -1 })), origins: [] }, null, 2)
    )
    writeFileSync(resolve(AUTH_DIR, `${role}.id`), userId)
  })
}

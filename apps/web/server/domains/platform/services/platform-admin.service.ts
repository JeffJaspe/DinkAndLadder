import type { PlatformConfigRepository } from '../repositories/platform-config.repository'

export interface PlatformAdminService {
  isSuperAdmin(userId: string): Promise<boolean>
}

export function createPlatformAdminService(repository: PlatformConfigRepository): PlatformAdminService {
  return {
    async isSuperAdmin(userId) {
      const config = await repository.getConfig()
      return config?.super_admin_id === userId
    }
  }
}

import type { AnnouncementRepository } from '../repositories/announcement.repository'
import type { ClubMembershipRepository } from '../../club/repositories/club-membership.repository'
import type {
  AnnouncementDto,
  CreateAnnouncementInput,
  UpdateAnnouncementInput
} from '../dto/announcement.dto'
import { toAnnouncementDto } from '../dto/announcement.dto'

export class AnnouncementServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export interface AnnouncementService {
  create(playerId: string, input: CreateAnnouncementInput): Promise<AnnouncementDto>
  getByClub(clubId: string, playerId: string | null): Promise<AnnouncementDto[]>
  getById(announcementId: string): Promise<AnnouncementDto | null>
  update(
    playerId: string,
    announcementId: string,
    input: UpdateAnnouncementInput
  ): Promise<AnnouncementDto>
  publish(playerId: string, announcementId: string): Promise<AnnouncementDto>
  archive(playerId: string, announcementId: string): Promise<AnnouncementDto>
  togglePin(playerId: string, announcementId: string): Promise<AnnouncementDto>
  markAsRead(playerId: string, announcementId: string): Promise<void>
  getUnreadCount(playerId: string, clubIds: string[]): Promise<number>
}

export function createAnnouncementService(
  announcements: AnnouncementRepository,
  memberships: ClubMembershipRepository
): AnnouncementService {
  async function assertCanManage(playerId: string, clubId: string): Promise<void> {
    const membership = await memberships.findByClubAndPlayer(clubId, playerId)
    if (!membership || membership.status !== 'active') {
      throw new AnnouncementServiceError(403, 'FORBIDDEN', 'You must be an active club member.')
    }
    if (!['OWNER', 'ADMIN', 'MODERATOR'].includes(membership.role)) {
      throw new AnnouncementServiceError(
        403,
        'FORBIDDEN',
        'Only club staff can manage announcements.'
      )
    }
  }

  async function assertCanEdit(playerId: string, announcementId: string): Promise<void> {
    const announcement = await announcements.findById(announcementId)
    if (!announcement) {
      throw new AnnouncementServiceError(404, 'NOT_FOUND', 'Announcement not found.')
    }

    const membership = await memberships.findByClubAndPlayer(announcement.club_id, playerId)
    if (!membership || membership.status !== 'active') {
      throw new AnnouncementServiceError(403, 'FORBIDDEN', 'You must be an active club member.')
    }

    const isOwnerOrAdmin = ['OWNER', 'ADMIN'].includes(membership.role)
    const isAuthor = announcement.author_player_id === playerId

    if (!isOwnerOrAdmin && !isAuthor) {
      throw new AnnouncementServiceError(
        403,
        'FORBIDDEN',
        'You can only edit your own announcements.'
      )
    }
  }

  return {
    async create(playerId, input) {
      await assertCanManage(playerId, input.club_id)
      const record = await announcements.create(input, playerId)
      return toAnnouncementDto(record)
    },

    async getByClub(clubId, playerId) {
      const includeArchived = false
      const records = await announcements.findByClub(clubId, includeArchived)

      if (!playerId) {
        return records.filter((r) => r.status === 'published').map(toAnnouncementDto)
      }

      const membership = await memberships.findByClubAndPlayer(clubId, playerId)
      if (!membership || membership.status !== 'active') {
        return records.filter((r) => r.status === 'published').map(toAnnouncementDto)
      }

      const isStaff = ['OWNER', 'ADMIN', 'MODERATOR'].includes(membership.role)

      return records
        .filter((r) => {
          if (r.status === 'draft' && r.author_player_id !== playerId && !isStaff) return false
          if (r.visibility === 'admins_only' && !['OWNER', 'ADMIN'].includes(membership.role))
            return false
          return true
        })
        .map(toAnnouncementDto)
    },

    async getById(announcementId) {
      const record = await announcements.findById(announcementId)
      return record ? toAnnouncementDto(record) : null
    },

    async update(playerId, announcementId, input) {
      await assertCanEdit(playerId, announcementId)
      const record = await announcements.update(announcementId, input)
      return toAnnouncementDto(record)
    },

    async publish(playerId, announcementId) {
      await assertCanEdit(playerId, announcementId)
      const announcement = await announcements.findById(announcementId)
      if (announcement?.status !== 'draft') {
        throw new AnnouncementServiceError(
          409,
          'INVALID_STATE',
          'Only draft announcements can be published.'
        )
      }
      const record = await announcements.updateStatus(announcementId, 'published')
      return toAnnouncementDto(record)
    },

    async archive(playerId, announcementId) {
      await assertCanEdit(playerId, announcementId)
      const announcement = await announcements.findById(announcementId)
      if (announcement?.status === 'archived') {
        throw new AnnouncementServiceError(
          409,
          'ALREADY_ARCHIVED',
          'Announcement is already archived.'
        )
      }
      const record = await announcements.updateStatus(announcementId, 'archived')
      return toAnnouncementDto(record)
    },

    async togglePin(playerId, announcementId) {
      await assertCanEdit(playerId, announcementId)
      const announcement = await announcements.findById(announcementId)
      if (!announcement) {
        throw new AnnouncementServiceError(404, 'NOT_FOUND', 'Announcement not found.')
      }
      const record = await announcements.setPinned(announcementId, !announcement.pinned)
      return toAnnouncementDto(record)
    },

    async markAsRead(playerId, announcementId) {
      await announcements.markAsRead(announcementId, playerId)
    },

    async getUnreadCount(playerId, clubIds) {
      return announcements.countUnreadForPlayer(playerId, clubIds)
    }
  }
}

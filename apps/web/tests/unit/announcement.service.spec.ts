import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createAnnouncementService,
  AnnouncementServiceError
} from '../../server/domains/announcement/services/announcement.service'
import type { AnnouncementRepository } from '../../server/domains/announcement/repositories/announcement.repository'
import type { ClubMembershipRepository } from '../../server/domains/club/repositories/club-membership.repository'
import type {
  AnnouncementRecord,
  AnnouncementReadRecord
} from '../../server/domains/announcement/dto/announcement.dto'
import type {
  ClubMembershipRecord,
  ClubRole,
  ClubMembershipStatus
} from '../../server/domains/club/dto/club-membership.dto'

const TEST_IDS = {
  player: '11111111-1111-1111-1111-111111111111',
  club: '22222222-2222-2222-2222-222222222222',
  announcement: '33333333-3333-3333-3333-333333333333'
}

function createMockRecord(overrides: Partial<AnnouncementRecord> = {}): AnnouncementRecord {
  return {
    id: TEST_IDS.announcement,
    club_id: TEST_IDS.club,
    author_player_id: TEST_IDS.player,
    title: 'Test Announcement',
    body: 'Test body content',
    announcement_type: 'general',
    status: 'draft',
    visibility: 'all_members',
    event_id: null,
    pinned: false,
    published_at: null,
    archived_at: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides
  }
}

function createMockMembership(overrides: Partial<ClubMembershipRecord> = {}): ClubMembershipRecord {
  return {
    id: 'mem-1',
    club_id: TEST_IDS.club,
    player_id: TEST_IDS.player,
    role: 'OWNER' as ClubRole,
    status: 'active' as ClubMembershipStatus,
    joined_at: '2024-01-01T00:00:00Z',
    left_at: null,
    invited_by_player_id: null,
    invited_at: null,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides
  }
}

function createMockReadRecord(): AnnouncementReadRecord {
  return {
    id: 'read-1',
    announcement_id: TEST_IDS.announcement,
    player_id: TEST_IDS.player,
    read_at: '2024-01-01T00:00:00Z'
  }
}

describe('AnnouncementService', () => {
  let announcementRepo: AnnouncementRepository
  let membershipRepo: ClubMembershipRepository

  beforeEach(() => {
    announcementRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByClub: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
      setPinned: vi.fn(),
      markAsRead: vi.fn(),
      isRead: vi.fn(),
      countUnreadForPlayer: vi.fn()
    }

    membershipRepo = {
      findByClubAndPlayer: vi.fn(),
      findById: vi.fn(),
      listOwnWithClub: vi.fn(),
      listByClub: vi.fn(),
      create: vi.fn(),
      updateById: vi.fn()
    }
  })

  describe('create', () => {
    it('creates announcement when user is club owner', async () => {
      const service = createAnnouncementService(announcementRepo, membershipRepo)
      const mockRecord = createMockRecord()

      vi.mocked(membershipRepo.findByClubAndPlayer).mockResolvedValue(createMockMembership())
      vi.mocked(announcementRepo.create).mockResolvedValue(mockRecord)

      const result = await service.create(TEST_IDS.player, {
        club_id: TEST_IDS.club,
        title: 'Test',
        body: 'Body'
      })

      expect(result.id).toBe(TEST_IDS.announcement)
      expect(announcementRepo.create).toHaveBeenCalledWith(
        { club_id: TEST_IDS.club, title: 'Test', body: 'Body' },
        TEST_IDS.player
      )
    })

    it('rejects non-staff members', async () => {
      const service = createAnnouncementService(announcementRepo, membershipRepo)

      vi.mocked(membershipRepo.findByClubAndPlayer).mockResolvedValue(
        createMockMembership({ role: 'MEMBER' })
      )

      await expect(
        service.create(TEST_IDS.player, { club_id: TEST_IDS.club, title: 'T', body: 'B' })
      ).rejects.toThrow(AnnouncementServiceError)
    })

    it('rejects inactive members', async () => {
      const service = createAnnouncementService(announcementRepo, membershipRepo)

      vi.mocked(membershipRepo.findByClubAndPlayer).mockResolvedValue(
        createMockMembership({ status: 'left' })
      )

      await expect(
        service.create(TEST_IDS.player, { club_id: TEST_IDS.club, title: 'T', body: 'B' })
      ).rejects.toThrow(AnnouncementServiceError)
    })
  })

  describe('getByClub', () => {
    it('returns only published announcements for non-members', async () => {
      const service = createAnnouncementService(announcementRepo, membershipRepo)

      vi.mocked(announcementRepo.findByClub).mockResolvedValue([
        createMockRecord({ status: 'draft' }),
        createMockRecord({ id: 'ann-2', status: 'published' })
      ])

      const result = await service.getByClub(TEST_IDS.club, null)

      expect(result).toHaveLength(1)
      expect(result[0].status).toBe('published')
    })

    it('returns drafts to staff members', async () => {
      const service = createAnnouncementService(announcementRepo, membershipRepo)

      vi.mocked(announcementRepo.findByClub).mockResolvedValue([
        createMockRecord({ status: 'draft' }),
        createMockRecord({ id: 'ann-2', status: 'published' })
      ])
      vi.mocked(membershipRepo.findByClubAndPlayer).mockResolvedValue(
        createMockMembership({ role: 'ADMIN' })
      )

      const result = await service.getByClub(TEST_IDS.club, TEST_IDS.player)

      expect(result).toHaveLength(2)
    })

    it('hides admin-only announcements from regular members', async () => {
      const service = createAnnouncementService(announcementRepo, membershipRepo)

      vi.mocked(announcementRepo.findByClub).mockResolvedValue([
        createMockRecord({ status: 'published', visibility: 'admins_only' }),
        createMockRecord({ id: 'ann-2', status: 'published', visibility: 'all_members' })
      ])
      vi.mocked(membershipRepo.findByClubAndPlayer).mockResolvedValue(
        createMockMembership({ role: 'MEMBER' })
      )

      const result = await service.getByClub(TEST_IDS.club, TEST_IDS.player)

      expect(result).toHaveLength(1)
      expect(result[0].visibility).toBe('all_members')
    })
  })

  describe('publish', () => {
    it('publishes draft announcement', async () => {
      const service = createAnnouncementService(announcementRepo, membershipRepo)
      const draftRecord = createMockRecord({ status: 'draft' })
      const publishedRecord = createMockRecord({ status: 'published' })

      vi.mocked(announcementRepo.findById).mockResolvedValue(draftRecord)
      vi.mocked(membershipRepo.findByClubAndPlayer).mockResolvedValue(createMockMembership())
      vi.mocked(announcementRepo.updateStatus).mockResolvedValue(publishedRecord)

      const result = await service.publish(TEST_IDS.player, TEST_IDS.announcement)

      expect(result.status).toBe('published')
      expect(announcementRepo.updateStatus).toHaveBeenCalledWith(TEST_IDS.announcement, 'published')
    })

    it('rejects publishing non-draft announcement', async () => {
      const service = createAnnouncementService(announcementRepo, membershipRepo)

      vi.mocked(announcementRepo.findById).mockResolvedValue(
        createMockRecord({ status: 'published' })
      )
      vi.mocked(membershipRepo.findByClubAndPlayer).mockResolvedValue(createMockMembership())

      await expect(service.publish(TEST_IDS.player, TEST_IDS.announcement)).rejects.toThrow(
        AnnouncementServiceError
      )
    })
  })

  describe('archive', () => {
    it('archives published announcement', async () => {
      const service = createAnnouncementService(announcementRepo, membershipRepo)
      const publishedRecord = createMockRecord({ status: 'published' })
      const archivedRecord = createMockRecord({ status: 'archived' })

      vi.mocked(announcementRepo.findById).mockResolvedValue(publishedRecord)
      vi.mocked(membershipRepo.findByClubAndPlayer).mockResolvedValue(createMockMembership())
      vi.mocked(announcementRepo.updateStatus).mockResolvedValue(archivedRecord)

      const result = await service.archive(TEST_IDS.player, TEST_IDS.announcement)

      expect(result.status).toBe('archived')
    })

    it('rejects archiving already archived announcement', async () => {
      const service = createAnnouncementService(announcementRepo, membershipRepo)

      vi.mocked(announcementRepo.findById).mockResolvedValue(
        createMockRecord({ status: 'archived' })
      )
      vi.mocked(membershipRepo.findByClubAndPlayer).mockResolvedValue(createMockMembership())

      await expect(service.archive(TEST_IDS.player, TEST_IDS.announcement)).rejects.toThrow(
        AnnouncementServiceError
      )
    })
  })

  describe('togglePin', () => {
    it('pins unpinned announcement', async () => {
      const service = createAnnouncementService(announcementRepo, membershipRepo)

      vi.mocked(announcementRepo.findById).mockResolvedValue(createMockRecord({ pinned: false }))
      vi.mocked(membershipRepo.findByClubAndPlayer).mockResolvedValue(createMockMembership())
      vi.mocked(announcementRepo.setPinned).mockResolvedValue(createMockRecord({ pinned: true }))

      const result = await service.togglePin(TEST_IDS.player, TEST_IDS.announcement)

      expect(result.pinned).toBe(true)
      expect(announcementRepo.setPinned).toHaveBeenCalledWith(TEST_IDS.announcement, true)
    })

    it('unpins pinned announcement', async () => {
      const service = createAnnouncementService(announcementRepo, membershipRepo)

      vi.mocked(announcementRepo.findById).mockResolvedValue(createMockRecord({ pinned: true }))
      vi.mocked(membershipRepo.findByClubAndPlayer).mockResolvedValue(createMockMembership())
      vi.mocked(announcementRepo.setPinned).mockResolvedValue(createMockRecord({ pinned: false }))

      const result = await service.togglePin(TEST_IDS.player, TEST_IDS.announcement)

      expect(result.pinned).toBe(false)
      expect(announcementRepo.setPinned).toHaveBeenCalledWith(TEST_IDS.announcement, false)
    })
  })

  describe('markAsRead', () => {
    it('marks announcement as read for player', async () => {
      const service = createAnnouncementService(announcementRepo, membershipRepo)

      vi.mocked(announcementRepo.markAsRead).mockResolvedValue(createMockReadRecord())

      await service.markAsRead(TEST_IDS.player, TEST_IDS.announcement)

      expect(announcementRepo.markAsRead).toHaveBeenCalledWith(
        TEST_IDS.announcement,
        TEST_IDS.player
      )
    })
  })

  describe('getUnreadCount', () => {
    it('returns unread count for player clubs', async () => {
      const service = createAnnouncementService(announcementRepo, membershipRepo)

      vi.mocked(announcementRepo.countUnreadForPlayer).mockResolvedValue(5)

      const result = await service.getUnreadCount(TEST_IDS.player, [TEST_IDS.club])

      expect(result).toBe(5)
    })
  })
})

import type { AuditRepository } from '../repositories/audit.repository'
import type { AuditEventType, AuditLogInput, AuditTargetType } from '../dto/audit.dto'

export interface AuditService {
  log(input: AuditLogInput): Promise<void>
  logClubRoleChange(
    actorUserId: string,
    actorPlayerId: string,
    membershipId: string,
    payload: { old_role: string; new_role: string; target_player_id: string }
  ): Promise<void>
  logClubMembershipAction(
    actorUserId: string,
    actorPlayerId: string,
    membershipId: string,
    action: 'approve' | 'reject' | 'remove',
    payload: { target_player_id: string; club_id: string }
  ): Promise<void>
  logMatchVerificationDecision(
    actorUserId: string,
    actorPlayerId: string,
    matchId: string,
    payload: { decision: string; match_status: string }
  ): Promise<void>
}

export function createAuditService(repository: AuditRepository): AuditService {
  async function logEvent(
    eventType: AuditEventType,
    actorUserId: string | null,
    actorPlayerId: string | null,
    targetType: AuditTargetType,
    targetId: string,
    payload?: Record<string, unknown>
  ): Promise<void> {
    try {
      await repository.create({
        event_type: eventType,
        actor_user_id: actorUserId,
        actor_player_id: actorPlayerId,
        target_type: targetType,
        target_id: targetId,
        payload
      })
    } catch (err) {
      console.error(`[audit] failed to log ${eventType}:`, err)
    }
  }

  return {
    async log(input) {
      try {
        await repository.create(input)
      } catch (err) {
        console.error(`[audit] failed to log ${input.event_type}:`, err)
      }
    },

    async logClubRoleChange(actorUserId, actorPlayerId, membershipId, payload) {
      await logEvent(
        'club.role_change',
        actorUserId,
        actorPlayerId,
        'club_membership',
        membershipId,
        payload
      )
    },

    async logClubMembershipAction(actorUserId, actorPlayerId, membershipId, action, payload) {
      const eventType: AuditEventType =
        action === 'approve'
          ? 'club.membership_approve'
          : action === 'reject'
            ? 'club.membership_reject'
            : 'club.membership_remove'
      await logEvent(
        eventType,
        actorUserId,
        actorPlayerId,
        'club_membership',
        membershipId,
        payload
      )
    },

    async logMatchVerificationDecision(actorUserId, actorPlayerId, matchId, payload) {
      await logEvent(
        'match.verification_decision',
        actorUserId,
        actorPlayerId,
        'match_verification',
        matchId,
        payload
      )
    }
  }
}

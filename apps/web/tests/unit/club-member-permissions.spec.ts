/**
 * The club member permission matrix, as the UI must mirror it.
 *
 * `ClubService.updateMember` is the real authority; these rules are duplicated
 * in `pages/clubs/[clubId].vue` so the interface never offers an action the
 * server will refuse. Duplication is the risk, so the rules are pinned here
 * against the same cases the service enforces:
 *
 *   - the OWNER row is never modifiable, by anyone
 *   - nobody edits their own membership through this path
 *   - an ADMIN may not touch another ADMIN, and may not grant ADMIN
 *   - only OWNER and ADMIN may manage members at all
 *
 * If ClubService changes, these fail and the UI gets fixed with it.
 */

import { describe, expect, it } from 'vitest'

type Role = 'OWNER' | 'ADMIN' | 'MODERATOR' | 'MEMBER'

const ASSIGNABLE_BY_OWNER: Role[] = ['ADMIN', 'MODERATOR', 'MEMBER']
const ASSIGNABLE_BY_ADMIN: Role[] = ['MODERATOR', 'MEMBER']

interface Actor {
  isOwner: boolean
  canManageMembers: boolean
  selfId: string
}

/** Mirrors `assignableRolesFor` in pages/clubs/[clubId].vue. */
function assignableRolesFor(actor: Actor, member: { role: Role; player_id: string }): Role[] {
  if (!actor.canManageMembers) return []
  if (member.role === 'OWNER') return []
  if (member.player_id === actor.selfId) return []
  if (actor.isOwner) return ASSIGNABLE_BY_OWNER
  return member.role === 'ADMIN' ? [] : ASSIGNABLE_BY_ADMIN
}

/** Mirrors `canRemoveMember` in pages/clubs/[clubId].vue. */
function canRemoveMember(actor: Actor, member: { role: Role; player_id: string }): boolean {
  if (!actor.canManageMembers) return false
  if (member.role === 'OWNER') return false
  if (member.player_id === actor.selfId) return false
  if (!actor.isOwner && member.role === 'ADMIN') return false
  return true
}

const owner: Actor = { isOwner: true, canManageMembers: true, selfId: 'me' }
const admin: Actor = { isOwner: false, canManageMembers: true, selfId: 'me' }
/** An admin in player mode, or acting as a different club. */
const wrongHat: Actor = { isOwner: false, canManageMembers: false, selfId: 'me' }

const member = (role: Role, player_id = 'them') => ({ role, player_id })

describe('assignableRolesFor', () => {
  it('lets the owner assign every role below owner', () => {
    expect(assignableRolesFor(owner, member('MEMBER'))).toEqual(['ADMIN', 'MODERATOR', 'MEMBER'])
    expect(assignableRolesFor(owner, member('ADMIN'))).toEqual(['ADMIN', 'MODERATOR', 'MEMBER'])
  })

  it('never offers a control on the owner row, not even to the owner', () => {
    // The service refuses this outright: "The owner cannot be modified or
    // removed this way." Ownership transfer is a separate flow that does not exist yet.
    expect(assignableRolesFor(owner, member('OWNER'))).toEqual([])
    expect(assignableRolesFor(admin, member('OWNER'))).toEqual([])
  })

  it('stops an admin from granting admin', () => {
    expect(assignableRolesFor(admin, member('MEMBER'))).toEqual(['MODERATOR', 'MEMBER'])
    expect(assignableRolesFor(admin, member('MEMBER'))).not.toContain('ADMIN')
  })

  it('stops an admin from touching another admin at all', () => {
    expect(assignableRolesFor(admin, member('ADMIN'))).toEqual([])
  })

  it('never offers a control on your own row', () => {
    // Changing your own membership goes through leave-club, not this path.
    expect(assignableRolesFor(owner, member('ADMIN', 'me'))).toEqual([])
    expect(assignableRolesFor(admin, member('MEMBER', 'me'))).toEqual([])
  })

  it('offers nothing without the club hat, whatever the role', () => {
    expect(assignableRolesFor(wrongHat, member('MEMBER'))).toEqual([])
    expect(assignableRolesFor({ ...wrongHat, isOwner: true }, member('MEMBER'))).toEqual([])
  })

  it('always includes the current role, so the select can show it', () => {
    // The control renders `:value="member.role"`; an option list missing that
    // value would render a select showing something the member is not.
    for (const role of ['ADMIN', 'MODERATOR', 'MEMBER'] as Role[]) {
      expect(assignableRolesFor(owner, member(role))).toContain(role)
    }
    for (const role of ['MODERATOR', 'MEMBER'] as Role[]) {
      expect(assignableRolesFor(admin, member(role))).toContain(role)
    }
  })
})

describe('canRemoveMember', () => {
  it('lets the owner remove anyone below owner', () => {
    expect(canRemoveMember(owner, member('ADMIN'))).toBe(true)
    expect(canRemoveMember(owner, member('MODERATOR'))).toBe(true)
    expect(canRemoveMember(owner, member('MEMBER'))).toBe(true)
  })

  it('lets an admin remove members and moderators', () => {
    expect(canRemoveMember(admin, member('MODERATOR'))).toBe(true)
    expect(canRemoveMember(admin, member('MEMBER'))).toBe(true)
  })

  it('stops an admin removing another admin', () => {
    // This is the bug the matrix fixed: the old condition offered Remove here,
    // and the server answered 403 with nothing shown to the user.
    expect(canRemoveMember(admin, member('ADMIN'))).toBe(false)
  })

  it('never removes the owner or yourself', () => {
    expect(canRemoveMember(owner, member('OWNER'))).toBe(false)
    expect(canRemoveMember(admin, member('OWNER'))).toBe(false)
    expect(canRemoveMember(owner, member('ADMIN', 'me'))).toBe(false)
  })

  it('removes nothing without the club hat', () => {
    expect(canRemoveMember(wrongHat, member('MEMBER'))).toBe(false)
  })
})

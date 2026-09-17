/**
 * The six skills a player can be credited with.
 *
 * Fixed, and closed at the database too (`chk_match_kudos_skill`). A profile
 * shows these as totals, and a total is only readable if the set it is counted
 * over cannot grow underneath it — six bars a reader can take in at a glance,
 * not a tag cloud.
 *
 * Five strokes and one attribute. The strokes span the two halves of a
 * pickleball point: the soft game (dink, third-shot drop), the power game
 * (serve, drive), and the net (volley). Sportsmanship is the sixth on purpose —
 * it is frequently the thing an opponent most wants to say, and a card of
 * nothing but technique has no way to say it.
 */
export const KUDOS_SKILLS = [
  'dink',
  'serve',
  'third_shot_drop',
  'drive',
  'volley',
  'sportsmanship'
] as const

export type KudosSkill = (typeof KUDOS_SKILLS)[number]

export interface KudosSkillMeta {
  id: KudosSkill
  label: string
  /** One short line, shown under the label when choosing. */
  hint: string
  /** The skill's own glyph, as the badge definitions carry theirs. */
  icon: string
}

export const KUDOS_SKILL_META: Record<KudosSkill, KudosSkillMeta> = {
  dink: { id: 'dink', label: 'Dink', hint: 'Soft game at the kitchen', icon: '🏓' },
  serve: { id: 'serve', label: 'Serve', hint: 'Depth and placement', icon: '🎯' },
  third_shot_drop: {
    id: 'third_shot_drop',
    label: 'Third-shot drop',
    hint: 'The reset that takes the net',
    icon: '🪶'
  },
  drive: { id: 'drive', label: 'Drive', hint: 'Pace off the ground', icon: '⚡' },
  volley: { id: 'volley', label: 'Volley', hint: 'Hands at the net', icon: '🤚' },
  sportsmanship: {
    id: 'sportsmanship',
    label: 'Sportsmanship',
    hint: 'Good to share a court with',
    icon: '🤝'
  }
}

export function isKudosSkill(value: unknown): value is KudosSkill {
  return typeof value === 'string' && (KUDOS_SKILLS as readonly string[]).includes(value)
}

export interface KudosRecord {
  id: string
  match_id: string
  from_player_id: string
  to_player_id: string
  skill: KudosSkill
  created_at: string
}

/** One skill's tally on a profile. */
export interface KudosTallyDto {
  skill: KudosSkill
  label: string
  icon: string
  count: number
}

export interface PlayerKudosDto {
  /**
   * All six skills, always, in the fixed order above — including the ones at
   * zero. A card that only listed what somebody had received would change shape
   * per player and read as a ranking of their strengths rather than a tally;
   * showing the full set makes the zeroes mean something too.
   */
  tallies: KudosTallyDto[]
  total: number
}

export interface GiveKudosInput {
  match_id: string
  to_player_id: string
  skill: KudosSkill
}

export function emptyTallies(): KudosTallyDto[] {
  return KUDOS_SKILLS.map((skill) => ({
    skill,
    label: KUDOS_SKILL_META[skill].label,
    icon: KUDOS_SKILL_META[skill].icon,
    count: 0
  }))
}

export function toPlayerKudosDto(counts: Record<string, number>): PlayerKudosDto {
  const tallies = emptyTallies().map((tally) => ({
    ...tally,
    count: counts[tally.skill] ?? 0
  }))
  return {
    tallies,
    total: tallies.reduce((sum, t) => sum + t.count, 0)
  }
}

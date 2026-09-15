/**
 * Initial Skill Rating questionnaire — question content.
 *
 * Every choice carries a `score` expressed directly on the platform's rating
 * scale (2.0–5.5) rather than abstract points, so a dimension's score is simply
 * the mean of its answers and the model in
 * `services/initial-rating.service.ts` needs no re-normalisation step.
 *
 * Design rules the content follows (see ADR-001 in docs/18-ADR-INDEX.md):
 *
 * - Scenario-based, not "how good are you at X". A player answers with what
 *   actually happens in their games, which is harder to inflate than a label.
 * - Knowing a shot never scores like executing it. Where a ladder has a
 *   "I know I should, but..." rung it sits one step above "I don't", never
 *   higher.
 * - Ladders reward *repeatable* game performance. Every skill ladder is
 *   2.0 / 2.5 / 3.0 / 4.0 / 5.0: novice, beginner, "sometimes", "most of the
 *   time", and deliberate/adaptive execution under competitive conditions.
 * - Technical questions never mention numeric levels or "DUPR". The one
 *   question that does (LVL-001) is a secondary calibration signal and pairs
 *   every number with a plain-language description.
 *
 * The set is FIXED (no random subset). The earlier bank served 7 of 31 questions
 * at random, so two players with identical skills could land half a point
 * apart purely from the draw. A fixed set is reproducible, comparable across
 * players, and lets the stored answers be re-scored if the model changes.
 */

export type SkillDimension =
  | 'serve_return'
  | 'groundstrokes'
  | 'dinking'
  | 'third_shot'
  | 'net_game'
  | 'positioning'
  | 'strategy'
  | 'consistency'

/** Non-technical inputs used only to calibrate / bound the technical estimate. */
export type CalibrationCategory = 'experience' | 'competition' | 'self_level'

export type QuestionCategory = SkillDimension | CalibrationCategory

export const SKILL_DIMENSIONS: readonly SkillDimension[] = [
  'serve_return',
  'groundstrokes',
  'dinking',
  'third_shot',
  'net_game',
  'positioning',
  'strategy',
  'consistency'
] as const

export interface QuestionChoice {
  label: string
  /** Rating-scale value (2.0–5.5) this answer is evidence for. For calibration
   * questions the meaning is category-specific — see initial-rating.service.ts. */
  score: number
}

export interface AssessmentQuestion {
  id: string
  category: QuestionCategory
  question: string
  choices: QuestionChoice[]
}

export const QUESTION_BANK: AssessmentQuestion[] = [
  // ── Serve / Return ───────────────────────────────────────────────────────
  {
    id: 'SR-001',
    category: 'serve_return',
    question: "It's your serve. What happens most of the time in a real game?",
    choices: [
      { label: "I often miss, or the serve doesn't land in the correct box.", score: 2.0 },
      {
        label: "My serve usually lands in, but I'm not aiming anywhere in particular.",
        score: 2.5
      },
      { label: 'My serve goes in nearly every time and I can usually hit it deep.', score: 3.0 },
      { label: 'I can place my serve deep and to a chosen side most of the time.', score: 4.0 },
      {
        label:
          'I vary depth, spin and placement to a target on purpose, and it still works when the game is close.',
        score: 5.0
      }
    ]
  },
  {
    id: 'SR-002',
    category: 'serve_return',
    question: 'Your opponent serves to you. What usually happens next?',
    choices: [
      { label: 'I often miss the return or hit it out.', score: 2.0 },
      { label: 'I get it back, but it often lands short and I stay at the baseline.', score: 2.5 },
      { label: 'I return deep fairly often and start moving forward after it.', score: 3.0 },
      {
        label: 'I return deep consistently and get to the kitchen line behind it.',
        score: 4.0
      },
      {
        label:
          'I return deep with intent (to the weaker player or their backhand) and arrive at the kitchen in good position.',
        score: 5.0
      }
    ]
  },

  // ── Groundstrokes ────────────────────────────────────────────────────────
  {
    id: 'GS-001',
    category: 'groundstrokes',
    question: 'During a baseline rally a ball comes to your forehand side. What usually happens?',
    choices: [
      { label: 'I often miss it, or hit it into the net or out.', score: 2.0 },
      { label: 'I can get it back, but with little control over where it goes.', score: 2.5 },
      { label: 'I can keep it in play and roughly aim it.', score: 3.0 },
      {
        label: 'I can hit it deep or to a target with reasonable pace most of the time.',
        score: 4.0
      },
      {
        label: 'I control depth, pace and spin and choose the target deliberately.',
        score: 5.0
      }
    ]
  },
  {
    id: 'GS-002',
    category: 'groundstrokes',
    question: 'During a baseline rally a ball comes to your backhand side. What usually happens?',
    choices: [
      { label: 'I try to run around it or I usually miss it.', score: 2.0 },
      { label: 'I can get it back, but it is weak and I have little control.', score: 2.5 },
      { label: 'I can keep it in play and roughly aim it.', score: 3.0 },
      {
        label: 'My backhand is reliable and I can hit it deep or to a target most of the time.',
        score: 4.0
      },
      {
        label: 'My backhand is a weapon: I control depth, pace and spin and can attack with it.',
        score: 5.0
      }
    ]
  },

  // ── Dinking ──────────────────────────────────────────────────────────────
  {
    id: 'DK-001',
    category: 'dinking',
    question:
      'You and your opponent are both at the kitchen line. They give you a soft ball that lands safely in the kitchen. What do you normally do?',
    choices: [
      { label: 'I often attack these balls or make a mistake.', score: 2.0 },
      { label: 'I try to dink it back but frequently pop the ball up.', score: 2.5 },
      { label: 'I can keep a short dink rally going.', score: 3.0 },
      {
        label: 'I can sustain dink rallies and recognise when a ball is attackable.',
        score: 4.0
      },
      {
        label: 'I deliberately vary placement, height and pace to create an attackable ball.',
        score: 5.0
      }
    ]
  },
  {
    id: 'DK-002',
    category: 'dinking',
    question:
      'In a long dink rally your opponents start dinking at your feet and moving you side to side. What usually happens?',
    choices: [
      { label: "I don't really get into dink rallies yet.", score: 2.0 },
      { label: 'I usually pop one up or hit into the net within a few shots.', score: 2.5 },
      {
        label: 'I can hang in for a while, but eventually I give them an attackable ball.',
        score: 3.0
      },
      {
        label: 'I can stay patient and keep the ball unattackable for as long as it takes.',
        score: 4.0
      },
      {
        label:
          'I stay neutral under that pressure and turn the rally around by moving them instead.',
        score: 5.0
      }
    ]
  },

  // ── Third shot: drops and drives ─────────────────────────────────────────
  {
    id: 'TS-001',
    category: 'third_shot',
    question:
      "You've just served and the return comes back deep to you. What do you actually do with your next shot in a real game?",
    choices: [
      { label: 'I just hit it back however I can.', score: 2.0 },
      {
        label: 'I know a soft drop into the kitchen is the idea, but I mostly hit it hard or long.',
        score: 2.5
      },
      {
        label: 'I try a drop; it works some of the time, but it often sits up or hits the net.',
        score: 3.0
      },
      {
        label: 'I can land a drop in the kitchen most of the time and follow it forward.',
        score: 4.0
      },
      {
        label:
          'I choose between a drop and a drive based on the return and the opponents, and can execute either reliably.',
        score: 5.0
      }
    ]
  },
  {
    id: 'TS-002',
    category: 'third_shot',
    question: 'When you drive the ball hard from the back of the court, what usually happens?',
    choices: [
      {
        label: "I rarely drive on purpose; when I hit hard it's usually out or in the net.",
        score: 2.0
      },
      { label: 'I can drive, but it is often out or an easy ball for them to block.', score: 2.5 },
      { label: 'I can keep drives in play with some topspin.', score: 3.0 },
      {
        label:
          'I can drive with topspin to a target and follow it with a soft fifth shot when needed.',
        score: 4.0
      },
      {
        label: 'I use drives to set up the next ball (e.g. drive and crash) and can disguise them.',
        score: 5.0
      }
    ]
  },

  // ── Net game: volleys, blocks, resets ────────────────────────────────────
  {
    id: 'NG-001',
    category: 'net_game',
    question:
      "You're at the kitchen line and a medium-pace ball comes at you around chest height. What usually happens?",
    choices: [
      { label: 'I often miss it or hit it long.', score: 2.0 },
      { label: 'I get it back, but it is usually a soft, easy ball for them.', score: 2.5 },
      { label: 'I can volley it back in play with some control.', score: 3.0 },
      { label: 'I can volley to a spot (their feet, the middle) most of the time.', score: 4.0 },
      {
        label:
          'I can punch, block or roll the volley with control, choosing which based on the situation.',
        score: 5.0
      }
    ]
  },
  {
    id: 'NG-002',
    category: 'net_game',
    question:
      "Your opponent hits a hard ball at you while you're still moving up through the middle of the court. What usually happens?",
    choices: [
      { label: 'I usually miss it, or hit it back hard and out.', score: 2.0 },
      { label: 'I get it back but it pops up.', score: 2.5 },
      { label: 'I can sometimes block it softly into the kitchen.', score: 3.0 },
      {
        label: 'I can usually reset it softly into the kitchen and keep moving forward.',
        score: 4.0
      },
      {
        label: 'I reset consistently under pressure and counter-attack when the ball allows it.',
        score: 5.0
      }
    ]
  },

  // ── Court positioning / partner movement ─────────────────────────────────
  {
    id: 'PS-001',
    category: 'positioning',
    question:
      'In doubles, your partner has just returned the serve. Where are you, and what do you do?',
    choices: [
      { label: "I'm not sure where I'm supposed to be.", score: 2.0 },
      { label: 'I stay back near the baseline with my partner.', score: 2.5 },
      {
        label:
          'I move toward the kitchen line but often end up stopped in the middle of the court.',
        score: 3.0
      },
      {
        label: "I'm already at the kitchen line and ready before the ball comes back.",
        score: 4.0
      },
      {
        label:
          "I'm at the kitchen line, shaded toward the likely target, and talking to my partner about it.",
        score: 5.0
      }
    ]
  },
  {
    id: 'PS-002',
    category: 'positioning',
    question: 'Your partner is pulled wide to chase a ball. What do you do?',
    choices: [
      { label: 'I stay where I am.', score: 2.0 },
      { label: "I know I should move, but I usually don't in time.", score: 2.5 },
      { label: 'I slide toward the middle to cover the gap most of the time.', score: 3.0 },
      { label: 'I move with my partner consistently and cover the middle.', score: 4.0 },
      {
        label: 'I move with my partner, call the ball, and cover for them without being asked.',
        score: 5.0
      }
    ]
  },

  // ── Strategy / decision making ───────────────────────────────────────────
  {
    id: 'ST-001',
    category: 'strategy',
    question:
      'During a dink rally a ball comes to you a little higher than the net. What do you usually do?',
    choices: [
      { label: "I dink everything back; I don't really notice the difference.", score: 2.0 },
      { label: "I attack most balls, including ones I probably shouldn't.", score: 2.5 },
      {
        label:
          'I sometimes recognise the attackable ball, but I often miss it or attack the wrong one.',
        score: 3.0
      },
      { label: 'I recognise it and attack it to a good spot most of the time.', score: 4.0 },
      {
        label:
          "I recognise it early, attack a target (feet, hip, gap) and I'm ready for the counter.",
        score: 5.0
      }
    ]
  },
  {
    id: 'ST-002',
    category: 'strategy',
    question: 'You notice one opponent has a weaker backhand. What happens during the game?',
    choices: [
      { label: "I don't usually notice things like that during a game.", score: 2.0 },
      { label: "I notice, but I can't really put the ball there on purpose.", score: 2.5 },
      { label: 'I try to hit to it when the chance comes up.', score: 3.0 },
      {
        label: 'My partner and I deliberately target it, and change the plan if they adjust.',
        score: 4.0
      },
      {
        label:
          'We build points around it (serve, return, dink placement) and keep adjusting all game.',
        score: 5.0
      }
    ]
  },
  {
    id: 'ST-003',
    category: 'strategy',
    question: "It's 9–9 in a close game. Compared with your normal play, what happens?",
    choices: [
      { label: 'I get nervous and make more mistakes.', score: 2.0 },
      { label: 'I play more carefully and mostly just try not to make a mistake.', score: 2.5 },
      { label: 'I play about the same as I normally do.', score: 3.0 },
      { label: 'I stay patient and pick the higher-percentage shot.', score: 4.0 },
      {
        label: 'I play my best in those moments and choose each play deliberately.',
        score: 5.0
      }
    ]
  },

  // ── Consistency / unforced errors ────────────────────────────────────────
  {
    id: 'CS-001',
    category: 'consistency',
    question: 'In a typical game, how do most of your points end?',
    choices: [
      {
        label: 'Mostly on my own mistakes (into the net, out, missed serves or returns).',
        score: 2.0
      },
      { label: 'I make a lot of unforced errors, though I win some points too.', score: 2.5 },
      { label: "It's a mix: some winners, some errors, some longer rallies.", score: 3.0 },
      {
        label: 'I make few unforced errors; points mostly end when someone is forced into one.',
        score: 4.0
      },
      {
        label: 'I rarely give points away; I lose points mostly to good shots from opponents.',
        score: 5.0
      }
    ]
  },
  {
    id: 'CS-002',
    category: 'consistency',
    question: 'Against players of about your level, how long do your rallies usually last?',
    choices: [
      { label: 'Usually 1–3 shots, then someone makes a mistake.', score: 2.0 },
      { label: 'Often 4–6 shots.', score: 2.5 },
      { label: 'Regular rallies of 7–10 shots, sometimes with a bit of dinking.', score: 3.0 },
      { label: 'Long rallies with extended dink exchanges are normal.', score: 4.0 },
      {
        label: "Long, controlled rallies where I'm usually the one deciding when the point ends.",
        score: 5.0
      }
    ]
  },

  // ── Calibration (not part of the weighted technical score) ───────────────
  // score = the highest provisional rating this much playing history supports.
  {
    id: 'EXP-001',
    category: 'experience',
    question: 'How much pickleball have you actually played?',
    choices: [
      { label: "I'm just starting — a handful of sessions at most.", score: 3.0 },
      { label: 'Less than 6 months, or fewer than about 20 games.', score: 3.5 },
      { label: '6 months to 2 years, playing regularly.', score: 4.5 },
      { label: 'More than 2 years, playing regularly.', score: 5.5 }
    ]
  },
  // score = the highest provisional rating this much competitive evidence supports.
  {
    id: 'COMP-001',
    category: 'competition',
    question: 'What is your competitive experience?',
    choices: [
      { label: "I haven't played in organised competition (leagues or tournaments).", score: 4.5 },
      { label: "I've played in club or local leagues / tournaments.", score: 5.0 },
      { label: "I've won medals at local or club-level tournaments.", score: 5.0 },
      {
        label: "I've won medals in advanced / open divisions or at regional or national events.",
        score: 5.5
      },
      { label: 'I compete in professional or prize-money events.', score: 5.5 }
    ]
  },
  // score = the level the player says they can compete with. Secondary signal only.
  {
    id: 'LVL-001',
    category: 'self_level',
    question:
      'In a competitive game today, which players could you realistically compete against (win about half the time)?',
    choices: [
      { label: 'Other beginners who are still learning to rally.', score: 2.25 },
      {
        label: 'Around 2.5 — players who can serve, return and keep short rallies going.',
        score: 2.5
      },
      {
        label: 'Around 3.0 — players who rally reliably and are starting to dink and drop.',
        score: 3.0
      },
      {
        label: 'Around 3.5 — players with reliable dinks, drops and positioning.',
        score: 3.5
      },
      {
        label: 'Around 4.0 — players who reset and attack consistently and play with a plan.',
        score: 4.0
      },
      {
        label: 'Around 4.5 — strong tournament players with few unforced errors.',
        score: 4.5
      },
      { label: '5.0+ — elite players who rarely make mistakes.', score: 5.0 },
      { label: 'Professional / top tournament level.', score: 5.5 }
    ]
  }
]

/** The full questionnaire, in the order it is presented. */
export function getAssessmentQuestions(): AssessmentQuestion[] {
  return QUESTION_BANK
}

export interface RatingTier {
  min: number
  max: number
  name: string
  description: string
  color: string
}

export const RATING_TIERS: RatingTier[] = [
  {
    min: 2.0,
    max: 2.49,
    name: 'Beginner',
    description: 'Just starting your pickleball journey',
    color: '#6B7B75'
  },
  {
    min: 2.5,
    max: 2.99,
    name: 'Novice',
    description: 'Learning the fundamentals',
    color: '#8B9B95'
  },
  {
    min: 3.0,
    max: 3.49,
    name: 'Intermediate',
    description: 'Developing consistent play',
    color: '#4DB175'
  },
  {
    min: 3.5,
    max: 3.99,
    name: 'Advanced',
    description: 'Strong recreational player',
    color: '#3D9B65'
  },
  {
    min: 4.0,
    max: 4.49,
    name: 'Skilled',
    description: 'Competitive club player',
    color: '#2D8B55'
  },
  { min: 4.5, max: 4.99, name: 'Expert', description: 'Tournament-ready player', color: '#1D7B45' },
  { min: 5.0, max: 5.49, name: 'Pro', description: 'Elite competitive player', color: '#F5A623' },
  { min: 5.5, max: 5.99, name: 'Elite', description: 'Top-tier competitor', color: '#E59513' },
  { min: 6.0, max: 8.0, name: 'Champion', description: 'Professional level', color: '#D58503' }
]

export function getTierForRating(rating: number): RatingTier {
  for (const tier of RATING_TIERS) {
    if (rating >= tier.min && rating <= tier.max) {
      return tier
    }
  }
  return RATING_TIERS[0]
}

export type QuestionCategory =
  'experience' | 'skill' | 'strategy' | 'competition' | 'self-assessment'

export interface QuestionChoice {
  label: string
  points: number
}

export interface AssessmentQuestion {
  id: string
  category: QuestionCategory
  question: string
  choices: QuestionChoice[]
}

export const QUESTION_BANK: AssessmentQuestion[] = [
  // Category A - Experience
  {
    id: 'EXP-001',
    category: 'experience',
    question: 'How long have you been playing pickleball?',
    choices: [
      { label: 'Less than 1 month', points: 1 },
      { label: '1–3 months', points: 2 },
      { label: '3–6 months', points: 3 },
      { label: '6–12 months', points: 4 },
      { label: '1–2 years', points: 5 },
      { label: 'More than 2 years', points: 6 }
    ]
  },
  {
    id: 'EXP-002',
    category: 'experience',
    question: 'How often do you play pickleball?',
    choices: [
      { label: 'Less than once per week', points: 1 },
      { label: '1–2 times per week', points: 2 },
      { label: '3–4 times per week', points: 4 },
      { label: '5–6 times per week', points: 5 },
      { label: 'Daily', points: 6 }
    ]
  },
  {
    id: 'EXP-003',
    category: 'experience',
    question: 'Have you received formal pickleball coaching?',
    choices: [
      { label: 'Never', points: 1 },
      { label: '1–5 lessons', points: 2 },
      { label: '6–20 lessons', points: 4 },
      { label: 'Ongoing coaching', points: 6 }
    ]
  },
  {
    id: 'EXP-004',
    category: 'experience',
    question: 'Approximately how many pickleball matches have you played?',
    choices: [
      { label: 'Fewer than 20', points: 1 },
      { label: '20–50', points: 2 },
      { label: '51–100', points: 3 },
      { label: '101–300', points: 5 },
      { label: 'More than 300', points: 6 }
    ]
  },
  {
    id: 'EXP-005',
    category: 'experience',
    question: 'How many different pickleball venues or clubs have you played at?',
    choices: [
      { label: '1', points: 1 },
      { label: '2–3', points: 2 },
      { label: '4–5', points: 4 },
      { label: 'More than 5', points: 6 }
    ]
  },

  // Category B - Skill Assessment
  {
    id: 'SKILL-001',
    category: 'skill',
    question: 'How often can you successfully land a legal serve in play?',
    choices: [
      { label: 'Less than 50%', points: 1 },
      { label: 'Around 70%', points: 2 },
      { label: 'Around 85%', points: 4 },
      { label: 'More than 95%', points: 6 }
    ]
  },
  {
    id: 'SKILL-002',
    category: 'skill',
    question: 'How often can you intentionally execute a third-shot drop?',
    choices: [
      { label: 'Never', points: 1 },
      { label: 'Occasionally', points: 2 },
      { label: 'About half the time', points: 3 },
      { label: 'Most of the time', points: 5 },
      { label: 'Consistently', points: 6 }
    ]
  },
  {
    id: 'SKILL-003',
    category: 'skill',
    question: 'How many consecutive dinks can you comfortably maintain in a rally?',
    choices: [
      { label: 'Fewer than 5', points: 1 },
      { label: '5–10', points: 2 },
      { label: '11–20', points: 4 },
      { label: 'More than 20', points: 6 }
    ]
  },
  {
    id: 'SKILL-004',
    category: 'skill',
    question: 'How confident are you in your backhand?',
    choices: [
      { label: 'I avoid using it', points: 1 },
      { label: 'Basic returns only', points: 2 },
      { label: 'Reliable under moderate pressure', points: 4 },
      { label: 'Strong attacking shot', points: 6 }
    ]
  },
  {
    id: 'SKILL-005',
    category: 'skill',
    question: 'Can you reset hard-hit balls into the kitchen from the transition zone?',
    choices: [
      { label: 'Rarely', points: 1 },
      { label: 'Sometimes', points: 2 },
      { label: 'Frequently', points: 4 },
      { label: 'Consistently', points: 6 }
    ]
  },
  {
    id: 'SKILL-006',
    category: 'skill',
    question: 'Can you intentionally place serves to specific targets?',
    choices: [
      { label: 'No', points: 1 },
      { label: 'Occasionally', points: 2 },
      { label: 'Frequently', points: 4 },
      { label: 'Consistently', points: 6 }
    ]
  },
  {
    id: 'SKILL-007',
    category: 'skill',
    question: 'How often can you successfully volley while at the kitchen line?',
    choices: [
      { label: 'Rarely', points: 1 },
      { label: 'Sometimes', points: 2 },
      { label: 'Frequently', points: 4 },
      { label: 'Consistently', points: 6 }
    ]
  },
  {
    id: 'SKILL-008',
    category: 'skill',
    question: 'Can you intentionally hit topspin drives?',
    choices: [
      { label: 'No', points: 1 },
      { label: 'Occasionally', points: 2 },
      { label: 'Frequently', points: 4 },
      { label: 'Consistently', points: 6 }
    ]
  },
  {
    id: 'SKILL-009',
    category: 'skill',
    question: 'Can you hit an overhead smash to finish a point?',
    choices: [
      { label: 'Rarely', points: 1 },
      { label: 'Sometimes', points: 2 },
      { label: 'Frequently', points: 4 },
      { label: 'Consistently', points: 6 }
    ]
  },
  {
    id: 'SKILL-010',
    category: 'skill',
    question: 'Can you maintain control during fast kitchen exchanges?',
    choices: [
      { label: 'Rarely', points: 1 },
      { label: 'Sometimes', points: 2 },
      { label: 'Frequently', points: 4 },
      { label: 'Consistently', points: 6 }
    ]
  },

  // Category C - Strategy & Game Knowledge
  {
    id: 'STRAT-001',
    category: 'strategy',
    question: 'What is usually the preferred third shot after serving?',
    choices: [
      { label: 'Drive every time', points: 2 },
      { label: 'Third-shot drop', points: 6 },
      { label: 'Lob', points: 1 },
      { label: 'Any shot is equally effective', points: 1 }
    ]
  },
  {
    id: 'STRAT-002',
    category: 'strategy',
    question: 'After serving, where should you generally move?',
    choices: [
      { label: 'Stay at the baseline', points: 1 },
      { label: 'Advance toward the kitchen line', points: 6 },
      { label: 'Stand in mid-court', points: 2 },
      { label: 'Move to the sideline', points: 1 }
    ]
  },
  {
    id: 'STRAT-003',
    category: 'strategy',
    question:
      'During a dink rally, your opponent pops the ball up. What is usually the best response?',
    choices: [
      { label: 'Continue dinking', points: 2 },
      { label: 'Attack the ball', points: 6 },
      { label: 'Retreat', points: 1 },
      { label: 'Lob', points: 1 }
    ]
  },
  {
    id: 'STRAT-004',
    category: 'strategy',
    question: 'What is the primary purpose of a third-shot drop?',
    choices: [
      { label: 'Win the point immediately', points: 1 },
      { label: 'Reach the kitchen safely', points: 6 },
      { label: 'Force an overhead smash', points: 1 },
      { label: 'Slow down the game', points: 3 }
    ]
  },
  {
    id: 'STRAT-005',
    category: 'strategy',
    question: 'When under pressure, what is usually the highest percentage play?',
    choices: [
      { label: 'Hit harder', points: 1 },
      { label: 'Attempt a winner', points: 1 },
      { label: 'Reset the ball', points: 6 },
      { label: 'Lob every time', points: 2 }
    ]
  },
  {
    id: 'STRAT-006',
    category: 'strategy',
    question: 'In doubles, where should partners generally position themselves?',
    choices: [
      { label: 'One at baseline, one at kitchen', points: 2 },
      { label: 'Side by side', points: 6 },
      { label: 'Opposite corners', points: 1 },
      { label: 'Random positioning', points: 1 }
    ]
  },

  // Category D - Competition
  {
    id: 'COMP-001',
    category: 'competition',
    question: 'Have you participated in pickleball tournaments?',
    choices: [
      { label: 'Never', points: 1 },
      { label: '1–2 tournaments', points: 3 },
      { label: '3–10 tournaments', points: 5 },
      { label: 'More than 10 tournaments', points: 6 }
    ]
  },
  {
    id: 'COMP-002',
    category: 'competition',
    question: 'What is your best tournament finish?',
    choices: [
      { label: 'Never competed', points: 1 },
      { label: 'Participation only', points: 2 },
      { label: 'Quarterfinalist', points: 3 },
      { label: 'Semifinalist', points: 4 },
      { label: 'Medalist', points: 5 },
      { label: 'Champion', points: 6 }
    ]
  },
  {
    id: 'COMP-003',
    category: 'competition',
    question: 'Have you played against officially rated players?',
    choices: [
      { label: 'Never', points: 1 },
      { label: 'Occasionally', points: 3 },
      { label: 'Frequently', points: 6 }
    ]
  },
  {
    id: 'COMP-004',
    category: 'competition',
    question: 'How often do you play organized competitive matches?',
    choices: [
      { label: 'Never', points: 1 },
      { label: 'Occasionally', points: 2 },
      { label: 'Monthly', points: 4 },
      { label: 'Weekly', points: 6 }
    ]
  },
  {
    id: 'COMP-005',
    category: 'competition',
    question: 'Have you won a local pickleball event?',
    choices: [
      { label: 'Never', points: 1 },
      { label: 'Once', points: 4 },
      { label: 'Multiple times', points: 6 }
    ]
  },

  // Category E - Self Assessment
  {
    id: 'SELF-001',
    category: 'self-assessment',
    question: 'Against the players you normally play with, how often do you win?',
    choices: [
      { label: 'Rarely', points: 1 },
      { label: 'About half the time', points: 3 },
      { label: 'Most of the time', points: 5 },
      { label: 'Almost always', points: 6 }
    ]
  },
  {
    id: 'SELF-002',
    category: 'self-assessment',
    question: 'What level best describes most of the players you regularly compete against?',
    choices: [
      { label: 'Beginners', points: 1 },
      { label: 'Recreational players', points: 2 },
      { label: 'Intermediate players', points: 3 },
      { label: 'Advanced players', points: 5 },
      { label: 'Tournament players', points: 6 }
    ]
  },
  {
    id: 'SELF-003',
    category: 'self-assessment',
    question: 'How would your regular playing partners rate your skill level?',
    choices: [
      { label: 'Beginner', points: 1 },
      { label: 'Intermediate', points: 3 },
      { label: 'Advanced', points: 5 },
      { label: 'Tournament-level', points: 6 }
    ]
  },
  {
    id: 'SELF-004',
    category: 'self-assessment',
    question: 'Are you usually among the strongest players on your court?',
    choices: [
      { label: 'Rarely', points: 1 },
      { label: 'Sometimes', points: 2 },
      { label: 'Frequently', points: 4 },
      { label: 'Almost always', points: 6 }
    ]
  },
  {
    id: 'SELF-005',
    category: 'self-assessment',
    question: 'How would you currently classify yourself?',
    choices: [
      { label: 'Beginner', points: 1 },
      { label: 'Lower Intermediate', points: 2 },
      { label: 'Intermediate', points: 3 },
      { label: 'Advanced', points: 5 },
      { label: 'Tournament Player', points: 6 }
    ]
  }
]

export interface QuestionSelection {
  experience: AssessmentQuestion[]
  skill: AssessmentQuestion[]
  strategy: AssessmentQuestion[]
  competition: AssessmentQuestion[]
  selfAssessment: AssessmentQuestion[]
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export function selectRandomQuestions(): AssessmentQuestion[] {
  const byCategory: Record<QuestionCategory, AssessmentQuestion[]> = {
    experience: [],
    skill: [],
    strategy: [],
    competition: [],
    'self-assessment': []
  }

  for (const q of QUESTION_BANK) {
    byCategory[q.category].push(q)
  }

  const selected: AssessmentQuestion[] = []

  selected.push(shuffleArray(byCategory.experience)[0])
  selected.push(...shuffleArray(byCategory.skill).slice(0, 3))
  selected.push(shuffleArray(byCategory.strategy)[0])
  selected.push(shuffleArray(byCategory.competition)[0])
  selected.push(shuffleArray(byCategory['self-assessment'])[0])

  return shuffleArray(selected)
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

export function calculateInitialRating(answers: Record<string, number>): number {
  const points = Object.values(answers)
  if (points.length === 0) return 2.5

  const totalPoints = points.reduce((sum, p) => sum + p, 0)
  const maxPossible = points.length * 6
  const minPossible = points.length * 1

  const normalized = (totalPoints - minPossible) / (maxPossible - minPossible)
  const rating = 2.0 + normalized * 4.0

  return Math.round(rating * 100) / 100
}

import { selectRandomQuestions } from '~/server/domains/rating/data/question-bank'

export default defineEventHandler(() => {
  const questions = selectRandomQuestions()

  return {
    data: questions.map((q) => ({
      id: q.id,
      category: q.category,
      question: q.question,
      choices: q.choices.map((c) => c.label)
    })),
    request_id: crypto.randomUUID()
  }
})

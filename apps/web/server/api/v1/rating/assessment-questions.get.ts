import { getAssessmentQuestions } from '~/server/domains/rating/data/question-bank'

export default defineEventHandler(() => {
  // Choice scores stay server-side: the client only ever sees labels, so the
  // ladder cannot be read off the payload and gamed.
  const questions = getAssessmentQuestions()

  return {
    data: questions.map((q) => ({
      id: q.id,
      category: q.category,
      question: q.question,
      // Presentation shape travels with the question instead of being guessed
      // from label length in the client — see QuestionKind.
      kind: q.kind,
      choices: q.choices.map((c) => c.label)
    })),
    request_id: crypto.randomUUID()
  }
})

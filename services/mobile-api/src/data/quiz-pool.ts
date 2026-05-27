/**
 * Quiz pool dispatcher.
 *
 * The /v1/quiz routes ship one of two static question catalogues — RO or ES —
 * selected by a `country` query/body param. Both pools share the same
 * `StaticQuizQuestion` shape (declared in each pool file), and IDs are FRESH
 * UUIDs that don't collide across pools, so a question is always uniquely
 * associated with the pool it came from.
 *
 * This module is the single switch point: routes never import either pool
 * directly, so swapping pools or adding a third country only touches this
 * file and the route signature.
 */

import type { QuizCountry } from '@defensivepedal/core';

import {
  QUIZ_QUESTIONS,
  type StaticQuizQuestion,
} from './quiz-questions';
import { QUIZ_QUESTIONS_ES } from './quiz-questions-es';

export type { StaticQuizQuestion } from './quiz-questions';

/** Return the static question pool for the given country. */
export const getQuizPool = (country: QuizCountry): readonly StaticQuizQuestion[] => {
  switch (country) {
    case 'ES':
      return QUIZ_QUESTIONS_ES;
    case 'RO':
    default:
      return QUIZ_QUESTIONS;
  }
};

/**
 * Look up a question by its stable UUID in the given country's pool.
 *
 * Returns `undefined` if the id isn't present in that pool — including the
 * case where it exists in the OTHER pool. Callers should treat this as
 * "question not found" without falling back to a cross-pool sweep: the client
 * is responsible for remembering which country a question was fetched under
 * and submitting answers with that same country.
 */
export const findQuizQuestionInPool = (
  country: QuizCountry,
  id: string,
): StaticQuizQuestion | undefined => getQuizPool(country).find((q) => q.id === id);

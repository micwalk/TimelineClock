// The lemon log (domain/lemons): the question waiting for an answer, and every answer given.
import { create } from 'zustand'
import { loadJson, saveJson } from './storage.ts'
import type { LemonAsk, LemonEntry } from '../domain/lemons.ts'
import { newLemonId, sanitizeLemons } from '../domain/lemons.ts'

const LEMONS_KEY = 'timeline.lemons.v1'

export interface LemonsState {
  log: LemonEntry[]
  /** The question on screen, or null. Not saved: closing the app forgets an unanswered one. */
  asking: LemonAsk | null
}

export const useLemons = create<LemonsState>(() => ({ log: sanitizeLemons(loadJson<unknown>(LEMONS_KEY, [])), asking: null }))

useLemons.subscribe((s, prev) => { if (s.log !== prev.log) saveJson(LEMONS_KEY, s.log) })

export const lemons = {
  /** Asks (once at a time: a question already on screen stays). */
  ask: (a: LemonAsk) => useLemons.setState(s => (s.asking ? {} : { asking: a })),
  /** Keeps the answer, with what you had written, and closes the question. */
  answer(sour: boolean, now = Date.now()) {
    const a = useLemons.getState().asking
    if (!a) return
    useLemons.setState(s => ({ asking: null, log: [...s.log, { id: newLemonId(), ts: now, sour, text: a.text, kind: a.kind }] }))
  },
  /** Closes the question without an answer (nothing is kept). */
  dismiss: () => useLemons.setState({ asking: null }),
  setLog: (log: LemonEntry[]) => useLemons.setState({ log }),
}

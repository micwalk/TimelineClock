// The bundled alarm sounds (#18), made with Web Audio: the web app plays these, and the same code
// renders the Android app's channel sounds (android/app/src/main/res/raw/tone_*.ogg, made with
// scripts/render-tones.mjs), so a tone sounds the same in both. Which alarm plays which: domain/sounds.
//
// Each preset schedules one pass of itself from `t` into `out` and returns its sources (so a
// stop can cut them). An alarm tone repeats every `cycle` seconds until answered; the chime
// plays once.
import type { AlarmSound } from '../domain/sounds.ts'

export interface TonePreset {
  /** What it sounds like ("Beacon"); the slot's own name is domain/sounds soundSlotName. */
  name: string
  /** Seconds from one pass to the next while it rings (the chime: how long it lasts). */
  cycle: number
  play(ctx: BaseAudioContext, out: AudioNode, t: number): AudioScheduledSourceNode[]
}

/** One oscillator note: `type` at `freq`, a quick attack and an exponential decay over `len` s. */
function note(ctx: BaseAudioContext, out: AudioNode, t: number, freq: number, len: number, peak: number, type: OscillatorType = 'sine', attack = 0.005): OscillatorNode {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(peak, t + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + len)
  osc.connect(gain)
  gain.connect(out)
  osc.start(t)
  osc.stop(t + len + 0.02)
  osc.onended = () => { osc.disconnect(); gain.disconnect() }
  return osc
}

/** A struck bell or bar: partials at `ratios` of `freq`, the higher ones dying away sooner. */
function struck(ctx: BaseAudioContext, out: AudioNode, t: number, freq: number, len: number, peak: number, ratios: readonly number[], weights: readonly number[]): OscillatorNode[] {
  return ratios.map((r, k) => note(ctx, out, t, freq * r, len / (1 + k * 0.9), peak * weights[k], 'sine', 0.002))
}

const BELL = [1, 2.76, 5.4, 8.93] as const
const BELL_W = [1, 0.45, 0.22, 0.1] as const
const BAR = [1, 3.93, 9.2] as const
const BAR_W = [1, 0.3, 0.08] as const

/** Note frequency from MIDI number. */
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12)

export const TONE_PRESETS: Record<AlarmSound, TonePreset> = {
  /**
   * The app's first alarm, cleaned up: a falling three-step ring with vibrato. No low hum (phone
   * speakers can't play it and rattle), steps that glide instead of jumping (no clicks), and
   * voices that stay well under full scale together.
   */
  tone1: {
    name: 'Classic',
    cycle: 1.6,
    play(ctx, out, t) {
      const len = 1.2
      const vib = ctx.createOscillator()
      const vibGain = ctx.createGain()
      vib.frequency.setValueAtTime(6, t)
      vibGain.gain.setValueAtTime(8, t)
      vib.connect(vibGain)
      const voices: [OscillatorType, number[], number][] = [['sine', [800, 600, 400], 0.5], ['triangle', [1200, 900, 600], 0.22]]
      const oscs = voices.map(([type, steps, peak]) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = type
        osc.frequency.setValueAtTime(steps[0], t)
        steps.slice(1).forEach((f, k) => {
          osc.frequency.setValueAtTime(steps[k], t + (k + 1) * 0.1 - 0.015)
          osc.frequency.exponentialRampToValueAtTime(f, t + (k + 1) * 0.1)
        })
        vibGain.connect(osc.frequency)
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(peak, t + 0.03)
        gain.gain.exponentialRampToValueAtTime(0.001, t + len)
        osc.connect(gain)
        gain.connect(out)
        osc.start(t)
        osc.stop(t + len)
        osc.onended = () => { osc.disconnect(); gain.disconnect() }
        return osc
      })
      vib.start(t)
      vib.stop(t + len)
      vib.onended = () => { vib.disconnect(); vibGain.disconnect() }
      return [...oscs, vib]
    },
  },
  /** Three rising bell pings, a beat of quiet, again: bright, hard to sleep through, not harsh. */
  tone2: {
    name: 'Beacon',
    cycle: 1.5,
    play(ctx, out, t) {
      return [72, 76, 79].flatMap((n, k) => struck(ctx, out, t + k * 0.16, midi(n + 12), 0.9, 0.42, BELL, BELL_W))
    },
  },
  /** A rolling marimba figure up and back down a pentatonic scale. */
  tone3: {
    name: 'Marimba',
    cycle: 1.92,
    play(ctx, out, t) {
      const figure = [67, 71, 74, 79, 74, 71, 72, 76]
      return figure.flatMap((n, k) => struck(ctx, out, t + k * 0.13, midi(n), 0.5, k === 3 ? 0.55 : 0.42, BAR, BAR_W))
    },
  },
  /** Urgent two-tone pulses, buzzy through a filter: for heavy sleepers. */
  tone4: {
    name: 'Klaxon',
    cycle: 1.2,
    play(ctx, out, t) {
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(2400, t)
      filter.Q.setValueAtTime(4, t)
      filter.connect(out)
      const sources = [0, 1, 2, 3].flatMap(k => {
        const at = t + k * 0.22
        const f = k % 2 === 0 ? 880 : 660
        return [note(ctx, filter, at, f, 0.18, 0.4, 'sawtooth', 0.004), note(ctx, filter, at, f * 1.007, 0.18, 0.28, 'square', 0.004)]
      })
      sources[sources.length - 1].addEventListener('ended', () => filter.disconnect())
      return sources
    },
  },
  /** Two glassy bell notes, falling a fourth, ringing out. */
  chime: {
    name: 'Glass',
    cycle: 2.2,
    play(ctx, out, t) {
      return [...struck(ctx, out, t, midi(88), 1.8, 0.4, BELL, BELL_W), ...struck(ctx, out, t + 0.22, midi(83), 2, 0.4, BELL, BELL_W)]
    },
  },
}

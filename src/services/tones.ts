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
   * The app's first alarm, cleaned up: a falling three-step ring with vibrato. Pitched where phone
   * speakers play cleanly (nothing under 600 Hz for them to buzz on), pure sines an octave apart
   * (no stack of harmonics to rasp), a vibrato in cents so both voices wobble together and stay
   * in tune, steps that glide instead of jumping (no clicks), and well under full scale.
   */
  tone1: {
    name: 'Classic',
    cycle: 1.6,
    play(ctx, out, t) {
      const len = 1.2
      const vib = ctx.createOscillator()
      const vibGain = ctx.createGain()
      vib.frequency.setValueAtTime(6, t)
      vibGain.gain.setValueAtTime(18, t) // cents
      vib.connect(vibGain)
      const voices: [OscillatorType, number[], number][] = [['sine', [1200, 900, 600], 0.5], ['sine', [2400, 1800, 1200], 0.14]]
      const oscs = voices.map(([type, steps, peak]) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = type
        osc.frequency.setValueAtTime(steps[0], t)
        steps.slice(1).forEach((f, k) => {
          osc.frequency.setValueAtTime(steps[k], t + (k + 1) * 0.1 - 0.015)
          osc.frequency.exponentialRampToValueAtTime(f, t + (k + 1) * 0.1)
        })
        vibGain.connect(osc.detune)
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

/**
 * A natural trumpet note: bright (two saws and a square through a low-pass that flares open on
 * the attack), a lip "scoop" up into the pitch, tongued (a crisp start, a short clean release),
 * and a slow vibrato that grows on held notes.
 */
function trumpet(ctx: BaseAudioContext, out: AudioNode, t: number, freq: number, len: number, peak: number): AudioScheduledSourceNode[] {
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 0.9
  filter.frequency.setValueAtTime(freq * 3, t)
  filter.frequency.linearRampToValueAtTime(freq * 11, t + 0.03)
  filter.frequency.exponentialRampToValueAtTime(freq * 6, t + Math.min(0.25, len))
  const gain = ctx.createGain()
  const release = Math.min(0.07, len * 0.35)
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(peak, t + 0.018)
  gain.gain.linearRampToValueAtTime(peak * 0.82, t + Math.min(0.12, len - release))
  gain.gain.setValueAtTime(peak * 0.82, t + len - release)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + len)
  filter.connect(gain)
  gain.connect(out)
  const sources: AudioScheduledSourceNode[] = []
  const held = len > 0.5
  const vib = held ? ctx.createOscillator() : null
  const vibDepth = held ? ctx.createGain() : null
  if (vib && vibDepth) {
    vib.frequency.value = 5.2
    vibDepth.gain.setValueAtTime(0, t)
    vibDepth.gain.setValueAtTime(0, t + 0.25)
    vibDepth.gain.linearRampToValueAtTime(16, t + len) // cents
    vib.connect(vibDepth)
    vib.start(t)
    vib.stop(t + len + 0.05)
    sources.push(vib)
  }
  for (const [type, detune, level] of [['sawtooth', -5, 0.34], ['sawtooth', 5, 0.34], ['square', 0, 0.14]] as const) {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    // The scoop: from a little under the note up onto it.
    osc.frequency.setValueAtTime(freq * 2 ** (-45 / 1200), t)
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.035)
    osc.detune.setValueAtTime(detune, t)
    if (vibDepth) vibDepth.connect(osc.detune)
    g.gain.value = level
    osc.connect(g)
    g.connect(filter)
    osc.start(t)
    osc.stop(t + len + 0.05)
    osc.onended = () => { osc.disconnect(); g.disconnect() }
    sources.push(osc)
  }
  sources[sources.length - 1].addEventListener('ended', () => { filter.disconnect(); gain.disconnect(); vibDepth?.disconnect() })
  return sources
}

/** A hall to play in: a short reverb from decaying noise (stereo), mixed in at `wet`. Returns the node to play into. */
function hall(ctx: BaseAudioContext, out: AudioNode, seconds: number, wet: number): AudioNode {
  const input = ctx.createGain()
  const verb = ctx.createConvolver()
  const n = Math.floor(ctx.sampleRate * seconds)
  const ir = ctx.createBuffer(2, n, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3
  }
  verb.buffer = ir
  const wetGain = ctx.createGain()
  wetGain.gain.value = wet
  input.connect(out)
  input.connect(verb)
  verb.connect(wetGain)
  wetGain.connect(out)
  return input
}

/** Natural trumpet notes (the harmonics of C): no valves, so it sounds like a herald's. */
const G4 = midi(67)
const C5 = midi(72)
const E5 = midi(76)
const G5 = midi(79)

/**
 * The Done fanfare (docs/prd_todos.md §7.2): a herald's trumpet call, as for royal news (an
 * original call on the natural trumpet's notes): tongued triplets on G rising to C, a quick
 * C–E arpeggio, then a held C major chord in three trumpets, in a little hall.
 */
export const FANFARE: TonePreset = {
  name: 'Fanfare',
  cycle: 3.2,
  play(ctx, out, t) {
    const room = hall(ctx, out, 1.4, 0.3)
    const lead = (at: number, f: number, len: number) => trumpet(ctx, room, t + at, f, len, 0.42)
    const second = (at: number, f: number, len: number) => trumpet(ctx, room, t + at, f, len, 0.24)
    const sources = [
      ...lead(0, G4, 0.1), ...lead(0.12, G4, 0.1), ...lead(0.24, G4, 0.1),
      ...lead(0.36, C5, 0.4), ...second(0.36, G4, 0.4),
      ...lead(0.82, G4, 0.12), ...lead(0.96, C5, 0.12), ...lead(1.1, E5, 0.12),
      ...lead(1.24, G5, 1.15), ...second(1.24, E5, 1.15), ...second(1.24, C5, 1.15),
    ]
    // Keeps the hall's tail from being cut when the last note ends (playPreset lets go once every source has).
    const tail = ctx.createConstantSource()
    tail.offset.value = 0
    tail.connect(room)
    tail.start(t)
    tail.stop(t + 1.24 + 1.15 + 1.4)
    tail.onended = () => { tail.disconnect(); room.disconnect() }
    return [...sources, tail]
  },
}

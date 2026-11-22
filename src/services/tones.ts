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
 * Shelved (owner, 2026-11-22: Done plays the sci-fi charge and ding instead; kept to try again).
 * The Done fanfare (docs/prd_todos.md §7.2): a herald's trumpet call, as for royal news (an
 * original call on the natural trumpet's notes): a quick pickup up the C major arpeggio (G, C, E)
 * landing on a held C major chord in three trumpets, in a little hall (owner, 2026-11-21: the
 * call's second half alone).
 */
export const FANFARE: TonePreset = {
  name: 'Fanfare',
  cycle: 2.2,
  play(ctx, out, t) {
    const room = hall(ctx, out, 1.4, 0.3)
    const lead = (at: number, f: number, len: number) => trumpet(ctx, room, t + at, f, len, 0.42)
    const second = (at: number, f: number, len: number) => trumpet(ctx, room, t + at, f, len, 0.24)
    const hold = 1.05
    const sources = [
      // A pickup up the C major arpeggio, a touch broader into the top note…
      ...lead(0, G4, 0.11), ...lead(0.13, C5, 0.11), ...lead(0.27, E5, 0.13),
      // …which lands on a held C major chord in three trumpets: G on top, E and C under it.
      ...lead(0.43, G5, hold), ...second(0.43, E5, hold), ...second(0.43, C5, hold),
    ]
    // Keeps the hall's tail from being cut when the last note ends (playPreset lets go once every source has).
    const tail = ctx.createConstantSource()
    tail.offset.value = 0
    tail.connect(room)
    tail.start(t)
    tail.stop(t + 0.43 + hold + 1.4)
    tail.onended = () => { tail.disconnect(); room.disconnect() }
    return [...sources, tail]
  },
}

/** `seconds` of white noise, as a source started at `t` (stopped at its end). */
function noise(ctx: BaseAudioContext, t: number, seconds: number): AudioBufferSourceNode {
  const n = Math.max(1, Math.floor(ctx.sampleRate * seconds))
  const buf = ctx.createBuffer(1, n, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.start(t)
  src.stop(t + seconds)
  return src
}

/**
 * The Done box charging (owner, 2026-11-22: a sci-fi swoosh, air sucked in, before the ding):
 * noise through a band that sweeps up, swelling the way a sound played backwards does and cut
 * short at the pop, over a faint power-up whine gliding up. `seconds`: the charge's length.
 */
export function doneCharge(seconds: number): TonePreset {
  return {
    name: 'Charge',
    cycle: seconds,
    play(ctx, out, t) {
      const end = t + seconds
      const air = noise(ctx, t, seconds + 0.03)
      const band = ctx.createBiquadFilter()
      band.type = 'bandpass'
      band.frequency.setValueAtTime(350, t)
      band.frequency.exponentialRampToValueAtTime(4200, end)
      band.Q.setValueAtTime(0.9, t)
      band.Q.linearRampToValueAtTime(3.5, end)
      const airGain = ctx.createGain()
      airGain.gain.setValueAtTime(0.0001, t)
      airGain.gain.exponentialRampToValueAtTime(0.9, end)
      airGain.gain.linearRampToValueAtTime(0.0001, end + 0.025)
      air.connect(band)
      band.connect(airGain)
      airGain.connect(out)
      const whine = ctx.createOscillator()
      const whineGain = ctx.createGain()
      whine.type = 'sine'
      whine.frequency.setValueAtTime(420, t)
      whine.frequency.exponentialRampToValueAtTime(1650, end)
      whineGain.gain.setValueAtTime(0.0001, t)
      whineGain.gain.exponentialRampToValueAtTime(0.1, end)
      whineGain.gain.linearRampToValueAtTime(0.0001, end + 0.025)
      whine.connect(whineGain)
      whineGain.connect(out)
      whine.start(t)
      whine.stop(end + 0.03)
      whine.onended = () => { whine.disconnect(); whineGain.disconnect() }
      air.onended = () => { air.disconnect(); band.disconnect(); airGain.disconnect() }
      return [air, whine]
    },
  }
}

const E6 = midi(88)

/**
 * The Done ding (owner, 2026-11-22): one bright, glassy strike on the pop. A bell on E6 with
 * near-harmonic partials (glass more than iron), a twin a few cents off for a shimmer, a quick
 * glide down onto the note for a sci-fi edge, in a little hall.
 */
export const DONE_DING: TonePreset = {
  name: 'Ding',
  cycle: 1.8,
  play(ctx, out, t) {
    const room = hall(ctx, out, 1.3, 0.35)
    const ratios = [1, 2, 3.01, 4.2] as const
    const weights = [0.5, 0.2, 0.08, 0.04] as const
    const sources: AudioScheduledSourceNode[] = [
      ...struck(ctx, room, t, E6, 1.4, 1, ratios, weights),
      ...struck(ctx, room, t, E6 * 2 ** (6 / 1200), 1.1, 0.5, ratios, weights),
    ]
    // The edge: a short sine falling an octave onto the note.
    const zap = ctx.createOscillator()
    const zapGain = ctx.createGain()
    zap.frequency.setValueAtTime(E6 * 2, t)
    zap.frequency.exponentialRampToValueAtTime(E6, t + 0.05)
    zapGain.gain.setValueAtTime(0.18, t)
    zapGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
    zap.connect(zapGain)
    zapGain.connect(room)
    zap.start(t)
    zap.stop(t + 0.1)
    zap.onended = () => { zap.disconnect(); zapGain.disconnect() }
    const tail = ctx.createConstantSource()
    tail.offset.value = 0
    tail.connect(room)
    tail.start(t)
    tail.stop(t + 1.4 + 1.3)
    tail.onended = () => { tail.disconnect(); room.disconnect() }
    return [...sources, zap, tail]
  },
}

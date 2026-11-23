import type { AlarmSound } from '../domain/sounds.ts'
import { TONE_PRESETS } from './tones.ts'
import type { TonePreset } from './tones.ts'

/**
 * Plays the alarm sounds (services/tones): a tone over and over while alarms ring, and a sound
 * once (a chime, or a preview in Settings).
 */
export class AlarmAudioManager {
  private audioContext: AudioContext | null = null
  private masterGain: GainNode | null = null
  private alarmIntervalId: number | null = null
  private isAlarmPlaying: boolean = false
  private alarmSound: AlarmSound | null = null
  private hasRingingAlarmsCallback: (() => boolean) | null = null
  private isContextPrimed: boolean = false
  private activeSources: AudioScheduledSourceNode[] = []
  /** What playOnce is playing (a new one, or a stop, cuts it). */
  private onceSources: AudioScheduledSourceNode[] = []

  private readonly FADE_IN_TIME = 0.1 // seconds
  private readonly MASTER_LEVEL = 0.8

  /**
   * Initialize the audio context (should be called on user gesture)
   */
  public initializeAudioContext(): void {
    if (this.audioContext) return // Already initialized

    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.audioContext = new AudioContextClass()
      this.masterGain = this.audioContext.createGain()
      this.masterGain.connect(this.audioContext.destination)
      this.masterGain.gain.setValueAtTime(0, this.audioContext.currentTime)
      this.isContextPrimed = true
    } catch (error) {
      console.warn('Could not initialize audio context:', error)
    }
  }

  /**
   * Prime the audio context for autoplay (call on any user interaction)
   */
  public primeAudioContext(): void {
    if (!this.audioContext || this.isContextPrimed) return

    try {
      // Resume context if suspended
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume()
      }

      // Create a brief silent oscillator to prime the context
      const silentOsc = this.audioContext.createOscillator()
      const silentGain = this.audioContext.createGain()
      silentGain.gain.setValueAtTime(0, this.audioContext.currentTime)
      silentOsc.connect(silentGain)
      silentGain.connect(this.audioContext.destination)
      silentOsc.start(this.audioContext.currentTime)
      silentOsc.stop(this.audioContext.currentTime + 0.001)

      this.isContextPrimed = true
    } catch (error) {
      console.warn('Could not prime audio context:', error)
    }
  }

  /** The context, made and resumed if need be; null without Web Audio. */
  private ready(): AudioContext | null {
    if (!this.audioContext) this.initializeAudioContext()
    const ctx = this.audioContext
    if (ctx?.state === 'suspended') void ctx.resume()
    return ctx
  }

  /**
   * Rings `sound` over and over until stopped (or until `hasRingingAlarmsCallback` says nothing
   * rings any more). Already ringing, it switches to `sound`: the latest alarm's tone plays.
   */
  public startAlarmSound(sound: AlarmSound = 'tone1', hasRingingAlarmsCallback?: () => boolean): void {
    if (this.isAlarmPlaying && this.alarmSound === sound) return
    if (this.isAlarmPlaying) this.stopAlarmSound()
    const ctx = this.ready()
    if (!ctx || !this.masterGain) {
      console.warn('Audio context not available')
      return
    }

    this.isAlarmPlaying = true
    this.alarmSound = sound
    this.hasRingingAlarmsCallback = hasRingingAlarmsCallback || null
    this.activeSources = []

    const now = ctx.currentTime
    this.masterGain.gain.cancelScheduledValues(now)
    this.masterGain.gain.setValueAtTime(0, now)
    this.masterGain.gain.linearRampToValueAtTime(this.MASTER_LEVEL, now + this.FADE_IN_TIME)
    this.schedulePass(now)

    this.alarmIntervalId = window.setInterval(() => {
      if (!this.isAlarmPlaying) return
      if (this.hasRingingAlarmsCallback && !this.hasRingingAlarmsCallback()) {
        this.stopAlarmSound()
        return
      }
      if (this.audioContext) this.schedulePass(this.audioContext.currentTime)
    }, TONE_PRESETS[sound].cycle * 1000)
  }

  /**
   * Stop the repeating alarm sound
   */
  public stopAlarmSound(): void {
    this.isAlarmPlaying = false
    this.alarmSound = null

    if (this.alarmIntervalId) {
      clearInterval(this.alarmIntervalId)
      this.alarmIntervalId = null
    }

    // Immediately silence and cancel future ramps
    if (this.audioContext && this.masterGain) {
      const now = this.audioContext.currentTime
      try { this.masterGain.gain.cancelScheduledValues(now) } catch (err) { console.warn('gain cancelScheduledValues failed', err) }
      try {
        // A very quick fade avoids clicks
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now)
        this.masterGain.gain.linearRampToValueAtTime(0, now + 0.03)
      } catch (err) { console.warn('gain ramp to 0 failed', err) }
    }
    this.activeSources = stopAll(this.activeSources, this.audioContext ? this.audioContext.currentTime + 0.04 : 0)
  }

  /** One pass of the ringing tone from `startTime`. */
  private schedulePass(startTime: number): void {
    if (!this.audioContext || !this.masterGain || !this.alarmSound || !this.isAlarmPlaying) return
    try {
      const sources = TONE_PRESETS[this.alarmSound].play(this.audioContext, this.masterGain, startTime)
      this.activeSources = [...this.activeSources, ...sources]
      for (const s of sources) s.addEventListener('ended', () => { this.activeSources = this.activeSources.filter(x => x !== s) })
    } catch (error) {
      console.warn('Could not schedule alarm sound:', error)
    }
  }

  /**
   * Plays `sound` once (a chime as it sounds, or a preview), cutting the last one played once.
   * `onEnded` is called when it has played out or been cut. Returns whether it plays.
   */
  public playOnce(sound: AlarmSound, onEnded?: () => void): boolean {
    const ctx = this.ready()
    if (!ctx) return false
    this.stopOnce()
    try {
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(this.MASTER_LEVEL, ctx.currentTime)
      gain.connect(ctx.destination)
      const sources = TONE_PRESETS[sound].play(ctx, gain, ctx.currentTime)
      this.onceSources = sources
      let left = sources.length
      for (const s of sources) s.addEventListener('ended', () => { if (--left === 0) { gain.disconnect(); onEnded?.() } })
      return true
    } catch (error) {
      console.warn('Could not play sound:', error)
      return false
    }
  }

  /** Plays a preset that isn't an alarm sound (the Done fanfare) once, at `volume` (0–1) of the alarm level; it overlaps nothing it would cut. */
  public playPreset(preset: TonePreset, volume = 1): void {
    const ctx = this.ready()
    if (!ctx || volume <= 0) return
    try {
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(this.MASTER_LEVEL * Math.min(1, volume), ctx.currentTime)
      gain.connect(ctx.destination)
      const sources = preset.play(ctx, gain, ctx.currentTime + 0.02)
      let left = sources.length
      for (const s of sources) s.addEventListener('ended', () => { if (--left === 0) gain.disconnect() })
    } catch (error) {
      console.warn('Could not play sound:', error)
    }
  }

  /** Cuts what playOnce is playing. */
  public stopOnce(): void {
    this.onceSources = stopAll(this.onceSources, this.audioContext?.currentTime ?? 0)
  }

  /**
   * Check if alarm sound is currently playing
   */
  public isPlaying(): boolean {
    return this.isAlarmPlaying
  }

  /**
   * Check if audio context is available and primed
   */
  public isAudioReady(): boolean {
    return this.audioContext !== null && this.isContextPrimed
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    this.stopAlarmSound()
    this.stopOnce()

    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    this.masterGain = null
    this.isContextPrimed = false
  }
}

/** Stops every source at `at` (each disconnects itself as it ends); returns the empty list. */
function stopAll(sources: readonly AudioScheduledSourceNode[], at: number): AudioScheduledSourceNode[] {
  for (const s of sources) {
    try { s.stop(at) } catch (err) { console.warn('source stop failed', err) }
  }
  return []
}

/**
 * Manages alarm audio playback and sound generation with improved audio quality and efficiency
 */
export class AlarmAudioManager {
  private audioContext: AudioContext | null = null
  private masterGain: GainNode | null = null
  private alarmIntervalId: number | null = null
  private isAlarmPlaying: boolean = false
  private hasRingingAlarmsCallback: (() => boolean) | null = null
  private isContextPrimed: boolean = false
  private activeSources: AudioScheduledSourceNode[] = []
  private activeNodes: AudioNode[] = []

  // Audio parameters
  private readonly FADE_IN_TIME = 0.1 // seconds
  private readonly FADE_OUT_TIME = 0.2 // seconds
  private readonly RING_DURATION = 1.2 // seconds
  private readonly SILENCE_DURATION = 0.4 // seconds
  private readonly TOTAL_CYCLE = this.RING_DURATION + this.SILENCE_DURATION

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

  /**
   * Start repeating alarm sound
   */
  public startAlarmSound(hasRingingAlarmsCallback?: () => boolean): void {
    if (this.isAlarmPlaying) return // Already playing
    
    // Ensure audio context is ready
    if (!this.audioContext) {
      this.initializeAudioContext()
    }
    
    if (!this.audioContext || !this.masterGain) {
      console.warn('Audio context not available')
      return
    }

    this.isAlarmPlaying = true
    this.hasRingingAlarmsCallback = hasRingingAlarmsCallback || null
    this.activeSources = []
    this.activeNodes = []
    
    // Fade in master gain with higher volume
    const now = this.audioContext.currentTime
    this.masterGain.gain.setValueAtTime(0, now)
    this.masterGain.gain.linearRampToValueAtTime(0.8, now + this.FADE_IN_TIME) // Increased from 0.3 to 0.8
    
    // Play initial sound immediately
    this.scheduleAlarmSound(now)
    
    // Set up repeating interval
    this.alarmIntervalId = window.setInterval(() => {
      if (!this.isAlarmPlaying) {
        return
      }
      // Check if there are still ringing alarms
      if (this.hasRingingAlarmsCallback && !this.hasRingingAlarmsCallback()) {
        this.stopAlarmSound()
        return
      }
      
      if (this.audioContext) {
        this.scheduleAlarmSound(this.audioContext.currentTime)
      }
    }, this.TOTAL_CYCLE * 1000)
  }
  
  /**
   * Stop the repeating alarm sound
   */
  public stopAlarmSound(): void {
    this.isAlarmPlaying = false
    
    if (this.alarmIntervalId) {
      clearInterval(this.alarmIntervalId)
      this.alarmIntervalId = null
    }
    
    // Immediately silence and cancel future ramps
    if (this.audioContext && this.masterGain) {
      const now = this.audioContext.currentTime
      try { this.masterGain.gain.cancelScheduledValues(now) } catch (err) { console.warn('gain cancelScheduledValues failed', err) }
      try {
        // Prefer a very quick fade to avoid clicks
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now)
        this.masterGain.gain.linearRampToValueAtTime(0, now + Math.min(0.03, this.FADE_OUT_TIME))
      } catch (err) { console.warn('gain ramp to 0 failed', err) }
    }

    // Stop and disconnect any currently active sources/nodes
    const nowTime = this.audioContext ? this.audioContext.currentTime : 0
    for (const src of this.activeSources) {
      try { src.stop(nowTime) } catch (err) { console.warn('source stop failed', err) }
      try { (src as unknown as AudioNode).disconnect() } catch (err) { console.warn('source disconnect failed', err) }
    }
    for (const node of this.activeNodes) {
      try { node.disconnect() } catch (err) { console.warn('node disconnect failed', err) }
    }
    this.activeSources = []
    this.activeNodes = []
  }
  
  /**
   * Schedule a single alarm sound using Web Audio timing
   */
  private scheduleAlarmSound(startTime: number): void {
    if (!this.audioContext || !this.masterGain) return
    if (!this.isAlarmPlaying) return

    try {
      // Resume context if suspended
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume()
      }

      // Create multiple oscillators for rich timbre with bass
      const osc1 = this.audioContext.createOscillator() // Main tone
      const osc2 = this.audioContext.createOscillator() // Harmonic
      const osc3 = this.audioContext.createOscillator() // Bass oscillator
      const noise = this.audioContext.createBufferSource()
      
      // Create gain nodes for each oscillator
      const gain1 = this.audioContext.createGain()
      const gain2 = this.audioContext.createGain()
      const gain3 = this.audioContext.createGain() // Bass gain
      const noiseGain = this.audioContext.createGain()
      
      // Create filter for noise
      const filter = this.audioContext.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.setValueAtTime(800, startTime)
      filter.Q.setValueAtTime(2, startTime)
      
      // Create vibrato (frequency modulation)
      const vibrato = this.audioContext.createOscillator()
      const vibratoGain = this.audioContext.createGain()
      vibrato.frequency.setValueAtTime(6, startTime) // 6 Hz vibrato
      vibratoGain.gain.setValueAtTime(10, startTime) // 10 Hz modulation depth
      
      // Configure oscillators with bass frequencies
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(800, startTime)
      osc1.frequency.setValueAtTime(600, startTime + 0.1)
      osc1.frequency.setValueAtTime(400, startTime + 0.2)
      
      osc2.type = 'triangle'
      osc2.frequency.setValueAtTime(1200, startTime)
      osc2.frequency.setValueAtTime(900, startTime + 0.1)
      osc2.frequency.setValueAtTime(600, startTime + 0.2)
      
      // Bass oscillator for low frequencies
      osc3.type = 'sine' // Sawtooth has more harmonics for bass
      osc3.frequency.setValueAtTime(120, startTime) // Low bass frequency
      osc3.frequency.setValueAtTime(150, startTime + 0.1)
      osc3.frequency.setValueAtTime(180, startTime + 0.2)
      
      // Apply vibrato to all oscillators
      vibrato.connect(vibratoGain)
      vibratoGain.connect(osc1.frequency)
      vibratoGain.connect(osc2.frequency)
      vibratoGain.connect(osc3.frequency)
      
      // Create noise buffer for click
      const noiseBuffer = this.audioContext.createBuffer(1, 4410, 44100) // 0.1s of noise
      const noiseData = noiseBuffer.getChannelData(0)
      for (let i = 0; i < noiseData.length; i++) {
        noiseData[i] = (Math.random() - 0.5) * 2
      }
      noise.buffer = noiseBuffer
      
      // Volume envelopes with higher levels
      gain1.gain.setValueAtTime(0, startTime)
      gain1.gain.linearRampToValueAtTime(0.7, startTime + 0.05) // Increased from 0.2
      gain1.gain.exponentialRampToValueAtTime(0.01, startTime + this.RING_DURATION)
      
      gain2.gain.setValueAtTime(0, startTime)
      gain2.gain.linearRampToValueAtTime(0.5, startTime + 0.05) // Increased from 0.15
      gain2.gain.exponentialRampToValueAtTime(0.01, startTime + this.RING_DURATION)
      
      // Bass envelope
      gain3.gain.setValueAtTime(0, startTime)
      gain3.gain.linearRampToValueAtTime(0.5, startTime + 0.05) // Strong bass presence
      gain3.gain.exponentialRampToValueAtTime(0.01, startTime + this.RING_DURATION)
      
      noiseGain.gain.setValueAtTime(0.15, startTime) // Increased from 0.1
      noiseGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.1)
      
      // Connect the audio graph
      osc1.connect(gain1)
      osc2.connect(gain2)
      osc3.connect(gain3) 
      noise.connect(filter)
      filter.connect(noiseGain)
      
      gain1.connect(this.masterGain)
      gain2.connect(this.masterGain)
      gain3.connect(this.masterGain) 
      noiseGain.connect(this.masterGain)

      // Track active nodes to allow immediate stop
      this.activeSources = [osc1, osc2, osc3, noise, vibrato]
      this.activeNodes = [gain1, gain2, gain3, filter, noiseGain, vibratoGain]
      
      // Start all sources
      osc1.start(startTime)
      osc2.start(startTime)
      osc3.start(startTime) // Start bass oscillator
      vibrato.start(startTime)
      noise.start(startTime)
      
      // Stop all sources
      const stopTime = startTime + this.RING_DURATION
      osc1.stop(stopTime)
      osc2.stop(stopTime)
      osc3.stop(stopTime) // Stop bass oscillator
      vibrato.stop(stopTime)
      noise.stop(stopTime)
      
      // Clean up nodes after they finish
      setTimeout(() => {
        try { osc1.disconnect() } catch (err) { console.warn('osc1 disconnect failed', err) }
        try { osc2.disconnect() } catch (err) { console.warn('osc2 disconnect failed', err) }
        try { osc3.disconnect() } catch (err) { console.warn('osc3 disconnect failed', err) }
        try { gain1.disconnect() } catch (err) { console.warn('gain1 disconnect failed', err) }
        try { gain2.disconnect() } catch (err) { console.warn('gain2 disconnect failed', err) }
        try { gain3.disconnect() } catch (err) { console.warn('gain3 disconnect failed', err) }
        try { noise.disconnect() } catch (err) { console.warn('noise disconnect failed', err) }
        try { filter.disconnect() } catch (err) { console.warn('filter disconnect failed', err) }
        try { noiseGain.disconnect() } catch (err) { console.warn('noiseGain disconnect failed', err) }
        try { vibrato.disconnect() } catch (err) { console.warn('vibrato disconnect failed', err) }
        try { vibratoGain.disconnect() } catch (err) { console.warn('vibratoGain disconnect failed', err) }
        // Clear if still referencing same cycle
        this.activeSources = []
        this.activeNodes = []
      }, this.RING_DURATION * 1000 + 100)
      
    } catch (error) {
      console.warn('Could not schedule alarm sound:', error)
    }
  }

  /**
   * Play a single alarm sound (for testing)
   */
  public playAlarmSound(): void {
    if (!this.audioContext) {
      this.initializeAudioContext()
    }
    
    if (this.audioContext) {
      this.scheduleAlarmSound(this.audioContext.currentTime)
    }
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
    
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
    
    this.masterGain = null
    this.isContextPrimed = false
  }
}

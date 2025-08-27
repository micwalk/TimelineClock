/**
 * Manages alarm audio playback and sound generation
 */
export class AlarmAudioManager {
  private alarmIntervalId: number | null = null
  private isAlarmPlaying: boolean = false
  private hasRingingAlarmsCallback: (() => boolean) | null = null

  /**
   * Start repeating alarm sound
   */
  public startAlarmSound(hasRingingAlarmsCallback?: () => boolean): void {
    if (this.isAlarmPlaying) return // Already playing
    
    this.isAlarmPlaying = true
    this.hasRingingAlarmsCallback = hasRingingAlarmsCallback || null
    
    // Play initial sound immediately
    this.playAlarmSound()
    
    // Set up repeating interval (every 2 seconds)
    this.alarmIntervalId = window.setInterval(() => {
      // Check if there are still ringing alarms
      if (this.hasRingingAlarmsCallback && !this.hasRingingAlarmsCallback()) {
        this.stopAlarmSound()
        return
      }
      this.playAlarmSound()
    }, 2000)
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
  }
  
  /**
   * Play a single alarm sound
   */
  public playAlarmSound(): void {
    try {
      // Create a simple bell sound using Web Audio API
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const audioContext = new AudioContextClass()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      
      // Bell-like sound: multiple frequencies with decay
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1)
      oscillator.frequency.setValueAtTime(400, audioContext.currentTime + 0.2)
      
      // Volume envelope
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)
      
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.5)
      
      // Clean up
      setTimeout(() => {
        oscillator.disconnect()
        gainNode.disconnect()
      }, 500)
    } catch (error) {
      console.warn('Could not play alarm sound:', error)
    }
  }

  /**
   * Check if alarm sound is currently playing
   */
  public isPlaying(): boolean {
    return this.isAlarmPlaying
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    this.stopAlarmSound()
  }
}

/**
 * Alert Sound Generator
 * Creates a 3-second loud alert sound using Web Audio API
 */

let audioContext: AudioContext | null = null;

/**
 * Initialize audio context (must be called after user interaction)
 */
export function initAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
}

/**
 * Play a 3-second alert sound
 * Creates an urgent alarm-style beep pattern
 */
export function playAlertSound() {
  try {
    const ctx = initAudioContext();
    
    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;
    const duration = 3.0; // 3 seconds total
    
    // Create oscillator for the beep sound
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    // Connect nodes: oscillator -> gain -> destination
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    // Set frequency to create an urgent alarm sound (alternating high-low)
    oscillator.frequency.setValueAtTime(800, now); // Start at 800Hz
    oscillator.frequency.setValueAtTime(600, now + 0.2); // Drop to 600Hz
    oscillator.frequency.setValueAtTime(800, now + 0.4); // Back to 800Hz
    oscillator.frequency.setValueAtTime(600, now + 0.6); // Drop again
    oscillator.frequency.setValueAtTime(800, now + 0.8); // Back up
    oscillator.frequency.setValueAtTime(600, now + 1.0); // Drop
    oscillator.frequency.setValueAtTime(800, now + 1.2); // Back up
    oscillator.frequency.setValueAtTime(600, now + 1.4); // Drop
    oscillator.frequency.setValueAtTime(800, now + 1.6); // Back up
    oscillator.frequency.setValueAtTime(600, now + 1.8); // Drop
    oscillator.frequency.setValueAtTime(800, now + 2.0); // Back up
    oscillator.frequency.setValueAtTime(600, now + 2.2); // Drop
    oscillator.frequency.setValueAtTime(800, now + 2.4); // Back up
    oscillator.frequency.setValueAtTime(600, now + 2.6); // Final drop
    oscillator.frequency.setValueAtTime(800, now + 2.8); // Final rise
    
    // Set waveform to square wave for a more "alarm-like" sound
    oscillator.type = 'square';
    
    // Volume envelope - loud and consistent
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01); // Quick attack
    gainNode.gain.setValueAtTime(0.3, now + duration - 0.1); // Hold volume
    gainNode.gain.linearRampToValueAtTime(0, now + duration); // Quick fade out
    
    // Start and stop the sound
    oscillator.start(now);
    oscillator.stop(now + duration);
    
    console.log('[AlertSound] Playing 3-second alert sound');
  } catch (error) {
    console.error('[AlertSound] Failed to play sound:', error);
  }
}

/**
 * Test the alert sound (for settings page)
 */
export function testAlertSound() {
  playAlertSound();
}

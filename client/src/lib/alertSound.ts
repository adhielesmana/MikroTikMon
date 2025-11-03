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
 * Creates an urgent emergency beep alarm pattern (repeating beeps)
 */
export function playAlertSound() {
  try {
    const ctx = initAudioContext();
    
    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;
    
    // Create 6 urgent beeps over 3 seconds (classic emergency alarm pattern)
    // Each beep: 0.25s on, 0.25s off
    const beepDuration = 0.25;
    const beepGap = 0.25;
    const totalBeeps = 6;
    
    for (let i = 0; i < totalBeeps; i++) {
      const startTime = now + (i * (beepDuration + beepGap));
      
      // Create oscillator for each beep
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      // Connect nodes
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      // Emergency alarm frequency (1000Hz - very attention-grabbing)
      oscillator.frequency.setValueAtTime(1000, startTime);
      oscillator.type = 'sine'; // Sine wave for clearer, louder beep
      
      // Volume envelope - loud with sharp attack and release
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.5, startTime + 0.01); // Very quick attack - LOUD
      gainNode.gain.setValueAtTime(0.5, startTime + beepDuration - 0.05); // Hold at loud volume
      gainNode.gain.linearRampToValueAtTime(0, startTime + beepDuration); // Quick release
      
      // Start and stop the beep
      oscillator.start(startTime);
      oscillator.stop(startTime + beepDuration);
    }
    
    console.log('[AlertSound] Playing 3-second emergency beep alarm (6 beeps)');
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

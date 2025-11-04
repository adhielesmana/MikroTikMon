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
 * Creates a loud emergency buzzer alarm (continuous warbling sound)
 */
export async function playAlertSound() {
  try {
    const ctx = initAudioContext();
    
    // Resume context if suspended (browser autoplay policy)
    // IMPORTANT: Must await resume() to ensure context is ready
    if (ctx.state === 'suspended') {
      await ctx.resume();
      console.log('[AlertSound] Audio context resumed from suspended state');
    }

    const now = ctx.currentTime;
    const duration = 3.0; // 3 seconds total
    
    // Create continuous emergency buzzer with warbling effect
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    // Connect nodes
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    // Use sawtooth wave for harsh, loud buzzer sound
    oscillator.type = 'sawtooth';
    
    // Create warbling effect by rapidly alternating between two frequencies
    // This creates the classic emergency siren/buzzer sound
    const lowFreq = 400;  // Low pitch
    const highFreq = 600; // High pitch
    const warblingSpeed = 0.15; // Alternate every 0.15 seconds (fast warble)
    
    let currentTime = now;
    let isHigh = false;
    
    // Create rapid frequency alternation for full 3 seconds
    while (currentTime < now + duration) {
      oscillator.frequency.setValueAtTime(isHigh ? highFreq : lowFreq, currentTime);
      currentTime += warblingSpeed;
      isHigh = !isHigh;
    }
    
    // LOUD volume envelope - sustained throughout
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.6, now + 0.02); // Very quick attack - VERY LOUD
    gainNode.gain.setValueAtTime(0.6, now + duration - 0.1); // Sustained loud volume
    gainNode.gain.linearRampToValueAtTime(0, now + duration); // Quick fade out
    
    // Start and stop the buzzer
    oscillator.start(now);
    oscillator.stop(now + duration);
    
    console.log('[AlertSound] Playing 3-second LOUD emergency buzzer alarm');
  } catch (error) {
    console.error('[AlertSound] Failed to play sound:', error);
  }
}

/**
 * Test the alert sound (for settings page)
 */
export async function testAlertSound() {
  await playAlertSound();
}

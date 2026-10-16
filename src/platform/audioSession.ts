/**
 * iOS routes audio by session type (Audio Session API, Safari 16.4+): "play-and-record" while the
 * microphone is open, "playback" so the reference tone sounds even in silent mode, "auto" when
 * the app is quiet.
 */
export function useAudioSession(type: 'auto' | 'playback' | 'play-and-record'): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (!session) return
  try {
    session.type = type
  } catch {
    // Unsupported value in this browser; keep the current session.
  }
}

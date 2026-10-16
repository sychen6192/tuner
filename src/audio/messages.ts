import type { StrobeBand } from '../core/strobe'

/** Microphone samples from the capture worklet: one hop, mono. */
export interface CaptureChunk {
  samples: Float32Array
  /** Audio-clock frame just after the last sample. */
  endFrame: number
  /** Audio-clock time just after the last sample, seconds. */
  endTime: number
}

/** Main thread → analysis worker. */
export type AnalysisCommand =
  | { type: 'connect'; port: MessagePort; sampleRate: number }
  | { type: 'range'; minFrequency: number; maxFrequency: number }
  /** Frequency the strobe compares against (the current target), or null for none. */
  | { type: 'target'; frequency: number | null }
  /** Listening stopped: drop the input and what was heard. */
  | { type: 'disconnect' }

/** Analysis worker → main thread, once per hop. */
export interface AnalysisResult {
  type: 'reading'
  time: number
  frequency: number | null
  clarity: number
  level: number
  /** Phase of the strobe bands against the target, when one is set and the signal is clear. */
  strobe: StrobeBand[] | null
  /** The target these bands were measured against. */
  strobeTarget: number | null
}

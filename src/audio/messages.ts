import type { Reading } from '../core/analyser'

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

/** Analysis worker → main thread, once per analysed hop. */
export type AnalysisResult = { type: 'reading' } & Reading

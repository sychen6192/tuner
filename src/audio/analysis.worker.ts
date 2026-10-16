/// <reference lib="webworker" />
// Pitch analysis off the main thread: the capture worklet sends hops of microphone signal through
// a MessagePort; for each one the analyser posts a reading. The main thread only draws.

import { Analyser } from '../core/analyser'
import type { AnalysisCommand, AnalysisResult, CaptureChunk } from './messages'

let analyser: Analyser | null = null
let range: { minFrequency: number; maxFrequency: number } | null = null
let target: number | null = null
let input: MessagePort | null = null

function onChunk(chunk: CaptureChunk): void {
  const reading = analyser?.push(chunk.samples, chunk.endFrame, chunk.endTime)
  if (reading) self.postMessage({ type: 'reading', ...reading } satisfies AnalysisResult)
}

self.onmessage = (event: MessageEvent<AnalysisCommand>) => {
  const command = event.data
  switch (command.type) {
    case 'connect':
      input?.close()
      input = command.port
      input.onmessage = (message: MessageEvent<CaptureChunk>) => onChunk(message.data)
      analyser = new Analyser(command.sampleRate)
      if (range) analyser.setRange(range.minFrequency, range.maxFrequency)
      analyser.setTarget(target)
      break
    case 'range':
      range = { minFrequency: command.minFrequency, maxFrequency: command.maxFrequency }
      analyser?.setRange(range.minFrequency, range.maxFrequency)
      break
    case 'target':
      target = command.frequency
      analyser?.setTarget(target)
      break
    case 'disconnect':
      input?.close()
      input = null
      analyser?.reset()
      break
  }
}

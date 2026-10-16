/**
 * Baseline for comparison only: the ACF2+ autocorrelation pitch detector of cwilso/PitchDetect
 * (Chris Wilson, MIT licence), the most-starred web tuner on GitHub, ported line for line.
 * It analyses a 2048-sample AnalyserNode buffer and returns -1 when it hears nothing.
 */
export function acf2plus(input: Float32Array, sampleRate: number): number {
  let buf = input
  let size = buf.length
  let rms = 0
  for (let i = 0; i < size; i++) rms += buf[i]! * buf[i]!
  rms = Math.sqrt(rms / size)
  if (rms < 0.01) return -1

  let r1 = 0
  let r2 = size - 1
  const thres = 0.2
  for (let i = 0; i < size / 2; i++) {
    if (Math.abs(buf[i]!) < thres) {
      r1 = i
      break
    }
  }
  for (let i = 1; i < size / 2; i++) {
    if (Math.abs(buf[size - i]!) < thres) {
      r2 = size - i
      break
    }
  }
  buf = buf.slice(r1, r2)
  size = buf.length

  const c = new Float64Array(size)
  for (let i = 0; i < size; i++) for (let j = 0; j < size - i; j++) c[i] = c[i]! + buf[j]! * buf[j + i]!

  let d = 0
  while (c[d]! > c[d + 1]!) d++
  let maxval = -1
  let maxpos = -1
  for (let i = d; i < size; i++) {
    if (c[i]! > maxval) {
      maxval = c[i]!
      maxpos = i
    }
  }
  let T0 = maxpos
  const x1 = c[T0 - 1]!
  const x2 = c[T0]!
  const x3 = c[T0 + 1]!
  const a = (x1 + x3 - 2 * x2) / 2
  const b = (x3 - x1) / 2
  if (a) T0 = T0 - b / (2 * a)
  return sampleRate / T0
}

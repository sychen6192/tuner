/**
 * In-place radix-2 complex FFT, sized for the pitch detector's autocorrelation. Twiddle factors
 * and the bit-reversal table are computed once per size and reused every frame.
 */
interface Plan {
  readonly size: number
  readonly cos: Float64Array
  readonly sin: Float64Array
  readonly reverse: Uint32Array
}

const plans = new Map<number, Plan>()

function plan(size: number): Plan {
  let cached = plans.get(size)
  if (cached) return cached
  if (size < 2 || (size & (size - 1)) !== 0) throw new RangeError(`FFT size must be a power of two: ${size}`)
  const half = size / 2
  const cos = new Float64Array(half)
  const sin = new Float64Array(half)
  for (let i = 0; i < half; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / size)
    sin[i] = Math.sin((2 * Math.PI * i) / size)
  }
  const bits = Math.log2(size)
  const reverse = new Uint32Array(size)
  for (let i = 0; i < size; i++) {
    let r = 0
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b)
    reverse[i] = r
  }
  cached = { size, cos, sin, reverse }
  plans.set(size, cached)
  return cached
}

/** Forward transform (e^-iωt) of re + i·im, in place. */
export function fft(re: Float64Array, im: Float64Array): void {
  const { size, cos, sin, reverse } = plan(re.length)
  for (let i = 0; i < size; i++) {
    const j = reverse[i]!
    if (j > i) {
      const tr = re[i]!
      re[i] = re[j]!
      re[j] = tr
      const ti = im[i]!
      im[i] = im[j]!
      im[j] = ti
    }
  }
  for (let length = 2; length <= size; length *= 2) {
    const half = length / 2
    const stride = size / length
    for (let start = 0; start < size; start += length) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * stride]!
        const wi = -sin[k * stride]!
        const a = start + k
        const b = a + half
        const xr = re[b]! * wr - im[b]! * wi
        const xi = re[b]! * wi + im[b]! * wr
        re[b] = re[a]! - xr
        im[b] = im[a]! - xi
        re[a] = re[a]! + xr
        im[a] = im[a]! + xi
      }
    }
  }
}

export function nextPowerOfTwo(n: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(2, n)))
}

/**
 * Linear autocorrelation r[τ] = Σ x[j]·x[j+τ] for τ in [0, maxLag), via the Wiener–Khinchin
 * theorem: zero-padding to at least length + maxLag keeps the circular wrap-around out.
 */
export function autocorrelate(
  x: Float32Array | Float64Array,
  maxLag: number,
  scratch?: { re: Float64Array; im: Float64Array },
): Float64Array {
  const size = nextPowerOfTwo(x.length + maxLag)
  const re = scratch && scratch.re.length === size ? scratch.re : new Float64Array(size)
  const im = scratch && scratch.im.length === size ? scratch.im : new Float64Array(size)
  re.fill(0)
  im.fill(0)
  re.set(x)
  fft(re, im)
  for (let i = 0; i < size; i++) {
    re[i] = re[i]! * re[i]! + im[i]! * im[i]!
    im[i] = 0
  }
  // The power spectrum is real and even, so a forward transform gives the inverse up to 1/size.
  fft(re, im)
  const out = new Float64Array(maxLag)
  for (let i = 0; i < maxLag; i++) out[i] = re[i]! / size
  return out
}

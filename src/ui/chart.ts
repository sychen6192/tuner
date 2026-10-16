import { STROBE_HARMONICS, phaseDelta, type StrobeBand } from '../core/strobe'

/**
 * The intonation chart, drawn the way a pen plotter draws: an engraved cents scale with the
 * yellow pen point riding on it, and beneath it the paper the pen has drawn on, scrolling down.
 * A held note in tune falls as a straight line down the in-tune column; vibrato wavers; a note
 * drifting flat leans left. Each note's trace carries its name where it began. Above the scale,
 * the strobe: one band per harmonic, standing still when in tune.
 */

/** Seconds of history on the paper. */
export const TRACE_SECONDS = 6
/** Cents from the centre to each end of the scale. */
const RANGE = 50
/** Room at each end so the pen point at ±50 stays on the paper, px. */
const PAD = 14
/** Pen widths, px, light where the pitch is uncertain and pressing where it is clear. */
const PEN_MIN = 1.5
const PEN_MAX = 3.4
/** A pause longer than this lifts the pen, seconds. */
const LIFT = 0.12
/** Only notes held this long get their name written beside them, seconds. */
const LABEL_AFTER = 0.3
const STRIPE = 18 // px per strobe period
const SVG_NS = 'http://www.w3.org/2000/svg'

export interface TracePoint {
  /** Seconds (performance clock). */
  time: number
  cents: number
  clarity: number
  /** Target note; a change of note lifts the pen. */
  midi: number
  /** Name written beside the note, e.g. "A♯4". */
  label: string
  inTune: boolean
}

export type PenState = 'idle' | 'waiting' | 'sounding' | 'held'

export interface Pen {
  state: PenState
  /** Deviation shown by the pen point; null rests it at the centre. */
  cents: number | null
  inTune: boolean
}

interface Colours {
  line: string
  inTune: string
  zone: string
  rule: string
  label: string
}

export class Chart {
  private points: TracePoint[] = []
  private width = 0
  private height = 0
  private ratio = 1
  private tolerance = 3
  private colours: Colours | null = null
  private readonly ctx: CanvasRenderingContext2D
  private readonly tip: SVGGElement
  private readonly zero: SVGLineElement
  private readonly zone: SVGRectElement
  private readonly bands: HTMLElement[]
  private strobePhase: number[] = STROBE_HARMONICS.map(() => 0)
  private strobeTarget: number | null = null
  private lastPen: Pen = { state: 'idle', cents: null, inTune: false }
  /** The moment the paper was last drawn at, so a resize or theme change redraws it as it was. */
  private lastNow: number | null = null

  constructor(
    private readonly scale: SVGSVGElement,
    private readonly canvas: HTMLCanvasElement,
    strobe: HTMLElement,
    private readonly swatches: HTMLElement,
  ) {
    this.ctx = canvas.getContext('2d')!
    this.bands = [...strobe.querySelectorAll<HTMLElement>('.band')]
    this.zone = svg('rect', { class: 'scale-zone' })
    this.zero = svg('line', { class: 'scale-zero' })
    this.tip = svg('g', { class: 'pen', 'data-state': 'idle' })
    this.tip.append(svg('circle', { r: '8' }))
    new ResizeObserver(() => this.resize()).observe(canvas)
    for (const query of ['(prefers-color-scheme: dark)', '(forced-colors: active)']) {
      window.matchMedia(query).addEventListener('change', () => {
        this.colours = null
        this.buildScale()
        this.redraw()
      })
    }
    this.watchPixelRatio()
    this.resize()
  }

  setTolerance(tolerance: number): void {
    this.tolerance = tolerance
    this.placeZone()
    this.redraw()
  }

  add(point: TracePoint): void {
    this.points.push(point)
    const oldest = point.time - TRACE_SECONDS - 1
    let drop = 0
    while (drop < this.points.length && this.points[drop]!.time < oldest) drop++
    if (drop > 0) this.points.splice(0, drop)
  }

  /** Rename the notes already drawn (after a change of naming or language). */
  relabel(label: (midi: number) => string): void {
    for (const point of this.points) point.label = label(point.midi)
    this.redraw()
  }

  clear(): void {
    this.points = []
  }

  /** Draw the paper as of `now`, the pen point at `cents`, and the strobe. */
  draw(now: number, pen: Pen): void {
    this.lastNow = now
    this.drawPen(pen)
    this.drawTrace(now)
  }

  /** Draw the paper again as it was last drawn (the canvas was cleared or recoloured). */
  private redraw(): void {
    if (this.lastNow !== null) this.drawTrace(this.lastNow)
  }

  /** A move to a screen of another pixel density re-sizes the canvas bitmap. */
  private watchPixelRatio(): void {
    window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener(
      'change',
      () => {
        this.resize()
        this.watchPixelRatio()
      },
      { once: true },
    )
  }

  /**
   * Strobe bands measured against `target` Hz, or null when there is nothing to show. `cents`
   * fades the bands out far from the note, where a real strobe blurs into a grey band.
   */
  strobe(bands: StrobeBand[] | null, target: number | null, cents: number | null): void {
    if (!bands || target === null || cents === null) {
      for (const band of this.bands) band.style.setProperty('--alpha', '0')
      this.strobeTarget = null
      return
    }
    const fresh = target !== this.strobeTarget
    this.strobeTarget = target
    const fade = 1 - smoothstep((Math.abs(cents) - 15) / 25)
    bands.forEach((band, i) => {
      // Light smoothing along the shortest way round; a new target starts where it is measured.
      const shown = fresh ? band.phase : this.strobePhase[i]! + 0.5 * phaseDelta(this.strobePhase[i]!, band.phase)
      this.strobePhase[i] = ((shown % 1) + 1) % 1
      const element = this.bands[i]
      if (!element) return
      element.style.setProperty('--offset', `${(this.strobePhase[i]! * STRIPE).toFixed(2)}px`)
      element.style.setProperty('--alpha', (fade * Math.min(1, 0.2 + band.strength * 2.5)).toFixed(3))
    })
  }

  private x(cents: number): number {
    const clamped = Math.max(-RANGE, Math.min(RANGE, cents))
    return this.width / 2 + (clamped / RANGE) * (this.width / 2 - PAD)
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    this.ratio = Math.min(3, window.devicePixelRatio || 1)
    this.width = rect.width
    this.height = rect.height
    // Setting the size clears the bitmap, so the paper is drawn again straight after.
    this.canvas.width = Math.round(rect.width * this.ratio)
    this.canvas.height = Math.round(rect.height * this.ratio)
    this.buildScale()
    this.redraw()
  }

  /** The engraved scale: a tick every 5 cents, long ticks and figures at 0 and ±25, ♭ and ♯ at the ends. */
  private buildScale(): void {
    const width = this.width
    const height = 46
    const base = height - 8
    this.scale.setAttribute('viewBox', `0 0 ${width} ${height}`)
    this.scale.setAttribute('width', String(width))
    this.scale.setAttribute('height', String(height))
    const ticks: SVGElement[] = []
    for (let c = -RANGE; c <= RANGE; c += 5) {
      const major = c % 25 === 0
      const x = this.x(c)
      ticks.push(
        svg('line', { class: major ? 'tick major' : 'tick', x1: x, x2: x, y1: base, y2: base - (major ? 11 : 6) }),
      )
      if (c === 0 || Math.abs(c) === 25) {
        const figure = text(String(Math.abs(c)), x, base - 16, 'scale-figure')
        if (c !== 0) {
          // The score face's + and − are math-width; set them smaller, as engravers do.
          const sign = svg('tspan', { class: 'scale-figure-sign' })
          sign.textContent = c > 0 ? '+' : '\u2212'
          figure.prepend(sign)
        }
        ticks.push(figure)
      }
    }
    ticks.push(accidentalText(-1, this.x(-RANGE), base - 16), accidentalText(1, this.x(RANGE), base - 16))
    const baseline = svg('line', { class: 'scale-base', x1: this.x(-RANGE), x2: this.x(RANGE), y1: base, y2: base })
    this.zero.setAttribute('x1', String(this.x(0)))
    this.zero.setAttribute('x2', String(this.x(0)))
    this.zero.setAttribute('y1', String(base))
    this.zero.setAttribute('y2', String(base - 13))
    this.zone.setAttribute('y', '0')
    this.zone.setAttribute('height', String(height))
    this.placeZone()
    this.tip.setAttribute('data-base', String(base))
    this.scale.replaceChildren(this.zone, baseline, ...ticks, this.zero, this.tip)
    this.drawPen(this.lastPen)
  }

  private placeZone(): void {
    if (!this.width) return
    const left = this.x(-this.tolerance)
    this.zone.setAttribute('x', String(left))
    this.zone.setAttribute('width', String(this.x(this.tolerance) - left))
  }

  private drawPen(pen: Pen): void {
    this.lastPen = pen
    const cents = pen.cents ?? 0
    const base = Number(this.tip.getAttribute('data-base') ?? 38)
    this.tip.setAttribute('transform', `translate(${this.x(cents).toFixed(2)} ${base})`)
    this.tip.setAttribute('data-state', pen.cents === null ? 'idle' : pen.state)
    this.tip.toggleAttribute('data-beyond', Math.abs(cents) > RANGE)
    this.zero.classList.toggle('active', pen.inTune)
  }

  private readColours(): Colours {
    const read = (name: string) => getComputedStyle(this.swatches.querySelector(`.swatch-${name}`)!).color
    return { line: read('line'), inTune: read('true'), zone: read('zone'), rule: read('rule'), label: read('label') }
  }

  private drawTrace(now: number): void {
    const { ctx, width, height, ratio } = this
    if (!width || !height) return
    this.colours ??= this.readColours()
    const colours = this.colours
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, width, height)

    // The in-tune column and the centre line run the length of the paper.
    const left = this.x(-this.tolerance)
    ctx.fillStyle = colours.zone
    ctx.fillRect(left, 0, this.x(this.tolerance) - left, height)
    ctx.fillStyle = colours.rule
    ctx.fillRect(Math.round(this.x(0)) - 0.5, 0, 1, height)

    const perSecond = height / TRACE_SECONDS
    const y = (time: number) => (now - time) * perSecond
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const points = this.points
    let runStart = 0
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!
      const prev = points[i - 1]
      if (!prev || p.midi !== prev.midi || p.time - prev.time > LIFT) {
        this.labelRun(points, runStart, i - 1, y)
        runStart = i
        continue
      }
      if (y(p.time) > height + 4 && y(prev.time) > height + 4) continue
      ctx.strokeStyle = p.inTune && prev.inTune ? colours.inTune : colours.line
      ctx.lineWidth = penWidth((p.clarity + prev.clarity) / 2)
      ctx.beginPath()
      ctx.moveTo(this.x(prev.cents), y(prev.time))
      ctx.lineTo(this.x(p.cents), y(p.time))
      ctx.stroke()
    }
    this.labelRun(points, runStart, points.length - 1, y)
  }

  /** Write the note's name beside where its trace began. */
  private labelRun(points: TracePoint[], from: number, to: number, y: (time: number) => number): void {
    if (to < from) return
    const first = points[from]!
    const last = points[to]!
    if (last.time - first.time < LABEL_AFTER) return
    const top = y(first.time)
    if (top < 10 || top > this.height + 12) return
    const x = this.x(first.cents)
    const ctx = this.ctx
    ctx.font = "700 13px 'Old Standard TT', 'Tuner Engraved', 'Iowan Old Style', Georgia, serif"
    ctx.fillStyle = this.colours!.label
    ctx.textBaseline = 'middle'
    const onRight = x < this.width * 0.7
    ctx.textAlign = onRight ? 'left' : 'right'
    ctx.fillText(first.label, x + (onRight ? 9 : -9), top)
  }
}

function penWidth(clarity: number): number {
  const t = Math.max(0, Math.min(1, (clarity - 0.75) / 0.23))
  return PEN_MIN + (PEN_MAX - PEN_MIN) * t * t * (3 - 2 * t)
}

const smoothstep = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value))
  return element
}

/** ♭ or ♯ at the end of the scale: engraved, with the plain b or # for when that face is blocked. */
function accidentalText(accidental: -1 | 1, x: number, y: number): SVGTextElement {
  const element = text('', x, y, 'scale-sign')
  const engraved = svg('tspan', { class: 'acc' })
  engraved.textContent = accidental > 0 ? '♯' : '♭'
  const plain = svg('tspan', { class: 'acc-plain' })
  plain.textContent = accidental > 0 ? '#' : 'b'
  element.append(engraved, plain)
  return element
}

function text(content: string, x: number, y: number, className: string): SVGTextElement {
  const element = svg('text', { x, y, class: className, 'text-anchor': 'middle' })
  element.textContent = content
  return element
}

// Landing-page story (adapted from the reference video for structured products):
// wallet → notes rise → circled "Coupon 10% p.a." → "It's not about returns" → clock → "It's about time & fit".
// Pure HTML/CSS/SVG. The "world" is 900×1500 px; a 600×840 window pans across it (see story.css).
import { useEffect, useRef } from 'react'
import './story.css'

const VIEW_W = 600
const VIEW_H = 840

export function Note({ style, className = '' }: { style?: React.CSSProperties; className?: string }) {
  return (
    <div className={`note ${className}`} style={style}>
      <div className="rs">₹</div>
      <div className="seal" />
      <div className="serial">FW 2026 · 001</div>
    </div>
  )
}

export function Wallet({ style, className = '' }: { style?: React.CSSProperties; className?: string }) {
  return <div className={`wallet ${className}`} style={style} />
}

const ROMAN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']

export function Clock({ size, style, className = '' }: { size: number; style?: React.CSSProperties; className?: string }) {
  const r = size / 2 - 16 - 22 // numeral radius inside the face
  return (
    <div className={`clock ${className}`} style={{ width: size, height: size, ...style }}>
      <div className="clock-face">
        {ROMAN.map((n, i) => {
          const a = (i / 12) * Math.PI * 2
          return (
            <span key={n} className="clock-num" style={{ transform: `translate(${Math.sin(a) * r}px, ${-Math.cos(a) * r - 11}px)` }}>
              {n}
            </span>
          )
        })}
        <div className="clock-hand hour" style={{ rotate: '300deg' }} />
        <div className="clock-hand min" />
        <div className="clock-pin" />
      </div>
    </div>
  )
}

/** Dashed hand-drawn arrow that draws itself (mask reveals the dashes), with an arrowhead. */
function Arrow({ id, d, head, cls }: { id: string; d: string; head: { x: number; y: number; angle: number }; cls: string }) {
  return (
    <g>
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="900" height="1500">
          <path d={d} pathLength={1} className={`draw draw-${cls}`} stroke="#fff" strokeWidth="10" fill="none" strokeLinecap="round" />
        </mask>
      </defs>
      <path d={d} mask={`url(#${id})`} stroke="#2a4656" strokeWidth="3.2" strokeDasharray="13 10" strokeLinecap="round" fill="none" />
      <polygon
        className={`head-${cls}`}
        points="0,0 -18,-9 -14,0 -18,9"
        fill="#2a4656"
        transform={`translate(${head.x} ${head.y}) rotate(${head.angle})`}
      />
    </g>
  )
}

export default function Story({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  // Scale the fixed-size world to whatever box the stage gets.
  useEffect(() => {
    const el = ref.current!
    const ro = new ResizeObserver(() => {
      // "contain": the whole 600×840 window always fits, centred in the box
      const s = Math.min(el.clientWidth / VIEW_W, el.clientHeight / VIEW_H)
      el.style.setProperty('--s', String(s))
      el.style.setProperty('--ox', `${(el.clientWidth - VIEW_W * s) / 2}px`)
      el.style.setProperty('--oy', `${(el.clientHeight - VIEW_H * s) / 2}px`)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={ref} className={`story ${className}`} aria-label="Animated story: it's not about returns, it's about time and fit" role="img">
      <div className="story-world">
        {/* scene 1: wallet with notes rising out of it */}
        <Note className="note-rise n1" style={{ left: 172, top: 400 }} />
        <Note className="note-rise n2" style={{ left: 248, top: 400 }} />
        <Note className="note-rise n3" style={{ left: 316, top: 400 }} />
        <Wallet style={{ left: 150, top: 420, width: 300, height: 220 }} />

        {/* hand-drawn strokes */}
        <svg className="absolute inset-0" width="900" height="1500" viewBox="0 0 900 1500" style={{ position: 'absolute', left: 0, top: 0 }}>
          {/* scribbled circle around the coupon */}
          <path
            pathLength={1}
            className="draw draw-c1"
            d="M720 455 C 720 408, 640 394, 580 397 C 505 400, 468 426, 470 460 C 473 503, 555 520, 630 516 C 700 512, 738 487, 729 451 C 720 414, 650 401, 570 406 C 502 411, 478 440, 482 467 C 489 498, 568 510, 645 504"
            stroke="#2a4656"
            strokeWidth="2.6"
            fill="none"
            strokeLinecap="round"
          />
          <Arrow id="a1" cls="a1" d="M458 590 C 520 592, 560 575, 566 534" head={{ x: 566, y: 534, angle: -85 }} />
          <Arrow id="a2" cls="a2" d="M690 512 C 760 620, 720 780, 590 872" head={{ x: 590, y: 872, angle: 140 }} />
          <Arrow id="a3" cls="a3" d="M325 1125 C 280 1180, 285 1235, 330 1266" head={{ x: 330, y: 1266, angle: 40 }} />
        </svg>

        {/* scene 2: the circled coupon */}
        <div className="hand write-1" style={{ left: 500, top: 410, fontSize: 50 }}>
          Coupon
          <br />
          <span style={{ fontSize: 44 }}>10% p.a.</span>
        </div>

        {/* scene 3: a single note + "It's not about returns" */}
        <Note className="pop-note" style={{ left: 280, top: 900, zIndex: 2 }} />
        <div className="hand write-2" style={{ left: 415, top: 905, fontSize: 46 }}>
          It's not
          <br />
          about returns
        </div>

        {/* scene 4: clock + "It's about time & fit" */}
        <Clock size={230} className="pop-clock" style={{ left: 470, top: 1200 }} />
        <div className="hand write-3" style={{ left: 205, top: 1270, fontSize: 48 }}>
          It's about
          <br />
          time &amp; fit
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect, useRef, useCallback } from 'react'
import { GOLD, GOLD_LT, CREAM } from '../config/design-tokens'
import sounds from '../hooks/useSound'

// ── Fake progress curve: fast early, asymptotic toward 1.0 ──
// progress = 1 - 1/(1 + elapsed * 0.15)
function fakeProgress(elapsedSec) {
  if (elapsedSec < 0) return 0
  return 1 - 1 / (1 + elapsedSec * 0.15)
}

// Phase thresholds (seconds)
const PHASE_THRESHOLDS = [3, 8, 15, 20]

function getPhase(elapsed) {
  if (elapsed < PHASE_THRESHOLDS[0]) return 0 // Awakening
  if (elapsed < PHASE_THRESHOLDS[1]) return 1 // Building
  if (elapsed < PHASE_THRESHOLDS[2]) return 2 // Crescendo
  if (elapsed < PHASE_THRESHOLDS[3]) return 3 // Stall
  return 4 // Degraded
}

// Phase text
function getPhaseText(phase, mode) {
  if (mode === 'forge') {
    return [
      'Forging in progress...',
      'The forge burns hotter...',
      'Almost there...',
      'Still waiting for the oracle...',
      'Taking longer than expected.',
    ][phase]
  }
  return [
    'The oracle is listening...',
    'The oracle is deciding...',
    'The oracle speaks soon...',
    'Still waiting for the oracle...',
    'Taking longer than expected.',
  ][phase]
}

// Phase configs: particle count, ring thickness, glow radius, block scale, pulse speed
const PHASE_CONFIG = [
  { particles: 5,  ringW: 3, glow: 4,  scale: 1.0,  pulseMs: 0,    brightness: 0.7 },
  { particles: 12, ringW: 4, glow: 8,  scale: 1.03, pulseMs: 2000, brightness: 1.0 },
  { particles: 20, ringW: 5, glow: 16, scale: 1.05, pulseMs: 1000, brightness: 1.3 },
  { particles: 20, ringW: 5, glow: 16, scale: 1.05, pulseMs: 800,  brightness: 1.2 },
  { particles: 5,  ringW: 3, glow: 4,  scale: 1.0,  pulseMs: 3000, brightness: 0.7 },
]

// Generate particle spawn positions at panel edges
function spawnParticle(id, panelW, panelH) {
  const edge = Math.floor(Math.random() * 4) // 0=top,1=right,2=bottom,3=left
  let x, y
  if (edge === 0)      { x = Math.random() * panelW; y = -8 }
  else if (edge === 1) { x = panelW + 8;             y = Math.random() * panelH }
  else if (edge === 2) { x = Math.random() * panelW; y = panelH + 8 }
  else                 { x = -8;                      y = Math.random() * panelH }
  return { id, x, y, delay: Math.random() * 400, dur: 1200 + Math.random() * 800 }
}

const CSS = `
  @keyframes vrf-block-breathe {
    0%,100% { filter: brightness(var(--vrf-brightness)); transform: scale(var(--vrf-scale)); }
    50% { filter: brightness(calc(var(--vrf-brightness) * 1.15)); transform: scale(calc(var(--vrf-scale) * 1.01)); }
  }
  @keyframes vrf-ring-flicker {
    0%,100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
  @keyframes vrf-bg-pulse {
    0%,100% { background: rgba(0,0,0,0.15); }
    50% { background: rgba(0,0,0,0.25); }
  }
  @keyframes vrf-particle-absorb {
    0% { transform: translate(var(--px), var(--py)) scale(1); opacity: 0.8; }
    85% { opacity: 0.9; }
    100% { transform: translate(0px, 0px) scale(0); opacity: 0; }
  }
  @keyframes vrf-snap-flash {
    0% { opacity: 0.6; }
    100% { opacity: 0; }
  }
  @keyframes vrf-shatter-frag {
    0% { transform: translate(0,0) scale(1); opacity: 1; }
    100% { transform: translate(var(--fx), var(--fy)) scale(0.3); opacity: 0; }
  }
  @keyframes vrf-ring-dissolve {
    from { opacity: 1; }
    to { opacity: 0; }
  }
`

/**
 * VRFDrumRoll — Charging animation while waiting for VRF.
 *
 * @param {string} mode - 'mint' or 'forge'
 * @param {string} chargeColor - Color for the charge (GOLD for mint, tier accent for forge)
 * @param {boolean} fulfilled - Set to true when VRF delivers
 * @param {Function} onReleaseDone - Called after snap→freeze→shatter completes
 * @param {string} subText - Optional forge subtitle e.g. "5× Restless → Remembered"
 */
export default function VRFDrumRoll({ mode = 'mint', chargeColor, fulfilled, onReleaseDone, subText }) {
  const color = chargeColor || GOLD
  const [elapsed, setElapsed] = useState(0)
  const [releasePhase, setReleasePhase] = useState(null) // 'snap' | 'freeze' | 'shatter' | 'done'
  const [particles, setParticles] = useState([])
  const startRef = useRef(Date.now())
  const intervalRef = useRef(null)
  const panelRef = useRef(null)
  const fulfilledAtRef = useRef(null)
  const [panelSize, setPanelSize] = useState({ w: 280, h: 200 })

  // Measure actual panel size
  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0) setPanelSize({ w: width, h: height })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Play VRF waiting sound on mount
  useEffect(() => {
    sounds.vrfWaiting()
  }, [])

  // Tick elapsed time
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 200)
    return () => clearInterval(intervalRef.current)
  }, [])

  const phase = getPhase(elapsed)
  const cfg = PHASE_CONFIG[phase]
  const progress = fulfilled && !releasePhase ? 1.0
    : phase === 4
      ? Math.max(0.6, fakeProgress(20) - (elapsed - 20) * 0.005) // drain
      : phase === 3
        ? Math.min(0.95, fakeProgress(elapsed)) // stall at 95%
        : fakeProgress(elapsed)

  // Particle spawning
  useEffect(() => {
    if (releasePhase) return
    const count = cfg.particles
    const newP = []
    for (let i = 0; i < count; i++) {
      newP.push(spawnParticle(i, panelSize.w, panelSize.h))
    }
    setParticles(newP)
  }, [phase, releasePhase, panelSize.w, panelSize.h])

  // Recycle particles periodically
  useEffect(() => {
    if (releasePhase) return
    const t = setInterval(() => {
      setParticles(prev => prev.map((p, i) => spawnParticle(i, panelSize.w, panelSize.h)))
    }, 2000)
    return () => clearInterval(t)
  }, [releasePhase, panelSize.w, panelSize.h])

  // Handle VRF fulfillment → release sequence
  useEffect(() => {
    if (!fulfilled || releasePhase) return
    fulfilledAtRef.current = Date.now()

    // Ensure minimum 2s animation before release
    const minWait = Math.max(0, 2000 - (Date.now() - startRef.current))

    const t1 = setTimeout(() => {
      setReleasePhase('snap')
      // Snap particles inward
      setParticles([])
    }, minWait)

    const t2 = setTimeout(() => setReleasePhase('freeze'), minWait + 200)
    const t3 = setTimeout(() => setReleasePhase('shatter'), minWait + 500)
    const t4 = setTimeout(() => {
      setReleasePhase('done')
      if (onReleaseDone) onReleaseDone()
    }, minWait + 1100)

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4) }
  }, [fulfilled]) // eslint-disable-line react-hooks/exhaustive-deps

  // SVG ring params
  const ringRadius = 52
  const ringCircumference = 2 * Math.PI * ringRadius
  const ringOffset = ringCircumference * (1 - progress)

  // Shatter fragments
  const fragments = releasePhase === 'shatter' ? Array.from({ length: 14 }, (_, i) => {
    const angle = (360 / 14) * i + (i % 2 ? 12 : -12)
    const rad = (angle * Math.PI) / 180
    const dist = 80 + (i % 3) * 40
    return {
      fx: Math.cos(rad) * dist,
      fy: Math.sin(rad) * dist,
      size: 6 + (i % 3) * 2,
      delay: (i % 5) * 30,
    }
  }) : []

  const isSnap = releasePhase === 'snap'
  const isFreeze = releasePhase === 'freeze'
  const isShatter = releasePhase === 'shatter'
  const isDone = releasePhase === 'done'

  if (isDone) return null

  const blockBrightness = isSnap ? 2.0 : isFreeze ? 1.8 : cfg.brightness
  const blockScale = isSnap ? 1.08 : cfg.scale
  const glowRadius = isSnap ? 24 : isFreeze ? 20 : cfg.glow

  return (
    <div
      ref={panelRef}
      style={{
        position: 'relative',
        width: '100%', minHeight: 200,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
        animation: cfg.pulseMs > 0 && !releasePhase
          ? `vrf-bg-pulse ${cfg.pulseMs}ms ease-in-out infinite`
          : 'none',
        background: isFreeze ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.15)',
        transition: 'background 0.3s',
      }}
    >
      <style>{CSS}</style>

      {/* Snap flash */}
      {isSnap && (
        <div style={{
          position: 'absolute', inset: 0,
          background: color,
          animation: 'vrf-snap-flash 0.2s ease-out forwards',
          pointerEvents: 'none', zIndex: 10,
        }} />
      )}

      {/* Particles */}
      {!releasePhase && particles.map(p => {
        const cx = panelSize.w / 2, cy = panelSize.h / 2
        return (
          <div key={p.id} style={{
            position: 'absolute',
            width: 4, height: 4,
            background: color,
            borderRadius: 0,
            left: cx, top: cy,
            '--px': `${p.x - cx}px`,
            '--py': `${p.y - cy}px`,
            animation: `vrf-particle-absorb ${p.dur}ms cubic-bezier(0.4,0,0.2,1) ${p.delay}ms infinite`,
            animationDirection: 'reverse',
            opacity: 0.7,
            pointerEvents: 'none',
            zIndex: 2,
          }} />
        )
      })}

      {/* Progress ring + block */}
      {!isShatter && (
        <div style={{
          position: 'relative',
          width: 120, height: 120,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 3,
        }}>
          {/* SVG ring */}
          <svg
            width={120} height={120}
            style={{
              position: 'absolute', top: 0, left: 0,
              transform: 'rotate(-90deg)',
              animation: phase === 3 && !releasePhase ? 'vrf-ring-flicker 0.8s ease-in-out infinite' : 'none',
              ...(isShatter ? { animation: 'vrf-ring-dissolve 0.4s ease-out forwards' } : {}),
            }}
          >
            {/* Background ring */}
            <circle
              cx={60} cy={60} r={ringRadius}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={cfg.ringW}
            />
            {/* Progress ring */}
            <circle
              cx={60} cy={60} r={ringRadius}
              fill="none"
              stroke={phase === 4 && !releasePhase ? '#8a8a8a' : color}
              strokeWidth={cfg.ringW}
              strokeLinecap="round"
              strokeDasharray={ringCircumference}
              strokeDashoffset={isSnap || isFreeze ? 0 : ringOffset}
              style={{
                transition: isSnap ? 'stroke-dashoffset 0.15s ease-out' : 'stroke-dashoffset 0.5s ease-out, stroke 1s',
                filter: isSnap || isFreeze ? `drop-shadow(0 0 6px ${color})` : 'none',
              }}
            />
          </svg>

          {/* The block */}
          <div style={{
            width: 64, height: 64,
            background: `linear-gradient(135deg, ${color}33, ${color}11)`,
            border: `2px solid ${color}66`,
            borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            '--vrf-brightness': blockBrightness,
            '--vrf-scale': blockScale,
            filter: `brightness(${blockBrightness})`,
            transform: `scale(${blockScale})`,
            boxShadow: `0 0 ${glowRadius}px ${glowRadius / 2}px ${color}44`,
            animation: cfg.pulseMs > 0 && !releasePhase
              ? `vrf-block-breathe ${cfg.pulseMs}ms ease-in-out infinite`
              : 'none',
            transition: isSnap ? 'all 0.15s ease-out' : 'all 0.5s ease-out',
          }}>
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" style={{ opacity: 0.9 }}>
              <circle cx="18" cy="18" r="16" fill={`${color}44`} stroke={color} strokeWidth="1.5" />
              <circle cx="18" cy="18" r="12" fill="none" stroke={`${color}66`} strokeWidth="0.5" />
              <polygon points="18,6 26,14 18,22 10,14" fill={color} opacity="0.7" />
              <polygon points="10,14 18,22 18,28 10,20" fill={`${color}88`} />
              <polygon points="26,14 18,22 18,28 26,20" fill={`${color}cc`} />
            </svg>
          </div>
        </div>
      )}

      {/* Shatter fragments */}
      {isShatter && (
        <div style={{
          position: 'relative', width: 120, height: 120,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 3,
        }}>
          {fragments.map((f, i) => (
            <div key={i} style={{
              position: 'absolute',
              width: f.size, height: f.size,
              background: color,
              borderRadius: 0,
              left: 60 - f.size / 2, top: 60 - f.size / 2,
              '--fx': `${f.fx}px`,
              '--fy': `${f.fy}px`,
              animation: `vrf-shatter-frag 0.5s ease-out ${f.delay}ms forwards`,
            }} />
          ))}
          {/* Ring dissolve */}
          <svg width={120} height={120} style={{
            position: 'absolute', top: 0, left: 0,
            transform: 'rotate(-90deg)',
            animation: 'vrf-ring-dissolve 0.4s ease-out forwards',
          }}>
            <circle
              cx={60} cy={60} r={ringRadius}
              fill="none" stroke={color} strokeWidth={5}
              strokeDasharray={ringCircumference}
              strokeDashoffset={0}
            />
          </svg>
        </div>
      )}

      {/* Phase text */}
      {!releasePhase && (
        <div style={{ marginTop: 16, textAlign: 'center', zIndex: 3 }}>
          <div style={{
            fontFamily: "'VT323', monospace",
            fontSize: 16, color: CREAM,
            opacity: 0.6,
          }}>
            {subText || getPhaseText(phase, mode)}
          </div>
          {phase === 4 && (
            <div style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 7, color: CREAM,
              opacity: 0.5, marginTop: 8,
              lineHeight: 1.8, maxWidth: 240,
            }}>
              Pending mints can be viewed and cancelled in the right panel.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

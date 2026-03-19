import { useState, useEffect, useRef, useCallback } from 'react'
import { TMAP, FELT, FELT_DARK, INK, CREAM, GOLD } from '../config/design-tokens'

// Card images per tier
const CARD_IMAGES = {
  2: new URL('../assets/T2.png', import.meta.url).href,
  3: new URL('../assets/T3.png', import.meta.url).href,
  4: new URL('../assets/T4.png', import.meta.url).href,
  5: new URL('../assets/T5.png', import.meta.url).href,
  6: new URL('../assets/T6.png', import.meta.url).href,
  7: new URL('../assets/T7.png', import.meta.url).href,
}

// Flip speed per tier (slower = rarer)
const FLIP_SPEED = { 7: 300, 6: 400, 5: 600, 4: 800, 3: 1000, 2: 1200 }

// Border effects per best tier
const BORDER_EFFECTS = {
  7: { color: '#8a8a8a', glow: false, pulse: false, vibrate: false },
  6: { color: '#8a8a8a', glow: false, pulse: false, vibrate: false },
  5: { color: TMAP[5]?.accent || '#33aaff', glow: false, pulse: true, vibrate: false },
  4: { color: TMAP[4]?.accent || '#ffcc33', glow: true, pulse: false, vibrate: false },
  3: { color: TMAP[3]?.accent || '#cc66ff', glow: true, pulse: false, vibrate: true },
  2: { color: TMAP[2]?.accent || '#ff6622', glow: true, pulse: false, vibrate: true },
}

const PHASES = { IDLE: 0, PRE_SIGNAL: 1, FLIP_COMMONS: 2, FLIP_RARES: 3, SUMMARY: 4 }

// Generate particle burst data (deterministic per tier to avoid re-renders)
function makeParticles(count, color) {
  const out = []
  for (let i = 0; i < count; i++) {
    const angle = (360 / count) * i + (i % 2 === 0 ? 8 : -8)
    const dist = 80 + (i % 3) * 30
    const size = 3 + (i % 3)
    const delay = (i % 4) * 40
    out.push({ angle, dist, size, delay, color })
  }
  return out
}

const CSS = `
  /* ── Card entrance ───────────────────────────────────── */
  @keyframes mint-card-entrance {
    0%   { opacity: 0; transform: translateY(80px) scale(0.7); }
    60%  { opacity: 1; transform: translateY(-12px) scale(1.04); }
    80%  { transform: translateY(4px) scale(0.98); }
    100% { transform: translateY(0) scale(1); }
  }

  /* ── Pulse / vibrate / glow ──────────────────────────── */
  @keyframes mint-card-pulse {
    0%,100% { opacity: 1; }
    50% { opacity: 0.6; }
  }
  @keyframes mint-card-vibrate {
    0%,100% { transform: translateX(0); }
    25% { transform: translateX(-1.5px); }
    75% { transform: translateX(1.5px); }
  }
  @keyframes mint-card-glow-pulse {
    0%,100% { box-shadow: 0 0 12px 4px var(--glow-color); }
    50% { box-shadow: 0 0 28px 10px var(--glow-color); }
  }

  /* ── Particle burst ──────────────────────────────────── */
  @keyframes mint-particle-burst {
    0%   { opacity: 1; transform: translate(0,0) scale(1); }
    70%  { opacity: 0.8; }
    100% { opacity: 0; transform: translate(var(--px), var(--py)) scale(0); }
  }

  /* ── Background flash (T4+) ──────────────────────────── */
  @keyframes mint-bg-flash {
    0%   { opacity: 0.35; }
    100% { opacity: 0; }
  }

  /* ── Shine sweep on card face ────────────────────────── */
  @keyframes mint-shine-sweep {
    0%   { transform: translateX(-160px) skewX(-15deg); opacity: 0; }
    30%  { opacity: 0.5; }
    100% { transform: translateX(200px) skewX(-15deg); opacity: 0; }
  }

  /* ── Summary fade-in ─────────────────────────────────── */
  @keyframes mint-summary-fadein {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes mint-dim-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  /* ── Card back crosshatch pattern ────────────────────── */
  .mint-card-back-pattern {
    position: absolute; inset: 8px;
    border-radius: 2px;
    opacity: 0.12;
    background:
      repeating-linear-gradient(
        45deg,
        transparent,
        transparent 6px,
        currentColor 6px,
        currentColor 7px
      ),
      repeating-linear-gradient(
        -45deg,
        transparent,
        transparent 6px,
        currentColor 6px,
        currentColor 7px
      );
    pointer-events: none;
  }
`

// ── CountUp: rolls a number from 0 → target over duration ms ──
function CountUp({ target, duration = 400, style }) {
  const [val, setVal] = useState(0)
  const startRef = useRef(null)
  const rafRef = useRef(null)

  useEffect(() => {
    startRef.current = performance.now()
    function tick(now) {
      const elapsed = now - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out quad
      const eased = 1 - (1 - progress) * (1 - progress)
      setVal(Math.round(eased * target))
      if (progress < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return <span style={style}>{val}</span>
}

/**
 * MintRevealCardFlip — Card flip animation for mint reveals.
 */
export default function MintRevealCardFlip({ results, onComplete, onRareReveal }) {
  const [phase, setPhase] = useState(PHASES.PRE_SIGNAL)
  const [currentFlip, setCurrentFlip] = useState(null)
  const [flipped, setFlipped] = useState(false)
  const [dimmed, setDimmed] = useState(false)
  const [showParticles, setShowParticles] = useState(false)
  const [bgFlashColor, setBgFlashColor] = useState(null)
  const [showShine, setShowShine] = useState(false)
  const [summaryItems, setSummaryItems] = useState([])
  const [summaryVisible, setSummaryVisible] = useState(false)
  const [cardScale, setCardScale] = useState(1)
  const [entered, setEntered] = useState(false)
  const skipRef = useRef(false)
  const timerRef = useRef(null)

  // Parse results
  const tierCounts = {
    7: results?.t7 || 0, 6: results?.t6 || 0, 5: results?.t5 || 0,
    4: results?.t4 || 0, 3: results?.t3 || 0, 2: results?.t2 || 0,
  }

  const bestTier = [2, 3, 4, 5, 6, 7].find(t => tierCounts[t] > 0) || 7
  const hasRares = bestTier <= 5
  const commonsTiers = [7, 6].filter(t => tierCounts[t] > 0)
  const rareTiers = [5, 4, 3, 2].filter(t => tierCounts[t] > 0)
  const borderEffect = BORDER_EFFECTS[bestTier]

  const skipToSummary = useCallback(() => {
    if (skipRef.current) return
    skipRef.current = true
    clearTimeout(timerRef.current)
    setDimmed(false)
    setShowParticles(false)
    setBgFlashColor(null)
    setPhase(PHASES.SUMMARY)
  }, [])

  const allItems = [7, 6, 5, 4, 3, 2]
    .filter(t => tierCounts[t] > 0)
    .map(t => ({
      tier: t, count: tierCounts[t],
      name: TMAP[t]?.short || TMAP[t]?.name || `T${t}`,
      accent: TMAP[t]?.accent || '#888',
    }))

  // Entrance animation trigger
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 50)
    return () => clearTimeout(t)
  }, [])

  // Animation sequencer
  useEffect(() => {
    if (skipRef.current) return
    let cancelled = false
    const wait = (ms) => new Promise(resolve => {
      timerRef.current = setTimeout(() => { if (!cancelled) resolve() }, ms)
    })

    async function runSequence() {
      // Act 1: Pre-signal — wait for entrance + anticipation
      await wait(700)
      if (cancelled || skipRef.current) return

      // Act 2: Commons batch
      setPhase(PHASES.FLIP_COMMONS)
      for (const tier of commonsTiers) {
        if (cancelled || skipRef.current) return
        setCurrentFlip({ tier, count: tierCounts[tier] })
        setFlipped(false)
        setShowShine(false)
        await wait(100)
        if (cancelled || skipRef.current) return
        setFlipped(true)
        // Trigger shine sweep after flip completes
        await wait(FLIP_SPEED[tier])
        if (cancelled || skipRef.current) return
        setShowShine(true)
        await wait(500) // hold
        setShowShine(false)
        if (cancelled || skipRef.current) return
      }

      // Act 3: Rare reveals
      if (hasRares) {
        setPhase(PHASES.FLIP_RARES)
        for (const tier of rareTiers) {
          if (cancelled || skipRef.current) return

          setDimmed(true)
          setCurrentFlip({ tier, count: tierCounts[tier] })
          setFlipped(false)
          setShowShine(false)
          setShowParticles(false)
          await wait(700) // vibrate/anticipation
          if (cancelled || skipRef.current) return

          // Slow flip
          setFlipped(true)
          await wait(FLIP_SPEED[tier])
          if (cancelled || skipRef.current) return

          // Shine sweep on reveal
          setShowShine(true)

          // Particle burst
          setShowParticles(true)

          // Background flash for T4+
          if (tier <= 4) {
            setBgFlashColor(TMAP[tier]?.accent || '#fff')
            await wait(250)
            if (cancelled || skipRef.current) return
            setBgFlashColor(null)
          }

          // Hold for 1s
          await wait(1000)
          if (cancelled || skipRef.current) return

          setShowShine(false)
          setShowParticles(false)
          setDimmed(false)

          // Hand off to RevealMoment for T3+
          if (tier <= 3 && onRareReveal) {
            onRareReveal(tier)
            return // exit — RevealMoment takes over
          }
        }
      }

      if (!cancelled && !skipRef.current) {
        setPhase(PHASES.SUMMARY)
      }
    }

    runSequence()
    return () => { cancelled = true; clearTimeout(timerRef.current) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Summary phase
  useEffect(() => {
    if (phase !== PHASES.SUMMARY) return
    setDimmed(false)
    setFlipped(false)
    setCurrentFlip(null)
    setCardScale(0.8)
    setSummaryItems(allItems)

    const t = setTimeout(() => setSummaryVisible(true), 200)
    const t2 = setTimeout(() => { if (onComplete) onComplete() }, 2500)
    return () => { clearTimeout(t); clearTimeout(t2) }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const tierAccent = currentFlip ? (TMAP[currentFlip.tier]?.accent || '#888') : borderEffect.color
  const flipDuration = currentFlip ? FLIP_SPEED[currentFlip.tier] : 300

  // Particles for current tier
  const particles = showParticles && currentFlip
    ? makeParticles(currentFlip.tier <= 3 ? 20 : 14, tierAccent)
    : []

  return (
    <>
      <style>{CSS}</style>

      {/* Background flash overlay (T4+ rare reveal) */}
      {bgFlashColor && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 8999,
          background: bgFlashColor,
          animation: 'mint-bg-flash 0.25s ease-out forwards',
          pointerEvents: 'none',
        }} />
      )}

      {/* Screen dim overlay */}
      {dimmed && (
        <div
          onClick={skipToSummary}
          style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(0,0,0,0.4)',
            animation: 'mint-dim-in 0.3s ease-out',
            pointerEvents: 'auto',
          }}
        />
      )}

      {/* Card container */}
      <div
        onClick={skipToSummary}
        style={{
          position: 'fixed',
          top: '50%', left: '50%',
          transform: `translate(-50%, -50%) scale(${cardScale})`,
          zIndex: 9001,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          cursor: 'pointer',
          transition: 'transform 0.3s ease',
        }}
      >
        {/* The card */}
        {phase !== PHASES.SUMMARY && (
          <div style={{
            width: 160, height: 220,
            perspective: 600,
            // Entrance animation
            animation: entered ? 'mint-card-entrance 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards' : 'none',
            opacity: entered ? 1 : 0,
            // Vibrate on pre-signal (if rare) or during rare pre-flip
            ...(
              (borderEffect.vibrate && phase === PHASES.PRE_SIGNAL) ||
              (currentFlip && phase === PHASES.FLIP_RARES && !flipped)
                ? { animation: `mint-card-entrance 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards, mint-card-vibrate 50ms linear infinite` }
                : {}
            ),
          }}>
            <div style={{
              width: '100%', height: '100%',
              position: 'relative',
              transformStyle: 'preserve-3d',
              transition: `transform ${flipDuration}ms ease-in-out`,
              transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            }}>

              {/* ── Card back ────────────────────────────────── */}
              <div style={{
                position: 'absolute', inset: 0,
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                background: FELT_DARK || '#152e1f',
                border: `3px solid ${borderEffect.color}`,
                borderRadius: 6,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
                '--glow-color': borderEffect.color + '88',
                boxShadow: borderEffect.glow
                  ? `0 0 16px 6px ${borderEffect.color}66, 0 8px 24px rgba(0,0,0,0.5)`
                  : `0 4px 12px rgba(0,0,0,0.4)`,
                animation: borderEffect.pulse
                  ? 'mint-card-pulse 1.5s ease-in-out infinite'
                  : borderEffect.glow
                    ? 'mint-card-glow-pulse 1.2s ease-in-out infinite'
                    : 'none',
              }}>
                {/* Crosshatch pattern overlay */}
                <div className="mint-card-back-pattern" style={{ color: GOLD }} />

                {/* Inner border frame */}
                <div style={{
                  position: 'absolute', inset: 6,
                  border: `1px solid ${GOLD}33`,
                  borderRadius: 2,
                  pointerEvents: 'none',
                }} />

                {/* Blok-Hunt logo */}
                <div style={{
                  width: 48, height: 48,
                  background: `linear-gradient(135deg, ${GOLD}44, ${GOLD}22)`,
                  border: `2px solid ${GOLD}66`,
                  borderRadius: 4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 8,
                  position: 'relative', zIndex: 1,
                }}>
                  <span style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: 8, color: GOLD, textAlign: 'center',
                    lineHeight: 1.3,
                  }}>BH</span>
                </div>
                <span style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: 6, color: GOLD + '88',
                  letterSpacing: 2, textTransform: 'uppercase',
                  position: 'relative', zIndex: 1,
                }}>BLOK-HUNT</span>

                {/* Corner dots */}
                {[{t:8,l:8},{t:8,r:8},{b:8,l:8},{b:8,r:8}].map((pos,i) => (
                  <div key={i} style={{
                    position:'absolute', width:4, height:4,
                    background: GOLD+'55', borderRadius:1,
                    ...pos,
                  }}/>
                ))}
              </div>

              {/* ── Card front ───────────────────────────────── */}
              <div style={{
                position: 'absolute', inset: 0,
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
                background: currentFlip ? (TMAP[currentFlip.tier]?.bg || '#1c1c1c') : '#1c1c1c',
                border: `3px solid ${tierAccent}`,
                borderRadius: 6,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: 12,
                overflow: 'hidden',
                boxShadow: `0 8px 24px rgba(0,0,0,0.5), 0 0 12px ${tierAccent}44`,
              }}>
                {/* Shine sweep overlay */}
                {showShine && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    overflow: 'hidden', pointerEvents: 'none',
                    borderRadius: 3, zIndex: 5,
                  }}>
                    <div style={{
                      position: 'absolute', top: -20, left: 0,
                      width: 60, height: 280,
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
                      animation: 'mint-shine-sweep 0.6s ease-out forwards',
                    }} />
                  </div>
                )}

                {currentFlip && (
                  <>
                    {/* Tier image */}
                    {CARD_IMAGES[currentFlip.tier] && (
                      <img
                        src={CARD_IMAGES[currentFlip.tier]}
                        alt={TMAP[currentFlip.tier]?.name}
                        style={{
                          width: phase === PHASES.FLIP_RARES ? 120 : 64,
                          height: phase === PHASES.FLIP_RARES ? 120 : 64,
                          objectFit: 'contain',
                          imageRendering: 'pixelated',
                          transition: 'width 0.3s, height 0.3s',
                          position: 'relative', zIndex: 1,
                        }}
                      />
                    )}

                    {/* Count */}
                    <div style={{
                      fontFamily: "'VT323', monospace",
                      fontSize: phase === PHASES.FLIP_RARES ? 28 : 32,
                      color: tierAccent,
                      marginTop: 8,
                      textShadow: `0 0 10px ${tierAccent}66`,
                      position: 'relative', zIndex: 1,
                    }}>
                      {currentFlip.count}&times;
                    </div>

                    {/* Tier name */}
                    <div style={{
                      fontFamily: phase === PHASES.FLIP_RARES
                        ? "'Press Start 2P', monospace"
                        : "'VT323', monospace",
                      fontSize: phase === PHASES.FLIP_RARES ? 8 : 14,
                      color: CREAM,
                      marginTop: 4, textAlign: 'center',
                      letterSpacing: phase === PHASES.FLIP_RARES ? 1 : 0,
                      position: 'relative', zIndex: 1,
                    }}>
                      {TMAP[currentFlip.tier]?.name?.toUpperCase() || `TIER ${currentFlip.tier}`}
                    </div>

                    {/* Rarity label for rares */}
                    {phase === PHASES.FLIP_RARES && TMAP[currentFlip.tier]?.label && (
                      <div style={{
                        fontFamily: "'Press Start 2P', monospace",
                        fontSize: 6, color: tierAccent,
                        marginTop: 6, letterSpacing: 2,
                        opacity: 0.8, position: 'relative', zIndex: 1,
                      }}>
                        {TMAP[currentFlip.tier].label}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* ── Particle burst (on rare reveal) ──────────── */}
            {particles.length > 0 && (
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                width: 0, height: 0, pointerEvents: 'none', zIndex: 10,
              }}>
                {particles.map((p, i) => {
                  const rad = (p.angle * Math.PI) / 180
                  const px = Math.cos(rad) * p.dist
                  const py = Math.sin(rad) * p.dist
                  return (
                    <div key={i} style={{
                      position: 'absolute',
                      width: p.size, height: p.size,
                      background: p.color,
                      borderRadius: 1,
                      '--px': `${px}px`,
                      '--py': `${py}px`,
                      animation: `mint-particle-burst 0.6s ease-out ${p.delay}ms forwards`,
                    }} />
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Summary with count roll-up ──────────────────── */}
        {phase === PHASES.SUMMARY && summaryVisible && (
          <div style={{
            display: 'flex', flexWrap: 'wrap',
            justifyContent: 'center', gap: '4px 12px',
            marginTop: 12,
          }}>
            {summaryItems.map((item, i) => (
              <span
                key={item.tier}
                style={{
                  fontFamily: "'VT323', monospace",
                  fontSize: 20,
                  color: item.accent,
                  opacity: 0,
                  animation: `mint-summary-fadein 0.3s ease-out ${i * 0.2}s forwards`,
                  textShadow: `0 0 6px ${item.accent}44`,
                }}
              >
                +<CountUp target={item.count} duration={400} style={{}} /> {item.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

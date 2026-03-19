import { useState, useEffect, useRef, useCallback } from 'react';
import { TMAP, COMBINE_RATIOS, GOLD, GOLD_DK, INK } from '../config/design-tokens';
import TierCard from './TierCard';

// ── B3: Count Number Roll-Up ──
function AnimatedCount({ value, color, fontSize = 40 }) {
  const [display, setDisplay] = useState(value)
  const prevRef = useRef(value)
  const rafRef = useRef(null)

  useEffect(() => {
    const from = prevRef.current
    const to = value
    prevRef.current = value
    if (from === to) { setDisplay(to); return }
    const start = performance.now()
    const dur = 500
    function tick(now) {
      const p = Math.min((now - start) / dur, 1)
      const eased = 1 - (1 - p) * (1 - p) // ease-out
      setDisplay(Math.round(from + (to - from) * eased))
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value])

  return <span>{display}</span>
}

// ── B1: Tier Card Hover Tilt (desktop only) ──
function useTilt(enabled) {
  const ref = useRef(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  const onMove = useCallback((e) => {
    if (!ref.current || !enabled) return
    const rect = ref.current.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = (e.clientX - cx) / (rect.width / 2)
    const dy = (e.clientY - cy) / (rect.height / 2)
    setTilt({ x: dx * 8, y: -dy * 8 })
  }, [enabled])

  const onLeave = useCallback(() => setTilt({ x: 0, y: 0 }), [])

  return { ref, tilt, onMove, onLeave }
}

export default function TierSlot({ tierId, count, onCombine, combining=false }) {
  const t = TMAP[tierId];
  const ratio = COMBINE_RATIOS[tierId];
  const canCombine = !!ratio && count >= ratio && tierId > 1;
  const progress = ratio ? Math.min((count / ratio) * 100, 100) : 0;

  // B1: Hover tilt
  const { ref: tiltRef, tilt, onMove, onLeave } = useTilt(count > 0)

  // B2: Combine button pop — detect threshold crossing
  const prevCountRef = useRef(count)
  const [combinePopAnim, setCombinePopAnim] = useState(false)
  useEffect(() => {
    const prev = prevCountRef.current
    prevCountRef.current = count
    if (ratio && prev < ratio && count >= ratio) {
      setCombinePopAnim(true)
      const t = setTimeout(() => setCombinePopAnim(false), 600)
      return () => clearTimeout(t)
    }
  }, [count, ratio])

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5, userSelect:"none" }}>
      <div style={{
        fontFamily:"'Press Start 2P', monospace", fontSize:7,
        color: count > 0 ? `${t.accent}cc` : "rgba(255,255,255,0.18)",
        letterSpacing:0.5, height:16, display:"flex", alignItems:"center", textAlign:"center",
        textShadow: count > 0 ? "0 0 8px rgba(200,168,75,0.3)" : "none",
      }}>{t.short.toUpperCase()}</div>

      <div
        ref={tiltRef}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        style={{
          position:"relative",
          animation: canCombine ? "combineFx 2.5s ease-in-out infinite" : "none",
          transform: count > 0 ? `perspective(600px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg)` : 'none',
          transition: tilt.x === 0 && tilt.y === 0 ? 'transform 0.3s ease-out' : 'transform 0.1s ease-out',
        }}>
        {count > 1 && [2,1].map(i => (
          <div key={i} style={{
            position:"absolute", top:-(i*2), left:(i%2===0?1:-1)*i,
            width:130, height:168, background:t.bg,
            border:`2px solid ${t.border}`, borderRadius:6,
            boxShadow:`3px 3px 0 ${INK}`, opacity:0.5-i*0.1,
          }} />
        ))}
        <div style={{
          position:"relative", zIndex:3,
          transition:"opacity 0.3s, filter 0.3s",
          ...(tierId === 1 && count === 0 ? { border:`2px solid ${GOLD}44`, borderRadius:10, padding:2, opacity:0.45, filter:"grayscale(1) brightness(0.15) contrast(1.2)" } : {}),
        }}>
          {count > 0 || tierId === 1 ? (
            <TierCard tierId={tierId} size="md" glow={canCombine} />
          ) : (
            <div className="tier-card-img" style={{
              width:140, height:140, borderRadius:8,
              background:"rgba(0,0,0,0.5)",
              border:"1px solid rgba(255,255,255,0.06)",
              display:"flex", alignItems:"center", justifyContent:"center",
              flexDirection:"column", gap:6,
              boxShadow:`3px 3px 0 ${INK}`,
            }}>
              <span style={{ fontSize:20, opacity:0.3 }}>🔒</span>
              <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:"rgba(255,255,255,0.12)", letterSpacing:0.5 }}>T{tierId}</span>
            </div>
          )}
        </div>
        {count > 1 && (
          <div style={{
            position:"absolute", top:-5, right:-5, zIndex:10,
            background:t.accent, color:"#000",
            fontFamily:"'Press Start 2P', monospace", fontSize:7,
            padding:"2px 5px", borderRadius:2, boxShadow:`1px 1px 0 ${INK}`,
          }}>×{count > 9999 ? "9k+" : count}</div>
        )}
      </div>

      <div style={{
        fontFamily:"'VT323', monospace", fontSize:40,
        color: count > 0 ? t.accent : "rgba(255,255,255,0.12)",
        lineHeight:1, textShadow: count > 0 ? `0 0 8px ${t.accent}44` : "none",
      }}><AnimatedCount value={count} /></div>

      {tierId > 1 && ratio && (
        <>
          <div style={{
            width:130, height:5, background:"rgba(0,0,0,0.5)",
            border:"1px solid rgba(255,255,255,0.05)", borderRadius:2, overflow:"hidden",
          }}>
            <div style={{
              height:"100%", width:`${progress}%`,
              background: canCombine
                ? `repeating-linear-gradient(90deg,${GOLD},${GOLD} 8px,${GOLD_DK} 8px,${GOLD_DK} 10px)`
                : t.accent,
              transition:"width 0.4s",
            }} />
          </div>
          <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:"rgba(255,255,255,0.45)", letterSpacing:0.5 }}>
            {count}/{ratio}
          </div>
          {count < ratio && (
            <div style={{
              fontFamily:"'VT323', monospace", fontSize:16,
              color: count === 0 ? "rgba(255,255,255,0.2)" : `${t.accent}88`,
              textAlign:"center", lineHeight:1.2, marginTop:1,
            }}>
              {count === 0
                ? `${ratio} = 1 T${tierId - 1}`
                : `${ratio - count} more`}
            </div>
          )}
        </>
      )}

      {tierId > 1 && (
        <button
          onClick={() => canCombine && !combining && onCombine(tierId)}
          style={{
            width:130, padding:"6px 0",
            fontFamily:"'Press Start 2P', monospace", fontSize:7, letterSpacing:0.5,
            background: combining ? "rgba(200,168,75,0.4)" : canCombine ? GOLD : "rgba(0,0,0,0.25)",
            color: canCombine ? INK : "rgba(255,255,255,0.1)",
            border: canCombine ? `2px solid ${GOLD_DK}` : "2px solid rgba(255,255,255,0.06)",
            boxShadow: canCombine ? `3px 3px 0 ${INK}` : "none",
            cursor: canCombine && !combining ? "pointer" : "not-allowed",
            animation: combinePopAnim ? "combinePopIn 0.3s ease-out" : canCombine && !combining ? "combineGlow 1.8s infinite" : "none",
            transition:"all 0.1s",
          }}
          title={canCombine ? `Combine ${ratio}× T${tierId} → 1× T${tierId-1}` : `Need ${ratio - count} more`}
        >
          {combining ? "⏳ WAIT..." : canCombine ? "▲ COMBINE" : "— — —"}
        </button>
      )}

      {tierId === 1 && count > 0 && (
        <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:"#4466ff", animation:"badgePulse 1.5s infinite" }}>
          ★ WINNER
        </div>
      )}
      {tierId === 1 && count === 0 && (
        <div style={{
          fontFamily:"'Press Start 2P', monospace", fontSize:7,
          color: GOLD, opacity:0.6, textAlign:"center", lineHeight:1.4,
        }}>
          ★ SACRIFICE<br/>ONLY
        </div>
      )}
    </div>
  );
}

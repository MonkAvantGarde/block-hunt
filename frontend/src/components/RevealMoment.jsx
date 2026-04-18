import { useState, useEffect } from 'react'
import { TMAP, GOLD, GOLD_DK, GOLD_LT, INK, CREAM } from '../config/design-tokens'
import sounds from '../hooks/useSound'

// Card images
const CARD_IMAGES = {
  2: new URL('../assets/T2.png', import.meta.url).href,
  3: new URL('../assets/T3.png', import.meta.url).href,
  4: new URL('../assets/T4.png', import.meta.url).href,
  5: new URL('../assets/T5.png', import.meta.url).href,
}

// Tier-specific reveal configs
const REVEAL_CONFIG = {
  5: { // Uncommon — The Remembered
    duration: 1500,
    cardSize: 200,
    glowColor: '#33aaff',
    particleColor: '#33aaff',
    particleCount: 12,
    label: 'UNCOMMON',
    showShare: false,
  },
  4: { // Rare — The Ordered
    duration: 2000,
    cardSize: 200,
    glowColor: '#ffcc33',
    particleColor: '#ffcc33',
    particleCount: 18,
    label: 'RARE',
    showShare: false,
  },
  3: { // Epic — The Chaotic
    duration: 3000,
    cardSize: 300,
    glowColor: '#cc66ff',
    particleColor: '#cc66ff',
    particleCount: 24,
    label: 'EPIC',
    showShare: true,
    shake: true,
  },
  2: { // Mythic — The Willful
    duration: 4000,
    cardSize: 300,
    glowColor: '#ff6622',
    particleColor: '#ff4400',
    particleCount: 30,
    label: 'MYTHIC',
    showShare: true,
    shake: true,
    fire: true,
  },
}

const REVEAL_CSS = `
  @keyframes reveal-entrance {
    0%   { transform: scale(0.3) rotateY(180deg); opacity: 0; }
    40%  { transform: scale(1.1) rotateY(0deg);   opacity: 1; }
    60%  { transform: scale(0.95); }
    100% { transform: scale(1); }
  }
  @keyframes reveal-glow {
    0%,100% { box-shadow: 0 0 30px var(--glow-color), 0 0 60px var(--glow-color-dim); }
    50%     { box-shadow: 0 0 60px var(--glow-color), 0 0 120px var(--glow-color-dim); }
  }
  @keyframes reveal-particle {
    0%   { transform: translate(0, 0) scale(1); opacity: 1; }
    100% { transform: translate(var(--px), var(--py)) scale(0); opacity: 0; }
  }
  @keyframes reveal-fire-particle {
    0%   { transform: translateY(0) scale(1); opacity: 0.9; }
    50%  { opacity: 1; }
    100% { transform: translateY(var(--fy)) scale(0.2); opacity: 0; }
  }
  @keyframes reveal-shake {
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-3px); }
    20%, 40%, 60%, 80% { transform: translateX(3px); }
  }
  @keyframes reveal-label-in {
    0%   { transform: translateY(10px); opacity: 0; }
    100% { transform: translateY(0); opacity: 1; }
  }
  @keyframes reveal-backdrop {
    0%   { opacity: 0; }
    100% { opacity: 1; }
  }
`

function Particles({ count, color, size, fire }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (360 / count) * i
        const dist = 80 + Math.random() * 120
        const px = Math.cos((angle * Math.PI) / 180) * dist
        const py = Math.sin((angle * Math.PI) / 180) * dist
        const delay = Math.random() * 0.5
        const particleSize = 3 + Math.random() * 4

        if (fire) {
          const fx = -30 + Math.random() * 60
          const fy = -(60 + Math.random() * 100)
          return (
            <div key={i} style={{
              position: 'absolute',
              left: `calc(50% + ${fx}px)`,
              bottom: 0,
              width: particleSize,
              height: particleSize * 1.5,
              borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
              background: i % 3 === 0 ? '#ff4400' : i % 3 === 1 ? '#ff8800' : '#ffcc00',
              '--fy': `${fy}px`,
              animation: `reveal-fire-particle ${1.2 + Math.random() * 0.8}s ease-out ${delay}s infinite`,
              pointerEvents: 'none',
            }} />
          )
        }

        return (
          <div key={i} style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: particleSize,
            height: particleSize,
            borderRadius: '50%',
            background: color,
            '--px': `${px}px`,
            '--py': `${py}px`,
            animation: `reveal-particle ${0.8 + Math.random() * 0.6}s ease-out ${delay}s both`,
            pointerEvents: 'none',
          }} />
        )
      })}
    </>
  )
}

export default function RevealMoment({ tier, prizePool, onDismiss }) {
  const config = REVEAL_CONFIG[tier]
  const tierData = TMAP[tier]
  if (!config || !tierData) return null

  const [phase, setPhase] = useState('entrance') // entrance → visible → exit

  // Play reveal sound when animation starts
  useEffect(() => {
    sounds.reveal()
  }, [])

  // Auto-dismiss after duration
  useEffect(() => {
    const t = setTimeout(() => {
      if (onDismiss) onDismiss()
    }, config.duration + 500)
    return () => clearTimeout(t)
  }, [config.duration])

  function handleDismiss() {
    if (onDismiss) onDismiss()
  }

  function handleShare() {
    const text = tier === 2
      ? `I just pulled ${tierData.name} in @TheBlockHunt. Prize pool: Ξ ${prizePool || '???'}. One player wins everything.`
      : `I just pulled ${tierData.name} (${config.label}) in @TheBlockHunt. Prize pool: Ξ ${prizePool || '???'}. One player wins everything.`
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`
    window.open(url, '_blank', 'noopener')
  }

  return (
    <div
      onClick={handleDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 8000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 16,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        cursor: 'pointer',
        animation: config.shake
          ? 'reveal-backdrop 0.3s ease-out, reveal-shake 0.4s ease-in-out 0.2s'
          : 'reveal-backdrop 0.3s ease-out',
      }}
    >
      <style>{REVEAL_CSS}</style>

      {/* Label */}
      <div style={{
        fontFamily: "'Press Start 2P', monospace",
        fontSize: 8,
        color: config.glowColor,
        letterSpacing: 4,
        opacity: 0.8,
        animation: 'reveal-label-in 0.5s ease-out 0.3s both',
      }}>
        {config.label}
      </div>

      {/* Card container */}
      <div
        onClick={e => e.stopPropagation()}
        style={{ position: 'relative' }}
      >
        {/* Particles */}
        <Particles
          count={config.particleCount}
          color={config.particleColor}
          size={config.cardSize}
          fire={config.fire}
        />

        {/* Card */}
        <div style={{
          width: config.cardSize,
          height: config.cardSize,
          borderRadius: 8,
          overflow: 'hidden',
          '--glow-color': `${config.glowColor}88`,
          '--glow-color-dim': `${config.glowColor}33`,
          animation: `reveal-entrance 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) both, reveal-glow 2s ease-in-out 0.8s infinite`,
          boxShadow: `0 0 40px ${config.glowColor}66`,
        }}>
          <img
            src={CARD_IMAGES[tier]}
            alt={tierData.name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              imageRendering: 'pixelated',
              display: 'block',
            }}
          />
        </div>
      </div>

      {/* Tier name */}
      <div style={{
        fontFamily: "'VT323', monospace",
        fontSize: 36,
        color: config.glowColor,
        textShadow: `0 0 20px ${config.glowColor}66`,
        animation: 'reveal-label-in 0.5s ease-out 0.5s both',
      }}>
        {tierData.name}
      </div>

      {/* Sub text */}
      <div style={{
        fontFamily: "'Courier Prime', monospace",
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        animation: 'reveal-label-in 0.5s ease-out 0.6s both',
      }}>
        Added to your collection
      </div>

      {/* Share button for T3/T2 */}
      {config.showShare && (
        <button
          onClick={e => { e.stopPropagation(); handleShare() }}
          style={{
            height: 44,
            width: 160,
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 7,
            letterSpacing: 1,
            color: CREAM,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.2)',
            cursor: 'pointer',
            animation: 'reveal-label-in 0.5s ease-out 0.8s both',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
        >
          SHARE ON X
        </button>
      )}

      {/* Tap to dismiss */}
      <div style={{
        fontFamily: "'Press Start 2P', monospace",
        fontSize: 6,
        color: 'rgba(255,255,255,0.2)',
        marginTop: 8,
        animation: 'reveal-label-in 0.5s ease-out 1s both',
      }}>
        tap anywhere to dismiss
      </div>
    </div>
  )
}

// ── Combine Ceremony (mini-reveal for new tier unlock via combine) ──

export function CombineCeremony({ tier, onDismiss }) {
  const tierData = TMAP[tier]
  if (!tierData) return null

  useEffect(() => {
    const t = setTimeout(onDismiss, 1500)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 8000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 12,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        cursor: 'pointer',
        animation: 'reveal-backdrop 0.2s ease-out',
      }}
    >
      <style>{REVEAL_CSS}</style>

      <div style={{
        fontFamily: "'Press Start 2P', monospace",
        fontSize: 7,
        color: GOLD,
        letterSpacing: 3,
        animation: 'reveal-label-in 0.3s ease-out both',
      }}>
        NEW TIER UNLOCKED
      </div>

      <div style={{
        width: 160,
        height: 160,
        borderRadius: 8,
        overflow: 'hidden',
        '--glow-color': `${tierData.accent}88`,
        '--glow-color-dim': `${tierData.accent}33`,
        animation: 'reveal-entrance 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both, reveal-glow 1.5s ease-in-out 0.5s infinite',
        boxShadow: `0 0 30px ${tierData.accent}55`,
      }}>
        {CARD_IMAGES[tier] ? (
          <img
            src={CARD_IMAGES[tier]}
            alt={tierData.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'pixelated', display: 'block' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: tierData.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Press Start 2P', monospace", fontSize: 24, color: tierData.accent,
          }}>T{tier}</div>
        )}
      </div>

      <div style={{
        fontFamily: "'VT323', monospace",
        fontSize: 28,
        color: tierData.accent,
        textShadow: `0 0 12px ${tierData.accent}44`,
        animation: 'reveal-label-in 0.3s ease-out 0.3s both',
      }}>
        {tierData.name}
      </div>
    </div>
  )
}

import { useState, useEffect, useRef, useCallback } from 'react'
import { GOLD, GOLD_DK, GOLD_LT, INK, CREAM, BATCH_PRICES_ETH } from '../config/design-tokens'
import RollingDigits from './RollingDigits'

// B5: Hook for StatusBar number flash
function useFlash(value) {
  const [flash, setFlash] = useState(false)
  const prevRef = useRef(value)
  const timerRef = useRef(null)
  useEffect(() => {
    if (prevRef.current !== value && prevRef.current != null) {
      setFlash(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setFlash(false), 500)
    }
    prevRef.current = value
  }, [value])
  return flash
}

const ETH_USD = 2500

const PREP_TIPS = [
  "Review your collection — plan your next combine",
  "Check the forge — any tiers ready to upgrade?",
  "Study the leaderboard — see who's climbing",
  "Stack blocks now — combine when the window opens",
  "Forge while you wait — improve your odds",
]

export default function GameStatusBar({ prizePool, windowInfo, mintStatus, currentBatch, mintPrice }) {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000))
  const [showBanner, setShowBanner] = useState(false)
  const prevOpenRef = useRef(null)

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  // ── Per-player cooldown status ──
  const canMint = mintStatus?.canMint ?? true
  const onCooldown = mintStatus?.cooldownUntil > 0 && mintStatus.cooldownUntil > now
  const dailyCapHit = mintStatus && mintStatus.dailyMints >= mintStatus.dailyCap && mintStatus.dailyResetsAt > now

  // Cooldown timer
  let statusLabel = "● OPEN"
  let statusColor = "#6eff8a"
  let statusDetail = ""
  if (onCooldown) {
    const secs = Math.max(0, mintStatus.cooldownUntil - now)
    statusLabel = "⏳ COOLDOWN"
    statusColor = "#ffaa33"
    statusDetail = `ends in ${formatTime(secs)}`
  } else if (dailyCapHit) {
    const secs = Math.max(0, mintStatus.dailyResetsAt - now)
    statusLabel = "⏳ DAILY CAP"
    statusColor = "#ff4444"
    statusDetail = `resets in ${formatTime(secs)}`
  }

  // Cycle progress
  const cycleMinted = mintStatus?.mintedThisCycle || 0
  const cycleCap = mintStatus?.cycleCap || 500
  const cyclePct = cycleCap > 0 ? Math.min((cycleMinted / cycleCap) * 100, 100) : 0

  const usd = prizePool ? (parseFloat(prizePool) * ETH_USD).toFixed(0) : "0"

  // B5: Flash on value changes
  const poolFlash = useFlash(prizePool)
  const batchFlash = useFlash(currentBatch)

  return (
    <>
      <style>{`
        @keyframes urgencyPulse {
          0%,100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes bannerSlide {
          from { opacity: 0; transform: translateY(-100%); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes bannerFade {
          from { opacity: 1; }
          to   { opacity: 0; }
        }
      `}</style>

      {/* Banner removed — minting is always open */}

      <div style={{
        height: 64,
        display: "flex",
        background: "rgba(0,0,0,0.25)",
        border: `1px solid rgba(255,255,255,0.06)`,
        overflow: "hidden",
      }}>
        {/* Col 1: Prize Pool */}
        <div style={colStyle}>
          <div style={labelStyle}>PRIZE POOL</div>
          <div style={{ ...valueStyle, textShadow: `0 0 12px ${GOLD}66`, color: poolFlash ? '#ffffff' : GOLD_LT, transition: 'color 0.3s ease-out' }}>
            <RollingDigits value={parseFloat(prizePool || "0")} prefix="Ξ " decimals={4} fontSize={28} color={poolFlash ? '#ffffff' : GOLD_LT} />
          </div>
          <div style={detailStyle}>≈ ${usd}</div>
        </div>

        <div style={dividerStyle} />

        {/* Col 2: Mint Status */}
        <div style={colStyle}>
          <div style={labelStyle}>MINTING</div>
          <div style={{
            ...valueStyle,
            color: statusColor,
            fontSize: 24,
          }}>
            {statusLabel}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={detailStyle}>
                {statusDetail || `${cycleMinted}/${cycleCap} this cycle`}
              </div>
              <div style={{
                width: 60, height: 4, background: "rgba(0,0,0,0.4)",
                borderRadius: 2, overflow: "hidden",
              }}>
                <div style={{
                  height: "100%", width: `${cyclePct}%`,
                  background: cyclePct >= 80 ? "#ff6644" : "#6eff8a",
                  transition: "width 0.5s",
                }} />
              </div>
            </div>
          </div>
        </div>

        <div style={dividerStyle} />

        {/* Col 3: Batch */}
        <div style={colStyle}>
          <div style={labelStyle}>BATCH</div>
          <div style={{ ...valueStyle, color: batchFlash ? '#ffffff' : GOLD_LT, transition: 'color 0.3s ease-out' }}>{currentBatch || 1} / 10</div>
          <div style={detailStyle}>{mintPrice || BATCH_PRICES_ETH[1]} Ξ per block</div>
        </div>
      </div>
    </>
  )
}

function formatTime(totalSecs) {
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

const colStyle = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "4px 12px",
  gap: 1,
}

const labelStyle = {
  fontFamily: "'Press Start 2P', monospace",
  fontSize: 8,
  color: GOLD,
  opacity: 0.6,
  letterSpacing: 2,
  textTransform: "uppercase",
  textShadow: "0 0 8px rgba(200,168,75,0.3)",
}

const valueStyle = {
  fontFamily: "'VT323', monospace",
  fontSize: 28,
  color: GOLD_LT,
  lineHeight: 1,
}

const detailStyle = {
  fontFamily: "'Press Start 2P', monospace",
  fontSize: 8,
  color: CREAM,
  opacity: 0.45,
}

const dividerStyle = {
  width: 1,
  background: "rgba(255,255,255,0.08)",
  alignSelf: "stretch",
}

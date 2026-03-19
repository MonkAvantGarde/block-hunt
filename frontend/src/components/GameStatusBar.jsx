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

export default function GameStatusBar({ prizePool, windowInfo, currentBatch, mintPrice }) {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000))
  const [showBanner, setShowBanner] = useState(false)
  const prevOpenRef = useRef(null)

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  // ── Fix H: Detect window opening transition ──
  const windowOpen = windowInfo?.isOpen ?? false
  useEffect(() => {
    if (prevOpenRef.current === false && windowOpen === true) {
      setShowBanner(true)
      const t = setTimeout(() => setShowBanner(false), 5000)
      return () => clearTimeout(t)
    }
    prevOpenRef.current = windowOpen
  }, [windowOpen])

  // ── Window timer ──
  let timerLabel = "Not yet scheduled"
  let remainingSecs = null
  if (windowInfo) {
    if (windowOpen && windowInfo.closeAt) {
      const secs = Math.max(0, Number(windowInfo.closeAt) - now)
      remainingSecs = secs
      if (secs > 0) timerLabel = formatTime(secs)
      else timerLabel = "Closing…"
    } else if (!windowOpen && windowInfo.openAt && Number(windowInfo.openAt) > now) {
      const secs = Number(windowInfo.openAt) - now
      remainingSecs = secs
      timerLabel = formatTime(secs)
    }
  }

  // ── Fix F: Urgency colors for open window ──
  let urgencyColor = "#6eff8a" // green (default when open)
  let urgencyPulse = "none"
  if (windowOpen && remainingSecs !== null) {
    if (remainingSecs <= 900) {
      // <15 min: red + fast pulse
      urgencyColor = "#ff4444"
      urgencyPulse = "urgencyPulse 0.6s ease-in-out infinite"
    } else if (remainingSecs <= 3600) {
      // <60 min: amber + moderate pulse
      urgencyColor = "#ffaa33"
      urgencyPulse = "urgencyPulse 1.2s ease-in-out infinite"
    }
  }

  // ── Fix G: Preparation tip (between windows) ──
  const tipIndex = Math.floor(now / 30) % PREP_TIPS.length
  const prepTip = PREP_TIPS[tipIndex]

  // ── Minted bar ──
  const allocated = windowInfo?.allocated || 0
  const minted = windowInfo?.minted || 0
  const mintedPct = allocated > 0 ? Math.min((minted / allocated) * 100, 100) : 0

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

      {/* Fix H: Window opening banner */}
      {showBanner && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 9000,
          background: `linear-gradient(90deg, ${GOLD_DK}, ${GOLD}, ${GOLD_DK})`,
          padding: "10px 0",
          textAlign: "center",
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 9,
          color: INK,
          letterSpacing: 2,
          textShadow: `0 0 8px ${GOLD}66`,
          animation: "bannerSlide 0.3s ease-out",
          boxShadow: `0 2px 12px ${GOLD}44`,
        }}>
          ⬡ MINT WINDOW IS NOW OPEN ⬡
        </div>
      )}

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

        {/* Col 2: Mint Window */}
        <div style={colStyle}>
          <div style={labelStyle}>MINT WINDOW</div>
          <div style={{
            ...valueStyle,
            color: windowOpen ? urgencyColor : "#ff8888",
            fontSize: 22,
            animation: windowOpen ? urgencyPulse : "none",
          }}>
            {windowOpen ? "● OPEN" : "○ CLOSED"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                ...detailStyle,
                color: windowOpen && remainingSecs !== null && remainingSecs <= 3600 ? urgencyColor : undefined,
                opacity: windowOpen && remainingSecs !== null && remainingSecs <= 3600 ? 0.9 : undefined,
              }}>
                {windowOpen
                  ? `closes ${timerLabel}`
                  : timerLabel === "Not yet scheduled"
                    ? timerLabel
                    : `Next window in ${timerLabel}`
                }
              </div>
              {allocated > 0 && (
                <div style={{
                  width: 60, height: 4, background: "rgba(0,0,0,0.4)",
                  borderRadius: 2, overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%", width: `${mintedPct}%`,
                    background: mintedPct > 80 ? "#ff6644" : "#6eff8a",
                    transition: "width 0.5s",
                  }} />
                </div>
              )}
            </div>
            {/* Fix G: Preparation tip when window is closed */}
            {!windowOpen && timerLabel !== "Not yet scheduled" && (
              <div style={{
                fontFamily: "'Courier Prime', monospace",
                fontSize: 9,
                color: "rgba(255,255,255,0.3)",
                fontStyle: "italic",
              }}>
                {prepTip}
              </div>
            )}
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
  fontSize: 7,
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
  fontSize: 7,
  color: CREAM,
  opacity: 0.45,
}

const dividerStyle = {
  width: 1,
  background: "rgba(255,255,255,0.08)",
  alignSelf: "stretch",
}

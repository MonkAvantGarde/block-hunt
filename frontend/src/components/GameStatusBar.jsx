import { useState, useEffect } from 'react'
import { GOLD, GOLD_DK, GOLD_LT, INK, CREAM, BATCH_PRICES_ETH } from '../config/design-tokens'

const ETH_USD = 2500

export default function GameStatusBar({ prizePool, windowInfo, currentBatch, mintPrice }) {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000))

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  // ── Window timer ──
  const windowOpen = windowInfo?.isOpen ?? false
  let timerLabel = "Not yet scheduled"
  if (windowInfo) {
    if (windowOpen && windowInfo.closeAt) {
      const secs = Math.max(0, Number(windowInfo.closeAt) - now)
      if (secs > 0) timerLabel = formatTime(secs)
      else timerLabel = "Closing…"
    } else if (!windowOpen && windowInfo.openAt && Number(windowInfo.openAt) > now) {
      const secs = Number(windowInfo.openAt) - now
      timerLabel = formatTime(secs)
    }
  }

  // ── Minted bar ──
  const allocated = windowInfo?.allocated || 0
  const minted = windowInfo?.minted || 0
  const mintedPct = allocated > 0 ? Math.min((minted / allocated) * 100, 100) : 0

  const usd = prizePool ? (parseFloat(prizePool) * ETH_USD).toFixed(0) : "0"

  return (
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
        <div style={{ ...valueStyle, textShadow: `0 0 12px ${GOLD}66` }}>
          Ξ {prizePool || "0.0000"}
        </div>
        <div style={detailStyle}>≈ ${usd}</div>
      </div>

      <div style={dividerStyle} />

      {/* Col 2: Mint Window */}
      <div style={colStyle}>
        <div style={labelStyle}>MINT WINDOW</div>
        <div style={{
          ...valueStyle,
          color: windowOpen ? "#6eff8a" : "#ff8888",
          fontSize: 22,
        }}>
          {windowOpen ? "● OPEN" : "○ CLOSED"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={detailStyle}>
            {windowOpen ? `closes ${timerLabel}` : timerLabel === "Not yet scheduled" ? timerLabel : `opens ${timerLabel}`}
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
      </div>

      <div style={dividerStyle} />

      {/* Col 3: Batch */}
      <div style={colStyle}>
        <div style={labelStyle}>BATCH</div>
        <div style={valueStyle}>{currentBatch || 1} / 6</div>
        <div style={detailStyle}>{mintPrice || BATCH_PRICES_ETH[1]} Ξ per block</div>
      </div>
    </div>
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

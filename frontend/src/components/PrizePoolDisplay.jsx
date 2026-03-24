// ─────────────────────────────────────────────────────────────────────────────
// PrizePoolDisplay.jsx — Shared prize pool component with 3 sizes
//
// Usage:
//   <PrizePoolDisplay eth={0.1234} size="compact" />   — header bars
//   <PrizePoolDisplay eth={0.1234} size="medium" />    — panels
//   <PrizePoolDisplay eth={0.1234} size="hero" />      — landing/countdown
// ─────────────────────────────────────────────────────────────────────────────

import { GOLD, GOLD_DK, GOLD_LT, CREAM, EMBER_LT, INK } from '../config/design-tokens'
import RollingDigits from './RollingDigits'

const ETH_USD = 2500;

export default function PrizePoolDisplay({ eth = 0, size = "medium" }) {
  const usd = (eth * ETH_USD).toLocaleString(undefined, { maximumFractionDigits: 0 });

  if (size === "compact") {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        fontFamily: "'Press Start 2P', monospace",
      }}>
        <span style={{ fontSize: 6, color: GOLD, opacity: .7, letterSpacing: 1 }}>PRIZE POOL</span>
        <RollingDigits value={eth} prefix="Ξ " decimals={4} fontSize={8} color={GOLD_LT} style={{ letterSpacing: 1 }} />
      </div>
    );
  }

  if (size === "medium") {
    return (
      <div style={{
        background: "rgba(0,0,0,0.35)", border: `1px solid ${GOLD_DK}44`,
        padding: "10px 14px", display: "flex", justifyContent: "space-between",
        alignItems: "baseline",
      }}>
        <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: GOLD, opacity: .7, letterSpacing: 1 }}>PRIZE POOL</span>
        <div style={{ textAlign: "right" }}>
          <RollingDigits value={eth} prefix="Ξ " decimals={4} fontSize={28} color={GOLD_LT} />
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5, color: GOLD, opacity: .5, letterSpacing: .5 }}>≈ ${usd}</div>
        </div>
      </div>
    );
  }

  // hero size
  return (
    <div style={{
      textAlign: "center", padding: "32px 20px",
      background: "rgba(0,0,0,0.2)", border: `1px solid ${GOLD_DK}44`,
    }}>
      <div style={{
        fontFamily: "'Press Start 2P', monospace", fontSize: 7,
        color: GOLD, opacity: .8, letterSpacing: 3, marginBottom: 12,
      }}>CURRENT PRIZE POOL</div>
      <div style={{
        fontFamily: "'VT323', monospace", fontSize: "clamp(64px,10vw,96px)",
        color: GOLD_LT, lineHeight: 1, marginBottom: 8,
        animation: "prize-glow 3s ease-in-out infinite",
      }}><RollingDigits value={eth} prefix="Ξ " decimals={4} fontSize={72} color={GOLD_LT} /></div>
      <div style={{
        fontFamily: "'Press Start 2P', monospace", fontSize: 8,
        color: GOLD, opacity: .7, letterSpacing: 2,
      }}>≈ ${usd} USD</div>

      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 20, flexWrap: "wrap" }}>
        {[
          { label: "IF CLAIMED", value: `Ξ ${eth.toFixed(4)}`, note: "100% to holder", col: GOLD },
          { label: "IF SACRIFICED", value: `Ξ ${(eth / 2).toFixed(4)}`, note: "50% winner + Origin · 40% top 100 · 10% S2", col: EMBER_LT },
        ].map(p => (
          <div key={p.label} style={{
            border: `1px solid ${p.col}33`, padding: "12px 20px",
            background: "rgba(0,0,0,0.25)", textAlign: "center", minWidth: 180,
          }}>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5.5, color: p.col, opacity: .6, letterSpacing: 1, marginBottom: 6 }}>{p.label}</div>
            <div style={{ fontFamily: "'VT323', monospace", fontSize: 28, color: p.col }}>{p.value}</div>
            <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 10, color: "rgba(255,255,255,.3)", marginTop: 4 }}>{p.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { useBalance } from "wagmi";
import { CONTRACTS } from "../config/wagmi";

// ═══════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════
const FELT       = "#1e4d32";
const FELT_DEEP  = "#142e1e";
const WOOD       = "#2c1810";
const GOLD       = "#c8a84b";
const GOLD_DK    = "#8a6820";
const GOLD_LT    = "#e8c86b";
const INK        = "#1a1208";
const CREAM      = "#f0ead6";

const ETH_USD = 2500;

// ═══════════════════════════════════════════════════════════════
// GLOBAL CSS
// ═══════════════════════════════════════════════════════════════
const LANDING_CSS = `
  .landing-root { cursor: crosshair; }

  @keyframes float-up {
    0%   { opacity:0; transform:translateY(0) scale(0.5); }
    10%  { opacity:0.5; }
    90%  { opacity:0.15; }
    100% { opacity:0; transform:translateY(-120vh) scale(1.5); }
  }
  @keyframes pulse-dot {
    0%,100% { opacity:1; transform:scale(1); }
    50%     { opacity:0.4; transform:scale(0.6); }
  }
  @keyframes halo-pulse {
    0%,100% { transform:scale(1); opacity:1; }
    50%     { transform:scale(1.15); opacity:0.6; }
  }
  @keyframes rays-spin {
    from { transform:rotate(0deg); }
    to   { transform:rotate(360deg); }
  }
  @keyframes block-squeeze {
    0%,100% { transform:scaleX(1); }
    12%     { transform:scaleX(0.5) rotate(2deg); }
    25%     { transform:scaleX(0.05); }
    37%     { transform:scaleX(-0.5) rotate(-2deg); }
    50%     { transform:scaleX(-1); }
    62%     { transform:scaleX(-0.5) rotate(2deg); }
    75%     { transform:scaleX(0.05); }
    87%     { transform:scaleX(0.5) rotate(-2deg); }
  }
  @keyframes block-float {
    0%,100% { transform:translateY(0); }
    50%     { transform:translateY(-10px); }
  }
  @keyframes spark-pulse {
    0%,100% { opacity:0.85; transform:scale(1); }
    50%     { opacity:0.2; transform:scale(0.5); }
  }
  @keyframes fade-in {
    from { opacity:0; transform:translateY(6px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes title-glow {
    0%,100% { text-shadow: 3px 3px 0 ${GOLD_DK}, 0 0 30px ${GOLD}44; }
    50%     { text-shadow: 3px 3px 0 ${GOLD_DK}, 0 0 60px ${GOLD}88; }
  }
  @keyframes enter-pulse {
    0%,100% { box-shadow: 5px 5px 0 ${INK}, 0 0 20px ${GOLD}44; }
    50%     { box-shadow: 5px 5px 0 ${INK}, 0 0 40px ${GOLD}99; }
  }
  @keyframes prize-glow {
    0%,100% { text-shadow: 0 0 30px rgba(200,168,75,.35), 0 0 60px rgba(200,168,75,.15); }
    50%     { text-shadow: 0 0 60px rgba(200,168,75,.7),  0 0 120px rgba(200,168,75,.3); }
  }
  @keyframes chevron-bounce {
    0%,100% { transform: translateY(0); }
    50%     { transform: translateY(6px); }
  }
  @keyframes growth-pulse {
    0%,100% { opacity: 0.5; }
    50%     { opacity: 1; }
  }
  @keyframes scanline-move {
    0%   { transform:translateY(-100%); }
    100% { transform:translateY(100vh); }
  }

  .enter-btn {
    animation: enter-pulse 2s ease-in-out infinite;
    transition: transform 0.05s, box-shadow 0.05s;
  }
  .enter-btn:active {
    transform: translate(3px,3px) !important;
    box-shadow: 2px 2px 0 ${INK} !important;
  }
  .enter-btn:hover {
    background: ${GOLD_LT} !important;
  }
  .action-pill:hover {
    border-color: rgba(200,168,75,0.6) !important;
    background: rgba(200,168,75,0.12) !important;
  }
`;

// ═══════════════════════════════════════════════════════════════
// SPINNING BLOCK SVG
// ═══════════════════════════════════════════════════════════════
function SpinningBlock() {
  return (
    <div style={{
      position: "absolute",
      inset: 20,
      zIndex: 2,
      animation: "block-float 4s ease-in-out infinite",
    }}>
      <svg
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          width: "100%", height: "100%",
          animation: "block-squeeze 8s linear infinite",
          filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.7))",
        }}
      >
        <defs>
          <linearGradient id="top-shade" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor="white" stopOpacity="0.15"/>
            <stop offset="100%" stopColor="black"  stopOpacity="0.08"/>
          </linearGradient>
        </defs>
        <polygon points="60,8 108,34 60,60 12,34" fill="#e8c86b"/>
        <polygon points="60,8 108,34 60,60 12,34" fill="url(#top-shade)"/>
        <polygon points="12,34 60,60 60,100 12,74" fill="#8a6820"/>
        <polygon points="108,34 60,60 60,100 108,74" fill="#b8902a"/>
        <polyline points="60,8 108,34 108,74 60,100 12,74 12,34 60,8" stroke="#1a1208" strokeWidth="2.5" fill="none"/>
        <line x1="60" y1="8"  x2="60"  y2="60" stroke="#1a1208" strokeWidth="1.5"/>
        <line x1="60" y1="60" x2="60"  y2="100" stroke="#1a1208" strokeWidth="1.5"/>
        <line x1="60" y1="60" x2="12"  y2="34"  stroke="#1a1208" strokeWidth="1"/>
        <line x1="60" y1="60" x2="108" y2="34"  stroke="#1a1208" strokeWidth="1"/>
        <polygon points="60,12 104,36 60,58 16,36" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1"/>
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// RAYS
// ═══════════════════════════════════════════════════════════════
function Rays() {
  const RAY_COUNT = 16;
  const rays = Array.from({ length: RAY_COUNT }, (_, i) => {
    const angleDeg = (360 / RAY_COUNT) * i;
    const len   = i % 2 === 0 ? 85 : 55;
    const width = i % 2 === 0 ? 3 : 2;
    return { angleDeg, len, width };
  });

  return (
    <div style={{
      position: "absolute", inset: -40, zIndex: 0,
      animation: "rays-spin 12s linear infinite",
    }}>
      {rays.map((r, i) => (
        <div key={i} style={{
          position: "absolute",
          left: "50%", top: "50%",
          width: r.len,
          height: r.width,
          marginTop: -(r.width / 2),
          transformOrigin: "0 50%",
          transform: `rotate(${r.angleDeg}deg)`,
          background: "linear-gradient(90deg, rgba(200,168,75,0.6), rgba(200,168,75,0.08), transparent)",
          imageRendering: "pixelated",
        }} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SPARKS
// ═══════════════════════════════════════════════════════════════
const SPARK_CONFIGS = [
  [22,  70, 4, 0],   [67,  58, 3, 0.3],  [112, 75, 5, 0.6],  [157, 60, 3, 0.1],
  [202, 68, 4, 0.8], [247, 55, 3, 0.4],  [292, 72, 5, 0.2],  [337, 62, 3, 0.7],
  [45,  95, 2, 0.5], [90,  88, 2, 1.1],  [135, 98, 3, 0.9],  [180, 90, 2, 0.3],
  [225, 92, 2, 1.3], [270, 86, 3, 0.6],  [315, 96, 2, 0.2],  [0,   88, 2, 1.0],
];

function Sparks() {
  const wrapCX = 120, wrapCY = 120;
  return (
    <div style={{ position: "absolute", inset: -40, zIndex: 1, pointerEvents: "none" }}>
      {SPARK_CONFIGS.map(([angleDeg, dist, size, delay], i) => {
        const rad = (angleDeg * Math.PI) / 180;
        const x = wrapCX + Math.cos(rad) * dist - size / 2;
        const y = wrapCY + Math.sin(rad) * dist - size / 2;
        return (
          <div key={i} style={{
            position: "absolute",
            left: x, top: y,
            width: size, height: size,
            background: size >= 4 ? "#e8c86b" : "#c8a84b",
            imageRendering: "pixelated",
            animation: `spark-pulse ${1.6 + (i * 0.07)}s ease-in-out ${delay}s infinite`,
          }} />
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FLOATING PARTICLES
// ═══════════════════════════════════════════════════════════════
function Particles() {
  const particles = useRef(
    Array.from({ length: 30 }, (_, i) => ({
      left:     Math.random() * 100,
      size:     Math.random() > 0.6 ? 4 : 2,
      round:    Math.random() > 0.5,
      color:    Math.random() > 0.4 ? "#c8a84b" : "#f0ead6",
      duration: 9 + Math.random() * 14,
      delay:    Math.random() * 14,
    }))
  ).current;

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 2 }}>
      {particles.map((p, i) => (
        <div key={i} style={{
          position: "absolute",
          left: `${p.left}%`,
          bottom: -10,
          width: p.size,
          height: p.size,
          borderRadius: p.round ? "50%" : 0,
          background: p.color,
          animation: `float-up ${p.duration}s ${p.delay}s linear infinite`,
        }} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ACTION PILLS (moved below fold)
// ═══════════════════════════════════════════════════════════════
const ACTIONS = [
  { icon: "\u2B21", label: "COLLECT", sub: "Mint blocks",         accent: "#6eff8a" },
  { icon: "\u25C8", label: "COMBINE", sub: "Merge tiers",         accent: "#ffcc33" },
  { icon: "\u21C4", label: "TRADE",   sub: "Buy & sell",          accent: "#ff9944" },
  { icon: "\u26A1", label: "FORGE",   sub: "Risk the burn",       accent: "#cc66ff" },
  { icon: "\u2605", label: "CLAIM",   sub: "Win the prize pool",  accent: GOLD      },
];

const TIER_TABLE = [
  { tier: 7, name: "The Inert",      label: "COMMON",    color: "#aaaaaa" },
  { tier: 6, name: "The Restless",   label: "COMMON",    color: "#8fa8c8" },
  { tier: 5, name: "The Remembered", label: "UNCOMMON",  color: "#8fb87a" },
  { tier: 4, name: "The Ordered",    label: "RARE",      color: "#c8c870" },
  { tier: 3, name: "The Chaotic",    label: "EPIC",      color: "#c87a7a" },
  { tier: 2, name: "The Willful",    label: "MYTHIC",    color: "#c8a84b" },
  { tier: 1, name: "The Origin",     label: "LEGENDARY", color: "#ffffff", dim: true },
];

// ═══════════════════════════════════════════════════════════════
// MAIN LANDING SCREEN
// ═══════════════════════════════════════════════════════════════
export default function LandingScreen({ onEnter }) {
  const [entering, setEntering] = useState(false);
  const [showChevron, setShowChevron] = useState(true);
  const scrollHandled = useRef(false);

  useEffect(() => {
    function onScroll() {
      if (!scrollHandled.current) {
        scrollHandled.current = true;
        setShowChevron(false);
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const { data: treasuryData } = useBalance({
    address: CONTRACTS.TREASURY,
    query: { refetchInterval: 10000 },
  });
  const liveEth = treasuryData?.value
    ? parseFloat(treasuryData.value.toString()) / 1e18
    : 0;
  const usd = (liveEth * ETH_USD).toFixed(0);

  function handleEnter() {
    if (entering) return;
    setEntering(true);
    setTimeout(() => { if (onEnter) onEnter(); }, 800);
  }

  return (
    <div className="landing-root" style={{
      minHeight: "100vh",
      background: FELT_DEEP,
      backgroundImage: `radial-gradient(ellipse 110% 80% at 50% 60%, #2a6644 0%, #1e4d32 45%, #0e2a1a 100%)`,
      fontFamily: "'Courier Prime', monospace",
      color: CREAM,
      position: "relative",
      overflow: "hidden",
    }}>
      <style>{LANDING_CSS}</style>

      {/* Grid texture */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1,
        backgroundImage: `
          repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 4px),
          repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 4px)
        `,
      }} />

      {/* CRT scanlines */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1,
        background: "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.04) 2px,rgba(0,0,0,0.04) 4px)",
      }} />

      {/* Wood frame */}
      <div style={{ position:"fixed", top:0, left:0, right:0, height:18, background:WOOD, borderBottom:`3px solid ${GOLD_DK}`, boxShadow:"0 3px 12px rgba(0,0,0,0.6)", zIndex:20 }} />
      <div style={{ position:"fixed", bottom:0, left:0, right:0, height:18, background:WOOD, borderTop:`3px solid ${GOLD_DK}`, boxShadow:"0 -3px 12px rgba(0,0,0,0.6)", zIndex:20 }} />
      <div style={{ position:"fixed", top:0, left:0, bottom:0, width:18, background:WOOD, borderRight:`3px solid ${GOLD_DK}`, zIndex:20 }} />
      <div style={{ position:"fixed", top:0, right:0, bottom:0, width:18, background:WOOD, borderLeft:`3px solid ${GOLD_DK}`, zIndex:20 }} />

      <Particles />

      {/* ══════════ ZONE 1: THE HOOK (above fold, 100vh) ══════════ */}
      <div style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        zIndex: 5,
        padding: "18px 24px",
      }}>

        {/* Season badge — top left */}
        <div style={{
          position: "absolute", top: 24, left: 28,
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 7, color: GOLD,
          border: `1px solid ${GOLD_DK}`,
          padding: "5px 9px", letterSpacing: 1,
          animation: "fade-in 1s ease 2s both",
        }}>
          SEASON 1
        </div>

        {/* Network badge — top right */}
        <div style={{
          position: "absolute", top: 24, right: 28,
          display: "flex", alignItems: "center", gap: 6,
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 7, color: "#6eff8a",
          border: "1px solid rgba(110,255,138,0.25)",
          padding: "5px 9px", letterSpacing: 1,
          animation: "fade-in 1s ease 2s both",
        }}>
          <div style={{ width:6, height:6, background:"#6eff8a", animation:"pulse-dot 1.5s ease-in-out infinite" }} />
          BASE SEPOLIA
        </div>

        {/* Spinning block — 120px */}
        <div style={{
          position: "relative",
          width: 120, height: 120,
          marginBottom: 16,
          animation: "fade-in 0.9s ease both",
          flexShrink: 0,
        }}>
          <Rays />
          <div style={{
            position: "absolute", inset: 10, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(200,168,75,0.22) 0%, transparent 70%)",
            animation: "halo-pulse 3s ease-in-out infinite",
            zIndex: 0,
          }} />
          <Sparks />
          <SpinningBlock />
        </div>

        {/* Title */}
        <div style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: "clamp(18px, 3.5vw, 32px)",
          color: GOLD,
          letterSpacing: 3,
          lineHeight: 1.3,
          textAlign: "center",
          animation: "title-glow 3s ease-in-out infinite, fade-in 0.8s ease 0.3s both",
          marginBottom: 12,
        }}>
          <span style={{ fontSize: "0.55em", color: "rgba(240,234,214,0.6)", display: "block", marginBottom: 4, letterSpacing: 6 }}>THE</span>
          BLOCK HUNT
        </div>

        {/* Divider */}
        <div style={{
          display: "flex", alignItems: "center", width: "min(360px, 80%)",
          marginBottom: 20,
          animation: "fade-in 0.8s ease 0.6s both",
        }}>
          <div style={{ flex:1, height:1, background:`linear-gradient(90deg, transparent, ${GOLD_DK})` }} />
          <div style={{ width:10, height:10, background:GOLD_DK, transform:"rotate(45deg)", margin:"0 10px" }} />
          <div style={{ flex:1, height:1, background:`linear-gradient(90deg, ${GOLD_DK}, transparent)` }} />
        </div>

        {/* ── PRIZE POOL — FOCAL POINT ── */}
        <div style={{
          textAlign: "center",
          marginBottom: 8,
          animation: "fade-in 0.8s ease 0.8s both",
        }}>
          <div style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 8, color: GOLD, opacity: 0.7,
            letterSpacing: 3, marginBottom: 6,
          }}>
            PRIZE POOL
          </div>
          <div style={{
            fontFamily: "'VT323', monospace",
            fontSize: "clamp(64px, 8vw, 96px)",
            color: GOLD_LT,
            lineHeight: 1,
            animation: "prize-glow 3s ease-in-out infinite",
          }}>
            {liveEth > 0 ? `\u039E ${liveEth.toFixed(4)}` : "\u039E \u2014"}
          </div>
          <div style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 8, color: GOLD, opacity: 0.7,
            letterSpacing: 2, marginTop: 4,
          }}>
            {liveEth > 0 ? `\u2248 $${usd} USD` : ""}
          </div>
          {liveEth > 0 && (
            <div style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 10, color: "#6eff8a",
              letterSpacing: 1, marginTop: 6,
              animation: "growth-pulse 3s ease-in-out infinite",
            }}>
              ▲ growing
            </div>
          )}
        </div>

        {/* Tagline */}
        <div style={{
          fontFamily: "'Courier Prime', monospace",
          fontSize: 14, color: "rgba(240,234,214,0.55)",
          textAlign: "center", lineHeight: 1.6,
          marginBottom: 24,
          animation: "fade-in 0.8s ease 1s both",
        }}>
          One player wins everything.<br/>
          The community watches it happen.
        </div>

        {/* ── ENTER BUTTON — 52px, 240px min ── */}
        <button
          className="enter-btn"
          onClick={handleEnter}
          disabled={entering}
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 13, letterSpacing: 3,
            background: entering ? "rgba(200,168,75,0.6)" : GOLD,
            color: INK,
            border: `3px solid ${INK}`,
            boxShadow: `5px 5px 0 ${INK}`,
            padding: "0 48px",
            height: 52,
            minWidth: 240,
            cursor: entering ? "not-allowed" : "pointer",
            marginBottom: 14,
            animation: "fade-in 0.8s ease 1.2s both, enter-pulse 2s ease-in-out 2s infinite",
          }}
        >
          {entering ? "\u25B6 ENTERING..." : "\u25B6  ENTER THE HUNT"}
        </button>

        {/* Stats line */}
        <div style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 7, color: "rgba(255,255,255,0.45)",
          letterSpacing: 2,
          animation: "fade-in 0.8s ease 1.4s both",
        }}>
          7 tiers  &middot;  10M blocks  &middot;  1 winner
        </div>

        {/* Scroll indicator chevron */}
        {showChevron && (
          <div style={{
            position: "absolute",
            bottom: 50,
            left: "50%",
            transform: "translateX(-50%)",
            fontFamily: "'VT323', monospace",
            fontSize: 20,
            color: "rgba(255,255,255,0.4)",
            animation: "chevron-bounce 2s ease-in-out infinite, fade-in 1s ease 2s both",
            pointerEvents: "none",
          }}>
            ▾
          </div>
        )}
      </div>

      {/* ══════════ ZONE 2: MECHANICS (below fold) ══════════ */}
      <div style={{
        position: "relative", zIndex: 5,
        maxWidth: 700, margin: "0 auto",
        padding: "60px 28px 80px",
      }}>
        {/* Action pills */}
        <div style={{
          display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center",
          marginBottom: 32,
        }}>
          {ACTIONS.map(a => (
            <div className="action-pill" key={a.label} style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              padding: "8px 14px",
              border: "1px solid rgba(200,168,75,0.2)",
              background: "rgba(0,0,0,0.25)",
              cursor: "default",
              transition: "all 0.15s",
              minWidth: 72,
            }}>
              <span style={{ fontSize: 18, color: a.accent }}>{a.icon}</span>
              <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:CREAM, letterSpacing:0.5 }}>{a.label}</span>
              <span style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color:"rgba(255,255,255,0.45)" }}>{a.sub}</span>
            </div>
          ))}
        </div>

        {/* Tier table */}
        <div style={{
          background: "rgba(0,0,0,0.25)",
          border: "1px solid rgba(255,255,255,0.06)",
          padding: "16px 20px",
        }}>
          <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:GOLD, opacity:0.6, letterSpacing:2, marginBottom:12 }}>
            THE 7 TIERS
          </div>
          {TIER_TABLE.map(t => (
            <div key={t.tier} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "5px 0",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              opacity: t.dim ? 0.35 : 0.8,
            }}>
              <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:t.color, width:22 }}>T{t.tier}</span>
              <span style={{ fontFamily:"'Courier Prime', monospace", fontSize:12, color:CREAM, flex:1 }}>{t.name}</span>
              <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:t.color, letterSpacing:1 }}>{t.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

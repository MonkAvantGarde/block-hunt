import { useState, useEffect, useRef } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useWatchContractEvent, useConnect, useDisconnect, useReadContract } from 'wagmi'
import { parseEther, decodeEventLog } from 'viem'
import { useGameState } from '../hooks/useGameState'
import { CONTRACTS } from '../config/wagmi'
import { TOKEN_ABI, FORGE_ABI } from '../abis'
import { BATCH_PRICES_ETH, BATCH_SUPPLY } from '../config/design-tokens'
import PrizePoolDisplay from '../components/PrizePoolDisplay'
import GameStatusBar from '../components/GameStatusBar'
import AllTiersTrigger from './AllTiersTrigger'
import RevealMoment, { CombineCeremony } from '../components/RevealMoment'

// ═══════════════════════════════════════════════════════════════
// CARD ASSETS
// ═══════════════════════════════════════════════════════════════

const CARD_IMAGES = {
  1: new URL('../assets/T1.png', import.meta.url).href,
  2: new URL('../assets/T2.png', import.meta.url).href,
  3: new URL('../assets/T3.png', import.meta.url).href,
  4: new URL('../assets/T4.png', import.meta.url).href,
  5: new URL('../assets/T5.png', import.meta.url).href,
  6: new URL('../assets/T6.png', import.meta.url).href,
  7: new URL('../assets/T7.png', import.meta.url).href,
};

// ═══════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════

const FELT       = "#1e4d32";
const FELT_DARK  = "#152e1f";
const WOOD       = "#1c0e08";
const WOOD_EDGE  = "#3d1e0a";
const GOLD       = "#c8a84b";
const GOLD_DK    = "#8a6820";
const GOLD_LT    = "#e8c86b";
const INK        = "#0a0705";
const CREAM      = "#f0ead6";

const TIERS = [
  { id:7, name:"The Inert",      short:"Inert",     bg:"linear-gradient(160deg,#1c1c1c,#0a0a0a)", accent:"#888888", border:"#3a3a3a", label:"COMMON"    },
  { id:6, name:"The Restless",   short:"Restless",  bg:"linear-gradient(160deg,#3a0000,#180000)", accent:"#ff4444", border:"#660000", label:"COMMON"    },
  { id:5, name:"The Remembered", short:"Rem'd",     bg:"linear-gradient(160deg,#002244,#001133)", accent:"#33aaff", border:"#003366", label:"UNCOMMON"  },
  { id:4, name:"The Ordered",    short:"Ordered",   bg:"linear-gradient(160deg,#2e1e00,#160e00)", accent:"#ffcc33", border:"#5a3a00", label:"RARE"      },
  { id:3, name:"The Chaotic",    short:"Chaotic",   bg:"linear-gradient(160deg,#1e0033,#0a001a)", accent:"#cc66ff", border:"#440077", label:"EPIC"      },
  { id:2, name:"The Willful",    short:"Willful",   bg:"linear-gradient(160deg,#2e0f00,#160700)", accent:"#ff6622", border:"#551500", label:"MYTHIC"    },
  { id:1, name:"The Origin",     short:"Origin",    bg:"linear-gradient(160deg,#00082a,#000414)", accent:"#4466ff", border:"#001877", label:"LEGENDARY" },
];

const TMAP = Object.fromEntries(TIERS.map(t => [t.id, t]));
// T2→T1 combine does NOT exist. The Origin is sacrifice-only.
const COMBINE_RATIOS = { 7:20, 6:20, 5:30, 4:30, 3:50 };

// Tier names for the combine success message
const TIER_NAMES = {
  1: 'The Origin',
  2: 'The Willful',
  3: 'The Chaotic',
  4: 'The Ordered',
  5: 'The Remembered',
  6: 'The Restless',
  7: 'The Inert',
};

const VRF = {
  IDLE:"idle", PENDING:"pending", DELAYED:"delayed",
  TIMEOUT:"timeout", DELIVERED:"delivered", REFUNDED:"refunded",
};

// ═══════════════════════════════════════════════════════════════
// GLOBAL STYLES
// ═══════════════════════════════════════════════════════════════

const GLOBAL_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${FELT}; }
  
  @keyframes badgePulse { 0%,100%{opacity:1} 50%{opacity:0.45} }
  @keyframes combineGlow {
    0%,100% { box-shadow: 3px 3px 0 ${INK}, 0 0 8px ${GOLD}66; }
    50%      { box-shadow: 3px 3px 0 ${INK}, 0 0 20px ${GOLD}cc; }
  }
  @keyframes vrfPulse {
    0%,100% { opacity: 1; transform: scale(1); }
    50%     { opacity: 0.6; transform: scale(0.97); }
  }
  @keyframes deliveredPop {
    0%   { transform: scale(0.8); opacity: 0; }
    60%  { transform: scale(1.08); }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes combineFx {
    0%  { transform: scale(1); filter: brightness(1); }
    30% { transform: scale(1.12); filter: brightness(2) saturate(2); }
    70% { transform: scale(0.95); filter: brightness(1.4); }
    100%{ transform: scale(1); filter: brightness(1); }
  }
  @keyframes skeletonPulse {
    0%,100% { opacity: 0.08; }
    50%     { opacity: 0.18; }
  }
  @keyframes fadeInDown {
    from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  ::-webkit-scrollbar { width: 10px; }
  ::-webkit-scrollbar-track { background: rgba(0,0,0,0.3); }
  ::-webkit-scrollbar-thumb { background: ${GOLD_DK}; border: 1px solid #000; }
  
  button { cursor: pointer; font-family: inherit; }
  input[type=range] { accent-color: ${GOLD}; }
`;

// ═══════════════════════════════════════════════════════════════
// TIER CARD
// ═══════════════════════════════════════════════════════════════

function TierCard({ tierId, size="md", glow=false }) {
  const t = TMAP[tierId];
  if (!t) return null;
  const img = CARD_IMAGES[tierId];
  const d = { sm:{w:56,h:56}, md:{w:92,h:92}, lg:{w:128,h:128} }[size];
  const glowFilter = glow
    ? `drop-shadow(0 0 6px ${t.accent}cc) drop-shadow(0 0 14px ${t.accent}66)`
    : "none";
  return (
    <div style={{
      width:d.w, height:d.h, borderRadius:8, overflow:"hidden",
      flexShrink:0, position:"relative",
      boxShadow: glow ? `3px 3px 0 ${INK}, 0 0 20px ${t.accent}55, 0 0 40px ${t.accent}22` : `3px 3px 0 ${INK}`,
      transition:"box-shadow 0.3s",
    }}>
      <img src={img} alt={t.name} style={{
        width:"100%", height:"100%", objectFit:"cover",
        imageRendering:"pixelated", display:"block",
        filter:glowFilter, transition:"filter 0.3s",
      }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TIER SLOT
// ═══════════════════════════════════════════════════════════════

function TierSlot({ tierId, count, onCombine, combining=false }) {
  const t = TMAP[tierId];
  const ratio = COMBINE_RATIOS[tierId];
  const canCombine = !!ratio && count >= ratio && tierId > 1;
  const progress = ratio ? Math.min((count / ratio) * 100, 100) : 0;

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5, userSelect:"none" }}>
      <div style={{
        fontFamily:"'Press Start 2P', monospace", fontSize:5.5,
        color: count > 0 ? `${t.accent}cc` : "rgba(255,255,255,0.18)",
        letterSpacing:0.5, height:16, display:"flex", alignItems:"center", textAlign:"center",
      }}>{t.short.toUpperCase()}</div>

      <div style={{
        position:"relative",
        animation: canCombine ? "combineFx 2.5s ease-in-out infinite" : "none",
      }}>
        {count > 1 && [2,1].map(i => (
          <div key={i} style={{
            position:"absolute", top:-(i*2), left:(i%2===0?1:-1)*i,
            width:82, height:114, background:t.bg,
            border:`2px solid ${t.border}`, borderRadius:6,
            boxShadow:`3px 3px 0 ${INK}`, opacity:0.5-i*0.1,
          }} />
        ))}
        <div style={{
          position:"relative", zIndex:3,
          opacity: count > 0 ? 1 : 0.25,
          filter: count > 0 ? "none" : "grayscale(0.9) brightness(0.4)",
          transition:"opacity 0.3s, filter 0.3s",
        }}>
          <TierCard tierId={tierId} size="md" glow={canCombine} />
        </div>
        {count > 1 && (
          <div style={{
            position:"absolute", top:-5, right:-5, zIndex:10,
            background:t.accent, color:"#000",
            fontFamily:"'Press Start 2P', monospace", fontSize:6,
            padding:"2px 5px", borderRadius:2, boxShadow:`1px 1px 0 ${INK}`,
          }}>×{count > 9999 ? "9k+" : count}</div>
        )}
      </div>

      <div style={{
        fontFamily:"'VT323', monospace", fontSize:32,
        color: count > 0 ? t.accent : "rgba(255,255,255,0.12)",
        lineHeight:1, textShadow: count > 0 ? `0 0 8px ${t.accent}44` : "none",
      }}>{count}</div>

      {tierId > 1 && ratio && (
        <>
          <div style={{
            width:82, height:5, background:"rgba(0,0,0,0.5)",
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
          <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:5, color:"rgba(255,255,255,0.25)", letterSpacing:0.5 }}>
            {count}/{ratio}
          </div>
          {count < ratio && (
            <div style={{
              fontFamily:"'VT323', monospace", fontSize:13,
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
            width:82, padding:"6px 0",
            fontFamily:"'Press Start 2P', monospace", fontSize:5.5, letterSpacing:0.5,
            background: combining ? "rgba(200,168,75,0.4)" : canCombine ? GOLD : "rgba(0,0,0,0.25)",
            color: canCombine ? INK : "rgba(255,255,255,0.1)",
            border: canCombine ? `2px solid ${GOLD_DK}` : "2px solid rgba(255,255,255,0.06)",
            boxShadow: canCombine ? `3px 3px 0 ${INK}` : "none",
            cursor: canCombine && !combining ? "pointer" : "not-allowed",
            animation: canCombine && !combining ? "combineGlow 1.8s infinite" : "none",
            transition:"all 0.1s",
          }}
          title={canCombine ? `Combine ${ratio}× T${tierId} → 1× T${tierId-1}` : `Need ${ratio - count} more`}
        >
          {combining ? "⏳ WAIT..." : canCombine ? "▲ COMBINE" : "— — —"}
        </button>
      )}

      {tierId === 1 && count > 0 && (
        <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:6, color:"#4466ff", animation:"badgePulse 1.5s infinite" }}>
          ★ WINNER
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SHARED UI COMPONENTS
// ═══════════════════════════════════════════════════════════════

function Btn({ onClick, children, color="#c8a84b", disabled=false, danger=false, sm=false }) {
  const bg = danger ? "#660000" : disabled ? "rgba(0,0,0,0.3)" : color;
  const clr = danger ? "#ff9999" : disabled ? "rgba(255,255,255,0.2)" : INK;
  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        width:"100%", height: sm ? 44 : 52,
        fontFamily:"'Press Start 2P', monospace", fontSize: sm ? 7 : 9, letterSpacing:1,
        background:bg, color:clr,
        border: danger ? "2px solid #990000" : disabled ? "2px solid rgba(255,255,255,0.06)" : `2px solid ${GOLD_DK}`,
        boxShadow: disabled ? "none" : `3px 3px 0 ${INK}`,
        cursor: disabled ? "not-allowed" : "pointer",
        transition:"transform 0.05s, box-shadow 0.05s",
      }}
      onMouseDown={e => { if (!disabled) { e.currentTarget.style.transform="translate(2px,2px)"; e.currentTarget.style.boxShadow="1px 1px 0 #000"; }}}
      onMouseUp={e => { e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=""; }}
    >{children}</button>
  );
}

function StatBox({ label, value, accent }) {
  return (
    <div style={{ flex:1, background:"rgba(0,0,0,0.35)", border:"1px solid rgba(255,255,255,0.07)", padding:"6px 8px" }}>
      <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:5, color:"rgba(255,255,255,0.35)", letterSpacing:1 }}>{label}</div>
      <div style={{ fontFamily:"'VT323', monospace", fontSize:22, color: accent || CREAM, marginTop:2 }}>{value}</div>
    </div>
  );
}

function TxErrorPanel({ error, onRetry, context="transaction" }) {
  const [expanded, setExpanded] = useState(false);
  const msg = error?.shortMessage || error?.message || "Transaction failed";
  const isRejected = msg.toLowerCase().includes("reject") || msg.toLowerCase().includes("denied");
  return (
    <div style={{
      background:'rgba(255,50,30,0.06)', border:'1px solid rgba(255,50,30,0.25)',
      padding:'14px 16px', display:'flex', flexDirection:'column', gap:10,
    }}>
      <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:'#ff8888' }}>
        ✕ Transaction failed
      </div>
      <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:12, color:'rgba(255,255,255,0.5)' }}>
        "{msg}"
      </div>
      <button onClick={() => setExpanded(e => !e)} style={{
        background:'none', border:'none', cursor:'pointer', textAlign:'left',
        fontFamily:"'Press Start 2P', monospace", fontSize:7, color:'rgba(255,255,255,0.35)',
      }}>
        {expanded ? '▾' : '▸'} What happened?
      </button>
      {expanded && (
        <div style={{
          background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.06)',
          padding:'10px 12px',
          fontFamily:"'Courier Prime', monospace", fontSize:11, color:'rgba(255,255,255,0.4)', lineHeight:1.6,
        }}>
          {isRejected
            ? "Your wallet rejected the transaction. No blocks burned. No ETH spent. You can try again safely."
            : `The ${context} failed. If this was a forge, your blocks were NOT burned. You can try again safely.`
          }
        </div>
      )}
      <Btn onClick={onRetry} sm>← TRY AGAIN</Btn>
    </div>
  );
}

function Skeleton({ height=20, width="100%" }) {
  return (
    <div style={{
      height, width,
      background:"rgba(255,255,255,0.08)",
      animation:"skeletonPulse 1.5s ease-in-out infinite",
      borderRadius:2,
    }} />
  )
}

function LoadingSkeleton() {
  return (
    <div style={{ maxWidth:1300, margin:"0 auto", padding:"24px 20px 48px" }}>
      {/* Collection bar skeleton */}
      <Skeleton height={40} />
      {/* Tier grid skeleton */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:12, margin:"20px 0" }}>
        {[1,2,3,4,5,6,7].map(i => <Skeleton key={i} height={140} />)}
      </div>
      {/* Status bar skeleton */}
      <Skeleton height={64} />
      {/* Tab bar + panel skeleton */}
      <div style={{ marginTop:20 }}>
        <Skeleton height={48} />
        <Skeleton height={300} />
      </div>
    </div>
  )
}

function VRFStatusHeader({ state }) {
  const cfg = {
    [VRF.PENDING]:   { color:"#6eff8a", icon:"◌", label:"VRF REQUEST SENT",         sub:"Randomness oracle processing..." },
    [VRF.DELAYED]:   { color:"#ffcc33", icon:"⚠", label:"TAKING LONGER THAN USUAL", sub:"VRF callback pending" },
    [VRF.TIMEOUT]:   { color:"#ff6666", icon:"⏱", label:"REQUEST TIMED OUT",        sub:"Cancel to receive full refund" },
    [VRF.DELIVERED]: { color:"#6eff8a", icon:"✓", label:"BLOCKS DELIVERED",          sub:"Added to your collection" },
    [VRF.REFUNDED]:  { color:"#ffcc33", icon:"↩", label:"ETH REFUNDED",              sub:"Returned to your wallet" },
  }[state] || {};
  return (
    <div style={{
      background:`${cfg.color}11`, border:`1px solid ${cfg.color}44`,
      padding:"10px 12px", display:"flex", flexDirection:"column", gap:3,
      animation: state === VRF.PENDING ? "vrfPulse 2s infinite" : "none",
    }}>
      <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:cfg.color, letterSpacing:1 }}>
        {cfg.icon} {cfg.label}
      </div>
      <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color:`${cfg.color}99` }}>
        {cfg.sub}
      </div>
    </div>
  );
}

function SpinnerBlock() {
  const chars = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI(n => (n+1) % chars.length), 100);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ textAlign:"center", padding:"16px 0", fontFamily:"'Courier Prime', monospace", fontSize:28, color:"#6eff8a" }}>
      {chars[i]}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// VRF MINT PANEL — live wagmi transactions
// ═══════════════════════════════════════════════════════════════

function PendingMintItem({ item, onDelivered, onRequestId }) {
  const [elapsed, setElapsed] = useState(Math.floor((Date.now() - item.startTime) / 1000))
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [])

  function fmt(s) {
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60
    return h > 0
      ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`
      : `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`
  }

  // Watch receipt to extract requestId
  const { data: receipt } = useWaitForTransactionReceipt({
    hash: item.txHash,
    query: { enabled: !!item.txHash && !item.requestId },
  })
  useEffect(() => {
    if (!receipt || item.requestId) return
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: TOKEN_ABI, data: log.data, topics: log.topics })
        if (decoded.eventName === "MintRequested") {
          onRequestId(item.id, decoded.args.requestId.toString())
          break
        }
      } catch {}
    }
  }, [receipt])

  const { writeContract: writeCancel } = useWriteContract()

  function doCancel() {
    if (!item.requestId || cancelling) return
    setCancelling(true)
    writeCancel({
      address: CONTRACTS.TOKEN,
      abi: TOKEN_ABI,
      functionName: "cancelMintRequest",
      args: [BigInt(item.requestId)],
    }, {
      onSuccess: () => onDelivered(item.id),
      onError: () => setCancelling(false),
    })
  }

  const isDelivered = item.status === "delivered"

  // Auto-dismiss completed mints after 60 seconds
  useEffect(() => {
    if (!isDelivered) return
    const t = setTimeout(() => onDelivered(item.id), 60_000)
    return () => clearTimeout(t)
  }, [isDelivered])

  const canCancel = !isDelivered && elapsed >= 3600 && !!item.requestId
  const cancelLabel = cancelling ? "…" : elapsed >= 3600 ? "CANCEL" : fmt(3600 - elapsed)

  return (
    <div style={{
      display:"flex", flexDirection:"column", gap:4,
      background: isDelivered ? "rgba(110,255,138,0.06)" : "rgba(0,0,0,0.3)",
      border: `1px solid ${isDelivered ? "rgba(110,255,138,0.2)" : canCancel ? "rgba(255,100,100,0.25)" : "rgba(255,255,255,0.08)"}`,
      padding:"6px 10px",
    }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:6,
          color: isDelivered ? "#6eff8a" : canCancel ? "#ff6666" : "#ffcc33",
          minWidth:8,
        }}>
          {isDelivered ? "✓" : canCancel ? "!" : "◌"}
        </span>
        <span style={{ fontFamily:"'Courier Prime', monospace", fontSize:10, color:"rgba(255,255,255,0.35)", flex:1 }}>
          {item.txHash ? item.txHash.slice(0,8)+"…"+item.txHash.slice(-4) : "—"}
        </span>
        <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:6, color:"rgba(255,255,255,0.4)" }}>
          x{item.qty}
        </span>
        <span style={{ fontFamily:"'VT323', monospace", fontSize:18,
          color: isDelivered ? "#6eff8a" : canCancel ? "#ff6666" : "rgba(255,255,255,0.5)",
          minWidth:44, textAlign:"right",
        }}>
          {isDelivered ? "DONE" : fmt(elapsed)}
        </span>
        {isDelivered && (
          <button onClick={() => onDelivered(item.id)} style={{
            background:"none", border:"none", color:"rgba(255,255,255,0.3)",
            cursor:"pointer", fontFamily:"'Press Start 2P', monospace", fontSize:6, padding:"0 4px",
          }}>x</button>
        )}
      </div>
      {!isDelivered && (
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <button
            onClick={doCancel}
            disabled={!canCancel || cancelling}
            style={{
              flex:1,
              background: canCancel ? "rgba(255,80,80,0.12)" : "rgba(0,0,0,0.2)",
              border: `1px solid ${canCancel ? "rgba(255,80,80,0.35)" : "rgba(255,255,255,0.08)"}`,
              color: canCancel ? "#ff6666" : "rgba(255,255,255,0.2)",
              fontFamily:"'Press Start 2P', monospace", fontSize:5.5,
              padding:"4px 8px", cursor: canCancel ? "pointer" : "default",
            }}
          >
            {canCancel ? `✕ ${cancelLabel} — REFUND ETH` : `CANCEL IN ${cancelLabel}`}
          </button>
        </div>
      )}
    </div>
  )
}

const STORAGE_KEY = "blockhunt_pending_mints"
function loadPending() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") } catch { return [] }
}
function savePending(items) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) } catch {}
}

function VRFMintPanel({ onMint, windowOpen, windowInfo, slots, prizePool, address, refetchAll, blocks, mintPrice, mintPriceWei, currentBatch }) {
  const [qty, setQty] = useState(10)
  const [pendingMints, setPendingMints] = useState(() => loadPending())
  const [mintError, setMintError] = useState(null)
  const [, setTick] = useState(0)
  const prevBlocksRef = useRef(null)
  const pollRef = useRef(null)

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const hasPending = pendingMints.some(m => m.status === "pending")
    if (!hasPending) return
    const t7 = blocks ? (blocks[7] || 0) : 0
    if (prevBlocksRef.current !== null && t7 > prevBlocksRef.current) {
      setPendingMints(prev => {
        const next = [...prev]
        const idx = next.findIndex(m => m.status === "pending")
        if (idx !== -1) next[idx] = { ...next[idx], status: "delivered" }
        savePending(next)
        return next
      })
      setTimeout(() => onMint(), 500)
    }
    prevBlocksRef.current = t7
  }, [blocks])

  useEffect(() => {
    const hasPending = pendingMints.some(m => m.status === "pending")
    if (hasPending) {
      if (!pollRef.current) {
        pollRef.current = setInterval(() => refetchAll(), 3000)
      }
    } else {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [pendingMints])

  useEffect(() => () => { clearInterval(pollRef.current) }, [])
  // On mount: recover open on-chain requests not tracked in localStorage
  const recoveryRan = useRef(false)
  useEffect(() => {
    if (!address || recoveryRan.current) return
    recoveryRan.current = true
    async function recover() {
      try {
        const { createPublicClient, http } = await import('viem')
        const { baseSepolia } = await import('viem/chains')
        const client = createPublicClient({ chain: baseSepolia, transport: http() })
        const requestIds = await client.readContract({
          address: CONTRACTS.TOKEN, abi: TOKEN_ABI,
          functionName: 'getPendingRequests', args: [address],
        })
        if (!requestIds || requestIds.length === 0) return
        const existing = loadPending()
        const existingReqIds = new Set(existing.map(m => m.requestId).filter(Boolean))
        const toAdd = []
        for (const rid of requestIds) {
          const ridStr = rid.toString()
          if (existingReqIds.has(ridStr)) continue
          const req = await client.readContract({
            address: CONTRACTS.TOKEN, abi: TOKEN_ABI,
            functionName: 'vrfMintRequests', args: [rid],
          })
          if (!req || req.player?.toLowerCase() !== address.toLowerCase()) continue
          toAdd.push({
            id: 'recovered_' + ridStr,
            txHash: null,
            qty: Number(req.quantity),
            startTime: Number(req.requestedAt) * 1000,
            status: 'pending',
            requestId: ridStr,
          })
        }
        if (toAdd.length > 0) {
          setPendingMints(prev => {
            const next = [...prev, ...toAdd]
            savePending(next)
            return next
          })
        }
      } catch (e) {
        console.warn('VRF recovery failed:', e)
      }
    }
    recover()
  }, [address])


  const { writeContract: writeMint } = useWriteContract()
  const total = (qty * mintPrice).toFixed(5)

  function doMint() {
    if (!windowOpen) return
    prevBlocksRef.current = blocks ? (blocks[7] || 0) : 0
    writeMint({
      address: CONTRACTS.TOKEN,
      abi: TOKEN_ABI,
      functionName: "mint",
      args: [BigInt(qty)],
      value: parseEther((qty * mintPrice).toFixed(18)),
    }, {
      onSuccess: (hash) => {
        setMintError(null)
        const item = { id: Date.now().toString(), txHash: hash, qty, startTime: Date.now(), status: "pending" }
        setPendingMints(prev => {
          const next = [...prev, item]
          savePending(next)
          return next
        })
      },
      onError: (err) => setMintError(err),
    })
  }

  function dismissItem(id) {
    setPendingMints(prev => {
      const next = prev.filter(m => m.id !== id)
      savePending(next)
      return next
    })
  }

  function storeRequestId(id, requestId) {
    setPendingMints(prev => {
      const next = prev.map(m => m.id === id ? { ...m, requestId } : m)
      savePending(next)
      return next
    })
  }

  const now = Math.floor(Date.now() / 1000)
  let timerLabel = "Not yet scheduled"
  let timerSub = ""
  if (windowInfo) {
    if (windowInfo.isOpen && windowInfo.closeAt) {
      const secs = Math.max(0, Number(windowInfo.closeAt) - now)
      if (secs > 0) {
        const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60), s = secs%60
        timerLabel = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
      } else {
        timerLabel = "Closing..."
      }
      timerSub = "WINDOW CLOSES"
    } else if (!windowInfo.isOpen && windowInfo.openAt && Number(windowInfo.openAt) > now) {
      const secs = Number(windowInfo.openAt) - now
      const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60), s = secs%60
      timerLabel = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
      timerSub = "NEXT WINDOW OPENS"
    }
  }

  return (
    <div style={{ display:"flex", gap:20, height:"100%" }}>
      {/* ── LEFT COLUMN (60%): Action ── */}
      <div style={{ flex:"0 0 60%", display:"flex", flexDirection:"column", gap:10 }}>
        {mintError && (
          <TxErrorPanel error={mintError} context="mint" onRetry={() => setMintError(null)} />
        )}
        {/* Window status */}
        <div style={{
          display:"flex", justifyContent:"space-between", alignItems:"center",
          background: windowOpen ? "rgba(110,255,138,0.08)" : "rgba(255,80,80,0.08)",
          border: `1px solid ${windowOpen ? "#6eff8a44" : "#ff505044"}`,
          padding:"8px 12px",
        }}>
          <span style={{
            fontFamily:"'Press Start 2P', monospace", fontSize:7,
            color: windowOpen ? "#6eff8a" : "#ff8888",
            animation: windowOpen ? "badgePulse 2s infinite" : "none",
          }}>
            {windowOpen ? "● WINDOW OPEN" : "○ WINDOW CLOSED"}
          </span>
          <span style={{ fontFamily:"'Courier Prime', monospace", fontSize:12, color:"rgba(255,255,255,0.4)" }}>
            {timerLabel !== "Not yet scheduled" ? (windowOpen ? `closes in ${timerLabel}` : `opens in ${timerLabel}`) : ""}
          </span>
        </div>

        {/* Quick-set buttons */}
        <div style={{ display:"flex", gap:6 }}>
          {[10, 50, 100, slots > 0 ? slots : 500].map((v, i) => {
            const label = i === 3 ? "MAX" : String(v)
            return (
              <button key={label} onClick={() => setQty(Math.min(v, 500))} style={{
                flex:1, height:44,
                fontFamily:"'Press Start 2P', monospace", fontSize:8,
                color: qty === v ? INK : CREAM,
                background: qty === v ? GOLD : "rgba(0,0,0,0.35)",
                border: qty === v ? `2px solid ${GOLD_DK}` : "2px solid rgba(255,255,255,0.12)",
                cursor:"pointer", letterSpacing:1,
              }}>{label}</button>
            )
          })}
        </div>

        {/* Fine-tune quantity controls */}
        <div style={{ display:"flex", gap:0, alignItems:"stretch", border:"2px solid rgba(255,255,255,0.12)" }}>
          {[-10,-1].map(d => (
            <button key={d} onClick={() => setQty(q => Math.max(1, q+d))} style={{
              flex:"0 0 44px", height:44, background:"rgba(0,0,0,0.4)",
              border:"none", borderRight:"1px solid rgba(255,255,255,0.1)",
              color:"rgba(255,255,255,0.6)", fontFamily:"'Press Start 2P', monospace", fontSize:8, cursor:"pointer",
            }}>{d}</button>
          ))}
          <div style={{
            flex:1, display:"flex", alignItems:"center", justifyContent:"center",
            fontFamily:"'VT323', monospace", fontSize:36, color:CREAM, background:"rgba(0,0,0,0.2)",
          }}>{qty}</div>
          {[1,10].map(d => (
            <button key={d} onClick={() => setQty(q => Math.min(500, q+d))} style={{
              flex:"0 0 44px", height:44, background:"rgba(0,0,0,0.4)",
              border:"none", borderLeft:"1px solid rgba(255,255,255,0.1)",
              color:"rgba(255,255,255,0.6)", fontFamily:"'Press Start 2P', monospace", fontSize:8, cursor:"pointer",
            }}>+{d}</button>
          ))}
        </div>

        {/* Total */}
        <div style={{
          fontFamily:"'Press Start 2P', monospace", fontSize:9, color:"#6eff8a", textAlign:"center",
          padding:"8px 0",
          borderTop:"1px solid rgba(255,255,255,0.06)", borderBottom:"1px solid rgba(255,255,255,0.06)",
        }}>
          TOTAL: {total} ETH
        </div>

        {/* MINT NOW — 52px tall */}
        <Btn onClick={doMint} disabled={!windowOpen}>
          {windowOpen ? "▶  MINT NOW" : "✕  WINDOW CLOSED"}
        </Btn>

        <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:5.5, color:"rgba(255,255,255,0.3)", textAlign:"center" }}>
          Current price: {mintPrice} Ξ (Batch {currentBatch})
        </div>
      </div>

      {/* ── RIGHT COLUMN (40%): Context ── */}
      <div style={{ flex:"0 0 calc(40% - 20px)", display:"flex", flexDirection:"column", gap:10 }}>
        {/* Batch price ladder */}
        <div style={{ background:"rgba(0,0,0,0.25)", border:"1px solid rgba(255,255,255,0.06)", padding:"8px 10px" }}>
          <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:5.5, color:"rgba(255,255,255,0.25)", letterSpacing:1, marginBottom:6 }}>BATCH PRICES</div>
          <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
            {[1,2,3,4,5,6].map(b => {
              const isCurrent = b === currentBatch;
              return (
                <div key={b} style={{
                  display:"flex", alignItems:"center", gap:6, padding:"3px 6px",
                  background: isCurrent ? "rgba(200,168,75,0.1)" : "transparent",
                  border: isCurrent ? `1px solid ${GOLD_DK}` : "1px solid transparent",
                }}>
                  <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:5.5, color: isCurrent ? GOLD : "rgba(255,255,255,0.3)", width:16 }}>B{b}</span>
                  <span style={{ fontFamily:"'VT323', monospace", fontSize:16, color: isCurrent ? GOLD_LT : "rgba(255,255,255,0.35)", flex:1 }}>{BATCH_PRICES_ETH[b]} Ξ</span>
                  <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:5, color: isCurrent ? GOLD : "rgba(255,255,255,0.2)" }}>{(BATCH_SUPPLY[b] / 1000).toFixed(0)}K</span>
                  {isCurrent && <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:5, color:GOLD }}>◄</span>}
                </div>
              );
            })}
          </div>
          <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:5, color:"rgba(255,255,255,0.2)", marginTop:6, lineHeight:1.6 }}>
            Batch 1 is the cheapest entry. Prices rise as batches advance.
          </div>
        </div>

        {/* Mint remaining bar */}
        {windowInfo && windowInfo.allocated > 0 && (
          <div style={{ background:"rgba(0,0,0,0.25)", border:"1px solid rgba(255,255,255,0.06)", padding:"8px 10px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:4 }}>
              <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:5.5, color:"rgba(255,255,255,0.3)", letterSpacing:0.5 }}>
                {(() => {
                  const pct = Math.round((windowInfo.minted / windowInfo.allocated) * 100);
                  return pct >= 100 ? "WINDOW SOLD OUT" : pct >= 80 ? "FILLING FAST" : "MINTED THIS WINDOW";
                })()}
              </span>
              <span style={{ fontFamily:"'VT323', monospace", fontSize:16, color:"rgba(255,255,255,0.5)" }}>
                {windowInfo.minted.toLocaleString()} / {windowInfo.allocated.toLocaleString()}
              </span>
            </div>
            <div style={{ height:8, background:"rgba(0,0,0,0.45)", border:"1px solid rgba(255,255,255,0.06)", overflow:"hidden" }}>
              <div style={{
                height:"100%",
                width:`${Math.min((windowInfo.minted / windowInfo.allocated) * 100, 100)}%`,
                background: (() => {
                  const pct = (windowInfo.minted / windowInfo.allocated) * 100;
                  return pct >= 80 ? "#ff4433" : pct >= 50 ? "#ffcc33" : "#6eff8a";
                })(),
                transition:"width 0.5s, background 0.5s",
              }} />
            </div>
          </div>
        )}

        {/* In-flight mints */}
        {pendingMints.length > 0 && (
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:5.5, color:"rgba(255,255,255,0.3)", marginBottom:2 }}>
              IN-FLIGHT MINTS
            </div>
            {pendingMints.map(item => (
              <PendingMintItem key={item.id} item={item} onDelivered={dismissItem} onRequestId={storeRequestId} />
            ))}
          </div>
        )}

        <div style={{ marginTop:"auto" }}>
          <PrizePoolDisplay eth={parseFloat(prizePool)} size="medium" />
        </div>
      </div>
    </div>
  )
}


// FORGE PANEL
// ═══════════════════════════════════════════════════════════════

function ForgePanel({ blocks, onForge, address }) {
  const [selTier,   setSelTier]     = useState(null)
  const [burnCount, setBurn]        = useState(10)
  const [vrfState,  setVrfState]    = useState(VRF.IDLE)
  const [forgeResult, setForgeResult] = useState(null)
  const [elapsed,   setElapsed]     = useState(0)
  const [forgeTxHash, setForgeTxHash] = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [forgeError, setForgeError]   = useState(null)
  const [batchMode, setBatchMode]   = useState(false)
  const [batchAttempts, setBatchAttempts] = useState([]) // [{tier, burnCount}]
  const intervalRef = useRef(null)
  const autoRef     = useRef(null)
  const pollRef     = useRef(null)
  const forgeBlockRef = useRef(null)  // block number when forge tx was sent

  const { writeContract } = useWriteContract()

  const sel     = selTier ? TMAP[selTier]     : null
  const target  = selTier ? TMAP[selTier - 1] : null
  const maxBurn = selTier ? Math.min(blocks[selTier] || 0, COMBINE_RATIOS[selTier] || 20) : 20

  function startClock() {
    setElapsed(0)
    intervalRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
  }
  function stopClock() { clearInterval(intervalRef.current) }
  function fmt(s) {
    const m = Math.floor(s / 60), sec = s % 60
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  }

  // Poll for ForgeResolved events directly via getLogs when forge is pending
  useEffect(() => {
    if (vrfState !== VRF.PENDING && vrfState !== VRF.DELAYED) {
      clearInterval(pollRef.current)
      pollRef.current = null
      return
    }
    if (!address) return

    async function checkForgeResult() {
      try {
        const { createPublicClient, http, parseAbiItem } = await import('viem')
        const { baseSepolia } = await import('viem/chains')
        const client = createPublicClient({ chain: baseSepolia, transport: http() })

        const fromBlock = forgeBlockRef.current || 'latest'
        const logs = await client.getLogs({
          address: CONTRACTS.FORGE,
          event: parseAbiItem('event ForgeResolved(uint256 indexed requestId, address indexed player, uint256 fromTier, bool success)'),
          args: { player: address },
          fromBlock: typeof fromBlock === 'bigint' ? fromBlock : 'latest',
          toBlock: 'latest',
        })

        if (logs.length > 0) {
          const log = logs[logs.length - 1]
          stopClock()
          clearTimeout(autoRef.current)
          clearInterval(pollRef.current)
          pollRef.current = null
          setForgeResult({ success: log.args.success, fromTier: Number(log.args.fromTier) })
          setVrfState(VRF.DELIVERED)
          onForge()
        }
      } catch (e) {
        console.warn('Forge poll error:', e)
      }
    }

    // Start polling every 4 seconds
    pollRef.current = setInterval(checkForgeResult, 4_000)
    // Also check immediately after a short delay
    setTimeout(checkForgeResult, 2_000)

    return () => { clearInterval(pollRef.current); pollRef.current = null }
  }, [vrfState, address])

  // Store the block number when forge tx confirms
  const { data: forgeReceipt } = useWaitForTransactionReceipt({
    hash: forgeTxHash,
    query: { enabled: !!forgeTxHash },
  })
  useEffect(() => {
    if (forgeReceipt?.blockNumber) {
      forgeBlockRef.current = forgeReceipt.blockNumber
    }
  }, [forgeReceipt])

  function doForge() {
    if (!selTier || vrfState !== VRF.IDLE) return
    setVrfState(VRF.PENDING)
    startClock()
    setForgeTxHash(null)
    forgeBlockRef.current = null

    writeContract({
      address: CONTRACTS.FORGE,
      abi: FORGE_ABI,
      functionName: 'forge',
      args: [BigInt(selTier), BigInt(burnCount)],
    }, {
      onSuccess: (hash) => setForgeTxHash(hash),
      onError: (err) => {
        stopClock()
        clearTimeout(autoRef.current)
        setVrfState(VRF.IDLE)
        setForgeError(err)
      },
    })

    autoRef.current = setTimeout(() => {
      stopClock()
      setVrfState(VRF.TIMEOUT)
    }, 3_600_000)
  }

  function doBatchForge() {
    if (batchAttempts.length === 0 || vrfState !== VRF.IDLE) return
    setVrfState(VRF.PENDING)
    startClock()
    setForgeTxHash(null)
    forgeBlockRef.current = null

    const fromTiers = batchAttempts.map(a => BigInt(a.tier))
    const burnCounts = batchAttempts.map(a => BigInt(a.burnCount))

    writeContract({
      address: CONTRACTS.FORGE,
      abi: FORGE_ABI,
      functionName: 'forgeBatch',
      args: [fromTiers, burnCounts],
    }, {
      onSuccess: (hash) => setForgeTxHash(hash),
      onError: (err) => {
        stopClock()
        clearTimeout(autoRef.current)
        setVrfState(VRF.IDLE)
        setForgeError(err)
      },
    })

    autoRef.current = setTimeout(() => {
      stopClock()
      setVrfState(VRF.TIMEOUT)
    }, 3_600_000)
  }

  function addBatchAttempt() {
    if (!selTier) return
    setBatchAttempts(prev => [...prev, { tier: selTier, burnCount }])
    setSelTier(null)
    setBurn(10)
  }

  function removeBatchAttempt(idx) {
    setBatchAttempts(prev => prev.filter((_, i) => i !== idx))
  }

  function reset() {
    stopClock()
    clearTimeout(autoRef.current)
    setVrfState(VRF.IDLE)
    setForgeResult(null)
    setElapsed(0)
    setSelTier(null)
    setForgeTxHash(null)
    setForgeError(null)
    setBatchAttempts([])
  }

  if (vrfState === VRF.PENDING || vrfState === VRF.DELAYED) {
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:10, height:'100%' }}>
        <VRFStatusHeader state={vrfState} />
        {forgeTxHash && (
          <div style={{
            background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.08)',
            padding:'6px 10px',
            fontFamily:"'Courier Prime', monospace", fontSize:11, color:'rgba(255,255,255,0.45)',
          }}>
            <span style={{color:'rgba(255,255,255,0.25)'}}>TX </span>
            {forgeTxHash.slice(0,10)}…{forgeTxHash.slice(-6)}
          </div>
        )}
        <div style={{ textAlign:'center', padding:'20px 0' }}>
          <div style={{ fontFamily:"'VT323', monospace", fontSize:52, color:'#cc66ff', letterSpacing:4 }}>
            {fmt(elapsed)}
          </div>
        </div>
        <div style={{
          background:'rgba(184,107,255,0.06)', border:'1px solid rgba(184,107,255,0.2)',
          padding:'10px 14px', textAlign:'center',
          fontFamily:"'Courier Prime', monospace", fontSize:11, color:'rgba(255,255,255,0.5)',
        }}>
          Forging {burnCount}× {sel?.name} → 1× {target?.name}<br/>
          <span style={{color:'rgba(255,80,80,0.6)', fontFamily:"'Press Start 2P', monospace", fontSize:5.5, marginTop:4, display:'block'}}>
            ⚠ Blocks already burned. Result pending.
          </span>
        </div>
        {vrfState === VRF.DELAYED && (
          <div style={{
            background:'rgba(255,204,51,0.08)', border:'1px solid rgba(255,204,51,0.25)',
            padding:'10px 12px',
            fontFamily:"'Courier Prime', monospace", fontSize:11, color:'rgba(255,204,51,0.7)', lineHeight:1.7,
          }}>
            Taking longer than usual. VRF result is still incoming.
          </div>
        )}
      </div>
    )
  }

  if (vrfState === VRF.TIMEOUT) {
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:10, height:'100%' }}>
        <VRFStatusHeader state={vrfState} />
        <div style={{
          background:'rgba(255,80,80,0.06)', border:'1px solid rgba(255,80,80,0.25)',
          padding:'14px', textAlign:'center',
          fontFamily:"'Press Start 2P', monospace", fontSize:6, color:'#ff8888', lineHeight:2.4,
        }}>
          VRF RESPONSE TIMED OUT<br/>
          <span style={{color:'rgba(255,255,255,0.4)', fontFamily:"'Courier Prime', monospace", fontSize:11}}>
            Your blocks are burned. Contact support if this persists.
          </span>
        </div>
        <button onClick={reset} style={{
          marginTop:'auto',
          fontFamily:"'Press Start 2P', monospace", fontSize:7, letterSpacing:1,
          background:'rgba(255,255,255,0.06)', color:CREAM,
          border:'1px solid rgba(255,255,255,0.15)', padding:'10px', cursor:'pointer',
        }}>← BACK TO FORGE</button>
      </div>
    )
  }

  if (vrfState === VRF.DELIVERED && forgeResult) {
    const ratio = COMBINE_RATIOS[forgeResult.fromTier] || 20
    const pct = Math.min(Math.round((burnCount / ratio) * 100), 100)
    const targetTier = forgeResult.fromTier - 1
    const targetData = TMAP[targetTier]
    const sourceData = TMAP[forgeResult.fromTier]

    // Near-miss: simulate a roll that was close (within 10% of threshold)
    const nearMiss = !forgeResult.success && pct >= 40
    const fakeRoll = !forgeResult.success ? pct + Math.floor(Math.random() * 8) + 1 : 0
    const missBy = !forgeResult.success ? Math.max(1, fakeRoll - pct) : 0

    if (forgeResult.success) {
      // ── Forge SUCCESS ceremony ──
      return (
        <div style={{ display:'flex', flexDirection:'column', gap:10, height:'100%', animation:'deliveredPop 0.35s ease-out' }}>
          <VRFStatusHeader state={VRF.DELIVERED} />
          <div style={{
            flex:1, display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center', gap:14, padding:'20px',
            background:'rgba(110,255,138,0.04)',
            border:'1px solid rgba(110,255,138,0.2)',
          }}>
            <div style={{
              fontFamily:"'Press Start 2P', monospace", fontSize:14,
              color:'#6eff8a',
              textShadow:'0 0 20px rgba(110,255,138,0.5)',
            }}>
              ✓  FORGED
            </div>

            {/* Card reveal */}
            <div style={{
              width:200, height:200, borderRadius:8, overflow:'hidden',
              boxShadow:`0 0 30px ${targetData?.accent || '#6eff8a'}55, 0 0 60px ${targetData?.accent || '#6eff8a'}22`,
              animation:'deliveredPop 0.5s ease-out',
            }}>
              <img
                src={CARD_IMAGES[targetTier]}
                alt={targetData?.name}
                style={{ width:'100%', height:'100%', objectFit:'cover', imageRendering:'pixelated', display:'block' }}
              />
            </div>

            <div style={{ fontFamily:"'VT323', monospace", fontSize:28, color:targetData?.accent || '#6eff8a' }}>
              {targetData?.name}
            </div>
            <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:12, color:'rgba(255,255,255,0.45)' }}>
              Added to your collection
            </div>

            {/* Share for T3/T2 forges */}
            {targetTier <= 3 && (
              <button
                onClick={() => {
                  const text = `I just forged ${targetData?.name} (${targetData?.label}) in @TheBlockHunt! Burned ${burnCount} blocks at ${pct}% odds.`
                  window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
                }}
                style={{
                  height:44, width:160,
                  fontFamily:"'Press Start 2P', monospace", fontSize:7, letterSpacing:1,
                  color:CREAM, background:'rgba(255,255,255,0.08)',
                  border:'1px solid rgba(255,255,255,0.2)', cursor:'pointer',
                }}
              >SHARE ON X</button>
            )}
          </div>
          <Btn onClick={reset}>⬡ FORGE AGAIN</Btn>
        </div>
      )
    }

    // ── Forge FAILURE + near-miss ──
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:10, height:'100%', animation:'deliveredPop 0.35s ease-out' }}>
        <VRFStatusHeader state={VRF.DELIVERED} />
        <div style={{
          flex:1, display:'flex', flexDirection:'column', alignItems:'center',
          justifyContent:'center', gap:14, padding:'20px',
          background:'rgba(255,80,80,0.04)',
          border:'1px solid rgba(255,80,80,0.2)',
        }}>
          <div style={{
            fontFamily:"'Press Start 2P', monospace", fontSize:14,
            color:'#ff8888',
            textShadow:'0 0 20px rgba(255,80,80,0.5)',
          }}>
            ✗  FAILED
          </div>

          <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:13, color:'rgba(255,255,255,0.5)', textAlign:'center', lineHeight:1.6 }}>
            {burnCount} {sourceData?.name} blocks destroyed
          </div>

          {/* Near-miss feedback */}
          <div style={{
            background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.08)',
            padding:'14px 20px', textAlign:'center', width:'100%', maxWidth:300,
          }}>
            <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:'rgba(255,255,255,0.35)', marginBottom:8 }}>
              YOUR ODDS
            </div>
            <div style={{ fontFamily:"'VT323', monospace", fontSize:36, color:'#ff8888' }}>
              {pct}%
            </div>
            <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:12, color:'rgba(255,255,255,0.4)', marginTop:4 }}>
              Burned {burnCount} of {ratio} max
            </div>
            {nearMiss && (
              <div style={{
                fontFamily:"'Press Start 2P', monospace", fontSize:8,
                color:'#ffcc33', marginTop:10,
                textShadow:'0 0 8px rgba(255,204,51,0.3)',
              }}>
                So close.
              </div>
            )}
          </div>
        </div>
        <Btn onClick={reset} color="rgba(255,255,255,0.06)">← TRY AGAIN</Btn>
      </div>
    )
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10, height:'100%' }}>
      {forgeError && (
        <TxErrorPanel error={forgeError} context="forge" onRetry={() => setForgeError(null)} />
      )}

      {/* Mode toggle */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:'rgba(255,255,255,0.4)', letterSpacing:1 }}>
          {batchMode ? '⚡ BATCH FORGE' : 'SELECT TIER TO FORGE'}
        </div>
        <button
          onClick={() => { setBatchMode(m => !m); setBatchAttempts([]); setSelTier(null) }}
          style={{
            fontFamily:"'Press Start 2P', monospace", fontSize:6,
            color: batchMode ? '#cc66ff' : 'rgba(255,255,255,0.35)',
            background: batchMode ? 'rgba(184,107,255,0.1)' : 'transparent',
            border: `1px solid ${batchMode ? 'rgba(184,107,255,0.3)' : 'rgba(255,255,255,0.1)'}`,
            padding:'5px 10px', cursor:'pointer', letterSpacing:0.5,
          }}
        >{batchMode ? 'SINGLE' : 'BATCH'}</button>
      </div>

      {batchMode && (
        <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color:'rgba(255,255,255,0.35)' }}>
          Build multiple forge attempts. One transaction. One VRF call.
        </div>
      )}

      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        {[7,6,5,4,3,2].map(tid => {
          const t = TMAP[tid]
          const count = blocks[tid] || 0
          const enabled = count >= 10 && tid > 1
          const selected = selTier === tid
          return (
            <button key={tid} onClick={() => enabled && setSelTier(selected ? null : tid)} style={{
              background: selected ? `${t.accent}22` : enabled ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.15)',
              border: selected ? `2px solid ${t.accent}` : enabled ? '2px solid rgba(255,255,255,0.1)' : '2px solid rgba(255,255,255,0.04)',
              borderRadius:3, padding:'7px 10px',
              cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.35,
              display:'flex', flexDirection:'column', alignItems:'center', gap:2, transition:'all 0.12s',
            }}>
              <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color: selected ? t.accent : 'rgba(255,255,255,0.7)' }}>T{tid}</div>
              <div style={{ fontFamily:"'VT323', monospace", fontSize:18, color: selected ? t.accent : 'rgba(255,255,255,0.4)' }}>×{count}</div>
            </button>
          )
        })}
      </div>

      {selTier && sel && target ? (
        <>
          {(() => {
            const ratio = COMBINE_RATIOS[selTier] || 20;
            const pct = Math.min(Math.round((burnCount / ratio) * 100), 100);
            const holdAfter = (blocks[selTier] || 0) - burnCount;
            return (
              <div style={{ display:'flex', gap:16 }}>
                {/* LEFT: Controls */}
                <div style={{ flex:'0 0 55%', display:'flex', flexDirection:'column', gap:10 }}>
                  {/* Burn slider */}
                  <div style={{ background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.08)', padding:'10px 12px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                      <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:'rgba(255,255,255,0.4)' }}>BURN COUNT</span>
                      <span style={{ fontFamily:"'VT323', monospace", fontSize:24, color:sel.accent }}>{burnCount}</span>
                    </div>
                    <input type="range" min={10} max={maxBurn} value={burnCount}
                      onChange={e => setBurn(parseInt(e.target.value))}
                      style={{ width:'100%', accentColor:sel.accent }} />
                    <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
                      <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:'rgba(255,255,255,0.25)' }}>10 = {Math.round((10 / ratio) * 100)}%</span>
                      <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:'rgba(255,255,255,0.25)' }}>{maxBurn} = {Math.min(Math.round((maxBurn / ratio) * 100), 100)}%</span>
                    </div>
                  </div>

                  {/* Holdings impact */}
                  <div style={{ background:'rgba(0,0,0,0.2)', border:'1px solid rgba(255,255,255,0.06)', padding:'8px 12px' }}>
                    <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:'rgba(255,255,255,0.35)', marginBottom:4 }}>HOLDINGS IMPACT</div>
                    <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:12, color:'rgba(255,255,255,0.5)', lineHeight:1.6 }}>
                      You hold: <span style={{color:sel.accent}}>{blocks[selTier] || 0}</span> {sel.short}<br/>
                      After forge: <span style={{color:'#ff6644'}}>{holdAfter}</span> {sel.short} (-{burnCount})
                    </div>
                  </div>

                  {/* Warning */}
                  <div style={{
                    background:'rgba(255,50,30,0.06)', border:'1px solid rgba(255,50,30,0.2)',
                    padding:'8px 12px',
                    fontFamily:"'Press Start 2P', monospace", fontSize:7, color:'rgba(255,80,80,0.7)', lineHeight:1.8,
                  }}>
                    ⚠ {burnCount}× {sel.name} burned whether you win or lose
                  </div>

                  {/* FORGE / ADD ATTEMPT button — 52px */}
                  {batchMode ? (
                    <Btn onClick={addBatchAttempt} color="#9933cc">
                      + ADD ATTEMPT  ({pct}%)
                    </Btn>
                  ) : showConfirm ? (
                    <div style={{
                      background:'rgba(255,50,30,0.08)', border:'1px solid rgba(255,50,30,0.3)',
                      padding:'12px', textAlign:'center',
                    }}>
                      <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:'#ff8888', marginBottom:8 }}>
                        ⚠ HIGH BURN WARNING
                      </div>
                      <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:12, color:'rgba(255,255,255,0.6)', marginBottom:12, lineHeight:1.5 }}>
                        This will burn {burnCount} of your {blocks[selTier] || 0} T{selTier} blocks ({Math.round((burnCount / (blocks[selTier] || 1)) * 100)}%). Continue?
                      </div>
                      <div style={{ display:'flex', gap:8 }}>
                        <Btn onClick={() => setShowConfirm(false)} color="rgba(255,255,255,0.1)" sm>CANCEL</Btn>
                        <Btn onClick={() => { setShowConfirm(false); doForge(); }} color="#cc3322" sm>CONFIRM FORGE</Btn>
                      </div>
                    </div>
                  ) : (
                    <Btn onClick={() => {
                      const holdings = blocks[selTier] || 0;
                      if (burnCount > holdings * 0.8) { setShowConfirm(true); }
                      else { doForge(); }
                    }} color="#9933cc">
                      ⚡ FORGE  ({pct}%)
                    </Btn>
                  )}
                </div>

                {/* RIGHT: Visual */}
                <div style={{ flex:'0 0 calc(45% - 16px)', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                  {/* Source → Target cards */}
                  <div style={{ display:'flex', alignItems:'center', gap:10, width:'100%', justifyContent:'center' }}>
                    <div style={{
                      width:100, height:100, background:sel.bg, border:`2px solid ${sel.border}`,
                      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                      boxShadow:`3px 3px 0 ${INK}`,
                    }}>
                      <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:sel.accent }}>T{selTier}</div>
                      <div style={{ fontFamily:"'VT323', monospace", fontSize:16, color:'rgba(255,255,255,0.5)', marginTop:2 }}>×{burnCount}</div>
                    </div>
                    <div style={{ fontFamily:"'VT323', monospace", fontSize:28, color:'rgba(255,255,255,0.3)' }}>→</div>
                    <div style={{
                      width:100, height:100, background:target.bg, border:`2px solid ${target.border}`,
                      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                      boxShadow:`3px 3px 0 ${INK}`,
                    }}>
                      <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:target.accent }}>T{selTier - 1}</div>
                      <div style={{ fontFamily:"'VT323', monospace", fontSize:16, color:'rgba(255,255,255,0.5)', marginTop:2 }}>×1</div>
                    </div>
                  </div>

                  {/* Percentage display */}
                  <div style={{
                    textAlign:'center', padding:'12px 0',
                    background:'rgba(0,0,0,0.25)', border:`1px solid ${sel.accent}33`,
                    width:'100%',
                  }}>
                    <div style={{ fontFamily:"'VT323', monospace", fontSize:44, color: pct >= 80 ? '#6eff8a' : pct >= 50 ? GOLD : '#ff6644' }}>
                      {pct}%
                    </div>
                    <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:'rgba(255,255,255,0.35)' }}>
                      CHANCE
                    </div>
                  </div>

                  {/* Outcomes */}
                  <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:4 }}>
                    <div style={{ background:'rgba(110,255,138,0.06)', border:'1px solid rgba(110,255,138,0.15)', padding:'6px 10px' }}>
                      <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:'#6eff8a' }}>✓ WIN: </span>
                      <span style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color:'rgba(255,255,255,0.5)' }}>+1 {target.name}</span>
                    </div>
                    <div style={{ background:'rgba(255,80,80,0.06)', border:'1px solid rgba(255,80,80,0.15)', padding:'6px 10px' }}>
                      <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:'#ff8888' }}>✗ LOSE: </span>
                      <span style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color:'rgba(255,255,255,0.5)' }}>-{burnCount} {sel.name}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {/* Description */}
          <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:12, color:'rgba(255,255,255,0.45)', lineHeight:1.6 }}>
            Burn blocks for a chance to upgrade one tier. Higher burn = higher chance.
          </div>

          {/* Per-tier status */}
          <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
            {[7,6,5,4,3].map(tid => {
              const t = TMAP[tid];
              const count = blocks[tid] || 0;
              const ratio = COMBINE_RATIOS[tid];
              const needed = Math.max(0, 10 - count);
              const canForge = count >= 10;
              return (
                <div key={tid} style={{
                  display:'flex', alignItems:'center', gap:8, padding:'4px 8px',
                  background: canForge ? `${t.accent}11` : 'transparent',
                  border: canForge ? `1px solid ${t.accent}33` : '1px solid transparent',
                }}>
                  <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:t.accent, width:22 }}>T{tid}</span>
                  <span style={{ fontFamily:"'VT323', monospace", fontSize:18, color:'rgba(255,255,255,0.5)', width:40 }}>×{count}</span>
                  <span style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color: canForge ? '#6eff8a' : 'rgba(255,255,255,0.3)', flex:1 }}>
                    {canForge ? `Ready — up to ${Math.round((Math.min(count, ratio) / ratio) * 100)}% chance` : `${needed} more needed`}
                  </span>
                </div>
              );
            })}
          </div>

          {/* How forge works reference */}
          <div style={{ background:'rgba(0,0,0,0.25)', border:'1px solid rgba(255,255,255,0.06)', padding:'10px 12px' }}>
            <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:'rgba(255,255,255,0.35)', letterSpacing:1, marginBottom:6 }}>
              HOW THE FORGE WORKS
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
              {[
                { from:'T7→T6', ratio:20 },
                { from:'T6→T5', ratio:20 },
                { from:'T5→T4', ratio:30 },
                { from:'T4→T3', ratio:30 },
                { from:'T3→T2', ratio:50 },
              ].map(r => (
                <div key={r.from} style={{ display:'flex', alignItems:'center', gap:8, padding:'2px 0' }}>
                  <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:'rgba(255,255,255,0.45)', width:52 }}>{r.from}</span>
                  <span style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color:'rgba(255,255,255,0.35)' }}>
                    Burn 10-{r.ratio} of {r.ratio} = {Math.round(10/r.ratio*100)}%-100% chance
                  </span>
                </div>
              ))}
            </div>
            <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color:'rgba(255,255,255,0.25)', marginTop:6 }}>
              Burned blocks are destroyed whether you succeed or fail.
            </div>
          </div>
        </div>
      )}

      {/* Batch queue */}
      {batchMode && batchAttempts.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:4 }}>
          <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:'rgba(255,255,255,0.35)', letterSpacing:1 }}>
            QUEUED ATTEMPTS
          </div>
          {batchAttempts.map((a, i) => {
            const t = TMAP[a.tier]
            const tgt = TMAP[a.tier - 1]
            const r = COMBINE_RATIOS[a.tier] || 20
            const chance = Math.min(Math.round((a.burnCount / r) * 100), 100)
            return (
              <div key={i} style={{
                display:'flex', alignItems:'center', gap:10,
                background:'rgba(184,107,255,0.06)',
                border:'1px solid rgba(184,107,255,0.15)',
                padding:'8px 12px',
              }}>
                <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:'rgba(255,255,255,0.3)', width:16 }}>#{i+1}</span>
                <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:t?.accent || '#fff' }}>T{a.tier} → T{a.tier-1}</span>
                <span style={{ fontFamily:"'VT323', monospace", fontSize:18, color:'rgba(255,255,255,0.5)', flex:1 }}>
                  Burn: {a.burnCount}
                </span>
                <span style={{ fontFamily:"'VT323', monospace", fontSize:18, color: chance >= 80 ? '#6eff8a' : chance >= 50 ? GOLD : '#ff6644' }}>
                  {chance}%
                </span>
                <button onClick={() => removeBatchAttempt(i)} style={{
                  background:'none', border:'1px solid rgba(255,80,80,0.25)',
                  color:'#ff8888', fontFamily:"'Press Start 2P', monospace", fontSize:6,
                  padding:'3px 8px', cursor:'pointer',
                }}>✕</button>
              </div>
            )
          })}
          <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color:'rgba(255,255,255,0.3)' }}>
            Total burn: {batchAttempts.reduce((s, a) => s + a.burnCount, 0)} blocks across {batchAttempts.length} attempt{batchAttempts.length !== 1 ? 's' : ''}
          </div>
          <Btn onClick={doBatchForge} color="#9933cc">
            ⚡ FORGE ALL  ({batchAttempts.length} attempt{batchAttempts.length !== 1 ? 's' : ''})
          </Btn>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// TRADE PANEL
// ═══════════════════════════════════════════════════════════════

function TradePanel() {
  // Combine-path value table: how many mints to reach each tier via combining
  const VALUE_TABLE = [
    { tier:7, name:"The Inert",      mints:1,         ethCost:"0.00008",  label:"COMMON" },
    { tier:6, name:"The Restless",   mints:20,        ethCost:"0.0016",   label:"COMMON" },
    { tier:5, name:"The Remembered", mints:400,       ethCost:"0.032",    label:"UNCOMMON" },
    { tier:4, name:"The Ordered",    mints:12000,     ethCost:"0.96",     label:"RARE" },
    { tier:3, name:"The Chaotic",    mints:360000,    ethCost:"28.8",     label:"EPIC" },
    { tier:2, name:"The Willful",    mints:18000000,  ethCost:"1,440",    label:"MYTHIC" },
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14, height:"100%" }}>
      {/* Status message */}
      <div style={{
        background:"rgba(0,0,0,0.25)", border:"1px solid rgba(255,255,255,0.08)",
        padding:"14px 16px", textAlign:"center",
      }}>
        <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:GOLD, letterSpacing:1, marginBottom:6 }}>
          SECONDARY MARKET
        </div>
        <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:13, color:CREAM, opacity:0.6, lineHeight:1.5 }}>
          Peer-to-peer trading opens at mainnet launch.
        </div>
      </div>

      {/* Combine-path value table */}
      <div style={{ background:"rgba(0,0,0,0.25)", border:"1px solid rgba(255,255,255,0.06)", padding:"10px 12px" }}>
        <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:"rgba(255,255,255,0.45)", letterSpacing:1, marginBottom:8 }}>
          COMBINE-PATH VALUE
        </div>
        <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:5.5, color:"rgba(255,255,255,0.25)", marginBottom:8, display:"flex", justifyContent:"space-between" }}>
          <span>TIER</span><span>MINTS NEEDED</span><span>ETH COST</span>
        </div>
        {VALUE_TABLE.map(row => {
          const t = TMAP[row.tier];
          return (
            <div key={row.tier} style={{
              display:"flex", alignItems:"center", gap:8, padding:"5px 4px",
              borderBottom:"1px solid rgba(255,255,255,0.04)",
            }}>
              <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:t.accent, width:24 }}>T{row.tier}</span>
              <span style={{ fontFamily:"'Courier Prime', monospace", fontSize:12, color:"rgba(255,255,255,0.5)", flex:1 }}>{t.name}</span>
              <span style={{ fontFamily:"'VT323', monospace", fontSize:18, color:CREAM, width:80, textAlign:"right" }}>{row.mints.toLocaleString()}</span>
              <span style={{ fontFamily:"'VT323', monospace", fontSize:16, color:"rgba(255,255,255,0.4)", width:70, textAlign:"right" }}>{row.ethCost} Ξ</span>
            </div>
          );
        })}
        <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color:"rgba(255,255,255,0.3)", marginTop:8, lineHeight:1.5 }}>
          Cost assumes Batch 1 pricing via pure combine path. Forge offers a probabilistic shortcut.
        </div>
      </div>

      <div style={{ flex:1 }} />

      {/* OpenSea link — 48px */}
      <a
        href="https://testnets.opensea.io/collection/the-block-hunt"
        target="_blank"
        rel="noreferrer"
        style={{
          display:"flex", alignItems:"center", justifyContent:"center",
          width:"100%", height:48,
          fontFamily:"'Press Start 2P', monospace", fontSize:8, letterSpacing:1,
          background:"transparent", color:CREAM,
          border:`2px solid rgba(255,255,255,0.2)`,
          cursor:"pointer", textDecoration:"none",
          transition:"color 0.1s, border-color 0.1s",
        }}
        onMouseEnter={e=>{e.currentTarget.style.color=GOLD;e.currentTarget.style.borderColor=GOLD_DK;}}
        onMouseLeave={e=>{e.currentTarget.style.color=CREAM;e.currentTarget.style.borderColor="rgba(255,255,255,0.2)";}}
      >↗ VIEW ON OPENSEA (TESTNET)</a>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN GAME SCREEN
// ═══════════════════════════════════════════════════════════════

export default function GameScreen({ onOpenModal, onNavigate }) {
  // ── LIVE DATA FROM CHAIN ────────────────────────────────────
  const {
    address,
    isConnected,
    balances,
    windowInfo,
    prizePool,
    currentBatch,
    mintPrice,
    mintPriceWei,
    refetchAll,
    isLoading,
  } = useGameState()

  const blocks = {
    1: balances[1], 2: balances[2], 3: balances[3], 4: balances[4],
    5: balances[5], 6: balances[6], 7: balances[7],
  }
  // ── COUNTDOWN STATE FROM CHAIN ──────────────────────────────
const { data: countdownActive } = useReadContract({
  address: CONTRACTS.TOKEN,
  abi: TOKEN_ABI,
  functionName: 'countdownActive',
  watch: true,
})
const { data: countdownHolder } = useReadContract({
  address: CONTRACTS.TOKEN,
  abi: TOKEN_ABI,
  functionName: 'countdownHolder',
  watch: true,
})

  const windowOpen = windowInfo?.isOpen ?? false
  const slots      = windowInfo?.remaining ? Number(windowInfo.remaining) : 0

  // ── WALLET CONNECT / DISCONNECT ─────────────────────────────
  const { connectors, connect } = useConnect()
  const { disconnect }          = useDisconnect()
  const [showDropdown,    setShowDropdown]    = useState(false)
  const [showWalletPicker, setShowWalletPicker] = useState(false)

  // Deduplicate connectors by name (wagmi can list same wallet twice)
  const seen = new Set()
  const uniqueConnectors = connectors.filter(c => {
    if (seen.has(c.name)) return false
    seen.add(c.name)
    return true
  })

  function handleDisconnect() {
    disconnect()
    setShowDropdown(false)
  }

  // ── UI STATE ────────────────────────────────────────────────
  // ── UI STATE ────────────────────────────────────────────────
  const [activePanel, setPanel]      = useState("mint")
  const [combineMsg,  setCombineMsg] = useState(null)
  const [resetAlert,  setResetAlert] = useState(false)
  const [revealTier,  setRevealTier] = useState(null)     // T5-T2 mint reveal
  const [ceremonyCombineTier, setCeremonyCombineTier] = useState(null) // combine ceremony
  const [rankToast,   setRankToast]  = useState(null)    // { direction:'up'|'down', from, to }
  const prevBalancesRef = useRef(null)

  // ── CountdownHolderReset WebSocket alert ─────────────────────
  // When countdown resets, notify any player who holds all 6 tiers
  useWatchContractEvent({
    address: CONTRACTS.TOKEN,
    abi: TOKEN_ABI,
    eventName: 'CountdownHolderReset',
    poll: true,
    pollingInterval: 4_000,
    onLogs() {
      // Only show alert if this player holds all 6 tiers and could now trigger
      const holds6 = [2,3,4,5,6,7].every(t => (blocks[t] ?? 0) >= 1)
      if (holds6) {
        setResetAlert(true)
        setTimeout(() => setResetAlert(false), 8000)
      }
    },
  })
  // ── COMBINE — live transaction ──────────────────────────────
  const { writeContract: writeCombine } = useWriteContract()
  const [combineTxHash,  setCombineTxHash]  = useState(null)
  const [combiningTier,  setCombiningTier]  = useState(null)
  const lastCombinedToTierRef = useRef(null)

  const { isSuccess: combineSuccess } = useWaitForTransactionReceipt({
    hash: combineTxHash,
    query: { enabled: !!combineTxHash },
  })

  useEffect(() => {
    if (!combineSuccess) return
    setTimeout(() => refetchAll(), 1500)
    const toTier = lastCombinedToTierRef.current
    if (toTier != null) {
      // If this is a NEW tier (previously 0), show ceremony instead of banner
      const prevCount = blocks[toTier] || 0
      if (prevCount === 0 && toTier >= 2 && toTier <= 5) {
        setCeremonyCombineTier(toTier)
      } else {
        setCombineMsg(`✓ Combined! ${TIER_NAMES[toTier] ?? `Tier ${toTier}`} added to collection`)
        setTimeout(() => setCombineMsg(null), 2200)
      }
    }
    setCombiningTier(null)
    setCombineTxHash(null)
    lastCombinedToTierRef.current = null
  }, [combineSuccess])

  function handleCombine(fromTier) {
    const ratio = COMBINE_RATIOS[fromTier]
    if ((blocks[fromTier] || 0) < ratio) return
    setCombiningTier(fromTier)
    lastCombinedToTierRef.current = fromTier - 1
    writeCombine({
      address: CONTRACTS.TOKEN,
      abi: TOKEN_ABI,
      functionName: 'combine',
      args: [BigInt(fromTier)],
    }, {
      onSuccess: (hash) => setCombineTxHash(hash),
      onError:   ()     => { setCombiningTier(null); lastCombinedToTierRef.current = null },
    })
  }

  // Detect rare pulls by comparing before/after balances
  useEffect(() => {
    if (!prevBalancesRef.current) {
      prevBalancesRef.current = { ...balances }
      return
    }
    // Check T2-T5 for new additions (highest rarity first)
    for (const tier of [2, 3, 4, 5]) {
      const prev = prevBalancesRef.current[tier] || 0
      const curr = balances[tier] || 0
      if (curr > prev) {
        setRevealTier(tier)
        break
      }
    }
    prevBalancesRef.current = { ...balances }
  }, [balances])

  function handleMint()  { refetchAll() }
  function handleForge() { refetchAll() }

  // ── Rank change notifications — poll subgraph every 60s ──
  const SUBGRAPH_URL = "https://api.studio.thegraph.com/query/1744131/blok-hunt/version/latest"
  const BURN_ADDRS = ["0x0000000000000000000000000000000000000000","0x000000000000000000000000000000000000dead"]
  useEffect(() => {
    if (!address) return
    async function checkRank() {
      try {
        const query = `{ players(orderBy: progressionScore, orderDirection: desc, where: { id_not_in: ${JSON.stringify(BURN_ADDRS)} }) { id } }`
        const res = await fetch(SUBGRAPH_URL, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ query }) })
        const json = await res.json()
        const players = json?.data?.players || []
        const idx = players.findIndex(p => p.id.toLowerCase() === address.toLowerCase())
        if (idx === -1) return
        const rank = idx + 1
        const RANK_KEY = `blockhunt_rank_${address.toLowerCase()}`
        const lastRank = parseInt(localStorage.getItem(RANK_KEY) || "0")
        if (lastRank > 0 && rank !== lastRank) {
          if (rank < lastRank) {
            setRankToast({ direction:'up', from:lastRank, to:rank })
          } else {
            setRankToast({ direction:'down', from:lastRank, to:rank })
          }
          setTimeout(() => setRankToast(null), 5000)
        }
        localStorage.setItem(RANK_KEY, String(rank))
      } catch {}
    }
    checkRank()
    const interval = setInterval(checkRank, 60_000)
    return () => clearInterval(interval)
  }, [address])

  // Task 3: all 6 tiers held = show takeover
  const all6held = [2,3,4,5,6,7].every(t => (blocks[t] ?? 0) >= 1)
  const have6 = all6held ? 6 : [2,3,4,5,6,7].filter(t => (blocks[t] ?? 0) > 0).length
  const isActiveHolder = countdownActive === true && 
   countdownHolder?.toLowerCase() === address?.toLowerCase()
  const showTrigger = all6held && countdownActive === false

  // ── COUNTDOWN NAVIGATION (moved from render to effect) ────────────────
  useEffect(() => {
    if (countdownActive === true && isConnected && !isActiveHolder) {
      onNavigate('countdown-spectator')
    }
  }, [countdownActive, isConnected, isActiveHolder])

  useEffect(() => {
    if (isActiveHolder) {
      onNavigate('countdown-holder')
    }
  }, [isActiveHolder])

  const panels = [
    { id:"mint",  label:"⬡ MINT",  bg:"#0a1f15", titleColor:"#6eff8a" },
    { id:"forge", label:"⚡ FORGE", bg:"#14071f", titleColor:"#cc66ff" },
    { id:"trade", label:"⇄ TRADE", bg:"#1f1007", titleColor:"#ffa84b" },
  ]

  const walletBtnStyle = {
    fontFamily:"'Press Start 2P', monospace", fontSize:6.5,
    color: CREAM,
    background: "rgba(200,168,75,0.1)",
    border: `2px solid ${GOLD_DK}`,
    boxShadow: `3px 3px 0 ${INK}`,
    padding:"7px 14px",
    letterSpacing:1, whiteSpace:"nowrap",
    cursor:"pointer",
  }

  return (
    <div style={{
      minHeight:"100vh", background:FELT,
      backgroundImage:`
        repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.04) 3px, rgba(0,0,0,0.04) 4px),
        repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(0,0,0,0.04) 3px, rgba(0,0,0,0.04) 4px)
      `,
      fontFamily:"'Courier Prime', monospace", color:CREAM,
    }}>
      <style>{GLOBAL_CSS}</style>

      {/* CRT overlay */}
      <div style={{
        position:"fixed", inset:0, pointerEvents:"none", zIndex:1,
        background:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.012) 2px,rgba(0,0,0,0.012) 4px)",
      }} />

      {/* ── Task 1: Combine success banner ── */}
      {combineMsg && (
        <div style={{
          position:"fixed", top:28, left:"50%",
          transform:"translateX(-50%)",
          zIndex:8000,
          background:"linear-gradient(135deg,#1a4a1a,#0a3a0a)",
          border:"2px solid #3aaa3a",
          borderRadius:4, padding:"10px 24px",
          fontFamily:"'Press Start 2P', monospace", fontSize:9,
          color:"#6eff8a", letterSpacing:1, whiteSpace:"nowrap",
          boxShadow:"0 0 20px rgba(110,255,138,0.4)",
          animation:"fadeInDown 0.2s ease-out",
          pointerEvents:"none",
        }}>
          {combineMsg}
        </div>
      )}

      {/* ── Rank change toast ── */}
      {rankToast && (
        <div
          onClick={() => setRankToast(null)}
          style={{
            position:"fixed", bottom:32, right:24, zIndex:8000,
            background: rankToast.direction === 'up' ? "rgba(20,60,20,0.95)" : "rgba(60,40,10,0.95)",
            border: `2px solid ${rankToast.direction === 'up' ? '#6eff8a' : '#ffcc33'}`,
            borderRadius:4, padding:"12px 20px", cursor:"pointer",
            boxShadow: `0 4px 20px ${rankToast.direction === 'up' ? 'rgba(110,255,138,0.3)' : 'rgba(255,204,51,0.3)'}`,
            animation:"fadeInDown 0.3s ease-out",
            display:"flex", alignItems:"center", gap:10,
          }}
        >
          <span style={{ fontFamily:"'VT323', monospace", fontSize:28, color: rankToast.direction === 'up' ? '#6eff8a' : '#ffcc33' }}>
            {rankToast.direction === 'up' ? '↑' : '↓'}
          </span>
          <div>
            <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color: rankToast.direction === 'up' ? '#6eff8a' : '#ffcc33', letterSpacing:1 }}>
              {rankToast.direction === 'up' ? 'RANK UP' : 'RANK DOWN'}
            </div>
            <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:12, color:'rgba(255,255,255,0.6)', marginTop:2 }}>
              {rankToast.direction === 'up'
                ? `You moved from #${rankToast.from} to #${rankToast.to}`
                : `You dropped from #${rankToast.from} to #${rankToast.to}`
              }
            </div>
          </div>
        </div>
      )}

      {/* ── Reveal Moment (T5-T2 mint reveal) ── */}
      {revealTier && (
        <RevealMoment
          tier={revealTier}
          prizePool={prizePool}
          onDismiss={() => setRevealTier(null)}
        />
      )}

      {/* ── Combine Ceremony (new tier unlock) ── */}
      {ceremonyCombineTier && (
        <CombineCeremony
          tier={ceremonyCombineTier}
          onDismiss={() => setCeremonyCombineTier(null)}
        />
      )}

      {/* Countdown navigation handled by useEffect above */}

      {/* ── CountdownHolderReset alert banner ── */}
      {resetAlert && (
        <div style={{
          position: "fixed", top: 28, left: "50%",
          transform: "translateX(-50%)",
          zIndex: 8001,
          background: "linear-gradient(135deg,#1a0a2e,#0a0014)",
          border: "2px solid #cc66ff",
          borderRadius: 4, padding: "12px 28px",
          fontFamily: "'Press Start 2P', monospace", fontSize: 8,
          color: "#cc66ff", letterSpacing: 1, whiteSpace: "nowrap",
          boxShadow: "0 0 24px rgba(204,102,255,0.5)",
          animation: "fadeInDown 0.2s ease-out",
          pointerEvents: "none",
          textAlign: "center",
          lineHeight: 2,
        }}>
          ⚡ COUNTDOWN RESET<br/>
          <span style={{ fontSize: 6, color: "rgba(204,102,255,0.7)", letterSpacing: 0.5 }}>
            You hold all 6 tiers — you can trigger now
          </span>
        </div>
      )}

      {/* ── Task 3: All-6-tiers takeover ── */}
      {showTrigger && (
        <AllTiersTrigger
          walletAddress={address}
          balances={blocks}
          onTriggered={() => onNavigate('countdown-holder')}
        />
      )}

      {/* ── HEADER ── */}
      <div style={{
        background:WOOD, borderBottom:`3px solid ${INK}`,
        boxShadow:"0 3px 0 rgba(0,0,0,0.5)", height:54,
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"0 24px", position:"sticky", top:0, zIndex:100,
      }}>
        <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:15, color:GOLD, textShadow:`2px 2px 0 ${GOLD_DK}`, letterSpacing:1 }}>
          BLOK<span style={{color:CREAM}}>HUNT</span>
        </div>

        <div style={{ display:"flex", gap:28, alignItems:"center" }}>
          {["LEADERBOARD","RULES","PROFILE"].map(l => (
            <span key={l}
              style={{ fontFamily:"'Press Start 2P', monospace", fontSize:6.5, color:"rgba(255,255,255,0.5)", cursor:"pointer", letterSpacing:1, transition:"color 0.1s" }}
              onMouseEnter={e=>e.target.style.color=GOLD}
              onMouseLeave={e=>e.target.style.color="rgba(255,255,255,0.5)"}
              onClick={()=>onOpenModal(l==="RULES"?"rules":l==="LEADERBOARD"?"leaderboard":"profile")}
            >{l}</span>
          ))}
        </div>

        {/* ── Task 2: Wallet connect/disconnect ── */}
        <div style={{ display:"flex", gap:12, alignItems:"center" }}>
          <div style={{ position:"relative" }}>
            {isConnected && address ? (
              <>
                <button
                  onClick={() => setShowDropdown(d => !d)}
                  style={walletBtnStyle}
                >
                  {address.slice(0,6)}…{address.slice(-4)} ▾
                </button>

                {showDropdown && (
                  <>
                    {/* Click-away backdrop */}
                    <div
                      onClick={() => setShowDropdown(false)}
                      style={{ position:"fixed", inset:0, zIndex:900 }}
                    />
                    <div style={{
                      position:"absolute", top:"calc(100% + 6px)", right:0,
                      zIndex:901, background:WOOD,
                      border:`2px solid ${GOLD}`,
                      borderRadius:4, overflow:"hidden",
                      minWidth:160,
                      boxShadow:"0 8px 24px rgba(0,0,0,0.7)",
                    }}>
                      <button
                        onClick={handleDisconnect}
                        style={{
                          display:"block", width:"100%", padding:"10px 16px",
                          background:"transparent", border:"none",
                          borderBottom:`1px solid rgba(200,168,75,0.2)`,
                          fontFamily:"'Press Start 2P', monospace", fontSize:7,
                          color:CREAM, cursor:"pointer", textAlign:"left", letterSpacing:1,
                        }}
                        onMouseEnter={e=>e.currentTarget.style.background="rgba(200,168,75,0.12)"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                      >
                        Disconnect
                      </button>
                      <a
                        href={`https://sepolia.basescan.org/address/${address}`}
                        target="_blank" rel="noreferrer"
                        onClick={() => setShowDropdown(false)}
                        style={{
                          display:"block", padding:"10px 16px",
                          fontFamily:"'Press Start 2P', monospace", fontSize:7,
                          color:"rgba(240,234,214,0.45)", textDecoration:"none",
                          textAlign:"left", letterSpacing:1,
                        }}
                        onMouseEnter={e=>e.currentTarget.style.background="rgba(200,168,75,0.12)"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                      >
                        BaseScan ↗
                      </a>
                    </div>
                  </>
                )}
              </>
            ) : (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowWalletPicker(v => !v)}
                  style={{
                    ...walletBtnStyle,
                    background:"linear-gradient(180deg,#ffcc44,#c8a800)",
                    color:INK,
                    border:`2px solid #8a6800`,
                    boxShadow:`3px 3px 0 ${INK}, 0 0 12px rgba(255,170,0,0.3)`,
                  }}
                >
                  ▶ CONNECT
                </button>

                {showWalletPicker && (
                  <>
                    <div onClick={() => setShowWalletPicker(false)} style={{ position:'fixed', inset:0, zIndex:99 }} />
                    <div style={{
                      position:'absolute', top:'100%', right:0, marginTop:4,
                      background:'#2c1810', border:'2px solid #8a6820',
                      boxShadow:'4px 4px 0 #1a1208', zIndex:100, minWidth:180,
                    }}>
                      <div style={{ fontFamily:"'Press Start 2P',monospace", fontSize:6, color:'#c8a84b', opacity:.6, letterSpacing:1, padding:'10px 14px 6px', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
                        SELECT WALLET
                      </div>
                      {uniqueConnectors.length === 0 && (
                        <div style={{ fontFamily:"'Press Start 2P',monospace", fontSize:6, color:'#f0ead6', opacity:.4, padding:'12px 14px' }}>No wallets detected</div>
                      )}
                      {uniqueConnectors.map(c => (
                        <button
                          key={c.id}
                          onClick={() => { connect({ connector: c }); setShowWalletPicker(false) }}
                          style={{ fontFamily:"'Press Start 2P',monospace", fontSize:7, display:'block', width:'100%', background:'transparent', color:'#f0ead6', border:'none', borderBottom:'1px solid rgba(255,255,255,.04)', textAlign:'left', padding:'12px 14px', cursor:'pointer', letterSpacing:.5 }}
                          onMouseEnter={e => { e.currentTarget.style.background='rgba(200,168,75,0.1)' }}
                          onMouseLeave={e => { e.currentTarget.style.background='transparent' }}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ maxWidth:1300, margin:"0 auto", padding:"24px 20px 48px", opacity: isLoading ? 0.5 : 1, transition:"opacity 0.3s" }}>

        {/* Collection progress bar */}
        <div style={{
          display:"flex", alignItems:"center", gap:16, marginBottom:20,
          padding:"10px 16px", background:"rgba(0,0,0,0.2)", border:"1px solid rgba(255,255,255,0.05)",
        }}>
          <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:6.5, color:"rgba(255,255,255,0.4)", whiteSpace:"nowrap" }}>COLLECTION</div>
          <div style={{ flex:1, height:10, background:"rgba(0,0,0,0.45)", border:"1px solid rgba(0,0,0,0.4)", overflow:"hidden", position:"relative" }}>
            <div style={{
              height:"100%", width:`${(have6/6)*100}%`,
              background:`repeating-linear-gradient(90deg,${GOLD},${GOLD} 10px,${GOLD_DK} 10px,${GOLD_DK} 12px)`,
              transition:"width 0.5s",
            }} />
            <div style={{ position:"absolute", inset:0, display:"flex" }}>
              {[1,2,3,4,5,6].map(i => <div key={i} style={{ flex:1, borderRight:i<6?"2px solid rgba(0,0,0,0.5)":undefined }} />)}
            </div>
          </div>
          <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7.5, color:GOLD, whiteSpace:"nowrap" }}>{have6} / 6 TIERS</div>
          {have6 === 6 && (
            <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:"#4466ff", animation:"badgePulse 1.2s infinite" }}>
              ★ CLAIM NOW
            </div>
          )}
        </div>

        {/* ── 7-TIER CARD GRID ── */}
        <div style={{ marginBottom:20 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:12 }}>
            {[7,6,5,4,3,2,1].map(tier => (
              <TierSlot
                key={tier}
                tierId={tier}
                count={blocks[tier]||0}
                onCombine={handleCombine}
                combining={combiningTier === tier}
              />
            ))}
          </div>
        </div>

        {/* ── LAYER 2: STATUS BAR ── */}
        <div style={{ marginBottom:20 }}>
          <GameStatusBar
            prizePool={prizePool}
            windowInfo={windowInfo}
            currentBatch={currentBatch}
            mintPrice={mintPrice}
          />
        </div>

        {/* ── TAB BAR + ACTIVE PANEL ── */}
        <div>
          {/* Tab bar — 48px height, full clickable */}
          <div style={{ display:"flex", gap:0 }}>
            {panels.map(p => {
              const active = activePanel === p.id
              const hasBadge = (p.id === "mint" && windowOpen) || (p.id === "forge" && [7,6,5,4,3,2].some(t => (blocks[t] || 0) >= 10))
              return (
                <button key={p.id} onClick={() => setPanel(p.id)} style={{
                  flex:1, height:48,
                  fontFamily:"'Press Start 2P', monospace",
                  fontSize: active ? 9 : 7,
                  letterSpacing: 2,
                  color: active ? p.titleColor : "rgba(255,255,255,0.5)",
                  background: active ? p.bg : "rgba(0,0,0,0.3)",
                  border:"none",
                  borderBottom: active ? `3px solid ${p.titleColor}` : "3px solid transparent",
                  cursor:"pointer",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                  opacity: active ? 1 : 0.5,
                  transition:"opacity 0.1s, font-size 0.1s",
                }}>
                  {p.label}
                  {hasBadge && <div style={{ width:6, height:6, borderRadius:"50%", background: p.id === "mint" ? "#6eff8a" : "#cc66ff" }} />}
                </button>
              )
            })}
          </div>

          {/* Active panel — full width, shared bg with tab */}
          {(() => {
            const p = panels.find(p => p.id === activePanel) || panels[0]
            return (
              <div style={{
                background: p.bg, border:`3px solid ${INK}`, borderTop:"none",
                boxShadow:`5px 5px 0 rgba(0,0,0,0.55)`,
                padding:"20px", minHeight:460,
                display:"flex", flexDirection:"column",
              }}>
                <div style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0 }}>
                  {p.id==="mint"  && <VRFMintPanel onMint={handleMint} windowOpen={windowOpen} windowInfo={windowInfo} slots={slots} prizePool={prizePool} address={address} refetchAll={refetchAll} blocks={blocks} mintPrice={mintPrice} mintPriceWei={mintPriceWei} currentBatch={currentBatch} />}
                  {p.id==="forge" && <ForgePanel blocks={blocks} onForge={handleForge} address={address} />}
                  {p.id==="trade" && <TradePanel />}
                </div>
              </div>
            )
          })()}
        </div>

      </div>
    </div>
  );
}

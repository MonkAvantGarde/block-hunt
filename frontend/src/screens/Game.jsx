import { useState, useEffect, useRef } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useWatchContractEvent, useConnect, useDisconnect, useReadContract } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { parseEther, decodeEventLog } from 'viem'
import { useGameState } from '../hooks/useGameState'
import { CONTRACTS } from '../config/wagmi'
import { TOKEN_ABI, FORGE_ABI } from '../abis'
import AllTiersTrigger from './AllTiersTrigger'

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
const COMBINE_RATIOS = { 7:20, 6:20, 5:30, 4:30, 3:50, 2:100 };

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
        width:"100%", padding: sm ? "6px 0" : "10px 0",
        fontFamily:"'Press Start 2P', monospace", fontSize: sm ? 6 : 7, letterSpacing:1,
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

function VRFMintPanel({ onMint, windowOpen, windowInfo, slots, treasury, address, refetchAll, blocks }) {
  const [qty, setQty]                    = useState(10);
  const [vrfState, setVrfState]          = useState(VRF.IDLE);
  const vrfStateRef = useRef(VRF.IDLE);
  function setVrf(s) { vrfStateRef.current = s; setVrfState(s); }
  const prevT7Ref = useRef(null)
  const pollRef = useRef(null)

  function startPolling() {
    if (pollRef.current) return
    pollRef.current = setInterval(() => {
      if (vrfStateRef.current !== VRF.PENDING && vrfStateRef.current !== VRF.DELAYED) {
        clearInterval(pollRef.current)
        pollRef.current = null
        return
      }
      refetchAll()
    }, 3000)
  }

  function stopPolling() {
    clearInterval(pollRef.current)
    pollRef.current = null
  }

  useEffect(() => {
    if (vrfStateRef.current !== VRF.PENDING && vrfStateRef.current !== VRF.DELAYED) return
    const t7 = blocks ? (blocks[7] || 0) : 0
    if (prevT7Ref.current !== null && t7 > prevT7Ref.current) {
      stopClock()
      stopPolling()
      clearTimeout(autoRef.current)
      setDelivered({ qty, alloc: t7 - prevT7Ref.current, results: [] })
      setVrf(VRF.DELIVERED)
      setTimeout(() => onMint(), 500)
    }
    prevT7Ref.current = t7
  }, [blocks])
  const [reqId, setReqId]                = useState(null);
  const [elapsed, setElapsed]            = useState(0);
  const [, setTick] = useState(0);
  const [deliveredResults, setDelivered] = useState(null);
  const intervalRef = useRef(null);
  const autoRef     = useRef(null);

  const { writeContract: writeMint } = useWriteContract()
  const [mintTxHash, setMintTxHash]  = useState(null)
  const [vrfReqId,   setVrfReqId]    = useState(null)

  const total = (qty * 0.00025).toFixed(5);

  function startClock() {
    setElapsed(0);
    intervalRef.current = setInterval(() => setElapsed(e => e+1), 1000);
  }
  function stopClock() { clearInterval(intervalRef.current); }
  useEffect(() => {
  const t = setInterval(() => setTick(n => n+1), 1000);
  return () => clearInterval(t);
}, []);
  function fmt(s) {
    const h = Math.floor(s/3600);
    const m = Math.floor((s%3600)/60);
    const sec = s%60;
    return h > 0
      ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`
      : `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  }

  const { data: mintReceipt } = useWaitForTransactionReceipt({
    hash: mintTxHash,
    query: { enabled: !!mintTxHash },
  })
  useEffect(() => {
    if (!mintReceipt) return
    for (const log of mintReceipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: TOKEN_ABI, data: log.data, topics: log.topics })
        if (decoded.eventName === 'MintRequested') {
          setVrfReqId(decoded.args.requestId)
          setReqId('req #' + decoded.args.requestId.toString().slice(-6))
          break
        }
        if (decoded.eventName === 'MintFulfilled') {
      const deliveredQty = decoded.args.quantity ? Number(decoded.args.quantity) : qty
      stopClock()
      clearTimeout(autoRef.current)
      setDelivered({ qty, alloc: deliveredQty, results: [] })
      setVrf(VRF.DELIVERED)
      onMint()
      break
    }
      } catch {}
    }
  }, [mintReceipt])

  useWatchContractEvent({
    address: CONTRACTS.TOKEN,
    abi: TOKEN_ABI,
    eventName: 'MintFulfilled',
    poll: true,
    pollingInterval: 4_000,
    onLogs(logs) {
      if (vrfStateRef.current !== VRF.PENDING && vrfStateRef.current !== VRF.DELAYED) return
      const mine = address
        ? logs.filter(l => l.args.player?.toLowerCase() === address.toLowerCase())
        : logs
      if (mine.length === 0) return
      const deliveredQty = mine[0].args.quantity ? Number(mine[0].args.quantity) : qty
      stopClock()
      clearTimeout(autoRef.current)
      setDelivered({ qty, alloc: deliveredQty, results: [] })
      setVrf(VRF.DELIVERED)
      setTimeout(() => onMint(), 1500)
    },
  })

  function doMint() {
    if (!windowOpen || vrfState !== VRF.IDLE) return
    prevT7Ref.current = blocks ? (blocks[7] || 0) : 0
    setReqId('awaiting wallet…')
    setVrf(VRF.PENDING)
    startPolling()
    startClock()
    setMintTxHash(null)
    setVrfReqId(null)

    writeMint({
      address: CONTRACTS.TOKEN,
      abi: TOKEN_ABI,
      functionName: 'mint',
      args: [BigInt(qty)],
      value: parseEther((qty * 0.00025).toFixed(18)),
    }, {
      onSuccess: (hash) => {
        setMintTxHash(hash)
        setReqId(hash.slice(0, 8) + '…' + hash.slice(-4))
      },
      onError: () => {
        stopClock()
        clearTimeout(autoRef.current)
        setReqId(null)
        setVrf(VRF.IDLE)
      },
    })

    autoRef.current = setTimeout(() => {
      stopClock()
      setVrf(VRF.TIMEOUT)
    }, 3_600_000)
  }

  function cancelMint() {
    if (!vrfReqId) return
    stopClock()
    clearTimeout(autoRef.current)
    setVrf(VRF.REFUNDED)
  }

  function reset() {
    setVrf(VRF.IDLE);
    setReqId(null);
    setDelivered(null);
    setElapsed(0);
    setMintTxHash(null);
    setVrfReqId(null);
  }

  useEffect(() => () => { stopClock(); clearTimeout(autoRef.current); }, []);

  if (vrfState === VRF.IDLE) {
    const now = Math.floor(Date.now() / 1000)
    let timerLabel = "— : — : —"
    let timerSub = ""
    if (windowInfo) {
      if (windowInfo.isOpen && windowInfo.closeAt) {
        const secs = Math.max(0, Number(windowInfo.closeAt) - now)
        const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60), s = secs%60
        timerLabel = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
        timerSub = "WINDOW CLOSES"
      } else if (!windowInfo.isOpen && windowInfo.openAt) {
        const secs = Math.max(0, Number(windowInfo.openAt) - now)
        const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60), s = secs%60
        timerLabel = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
        timerSub = "NEXT WINDOW OPENS"
      }
    }

    return (
      <div style={{ display:"flex", flexDirection:"column", gap:10, height:"100%" }}>
        <div style={{
          display:"flex", justifyContent:"space-between", alignItems:"center",
          background: windowOpen ? "rgba(110,255,138,0.08)" : "rgba(255,80,80,0.08)",
          border: `1px solid ${windowOpen ? "#6eff8a44" : "#ff505044"}`,
          padding:"6px 10px",
        }}>
          <span style={{
            fontFamily:"'Press Start 2P', monospace", fontSize:6,
            color: windowOpen ? "#6eff8a" : "#ff8888",
            animation: windowOpen ? "badgePulse 2s infinite" : "none",
          }}>
            {windowOpen ? "● WINDOW OPEN" : "○ WINDOW CLOSED"}
          </span>
          <span style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color:"rgba(255,255,255,0.4)" }}>
            {timerLabel !== "— : — : —" ? (windowOpen ? `closes in ${timerLabel}` : `opens in ${timerLabel}`) : ""}
          </span>
        </div>

        <div style={{ display:"flex", gap:6 }}>
          <StatBox label="BATCH" value={windowInfo ? `${windowInfo.day ?? 1} / 6` : "— / 6"} />
          <StatBox label="PRICE" value="0.00025Ξ" />
          <StatBox label="SLOTS" value={slots.toLocaleString()} accent={slots < 5000 ? "#ff6644" : undefined} />
        </div>

        <div style={{ fontFamily:"'VT323', monospace", fontSize:44, letterSpacing:4, color:CREAM, textAlign:"center", lineHeight:1 }}>
          {timerLabel}
        </div>
        <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:5.5, color:"rgba(255,255,255,0.3)", textAlign:"center", letterSpacing:1 }}>
          {timerSub}
        </div>

        <div style={{ display:"flex", gap:0, alignItems:"stretch", border:`2px solid rgba(255,255,255,0.12)` }}>
          {[-100,-10,-1].map(d => (
            <button key={d} onClick={() => setQty(q => Math.max(1, q+d))} style={{
              width:36, background:"rgba(0,0,0,0.4)",
              border:"none", borderRight:"1px solid rgba(255,255,255,0.1)",
              color:"rgba(255,255,255,0.6)", fontFamily:"'Press Start 2P', monospace", fontSize:7, cursor:"pointer",
            }}>{d < -9 ? d : d < 0 ? " "+d : "+"+d}</button>
          ))}
          <div style={{
            flex:1, display:"flex", alignItems:"center", justifyContent:"center",
            fontFamily:"'VT323', monospace", fontSize:36, color:CREAM, background:"rgba(0,0,0,0.2)",
          }}>{qty}</div>
          {[1,10,100].map(d => (
            <button key={d} onClick={() => setQty(q => Math.min(500, q+d))} style={{
              width:36, background:"rgba(0,0,0,0.4)",
              border:"none", borderLeft:"1px solid rgba(255,255,255,0.1)",
              color:"rgba(255,255,255,0.6)", fontFamily:"'Press Start 2P', monospace", fontSize:7, cursor:"pointer",
            }}>+{d}</button>
          ))}
        </div>

        <div style={{
          fontFamily:"'Press Start 2P', monospace", fontSize:8, color:"#6eff8a", textAlign:"center",
          padding:"6px 0",
          borderTop:"1px solid rgba(255,255,255,0.06)", borderBottom:"1px solid rgba(255,255,255,0.06)",
        }}>
          TOTAL: {total} ETH
        </div>

        <Btn onClick={doMint} disabled={!windowOpen}>
          {windowOpen ? "▶  MINT NOW" : "✕  WINDOW CLOSED"}
        </Btn>

        <div style={{
          marginTop:"auto", background:"rgba(0,0,0,0.35)", border:"1px solid rgba(255,255,255,0.06)",
          padding:"8px 12px", display:"flex", justifyContent:"space-between", alignItems:"baseline",
        }}>
          <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:6, color:"rgba(255,255,255,0.35)" }}>TREASURY</span>
          <span style={{ fontFamily:"'VT323', monospace", fontSize:28, color:"#6eff8a" }}>Ξ {treasury}</span>
        </div>
      </div>
    );
  }

  if (vrfState === VRF.PENDING || vrfState === VRF.DELAYED) {
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:10, height:"100%" }}>
        <VRFStatusHeader state={vrfState} />
        <div style={{
          background:"rgba(0,0,0,0.3)", border:"1px solid rgba(255,255,255,0.08)",
          padding:"6px 10px",
          fontFamily:"'Courier Prime', monospace", fontSize:11, color:"rgba(255,255,255,0.45)",
        }}>
          <span style={{ color:"rgba(255,255,255,0.25)" }}>TX </span>{reqId}
        </div>
        {vrfState === VRF.PENDING ? (
          <SpinnerBlock />
        ) : (
          <div style={{ textAlign:"center", padding:"14px 0" }}>
            <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:"#ffcc33", marginBottom:6 }}>⚠ DELAYED</div>
            <div style={{ fontFamily:"'VT323', monospace", fontSize:28, color:"#ffcc3388" }}>Callback still pending</div>
          </div>
        )}
        <div style={{ textAlign:"center" }}>
          <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:6, color:"rgba(255,255,255,0.3)", marginBottom:4 }}>ELAPSED</div>
          <div style={{ fontFamily:"'VT323', monospace", fontSize:40, color: vrfState === VRF.DELAYED ? "#ffcc33" : CREAM }}>{fmt(elapsed)}</div>
        </div>
        {vrfState === VRF.PENDING ? (
          <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color:"rgba(255,255,255,0.4)", lineHeight:1.7, textAlign:"center", padding:"0 8px" }}>
            Your ETH is held securely until blocks are delivered.
          </div>
        ) : (
          <div style={{
            background:"rgba(255,204,51,0.08)", border:"1px solid rgba(255,204,51,0.25)",
            padding:"10px 12px",
            fontFamily:"'Courier Prime', monospace", fontSize:11, color:"rgba(255,204,51,0.7)", lineHeight:1.7,
          }}>
            This occasionally happens during network congestion. Your ETH remains safe.
            Cancel available after 1 hour from request time.
          </div>
        )}
        <div style={{ flex:1 }} />
        {vrfState === VRF.TIMEOUT || elapsed > 3600 ? (
          <Btn onClick={cancelMint} danger>✕  CANCEL — GET {total} ETH REFUND</Btn>
        ) : (
          <div style={{
            fontFamily:"'Courier Prime', monospace", fontSize:10,
            color:"rgba(255,255,255,0.25)", textAlign:"center", lineHeight:1.6,
          }}>
            Cancel available after 1 hour if no delivery
          </div>
        )}
      </div>
    );
  }

  if (vrfState === VRF.TIMEOUT) {
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:10, height:"100%" }}>
        <VRFStatusHeader state={VRF.TIMEOUT} />
        <div style={{
          background:"rgba(0,0,0,0.3)", border:"1px solid rgba(255,255,255,0.08)",
          padding:"6px 10px",
          fontFamily:"'Courier Prime', monospace", fontSize:11, color:"rgba(255,255,255,0.4)",
        }}>
          <span style={{ color:"rgba(255,255,255,0.25)" }}>TX </span>{reqId}
        </div>
        <div style={{
          background:"rgba(255,80,80,0.08)", border:"1px solid rgba(255,80,80,0.25)",
          padding:"12px",
          fontFamily:"'Courier Prime', monospace", fontSize:12, color:"rgba(255,150,150,0.85)", lineHeight:1.7,
        }}>
          The VRF callback did not arrive within the expected window (1 hour).
          <br/><br/>
          You can cancel this request and receive a full refund of <strong style={{color:"#ffcc33"}}>{total} ETH</strong> to your wallet.
        </div>
        <Btn onClick={cancelMint} danger>✕  CANCEL — GET {total} ETH REFUND</Btn>
        <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color:"rgba(255,255,255,0.3)", textAlign:"center", lineHeight:1.6, padding:"0 8px" }}>
          Alternatively, wait if you believe the callback is still pending.
        </div>
      </div>
    );
  }

  if (vrfState === VRF.DELIVERED && deliveredResults) {
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:10, height:"100%", animation:"deliveredPop 0.35s ease-out" }}>
        <VRFStatusHeader state={VRF.DELIVERED} />
        <div style={{
          background:"rgba(110,255,138,0.06)", border:"1px solid rgba(110,255,138,0.2)",
          padding:"10px 12px", display:"flex", justifyContent:"space-between",
        }}>
          <div>
            <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:6, color:"rgba(255,255,255,0.4)", marginBottom:3 }}>REQUESTED</div>
            <div style={{ fontFamily:"'VT323', monospace", fontSize:28, color:CREAM }}>{deliveredResults.qty}</div>
          </div>
          <div style={{ fontFamily:"'VT323', monospace", fontSize:28, color:"rgba(255,255,255,0.2)", alignSelf:"center" }}>→</div>
          <div>
            <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:6, color:"rgba(110,255,138,0.6)", marginBottom:3 }}>DELIVERED</div>
            <div style={{ fontFamily:"'VT323', monospace", fontSize:28, color:"#6eff8a" }}>{deliveredResults.alloc}</div>
          </div>
        </div>
        <div style={{
          fontFamily:"'Courier Prime', monospace", fontSize:12, color:"rgba(255,255,255,0.5)",
          textAlign:"center", padding:"12px 0", lineHeight:1.7,
        }}>
          Blocks distributed across tiers.<br/>
          Check your collection above.
        </div>
        <div style={{ flex:1 }} />
        <Btn onClick={reset}>✓  DONE</Btn>
      </div>
    );
  }

  if (vrfState === VRF.REFUNDED) {
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:10, height:"100%", animation:"deliveredPop 0.3s ease-out" }}>
        <VRFStatusHeader state={VRF.REFUNDED} />
        <div style={{
          background:"rgba(255,204,51,0.08)", border:"1px solid rgba(255,204,51,0.25)",
          padding:"14px 12px", textAlign:"center", display:"flex", flexDirection:"column", gap:8,
        }}>
          <div style={{ fontFamily:"'VT323', monospace", fontSize:44, color:"#ffcc33" }}>{total} ETH</div>
          <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:12, color:"rgba(255,204,51,0.7)" }}>
            Returned to your wallet
          </div>
        </div>
        <div style={{ flex:1 }} />
        <Btn onClick={reset}>← BACK TO MINT</Btn>
      </div>
    );
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// FORGE PANEL
// ═══════════════════════════════════════════════════════════════

function ForgePanel({ blocks, onForge, address }) {
  const [selTier,   setSelTier]     = useState(null)
  const [burnCount, setBurn]        = useState(10)
  const [vrfState,  setVrfState]    = useState(VRF.IDLE)
  const [forgeResult, setForgeResult] = useState(null)
  const [elapsed,   setElapsed]     = useState(0)
  const [forgeTxHash, setForgeTxHash] = useState(null)
  const intervalRef = useRef(null)
  const autoRef     = useRef(null)

  const { writeContract } = useWriteContract()

  const sel     = selTier ? TMAP[selTier]     : null
  const target  = selTier ? TMAP[selTier - 1] : null
  const maxBurn = selTier ? Math.min(blocks[selTier] || 0, 99) : 99

  function startClock() {
    setElapsed(0)
    intervalRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
  }
  function stopClock() { clearInterval(intervalRef.current) }
  function fmt(s) {
    const m = Math.floor(s / 60), sec = s % 60
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  }

  useWatchContractEvent({
    address: CONTRACTS.FORGE,
    abi: FORGE_ABI,
    eventName: 'ForgeResolved',
    poll: true,
    pollingInterval: 4_000,
    onLogs(logs) {
      if (vrfState !== VRF.PENDING && vrfState !== VRF.DELAYED) return
      const mine = address
        ? logs.filter(l => l.args.player?.toLowerCase() === address.toLowerCase())
        : logs
      if (mine.length === 0) return
      const log = mine[0]
      stopClock()
      clearTimeout(autoRef.current)
      setForgeResult({ success: log.args.success, fromTier: Number(log.args.fromTier) })
      setVrfState(VRF.DELIVERED)
      onForge()
    },
  })

  function doForge() {
    if (!selTier || vrfState !== VRF.IDLE) return
    setVrfState(VRF.PENDING)
    startClock()
    setForgeTxHash(null)

    writeContract({
      address: CONTRACTS.FORGE,
      abi: FORGE_ABI,
      functionName: 'forge',
      args: [BigInt(selTier), BigInt(burnCount)],
    }, {
      onSuccess: (hash) => setForgeTxHash(hash),
      onError: () => {
        stopClock()
        clearTimeout(autoRef.current)
        setVrfState(VRF.IDLE)
      },
    })

    autoRef.current = setTimeout(() => {
      stopClock()
      setVrfState(VRF.TIMEOUT)
    }, 3_600_000)
  }

  function reset() {
    stopClock()
    clearTimeout(autoRef.current)
    setVrfState(VRF.IDLE)
    setForgeResult(null)
    setElapsed(0)
    setSelTier(null)
    setForgeTxHash(null)
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
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:10, height:'100%', animation:'deliveredPop 0.35s ease-out' }}>
        <VRFStatusHeader state={VRF.DELIVERED} />
        <div style={{
          flex:1, display:'flex', flexDirection:'column', alignItems:'center',
          justifyContent:'center', gap:16, padding:'20px',
          background: forgeResult.success ? 'rgba(110,255,138,0.06)' : 'rgba(255,80,80,0.06)',
          border: `1px solid ${forgeResult.success ? 'rgba(110,255,138,0.3)' : 'rgba(255,80,80,0.3)'}`,
        }}>
          <div style={{
            fontFamily:"'Press Start 2P', monospace", fontSize:14,
            color: forgeResult.success ? '#6eff8a' : '#ff8888',
            textShadow: forgeResult.success ? '0 0 20px rgba(110,255,138,0.5)' : '0 0 20px rgba(255,80,80,0.5)',
          }}>
            {forgeResult.success ? '✓  SUCCESS' : '✗  FAILED'}
          </div>
          <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:13, color:'rgba(255,255,255,0.55)', textAlign:'center', lineHeight:1.6 }}>
            {forgeResult.success
              ? `New ${TMAP[forgeResult.fromTier - 1]?.name} added to your collection`
              : `${burnCount} ${TMAP[forgeResult.fromTier]?.name} blocks destroyed`
            }
          </div>
        </div>
        <button onClick={reset} style={{
          fontFamily:"'Press Start 2P', monospace", fontSize:7, letterSpacing:1,
          background: forgeResult.success ? GOLD : 'rgba(255,255,255,0.06)',
          color: forgeResult.success ? INK : CREAM,
          border: forgeResult.success ? `2px solid ${INK}` : '1px solid rgba(255,255,255,0.15)',
          boxShadow: forgeResult.success ? `3px 3px 0 ${INK}` : 'none',
          padding:'10px', cursor:'pointer',
        }}>
          {forgeResult.success ? '⬡ FORGE AGAIN' : '← TRY AGAIN'}
        </button>
      </div>
    )
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10, height:'100%' }}>
      <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:'rgba(255,255,255,0.4)', letterSpacing:1 }}>
        SELECT TIER TO FORGE
      </div>

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
          <div style={{ background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.08)', padding:'10px 12px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:6, color:'rgba(255,255,255,0.4)' }}>BURN COUNT</span>
              <span style={{ fontFamily:"'VT323', monospace", fontSize:24, color:sel.accent }}>{burnCount}</span>
            </div>
            <input type="range" min={10} max={maxBurn} value={burnCount}
              onChange={e => setBurn(parseInt(e.target.value))}
              style={{ width:'100%', accentColor:sel.accent }} />
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
              <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:5, color:'rgba(255,255,255,0.25)' }}>10 = 10%</span>
              <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:5, color:'rgba(255,255,255,0.25)' }}>{maxBurn} = {maxBurn}%</span>
            </div>
          </div>

          <div style={{
            background:'rgba(0,0,0,0.25)', border:`1px solid ${sel.accent}33`,
            padding:'10px 12px', textAlign:'center',
          }}>
            <div style={{ fontFamily:"'VT323', monospace", fontSize:38, color: burnCount >= 80 ? '#6eff8a' : burnCount >= 50 ? GOLD : '#ff6644' }}>
              {burnCount}% CHANCE
            </div>
            <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color:'rgba(255,255,255,0.45)', marginTop:3 }}>
              Burning {burnCount}× <span style={{color:sel.accent}}>{sel.name}</span> → 1× <span style={{color:target.accent}}>{target.name}</span>
            </div>
            <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:5.5, color:'rgba(255,80,80,0.6)', marginTop:6 }}>
              ⚠ FAILURE DESTROYS ALL BURNED BLOCKS
            </div>
          </div>

          <Btn onClick={doForge} color="#9933cc">
            ⚡ FORGE  ({burnCount}%)
          </Btn>
        </>
      ) : (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:12, color:'rgba(255,255,255,0.2)', textAlign:'center' }}>
            Select a tier above<br/>(need 10+ blocks to forge)
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// TRADE PANEL
// ═══════════════════════════════════════════════════════════════

function TradePanel() {
  const [listings] = useState([
    { tier:2, price:"0.0148 Ξ", usd:"$43,200", seller:"0x…a3f" },
    { tier:3, price:"0.0042 Ξ", usd:"$12,800", seller:"0x…7b2" },
    { tier:4, price:"0.0011 Ξ", usd:"$3,100",  seller:"0x…f44" },
    { tier:5, price:"0.00039Ξ", usd:"$1,100",  seller:"0x…e88" },
    { tier:6, price:"0.00028Ξ", usd:"$800",    seller:"0x…c12" },
  ]);
  const [toast, setToast] = useState(null);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2200); }
  function handleBuy(i) { showToast(`Buying ${TMAP[listings[i].tier].name} for ${listings[i].price} — wallet prompt coming`); }
  function handleList() { showToast("Listing flow — connect wallet to continue"); }
  function handleOpenSea() { showToast("Opening OpenSea — not live in demo"); }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8, height:"100%", position:"relative" }}>
      {toast && (
        <div style={{
          position:"absolute", bottom:0, left:0, right:0, zIndex:20,
          background:"rgba(200,168,75,0.95)", color:"#0a0705",
          fontFamily:"'Press Start 2P', monospace", fontSize:6.5,
          padding:"10px 12px", letterSpacing:0.5,
          boxShadow:"0 -2px 0 rgba(0,0,0,0.4)",
          animation:"deliveredPop 0.25s ease-out",
        }}>{toast}</div>
      )}
      <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:"rgba(255,255,255,0.4)", letterSpacing:1 }}>ACTIVE LISTINGS</div>
      {listings.map((l, i) => {
        const t = TMAP[l.tier];
        return (
          <div key={i} style={{
            display:"flex", alignItems:"center", gap:10,
            background:"rgba(0,0,0,0.3)", border:`1px solid ${t.accent}22`,
            padding:"8px 10px", transition:"border-color 0.15s",
          }}
            onMouseEnter={e=>e.currentTarget.style.borderColor=`${t.accent}55`}
            onMouseLeave={e=>e.currentTarget.style.borderColor=`${t.accent}22`}
          >
            <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:t.accent, width:20 }}>T{l.tier}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color:"rgba(255,255,255,0.6)" }}>{t.name}</div>
              <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:10, color:"rgba(255,255,255,0.25)" }}>{l.seller}</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontFamily:"'VT323', monospace", fontSize:18, color:t.accent }}>{l.price}</div>
              <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:10, color:"rgba(255,255,255,0.3)" }}>{l.usd}</div>
            </div>
            <button onClick={() => handleBuy(i)} style={{
              background:t.accent, color:"#0a0705", border:`1px solid ${GOLD_DK}`,
              boxShadow:`2px 2px 0 ${INK}`,
              fontFamily:"'Press Start 2P', monospace", fontSize:5.5,
              padding:"5px 8px", cursor:"pointer", transition:"transform 0.05s",
            }}
              onMouseDown={e=>e.currentTarget.style.transform="translate(1px,1px)"}
              onMouseUp={e=>e.currentTarget.style.transform=""}
            >BUY</button>
          </div>
        );
      })}
      <div style={{ flex:1 }} />
      <Btn onClick={handleList} color="#8a5a20">+ LIST FOR SALE</Btn>
      <button onClick={handleOpenSea} style={{
        width:"100%", padding:"7px 0", marginTop:4,
        fontFamily:"'Press Start 2P', monospace", fontSize:6,
        background:"transparent", color:"rgba(255,255,255,0.45)",
        border:"1px solid rgba(255,255,255,0.18)", cursor:"pointer",
        transition:"color 0.1s, border-color 0.1s",
      }}
        onMouseEnter={e=>{e.currentTarget.style.color=GOLD;e.currentTarget.style.borderColor=GOLD_DK;}}
        onMouseLeave={e=>{e.currentTarget.style.color="rgba(255,255,255,0.45)";e.currentTarget.style.borderColor="rgba(255,255,255,0.18)";}}
      >↗ VIEW ON OPENSEA</button>
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
    treasuryBalance,
    refetchAll,
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
  const treasury   = treasuryBalance

  // ── WALLET CONNECT / DISCONNECT ─────────────────────────────
  const { connect }    = useConnect()
  const { disconnect } = useDisconnect()
  const [showDropdown, setShowDropdown] = useState(false)

  function handleConnectClick() {
    connect({ connector: injected() })
  }
  function handleDisconnect() {
    disconnect()
    setShowDropdown(false)
  }

  // ── UI STATE ────────────────────────────────────────────────
  // ── UI STATE ────────────────────────────────────────────────
  const [activePanel, setPanel]      = useState("mint")
  const [combineMsg,  setCombineMsg] = useState(null)
  const [resetAlert,  setResetAlert] = useState(false)

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
    // Task 1: show success banner
    const toTier = lastCombinedToTierRef.current
    if (toTier != null) {
      setCombineMsg(`✓ Combined! ${TIER_NAMES[toTier] ?? `Tier ${toTier}`} added to collection`)
      setTimeout(() => setCombineMsg(null), 2200)
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

  function handleMint()  { refetchAll() }
  function handleForge() { refetchAll() }

  const have6 = [2,3,4,5,6,7].filter(t => (blocks[t] ?? 0) > 0).length

  // Task 3: all 6 tiers held = show takeover
  const all6held = [2,3,4,5,6,7].every(t => (blocks[t] ?? 0) >= 1)
  const isActiveHolder = countdownActive === true && 
   countdownHolder?.toLowerCase() === address?.toLowerCase()
  const showTrigger = all6held && countdownActive === false

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
        position:"fixed", inset:0, pointerEvents:"none", zIndex:9999,
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

      {/* ── Spectator route: countdown active, not the holder ── */}
      {countdownActive === true && isConnected && !isActiveHolder && onNavigate('countdown-spectator')}

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
      {isActiveHolder && onNavigate('countdown-holder')}
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
          <div style={{
            fontFamily:"'Press Start 2P', monospace", fontSize:7.5,
            color:GOLD, border:`2px solid ${GOLD_DK}`,
            padding:"5px 12px", background:"rgba(200,168,75,0.1)", whiteSpace:"nowrap",
          }}>
            ◈ Ξ {treasury}
          </div>

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
              <button
                onClick={handleConnectClick}
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
            )}
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ maxWidth:1300, margin:"0 auto", padding:"24px 20px 48px" }}>

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

        {/* ── 3 BOTTOM PANELS ── */}
        <div style={{
          display:"grid", gridTemplateColumns:"repeat(3, minmax(280px, 1fr))",
          gap:12, overflowX:"auto", paddingBottom:4,
        }}>
          {panels.map(p => (
            <div key={p.id} style={{
              background:p.bg, border:`3px solid ${INK}`,
              boxShadow:`5px 5px 0 rgba(0,0,0,0.55)`,
              padding:"20px", minHeight:460,
              display:"flex", flexDirection:"column",
            }}>
              <div style={{
                fontFamily:"'Press Start 2P', monospace", fontSize:10, letterSpacing:2,
                color:p.titleColor, paddingBottom:12, marginBottom:14,
                borderBottom:"1px solid rgba(255,255,255,0.07)",
              }}>{p.label}</div>
              <div style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0 }}>
                {p.id==="mint"  && <VRFMintPanel onMint={handleMint} windowOpen={windowOpen} windowInfo={windowInfo} slots={slots} treasury={treasury} address={address} refetchAll={refetchAll} blocks={blocks} />}
                {p.id==="forge" && <ForgePanel blocks={blocks} onForge={handleForge} address={address} />}
                {p.id==="trade" && <TradePanel />}
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

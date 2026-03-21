import { useState, useEffect } from "react";
import { GOLD_DK, INK, CREAM } from '../config/design-tokens';

export const VRF = {
  IDLE:"idle", PENDING:"pending", DELAYED:"delayed",
  TIMEOUT:"timeout", DELIVERED:"delivered", REFUNDED:"refunded",
};

export function Btn({ onClick, children, color="#c8a84b", disabled=false, danger=false, sm=false }) {
  const bg = danger ? "#660000" : disabled ? "rgba(0,0,0,0.3)" : color;
  const clr = danger ? "#ff9999" : disabled ? "rgba(255,255,255,0.2)" : INK;
  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        width:"100%", height: sm ? 44 : 52,
        fontFamily:"'Press Start 2P', monospace", fontSize: sm ? 8 : 10, letterSpacing:1,
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

export function StatBox({ label, value, accent }) {
  return (
    <div style={{ flex:1, background:"rgba(0,0,0,0.35)", border:"1px solid rgba(255,255,255,0.07)", padding:"6px 8px" }}>
      <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:"rgba(255,255,255,0.35)", letterSpacing:1 }}>{label}</div>
      <div style={{ fontFamily:"'VT323', monospace", fontSize:24, color: accent || CREAM, marginTop:2 }}>{value}</div>
    </div>
  );
}

export function TxErrorPanel({ error, onRetry, context="transaction" }) {
  const [expanded, setExpanded] = useState(false);
  const msg = error?.shortMessage || error?.message || "Transaction failed";
  const isRejected = msg.toLowerCase().includes("reject") || msg.toLowerCase().includes("denied");
  return (
    <div style={{
      background:'rgba(255,50,30,0.06)', border:'1px solid rgba(255,50,30,0.25)',
      padding:'14px 16px', display:'flex', flexDirection:'column', gap:10,
    }}>
      <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:9, color:'#ff8888' }}>
        ✕ Transaction failed
      </div>
      <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:12, color:'rgba(255,255,255,0.5)' }}>
        "{msg}"
      </div>
      <button onClick={() => setExpanded(e => !e)} style={{
        background:'none', border:'none', cursor:'pointer', textAlign:'left',
        fontFamily:"'Press Start 2P', monospace", fontSize:8, color:'rgba(255,255,255,0.35)',
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

export function Skeleton({ height=20, width="100%" }) {
  return (
    <div style={{
      height, width,
      background:"rgba(255,255,255,0.08)",
      animation:"skeletonPulse 1.5s ease-in-out infinite",
      borderRadius:2,
    }} />
  )
}

export function LoadingSkeleton() {
  return (
    <div style={{ maxWidth:1300, margin:"0 auto", padding:"24px 20px 48px" }}>
      <Skeleton height={40} />
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:12, margin:"20px 0" }}>
        {[1,2,3,4,5,6,7].map(i => <Skeleton key={i} height={140} />)}
      </div>
      <Skeleton height={64} />
      <div style={{ marginTop:20 }}>
        <Skeleton height={48} />
        <Skeleton height={300} />
      </div>
    </div>
  )
}

export function VRFStatusHeader({ state }) {
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
      <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:9, color:cfg.color, letterSpacing:1 }}>
        {cfg.icon} {cfg.label}
      </div>
      <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color:`${cfg.color}99` }}>
        {cfg.sub}
      </div>
    </div>
  );
}

export function SpinnerBlock() {
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

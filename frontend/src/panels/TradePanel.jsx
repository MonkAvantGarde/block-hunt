import { GOLD, GOLD_DK, CREAM, TMAP } from '../config/design-tokens';

export default function TradePanel() {
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

      <div style={{ background:"rgba(0,0,0,0.25)", border:"1px solid rgba(255,255,255,0.06)", padding:"10px 12px" }}>
        <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:"rgba(255,255,255,0.45)", letterSpacing:1, marginBottom:8 }}>
          COMBINE-PATH VALUE
        </div>
        <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:"rgba(255,255,255,0.45)", marginBottom:8, display:"flex", justifyContent:"space-between" }}>
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

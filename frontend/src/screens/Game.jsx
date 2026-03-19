import { useState, useEffect, useRef } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useWatchContractEvent, useReadContract } from 'wagmi'
import { useGameState } from '../hooks/useGameState'
import { CONTRACTS } from '../config/wagmi'
import { TOKEN_ABI } from '../abis'
import {
  FELT, WOOD, GOLD, GOLD_DK, GOLD_LT, INK, CREAM,
  TMAP, COMBINE_RATIOS, TIER_NAMES,
} from '../config/design-tokens'
import GameStatusBar from '../components/GameStatusBar'
import AllTiersTrigger from './AllTiersTrigger'
import RevealMoment, { CombineCeremony } from '../components/RevealMoment'
import MintRevealCardFlip from '../components/MintRevealCardFlip'
import CombineCollapse from '../components/CombineCollapse'
import CollectionCascade from '../components/CollectionCascade'
import { WalletButton } from '../components/WalletButton'
import TierSlot from '../components/TierSlot'
import VRFMintPanel from '../panels/MintPanel'
import ForgePanel from '../panels/ForgePanel'
import TradePanel from '../panels/TradePanel'
import RewardsPanel from '../panels/RewardsPanel'

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
  @keyframes combinePopIn {
    0%   { transform: scale(0); opacity: 0; }
    60%  { transform: scale(1.15); }
    100% { transform: scale(1); opacity: 1; }
  }
  /* B4: Quantity selector press feel */
  .qty-btn:active, .mint-panel-layout button:active {
    transform: scale(0.97) !important;
    transition: transform 50ms !important;
  }
  @keyframes skeletonPulse {
    0%,100% { opacity: 0.08; }
    50%     { opacity: 0.18; }
  }

  /* ── Responsive breakpoints ── */
  @media (max-width: 1400px) {
    .tier-card-img { width: 120px !important; height: 120px !important; }
  }
  @media (max-width: 1200px) {
    .tier-grid { grid-template-columns: repeat(4, 1fr) !important; }
    .tier-card-img { width: 140px !important; height: 140px !important; }
    .mint-panel-layout { flex-direction: column !important; }
    .mint-panel-layout > div { flex: 1 1 100% !important; }
    .forge-layout { flex-direction: column !important; }
    .forge-layout > div { flex: 1 1 100% !important; }
  }
  @media (max-width: 800px) {
    .tier-grid { grid-template-columns: repeat(3, 1fr) !important; gap: 10px !important; }
    .tier-card-img { width: 100px !important; height: 100px !important; }
    .game-header-nav { display: none !important; }
    .tab-bar button { font-size: 7px !important; height: 44px !important; }
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
    userCapReached,
    userMintsRemaining,
    userMintedThisWindow,
    perUserCap,
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

  // ── UI STATE ────────────────────────────────────────────────
  const [activePanel, setPanel]      = useState("mint")
  const [combineMsg,  setCombineMsg] = useState(null)
  const [resetAlert,  setResetAlert] = useState(false)
  const [revealTier,  setRevealTier] = useState(null)
  const [ceremonyCombineTier, setCeremonyCombineTier] = useState(null)
  const [mintRevealResults, setMintRevealResults] = useState(null)
  const [combineCollapseData, setCombineCollapseData] = useState(null) // { fromTier, startCount, combineRatio }
  const [showCascade, setShowCascade] = useState(false)
  const cascadeShownRef = useRef(false)
  const [rankToast,   setRankToast]  = useState(null)
  const [currentRank, setCurrentRank] = useState(() => {
    if (typeof window !== 'undefined' && address) {
      const saved = localStorage.getItem(`blockhunt_rank_${address.toLowerCase()}`)
      return saved ? parseInt(saved) : null
    }
    return null
  })
  const prevBalancesRef = useRef(null)

  // ── CountdownHolderReset WebSocket alert ─────────────────────
  useWatchContractEvent({
    address: CONTRACTS.TOKEN,
    abi: TOKEN_ABI,
    eventName: 'CountdownHolderReset',
    poll: true,
    pollingInterval: 4_000,
    onLogs() {
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
    // Trigger CombineCollapse animation
    setCombineCollapseData({ fromTier, startCount: blocks[fromTier] || 0, combineRatio: ratio })
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

  // Detect mint delivery by comparing before/after balances — trigger card flip
  useEffect(() => {
    if (!prevBalancesRef.current) {
      prevBalancesRef.current = { ...balances }
      return
    }
    // Compute tier deltas
    const deltas = {}
    let anyChange = false
    for (const tier of [2, 3, 4, 5, 6, 7]) {
      const prev = prevBalancesRef.current[tier] || 0
      const curr = balances[tier] || 0
      const d = curr - prev
      if (d > 0) { deltas[tier] = d; anyChange = true }
    }
    prevBalancesRef.current = { ...balances }

    if (anyChange && !mintRevealResults) {
      // Trigger the card flip animation with the tier results
      setMintRevealResults({
        t7: deltas[7] || 0, t6: deltas[6] || 0, t5: deltas[5] || 0,
        t4: deltas[4] || 0, t3: deltas[3] || 0, t2: deltas[2] || 0,
      })
    } else if (anyChange) {
      // If card flip already showing (e.g. combine), fall back to old rare reveal
      for (const tier of [2, 3, 4, 5]) {
        if (deltas[tier] > 0) { setRevealTier(tier); break }
      }
    }
  }, [balances]) // eslint-disable-line react-hooks/exhaustive-deps

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
        setCurrentRank(rank)
      } catch {}
    }
    checkRank()
    const interval = setInterval(checkRank, 60_000)
    return () => clearInterval(interval)
  }, [address])

  // Collection Cascade — trigger once when all 6 tiers first held
  useEffect(() => {
    const all = [2,3,4,5,6,7].every(t => (blocks[t] ?? 0) >= 1)
    if (all && !cascadeShownRef.current && address) {
      const key = `blockhunt_cascade_${address.toLowerCase()}`
      if (!localStorage.getItem(key)) {
        cascadeShownRef.current = true
        localStorage.setItem(key, '1')
        setShowCascade(true)
      }
    }
  }, [blocks, address])

  // Task 3: all 6 tiers held = show takeover
  const all6held = [2,3,4,5,6,7].every(t => (blocks[t] ?? 0) >= 1)
  const have6 = all6held ? 6 : [2,3,4,5,6,7].filter(t => (blocks[t] ?? 0) > 0).length
  const isActiveHolder = countdownActive === true &&
   countdownHolder?.toLowerCase() === address?.toLowerCase()
  const showTrigger = all6held && countdownActive === false

  // ── COUNTDOWN NAVIGATION ────────────────
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
    { id:"rewards", label:"★ REWARDS", bg:"#0a1520", titleColor:"#4ecdc4" },
  ]

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

      {/* Combine success banner */}
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

      {/* Rank change toast */}
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

      {/* Collection Cascade (all 6 tiers held — once per player) */}
      {showCascade && (
        <CollectionCascade onComplete={() => setShowCascade(false)} />
      )}

      {/* Combine Collapse animation */}
      {combineCollapseData && (
        <CombineCollapse
          fromTier={combineCollapseData.fromTier}
          startCount={combineCollapseData.startCount}
          combineRatio={combineCollapseData.combineRatio}
          onComplete={() => setCombineCollapseData(null)}
        />
      )}

      {/* Mint Reveal Card Flip animation */}
      {mintRevealResults && (
        <MintRevealCardFlip
          results={mintRevealResults}
          onComplete={() => setMintRevealResults(null)}
          onRareReveal={(tier) => {
            setMintRevealResults(null)
            setRevealTier(tier)
          }}
        />
      )}

      {/* Reveal Moment (T5-T2 mint reveal) */}
      {revealTier && (
        <RevealMoment
          tier={revealTier}
          prizePool={prizePool}
          onDismiss={() => setRevealTier(null)}
        />
      )}

      {/* Combine Ceremony (new tier unlock) */}
      {ceremonyCombineTier && (
        <CombineCeremony
          tier={ceremonyCombineTier}
          onDismiss={() => setCeremonyCombineTier(null)}
        />
      )}

      {/* CountdownHolderReset alert banner */}
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
          <span style={{ fontSize: 7, color: "rgba(204,102,255,0.7)", letterSpacing: 0.5 }}>
            You hold all 6 tiers — you can trigger now
          </span>
        </div>
      )}

      {/* All-6-tiers takeover */}
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

        <div className="game-header-nav" style={{ display:"flex", gap:28, alignItems:"center" }}>
          {["LEADERBOARD","RULES","PROFILE"].map(l => (
            <span key={l}
              style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:"rgba(255,255,255,0.5)", cursor:"pointer", letterSpacing:1, transition:"color 0.1s" }}
              onMouseEnter={e=>e.target.style.color=GOLD}
              onMouseLeave={e=>e.target.style.color="rgba(255,255,255,0.5)"}
              onClick={()=>onOpenModal(l==="RULES"?"rules":l==="LEADERBOARD"?"leaderboard":"profile")}
            >{l}</span>
          ))}
        </div>

        <WalletButton />
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ maxWidth:1300, margin:"0 auto", padding:"24px 20px 48px", opacity: isLoading ? 0.5 : 1, transition:"opacity 0.3s" }}>

        {/* Collection progress bar */}
        <div style={{
          display:"flex", alignItems:"center", gap:16, marginBottom:20,
          padding:"10px 16px", background:"rgba(0,0,0,0.2)", border:"1px solid rgba(255,255,255,0.05)",
        }}>
          <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:"rgba(255,255,255,0.45)", whiteSpace:"nowrap" }}>COLLECTION</div>
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
          <div style={{ display:"flex", alignItems:"center", gap:4, marginRight:8 }}>
            {[7,6,5,4,3,2].map(t => {
              const held = (blocks[t] ?? 0) > 0
              const tier = TMAP[t]
              return <span key={t} style={{ fontFamily:"'VT323', monospace", fontSize:16, color: held ? tier.accent : "rgba(255,255,255,0.2)", lineHeight:1 }}>{held ? "■" : "◇"}</span>
            })}
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
          <div className="tier-grid" style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:16, padding:"16px 0" }}>
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
          {/* Collection summary line */}
          {(() => {
            const T7_EQUIV = { 7:1, 6:20, 5:400, 4:12000, 3:360000, 2:18000000 }
            const price = mintPrice || 0.00008
            const combineValue = [2,3,4,5,6,7].reduce((sum, t) => sum + (blocks[t] || 0) * (T7_EQUIV[t] || 1) * price, 0)
            const s2Starters = [2,3,4,5,6].reduce((sum, t) => sum + (blocks[t] || 0), 0)
            return (
              <div style={{
                fontFamily:"'Press Start 2P', monospace", fontSize:7,
                color:"rgba(255,255,255,0.45)", textAlign:"center",
                marginTop:10, letterSpacing:0.5,
                textShadow:"0 0 8px rgba(200,168,75,0.3)",
              }}>
                ~{combineValue < 0.0001 ? "0.0000" : combineValue.toFixed(4)} Ξ combine value
                {" · "}
                {s2Starters} S2 starters
                {currentRank && <>{" · "}Rank #{currentRank}</>}
              </div>
            )
          })()}
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
          <div className="tab-bar" style={{
            display:"flex", gap:0,
            background:"rgba(0,0,0,0.3)",
            borderTop:`1px solid rgba(138,104,32,0.15)`,
          }}>
            {panels.map((p, idx) => {
              const active = activePanel === p.id
              const hasBadge = (p.id === "mint" && windowOpen) || (p.id === "forge" && [7,6,5,4,3,2].some(t => (blocks[t] || 0) >= 10)) || (p.id === "rewards" && isConnected)
              return (
                <button key={p.id} onClick={() => setPanel(p.id)} style={{
                  flex:1, height:48,
                  fontFamily:"'Press Start 2P', monospace",
                  fontSize: active ? 9 : 7,
                  letterSpacing: 2,
                  color: active ? p.titleColor : "rgba(255,255,255,0.5)",
                  background: active ? `rgba(200,168,75,0.08)` : "rgba(0,0,0,0.15)",
                  border:"none",
                  borderBottom: active ? `3px solid ${p.titleColor}` : "2px solid rgba(255,255,255,0.08)",
                  borderRight: idx < panels.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                  cursor:"pointer",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                  opacity: active ? 1 : 0.7,
                  transition:"opacity 0.15s, font-size 0.1s, background 0.15s",
                  textShadow: active ? `0 0 8px rgba(200,168,75,0.3)` : "none",
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "rgba(200,168,75,0.08)"; e.currentTarget.style.opacity = "0.8"; }}}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "rgba(0,0,0,0.15)"; e.currentTarget.style.opacity = "0.7"; }}}
                >
                  {p.label}
                  {hasBadge && <div style={{ width:6, height:6, borderRadius:"50%", background: p.id === "mint" ? "#6eff8a" : p.id === "rewards" ? "#4ecdc4" : "#cc66ff", animation: p.id === "rewards" ? "badgePulse 1.2s infinite" : undefined }} />}
                </button>
              )
            })}
          </div>

          {/* Active panel */}
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
                  {p.id==="mint"  && <VRFMintPanel onMint={handleMint} windowOpen={windowOpen} windowInfo={windowInfo} slots={slots} prizePool={prizePool} address={address} refetchAll={refetchAll} blocks={blocks} mintPrice={mintPrice} mintPriceWei={mintPriceWei} currentBatch={currentBatch} userCapReached={userCapReached} userMintsRemaining={userMintsRemaining} userMintedThisWindow={userMintedThisWindow} perUserCap={perUserCap} />}
                  {p.id==="forge" && <ForgePanel blocks={blocks} onForge={handleForge} address={address} />}
                  {p.id==="trade" && <TradePanel />}
                  {p.id==="rewards" && <RewardsPanel address={address} blocks={blocks} />}
                </div>
              </div>
            )
          })()}
        </div>

      </div>
    </div>
  );
}

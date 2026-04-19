import { useState, useEffect, useRef, useMemo } from "react";
import { useWaitForTransactionReceipt, useWatchContractEvent, useReadContract } from 'wagmi'
import { useSafeWrite } from '../hooks/useSafeWrite'
import { useGameState } from '../hooks/useGameState'
import { CONTRACTS } from '../config/wagmi'
import { TOKEN_ABI, MARKETPLACE_ABI } from '../abis'
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
    .game-mobile-menu-btn { display: flex !important; }
    .tab-bar button { font-size: 7px !important; height: 44px !important; }
  }
  @media (min-width: 801px) {
    .game-mobile-menu-btn { display: none !important; }
  }
  .mobile-menu-item {
    transition: background 0.1s;
  }
  .mobile-menu-item:hover {
    background: rgba(200,168,75,0.1) !important;
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

export default function GameScreen({ onOpenModal, onNavigate, dismissedSpectator = false }) {
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
    mintStatus,
    userCapReached,
    userMintsRemaining,
    userMintedThisWindow,
    perUserCap,
    refetchAll,
    isLoading,
    seasonWon,
  } = useGameState()

  const blocks = useMemo(() => ({
    1: balances[1], 2: balances[2], 3: balances[3], 4: balances[4],
    5: balances[5], 6: balances[6], 7: balances[7],
  }), [balances[1], balances[2], balances[3], balances[4], balances[5], balances[6], balances[7]])
  // ── COUNTDOWN STATE FROM CHAIN ──────────────────────────────
const { data: countdownActive } = useReadContract({
  address: CONTRACTS.TOKEN, chainId: 84532,
  abi: TOKEN_ABI,
  functionName: 'countdownActive',
  query: { refetchInterval: 10_000 },
})
const { data: countdownHolder } = useReadContract({
  address: CONTRACTS.TOKEN, chainId: 84532,
  abi: TOKEN_ABI,
  functionName: 'countdownHolder',
  query: { refetchInterval: 10_000 },
})

  const windowOpen = mintStatus?.canMint ?? true
  const slots      = windowInfo?.remaining ? Number(windowInfo.remaining) : 0

  // ── UI STATE ────────────────────────────────────────────────
  const [activePanel, setPanel]      = useState("mint")
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [combineMsg,  setCombineMsg] = useState(null)
  const [resetAlert,  setResetAlert] = useState(false)
  const [tradeToast,  setTradeToast] = useState(null)
  const [revealTier,  setRevealTier] = useState(null)
  const [ceremonyCombineTier, setCeremonyCombineTier] = useState(null)
  const [mintRevealResults, setMintRevealResults] = useState(null)
  const [combineCollapseData, setCombineCollapseData] = useState(null) // { fromTier, startCount, combineRatio }
  const [showCascade, setShowCascade] = useState(false)
  // True if cascade hasn't been seen yet for this wallet (or ?cascade=test) — block premature navigation
  const cascadeTest = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('cascade') === 'test'
  const cascadePending = cascadeTest || (address && !localStorage.getItem(`blockhunt_cascade_${address.toLowerCase()}`))
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
    address: CONTRACTS.TOKEN, chainId: 84532,
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

  // ── Trade notifications (listing filled / offer filled) ─────
  useWatchContractEvent({
    address: CONTRACTS.MARKETPLACE, chainId: 84532,
    abi: MARKETPLACE_ABI,
    eventName: 'ListingFilled',
    poll: true,
    pollingInterval: 8_000,
    onLogs(logs) {
      if (!address) return
      for (const log of logs) {
        const buyer = log.args?.buyer?.toLowerCase()
        // We only notify the seller — buyer already sees the confirm
        // Seller = listing creator, not directly in the event, but if we see a fill
        // and we're not the buyer, it might be our listing
        if (buyer && buyer !== address.toLowerCase()) {
          setTradeToast('Your listing was filled!')
          refetchAll()
          setTimeout(() => setTradeToast(null), 8000)
        }
      }
    },
  })
  useWatchContractEvent({
    address: CONTRACTS.MARKETPLACE, chainId: 84532,
    abi: MARKETPLACE_ABI,
    eventName: 'OfferFilled',
    poll: true,
    pollingInterval: 8_000,
    onLogs(logs) {
      if (!address) return
      for (const log of logs) {
        const seller = log.args?.seller?.toLowerCase()
        // Notify the buyer — seller already sees the confirm
        if (seller && seller !== address.toLowerCase()) {
          setTradeToast('Your buy offer was filled!')
          refetchAll()
          setTimeout(() => setTradeToast(null), 8000)
        }
      }
    },
  })

  // ── COMBINE — live transaction ──────────────────────────────
  const { writeContract: writeCombine } = useSafeWrite()
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
    if (combineQueue.length === 0) setCombineBatchInfo(null)
  }, [combineSuccess])

  const MAX_COMBINE_BATCH = 50
  const [combineQueue, setCombineQueue] = useState([])
  const [combineBatchInfo, setCombineBatchInfo] = useState(null) // { current, total }

  function handleCombine(fromTier, times = 1) {
    const ratio = COMBINE_RATIOS[fromTier]
    if ((blocks[fromTier] || 0) < ratio * times) return
    setCombiningTier(fromTier)
    lastCombinedToTierRef.current = fromTier - 1

    if (times <= 1) {
      writeCombine({
        address: CONTRACTS.TOKEN, chainId: 84532, abi: TOKEN_ABI,
        functionName: 'combine', args: [BigInt(fromTier)],
      }, {
        onSuccess: (hash) => {
          setCombineCollapseData({ fromTier, startCount: blocks[fromTier] || 0, combineRatio: ratio })
          setCombineTxHash(hash)
        },
        onError: () => { setCombiningTier(null); lastCombinedToTierRef.current = null },
      })
      return
    }

    // Auto-batch: split into chunks of 50
    const chunks = []
    let remaining = times
    while (remaining > 0) {
      const chunk = Math.min(remaining, MAX_COMBINE_BATCH)
      chunks.push(chunk)
      remaining -= chunk
    }

    const totalBatches = chunks.length
    setCombineBatchInfo(totalBatches > 1 ? { current: 1, total: totalBatches } : null)

    // Send first chunk, queue the rest
    setCombineQueue(chunks.slice(1).map(c => ({ fromTier, count: c })))
    const firstChunk = chunks[0]
    writeCombine({
      address: CONTRACTS.TOKEN, chainId: 84532, abi: TOKEN_ABI,
      functionName: 'combineMany',
      args: [Array(firstChunk).fill(BigInt(fromTier))],
      gas: BigInt(200_000) + BigInt(firstChunk) * BigInt(120_000),
    }, {
      onSuccess: (hash) => {
        setCombineCollapseData({ fromTier, startCount: blocks[fromTier] || 0, combineRatio: ratio })
        setCombineTxHash(hash)
      },
      onError: () => { setCombiningTier(null); setCombineQueue([]); setCombineBatchInfo(null); lastCombinedToTierRef.current = null },
    })
  }

  // Process remaining combine queue after each batch confirms
  useEffect(() => {
    if (combineSuccess && combineQueue.length > 0) {
      const [next, ...rest] = combineQueue
      setCombineQueue(rest)
      setCombineBatchInfo(prev => prev ? { ...prev, current: prev.current + 1 } : null)
      setTimeout(() => {
        writeCombine({
          address: CONTRACTS.TOKEN, chainId: 84532, abi: TOKEN_ABI,
          functionName: 'combineMany',
          args: [Array(next.count).fill(BigInt(next.fromTier))],
          gas: BigInt(200_000) + BigInt(next.count) * BigInt(120_000),
        }, {
          onError: () => { setCombiningTier(null); setCombineQueue([]); setCombineBatchInfo(null) },
        })
      }, 500)
    }
  }, [combineSuccess, combineQueue])

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

  // ── Rank change notifications — reads from server-cached API ──
  useEffect(() => {
    if (!address) return
    async function checkRank() {
      let players = []
      try {
        const res = await fetch('/api/leaderboard')
        if (!res.ok) throw new Error("API error")
        const json = await res.json()
        players = json.players || []
      } catch {
        // API down — try localStorage cache, then hardcoded fallback
        try {
          const cached = JSON.parse(localStorage.getItem('blockhunt_lb_cache'))
          if (cached?.players?.length) { players = cached.players }
        } catch {}
        if (!players.length) {
          const { FALLBACK_PLAYERS } = await import('../config/leaderboard-fallback')
          players = FALLBACK_PLAYERS.map(p => ({ id: p.id }))
        }
      }
      try {
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
    const interval = setInterval(checkRank, 60_000) // 1 min — server caches, so this is cheap
    return () => clearInterval(interval)
  }, [address])

  // Collection Cascade — trigger once when all 6 tiers first held (or ?cascade=test)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('cascade') === 'test') {
      setShowCascade(true)
      return
    }
    const totalBlocks = Object.values(blocks).reduce((sum, v) => sum + (v ?? 0), 0)
    if (totalBlocks <= 0) return
    const all = [2,3,4,5,6,7].every(t => (blocks[t] ?? 0) >= 1)
    if (all && address) {
      const key = `blockhunt_cascade_${address.toLowerCase()}`
      if (!localStorage.getItem(key)) {
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

  // Show trigger animation when player just became the countdown holder
  // and hasn't seen the animation yet this session
  const [triggerAnimShown, setTriggerAnimShown] = useState(false)
  const showTrigger = isActiveHolder && !triggerAnimShown && (() => {
    if (!address) return false
    const key = `blockhunt_trigger_anim_${address.toLowerCase()}`
    return !sessionStorage.getItem(key)
  })()

  // ── COUNTDOWN NAVIGATION ────────────────
  useEffect(() => {
    if (showCascade || cascadePending) return
    if (countdownActive === true && isConnected && !isActiveHolder && !dismissedSpectator) {
      onNavigate('countdown-spectator')
    }
  }, [countdownActive, isConnected, isActiveHolder, dismissedSpectator, showCascade, cascadePending])

  useEffect(() => {
    if (showCascade || cascadePending) return
    if (isActiveHolder && !showTrigger) {
      onNavigate('countdown-holder')
    }
  }, [isActiveHolder, triggerAnimShown, showCascade, cascadePending])

  const panels = [
    { id:"mint",  label:"⬡ MINT",  bg:"#0a1f15", titleColor:"#6eff8a" },
    { id:"forge", label:"⚡ FORGE", bg:"#14071f", titleColor:"#cc66ff" },
    { id:"trade", label:"⇄ TRADE", bg:"#1f1007", titleColor:"#ffa84b" },
    { id:"rewards", label:"★ REWARDS", bg:"#0a1a15", titleColor:"#4ecdc4" },
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

      {/* Combine batch progress banner */}
      {combineBatchInfo && (
        <div style={{
          position:"fixed", top:28, left:"50%",
          transform:"translateX(-50%)",
          zIndex:8001,
          background:"linear-gradient(135deg,#1a3a4a,#0a2a3a)",
          border:"2px solid #4ecdc4",
          borderRadius:4, padding:"10px 24px",
          fontFamily:"'Press Start 2P', monospace", fontSize:9,
          color:"#6ee0d8", letterSpacing:1, whiteSpace:"nowrap",
          boxShadow:"0 0 20px rgba(78,205,196,0.3)",
        }}>
          SIGNING {combineBatchInfo.current} OF {combineBatchInfo.total} TRANSACTIONS
        </div>
      )}

      {/* Combine success banner */}
      {!combineBatchInfo && combineMsg && (
        <div style={{
          position:"fixed", top:28, left:"50%",
          transform:"translateX(-50%)",
          zIndex:8000,
          background:"linear-gradient(135deg,#1a4a1a,#0a3a0a)",
          border:"2px solid #3aaa3a",
          borderRadius:4, padding:"10px 24px",
          fontFamily:"'Press Start 2P', monospace", fontSize:10,
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
            <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color: rankToast.direction === 'up' ? '#6eff8a' : '#ffcc33', letterSpacing:1 }}>
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

      {/* Trade notification toast */}
      {tradeToast && (
        <div
          onClick={() => setTradeToast(null)}
          style={{
            position:"fixed", bottom:32, left:24, zIndex:8000,
            background:"rgba(20,50,60,0.95)",
            border:"2px solid #4ecdc4",
            borderRadius:4, padding:"12px 20px", cursor:"pointer",
            boxShadow:"0 4px 20px rgba(78,205,196,0.3)",
            animation:"fadeInDown 0.3s ease-out",
            display:"flex", alignItems:"center", gap:10,
          }}
        >
          <span style={{ fontFamily:"'VT323', monospace", fontSize:28, color:"#4ecdc4" }}>⇄</span>
          <div>
            <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:"#4ecdc4", letterSpacing:1 }}>TRADE COMPLETE</div>
            <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:12, color:'rgba(255,255,255,0.6)', marginTop:2 }}>{tradeToast}</div>
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
          fontFamily: "'Press Start 2P', monospace", fontSize: 9,
          color: "#cc66ff", letterSpacing: 1, whiteSpace: "nowrap",
          boxShadow: "0 0 24px rgba(204,102,255,0.5)",
          animation: "fadeInDown 0.2s ease-out",
          pointerEvents: "none",
          textAlign: "center",
          lineHeight: 2,
        }}>
          ⚡ COUNTDOWN RESET<br/>
          <span style={{ fontSize: 8, color: "rgba(204,102,255,0.7)", letterSpacing: 0.5 }}>
            You hold all 6 tiers — you can trigger now
          </span>
        </div>
      )}

      {/* All-6-tiers takeover */}
      {showTrigger && (
        <AllTiersTrigger
          walletAddress={address}
          balances={blocks}
          alreadyTriggered={true}
          onTriggered={() => {
            const key = `blockhunt_trigger_anim_${address.toLowerCase()}`
            sessionStorage.setItem(key, '1')
            setTriggerAnimShown(true)
            onNavigate('countdown-holder')
          }}
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
              style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:"rgba(255,255,255,0.5)", cursor:"pointer", letterSpacing:1, transition:"color 0.1s" }}
              onMouseEnter={e=>e.target.style.color=GOLD}
              onMouseLeave={e=>e.target.style.color="rgba(255,255,255,0.5)"}
              onClick={()=>onOpenModal(l==="RULES"?"rules":l==="LEADERBOARD"?"leaderboard":"profile")}
            >{l}</span>
          ))}
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {/* Mobile hamburger */}
          <div className="game-mobile-menu-btn" style={{ position:"relative", display:"none" }}>
            <button
              onClick={() => setMobileMenuOpen(v => !v)}
              style={{
                background:"none", border:`1px solid ${GOLD_DK}`, padding:"6px 8px",
                cursor:"pointer", display:"flex", flexDirection:"column", gap:3,
                alignItems:"center", justifyContent:"center",
              }}
            >
              <div style={{ width:16, height:2, background:GOLD, transition:"all 0.15s", transform: mobileMenuOpen ? "rotate(45deg) translateY(5px)" : "none" }} />
              <div style={{ width:16, height:2, background:GOLD, transition:"all 0.15s", opacity: mobileMenuOpen ? 0 : 1 }} />
              <div style={{ width:16, height:2, background:GOLD, transition:"all 0.15s", transform: mobileMenuOpen ? "rotate(-45deg) translateY(-5px)" : "none" }} />
            </button>

            {mobileMenuOpen && (
              <>
                <div onClick={() => setMobileMenuOpen(false)} style={{ position:"fixed", inset:0, zIndex:899 }} />
                <div style={{
                  position:"absolute", top:"calc(100% + 8px)", right:0, zIndex:900,
                  background:WOOD, border:`2px solid ${GOLD}`,
                  boxShadow:"0 8px 24px rgba(0,0,0,0.7)",
                  minWidth:160, overflow:"hidden",
                }}>
                  {[
                    { label:"LEADERBOARD", icon:"⬡", modal:"leaderboard" },
                    { label:"RULES",       icon:"◈", modal:"rules" },
                    { label:"PROFILE",     icon:"★", modal:"profile" },
                  ].map(item => (
                    <button
                      key={item.label}
                      className="mobile-menu-item"
                      onClick={() => { onOpenModal(item.modal); setMobileMenuOpen(false) }}
                      style={{
                        display:"flex", alignItems:"center", gap:10, width:"100%",
                        padding:"12px 16px", background:"transparent", border:"none",
                        borderBottom:"1px solid rgba(200,168,75,0.12)", cursor:"pointer",
                        fontFamily:"'Press Start 2P', monospace", fontSize:8,
                        color:CREAM, letterSpacing:1, textAlign:"left",
                      }}
                    >
                      <span style={{ color:GOLD, fontSize:12 }}>{item.icon}</span>
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <WalletButton />
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ maxWidth:1300, margin:"0 auto", padding:"24px 20px 48px", opacity: isLoading ? 0.5 : 1, transition:"opacity 0.3s" }}>

        {/* Collection progress bar */}
        <div style={{
          display:"flex", alignItems:"center", gap:16, marginBottom:20,
          padding:"10px 16px", background:"rgba(0,0,0,0.2)", border:"1px solid rgba(255,255,255,0.05)",
        }}>
          <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:"rgba(255,255,255,0.55)", whiteSpace:"nowrap" }}>COLLECTION</div>
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
              return <span key={t} style={{ fontFamily:"'VT323', monospace", fontSize:20, color: held ? tier.accent : "rgba(255,255,255,0.2)", lineHeight:1 }}>{held ? "■" : "◇"}</span>
            })}
          </div>
          <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:GOLD, whiteSpace:"nowrap" }}>{have6} / 6 TIERS</div>
          {have6 === 6 && (
            <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:"#4466ff", animation:"badgePulse 1.2s infinite" }}>
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
                fontFamily:"'Press Start 2P', monospace", fontSize:8,
                color:"rgba(255,255,255,0.55)", textAlign:"center",
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
            mintStatus={mintStatus}
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
                  fontSize: active ? 10 : 8,
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
                  {p.id==="mint"  && <VRFMintPanel onMint={handleMint} windowOpen={windowOpen} windowInfo={windowInfo} mintStatus={mintStatus} slots={slots} prizePool={prizePool} address={address} refetchAll={refetchAll} blocks={blocks} mintPrice={mintPrice} mintPriceWei={mintPriceWei} currentBatch={currentBatch} userCapReached={userCapReached} userMintsRemaining={userMintsRemaining} userMintedThisWindow={userMintedThisWindow} perUserCap={perUserCap} seasonWon={seasonWon} />}
                  {p.id==="forge" && <ForgePanel blocks={blocks} onForge={handleForge} address={address} />}
                  {p.id==="trade" && <TradePanel refetchAll={refetchAll} onRevealTier={(tier) => setRevealTier(tier)} />}
                  {p.id==="rewards" && <RewardsPanel address={address} blocks={blocks} currentBatch={currentBatch} />}
                </div>
              </div>
            )
          })()}
        </div>

      </div>
    </div>
  );
}

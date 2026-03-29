import { useSafeWrite } from '../hooks/useSafeWrite'
import { useState, useEffect, useRef, useCallback } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain, useReadContracts, useAccount, useConnect } from 'wagmi';
import { parseEther, decodeEventLog } from 'viem';
import { CONTRACTS, BASE_SEPOLIA_RPC } from '../config/wagmi';
import { TOKEN_ABI, WINDOW_ABI } from '../abis';
import {
  GOLD, GOLD_DK, GOLD_LT, INK, CREAM,
  BATCH_PRICES_ETH, BATCH_SUPPLY,
} from '../config/design-tokens';
import { Btn, TxErrorPanel, VRFStatusHeader } from '../components/GameUI';
import PrizePoolDisplay from '../components/PrizePoolDisplay';
import VRFDrumRoll from '../components/VRFDrumRoll';

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
          return
        }
      } catch {}
    }
    // Event decode failed — try reading pending requests from chain
    async function fallbackRecover() {
      try {
        const { createPublicClient, http } = await import('viem')
        const { baseSepolia } = await import('viem/chains')
        const client = createPublicClient({ chain: baseSepolia, transport: http(BASE_SEPOLIA_RPC) })
        const reqIds = await client.readContract({
          address: CONTRACTS.TOKEN, chainId: 84532, abi: TOKEN_ABI,
          functionName: 'getPendingRequests', args: [receipt.from],
        })
        if (reqIds && reqIds.length > 0) {
          onRequestId(item.id, reqIds[reqIds.length - 1].toString())
        }
      } catch {}
    }
    fallbackRecover()
  }, [receipt])

  const { writeContract: writeCancel } = useSafeWrite()

  function doCancel() {
    if (!item.requestId || cancelling) return
    setCancelling(true)
    writeCancel({
      address: CONTRACTS.TOKEN, chainId: 84532,
      abi: TOKEN_ABI,
      functionName: "cancelMintRequest",
      args: [BigInt(item.requestId)],
      gas: BigInt(200_000),
    }, {
      onSuccess: () => onDelivered(item.id),
      onError: () => setCancelling(false),
    })
  }

  const isDelivered = item.status === "delivered"

  useEffect(() => {
    if (!isDelivered) return
    const t = setTimeout(() => onDelivered(item.id), 60_000)
    return () => clearTimeout(t)
  }, [isDelivered])

  const canCancel = !isDelivered && elapsed >= 3600 && !!item.requestId
  const missingRequestId = !isDelivered && elapsed >= 3600 && !item.requestId
  const cancelLabel = cancelling ? "…" : elapsed >= 3600 ? "CANCEL" : fmt(3600 - elapsed)

  return (
    <div style={{
      display:"flex", flexDirection:"column", gap:4,
      background: isDelivered ? "rgba(110,255,138,0.06)" : "rgba(0,0,0,0.3)",
      border: `1px solid ${isDelivered ? "rgba(110,255,138,0.2)" : canCancel ? "rgba(255,100,100,0.25)" : "rgba(255,255,255,0.08)"}`,
      padding:"6px 10px",
    }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8,
          color: isDelivered ? "#6eff8a" : canCancel ? "#ff6666" : "#ffcc33",
          minWidth:8,
        }}>
          {isDelivered ? "✓" : canCancel ? "!" : "◌"}
        </span>
        <span style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color:"rgba(255,255,255,0.35)", flex:1 }}>
          {item.txHash ? item.txHash.slice(0,8)+"…"+item.txHash.slice(-4) : "—"}
        </span>
        <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:"rgba(255,255,255,0.4)" }}>
          x{item.qty}
        </span>
        {item.ethStuck && (
          <span style={{ fontFamily:"'VT323', monospace", fontSize:16, color:"#ff6666" }}>
            Ξ{parseFloat(item.ethStuck).toFixed(4)}
          </span>
        )}
        <span style={{ fontFamily:"'VT323', monospace", fontSize:18,
          color: isDelivered ? "#6eff8a" : canCancel ? "#ff6666" : "rgba(255,255,255,0.5)",
          minWidth:44, textAlign:"right",
        }}>
          {isDelivered ? "DONE" : fmt(elapsed)}
        </span>
        {isDelivered && (
          <button onClick={() => onDelivered(item.id)} style={{
            background:"none", border:"none", color:"rgba(255,255,255,0.3)",
            cursor:"pointer", fontFamily:"'Press Start 2P', monospace", fontSize:8, padding:"0 4px",
          }}>x</button>
        )}
      </div>
      {!isDelivered && (
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          {missingRequestId ? (
            <button
              onClick={() => window.location.reload()}
              style={{
                flex:1,
                background: "rgba(255,170,0,0.12)",
                border: "1px solid rgba(255,170,0,0.35)",
                color: "#ffaa00",
                fontFamily:"'Press Start 2P', monospace", fontSize:8,
                padding:"4px 8px", cursor: "pointer",
              }}
            >
              REFRESH PAGE TO ENABLE CANCEL
            </button>
          ) : (
            <button
              onClick={doCancel}
              disabled={!canCancel || cancelling}
              style={{
                flex:1,
                background: canCancel ? "rgba(255,80,80,0.12)" : "rgba(0,0,0,0.2)",
                border: `1px solid ${canCancel ? "rgba(255,80,80,0.35)" : "rgba(255,255,255,0.08)"}`,
                color: canCancel ? "#ff6666" : "rgba(255,255,255,0.2)",
                fontFamily:"'Press Start 2P', monospace", fontSize:8,
                padding:"4px 8px", cursor: canCancel ? "pointer" : "default",
              }}
            >
              {canCancel ? `✕ REFUND${item.ethStuck ? ` Ξ${parseFloat(item.ethStuck).toFixed(4)}` : ' ETH'}` : `CANCEL IN ${cancelLabel}`}
            </button>
          )}
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

const TARGET_CHAIN_ID = 84532 // Base Sepolia

export default function VRFMintPanel({ onMint, windowOpen, windowInfo, mintStatus, slots, prizePool, address, refetchAll, blocks, mintPrice, mintPriceWei, currentBatch, userCapReached, userMintsRemaining, userMintedThisWindow, perUserCap }) {
  const { isConnected: walletConnected } = useAccount()
  const { connectors, connect } = useConnect()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const wrongNetwork = chainId !== TARGET_CHAIN_ID

  // Read batch totalMinted for all batches up to current
  const batchContracts = Array.from({ length: Math.min(currentBatch + 1, 10) }, (_, i) => ({
    address: CONTRACTS.WINDOW, chainId: 84532, abi: WINDOW_ABI,
    functionName: 'batches', args: [BigInt(i + 1)],
  }))
  const { data: batchDataRaw } = useReadContracts({
    contracts: batchContracts,
    query: { refetchInterval: 30_000 },
  })
  const batchMinted = {}
  if (batchDataRaw) {
    batchDataRaw.forEach((r, i) => {
      if (r.status === 'success') batchMinted[i + 1] = Number(r.result[2])
    })
  }

  // VRF callback gas cap: actual gas ~28k/block, not the 3k in the contract constant.
  // (2,500,000 - 150,000) / 28,000 ≈ 83 — use 80 as safe max until contract redeploy.
  const VRF_SAFE_MAX = 80
  const maxMintable = userMintsRemaining != null ? Math.min(VRF_SAFE_MAX, userMintsRemaining) : VRF_SAFE_MAX
  const [qty, setQty] = useState(Math.min(10, maxMintable))
  const [pendingMints, setPendingMints] = useState(() => loadPending())
  const [mintError, setMintError] = useState(null)
  const [, setTick] = useState(0)
  const [drumRollActive, setDrumRollActive] = useState(false)
  const [drumRollFulfilled, setDrumRollFulfilled] = useState(false)
  const prevBlocksRef = useRef(null)
  const pollRef = useRef(null)

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Detect mint delivery by ANY tier balance increase (not just T7)
  // A mint can produce 0 T7 blocks, so watching only T7 would miss deliveries
  useEffect(() => {
    const hasPending = pendingMints.some(m => m.status === "pending")
    if (!hasPending) return
    const totalNow = blocks ? [2,3,4,5,6,7].reduce((s, t) => s + (blocks[t] || 0), 0) : 0
    if (prevBlocksRef.current !== null && totalNow > prevBlocksRef.current) {
      setPendingMints(prev => {
        const next = [...prev]
        const idx = next.findIndex(m => m.status === "pending")
        if (idx !== -1) next[idx] = { ...next[idx], status: "delivered" }
        savePending(next)
        return next
      })
      // Trigger drum roll release → shatter → then hand off to card flip
      if (drumRollActive) {
        setDrumRollFulfilled(true)
      } else {
        setTimeout(() => onMint(), 500)
      }
    }
    prevBlocksRef.current = totalNow
  }, [blocks]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── On-chain recovery: sync localStorage with actual pending requests ─────
  // Runs on mount AND periodically (every 15s) while any pending mints exist.
  // This ensures stuck mints are always detected even if the first attempt
  // failed (RPC error) or if requestIds were missing.
  const recoveryRunning = useRef(false)
  const recoveryTimerRef = useRef(null)

  const runRecovery = useCallback(async () => {
    if (!address || recoveryRunning.current) return
    recoveryRunning.current = true
    try {
      const { createPublicClient, http, formatEther } = await import('viem')
      const { baseSepolia } = await import('viem/chains')
      const client = createPublicClient({ chain: baseSepolia, transport: http(BASE_SEPOLIA_RPC) })
      const requestIds = await client.readContract({
        address: CONTRACTS.TOKEN, chainId: 84532, abi: TOKEN_ABI,
        functionName: 'getPendingRequests', args: [address],
      })
      const onChainIds = new Set((requestIds || []).map(r => r.toString()))
      const existing = loadPending()

      // Clean up stale localStorage entries whose requests no longer exist on-chain
      const cleaned = existing.filter(m => {
        if (!m.requestId) {
          // Items without requestId older than 2 min that aren't on-chain: remove them
          // (tx probably failed or was never confirmed)
          if (m.status === 'pending' && (Date.now() - m.startTime) > 120_000) return false
          return true
        }
        if (m.status === 'delivered') return true
        return onChainIds.has(m.requestId) // only keep if still pending on-chain
      })

      // Add any on-chain requests not yet in localStorage
      const existingReqIds = new Set(cleaned.map(m => m.requestId).filter(Boolean))
      const toAdd = []
      for (const rid of (requestIds || [])) {
        const ridStr = rid.toString()
        if (existingReqIds.has(ridStr)) continue
        const req = await client.readContract({
          address: CONTRACTS.TOKEN, chainId: 84532, abi: TOKEN_ABI,
          functionName: 'vrfMintRequests', args: [rid],
        })
        // vrfMintRequests returns tuple: [player, quantity, amountPaid, requestedAt, windowDay]
        const player = req[0] || req.player
        const quantity = req[1] || req.quantity
        const amountPaid = req[2] || req.amountPaid
        const requestedAt = req[3] || req.requestedAt
        if (!player || player === '0x0000000000000000000000000000000000000000' || player.toLowerCase() !== address.toLowerCase()) continue
        toAdd.push({
          id: 'recovered_' + ridStr,
          txHash: null,
          qty: Number(quantity),
          startTime: Number(requestedAt) * 1000,
          status: 'pending',
          requestId: ridStr,
          ethStuck: formatEther(amountPaid),
        })
      }

      // Also populate requestId for any localStorage items missing it
      // by matching them against on-chain requests
      const updatedCleaned = cleaned.map(m => {
        if (m.requestId || m.status !== 'pending') return m
        // Try to match by timestamp proximity (within 60s)
        for (const rid of (requestIds || [])) {
          const ridStr = rid.toString()
          if (existingReqIds.has(ridStr)) continue
          // Already being added as new — skip
          if (toAdd.some(a => a.requestId === ridStr)) continue
        }
        return m
      })

      const final = [...updatedCleaned, ...toAdd]
      savePending(final)
      setPendingMints(final)
    } catch (e) {
      console.warn('VRF recovery failed:', e)
    } finally {
      recoveryRunning.current = false
    }
  }, [address])

  // Run recovery on mount
  useEffect(() => {
    if (address) runRecovery()
  }, [address]) // eslint-disable-line react-hooks/exhaustive-deps

  // Run recovery periodically while there are pending mints
  useEffect(() => {
    const hasPending = pendingMints.some(m => m.status === 'pending')
    if (hasPending && address) {
      if (!recoveryTimerRef.current) {
        recoveryTimerRef.current = setInterval(() => runRecovery(), 15_000)
      }
    } else {
      clearInterval(recoveryTimerRef.current)
      recoveryTimerRef.current = null
    }
    return () => { clearInterval(recoveryTimerRef.current); recoveryTimerRef.current = null }
  }, [pendingMints, address, runRecovery])


  const { writeContract: writeMint } = useSafeWrite()
  const { writeContract: writeRefund } = useSafeWrite()
  const total = (qty * mintPrice).toFixed(5)

  // Only block minting briefly (90s) after submitting a new mint to prevent double-clicks.
  // Stuck mints (>90s) should NEVER block the player from minting again.
  // The contract allows multiple concurrent VRF requests.
  const hasPendingVRF = pendingMints.some(m => m.status === 'pending' && (Date.now() - m.startTime) < 90_000)

  // ── Batch refund state ──────────────────────────────────────────────────
  const [refunding, setRefunding] = useState(false)
  const [refundProgress, setRefundProgress] = useState({ current: 0, total: 0 })
  const [refundError, setRefundError] = useState(null)
  const refundQueueRef = useRef([])
  const refundCancelledRef = useRef(false)

  function stopBatchRefund() {
    refundCancelledRef.current = true
    refundQueueRef.current = []
    setRefunding(false)
    setRefundProgress({ current: 0, total: 0 })
  }

  const processNextRefund = useCallback(async () => {
    // Check if user cancelled the batch
    if (refundCancelledRef.current) return

    const queue = refundQueueRef.current
    if (queue.length === 0) {
      setRefunding(false)
      setRefundProgress({ current: 0, total: 0 })
      return
    }
    const item = queue[0]
    const stepNum = refundProgress.total - queue.length + 1
    setRefundProgress(prev => ({ ...prev, current: prev.total - queue.length + 1 }))
    writeRefund({
      address: CONTRACTS.TOKEN, chainId: 84532,
      abi: TOKEN_ABI,
      functionName: "cancelMintRequest",
      args: [BigInt(item.requestId)],
      gas: BigInt(200_000),
    }, {
      onSuccess: async (hash) => {
        // User may have cancelled while we were waiting for wallet
        if (refundCancelledRef.current) return
        try {
          const { createPublicClient, http } = await import('viem')
          const { baseSepolia } = await import('viem/chains')
          const client = createPublicClient({ chain: baseSepolia, transport: http(BASE_SEPOLIA_RPC) })
          await client.waitForTransactionReceipt({ hash })
        } catch {} // If receipt polling fails, still proceed — tx was sent
        if (refundCancelledRef.current) return
        dismissItem(item.id)
        refundQueueRef.current = queue.slice(1)
        processNextRefund()
      },
      onError: (err) => {
        if (refundCancelledRef.current) return
        setRefundError(`Failed on refund ${stepNum} of ${refundProgress.total}: ${err?.shortMessage || err?.message || 'Transaction rejected'}`)
        setRefunding(false)
      },
    })
  }, [writeRefund, dismissItem]) // eslint-disable-line react-hooks/exhaustive-deps

  function startBatchRefund() {
    const stuck = pendingMints.filter(
      m => m.status === 'pending' && m.requestId && (Date.now() - m.startTime) > 3600_000
    )
    if (stuck.length === 0) return
    refundCancelledRef.current = false
    refundQueueRef.current = stuck
    setRefundError(null)
    setRefunding(true)
    setRefundProgress({ current: 1, total: stuck.length })
    processNextRefund()
  }

  function doMint() {
    if (!windowOpen || hasPendingVRF) return
    // Snapshot total balance across all tiers for delivery detection
    prevBlocksRef.current = blocks ? [2,3,4,5,6,7].reduce((s, t) => s + (blocks[t] || 0), 0) : 0
    writeMint({
      address: CONTRACTS.TOKEN, chainId: 84532,
      abi: TOKEN_ABI,
      functionName: "mint",
      args: [BigInt(qty)],
      value: mintPriceWei * BigInt(qty),
      gas: BigInt(500_000) + BigInt(qty) * BigInt(30_000),
    }, {
      onSuccess: (hash) => {
        setMintError(null)
        setDrumRollActive(true)
        setDrumRollFulfilled(false)
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
  let timerLabel = ""
  let timerSub = ""
  const onCooldown = mintStatus?.cooldownUntil > 0 && mintStatus.cooldownUntil > now
  const dailyCapHit = mintStatus && mintStatus.dailyMints >= mintStatus.dailyCap && mintStatus.dailyResetsAt > now
  if (onCooldown) {
    const secs = Math.max(0, mintStatus.cooldownUntil - now)
    const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60), s = secs%60
    timerLabel = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
    timerSub = "COOLDOWN ENDS"
  } else if (dailyCapHit) {
    const secs = Math.max(0, mintStatus.dailyResetsAt - now)
    const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60), s = secs%60
    timerLabel = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
    timerSub = "DAILY CAP RESETS"
  }

  return (
    <div className="mint-panel-layout" style={{ display:"flex", gap:20, height:"100%" }}>
      {/* LEFT COLUMN (60%): Action */}
      <div style={{ flex:"0 0 60%", display:"flex", flexDirection:"column", gap:10 }}>

        {/* VRF Drum Roll — replaces mint controls while charging */}
        {drumRollActive && (
          <VRFDrumRoll
            mode="mint"
            chargeColor={GOLD}
            fulfilled={drumRollFulfilled}
            onReleaseDone={() => {
              setDrumRollActive(false)
              setDrumRollFulfilled(false)
              onMint()
            }}
          />
        )}

        {drumRollActive ? null : (<>
        {/* — Normal mint UI below (hidden during drum roll) — */}

        {/* Stuck ETH recovery banner with batch refund */}
        {(() => {
          const stuckWithId = pendingMints.filter(m => m.status === 'pending' && m.requestId && (Date.now() - m.startTime) > 3600_000)
          const stuckNoId = pendingMints.filter(m => m.status === 'pending' && !m.requestId && (Date.now() - m.startTime) > 3600_000)
          const stuck = stuckWithId // refundable items (have requestId)
          const totalStuck = stuckWithId.length + stuckNoId.length
          if (totalStuck === 0 && !refunding) return null
          const totalEth = stuck.reduce((sum, m) => sum + parseFloat(m.ethStuck || 0), 0)
          return (
            <div style={{
              background:"rgba(255,80,80,0.10)", border:"1px solid rgba(255,80,80,0.4)",
              padding:"14px 16px", display:"flex", flexDirection:"column", gap:10,
            }}>
              <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:10, color:"#ff6666", letterSpacing:1 }}>
                {totalEth > 0 ? `${totalEth.toFixed(4)} ETH` : ''} REFUND AVAILABLE
              </div>
              <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:12, color:"rgba(255,255,255,0.6)", lineHeight:1.6 }}>
                You have <strong style={{ color:"#fff" }}>{totalStuck} stuck mint{totalStuck !== 1 ? 's' : ''}</strong>.
                {stuck.length > 0
                  ? stuck.length > 1
                    ? ` You will need to approve ${stuck.length} refund transactions to receive all your ETH back.`
                    : ' Approve the refund transaction to receive your ETH back.'
                  : ' Recovering request data from chain...'}
              </div>
              {stuckNoId.length > 0 && (
                <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color:"#ffaa00", lineHeight:1.5 }}>
                  {stuckNoId.length} mint{stuckNoId.length !== 1 ? 's' : ''} still syncing — recovery runs automatically every 15s.
                </div>
              )}
              <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color:"rgba(255,255,255,0.35)", lineHeight:1.5 }}>
                We regret the inconvenience and are working on a simpler refund flow for the future.
              </div>
              {refunding ? (
                <div style={{
                  display:"flex", flexDirection:"column", gap:6,
                }}>
                  <div style={{
                    height:6, background:"rgba(0,0,0,0.4)", borderRadius:3, overflow:"hidden",
                  }}>
                    <div style={{
                      height:"100%", borderRadius:3,
                      width:`${(refundProgress.current / refundProgress.total) * 100}%`,
                      background:"#6eff8a", transition:"width 0.3s",
                    }} />
                  </div>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:"rgba(255,255,255,0.5)" }}>
                      REFUND {refundProgress.current} OF {refundProgress.total} — APPROVE IN WALLET
                    </div>
                    <button
                      onClick={stopBatchRefund}
                      style={{
                        background:"none", border:"1px solid rgba(255,255,255,0.2)",
                        color:"rgba(255,255,255,0.5)", fontFamily:"'Press Start 2P', monospace",
                        fontSize:7, padding:"3px 8px", cursor:"pointer",
                      }}
                    >
                      STOP
                    </button>
                  </div>
                  <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:10, color:"rgba(255,255,255,0.3)" }}>
                    You can stop at any time. Completed refunds are already in your wallet.
                  </div>
                </div>
              ) : (
                <button
                  onClick={startBatchRefund}
                  disabled={stuck.length === 0}
                  style={{
                    width:"100%", padding:"12px 16px",
                    background:"rgba(255,80,80,0.15)", border:"2px solid rgba(255,80,80,0.5)",
                    color:"#ff6666", fontFamily:"'Press Start 2P', monospace", fontSize:10,
                    cursor: stuck.length > 0 ? "pointer" : "default", letterSpacing:1,
                  }}
                >
                  REFUND ALL — {totalEth.toFixed(4)} ETH ({stuck.length} transaction{stuck.length !== 1 ? 's' : ''})
                </button>
              )}
              {refundError && (
                <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color:"#ff8888", lineHeight:1.4 }}>
                  {refundError}
                  <span
                    onClick={() => {
                      setRefundError(null)
                      setRefunding(true)
                      processNextRefund()
                    }}
                    style={{ color:"#ffcc33", cursor:"pointer", marginLeft:8, textDecoration:"underline" }}
                  >
                    Retry
                  </span>
                </div>
              )}
            </div>
          )
        })()}

        {mintError && (
          <TxErrorPanel error={mintError} context="mint" onRetry={() => setMintError(null)} />
        )}
        {/* Mint status */}
        <div style={{
          display:"flex", justifyContent:"space-between", alignItems:"center",
          background: windowOpen ? "rgba(110,255,138,0.08)" : "rgba(255,80,80,0.08)",
          border: `1px solid ${windowOpen ? "#6eff8a44" : "#ff505044"}`,
          padding:"8px 12px",
        }}>
          <span style={{
            fontFamily:"'Press Start 2P', monospace", fontSize:8,
            color: windowOpen ? "#6eff8a" : "#ff8888",
            animation: windowOpen ? "badgePulse 2s infinite" : "none",
          }}>
            {windowOpen ? "● MINTING OPEN" : onCooldown ? "⏳ COOLDOWN" : "⏳ DAILY CAP REACHED"}
          </span>
          <span style={{ fontFamily:"'Courier Prime', monospace", fontSize:12, color:"rgba(255,255,255,0.4)" }}>
            {timerLabel ? `${timerSub.toLowerCase()} in ${timerLabel}` : ""}
          </span>
        </div>

        {/* Quick-set buttons */}
        <div style={{ display:"flex", gap:6 }}>
          {[10, 30, 50, Math.min(slots > 0 ? slots : VRF_SAFE_MAX, maxMintable)].map((v, i) => {
            const label = i === 3 ? "MAX" : String(v)
            const capped = Math.min(v, maxMintable)
            return (
              <button key={label} onClick={() => setQty(Math.min(capped, VRF_SAFE_MAX))} style={{
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
            <button key={d} onClick={() => setQty(q => Math.min(maxMintable, q+d))} style={{
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

        {userCapReached && windowOpen && (
          <div style={{
            background:"rgba(255,80,80,0.1)",
            border:"1px solid rgba(255,80,80,0.3)",
            padding:"8px 12px",
            fontFamily:"'Press Start 2P', monospace", fontSize:8,
            color:"#ff8888", textAlign:"center", lineHeight:1.8,
          }}>
            {onCooldown
              ? <>CYCLE CAP REACHED ({mintStatus?.cycleCap}/{mintStatus?.cycleCap})<br/>Cooldown ends in {timerLabel}</>
              : <>DAILY CAP REACHED ({mintStatus?.dailyCap}/{mintStatus?.dailyCap})<br/>Resets in {timerLabel}</>
            }
          </div>
        )}

        {!walletConnected ? (
          <Btn onClick={() => { const c = connectors[0]; if (c) connect({ connector: c }); }}>
            CONNECT WALLET TO MINT
          </Btn>
        ) : wrongNetwork ? (
          <Btn onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}>
            ⚠  SWITCH TO BASE
          </Btn>
        ) : (
          <Btn onClick={doMint} disabled={!windowOpen || userCapReached || qty < 1 || hasPendingVRF}>
            {hasPendingVRF ? "⏳  MINT IN PROGRESS — WAITING FOR VRF" : userCapReached ? (onCooldown ? "⏳  ON COOLDOWN" : "⏳  DAILY CAP REACHED") : "▶  MINT NOW"}
          </Btn>
        )}

        <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:"rgba(255,255,255,0.45)", textAlign:"center" }}>
          Current price: {mintPrice} Ξ (Batch {currentBatch})
          {windowOpen && !userCapReached && mintStatus?.mintedThisCycle > 0 && (
            <span style={{ color:"#ffcc33" }}> — {userMintsRemaining} left this cycle · {mintStatus?.dailyMints}/{mintStatus?.dailyCap} today</span>
          )}
        </div>
        </>)}
      </div>

      {/* RIGHT COLUMN (40%): Context */}
      <div style={{ flex:"0 0 calc(40% - 20px)", display:"flex", flexDirection:"column", gap:10 }}>
        {/* Batch price ladder */}
        <div style={{ background:"rgba(0,0,0,0.25)", border:"1px solid rgba(255,255,255,0.06)", padding:"8px 10px" }}>
          <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:"rgba(255,255,255,0.45)", letterSpacing:1, marginBottom:6 }}>BATCH PRICES</div>
          <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
            {[1,2,3,4,5,6,7,8,9,10].map(b => {
              const isCurrent = b === currentBatch;
              const isCompleted = b < currentBatch;
              const isNext = b === currentBatch + 1;
              const minted = batchMinted[b] || 0;
              const supply = BATCH_SUPPLY[b] || 0;
              const pct = supply > 0 ? Math.min(Math.round((minted / supply) * 100), 100) : 0;
              const priceIncrease = isNext && BATCH_PRICES_ETH[b] && BATCH_PRICES_ETH[currentBatch]
                ? Math.round(((BATCH_PRICES_ETH[b] - BATCH_PRICES_ETH[currentBatch]) / BATCH_PRICES_ETH[currentBatch]) * 100)
                : 0;
              const barColor = pct >= 80 ? "#ff4433" : pct >= 50 ? "#ffcc33" : "#6eff8a";

              return (
                <div key={b} style={{
                  display:"flex", alignItems:"center", gap:6, padding:"3px 6px",
                  background: isCurrent ? "rgba(200,168,75,0.1)" : isNext ? "rgba(255,170,0,0.04)" : "transparent",
                  border: isCurrent ? `1px solid ${GOLD_DK}` : "1px solid transparent",
                  opacity: isCompleted ? 0.45 : 1,
                  position:"relative", overflow:"hidden", minHeight: isCurrent ? 28 : 'auto',
                }}>
                  {/* Progress bar background for current batch */}
                  {isCurrent && supply > 0 && (
                    <div style={{
                      position:"absolute", left:0, top:0, bottom:0,
                      width:`${pct}%`, background: barColor + "22",
                      transition:"width 0.5s",
                    }} />
                  )}
                  <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color: isCurrent ? GOLD : isNext ? "#ffaa33" : "rgba(255,255,255,0.45)", width:24, position:"relative", zIndex:1 }}>B{b}</span>
                  <span style={{ fontFamily:"'VT323', monospace", fontSize:16, color: isCurrent ? GOLD_LT : isCompleted ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.35)", flex:1, position:"relative", zIndex:1 }}>
                    {BATCH_PRICES_ETH[b]} Ξ
                  </span>
                  {/* Center-aligned % for current batch */}
                  {isCurrent && supply > 0 && (
                    <span style={{
                      position:"absolute", left:0, right:0, textAlign:"center",
                      fontFamily:"'Press Start 2P', monospace", fontSize:7, color: barColor, zIndex:1,
                    }}>{pct}%</span>
                  )}
                  {/* Center-aligned price increase for next batch */}
                  {isNext && (
                    <span style={{
                      position:"absolute", left:0, right:0, textAlign:"center",
                      fontFamily:"'Press Start 2P', monospace", fontSize:6, color:"#ffaa33", zIndex:1,
                    }}>↑ PRICE +{priceIncrease}%</span>
                  )}
                  {isCompleted ? (
                    <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:"#6eff8a", position:"relative", zIndex:1 }}>✓</span>
                  ) : (isNext || isCurrent) ? null : (
                    <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:"rgba(255,255,255,0.45)", position:"relative", zIndex:1 }}>{(supply / 1000).toFixed(0)}K</span>
                  )}
                  {isNext && <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:"rgba(255,255,255,0.35)", position:"relative", zIndex:1, marginLeft:4 }}>{(supply / 1000).toFixed(0)}K</span>}
                  {isCurrent && <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:GOLD, position:"relative", zIndex:1, marginLeft:4 }}>{(supply / 1000).toFixed(0)}K ◄</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Cycle progress bar */}
        {mintStatus && (
          <div style={{ background:"rgba(0,0,0,0.25)", border:"1px solid rgba(255,255,255,0.06)", padding:"8px 10px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:4 }}>
              <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:"rgba(255,255,255,0.45)", letterSpacing:0.5 }}>
                {mintStatus.mintedThisCycle >= mintStatus.cycleCap ? "CYCLE COMPLETE" : "MINTED THIS CYCLE"}
              </span>
              <span style={{ fontFamily:"'VT323', monospace", fontSize:16, color:"rgba(255,255,255,0.5)" }}>
                {mintStatus.mintedThisCycle.toLocaleString()} / {mintStatus.cycleCap.toLocaleString()}
              </span>
            </div>
            <div style={{ height:8, background:"rgba(0,0,0,0.45)", border:"1px solid rgba(255,255,255,0.06)", overflow:"hidden" }}>
              <div style={{
                height:"100%",
                width:`${Math.min((mintStatus.mintedThisCycle / mintStatus.cycleCap) * 100, 100)}%`,
                background: (() => {
                  const pct = (mintStatus.mintedThisCycle / mintStatus.cycleCap) * 100;
                  return pct >= 80 ? "#ff4433" : pct >= 50 ? "#ffcc33" : "#6eff8a";
                })(),
                transition:"width 0.5s, background 0.5s",
              }} />
            </div>
            {mintStatus.dailyMints > 0 && (
              <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:7, color:"rgba(255,255,255,0.3)", marginTop:4 }}>
                TODAY: {mintStatus.dailyMints.toLocaleString()} / {mintStatus.dailyCap.toLocaleString()}
              </div>
            )}
          </div>
        )}

        {/* In-flight mints */}
        {pendingMints.length > 0 && (
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:"rgba(255,255,255,0.45)", marginBottom:2 }}>
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

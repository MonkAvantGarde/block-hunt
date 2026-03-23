import { useState, useEffect, useRef } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain } from 'wagmi';
import { parseEther, decodeEventLog } from 'viem';
import { CONTRACTS } from '../config/wagmi';
import { TOKEN_ABI } from '../abis';
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
        const client = createPublicClient({ chain: baseSepolia, transport: http() })
        const reqIds = await client.readContract({
          address: CONTRACTS.TOKEN, abi: TOKEN_ABI,
          functionName: 'getPendingRequests', args: [receipt.from],
        })
        if (reqIds && reqIds.length > 0) {
          onRequestId(item.id, reqIds[reqIds.length - 1].toString())
        }
      } catch {}
    }
    fallbackRecover()
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
              {canCancel ? `✕ ${cancelLabel} — REFUND ETH` : `CANCEL IN ${cancelLabel}`}
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
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const wrongNetwork = chainId !== TARGET_CHAIN_ID
  const maxMintable = userMintsRemaining != null ? Math.min(500, userMintsRemaining) : 500
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
      // Trigger drum roll release → shatter → then hand off to card flip
      if (drumRollActive) {
        setDrumRollFulfilled(true)
      } else {
        setTimeout(() => onMint(), 500)
      }
    }
    prevBlocksRef.current = t7
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
          {[10, 50, 100, Math.min(slots > 0 ? slots : 500, maxMintable)].map((v, i) => {
            const label = i === 3 ? "MAX" : String(v)
            const capped = Math.min(v, maxMintable)
            return (
              <button key={label} onClick={() => setQty(Math.min(capped, 500))} style={{
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

        {wrongNetwork ? (
          <Btn onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}>
            ⚠  SWITCH TO BASE
          </Btn>
        ) : (
          <Btn onClick={doMint} disabled={!windowOpen || userCapReached || qty < 1}>
            {userCapReached ? (onCooldown ? "⏳  ON COOLDOWN" : "⏳  DAILY CAP REACHED") : "▶  MINT NOW"}
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
              return (
                <div key={b} style={{
                  display:"flex", alignItems:"center", gap:6, padding:"3px 6px",
                  background: isCurrent ? "rgba(200,168,75,0.1)" : "transparent",
                  border: isCurrent ? `1px solid ${GOLD_DK}` : "1px solid transparent",
                }}>
                  <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color: isCurrent ? GOLD : "rgba(255,255,255,0.45)", width:18 }}>B{b}</span>
                  <span style={{ fontFamily:"'VT323', monospace", fontSize:16, color: isCurrent ? GOLD_LT : "rgba(255,255,255,0.35)", flex:1 }}>{BATCH_PRICES_ETH[b]} Ξ</span>
                  <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color: isCurrent ? GOLD : "rgba(255,255,255,0.45)" }}>{(BATCH_SUPPLY[b] / 1000).toFixed(0)}K</span>
                  {isCurrent && <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:GOLD }}>◄</span>}
                </div>
              );
            })}
          </div>
          <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:"rgba(255,255,255,0.45)", marginTop:6, lineHeight:1.6 }}>
            Batch 1 is the cheapest entry. Prices rise as batches advance.
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

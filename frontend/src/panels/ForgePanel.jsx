import { useState, useEffect, useRef } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain } from 'wagmi';
import { CONTRACTS } from '../config/wagmi';
import { FORGE_ABI } from '../abis';
import { GOLD, INK, CREAM, TMAP, COMBINE_RATIOS } from '../config/design-tokens';
import { CARD_IMAGES } from '../components/TierCard';
import { VRF, Btn, TxErrorPanel, VRFStatusHeader } from '../components/GameUI';
import ForgeNumberReveal from '../components/ForgeNumberReveal';

const TARGET_CHAIN_ID = 84532 // Base Sepolia

export default function ForgePanel({ blocks, onForge, address }) {
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const wrongNetwork = chainId !== TARGET_CHAIN_ID
  const [selTier,   setSelTier]     = useState(null)
  const [burnCount, setBurn]        = useState(10)
  const [vrfState,  setVrfState]    = useState(VRF.IDLE)
  const [forgeResult, setForgeResult] = useState(null)
  const [showNumberReveal, setShowNumberReveal] = useState(false)
  const [elapsed,   setElapsed]     = useState(0)
  const [forgeTxHash, setForgeTxHash] = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [forgeError, setForgeError]   = useState(null)
  const [batchMode, setBatchMode]   = useState(false)
  const [batchAttempts, setBatchAttempts] = useState([])
  const intervalRef = useRef(null)
  const autoRef     = useRef(null)
  const pollRef     = useRef(null)
  const forgeBlockRef = useRef(null)

  const { writeContract } = useWriteContract()

  const sel     = selTier ? TMAP[selTier]     : null
  const target  = selTier ? TMAP[selTier - 1] : null
  const maxBurn = selTier ? Math.min(blocks[selTier] || 0, COMBINE_RATIOS[selTier] || 21) : 20

  function startClock() {
    setElapsed(0)
    intervalRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
  }
  function stopClock() { clearInterval(intervalRef.current) }
  function fmt(s) {
    const m = Math.floor(s / 60), sec = s % 60
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  }

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
          setShowNumberReveal(false)
          setVrfState(VRF.DELIVERED)
          onForge()
        }
      } catch (e) {
        console.warn('Forge poll error:', e)
      }
    }

    pollRef.current = setInterval(checkForgeResult, 4_000)
    setTimeout(checkForgeResult, 2_000)

    return () => { clearInterval(pollRef.current); pollRef.current = null }
  }, [vrfState, address])

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
      gas: BigInt(300_000),
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
      gas: BigInt(300_000) + BigInt(fromTiers.length) * BigInt(150_000),
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
    setShowNumberReveal(false)
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
            <span style={{color:'rgba(255,255,255,0.45)'}}>TX </span>
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
          <span style={{color:'rgba(255,80,80,0.6)', fontFamily:"'Press Start 2P', monospace", fontSize:8, marginTop:4, display:'block'}}>
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
          fontFamily:"'Press Start 2P', monospace", fontSize:8, color:'#ff8888', lineHeight:2.4,
        }}>
          VRF RESPONSE TIMED OUT<br/>
          <span style={{color:'rgba(255,255,255,0.4)', fontFamily:"'Courier Prime', monospace", fontSize:11}}>
            Your blocks are burned. Contact support if this persists.
          </span>
        </div>
        <button onClick={reset} style={{
          marginTop:'auto',
          fontFamily:"'Press Start 2P', monospace", fontSize:8, letterSpacing:1,
          background:'rgba(255,255,255,0.06)', color:CREAM,
          border:'1px solid rgba(255,255,255,0.15)', padding:'10px', cursor:'pointer',
        }}>← BACK TO FORGE</button>
      </div>
    )
  }

  // Show ForgeNumberReveal spinner before final result
  if (vrfState === VRF.DELIVERED && forgeResult && showNumberReveal) {
    const ratio = COMBINE_RATIOS[forgeResult.fromTier] || 21
    const neededPct = Math.min(Math.round((burnCount / ratio) * 100), 100)
    // Generate a fake roll for display purposes
    const rolledPct = forgeResult.success
      ? Math.max(1, Math.floor(Math.random() * neededPct))
      : Math.min(100, neededPct + Math.floor(Math.random() * 8) + 1)
    return (
      <ForgeNumberReveal
        rolledPct={rolledPct}
        neededPct={neededPct}
        success={forgeResult.success}
        fromTier={forgeResult.fromTier}
        onComplete={() => setShowNumberReveal(false)}
      />
    )
  }

  if (vrfState === VRF.DELIVERED && forgeResult) {
    const ratio = COMBINE_RATIOS[forgeResult.fromTier] || 21
    const pct = Math.min(Math.round((burnCount / ratio) * 100), 100)
    const targetTier = forgeResult.fromTier - 1
    const targetData = TMAP[targetTier]
    const sourceData = TMAP[forgeResult.fromTier]

    const nearMiss = !forgeResult.success && pct >= 40
    const fakeRoll = !forgeResult.success ? pct + Math.floor(Math.random() * 8) + 1 : 0
    const missBy = !forgeResult.success ? Math.max(1, fakeRoll - pct) : 0

    if (forgeResult.success) {
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

            {targetTier <= 3 && (
              <button
                onClick={() => {
                  const text = `I just forged ${targetData?.name} (${targetData?.label}) in @TheBlockHunt! Burned ${burnCount} blocks at ${pct}% odds.`
                  window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
                }}
                style={{
                  height:44, width:160,
                  fontFamily:"'Press Start 2P', monospace", fontSize:8, letterSpacing:1,
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

          <div style={{
            background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.08)',
            padding:'14px 20px', textAlign:'center', width:'100%', maxWidth:300,
          }}>
            <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:'rgba(255,255,255,0.35)', marginBottom:8 }}>
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
                fontFamily:"'Press Start 2P', monospace", fontSize:9,
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
        <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:'rgba(255,255,255,0.4)', letterSpacing:1 }}>
          {batchMode ? '⚡ BATCH FORGE' : 'SELECT TIER TO FORGE'}
        </div>
        <button
          onClick={() => { setBatchMode(m => !m); setBatchAttempts([]); setSelTier(null) }}
          style={{
            fontFamily:"'Press Start 2P', monospace", fontSize:8,
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
              <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:9, color: selected ? t.accent : 'rgba(255,255,255,0.7)' }}>T{tid}</div>
              <div style={{ fontFamily:"'VT323', monospace", fontSize:20, color: selected ? t.accent : 'rgba(255,255,255,0.4)' }}>×{count}</div>
            </button>
          )
        })}
      </div>

      {selTier && sel && target ? (
        <>
          {(() => {
            const ratio = COMBINE_RATIOS[selTier] || 21;
            const pct = Math.min(Math.round((burnCount / ratio) * 100), 100);
            const holdAfter = (blocks[selTier] || 0) - burnCount;
            return (
              <div className="forge-layout" style={{ display:'flex', gap:16 }}>
                {/* LEFT: Controls */}
                <div style={{ flex:'0 0 55%', display:'flex', flexDirection:'column', gap:10 }}>
                  <div style={{ background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.08)', padding:'10px 12px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                      <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:'rgba(255,255,255,0.4)' }}>BURN COUNT</span>
                      <span style={{ fontFamily:"'VT323', monospace", fontSize:24, color:sel.accent }}>{burnCount}</span>
                    </div>
                    <input type="range" min={10} max={maxBurn} value={burnCount}
                      onChange={e => setBurn(parseInt(e.target.value))}
                      style={{ width:'100%', accentColor:sel.accent }} />
                    <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
                      <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:'rgba(255,255,255,0.45)' }}>10 = {Math.round((10 / ratio) * 100)}%</span>
                      <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:'rgba(255,255,255,0.45)' }}>{maxBurn} = {Math.min(Math.round((maxBurn / ratio) * 100), 100)}%</span>
                    </div>
                  </div>

                  <div style={{ background:'rgba(0,0,0,0.2)', border:'1px solid rgba(255,255,255,0.06)', padding:'8px 12px' }}>
                    <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:'rgba(255,255,255,0.35)', marginBottom:4 }}>HOLDINGS IMPACT</div>
                    <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:12, color:'rgba(255,255,255,0.5)', lineHeight:1.6 }}>
                      You hold: <span style={{color:sel.accent}}>{blocks[selTier] || 0}</span> {sel.short}<br/>
                      After forge: <span style={{color:'#ff6644'}}>{holdAfter}</span> {sel.short} (-{burnCount})
                    </div>
                  </div>

                  <div style={{
                    background:'rgba(255,50,30,0.06)', border:'1px solid rgba(255,50,30,0.2)',
                    padding:'8px 12px',
                    fontFamily:"'Press Start 2P', monospace", fontSize:8, color:'rgba(255,80,80,0.7)', lineHeight:1.8,
                  }}>
                    ⚠ {burnCount}× {sel.name} burned whether you win or lose
                  </div>

                  {batchMode ? (
                    <Btn onClick={addBatchAttempt} color="#9933cc">
                      + ADD ATTEMPT  ({pct}%)
                    </Btn>
                  ) : showConfirm ? (
                    <div style={{
                      background:'rgba(255,50,30,0.08)', border:'1px solid rgba(255,50,30,0.3)',
                      padding:'12px', textAlign:'center',
                    }}>
                      <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:'#ff8888', marginBottom:8 }}>
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
                  ) : wrongNetwork ? (
                    <Btn onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}>
                      ⚠  SWITCH TO BASE
                    </Btn>
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
                  <div style={{ display:'flex', alignItems:'center', gap:10, width:'100%', justifyContent:'center' }}>
                    <div style={{
                      width:100, height:100, background:sel.bg, border:`2px solid ${sel.border}`,
                      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                      boxShadow:`3px 3px 0 ${INK}`,
                    }}>
                      <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:9, color:sel.accent }}>T{selTier}</div>
                      <div style={{ fontFamily:"'VT323', monospace", fontSize:18, color:'rgba(255,255,255,0.5)', marginTop:2 }}>×{burnCount}</div>
                    </div>
                    <div style={{ fontFamily:"'VT323', monospace", fontSize:28, color:'rgba(255,255,255,0.3)' }}>→</div>
                    <div style={{
                      width:100, height:100, background:target.bg, border:`2px solid ${target.border}`,
                      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                      boxShadow:`3px 3px 0 ${INK}`,
                    }}>
                      <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:9, color:target.accent }}>T{selTier - 1}</div>
                      <div style={{ fontFamily:"'VT323', monospace", fontSize:18, color:'rgba(255,255,255,0.5)', marginTop:2 }}>×1</div>
                    </div>
                  </div>

                  <div style={{
                    textAlign:'center', padding:'12px 0',
                    background:'rgba(0,0,0,0.25)', border:`1px solid ${sel.accent}33`,
                    width:'100%',
                  }}>
                    <div style={{ fontFamily:"'VT323', monospace", fontSize:44, color: pct >= 80 ? '#6eff8a' : pct >= 50 ? GOLD : '#ff6644' }}>
                      {pct}%
                    </div>
                    <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:'rgba(255,255,255,0.35)' }}>
                      CHANCE
                    </div>
                  </div>

                  <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:4 }}>
                    <div style={{ background:'rgba(110,255,138,0.06)', border:'1px solid rgba(110,255,138,0.15)', padding:'6px 10px' }}>
                      <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:'#6eff8a' }}>✓ WIN: </span>
                      <span style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color:'rgba(255,255,255,0.5)' }}>+1 {target.name}</span>
                    </div>
                    <div style={{ background:'rgba(255,80,80,0.06)', border:'1px solid rgba(255,80,80,0.15)', padding:'6px 10px' }}>
                      <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:'#ff8888' }}>✗ LOSE: </span>
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
          <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:12, color:'rgba(255,255,255,0.45)', lineHeight:1.6 }}>
            Burn blocks for a chance to upgrade one tier. Higher burn = higher chance.
          </div>

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
                  <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:t.accent, width:22 }}>T{tid}</span>
                  <span style={{ fontFamily:"'VT323', monospace", fontSize:20, color:'rgba(255,255,255,0.5)', width:40 }}>×{count}</span>
                  <span style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color: canForge ? '#6eff8a' : 'rgba(255,255,255,0.3)', flex:1 }}>
                    {canForge ? `Ready — up to ${Math.round((Math.min(count, ratio) / ratio) * 100)}% chance` : `${needed} more needed`}
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{ background:'rgba(0,0,0,0.25)', border:'1px solid rgba(255,255,255,0.06)', padding:'10px 12px' }}>
            <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:'rgba(255,255,255,0.35)', letterSpacing:1, marginBottom:6 }}>
              HOW THE FORGE WORKS
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
              {[
                { from:'T7→T6', ratio:21 },
                { from:'T6→T5', ratio:19 },
                { from:'T5→T4', ratio:17 },
                { from:'T4→T3', ratio:15 },
                { from:'T3→T2', ratio:13 },
              ].map(r => (
                <div key={r.from} style={{ display:'flex', alignItems:'center', gap:8, padding:'2px 0' }}>
                  <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:'rgba(255,255,255,0.45)', width:52 }}>{r.from}</span>
                  <span style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color:'rgba(255,255,255,0.35)' }}>
                    Burn 10-{r.ratio} of {r.ratio} = {Math.round(10/r.ratio*100)}%-100% chance
                  </span>
                </div>
              ))}
            </div>
            <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color:'rgba(255,255,255,0.45)', marginTop:6 }}>
              Burned blocks are destroyed whether you succeed or fail.
            </div>
          </div>
        </div>
      )}

      {/* Batch queue */}
      {batchMode && batchAttempts.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:4 }}>
          <div style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:'rgba(255,255,255,0.35)', letterSpacing:1 }}>
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
                <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:'rgba(255,255,255,0.45)', width:16 }}>#{i+1}</span>
                <span style={{ fontFamily:"'Press Start 2P', monospace", fontSize:8, color:t?.accent || '#fff' }}>T{a.tier} → T{a.tier-1}</span>
                <span style={{ fontFamily:"'VT323', monospace", fontSize:20, color:'rgba(255,255,255,0.5)', flex:1 }}>
                  Burn: {a.burnCount}
                </span>
                <span style={{ fontFamily:"'VT323', monospace", fontSize:20, color: chance >= 80 ? '#6eff8a' : chance >= 50 ? GOLD : '#ff6644' }}>
                  {chance}%
                </span>
                <button onClick={() => removeBatchAttempt(i)} style={{
                  background:'none', border:'1px solid rgba(255,80,80,0.25)',
                  color:'#ff8888', fontFamily:"'Press Start 2P', monospace", fontSize:8,
                  padding:'3px 8px', cursor:'pointer',
                }}>✕</button>
              </div>
            )
          })}
          <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:11, color:'rgba(255,255,255,0.3)' }}>
            Total burn: {batchAttempts.reduce((s, a) => s + a.burnCount, 0)} blocks across {batchAttempts.length} attempt{batchAttempts.length !== 1 ? 's' : ''}
          </div>
          {wrongNetwork ? (
            <Btn onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}>
              ⚠  SWITCH TO BASE
            </Btn>
          ) : (
            <Btn onClick={doBatchForge} color="#9933cc">
              ⚡ FORGE ALL  ({batchAttempts.length} attempt{batchAttempts.length !== 1 ? 's' : ''})
            </Btn>
          )}
        </div>
      )}
    </div>
  )
}

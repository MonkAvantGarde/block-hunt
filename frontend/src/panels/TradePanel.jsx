import { useSafeWrite } from '../hooks/useSafeWrite'
import { useState, useEffect } from 'react'
import { useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain, useAccount, useConnect } from 'wagmi'
import { parseEther } from 'viem'
import { CONTRACTS } from '../config/wagmi'
import { TOKEN_ABI, MARKETPLACE_ABI } from '../abis'
import { GOLD, GOLD_DK, GOLD_LT, INK, CREAM, TMAP, ORANGE } from '../config/design-tokens'
import { Btn } from '../components/GameUI'
import { useTradeData } from '../hooks/useTradeData'
import { useGameState } from '../hooks/useGameState'

const fp = { fontFamily: "'Press Start 2P', monospace" }
const fv = { fontFamily: "'VT323', monospace" }
const TARGET_CHAIN_ID = 84532

function Countdown({ expiresAt }) {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(id)
  }, [])
  const secs = Math.max(0, expiresAt - now)
  if (secs <= 0) return <span style={{ color: '#ff4444' }}>EXPIRED</span>
  const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (d > 0) return <span>{d}d {h}h</span>
  if (h > 0) return <span>{h}h {m}m</span>
  return <span>{m}m {secs % 60}s</span>
}

const stepBtnStyle = {
  width: 28, height: 28, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)',
  color: 'rgba(255,255,255,0.6)', fontFamily: "'Press Start 2P', monospace", fontSize: 8, cursor: 'pointer',
}

const actionBtnStyle = {
  ...fp, fontSize: 7, color: INK, background: GOLD, border: `1px solid ${GOLD_DK}`,
  padding: '6px 10px', cursor: 'pointer', marginLeft: 4,
}

const cancelBtnStyle = {
  ...fp, fontSize: 7, color: '#ff6644', background: 'rgba(255,68,68,0.08)',
  border: '1px solid rgba(255,68,68,0.2)', padding: '6px 10px', cursor: 'pointer',
}

const switchBtnStyle = {
  ...fp, fontSize: 7, color: ORANGE, background: 'rgba(255,168,75,0.08)',
  border: `1px solid ${ORANGE}44`, padding: '6px 10px', cursor: 'pointer',
}

// ── Compact row for sell listings ─────────────────────────────────────────
function ListingCard({ item, onBuy, onCancel, wrongNetwork, switchChain }) {
  const [qty, setQty] = useState(1)
  const accent = item.tierAccent
  return (
    <div style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${accent}22`, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ ...fp, fontSize: 8, color: accent, width: 28, textAlign: 'center' }}>T{item.tier}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ ...fv, fontSize: 20, color: GOLD_LT }}>{item.pricePerBlock.toFixed(5)} Ξ</span>
          <span style={{ ...fv, fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>x{item.quantity}</span>
          <span style={{ ...fp, fontSize: 6, color: 'rgba(255,255,255,0.25)' }}>{item.ownerShort}</span>
        </div>
      </div>
      {item.isOwn ? (
        <button onClick={() => onCancel(item.id)} style={cancelBtnStyle}>CANCEL</button>
      ) : wrongNetwork ? (
        <button onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })} style={switchBtnStyle}>SWITCH</button>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <button onClick={() => setQty(q => Math.max(1, q - 1))} style={stepBtnStyle}>-</button>
          <input type="text" value={qty} onChange={e => { const v = parseInt(e.target.value) || 0; setQty(Math.min(Math.max(0, v), item.quantity)); }}
            style={{ ...fv, fontSize: 16, color: CREAM, width: 36, textAlign: 'center', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', outline: 'none' }} />
          <button onClick={() => setQty(q => Math.min(item.quantity, q + 1))} style={stepBtnStyle}>+</button>
          <button onClick={() => onBuy(item, qty)} disabled={qty < 1} style={{ ...actionBtnStyle, opacity: qty < 1 ? 0.4 : 1 }}>BUY · {(item.pricePerBlock * qty).toFixed(4)} Ξ</button>
        </div>
      )}
    </div>
  )
}

// ── Compact row for buy offers ────────────────────────────────────────────
function OfferCard({ item, onFill, onCancel, wrongNetwork, switchChain, isApproved, onApprove }) {
  const [qty, setQty] = useState(1)
  const accent = item.tierAccent
  return (
    <div style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${accent}22`, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ ...fp, fontSize: 7, color: '#4ecdc4', width: 36, textAlign: 'center' }}>BUY</div>
      <div style={{ ...fp, fontSize: 8, color: accent, width: 28, textAlign: 'center' }}>T{item.tier}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ ...fv, fontSize: 20, color: GOLD_LT }}>{item.pricePerBlock.toFixed(5)} Ξ</span>
          <span style={{ ...fv, fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>x{item.quantity}</span>
          <span style={{ ...fp, fontSize: 6, color: 'rgba(255,255,255,0.25)' }}>{item.ownerShort}</span>
        </div>
      </div>
      {item.isOwn ? (
        <button onClick={() => onCancel(item.id)} style={cancelBtnStyle}>CANCEL</button>
      ) : wrongNetwork ? (
        <button onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })} style={switchBtnStyle}>SWITCH</button>
      ) : !isApproved ? (
        <button onClick={onApprove} style={{ ...actionBtnStyle, background: ORANGE, fontSize: 6 }}>APPROVE FIRST</button>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <button onClick={() => setQty(q => Math.max(1, q - 1))} style={stepBtnStyle}>-</button>
          <input type="text" value={qty} onChange={e => { const v = parseInt(e.target.value) || 0; setQty(Math.min(Math.max(0, v), item.quantity)); }}
            style={{ ...fv, fontSize: 16, color: CREAM, width: 36, textAlign: 'center', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', outline: 'none' }} />
          <button onClick={() => setQty(q => Math.min(item.quantity, q + 1))} style={stepBtnStyle}>+</button>
          <button onClick={() => onFill(item, qty)} disabled={qty < 1} style={{ ...actionBtnStyle, background: '#4ecdc4', opacity: qty < 1 ? 0.4 : 1 }}>SELL · {(item.pricePerBlock * qty).toFixed(4)} Ξ</button>
        </div>
      )}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────
function Empty({ text }) {
  return <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: 40 }}>{text}</div>
}

// ═══════════════════════════════════════════════════════════════════════════
export default function TradePanel({ refetchAll: gameRefetch, onRevealTier }) {
  const [tab, setTab] = useState('listings')
  const [filterTier, setFilterTier] = useState(0) // 0 = all
  const [sortPrice, setSortPrice] = useState('asc') // 'asc' | 'desc'
  const [createMode, setCreateMode] = useState('sell') // 'sell' | 'buy'
  const [createTier, setCreateTier] = useState(7)
  const [createQty, setCreateQty] = useState(10)
  const [createPrice, setCreatePrice] = useState('0.001')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [lastBoughtTier, setLastBoughtTier] = useState(null)

  const { isConnected: walletConnected } = useAccount()
  const { connectors, connect: connectWallet } = useConnect()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const wrongNetwork = chainId !== TARGET_CHAIN_ID

  const { myListings, otherListings, myOffers, otherOffers, isApproved, refetchAll: tradeRefetch, refetchApproval, address } = useTradeData()
  const { balances } = useGameState()

  const { writeContract, data: txHash, isPending } = useSafeWrite()
  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    if (txConfirmed) {
      setSuccess('Transaction confirmed!')
      tradeRefetch()
      if (gameRefetch) gameRefetch()
      if (lastBoughtTier && onRevealTier) {
        setTimeout(() => onRevealTier(lastBoughtTier), 500)
      }
      setLastBoughtTier(null)
      setTimeout(() => setSuccess(null), 3000)
    }
  }, [txConfirmed])

  // ── Actions ─────────────────────────────────────────────────────────────

  function doApprove() {
    setError(null)
    writeContract({
      address: CONTRACTS.TOKEN, chainId: 84532, abi: TOKEN_ABI,
      functionName: 'setApprovalForAll',
      args: [CONTRACTS.MARKETPLACE, true],
    }, { onError: (e) => setError(e.shortMessage || 'Approval failed') })
  }

  function doCreateListing() {
    setError(null)
    writeContract({
      address: CONTRACTS.MARKETPLACE, chainId: 84532, abi: MARKETPLACE_ABI,
      functionName: 'createListing',
      args: [BigInt(createTier), BigInt(createQty), parseEther(createPrice), BigInt(7 * 86400)],
    }, { onError: (e) => setError(e.shortMessage || 'Create listing failed') })
  }

  function doCreateOffer() {
    setError(null)
    const totalWei = parseEther(createPrice) * BigInt(createQty)
    writeContract({
      address: CONTRACTS.MARKETPLACE, chainId: 84532, abi: MARKETPLACE_ABI,
      functionName: 'createOffer',
      args: [BigInt(createTier), BigInt(createQty), parseEther(createPrice), BigInt(7 * 86400)],
      value: totalWei,
    }, { onError: (e) => setError(e.shortMessage || 'Create offer failed') })
  }

  function doBuyListing(item, qty) {
    setError(null)
    setLastBoughtTier(item.tier)
    writeContract({
      address: CONTRACTS.MARKETPLACE, chainId: 84532, abi: MARKETPLACE_ABI,
      functionName: 'buyListing',
      args: [BigInt(item.id), BigInt(qty)],
      value: item.pricePerBlockWei * BigInt(qty),
    }, { onError: (e) => setError(e.shortMessage || 'Buy failed') })
  }

  function doFillOffer(item, qty) {
    setError(null)
    writeContract({
      address: CONTRACTS.MARKETPLACE, chainId: 84532, abi: MARKETPLACE_ABI,
      functionName: 'fillOffer',
      args: [BigInt(item.id), BigInt(qty)],
    }, { onError: (e) => setError(e.shortMessage || 'Fill offer failed') })
  }

  function doCancelListing(id) {
    setError(null)
    writeContract({
      address: CONTRACTS.MARKETPLACE, chainId: 84532, abi: MARKETPLACE_ABI,
      functionName: 'cancelListing', args: [BigInt(id)],
    }, { onError: (e) => setError(e.shortMessage || 'Cancel failed') })
  }

  function doCancelOffer(id) {
    setError(null)
    writeContract({
      address: CONTRACTS.MARKETPLACE, chainId: 84532, abi: MARKETPLACE_ABI,
      functionName: 'cancelOffer', args: [BigInt(id)],
    }, { onError: (e) => setError(e.shortMessage || 'Cancel failed') })
  }

  // ── Filter + sort ────────────────────────────────────────────────────────
  function filterAndSort(items) {
    let filtered = filterTier > 0 ? items.filter(i => i.tier === filterTier) : items
    filtered = [...filtered].sort((a, b) => sortPrice === 'asc' ? a.pricePerBlock - b.pricePerBlock : b.pricePerBlock - a.pricePerBlock)
    return filtered
  }

  const filteredListings = filterAndSort(otherListings)
  const filteredOffers = filterAndSort(otherOffers)

  // ── Tabs ────────────────────────────────────────────────────────────────

  const tabs = [
    { id: 'listings', label: 'LISTINGS' },
    { id: 'offers', label: 'OFFERS' },
    { id: 'my', label: 'MY TRADES' },
    { id: 'create', label: 'CREATE' },
  ]

  const totalCreate = (createQty * parseFloat(createPrice || '0')).toFixed(5)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            ...fp, fontSize: 8, letterSpacing: 1, padding: '10px 14px', cursor: 'pointer',
            color: tab === t.id ? ORANGE : 'rgba(255,255,255,0.35)',
            background: tab === t.id ? 'rgba(255,168,75,0.06)' : 'transparent',
            border: 'none', borderBottom: tab === t.id ? `2px solid ${ORANGE}` : '2px solid transparent',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Status */}
      {error && <div style={{ ...fp, fontSize: 8, color: '#ff4444', background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)', padding: '8px 12px' }}>{error}</div>}
      {success && <div style={{ ...fp, fontSize: 8, color: '#6eff8a', background: 'rgba(110,255,138,0.08)', border: '1px solid rgba(110,255,138,0.2)', padding: '8px 12px' }}>{success}</div>}
      {isPending && <div style={{ ...fp, fontSize: 8, color: GOLD, textAlign: 'center', padding: 8 }}>Confirm in wallet...</div>}

      {/* Approval banner (for listing/selling) */}
      {!isApproved && address && (tab === 'create' || tab === 'listings' || tab === 'offers') && (
        <div style={{ background: 'rgba(255,168,75,0.06)', border: `1px solid ${ORANGE}33`, padding: 12 }}>
          <div style={{ ...fp, fontSize: 8, color: ORANGE, marginBottom: 6, textAlign: 'center' }}>MARKETPLACE APPROVAL NEEDED TO SELL</div>
          <div style={{ ...fv, fontSize: 14, color: 'rgba(255,255,255,0.45)', marginBottom: 8, textAlign: 'center' }}>
            Standard approval used by OpenSea, Blur, and all major NFT marketplaces. Blocks stay in your wallet until sold.
          </div>
          {wrongNetwork ? (
            <Btn onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })} sm>⚠ SWITCH TO BASE</Btn>
          ) : (
            <Btn onClick={doApprove} sm>APPROVE MARKETPLACE</Btn>
          )}
        </div>
      )}

      {/* ── Filter bar (listings + offers tabs) ──────────────────────── */}
      {(tab === 'listings' || tab === 'offers') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => setFilterTier(0)} style={{
            ...fp, fontSize: 7, padding: '5px 8px', cursor: 'pointer',
            color: filterTier === 0 ? INK : 'rgba(255,255,255,0.4)',
            background: filterTier === 0 ? GOLD : 'rgba(0,0,0,0.3)',
            border: filterTier === 0 ? `1px solid ${GOLD_DK}` : '1px solid rgba(255,255,255,0.1)',
          }}>ALL</button>
          {[7, 6, 5, 4, 3, 2, 1].map(t => {
            const accent = TMAP[t]?.accent || '#888'
            return (
              <button key={t} onClick={() => setFilterTier(t)} style={{
                ...fp, fontSize: 7, padding: '5px 6px', cursor: 'pointer',
                color: filterTier === t ? INK : accent,
                background: filterTier === t ? accent : 'rgba(0,0,0,0.3)',
                border: `1px solid ${filterTier === t ? accent : 'rgba(255,255,255,0.1)'}`,
              }}>T{t}</button>
            )
          })}
          <div style={{ flex: 1 }} />
          <button onClick={() => setSortPrice(s => s === 'asc' ? 'desc' : 'asc')} style={{
            ...fp, fontSize: 7, padding: '5px 8px', cursor: 'pointer',
            color: 'rgba(255,255,255,0.5)', background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}>{sortPrice === 'asc' ? 'PRICE ↑' : 'PRICE ↓'}</button>
        </div>
      )}

      {/* ── LISTINGS TAB ────────────────────────────────────────────────── */}
      {tab === 'listings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', flex: 1 }}>
          {filteredListings.length === 0 ? <Empty text={filterTier > 0 ? `NO T${filterTier} LISTINGS` : "NO LISTINGS YET"} /> :
            filteredListings.map(l => <ListingCard key={l.id} item={l} onBuy={doBuyListing} onCancel={doCancelListing} wrongNetwork={wrongNetwork} switchChain={switchChain} />)
          }
        </div>
      )}

      {/* ── OFFERS TAB ──────────────────────────────────────────────────── */}
      {tab === 'offers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', flex: 1 }}>
          {filteredOffers.length === 0 ? <Empty text={filterTier > 0 ? `NO T${filterTier} OFFERS` : "NO BUY OFFERS YET"} /> :
            filteredOffers.map(o => <OfferCard key={o.id} item={o} onFill={doFillOffer} onCancel={doCancelOffer} wrongNetwork={wrongNetwork} switchChain={switchChain} isApproved={isApproved} onApprove={doApprove} />)
          }
        </div>
      )}

      {/* ── MY TRADES TAB ───────────────────────────────────────────────── */}
      {tab === 'my' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', flex: 1 }}>
          <div style={{ ...fp, fontSize: 7, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>MY SELL LISTINGS</div>
          {myListings.length === 0 ? <Empty text="NO ACTIVE LISTINGS" /> :
            myListings.map(l => <ListingCard key={l.id} item={l} onBuy={doBuyListing} onCancel={doCancelListing} wrongNetwork={wrongNetwork} switchChain={switchChain} />)
          }
          <div style={{ ...fp, fontSize: 7, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, marginTop: 8 }}>MY BUY OFFERS</div>
          {myOffers.length === 0 ? <Empty text="NO ACTIVE OFFERS" /> :
            myOffers.map(o => <OfferCard key={o.id} item={o} onFill={doFillOffer} onCancel={doCancelOffer} wrongNetwork={wrongNetwork} switchChain={switchChain} isApproved={isApproved} onApprove={doApprove} />)
          }
        </div>
      )}

      {/* ── CREATE TAB ──────────────────────────────────────────────────── */}
      {tab === 'create' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 0, border: '1px solid rgba(255,255,255,0.12)' }}>
            <button onClick={() => setCreateMode('sell')} style={{
              ...fp, fontSize: 8, flex: 1, padding: '10px 0', cursor: 'pointer',
              color: createMode === 'sell' ? INK : 'rgba(255,255,255,0.4)',
              background: createMode === 'sell' ? GOLD : 'transparent',
              border: 'none',
            }}>SELL LISTING</button>
            <button onClick={() => setCreateMode('buy')} style={{
              ...fp, fontSize: 8, flex: 1, padding: '10px 0', cursor: 'pointer',
              color: createMode === 'buy' ? INK : 'rgba(255,255,255,0.4)',
              background: createMode === 'buy' ? '#4ecdc4' : 'transparent',
              border: 'none',
            }}>BUY OFFER</button>
          </div>

          {/* Tier selector */}
          <div>
            <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.45)', letterSpacing: 1, marginBottom: 6 }}>
              {createMode === 'sell' ? 'TIER TO SELL' : 'TIER TO BUY'}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {[7, 6, 5, 4, 3, 2, 1].map(t => {
                const meta = TMAP[t]
                const bal = balances?.[t] || 0
                return (
                  <button key={t} onClick={() => setCreateTier(t)} style={{
                    ...fp, fontSize: 8, padding: '8px 10px', cursor: 'pointer', flex: 1, minWidth: 60,
                    color: createTier === t ? INK : meta.accent,
                    background: createTier === t ? meta.accent : 'rgba(0,0,0,0.3)',
                    border: `1px solid ${createTier === t ? meta.accent : 'rgba(255,255,255,0.1)'}`,
                  }}>
                    T{t} {createMode === 'sell' && <span style={{ ...fv, fontSize: 14 }}>({bal})</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Quantity */}
          <div>
            <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.45)', letterSpacing: 1, marginBottom: 6 }}>QUANTITY</div>
            <div style={{ display: 'flex', gap: 0, alignItems: 'stretch', border: '2px solid rgba(255,255,255,0.12)' }}>
              {[-10, -1].map(d => (
                <button key={d} onClick={() => setCreateQty(q => Math.max(1, q + d))} style={{
                  flex: '0 0 44px', height: 44, background: 'rgba(0,0,0,0.4)',
                  border: 'none', borderRight: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.6)', ...fp, fontSize: 8, cursor: 'pointer',
                }}>{d}</button>
              ))}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', ...fv, fontSize: 36, color: CREAM, background: 'rgba(0,0,0,0.2)' }}>{createQty}</div>
              {[1, 10].map(d => (
                <button key={d} onClick={() => {
                  const max = createMode === 'sell' ? (balances?.[createTier] || 0) : 10000
                  setCreateQty(q => Math.min(max, q + d))
                }} style={{
                  flex: '0 0 44px', height: 44, background: 'rgba(0,0,0,0.4)',
                  border: 'none', borderLeft: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.6)', ...fp, fontSize: 8, cursor: 'pointer',
                }}>+{d}</button>
              ))}
            </div>
          </div>

          {/* Price */}
          <div>
            <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.45)', letterSpacing: 1, marginBottom: 6 }}>PRICE PER BLOCK (ETH)</div>
            <input type="text" value={createPrice} onChange={e => setCreatePrice(e.target.value)} style={{
              width: '100%', height: 44, padding: '0 12px',
              ...fv, fontSize: 24, color: CREAM, background: 'rgba(0,0,0,0.3)',
              border: '2px solid rgba(255,255,255,0.12)', outline: 'none',
            }} />
          </div>

          {/* Summary */}
          <div style={{
            ...fp, fontSize: 9, textAlign: 'center', padding: '8px 0',
            color: createMode === 'sell' ? ORANGE : '#4ecdc4',
            borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            {createMode === 'sell'
              ? `TOTAL: ${totalCreate} ETH · EXPIRES IN 7 DAYS`
              : `ESCROW: ${totalCreate} ETH · EXPIRES IN 7 DAYS`
            }
          </div>

          {/* Action button */}
          {!walletConnected ? (
            <Btn onClick={() => { const c = connectors[0]; if (c) connectWallet({ connector: c }); }}>
              CONNECT WALLET TO TRADE
            </Btn>
          ) : createMode === 'sell' ? (
            !isApproved ? (
              wrongNetwork
                ? <Btn onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}>⚠ SWITCH TO BASE</Btn>
                : <Btn onClick={doApprove}>APPROVE MARKETPLACE FIRST</Btn>
            ) : wrongNetwork
              ? <Btn onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}>⚠ SWITCH TO BASE</Btn>
              : <Btn onClick={doCreateListing} disabled={!createPrice || createQty < 1}>LIST {createQty} T{createTier} BLOCKS</Btn>
          ) : (
            wrongNetwork
              ? <Btn onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}>⚠ SWITCH TO BASE</Btn>
              : <Btn onClick={doCreateOffer} disabled={!createPrice || createQty < 1} color="#4ecdc4">
                  CREATE OFFER · ESCROW {totalCreate} ETH
                </Btn>
          )}

          <div style={{ ...fp, fontSize: 7, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
            {createMode === 'sell'
              ? '10% fee on sale · Blocks stay in your wallet until sold'
              : '10% fee on fill · ETH escrowed until seller fills or you cancel'
            }
          </div>
        </div>
      )}
    </div>
  )
}

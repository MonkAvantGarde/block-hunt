import { useState, useEffect } from 'react'
import { useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain } from 'wagmi'
import { parseEther } from 'viem'
import { CONTRACTS } from '../config/wagmi'
import { TOKEN_ABI, MARKETPLACE_ABI } from '../abis'
import { GOLD, GOLD_DK, GOLD_LT, INK, CREAM, TMAP, TIERS, ORANGE } from '../config/design-tokens'
import { Btn } from '../components/GameUI'
import { useTradeData } from '../hooks/useTradeData'
import { useGameState } from '../hooks/useGameState'

const fp = { fontFamily: "'Press Start 2P', monospace" }
const fv = { fontFamily: "'VT323', monospace" }
const TARGET_CHAIN_ID = 84532

function shortAddr(a) { return a ? a.slice(0, 6) + '...' + a.slice(-4) : '---' }

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

function ListingCard({ listing, onBuy, onCancel, wrongNetwork, switchChain }) {
  const [buyQty, setBuyQty] = useState(1)
  const accent = listing.tierAccent

  return (
    <div style={{
      background: 'rgba(0,0,0,0.25)', border: `1px solid ${accent}33`,
      padding: 14, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ ...fp, fontSize: 9, color: accent, letterSpacing: 1 }}>T{listing.tier}</span>
          <span style={{ ...fv, fontSize: 18, color: CREAM, marginLeft: 8 }}>{listing.tierName}</span>
          <span style={{ ...fp, fontSize: 7, color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>{listing.tierLabel}</span>
        </div>
        <div style={{ ...fp, fontSize: 7, color: 'rgba(255,255,255,0.35)' }}>
          <Countdown expiresAt={listing.expiresAt} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <span style={{ ...fv, fontSize: 28, color: GOLD_LT }}>{listing.pricePerBlock.toFixed(5)}</span>
          <span style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.4)', marginLeft: 4 }}>Ξ each</span>
        </div>
        <div style={{ ...fv, fontSize: 18, color: 'rgba(255,255,255,0.5)' }}>
          ×{listing.quantity}
        </div>
      </div>

      <div style={{ ...fp, fontSize: 7, color: 'rgba(255,255,255,0.3)' }}>
        Seller: {listing.sellerShort}
      </div>

      {listing.isOwn ? (
        <Btn onClick={() => onCancel(listing.id)} sm danger>CANCEL LISTING</Btn>
      ) : wrongNetwork ? (
        <Btn onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })} sm>⚠ SWITCH TO BASE</Btn>
      ) : (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: '0 0 auto' }}>
            <button onClick={() => setBuyQty(q => Math.max(1, q - 1))} style={stepBtnStyle}>-</button>
            <div style={{ ...fv, fontSize: 20, color: CREAM, width: 40, textAlign: 'center' }}>{buyQty}</div>
            <button onClick={() => setBuyQty(q => Math.min(listing.quantity, q + 1))} style={stepBtnStyle}>+</button>
          </div>
          <Btn onClick={() => onBuy(listing, buyQty)} sm>
            BUY {buyQty} · {(listing.pricePerBlock * buyQty).toFixed(5)} Ξ
          </Btn>
        </div>
      )}
    </div>
  )
}

const stepBtnStyle = {
  width: 28, height: 28, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)',
  color: 'rgba(255,255,255,0.6)', fontFamily: "'Press Start 2P', monospace", fontSize: 8, cursor: 'pointer',
}

export default function TradePanel() {
  const [tab, setTab] = useState('listings')
  const [createTier, setCreateTier] = useState(7)
  const [createQty, setCreateQty] = useState(10)
  const [createPrice, setCreatePrice] = useState('0.001')
  const [createDays, setCreateDays] = useState(7)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const wrongNetwork = chainId !== TARGET_CHAIN_ID

  const { listings, myListings, otherListings, isApproved, refetchListings, refetchApproval, address } = useTradeData()
  const { balances } = useGameState()

  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    if (txConfirmed) {
      setSuccess('Transaction confirmed!')
      refetchListings()
      refetchApproval()
      setTimeout(() => setSuccess(null), 3000)
    }
  }, [txConfirmed])

  function doApprove() {
    setError(null)
    writeContract({
      address: CONTRACTS.TOKEN,
      abi: TOKEN_ABI,
      functionName: 'setApprovalForAll',
      args: [CONTRACTS.MARKETPLACE, true],
    }, {
      onError: (e) => setError(e.shortMessage || 'Approval failed'),
    })
  }

  function doCreateListing() {
    setError(null)
    const priceWei = parseEther(createPrice)
    const durationSecs = BigInt(createDays * 86400)
    writeContract({
      address: CONTRACTS.MARKETPLACE,
      abi: MARKETPLACE_ABI,
      functionName: 'createListing',
      args: [BigInt(createTier), BigInt(createQty), priceWei, durationSecs],
    }, {
      onError: (e) => setError(e.shortMessage || 'Create listing failed'),
    })
  }

  function doBuy(listing, qty) {
    setError(null)
    const totalWei = listing.pricePerBlockWei * BigInt(qty)
    writeContract({
      address: CONTRACTS.MARKETPLACE,
      abi: MARKETPLACE_ABI,
      functionName: 'buyListing',
      args: [BigInt(listing.id), BigInt(qty)],
      value: totalWei,
    }, {
      onError: (e) => setError(e.shortMessage || 'Buy failed'),
    })
  }

  function doCancel(listingId) {
    setError(null)
    writeContract({
      address: CONTRACTS.MARKETPLACE,
      abi: MARKETPLACE_ABI,
      functionName: 'cancelListing',
      args: [BigInt(listingId)],
    }, {
      onError: (e) => setError(e.shortMessage || 'Cancel failed'),
    })
  }

  const tabs = [
    { id: 'listings', label: 'LISTINGS' },
    { id: 'my', label: 'MY LISTINGS' },
    { id: 'create', label: 'CREATE' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            ...fp, fontSize: 8, letterSpacing: 1, padding: '10px 16px', cursor: 'pointer',
            color: tab === t.id ? ORANGE : 'rgba(255,255,255,0.35)',
            background: tab === t.id ? 'rgba(255,168,75,0.06)' : 'transparent',
            border: 'none', borderBottom: tab === t.id ? `2px solid ${ORANGE}` : '2px solid transparent',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Status messages */}
      {error && (
        <div style={{ ...fp, fontSize: 8, color: '#ff4444', background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)', padding: '8px 12px' }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ ...fp, fontSize: 8, color: '#6eff8a', background: 'rgba(110,255,138,0.08)', border: '1px solid rgba(110,255,138,0.2)', padding: '8px 12px' }}>
          {success}
        </div>
      )}
      {isPending && (
        <div style={{ ...fp, fontSize: 8, color: GOLD, textAlign: 'center', padding: 8 }}>
          Confirm in wallet...
        </div>
      )}

      {/* Approval banner */}
      {!isApproved && address && (tab === 'create' || tab === 'listings') && (
        <div style={{ background: 'rgba(255,168,75,0.08)', border: `1px solid ${ORANGE}44`, padding: 12, textAlign: 'center' }}>
          <div style={{ ...fp, fontSize: 8, color: ORANGE, marginBottom: 8 }}>MARKETPLACE NOT APPROVED</div>
          <div style={{ ...fv, fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>
            One-time approval to let the marketplace transfer your blocks when sold.
          </div>
          {wrongNetwork ? (
            <Btn onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })} sm>⚠ SWITCH TO BASE</Btn>
          ) : (
            <Btn onClick={doApprove} sm>APPROVE MARKETPLACE</Btn>
          )}
        </div>
      )}

      {/* Listings tab */}
      {tab === 'listings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', flex: 1 }}>
          {otherListings.length === 0 && (
            <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: 40 }}>
              NO LISTINGS YET
            </div>
          )}
          {otherListings.map(l => (
            <ListingCard key={l.id} listing={l} onBuy={doBuy} onCancel={doCancel} wrongNetwork={wrongNetwork} switchChain={switchChain} />
          ))}
        </div>
      )}

      {/* My listings tab */}
      {tab === 'my' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', flex: 1 }}>
          {myListings.length === 0 && (
            <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: 40 }}>
              YOU HAVE NO ACTIVE LISTINGS
            </div>
          )}
          {myListings.map(l => (
            <ListingCard key={l.id} listing={l} onBuy={doBuy} onCancel={doCancel} wrongNetwork={wrongNetwork} switchChain={switchChain} />
          ))}
        </div>
      )}

      {/* Create listing tab */}
      {tab === 'create' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Tier selector */}
          <div>
            <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.45)', letterSpacing: 1, marginBottom: 6 }}>TIER</div>
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
                    T{t} <span style={{ ...fv, fontSize: 14 }}>({bal})</span>
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
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                ...fv, fontSize: 36, color: CREAM, background: 'rgba(0,0,0,0.2)',
              }}>{createQty}</div>
              {[1, 10].map(d => (
                <button key={d} onClick={() => setCreateQty(q => Math.min(balances?.[createTier] || 0, q + d))} style={{
                  flex: '0 0 44px', height: 44, background: 'rgba(0,0,0,0.4)',
                  border: 'none', borderLeft: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.6)', ...fp, fontSize: 8, cursor: 'pointer',
                }}>+{d}</button>
              ))}
            </div>
          </div>

          {/* Price per block */}
          <div>
            <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.45)', letterSpacing: 1, marginBottom: 6 }}>PRICE PER BLOCK (ETH)</div>
            <input
              type="text"
              value={createPrice}
              onChange={e => setCreatePrice(e.target.value)}
              style={{
                width: '100%', height: 44, padding: '0 12px',
                ...fv, fontSize: 24, color: CREAM, background: 'rgba(0,0,0,0.3)',
                border: '2px solid rgba(255,255,255,0.12)', outline: 'none',
              }}
            />
          </div>

          {/* Duration */}
          <div>
            <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.45)', letterSpacing: 1, marginBottom: 6 }}>LISTING DURATION</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 3, 7, 14, 30].map(d => (
                <button key={d} onClick={() => setCreateDays(d)} style={{
                  ...fp, fontSize: 8, flex: 1, padding: '8px 0', cursor: 'pointer',
                  color: createDays === d ? INK : CREAM,
                  background: createDays === d ? GOLD : 'rgba(0,0,0,0.35)',
                  border: createDays === d ? `2px solid ${GOLD_DK}` : '2px solid rgba(255,255,255,0.12)',
                }}>{d}D</button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div style={{
            ...fp, fontSize: 9, color: ORANGE, textAlign: 'center',
            padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            TOTAL: {(createQty * parseFloat(createPrice || '0')).toFixed(5)} ETH · {createDays} DAY{createDays !== 1 ? 'S' : ''}
          </div>

          {/* Create button */}
          {!isApproved ? (
            wrongNetwork ? (
              <Btn onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}>⚠ SWITCH TO BASE</Btn>
            ) : (
              <Btn onClick={doApprove}>APPROVE MARKETPLACE FIRST</Btn>
            )
          ) : wrongNetwork ? (
            <Btn onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}>⚠ SWITCH TO BASE</Btn>
          ) : (
            <Btn onClick={doCreateListing} disabled={!createPrice || createQty < 1}>
              LIST {createQty} T{createTier} BLOCKS
            </Btn>
          )}

          <div style={{ ...fp, fontSize: 7, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
            10% fee on sale · Blocks stay in your wallet until sold
          </div>
        </div>
      )}
    </div>
  )
}

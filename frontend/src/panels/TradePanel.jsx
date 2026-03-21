import { useState } from 'react'
import { GOLD, GOLD_DK, GOLD_LT, CREAM, INK, TMAP, COMBINE_RATIOS, BATCH_PRICES_ETH, FORGE_RATIOS } from '../config/design-tokens'

const fp = { fontFamily: "'Press Start 2P', monospace" }
const fv = { fontFamily: "'VT323', monospace" }
const fc = { fontFamily: "'Courier Prime', monospace" }

// ── Compute real combine-path mints recursively from COMBINE_RATIOS ──
function buildCombineTable() {
  const rows = []
  const mintsFor = {}
  mintsFor[7] = 1

  // T6 needs ratio[7] T7s, T5 needs ratio[6] T6s, etc.
  for (let tier = 6; tier >= 2; tier--) {
    const sourceTier = tier + 1
    const ratio = COMBINE_RATIOS[sourceTier]
    mintsFor[tier] = mintsFor[sourceTier] * ratio
  }

  for (let tier = 7; tier >= 2; tier--) {
    const t = TMAP[tier]
    rows.push({
      tier,
      name: t.name,
      label: t.label,
      accent: t.accent,
      mints: mintsFor[tier],
      ratio: COMBINE_RATIOS[tier] || null,
    })
  }
  return rows
}

function fmtMints(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + 'K'
  return n.toLocaleString()
}

function fmtEth(val) {
  if (val >= 100) return val.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (val >= 1) return val.toFixed(2)
  if (val >= 0.01) return val.toFixed(4)
  return val.toFixed(5)
}

const TRADE_CSS = `
  @keyframes trade-fade-in {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .trade-row {
    transition: background 0.12s;
  }
  .trade-row:hover {
    background: rgba(200,168,75,0.04) !important;
  }
  .batch-pill {
    transition: all 0.1s;
    cursor: pointer;
  }
  .batch-pill:hover {
    border-color: rgba(200,168,75,0.5) !important;
    background: rgba(200,168,75,0.1) !important;
  }
`

export default function TradePanel() {
  const [selectedBatch, setSelectedBatch] = useState(1)
  const rows = buildCombineTable()
  const batchPrice = BATCH_PRICES_ETH[selectedBatch] || BATCH_PRICES_ETH[1]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <style>{TRADE_CSS}</style>

      {/* ── Header: Secondary Market ── */}
      <div style={{
        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,165,75,0.12)',
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        animation: 'trade-fade-in 0.3s ease-out',
      }}>
        <div>
          <div style={{ ...fp, fontSize: 9, color: '#ffa84b', letterSpacing: 1 }}>SECONDARY MARKET</div>
          <div style={{ ...fc, fontSize: 12, color: CREAM, opacity: 0.5, marginTop: 3 }}>P2P trading at mainnet launch</div>
        </div>
        <div style={{
          ...fp, fontSize: 7, color: 'rgba(255,165,75,0.5)', letterSpacing: 1,
          border: '1px solid rgba(255,165,75,0.15)', padding: '4px 8px',
        }}>COMING SOON</div>
      </div>

      {/* ── Combine-Path Value Table ── */}
      <div style={{
        background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)',
        padding: '12px 14px', flex: 1,
        animation: 'trade-fade-in 0.3s ease-out 0.05s both',
      }}>
        {/* Section title + batch selector */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ ...fp, fontSize: 8, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 }}>COMBINE-PATH VALUE</div>
          <div style={{ display: 'flex', gap: 3 }}>
            {[1, 2, 3, 4, 5].map(b => (
              <div
                key={b}
                className="batch-pill"
                onClick={() => setSelectedBatch(b)}
                style={{
                  ...fp, fontSize: 7, letterSpacing: 0.5,
                  padding: '3px 6px',
                  color: selectedBatch === b ? INK : 'rgba(255,255,255,0.35)',
                  background: selectedBatch === b ? GOLD : 'transparent',
                  border: `1px solid ${selectedBatch === b ? GOLD_DK : 'rgba(255,255,255,0.1)'}`,
                }}
              >B{b}</div>
            ))}
          </div>
        </div>

        {/* Column headers */}
        <div style={{
          display: 'grid', gridTemplateColumns: '28px 1fr 70px 80px',
          gap: 6, padding: '0 4px 6px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <span style={{ ...fp, fontSize: 7, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>TIER</span>
          <span style={{ ...fp, fontSize: 7, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>NAME</span>
          <span style={{ ...fp, fontSize: 7, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, textAlign: 'right' }}>T7 MINTS</span>
          <span style={{ ...fp, fontSize: 7, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, textAlign: 'right' }}>ETH COST</span>
        </div>

        {/* Data rows */}
        {rows.map((row, i) => {
          const ethCost = row.mints * batchPrice
          return (
            <div key={row.tier} className="trade-row" style={{
              display: 'grid', gridTemplateColumns: '28px 1fr 70px 80px',
              gap: 6, alignItems: 'center',
              padding: '6px 4px',
              borderBottom: '1px solid rgba(255,255,255,0.03)',
              animation: `trade-fade-in 0.25s ease-out ${0.05 * i}s both`,
            }}>
              <span style={{ ...fp, fontSize: 8, color: row.accent }}>T{row.tier}</span>
              <div>
                <span style={{ ...fc, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{row.name}</span>
                {row.ratio && (
                  <span style={{ ...fp, fontSize: 7, color: 'rgba(255,255,255,0.2)', marginLeft: 6 }}>{row.ratio}:1</span>
                )}
              </div>
              <span style={{ ...fv, fontSize: 20, color: CREAM, textAlign: 'right' }}>{fmtMints(row.mints)}</span>
              <span style={{ ...fv, fontSize: 18, textAlign: 'right',
                color: ethCost >= 5 ? GOLD_LT : ethCost >= 1 ? '#c0c0c0' : ethCost >= 0.1 ? '#cd7f32' : 'rgba(255,255,255,0.45)',
                textShadow: ethCost >= 5 ? `0 0 8px ${GOLD}44` : ethCost >= 1 ? '0 0 6px rgba(192,192,192,0.25)' : 'none',
              }}>
                {fmtEth(ethCost)} Ξ
              </span>
            </div>
          )
        })}

        {/* Batch price footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, padding: '6px 4px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ ...fc, fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
            Batch {selectedBatch} price: {batchPrice} Ξ per mint
          </span>
          <span style={{ ...fp, fontSize: 7, color: 'rgba(255,255,255,0.2)' }}>PURE COMBINE PATH</span>
        </div>
      </div>

      {/* ── Forge Shortcut Hint ── */}
      <div style={{
        background: 'rgba(184,107,255,0.04)', border: '1px solid rgba(184,107,255,0.12)',
        padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
        animation: 'trade-fade-in 0.3s ease-out 0.15s both',
      }}>
        <span style={{ fontSize: 16 }}>⚡</span>
        <div>
          <div style={{ ...fp, fontSize: 7, color: '#b86bff', letterSpacing: 1, marginBottom: 2 }}>FORGE SHORTCUT</div>
          <div style={{ ...fc, fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>
            Burn N of {COMBINE_RATIOS[7]} blocks for a (N/{COMBINE_RATIOS[7]} × 100)% upgrade chance. Cheaper than combine — but you can lose everything.
          </div>
        </div>
      </div>

      {/* ── OpenSea Link ── */}
      <a
        href="https://testnets.opensea.io/collection/the-block-hunt"
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100%', height: 44,
          ...fp, fontSize: 8, letterSpacing: 1,
          background: 'transparent', color: CREAM,
          border: '2px solid rgba(255,255,255,0.15)',
          cursor: 'pointer', textDecoration: 'none',
          transition: 'color 0.12s, border-color 0.12s, background 0.12s',
          animation: 'trade-fade-in 0.3s ease-out 0.2s both',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = GOLD; e.currentTarget.style.borderColor = GOLD_DK; e.currentTarget.style.background = 'rgba(200,168,75,0.04)' }}
        onMouseLeave={e => { e.currentTarget.style.color = CREAM; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.background = 'transparent' }}
      >↗ VIEW ON OPENSEA (TESTNET)</a>
    </div>
  )
}

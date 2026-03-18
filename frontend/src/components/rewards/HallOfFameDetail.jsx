import { GOLD, GOLD_LT, GOLD_DK, INK, REWARDS_ACCENT, TIERS } from '../../config/design-tokens'

const fp = { fontFamily: "'Press Start 2P', monospace" }
const fv = { fontFamily: "'VT323', monospace" }

// Tier accent colors/gradients for discovery rows
const TIER_STYLES = {}
TIERS.forEach(t => { TIER_STYLES[t.id] = t })

export default function HallOfFameDetail({ rewards }) {
  // TODO: Replace with contract read when BlockHuntRewards.sol is deployed
  const { hallOfFame } = rewards

  return (
    <div style={{ animation: 'fadeInUp 0.25s ease-out' }}>
      {/* Section: Legends */}
      <div style={{ ...fp, fontSize: 8, color: GOLD_LT, letterSpacing: 2, marginBottom: 4, textShadow: '0 0 12px rgba(200,168,75,0.3)' }}>LEGENDS — ALL TIME</div>
      <div style={{ ...fp, fontSize: 5, color: 'rgba(255,255,255,0.25)', letterSpacing: 1, marginBottom: 14 }}>ONCE CLAIMED, FOREVER YOURS</div>

      {hallOfFame.legends.map((legend, i) => {
        const claimed = legend.claimed && legend.wallet
        const unclaimed = !legend.wallet

        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '12px 16px',
            background: claimed ? `linear-gradient(90deg, rgba(200,168,75,0.06), rgba(0,0,0,0.2))` : 'rgba(0,0,0,0.2)',
            border: `1px solid ${claimed ? 'rgba(200,168,75,0.15)' : 'rgba(255,255,255,0.04)'}`,
            marginBottom: 2,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(78,205,196,0.04)' }}
          onMouseLeave={e => { e.currentTarget.style.background = claimed ? 'linear-gradient(90deg, rgba(200,168,75,0.06), rgba(0,0,0,0.2))' : 'rgba(0,0,0,0.2)' }}
          >
            <div style={{
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              ...fv, fontSize: 20,
              ...(claimed
                ? { background: `linear-gradient(135deg,${GOLD_DK},${GOLD})`, color: INK, border: `1px solid ${GOLD}` }
                : { background: 'rgba(0,0,0,0.3)', color: 'rgba(200,168,75,0.3)', border: '1px solid rgba(200,168,75,0.15)' }
              ),
            }}>★</div>
            <div style={{ ...fp, fontSize: 7, color: claimed ? GOLD_LT : 'rgba(200,168,75,0.35)', letterSpacing: 1, flex: 1 }}>
              {legend.title} — {legend.desc}
            </div>
            {claimed ? (
              <>
                <div style={{ ...fv, fontSize: 16, color: 'rgba(255,255,255,0.4)' }}>
                  {legend.wallet}{legend.isYou ? <span style={{ ...fp, fontSize: 5, color: GOLD, marginLeft: 4 }}>YOU</span> : null}
                </div>
                <div style={{ ...fv, fontSize: 18, color: GOLD_LT, minWidth: 60, textAlign: 'right' }}>TITLE</div>
              </>
            ) : (
              <>
                <div style={{ ...fv, fontSize: 16, color: 'rgba(255,255,255,0.12)' }}>UNCLAIMED</div>
                <div style={{ ...fp, fontSize: 5, color: 'rgba(255,255,255,0.25)', minWidth: 60, textAlign: 'right' }}>AVAILABLE</div>
              </>
            )}
          </div>
        )
      })}

      {/* Section: Tier Discovery — All Time */}
      <div style={{ ...fp, fontSize: 7, color: 'rgba(200,168,75,0.5)', letterSpacing: 1, marginTop: 20, marginBottom: 4 }}>TIER DISCOVERY — ALL TIME</div>
      <div style={{ ...fp, fontSize: 5, color: 'rgba(255,255,255,0.2)', letterSpacing: 1, marginBottom: 12 }}>FIRST WALLET TO REVEAL EACH TIER</div>

      {hallOfFame.tierDiscovery.map((td, i) => {
        const tierData = TIER_STYLES[td.tier]
        const claimed = td.claimed && td.wallet
        const unclaimed = !td.wallet

        // Tier-colored rank box
        const rankBoxStyle = claimed
          ? { background: tierData?.bg || 'rgba(0,0,0,0.3)', color: tierData?.accent || '#fff', border: `1px solid ${tierData?.border || 'rgba(255,255,255,0.1)'}` }
          : { background: 'rgba(0,0,0,0.3)', color: `${tierData?.accent || '#fff'}40`, border: `1px solid ${tierData?.border || 'rgba(255,255,255,0.1)'}40` }

        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '12px 16px',
            background: claimed ? `linear-gradient(90deg, rgba(200,168,75,0.06), rgba(0,0,0,0.2))` : 'rgba(0,0,0,0.2)',
            border: `1px solid ${claimed ? 'rgba(200,168,75,0.15)' : 'rgba(255,255,255,0.04)'}`,
            marginBottom: 2,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(78,205,196,0.04)' }}
          onMouseLeave={e => { e.currentTarget.style.background = claimed ? 'linear-gradient(90deg, rgba(200,168,75,0.06), rgba(0,0,0,0.2))' : 'rgba(0,0,0,0.2)' }}
          >
            <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', ...fv, fontSize: 20, ...rankBoxStyle }}>{td.tier}</div>
            <div style={{ ...fp, fontSize: 7, color: claimed ? GOLD_LT : 'rgba(200,168,75,0.35)', letterSpacing: 1, flex: 1 }}>
              FIRST <span style={{ color: claimed ? (tierData?.accent || '#fff') : `${tierData?.accent || '#fff'}66` }}>{td.name}</span> REVEAL
            </div>
            {claimed ? (
              <>
                <div style={{ ...fv, fontSize: 16, color: 'rgba(255,255,255,0.4)' }}>
                  {td.wallet}{td.isYou ? <span style={{ ...fp, fontSize: 5, color: GOLD, marginLeft: 4 }}>YOU</span> : null}
                </div>
                <div style={{ ...fv, fontSize: 18, color: GOLD_LT, minWidth: 60, textAlign: 'right' }}>TITLE</div>
              </>
            ) : (
              <>
                <div style={{ ...fv, fontSize: 16, color: 'rgba(255,255,255,0.12)' }}>UNCLAIMED</div>
                <div style={{ ...fp, fontSize: 5, color: 'rgba(255,255,255,0.25)', minWidth: 60, textAlign: 'right' }}>AVAILABLE</div>
              </>
            )}
          </div>
        )
      })}

      {/* Section: Batch Firsts */}
      <div style={{ marginTop: 24 }}>
        <div style={{ display: 'inline-block', padding: '3px 8px', border: '1px solid rgba(78,205,196,0.2)', background: 'rgba(78,205,196,0.04)', marginBottom: 12 }}>
          <span style={{ ...fp, fontSize: 5, color: 'rgba(78,205,196,0.6)', letterSpacing: 1 }}>BATCH 2 FIRSTS — ETH BONUS + TITLE (13 ACHIEVEMENTS)</span>
        </div>

        {hallOfFame.batchFirsts.map((bf, i) => {
          const claimed = bf.claimed && bf.wallet
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 16px', background: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(255,255,255,0.04)', marginBottom: 2,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(78,205,196,0.04)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.2)' }}
            >
              <div style={{
                width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                ...fv, fontSize: 20,
                border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)',
                color: bf.wallet ? '#f0ead6' : 'rgba(255,255,255,0.2)',
                opacity: bf.wallet ? 1 : 0.4,
              }}>{bf.rank}</div>
              <div style={{ ...fp, fontSize: 7, color: bf.wallet ? REWARDS_ACCENT : 'rgba(78,205,196,0.4)', letterSpacing: 1, flex: 1 }}>{bf.title}</div>
              {bf.wallet ? (
                <>
                  <div style={{ ...fv, fontSize: 16, color: 'rgba(255,255,255,0.4)' }}>
                    {bf.wallet}{bf.isYou ? <span style={{ ...fp, fontSize: 5, color: GOLD, marginLeft: 4 }}>YOU</span> : null}
                  </div>
                  <div style={{ ...fv, fontSize: 18, color: REWARDS_ACCENT, minWidth: 70, textAlign: 'right' }}>+{bf.prize.toFixed(2)} Ξ{claimed ? ' ✓' : ''}</div>
                </>
              ) : (
                <>
                  <div style={{ ...fv, fontSize: 16, color: 'rgba(255,255,255,0.1)' }}>UNCLAIMED</div>
                  <div style={{ ...fp, fontSize: 5, color: 'rgba(255,255,255,0.25)', minWidth: 70, textAlign: 'right' }}>{bf.prize.toFixed(2)} Ξ</div>
                </>
              )}
            </div>
          )
        })}

        {/* Batch Tier Discovery */}
        <div style={{ marginTop: 14, marginBottom: 10, paddingTop: 12, borderTop: '1px solid rgba(78,205,196,0.06)' }}>
          <div style={{ ...fp, fontSize: 6, color: 'rgba(78,205,196,0.5)', letterSpacing: 1 }}>BATCH 2 TIER DISCOVERY</div>
        </div>

        {hallOfFame.batchTierDiscovery.map((btd, i) => {
          const tierData = TIER_STYLES[btd.tier]
          const claimed = btd.claimed && btd.wallet

          const rankBoxStyle = btd.wallet
            ? { background: tierData?.bg || 'rgba(0,0,0,0.3)', color: tierData?.accent || '#fff', border: `1px solid ${tierData?.border || 'rgba(255,255,255,0.1)'}`, fontSize: 16 }
            : { background: 'rgba(0,0,0,0.3)', color: `${tierData?.accent || '#fff'}66`, border: `1px solid ${tierData?.border || 'rgba(255,255,255,0.1)'}50`, fontSize: 16 }

          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 16px', background: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(255,255,255,0.04)', marginBottom: 2,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(78,205,196,0.04)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.2)' }}
            >
              <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', ...fv, ...rankBoxStyle }}>T{btd.tier}</div>
              <div style={{ ...fp, fontSize: 7, color: btd.wallet ? REWARDS_ACCENT : 'rgba(78,205,196,0.4)', letterSpacing: 1, flex: 1 }}>
                FIRST <span style={{ color: btd.wallet ? (tierData?.accent || '#fff') : `${tierData?.accent || '#fff'}66` }}>{btd.name}</span> IN BATCH 2
              </div>
              {btd.wallet ? (
                <>
                  <div style={{ ...fv, fontSize: 16, color: 'rgba(255,255,255,0.4)' }}>
                    {btd.wallet}{btd.isYou ? <span style={{ ...fp, fontSize: 5, color: GOLD, marginLeft: 4 }}>YOU</span> : null}
                  </div>
                  <div style={{ ...fv, fontSize: 18, color: REWARDS_ACCENT, minWidth: 70, textAlign: 'right' }}>+{btd.prize.toFixed(2)} Ξ{claimed ? ' ✓' : ''}</div>
                </>
              ) : (
                <>
                  <div style={{ ...fv, fontSize: 16, color: 'rgba(255,255,255,0.1)' }}>UNCLAIMED</div>
                  <div style={{ ...fp, fontSize: 5, color: 'rgba(255,255,255,0.25)', minWidth: 70, textAlign: 'right' }}>{btd.prize.toFixed(2)} Ξ</div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

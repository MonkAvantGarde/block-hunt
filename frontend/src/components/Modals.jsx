import { useState, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════
// TOKENS
// ═══════════════════════════════════════════════════════════════
const WOOD    = "#2c1810";
const GOLD    = "#c8a84b";
const GOLD_DK = "#8a6820";
const GOLD_LT = "#e8c86b";
const EMBER   = "#cc3322";
const CREAM   = "#f0ead6";
const INK     = "#1a1208";
const GREEN   = "#6eff8a";
const PURPLE  = "#b86bff";
const ORANGE  = "#ffa84b";

const MODAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323:wght@400&family=Courier+Prime:wght@400;700&display=swap');

  @keyframes overlay-in { from { opacity:0; } to { opacity:1; } }
  @keyframes modal-in   { from { opacity:0; transform:translateY(12px) scale(.98); } to { opacity:1; transform:none; } }
  @keyframes pulse-dot  { 0%,100% { opacity:1; } 50% { opacity:.3; } }

  .modal-scrollbox::-webkit-scrollbar { width: 6px; }
  .modal-scrollbox::-webkit-scrollbar-track { background: transparent; }
  .modal-scrollbox::-webkit-scrollbar-thumb { background: ${GOLD_DK}; }

  .pf-filter-btn { transition: opacity .1s, background .1s; }
  .pf-filter-btn:hover { opacity: .85 !important; }
  .lb-row { transition: background .1s; cursor: pointer; }
  .lb-row:hover td { background: rgba(255,255,255,.025); }
  .ob-dot-btn { transition: background .15s; cursor: pointer; }
`;

// ═══════════════════════════════════════════════════════════════
// SHARED — MODAL SHELL
// ═══════════════════════════════════════════════════════════════
function ModalShell({ onClose, width = 560, children }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(7,18,13,0.88)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "36px 24px",
        backdropFilter: "blur(2px)",
        animation: "overlay-in .15s ease",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="modal-scrollbox"
        style={{
          position: "relative",
          background: "#0e2318",
          border: `2px solid ${GOLD_DK}`,
          boxShadow: `8px 8px 0 ${INK}, 0 0 60px rgba(0,0,0,.7)`,
          width, maxWidth: "100%",
          maxHeight: "calc(100vh - 72px)",
          overflowY: "auto", overflowX: "hidden",
          animation: "modal-in .18s cubic-bezier(.2,.8,.2,1)",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 14, right: 16,
            fontFamily: "'Press Start 2P', monospace", fontSize: 8,
            color: CREAM, opacity: .4, background: "none", border: "none",
            cursor: "pointer", zIndex: 10, lineHeight: 1,
            transition: "opacity .15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = 1; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = .4; }}
        >✕ CLOSE</button>
        {children}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MODAL 1 — GAME RULES (ONBOARDING CAROUSEL)
// ═══════════════════════════════════════════════════════════════
const TIERS = [
  { t: 7, name: "The Inert",      col: "#9ba8b0", rarity: "TIER 7 · ~80%" },
  { t: 6, name: "The Restless",   col: "#8fa8c8", rarity: "TIER 6 · ~14%" },
  { t: 5, name: "The Remembered", col: "#8fb87a", rarity: "TIER 5 · ~4.5%" },
  { t: 4, name: "The Ordered",    col: "#c8c870", rarity: "TIER 4 · ~1.2%" },
  { t: 3, name: "The Chaotic",    col: "#c87a7a", rarity: "TIER 3 · ~0.25%" },
  { t: 2, name: "The Willful",    col: "#c8a84b", rarity: "TIER 2 · ~0.05%" },
  { t: 1, name: "The Origin",     col: "rgba(255,255,255,.3)", rarity: "TIER 1 · UNCOLLECTABLE" },
];

const CARDS = [
  {
    num: "01 / 06", icon: "◈", title: "SEVEN BLOCKS EXIST.",
    body: (
      <div>
        <div style={{ fontFamily: "'VT323', monospace", fontSize: 22, color: CREAM, opacity: .9, lineHeight: 1.5, marginBottom: 16 }}>
          They have always existed. Raw, graded by something older than markets.<br /><br />
          Most are <span style={{ color: GOLD_LT }}>Inert</span> — ordinary, abundant.<br />
          A few are <span style={{ color: GOLD_LT }}>Willful</span> — almost impossible to find.<br />
          One is <span style={{ color: GOLD_LT }}>The Origin</span> — it cannot be found at all.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {TIERS.map(t => (
            <div key={t.t} style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "'VT323', monospace", fontSize: 18 }}>
              <div style={{ width: 8, height: 8, background: t.col, flexShrink: 0 }} />
              <span style={{ flex: 1, color: t.col }}>{t.name}</span>
              <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5, opacity: .5, letterSpacing: 1 }}>{t.rarity}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    num: "02 / 06", icon: "⬡", title: "THE HUNT OPENS DAILY.",
    body: (
      <div>
        <div style={{ fontFamily: "'VT323', monospace", fontSize: 22, color: CREAM, opacity: .9, lineHeight: 1.5, marginBottom: 16 }}>
          Once a day, a window opens. You have <span style={{ color: GOLD_LT }}>6 hours</span> to enter.<br /><br />
          State how many blocks you want. The window closes.<br />
          What you receive is determined then — not before.<br />
          No one gets an advantage by moving faster.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["0.00008 ETH (Batch 1, price rises)", "Up to 500 per player", "Batch-scaled daily cap", "Quiet days roll over"].map(s => (
            <div key={s} style={{
              fontFamily: "'Press Start 2P', monospace", fontSize: 6,
              border: "1px solid rgba(255,255,255,.1)",
              padding: "5px 9px", color: CREAM, opacity: .8, letterSpacing: .5,
            }}>{s}</div>
          ))}
        </div>
      </div>
    ),
  },
  {
    num: "03 / 06", icon: "◈", title: "MANY BECOME ONE.",
    body: (
      <div>
        <div style={{ fontFamily: "'VT323', monospace", fontSize: 22, color: CREAM, opacity: .9, lineHeight: 1.5, marginBottom: 16 }}>
          Accumulate enough of a tier and you can collapse them.<br />
          Burn the many. Receive the one above.<br /><br />
          This path is <span style={{ color: GOLD_LT }}>certain</span>. Patient. Expensive.<br />
          Every combine destroys what it consumes.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["T7 → T6: 20 blocks", "T6 → T5: 20 blocks", "T5 → T4: 30 blocks", "T4 → T3: 30 blocks", "T3 → T2: 50 blocks"].map(s => (
            <div key={s} style={{
              fontFamily: "'Press Start 2P', monospace", fontSize: 6,
              border: "1px solid rgba(255,255,255,.1)",
              padding: "5px 9px", color: CREAM, opacity: .8, letterSpacing: .5,
            }}>{s}</div>
          ))}
        </div>
      </div>
    ),
  },
  {
    num: "04 / 06", icon: "⚡", title: "THE FORGE DOES NOT FORGIVE.",
    body: (
      <div>
        <div style={{ fontFamily: "'VT323', monospace", fontSize: 22, color: CREAM, opacity: .9, lineHeight: 1.5, marginBottom: 16 }}>
          Feed it blocks. Name your risk.<br />
          Burn <span style={{ color: GOLD_LT }}>10 of 20</span> — a 50% chance of something rarer.<br />
          Burn <span style={{ color: GOLD_LT }}>all 20</span> — certain. But 20 blocks gone either way.<br /><br />
          The Forge is indifferent to your hope.<br />
          It only counts what you commit.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Burn N of M = (N/M)% chance", "Fail = all blocks destroyed", "Applies to Tiers 3–7"].map(s => (
            <div key={s} style={{
              fontFamily: "'Press Start 2P', monospace", fontSize: 6,
              border: "1px solid rgba(255,255,255,.1)",
              padding: "5px 9px", color: CREAM, opacity: .8, letterSpacing: .5,
            }}>{s}</div>
          ))}
        </div>
      </div>
    ),
  },
  {
    num: "05 / 06", icon: "⇄", title: "NOTHING IS UNTRADEABLE.",
    body: (
      <div>
        <div style={{ fontFamily: "'VT323', monospace", fontSize: 22, color: CREAM, opacity: .9, lineHeight: 1.5, marginBottom: 16 }}>
          Every block you hold has a price somewhere.<br />
          Those who grind will eventually meet those who won't.<br /><br />
          The rarer the tier, the more impractical the grind — and the more the market will price it honestly.<br /><br />
          Trade is not a shortcut. It is the system working as intended.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["10% royalty on all trades", "All blocks are ERC-1155"].map(s => (
            <div key={s} style={{
              fontFamily: "'Press Start 2P', monospace", fontSize: 6,
              border: "1px solid rgba(255,255,255,.1)",
              padding: "5px 9px", color: CREAM, opacity: .8, letterSpacing: .5,
            }}>{s}</div>
          ))}
        </div>
      </div>
    ),
  },
  {
    num: "06 / 06", icon: "★", title: "ONE PLAYER ENDS IT.",
    body: (
      <div style={{ fontFamily: "'VT323', monospace", fontSize: 22, color: CREAM, opacity: .9, lineHeight: 1.5 }}>
        Collect all six — Tiers 2 through 7 — simultaneously.<br />
        The moment you do, the clock starts. <span style={{ color: GOLD_LT }}>Seven days.</span><br /><br />
        At the end, you choose:<br />
        <span style={{ color: GOLD_LT }}>Claim</span> — take everything. Season ends.<br />
        <span style={{ color: GOLD_LT }}>Sacrifice</span> — take half. Seed the next world. Become The Origin.<br /><br />
        The community will have a voice. The choice is yours alone.
      </div>
    ),
  },
];

export function GameRulesModal({ onClose }) {
  const [card, setCard] = useState(0);
  const isLast = card === CARDS.length - 1;
  const c = CARDS[card];

  return (
    <ModalShell onClose={onClose} width={560}>
      {/* Header */}
      <div style={{ padding: "22px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: GOLD, opacity: .6, letterSpacing: 2 }}>⬡ THE BLOCK HUNT</div>
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          {CARDS.map((_, i) => (
            <div
              key={i}
              className="ob-dot-btn"
              onClick={() => setCard(i)}
              style={{
                width: 7, height: 7,
                border: `1px solid ${GOLD_DK}`,
                background: i === card ? GOLD : "transparent",
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      </div>

      {/* Card */}
      <div style={{ padding: "28px 32px 24px", height: 380, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: CREAM, opacity: .3, letterSpacing: 2, marginBottom: 14 }}>{c.num}</div>
          <div style={{ fontSize: 32, marginBottom: 16, lineHeight: 1 }}>{c.icon}</div>
          <div style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: 12,
            color: GOLD, letterSpacing: 1, lineHeight: 1.8, marginBottom: 16,
            textShadow: `2px 2px 0 ${GOLD_DK}`,
          }}>{c.title}</div>
          {c.body}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: "14px 32px 22px",
        borderTop: "1px solid rgba(255,255,255,.05)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <button
          onClick={() => card > 0 && setCard(card - 1)}
          style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: 7, letterSpacing: 1,
            padding: "9px 16px", border: "2px solid rgba(255,255,255,.12)",
            background: "rgba(255,255,255,.06)", color: CREAM,
            cursor: card === 0 ? "default" : "pointer",
            visibility: card === 0 ? "hidden" : "visible",
          }}
        >◀ BACK</button>

        <button
          onClick={onClose}
          style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: 6,
            color: CREAM, opacity: .3, background: "none", border: "none",
            cursor: "pointer", letterSpacing: 1,
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = .6; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = .3; }}
        >SKIP</button>

        <button
          onClick={() => isLast ? onClose() : setCard(card + 1)}
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: isLast ? 7 : 7, letterSpacing: isLast ? 2 : 1,
            padding: isLast ? "10px 20px" : "9px 16px",
            background: GOLD, color: INK,
            border: `2px solid ${INK}`, boxShadow: `3px 3px 0 ${INK}`,
            cursor: "pointer",
          }}
        >{isLast ? "★ START PLAYING" : "NEXT ▶"}</button>
      </div>
    </ModalShell>
  );
}

// ═══════════════════════════════════════════════════════════════
// MODAL 2 — LEADERBOARD
// ═══════════════════════════════════════════════════════════════

// ⚠️  After deploying your subgraph to The Graph Studio, paste your
//     query URL here. Format:
//     https://api.studio.thegraph.com/query/YOUR_ID/block-hunt/version/latest
const SUBGRAPH_URL = "https://api.studio.thegraph.com/query/1744131/blok-hunt/version/latest";

const TIER_COLS = ["#9ba8b0", "#8fa8c8", "#8fb87a", "#c8c870", "#c87a7a", "#c8a84b"];

// Formats large score numbers: 18400000 → "18.4M", 360000 → "360K", 1 → "1"
function fmtScore(val) {
  const n = Number(val);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return Math.round(n / 1_000) + "K";
  return n.toString();
}

// Truncates wallet address: 0x1234567890abcdef → 0x1234...cdef
function fmtAddr(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

// Build the 6-dot tiers array from balance fields (T7 leftmost → T2 rightmost)
function buildTierDots(p) {
  return [
    Number(p.tier7Balance) > 0 ? 1 : 0,
    Number(p.tier6Balance) > 0 ? 1 : 0,
    Number(p.tier5Balance) > 0 ? 1 : 0,
    Number(p.tier4Balance) > 0 ? 1 : 0,
    Number(p.tier3Balance) > 0 ? 1 : 0,
    Number(p.tier2Balance) > 0 ? 1 : 0,
  ];
}

// Known burn / zero addresses to exclude from leaderboard
const BURN_ADDRESSES = [
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
];

const PAGE_SIZE = 100;

function buildLbQuery(skip = 0) {
  return `{
    players(
      first: ${PAGE_SIZE},
      skip: ${skip},
      orderBy: progressionScore,
      orderDirection: desc,
      where: { id_not_in: ${JSON.stringify(BURN_ADDRESSES)} }
    ) {
      id
      tier2Balance tier3Balance tier4Balance
      tier5Balance tier6Balance tier7Balance
      tiersUnlocked
      totalMints
      progressionScore
    }
    seasonStat(id: "season-1") {
      totalMinted
      totalBurned
      uniquePlayers
    }
  }`;
}

export function LeaderboardModal({ onClose, onOpenProfile, connectedAddress }) {
  const [players,     setPlayers]     = useState([]);
  const [stats,       setStats]       = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error,       setError]       = useState(null);
  const [hasMore,     setHasMore]     = useState(false);

  async function fetchPage(skip, append = false) {
    try {
      const res = await fetch(SUBGRAPH_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ query: buildLbQuery(skip) }),
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);
      const page = json.data.players || [];
      setPlayers(prev => append ? [...prev, ...page] : page);
      if (!append) setStats(json.data.seasonStat || null);
      // If we got a full page, there may be more
      setHasMore(page.length === PAGE_SIZE);
    } catch (err) {
      setError(err.message || "Failed to load leaderboard");
    }
  }

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchPage(0).finally(() => setLoading(false));
  }, []);

  async function handleLoadMore() {
    setLoadingMore(true);
    await fetchPage(players.length, true);
    setLoadingMore(false);
  }

  const connLower = connectedAddress ? connectedAddress.toLowerCase() : null;

  return (
    <ModalShell onClose={onClose} width={720}>
      {/* Header */}
      <div style={{ padding: "22px 28px 16px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 11, color: GOLD, letterSpacing: 1, textShadow: `2px 2px 0 ${GOLD_DK}` }}>⬡ THE RACE</div>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: CREAM, opacity: .4, letterSpacing: 1 }}>WHO'S CLOSEST TO WINNING · SEASON 1</div>
      </div>

      {/* Season stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
        {[
          { label: "TOTAL MINTED", val: stats ? Number(stats.totalMinted).toLocaleString() : "—" },
          { label: "TOTAL BURNED", val: stats ? Number(stats.totalBurned).toLocaleString() : "—" },
          { label: "PRIZE POOL",   val: "live ↗", gold: true },
          { label: "PLAYERS",      val: stats ? stats.uniquePlayers.toLocaleString()       : "—" },
        ].map((s, i) => (
          <div key={s.label} style={{ padding: "12px 20px", borderRight: i < 3 ? "1px solid rgba(255,255,255,.05)" : "none" }}>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5, color: CREAM, opacity: .4, letterSpacing: 1, marginBottom: 5 }}>{s.label}</div>
            <div style={{ fontFamily: "'VT323', monospace", fontSize: 22, color: s.gold ? GOLD_LT : CREAM, letterSpacing: .5 }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Loading / error states */}
      {loading && (
        <div style={{ padding: "40px 28px", textAlign: "center", fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: CREAM, opacity: .4, letterSpacing: 1 }}>
          <span style={{ animation: "pulse-dot 1s infinite" }}>● </span>LOADING...
        </div>
      )}

      {error && !loading && (
        <div style={{ padding: "28px", margin: "20px 28px", border: `1px solid ${EMBER}33`, background: "rgba(204,51,34,.06)" }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: EMBER, letterSpacing: 1, marginBottom: 8 }}>⚠ COULD NOT LOAD</div>
          <div style={{ fontFamily: "'VT323', monospace", fontSize: 17, color: CREAM, opacity: .6 }}>{error}</div>
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <div style={{ padding: "0 0 16px" }}>
          {players.length === 0 ? (
            <div style={{ padding: "40px 28px", textAlign: "center", fontFamily: "'VT323', monospace", fontSize: 22, color: CREAM, opacity: .4 }}>
              No players yet. Be the first.
            </div>
          ) : (
            <>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["#", "PLAYER", "TIERS HELD", "SCORE", "MINTS"].map((h, i) => (
                      <th key={h} style={{
                        fontFamily: "'Press Start 2P', monospace", fontSize: 6,
                        color: CREAM, opacity: .35, letterSpacing: 1,
                        padding: "10px 16px",
                        textAlign: i >= 3 ? "right" : "left",
                        borderBottom: "1px solid rgba(255,255,255,.05)",
                        paddingRight: i === 4 ? 24 : undefined,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {players.map((p, idx) => {
                    const rank     = idx + 1;
                    const isMe     = connLower && p.id === connLower;
                    const tierDots = buildTierDots(p);
                    return (
                      <tr
                        key={p.id}
                        className="lb-row"
                        onClick={onOpenProfile}
                        style={{ background: isMe ? "rgba(200,168,75,.07)" : "transparent" }}
                      >
                        <td style={{ padding: "9px 16px", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                          <span style={{ fontFamily: "'VT323', monospace", fontSize: 20, color: rank <= 3 ? GOLD : CREAM, opacity: rank <= 3 ? 1 : .55 }}>{rank}</span>
                        </td>
                        <td style={{ padding: "9px 16px", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 11, color: CREAM, opacity: .7 }}>{fmtAddr(p.id)}</div>
                            {isMe && <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5, color: GOLD, background: "rgba(200,168,75,.15)", border: `1px solid ${GOLD_DK}`, padding: "2px 6px", letterSpacing: 1 }}>YOU</span>}
                            {Number(p.tiersUnlocked) >= 5 && <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5, color: EMBER, background: "rgba(204,51,34,.12)", border: `1px solid ${EMBER}44`, padding: "2px 6px", letterSpacing: 1, animation: "pulse-dot 2s ease-in-out infinite" }}>{6 - Number(p.tiersUnlocked)} AWAY</span>}
                          </div>
                        </td>
                        <td style={{ padding: "9px 16px", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            {tierDots.map((held, i) => (
                              <div key={i} style={{ width: 9, height: 9, background: held ? TIER_COLS[i] : "transparent", border: held ? "none" : "1px solid rgba(255,255,255,.2)" }} />
                            ))}
                            <span style={{ fontFamily: "'VT323', monospace", fontSize: 16, color: CREAM, opacity: .45, marginLeft: 6 }}>{p.tiersUnlocked}/6</span>
                          </div>
                        </td>
                        <td style={{ padding: "9px 16px", borderBottom: "1px solid rgba(255,255,255,.04)", textAlign: "right" }}>
                          <span style={{ fontFamily: "'VT323', monospace", fontSize: 20, color: GOLD_LT, opacity: .85 }}>{fmtScore(p.progressionScore)}</span>
                        </td>
                        <td style={{ padding: "9px 24px 9px 16px", borderBottom: "1px solid rgba(255,255,255,.04)", textAlign: "right" }}>
                          <span style={{ fontFamily: "'VT323', monospace", fontSize: 20, color: CREAM, opacity: .5 }}>{Number(p.totalMints).toLocaleString()}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Load more */}
              {hasMore && (
                <div style={{ padding: "16px 24px", textAlign: "center" }}>
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    style={{
                      fontFamily: "'Press Start 2P', monospace", fontSize: 7,
                      padding: "10px 24px", letterSpacing: 1,
                      background: "transparent", color: GOLD,
                      border: `1px solid ${GOLD_DK}`, cursor: loadingMore ? "default" : "pointer",
                      opacity: loadingMore ? .5 : 1,
                    }}
                  >
                    {loadingMore ? "● LOADING..." : `▼ LOAD MORE (showing ${players.length})`}
                  </button>
                </div>
              )}

              {/* End of list indicator */}
              {!hasMore && players.length >= PAGE_SIZE && (
                <div style={{ padding: "14px", textAlign: "center", fontFamily: "'Press Start 2P', monospace", fontSize: 5, color: CREAM, opacity: .25, letterSpacing: 1 }}>
                  ALL {players.length} PLAYERS SHOWN
                </div>
              )}
            </>
          )}
        </div>
      )}
    </ModalShell>
  );
}

// ═══════════════════════════════════════════════════════════════
// MODAL 3 — PROFILE
// ═══════════════════════════════════════════════════════════════
const HOLDINGS = [
  { t: 7, name: "THE INERT",      col: "#9ba8b0", qty: 64 },
  { t: 6, name: "THE RESTLESS",   col: "#8fa8c8", qty: 11 },
  { t: 5, name: "THE REMEMBERED", col: "#8fb87a", qty: 3 },
  { t: 4, name: "THE ORDERED",    col: "#c8c870", qty: 1 },
  { t: 3, name: "THE CHAOTIC",    col: "#c87a7a", qty: 0 },
  { t: 2, name: "THE WILLFUL",    col: "#c8a84b", qty: 0 },
];

const FEED_DATA = [
  { type: "mint",    label: "MINT",       col: GREEN,  desc: "Minted 200 blocks — 157 Inert, 28 Restless, 12 Remembered, 3 Ordered", time: "2 hours ago",  tx: "0x4fa1...b22c" },
  { type: "forge-w", label: "FORGE WIN",  col: PURPLE, desc: "Forged 50 × Restless → 1 Remembered (50% odds)", time: "5 hours ago",  tx: "0x9c3d...441f" },
  { type: "combine", label: "COMBINE",    col: GOLD,   desc: "Combined 20 × Inert → 1 Restless", time: "8 hours ago",  tx: "0x1b7e...9920" },
  { type: "forge-l", label: "FORGE LOSS", col: EMBER,  desc: "Forged 25 × Inert — all 25 blocks destroyed (25% odds)", time: "1 day ago",   tx: "0x8d2a...cc01" },
  { type: "trade",   label: "TRADE",      col: ORANGE, desc: "Sold 5 × Inert for 0.002 Ξ on OpenSea", time: "1 day ago",   tx: "0x3e9f...7714" },
  { type: "mint",    label: "MINT",       col: GREEN,  desc: "Minted 500 blocks — 398 Inert, 71 Restless, 23 Remembered, 6 Ordered, 2 Chaotic", time: "2 days ago",  tx: "0x6f4b...2288" },
  { type: "combine", label: "COMBINE",    col: GOLD,   desc: "Combined 20 × Inert → 1 Restless", time: "2 days ago",  tx: "0x2c8e...5531" },
  { type: "trade",   label: "TRADE",      col: ORANGE, desc: "Bought 2 × Restless for 0.008 Ξ", time: "3 days ago",  tx: "0x7a1d...8840" },
];

export function ProfileModal({ onClose }) {
  const [filter, setFilter] = useState("all");
  const [copied, setCopied] = useState(false);

  const FILTERS = ["ALL", "MINT", "COMBINE", "FORGE", "TRADE"];
  const filtered = filter === "all"
    ? FEED_DATA
    : FEED_DATA.filter(i => filter === "forge" ? i.type.startsWith("forge") : i.type === filter);

  function copyAddr() {
    navigator.clipboard.writeText("0x4f3a9b2e7c8d1f4a5e6b3c9d2e7f8a1b4c5d6e21").catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <ModalShell onClose={onClose} width={620}>
      {/* Header */}
      <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 11, color: GOLD, letterSpacing: 1, textShadow: `2px 2px 0 ${GOLD_DK}`, marginBottom: 6 }}>
              vitalik.eth
            </div>
            <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 12, color: CREAM, opacity: .45, letterSpacing: .5, display: "flex", alignItems: "center", gap: 8 }}>
              0x4f3a...d6e21
              <button onClick={copyAddr} style={{
                fontFamily: "'Press Start 2P', monospace", fontSize: 5,
                color: CREAM, opacity: .45, background: "none",
                border: "1px solid rgba(255,255,255,.1)", padding: "3px 7px",
                cursor: "pointer", letterSpacing: 1,
              }}>{copied ? "COPIED" : "COPY"}</button>
            </div>
          </div>
          <div style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: CREAM,
            border: `1px solid ${GOLD_DK}`, padding: "6px 12px", letterSpacing: 1,
            opacity: .8, background: `rgba(200,168,75,.06)`, flexShrink: 0, alignSelf: "flex-start",
          }}>SEASON 1 PLAYER</div>
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", border: "1px solid rgba(255,255,255,.06)", background: "rgba(0,0,0,.2)" }}>
          {[
            { label: "MINTED", val: "2,840" },
            { label: "BURNED", val: "680" },
            { label: "COMBINED", val: "14" },
            { label: "FORGED", val: "7" },
            { label: "TRADED", val: "22" },
          ].map((s, i) => (
            <div key={s.label} style={{
              flex: 1, padding: "10px 14px", textAlign: "center",
              borderRight: i < 4 ? "1px solid rgba(255,255,255,.05)" : "none",
            }}>
              <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5, color: CREAM, opacity: .35, letterSpacing: 1, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontFamily: "'VT323', monospace", fontSize: 22, color: CREAM, opacity: .85 }}>{s.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Holdings */}
      <div style={{ padding: "18px 28px", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: CREAM, opacity: .4, letterSpacing: 2, marginBottom: 10 }}>▸ CURRENT HOLDINGS</div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {HOLDINGS.map(h => (
            <div key={h.t} style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              padding: "8px 10px", border: `1px solid ${h.col}`,
              background: "rgba(0,0,0,.2)", minWidth: 72,
              opacity: h.qty === 0 ? .35 : 1,
            }}>
              <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5, color: h.col, opacity: .5, letterSpacing: 1 }}>TIER {h.t}</div>
              <div style={{ fontFamily: "'VT323', monospace", fontSize: 14, color: h.col, letterSpacing: .5, textAlign: "center" }}>{h.name}</div>
              <div style={{ fontFamily: "'VT323', monospace", fontSize: 18, color: h.col, opacity: .7 }}>{h.qty}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Activity */}
      <div style={{ padding: "18px 28px 24px" }}>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: CREAM, opacity: .4, letterSpacing: 2, marginBottom: 10 }}>▸ ACTIVITY</div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {FILTERS.map(f => {
            const active = filter === f.toLowerCase();
            return (
              <button
                key={f}
                className="pf-filter-btn"
                onClick={() => setFilter(f.toLowerCase())}
                style={{
                  fontFamily: "'Press Start 2P', monospace", fontSize: 5, letterSpacing: 1,
                  padding: "4px 9px",
                  border: active ? `1px solid ${GOLD_DK}` : "1px solid rgba(255,255,255,.1)",
                  background: active ? "rgba(200,168,75,.08)" : "rgba(0,0,0,.2)",
                  color: active ? GOLD : CREAM,
                  opacity: active ? 1 : .55,
                  cursor: "pointer",
                }}
              >{f}</button>
            );
          })}
        </div>

        {/* Feed */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {filtered.map((item, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "auto 1fr auto",
              gap: 12, alignItems: "start",
              padding: "10px 0",
              borderBottom: i < filtered.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none",
            }}>
              <div style={{
                fontFamily: "'Press Start 2P', monospace", fontSize: 5, letterSpacing: 1,
                padding: "3px 7px", border: `1px solid ${item.col}44`,
                color: item.col, whiteSpace: "nowrap", marginTop: 2,
              }}>{item.label}</div>
              <div>
                <div style={{ fontFamily: "'VT323', monospace", fontSize: 18, color: CREAM, opacity: .85, lineHeight: 1.3, marginBottom: 3 }}>{item.desc}</div>
                <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5, color: CREAM, opacity: .35, letterSpacing: .5 }}>{item.time}</div>
              </div>
              <a href="#" style={{
                fontFamily: "'Courier Prime', monospace", fontSize: 10,
                color: GOLD, opacity: .55, textDecoration: "none",
                whiteSpace: "nowrap", marginTop: 4, display: "block", textAlign: "right",
              }}
                onMouseEnter={e => { e.currentTarget.style.opacity = 1; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = .55; }}
              >{item.tx} ↗</a>
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}

// ═══════════════════════════════════════════════════════════════
// EXPORT — MODAL CONTROLLER (convenience wrapper)
// Usage: <Modals open="rules|leaderboard|profile|null" onClose={fn} />
// ═══════════════════════════════════════════════════════════════
export default function Modals({ open, onClose, onOpenProfile, connectedAddress }) {
  return (
    <>
      <style>{MODAL_CSS}</style>
      {open === "rules"       && <GameRulesModal   onClose={onClose} />}
      {open === "leaderboard" && <LeaderboardModal onClose={onClose} onOpenProfile={onOpenProfile} connectedAddress={connectedAddress} />}
      {open === "profile"     && <ProfileModal     onClose={onClose} />}
    </>
  );
}

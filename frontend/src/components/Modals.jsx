import { useState } from "react";

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
          Once a day, a window opens. You have <span style={{ color: GOLD_LT }}>8 hours</span> to enter.<br /><br />
          State how many blocks you want. The window closes.<br />
          What you receive is determined then — not before.<br />
          No one gets an advantage by moving faster.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["0.00025 ETH per block", "Up to 500 per player", "50,000 daily cap", "Quiet days roll over"].map(s => (
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
          Burn <span style={{ color: GOLD_LT }}>10</span> — a 10% chance of something rarer.<br />
          Burn <span style={{ color: GOLD_LT }}>99</span> — a 99% chance. But 99 blocks gone either way.<br /><br />
          The Forge is indifferent to your hope.<br />
          It only counts what you commit.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Burn N blocks = N% chance", "Fail = all blocks destroyed", "Applies to Tiers 2–7"].map(s => (
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
          {["5% royalty on all trades", "All blocks are ERC-1155"].map(s => (
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
const TIER_COLS = ["#9ba8b0", "#8fa8c8", "#8fb87a", "#c8c870", "#c87a7a", "#c8a84b"];

const LB_DATA = [
  { rank: 1,  ens: "vitalik.eth",      wallet: "0x4f3a...8c21", tiers: [1,1,1,1,1,1], blocks: 2160,  me: true },
  { rank: 2,  ens: "cryptohunter.eth", wallet: "0x8b2d...f419", tiers: [1,1,1,1,1,0], blocks: 4820 },
  { rank: 3,  ens: null,               wallet: "0x1c9e...7744", tiers: [1,1,1,1,0,0], blocks: 8340 },
  { rank: 4,  ens: "blockwatcher.eth", wallet: "0x3a7f...2281", tiers: [1,1,1,1,0,0], blocks: 6210 },
  { rank: 5,  ens: null,               wallet: "0x9d4c...bb12", tiers: [1,1,1,0,0,0], blocks: 12400 },
  { rank: 6,  ens: "collector99.eth",  wallet: "0x6e1a...34df", tiers: [1,1,1,0,0,0], blocks: 9870 },
  { rank: 7,  ens: null,               wallet: "0x2f8b...a901", tiers: [1,1,0,0,0,0], blocks: 21000 },
  { rank: 8,  ens: null,               wallet: "0x5c3d...6622", tiers: [1,1,0,0,0,0], blocks: 18500 },
  { rank: 9,  ens: "deepminer.eth",    wallet: "0x7a0e...c993", tiers: [1,1,0,0,0,0], blocks: 15200 },
  { rank: 10, ens: null,               wallet: "0x4b9f...1147", tiers: [1,0,0,0,0,0], blocks: 44000 },
];

export function LeaderboardModal({ onClose, onOpenProfile }) {
  return (
    <ModalShell onClose={onClose} width={680}>
      {/* Header */}
      <div style={{ padding: "22px 28px 16px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 11, color: GOLD, letterSpacing: 1, textShadow: `2px 2px 0 ${GOLD_DK}` }}>⬡ LEADERBOARD</div>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: CREAM, opacity: .4, letterSpacing: 1 }}>TOP COLLECTORS · SEASON 1</div>
      </div>

      {/* Season stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
        {[
          { label: "TOTAL MINTED", val: "1,284,440" },
          { label: "TOTAL BURNED", val: "312,880" },
          { label: "PRIZE POOL",   val: "Ξ 12.437", gold: true },
          { label: "WINDOW ROLLOVER", val: "+4,200" },
        ].map(s => (
          <div key={s.label} style={{ padding: "12px 20px", borderRight: "1px solid rgba(255,255,255,.05)" }}>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5, color: CREAM, opacity: .4, letterSpacing: 1, marginBottom: 5 }}>{s.label}</div>
            <div style={{ fontFamily: "'VT323', monospace", fontSize: 22, color: s.gold ? GOLD_LT : CREAM, letterSpacing: .5 }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ padding: "0 0 16px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["#", "PLAYER", "TIERS HELD", "TOTAL BLOCKS"].map((h, i) => (
                <th key={h} style={{
                  fontFamily: "'Press Start 2P', monospace", fontSize: 6,
                  color: CREAM, opacity: .35, letterSpacing: 1,
                  padding: "10px 20px", textAlign: i === 3 ? "right" : "left",
                  borderBottom: "1px solid rgba(255,255,255,.05)",
                  paddingRight: i === 3 ? 24 : undefined,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LB_DATA.map(p => (
              <tr
                key={p.rank}
                className="lb-row"
                onClick={onOpenProfile}
                style={{ background: p.me ? "rgba(200,168,75,.07)" : "transparent" }}
              >
                <td style={{ padding: "9px 20px", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                  <span style={{ fontFamily: "'VT323', monospace", fontSize: 20, color: p.rank <= 3 ? GOLD : CREAM, opacity: p.rank <= 3 ? 1 : .55 }}>{p.rank}</span>
                </td>
                <td style={{ padding: "9px 20px", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                  {p.ens
                    ? <div><div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: CREAM, opacity: .9 }}>{p.ens}</div>
                        <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 11, color: CREAM, opacity: .45, marginTop: 2 }}>{p.wallet}</div></div>
                    : <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 11, color: CREAM, opacity: .7 }}>{p.wallet}</div>
                  }
                  {p.me && <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5, color: GOLD, background: "rgba(200,168,75,.15)", border: `1px solid ${GOLD_DK}`, padding: "2px 6px", marginLeft: 8, letterSpacing: 1 }}>YOU</span>}
                </td>
                <td style={{ padding: "9px 20px", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {p.tiers.map((held, i) => (
                      <div key={i} style={{
                        width: 9, height: 9,
                        background: held ? TIER_COLS[i] : "transparent",
                        border: held ? "none" : "1px solid rgba(255,255,255,.2)",
                      }} />
                    ))}
                  </div>
                </td>
                <td style={{ padding: "9px 24px 9px 20px", borderBottom: "1px solid rgba(255,255,255,.04)", textAlign: "right" }}>
                  <span style={{ fontFamily: "'VT323', monospace", fontSize: 20, color: CREAM, opacity: .65 }}>{p.blocks.toLocaleString()}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
export default function Modals({ open, onClose, onOpenProfile }) {
  return (
    <>
      <style>{MODAL_CSS}</style>
      {open === "rules"       && <GameRulesModal   onClose={onClose} />}
      {open === "leaderboard" && <LeaderboardModal onClose={onClose} onOpenProfile={onOpenProfile} />}
      {open === "profile"     && <ProfileModal     onClose={onClose} />}
    </>
  );
}

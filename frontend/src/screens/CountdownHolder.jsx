import { useSafeWrite } from '../hooks/useSafeWrite'
import { useState, useEffect } from "react";
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useDisconnect } from "wagmi";
import { useBalance } from "wagmi";
import { CONTRACTS } from "../config/wagmi";
import { TOKEN_ABI, COUNTDOWN_ABI } from "../abis";
import {
  WOOD_LIGHT as WOOD, GOLD, GOLD_DK, GOLD_LT,
  EMBER, EMBER_LT, CREAM, INK_DEEP as INK, GREEN,
} from '../config/design-tokens';

const TIER_META = {
  7: { name: "THE INERT",      color: "#888888" },
  6: { name: "THE RESTLESS",   color: "#ff4444" },
  5: { name: "THE REMEMBERED", color: "#33aaff" },
  4: { name: "THE ORDERED",    color: "#ffcc33" },
  3: { name: "THE CHAOTIC",    color: "#cc66ff" },
  2: { name: "THE WILLFUL",    color: "#ff6622" },
};

const HOLDER_CSS = `
  .holder-root { cursor: crosshair; }
  @keyframes ember-breathe {
    0%,100% { opacity:.7; transform:translateX(-50%) scaleX(1); }
    50%     { opacity:1;  transform:translateX(-50%) scaleX(1.25); }
  }
  @keyframes border-flicker {
    0%,94%,100% { border-color: ${EMBER}; }
    95%  { border-color: transparent; }
    97%  { border-color: ${EMBER}; }
    98%  { border-color: transparent; }
    99%  { border-color: ${EMBER}; }
  }
  @keyframes prize-glow {
    0%,100% { text-shadow: 0 0 20px rgba(200,168,75,.3); }
    50%     { text-shadow: 0 0 50px rgba(200,168,75,.65); }
  }
  @keyframes pulse-dot {
    0%,100% { opacity:1; transform:scale(1); }
    50%     { opacity:0.4; transform:scale(0.6); }
  }
  @keyframes sep-blink {
    0%,100% { opacity:.35; }
    50%     { opacity:.08; }
  }
  @keyframes urgent-pulse {
    0%,100% { color: ${EMBER_LT}; text-shadow: 0 0 20px rgba(255,85,68,.6); }
    50%     { color: #fff; text-shadow: 0 0 40px rgba(255,85,68,.9); }
  }
  .choice-card { transition: background .12s, box-shadow .12s, transform .06s; }
  .choice-card:hover { transform: scale(1.01); }
  .choice-card:active { transform: scale(0.99); }
  .confirm-btn { transition: transform .05s, box-shadow .05s; }
  .confirm-btn:active { transform: translate(2px,2px) !important; box-shadow: 1px 1px 0 ${INK} !important; }
`;

// ═══════════════════════════════════════════════════════════════
// LIVE COUNTDOWN CLOCK
// ═══════════════════════════════════════════════════════════════
function useCountdown(initialSeconds) {
  const [secs, setSecs] = useState(initialSeconds);
  useEffect(() => { setSecs(initialSeconds); }, [initialSeconds]);
  useEffect(() => {
    const t = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return { d, h, m, s, total: secs };
}

function pad(n) { return String(n).padStart(2, "0"); }

function CountdownClock({ seconds, urgent = false }) {
  const { d, h, m, s } = useCountdown(seconds);
  const col = urgent ? EMBER_LT : CREAM;
  const units = d > 0
    ? [{ v: d, l: "DAYS" }, { v: h, l: "HRS" }, { v: m, l: "MIN" }, { v: s, l: "SEC" }]
    : [{ v: h, l: "HRS" }, { v: m, l: "MIN" }, { v: s, l: "SEC" }];

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "baseline", justifyContent: "center" }}>
      {units.map((u, i) => (
        <div key={u.l} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{
              fontFamily: "'VT323', monospace", fontSize: 40, color: col, lineHeight: 1,
              animation: urgent ? "urgent-pulse 1s ease-in-out infinite" : "none",
            }}>{pad(u.v)}</div>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5, color: CREAM, opacity: .6, letterSpacing: 1 }}>{u.l}</div>
          </div>
          {i < units.length - 1 && (
            <div style={{
              fontFamily: "'VT323', monospace", fontSize: 36, color: EMBER,
              opacity: .65, lineHeight: 1, paddingBottom: 14,
              animation: "sep-blink 1s step-end infinite",
            }}>:</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// HOLDINGS ROW — live data
// ═══════════════════════════════════════════════════════════════
function HoldingsRow({ balances }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 24, flexWrap: "wrap" }}>
      {[7, 6, 5, 4, 3, 2].map(tier => {
        const meta = TIER_META[tier];
        const qty = balances?.[tier] ?? 0;
        return (
          <div key={tier} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            padding: "9px 10px",
            border: `1px solid ${meta.color}44`,
            background: "rgba(0,0,0,.25)",
            flex: 1, minWidth: 90,
          }}>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5, color: meta.color, opacity: .7, letterSpacing: 1 }}>T{tier}</div>
            <div style={{ fontFamily: "'VT323', monospace", fontSize: 15, color: meta.color, letterSpacing: .5, textAlign: "center" }}>{meta.name}</div>
            <div style={{ fontFamily: "'VT323', monospace", fontSize: 18, color: meta.color, opacity: .7 }}>×{qty}</div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PRIZE BLOCK — live treasury
// ═══════════════════════════════════════════════════════════════
function PrizeBlock({ ethAmount }) {
  const display = ethAmount ?? 0;
  const usd = (display * 2890).toLocaleString(undefined, { maximumFractionDigits: 0 });
  return (
    <div style={{
      border: `2px solid ${GOLD_DK}`, background: "rgba(0,0,0,.35)",
      padding: "22px 28px", marginBottom: 24,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap",
    }}>
      <div>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: GOLD, opacity: .8, letterSpacing: 2, marginBottom: 8 }}>PRIZE POOL</div>
        <div style={{
          fontFamily: "'VT323', monospace", fontSize: "clamp(52px,8vw,80px)",
          color: GOLD_LT, lineHeight: 1, letterSpacing: 2,
          animation: "prize-glow 3s ease-in-out infinite",
        }}>Ξ {display.toFixed(4)}</div>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: GOLD, opacity: .85, marginTop: 6, letterSpacing: 1 }}>
          ≈ ${usd} USD
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: CREAM, opacity: .75, letterSpacing: 1, marginBottom: 10 }}>IF YOU WIN</div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "flex-end", gap: 8, marginBottom: 6 }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: GOLD, opacity: .7 }}>CLAIM</div>
          <div style={{ fontFamily: "'VT323', monospace", fontSize: 22, color: GOLD_LT }}>Ξ {display.toFixed(4)}</div>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "flex-end", gap: 8 }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: EMBER_LT, opacity: .7 }}>SACRIFICE</div>
          <div style={{ fontFamily: "'VT323', monospace", fontSize: 22, color: EMBER_LT }}>Ξ {(display / 2).toFixed(4)}</div>
        </div>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5, color: CREAM, opacity: .85, marginTop: 6, letterSpacing: .5 }}>
          50% you + Origin · 40% top 100 · 10% S2
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMMUNITY VOTE — live data
// ═══════════════════════════════════════════════════════════════
function VoteBlock({ burnVotes = 0, claimVotes = 0 }) {
  const total = burnVotes + claimVotes;
  const claimPct = total === 0 ? 50 : Math.round((claimVotes / total) * 100);
  const sacPct   = 100 - claimPct;

  return (
    <div style={{
      border: "1px solid rgba(255,255,255,.06)", background: "rgba(0,0,0,.22)",
      padding: "18px 20px", marginBottom: 24,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: CREAM, opacity: .75, letterSpacing: 2 }}>COMMUNITY VOTE</div>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: CREAM, opacity: .8, letterSpacing: 1 }}>PUBLIC SIGNAL ONLY</div>
      </div>

      {[
        { label: "CLAIM",     pct: claimPct, fill: `repeating-linear-gradient(90deg,${GOLD} 0,${GOLD} 8px,${GOLD_DK} 8px,${GOLD_DK} 10px)`, textCol: GOLD },
        { label: "SACRIFICE", pct: sacPct,   fill: `repeating-linear-gradient(90deg,${EMBER} 0,${EMBER} 8px,#881f14 8px,#881f14 10px)`,    textCol: EMBER_LT },
      ].map(v => (
        <div key={v.label} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 9 }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: v.textCol, letterSpacing: 1, width: 72, flexShrink: 0 }}>{v.label}</div>
          <div style={{ flex: 1, height: 10, background: "rgba(0,0,0,.4)", border: "1px solid rgba(255,255,255,.06)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${v.pct}%`, background: v.fill, transition: "width .6s" }} />
          </div>
          <div style={{ fontFamily: "'VT323', monospace", fontSize: 20, color: v.textCol, width: 44, textAlign: "right", flexShrink: 0 }}>{v.pct}%</div>
        </div>
      ))}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: CREAM, opacity: .8, letterSpacing: 1 }}>
          {total} vote{total !== 1 ? "s" : ""} cast
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: GREEN, opacity: .8 }}>
          <div style={{ width: 5, height: 5, background: GREEN, animation: "pulse-dot 1.5s ease-in-out infinite" }} />
          LIVE
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PRE-SELECT CHOICE — with real contract calls
// ═══════════════════════════════════════════════════════════════
function ChoiceSection({ ethAmount, secondsRemaining }) {
  const [selected, setSelected]   = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [txError, setTxError]     = useState(null);

  const expired = secondsRemaining <= 0;
  const display = ethAmount ?? 0;

  const { writeContract, data: txHash, isPending } = useSafeWrite();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess) setConfirmed(true);
  }, [isSuccess]);

  function executeChoice() {
    if (!selected || !expired) return;
    setTxError(null);
    writeContract({
      address: CONTRACTS.TOKEN, chainId: 84532,
      abi: TOKEN_ABI,
      functionName: selected === "claim" ? "claimTreasury" : "sacrifice",
      args: [],
    }, {
      onError: (e) => setTxError(e.shortMessage || "Transaction failed"),
    });
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: CREAM, opacity: .7, letterSpacing: 2, marginBottom: 6 }}>
          {expired ? "MAKE YOUR CHOICE" : "PRE-SELECT YOUR CHOICE"}
        </div>
        <div style={{ fontFamily: "'VT323', monospace", fontSize: 18, color: CREAM, opacity: .8, letterSpacing: 1 }}>
          {expired
            ? "The countdown has expired. Execute your choice now."
            : "Only revealed when the timer expires. Community sees the vote — not your choice."}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {/* CLAIM */}
        <div className="choice-card" onClick={() => !confirmed && setSelected("claim")} style={{
          border: `2px solid ${selected === "claim" ? GOLD : "rgba(200,168,75,.3)"}`,
          background: selected === "claim" ? "rgba(200,168,75,.09)" : "rgba(200,168,75,.03)",
          boxShadow: selected === "claim" ? `0 0 24px rgba(200,168,75,.25)` : "none",
          padding: 20, cursor: confirmed ? "default" : "pointer", position: "relative",
        }}>
          {selected === "claim" && <div style={{ position: "absolute", top: 10, right: 12, fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: GOLD }}>✓</div>}
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5, color: GOLD, letterSpacing: 2, marginBottom: 8, opacity: .85 }}>OPTION A</div>
          <div style={{ fontFamily: "'VT323', monospace", fontSize: 26, color: GOLD_LT, lineHeight: 1.2, marginBottom: 10 }}>CLAIM THE TREASURY</div>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: CREAM, opacity: .65, lineHeight: 2.4, marginBottom: 12 }}>
            Take the full prize pool immediately. Game ends. Season 2 begins.
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,.06)", paddingTop: 10 }}>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5, color: GOLD, opacity: .8, letterSpacing: 1, marginBottom: 4 }}>YOU RECEIVE</div>
            <div style={{ fontFamily: "'VT323', monospace", fontSize: 22, color: GOLD, lineHeight: 1.3 }}>Ξ {display.toFixed(4)}</div>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5, color: CREAM, opacity: .75, marginTop: 4, letterSpacing: .5, lineHeight: 1.8 }}>Full treasury · Immediate transfer</div>
          </div>
        </div>

        {/* SACRIFICE */}
        <div className="choice-card" onClick={() => !confirmed && setSelected("sacrifice")} style={{
          border: `2px solid ${selected === "sacrifice" ? EMBER : "rgba(204,51,34,.3)"}`,
          background: selected === "sacrifice" ? "rgba(204,51,34,.09)" : "rgba(204,51,34,.03)",
          boxShadow: selected === "sacrifice" ? `0 0 24px rgba(204,51,34,.25)` : "none",
          padding: 20, cursor: confirmed ? "default" : "pointer", position: "relative",
        }}>
          {selected === "sacrifice" && <div style={{ position: "absolute", top: 10, right: 12, fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: EMBER_LT }}>✓</div>}
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5, color: EMBER_LT, letterSpacing: 2, marginBottom: 8, opacity: .85 }}>OPTION B</div>
          <div style={{ fontFamily: "'VT323', monospace", fontSize: 26, color: EMBER_LT, lineHeight: 1.2, marginBottom: 10 }}>SACRIFICE TO THE HUNT</div>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: CREAM, opacity: .65, lineHeight: 2.4, marginBottom: 12 }}>
            Burn Tiers 2–7. Mint The Origin. Split treasury with the community.
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,.06)", paddingTop: 10 }}>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5, color: EMBER_LT, opacity: .8, letterSpacing: 1, marginBottom: 4 }}>YOU RECEIVE</div>
            <div style={{ fontFamily: "'VT323', monospace", fontSize: 22, color: EMBER_LT, lineHeight: 1.3 }}>Ξ {(display / 2).toFixed(4)} + The Origin</div>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5, color: CREAM, opacity: .75, marginTop: 4, letterSpacing: .5, lineHeight: 1.8 }}>50% you + Origin · 40% top 100 · 10% S2 seed</div>
          </div>
        </div>
      </div>

      {/* Status / confirm / execute */}
      {!confirmed ? (
        <div style={{
          border: `1px solid ${selected ? (selected === "claim" ? `${GOLD}66` : `${EMBER}66`) : "rgba(255,255,255,.08)"}`,
          padding: "14px 18px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
          background: "rgba(0,0,0,.2)",
        }}>
          <div>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: CREAM, opacity: .65, letterSpacing: 1, marginBottom: 4 }}>
              {selected ? (expired ? "READY TO EXECUTE" : "CHOICE SELECTED — NOT YET LOCKED") : "NO CHOICE SELECTED"}
            </div>
            <div style={{ fontFamily: "'VT323', monospace", fontSize: 16, color: CREAM, opacity: .7 }}>
              {selected
                ? expired ? "Click to execute on-chain now" : "Click confirm to lock your pre-selection"
                : "Select an option above"}
            </div>
          </div>
          <button
            className="confirm-btn"
            onClick={expired ? executeChoice : () => selected && setConfirmed(true)}
            disabled={!selected || isPending}
            style={{
              fontFamily: "'Press Start 2P', monospace", fontSize: 6.5, letterSpacing: 1,
              padding: "10px 20px",
              background: selected ? (expired ? EMBER : GOLD) : "rgba(0,0,0,.3)",
              color: selected ? INK : "rgba(255,255,255,.15)",
              border: selected ? `2px solid ${expired ? "#881f14" : GOLD_DK}` : "2px solid rgba(255,255,255,.06)",
              boxShadow: selected ? `3px 3px 0 ${INK}` : "none",
              cursor: selected && !isPending ? "pointer" : "not-allowed",
              whiteSpace: "nowrap",
            }}
          >
            {isPending ? "CONFIRM IN WALLET…" : expired ? "EXECUTE NOW →" : "LOCK IN →"}
          </button>
        </div>
      ) : (
        <div style={{
          border: `1px solid ${selected === "claim" ? `${GOLD}66` : `${EMBER}66`}`,
          padding: "14px 18px",
          background: selected === "claim" ? "rgba(200,168,75,.06)" : "rgba(204,51,34,.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 16 }}>{selected === "claim" ? "⬡" : "★"}</div>
            <div>
              <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: selected === "claim" ? GOLD : EMBER_LT, letterSpacing: 1, marginBottom: 4 }}>
                ✓ {expired ? "EXECUTED:" : "PRE-SELECTION LOCKED:"} {selected?.toUpperCase()}
              </div>
              <div style={{ fontFamily: "'VT323', monospace", fontSize: 16, color: CREAM, opacity: .7 }}>
                {expired ? "Transaction confirmed. Well played." : "Your choice is sealed. Community sees only the vote — not your decision."}
              </div>
            </div>
          </div>
          {!expired && (
            <button onClick={() => setConfirmed(false)} style={{
              fontFamily: "'Press Start 2P', monospace", fontSize: 6, letterSpacing: 1,
              padding: "8px 14px", flexShrink: 0,
              background: "rgba(0,0,0,.3)", color: "rgba(255,255,255,.5)",
              border: "1px solid rgba(255,255,255,.15)", cursor: "pointer",
            }}
              onMouseEnter={e => { e.currentTarget.style.color = CREAM; e.currentTarget.style.borderColor = "rgba(255,255,255,.4)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,.5)"; e.currentTarget.style.borderColor = "rgba(255,255,255,.15)"; }}
            >← CHANGE</button>
          )}
        </div>
      )}

      {txError && (
        <div style={{
          marginTop: 10, padding: "10px 14px",
          fontFamily: "'Press Start 2P', monospace", fontSize: 6,
          color: EMBER_LT, background: "rgba(204,51,34,.08)",
          border: "1px solid rgba(204,51,34,.3)",
        }}>{txError}</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN — COUNTDOWN HOLDER SCREEN
// ═══════════════════════════════════════════════════════════════
export default function CountdownHolder({ onBack }) {
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  // ── Read countdown start time from Token ─────────────────
  const { data: countdownStartTime } = useReadContract({
    address: CONTRACTS.TOKEN, chainId: 84532,
    abi: TOKEN_ABI,
    functionName: "countdownStartTime",
    watch: true,
  });

  // ── Read player balances ──────────────────────────────────
  const { data: balancesRaw } = useReadContract({
    address: CONTRACTS.TOKEN, chainId: 84532,
    abi: TOKEN_ABI,
    functionName: "balancesOf",
    args: [address],
    enabled: !!address,
    watch: true,
  });

  // balancesOf returns uint256[8], index = tier id
  const balances = {};
  if (balancesRaw) {
    for (let i = 1; i <= 7; i++) {
      balances[i] = Number(balancesRaw[i]);
    }
  }

  // ── Read treasury ETH balance ─────────────────────────────
  const { data: treasuryBalanceData } = useBalance({
  address: CONTRACTS.TREASURY, chainId: 84532,
  query: { refetchInterval: 5000 },
});
  const ethAmount = treasuryBalanceData?.value
  ? parseFloat(treasuryBalanceData.value.toString()) / 1e18
  : 0;

  // ── Read votes from Countdown contract ────────────────────
  const { data: countdownInfo } = useReadContract({
    address: CONTRACTS.COUNTDOWN, chainId: 84532,
    abi: COUNTDOWN_ABI,
    functionName: "getCountdownInfo",
    watch: true,
  });

  // getCountdownInfo returns: active, holder, startTime, endTime, remaining, burnVotes, claimVotes
  const burnVotes  = countdownInfo ? Number(countdownInfo[5]) : 0;
  const claimVotes = countdownInfo ? Number(countdownInfo[6]) : 0;

  // ── Calculate seconds remaining ───────────────────────────
  const countdownEndTime = countdownInfo ? Number(countdownInfo[3]) : 0;
  const secondsRemaining = (() => {
    if (!countdownEndTime) return 0;
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, countdownEndTime - now);
  })();

  const urgent = secondsRemaining < 3600;

  // ── Short address display ─────────────────────────────────
  const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—";

  return (
    <div className="holder-root" style={{
      minHeight: "100vh",
      background: "#07120d",
      backgroundImage: `
        radial-gradient(ellipse 70% 40% at 50% 0%, rgba(204,51,34,0.14) 0%, transparent 70%),
        radial-gradient(ellipse 100% 100% at 50% 50%, #0e2a1a 0%, #07120d 100%),
        repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px),
        repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px)
      `,
      fontFamily: "'Courier Prime', monospace", color: CREAM, position: "relative",
    }}>
      <style>{HOLDER_CSS}</style>

      {/* Ember glow */}
      <div style={{
        position: "fixed", top: -60, left: "50%", transform: "translateX(-50%)",
        width: 700, height: 220,
        background: "radial-gradient(ellipse, rgba(204,51,34,0.2) 0%, transparent 70%)",
        animation: "ember-breathe 4s ease-in-out infinite", zIndex: 1, pointerEvents: "none",
      }} />

      {/* CRT scanlines */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1,
        background: "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.05) 2px,rgba(0,0,0,0.05) 4px)",
      }} />

      {/* Wood frame */}
      <div style={{ position:"fixed", top:0, left:0, right:0, height:18, background:WOOD, borderBottom:`3px solid ${GOLD_DK}`, zIndex:20 }} />
      <div style={{ position:"fixed", bottom:0, left:0, right:0, height:18, background:WOOD, borderTop:`3px solid ${GOLD_DK}`, zIndex:20 }} />
      <div style={{ position:"fixed", top:0, left:0, bottom:0, width:18, background:WOOD, borderRight:`3px solid ${GOLD_DK}`, zIndex:20 }} />
      <div style={{ position:"fixed", top:0, right:0, bottom:0, width:18, background:WOOD, borderLeft:`3px solid ${GOLD_DK}`, zIndex:20 }} />

      {/* Header */}
      <div style={{
        position: "relative", zIndex: 10, margin: "18px 18px 0", background: WOOD,
        borderBottom: `3px solid ${INK}`, padding: "0 24px", height: 52,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 13, color: GOLD, textShadow: `2px 2px 0 ${GOLD_DK}`, letterSpacing: 1 }}>
          BLOK<span style={{ color: CREAM, opacity: .8 }}>HUNT</span>
        </div>
        <button onClick={() => disconnect()} style={{
        fontFamily: "'Press Start 2P', monospace", fontSize: 6,
        background: "transparent", color: "rgba(255,255,255,0.4)",
        border: "1px solid rgba(255,255,255,0.15)", padding: "6px 12px",
        cursor: "pointer", letterSpacing: 1,
        }}>DISCONNECT</button>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: EMBER_LT,
            border: "1px solid rgba(204,51,34,.4)", padding: "6px 12px",
            background: "rgba(204,51,34,.08)", letterSpacing: 1,
          }}>
            <div style={{ width: 6, height: 6, background: EMBER_LT, animation: "pulse-dot 1.2s ease-in-out infinite" }} />
            MINTING LOCKED
          </div>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: CREAM, border: "1px solid rgba(255,255,255,.15)", padding: "6px 12px", opacity: .7 }}>
            {shortAddr}
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ position: "relative", zIndex: 5, maxWidth: 860, margin: "0 auto", padding: "28px 36px 80px" }}>

        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: CREAM, opacity: .6, letterSpacing: 3, marginBottom: 10 }}>
          YOUR COUNTDOWN
        </div>

        {/* Holder alert */}
        <div style={{
          border: `2px solid ${EMBER}`, background: "rgba(204,51,34,.06)",
          padding: "22px 24px 20px", marginBottom: 6,
          position: "relative", overflow: "hidden",
          animation: "border-flicker 8s ease-in-out infinite",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, marginBottom: 18, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: EMBER_LT, letterSpacing: 2, opacity: .7, marginBottom: 10 }}>
                ● YOU ARE THE COUNTDOWN HOLDER
              </div>
              <div style={{ fontFamily: "'VT323', monospace", fontSize: 30, color: CREAM, lineHeight: 1.25, letterSpacing: 1, marginBottom: 10 }}>
                You hold all 6 tiers.<br/>
                <span style={{ color: GOLD_LT }}>The treasury is within reach.</span>
              </div>
              <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: CREAM, opacity: .7, lineHeight: 2.4, letterSpacing: .5 }}>
                Keep all 6 tiers until the timer expires.<br/>
                You will then choose: Claim or Sacrifice.
              </div>
            </div>

            <div style={{
              flexShrink: 0, textAlign: "center",
              border: "1px solid rgba(204,51,34,.35)", background: "rgba(0,0,0,.3)",
              padding: "14px 20px", minWidth: 180,
            }}>
              <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: EMBER_LT, opacity: .6, letterSpacing: 2, marginBottom: 8 }}>
                TIME REMAINING
              </div>
              <CountdownClock seconds={secondsRemaining} urgent={urgent} />
            </div>
          </div>

          <div style={{ borderTop: "1px solid rgba(204,51,34,.2)", paddingTop: 14, display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ fontSize: 12, flexShrink: 0, marginTop: 2, opacity: .7 }}>⚠</div>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: EMBER_LT, opacity: .85, lineHeight: 2.4, letterSpacing: .5 }}>
              If you sell or combine away a required tier, the countdown resets.{" "}
              <strong style={{ color: CREAM }}>Do not lose a tier.</strong>
            </div>
          </div>
        </div>

        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: CREAM, opacity: .6, letterSpacing: 3, margin: "20px 0 10px" }}>
          YOUR QUALIFYING TIERS
        </div>
        <HoldingsRow balances={balances} />

        <PrizeBlock ethAmount={ethAmount} />

        <VoteBlock burnVotes={burnVotes} claimVotes={claimVotes} />

        <ChoiceSection ethAmount={ethAmount} secondsRemaining={secondsRemaining} />

        {onBack && (
          <button onClick={onBack} style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: 6,
            background: "transparent", color: "rgba(255,255,255,.3)",
            border: "1px solid rgba(255,255,255,.1)", padding: "8px 16px",
            cursor: "pointer", letterSpacing: 1,
          }}>← BACK TO GAME</button>
        )}
      </div>
    </div>
  );
}

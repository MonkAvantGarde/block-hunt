import { useState, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useDisconnect } from "wagmi";
import { useBalance } from "wagmi";
import { CONTRACTS } from "../config/wagmi";
import { TOKEN_ABI, COUNTDOWN_ABI } from "../abis";
import {
  WOOD_LIGHT as WOOD, GOLD, GOLD_DK, GOLD_LT,
  EMBER, EMBER_LT, CREAM, INK_DEEP as INK, GREEN,
} from '../config/design-tokens';

const SPECTATOR_CSS = `
  .spectator-root { cursor: crosshair; }
  @keyframes ember-breathe {
    0%,100% { opacity:.7; transform:translateX(-50%) scaleX(1); }
    50%     { opacity:1;  transform:translateX(-50%) scaleX(1.25); }
  }
  @keyframes prize-glow {
    0%,100% { text-shadow: 0 0 30px rgba(200,168,75,.35), 0 0 60px rgba(200,168,75,.15); }
    50%     { text-shadow: 0 0 60px rgba(200,168,75,.7),  0 0 120px rgba(200,168,75,.3); }
  }
  @keyframes pulse-dot {
    0%,100% { opacity:1; transform:scale(1); }
    50%     { opacity:0.4; transform:scale(0.6); }
  }
  @keyframes sep-blink {
    0%,100% { opacity:.35; }
    50%     { opacity:.08; }
  }
  @keyframes holder-glow {
    0%,100% { box-shadow: 0 0 0 1px rgba(204,51,34,.3); }
    50%     { box-shadow: 0 0 20px rgba(204,51,34,.4), 0 0 40px rgba(204,51,34,.15); }
  }
  @keyframes ticker-scroll {
    0%   { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
`;

// ═══════════════════════════════════════════════════════════════
// COUNTDOWN CLOCK
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
  return { d, h, m, s };
}

function pad(n) { return String(n).padStart(2, "0"); }

function BigClock({ seconds }) {
  const { d, h, m, s } = useCountdown(seconds);
  const units = d > 0
    ? [{ v: d, l: "DAYS" }, { v: h, l: "HRS" }, { v: m, l: "MIN" }, { v: s, l: "SEC" }]
    : [{ v: h, l: "HRS" }, { v: m, l: "MIN" }, { v: s, l: "SEC" }];

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline", justifyContent: "center" }}>
      {units.map((u, i) => (
        <div key={u.l} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ fontFamily: "'VT323', monospace", fontSize: "clamp(64px,10vw,96px)", color: CREAM, lineHeight: 1 }}>
              {pad(u.v)}
            </div>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: CREAM, opacity: .6, letterSpacing: 1 }}>{u.l}</div>
          </div>
          {i < units.length - 1 && (
            <div style={{
              fontFamily: "'VT323', monospace", fontSize: "clamp(56px,9vw,84px)",
              color: EMBER, opacity: .7, lineHeight: 1, paddingBottom: 20,
              animation: "sep-blink 1s step-end infinite",
            }}>:</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// HOLDER CARD — live data
// ═══════════════════════════════════════════════════════════════
function HolderCard({ holderAddress, startTime }) {
  const short = holderAddress
    ? `${holderAddress.slice(0, 6)}…${holderAddress.slice(-4)}`
    : "—";

  const holderSince = startTime
    ? new Date(Number(startTime) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";

  const TIER_COLORS = {
    7: "#888", 6: "#ff4444", 5: "#33aaff", 4: "#ffcc33", 3: "#cc66ff", 2: "#ff6622",
  };

  return (
    <div style={{
      border: `1px solid ${EMBER}55`, background: "rgba(204,51,34,.06)",
      padding: "20px 24px", marginBottom: 24,
      animation: "holder-glow 3s ease-in-out infinite",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: EMBER_LT, letterSpacing: 2, opacity: .7, marginBottom: 10 }}>
            COUNTDOWN HOLDER
          </div>
          <div style={{ fontFamily: "'VT323', monospace", fontSize: 28, color: CREAM, marginBottom: 6, letterSpacing: 1 }}>
            {short}
          </div>
          <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 11, color: "rgba(255,255,255,.4)" }}>
            Holds all 6 required tiers · Countdown active
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: CREAM, opacity: .6, letterSpacing: 1, marginBottom: 6 }}>HOLDER SINCE</div>
          <div style={{ fontFamily: "'VT323', monospace", fontSize: 20, color: CREAM, opacity: .6 }}>{holderSince}</div>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5.5, color: EMBER_LT, opacity: .8, marginTop: 6, letterSpacing: .5 }}>
            ⚠ Loses status if a tier is sold
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 16, flexWrap: "wrap" }}>
        {[7, 6, 5, 4, 3, 2].map(t => (
          <div key={t} style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: 6,
            color: TIER_COLORS[t], border: `1px solid ${TIER_COLORS[t]}44`,
            padding: "4px 8px", background: "rgba(0,0,0,.3)",
          }}>T{t} ✓</div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PRIZE DISPLAY — live treasury
// ═══════════════════════════════════════════════════════════════
function PrizeDisplay({ eth = 0 }) {
  const usd = (eth * 2890).toLocaleString(undefined, { maximumFractionDigits: 0 });
  return (
    <div style={{
      textAlign: "center", padding: "32px 20px", marginBottom: 24,
      background: "rgba(0,0,0,.2)", border: `1px solid ${GOLD_DK}44`,
    }}>
      <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: GOLD, opacity: .8, letterSpacing: 3, marginBottom: 12 }}>CURRENT PRIZE POOL</div>
      <div style={{
        fontFamily: "'VT323', monospace", fontSize: "clamp(64px,10vw,96px)",
        color: GOLD_LT, lineHeight: 1, animation: "prize-glow 3s ease-in-out infinite", marginBottom: 8,
      }}>Ξ {eth.toFixed(4)}</div>
      <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: GOLD, opacity: .7, letterSpacing: 2 }}>≈ ${usd} USD</div>

      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 20, flexWrap: "wrap" }}>
        {[
          { label: "IF CLAIMED",    value: `Ξ ${eth.toFixed(4)}`,       note: "100% to holder",            col: GOLD },
          { label: "IF SACRIFICED", value: `Ξ ${(eth/2).toFixed(4)}`,   note: "50% holder · 50% community", col: EMBER_LT },
        ].map(p => (
          <div key={p.label} style={{
            border: `1px solid ${p.col}33`, padding: "12px 20px",
            background: "rgba(0,0,0,.25)", textAlign: "center", minWidth: 180,
          }}>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5.5, color: p.col, opacity: .6, letterSpacing: 1, marginBottom: 6 }}>{p.label}</div>
            <div style={{ fontFamily: "'VT323', monospace", fontSize: 28, color: p.col }}>{p.value}</div>
            <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 10, color: "rgba(255,255,255,.3)", marginTop: 4 }}>{p.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMMUNITY VOTE — live data + real castVote()
// ═══════════════════════════════════════════════════════════════
function VoteSection({ burnVotes = 0, claimVotes = 0 }) {
  const total     = burnVotes + claimVotes;
  const claimPct  = total === 0 ? 50 : Math.round((claimVotes / total) * 100);
  const sacPct    = 100 - claimPct;

  const [popup, setPopup]       = useState(null);
  const [voteChoice, setVote]   = useState(null); // true=burn, false=claim
  const [voted, setVoted]       = useState(false);
  const [voteError, setVoteError] = useState(null);

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => { if (isSuccess) { setVoted(true); setPopup(null); } }, [isSuccess]);

  function castVote(burnVote) {
    setVoteError(null);
    writeContract({
      address: CONTRACTS.COUNTDOWN,
      abi: COUNTDOWN_ABI,
      functionName: "castVote",
      args: [burnVote],
    }, {
      onError: (e) => setVoteError(e.shortMessage || "Vote failed"),
    });
  }

  return (
    <>
      {popup && (
        <div onClick={() => setPopup(null)} style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,.75)",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#0e2a1a",
            border: `2px solid ${popup === "claim" ? GOLD : EMBER}`,
            boxShadow: `0 0 40px ${popup === "claim" ? "rgba(200,168,75,.3)" : "rgba(204,51,34,.3)"}`,
            padding: "32px 36px", maxWidth: 380, width: "90%",
            textAlign: "center", cursor: "default",
          }}>
            {voted ? (
              <>
                <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: GREEN, letterSpacing: 2, marginBottom: 14 }}>VOTE CAST</div>
                <div style={{ fontFamily: "'VT323', monospace", fontSize: 24, color: CREAM, lineHeight: 1.4, marginBottom: 18 }}>
                  Your signal is recorded on-chain. The holder's choice remains private until expiry.
                </div>
                <button onClick={() => setPopup(null)} style={{
                  fontFamily: "'Press Start 2P', monospace", fontSize: 7, letterSpacing: 1,
                  background: GOLD, color: INK, border: `2px solid ${INK}`,
                  boxShadow: `3px 3px 0 ${INK}`, padding: "10px 24px", cursor: "pointer",
                }}>CLOSE</button>
              </>
            ) : (
              <>
                <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: popup === "claim" ? GOLD : EMBER_LT, letterSpacing: 2, marginBottom: 14 }}>
                  VOTE {popup.toUpperCase()}
                </div>
                <div style={{ fontFamily: "'VT323', monospace", fontSize: 20, color: CREAM, lineHeight: 1.4, marginBottom: 18 }}>
                  This is a social signal only. One vote per wallet per countdown. The holder's actual choice remains private until expiry.
                </div>
                {voteError && (
                  <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: EMBER_LT, marginBottom: 12 }}>{voteError}</div>
                )}
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  <button onClick={() => setPopup(null)} style={{
                    fontFamily: "'Press Start 2P', monospace", fontSize: 6, letterSpacing: 1,
                    background: "transparent", color: "rgba(255,255,255,.4)",
                    border: "1px solid rgba(255,255,255,.2)", padding: "10px 16px", cursor: "pointer",
                  }}>CANCEL</button>
                  <button
                    onClick={() => castVote(popup === "sacrifice")}
                    disabled={isPending}
                    style={{
                      fontFamily: "'Press Start 2P', monospace", fontSize: 6, letterSpacing: 1,
                      background: popup === "claim" ? GOLD : EMBER,
                      color: INK, border: `2px solid ${INK}`,
                      boxShadow: `3px 3px 0 ${INK}`,
                      padding: "10px 20px", cursor: isPending ? "not-allowed" : "pointer",
                      opacity: isPending ? 0.6 : 1,
                    }}
                  >{isPending ? "CONFIRM…" : "CONFIRM VOTE"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div style={{
        border: "1px solid rgba(255,255,255,.06)", background: "rgba(0,0,0,.2)",
        padding: "20px 24px", marginBottom: 24,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: CREAM, opacity: .7, letterSpacing: 2 }}>COMMUNITY SIGNAL</div>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5.5, color: CREAM, opacity: .8, letterSpacing: 1 }}>
            Holder's actual choice is private until expiry
          </div>
        </div>

        {[
          { label: "CLAIM",     pct: claimPct, fill: `repeating-linear-gradient(90deg,${GOLD} 0,${GOLD} 8px,${GOLD_DK} 8px,${GOLD_DK} 10px)`, col: GOLD_LT },
          { label: "SACRIFICE", pct: sacPct,   fill: `repeating-linear-gradient(90deg,${EMBER} 0,${EMBER} 8px,#881f14 8px,#881f14 10px)`,    col: EMBER_LT },
        ].map(v => (
          <div key={v.label} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: v.col, width: 72, flexShrink: 0 }}>{v.label}</div>
            <div style={{ flex: 1, height: 12, background: "rgba(0,0,0,.4)", border: "1px solid rgba(255,255,255,.06)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${v.pct}%`, background: v.fill, transition: "width .6s" }} />
            </div>
            <div style={{ fontFamily: "'VT323', monospace", fontSize: 22, color: v.col, width: 44, textAlign: "right" }}>{v.pct}%</div>
          </div>
        ))}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 5.5, color: CREAM, opacity: .8, letterSpacing: 1 }}>
            {total} vote{total !== 1 ? "s" : ""}
          </div>
          {!voted ? (
            <div style={{ display: "flex", gap: 8 }}>
              {[{ l: "VOTE CLAIM", col: GOLD, v: "claim" }, { l: "VOTE SACRIFICE", col: EMBER_LT, v: "sacrifice" }].map(b => (
                <button key={b.l} onClick={() => setPopup(b.v)} style={{
                  fontFamily: "'Press Start 2P', monospace", fontSize: 5.5,
                  color: b.col, background: "transparent",
                  border: `1px solid ${b.col}44`, padding: "6px 10px",
                  cursor: "pointer", letterSpacing: .5, transition: "background .1s",
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${b.col}11`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >{b.l}</button>
              ))}
            </div>
          ) : (
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: GREEN, letterSpacing: 1 }}>✓ VOTED</div>
          )}
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// CHALLENGE SECTION — spectator can challenge if they hold all 6 tiers
// ═══════════════════════════════════════════════════════════════
function ChallengeSection({ holderAddress }) {
  const { address } = useAccount();
  const [challengeError, setChallengeError] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Check if spectator holds all 6 tiers
  const { data: hasAll } = useReadContract({
    address: CONTRACTS.TOKEN,
    abi: TOKEN_ABI,
    functionName: "hasAllTiers",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10000 },
  });

  // Read scores for display
  const { data: myScore } = useReadContract({
    address: CONTRACTS.COUNTDOWN,
    abi: COUNTDOWN_ABI,
    functionName: "calculateScore",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!hasAll, refetchInterval: 10000 },
  });

  const { data: holderScore } = useReadContract({
    address: CONTRACTS.COUNTDOWN,
    abi: COUNTDOWN_ABI,
    functionName: "calculateScore",
    args: holderAddress ? [holderAddress] : undefined,
    query: { enabled: !!holderAddress, refetchInterval: 10000 },
  });

  // Read safe period status
  const { data: lastChallengeTime } = useReadContract({
    address: CONTRACTS.COUNTDOWN,
    abi: COUNTDOWN_ABI,
    functionName: "lastChallengeTime",
    query: { refetchInterval: 10000 },
  });

  const { data: safePeriod } = useReadContract({
    address: CONTRACTS.COUNTDOWN,
    abi: COUNTDOWN_ABI,
    functionName: "safePeriod",
    query: { refetchInterval: 60000 },
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess) { setShowConfirm(false); setChallengeError(null); }
  }, [isSuccess]);

  if (!address || !hasAll) return null;
  if (address.toLowerCase() === holderAddress?.toLowerCase()) return null;

  const myScoreNum = myScore ? Number(myScore) : 0;
  const holderScoreNum = holderScore ? Number(holderScore) : 0;
  const ranksAbove = myScoreNum > holderScoreNum;

  const now = Math.floor(Date.now() / 1000);
  const safeEnd = lastChallengeTime ? Number(lastChallengeTime) + (safePeriod != null ? Number(safePeriod) : 86400) : 0;
  const inSafePeriod = now < safeEnd;
  const safeRemaining = Math.max(0, safeEnd - now);
  const safeHours = Math.floor(safeRemaining / 3600);
  const safeMins = Math.floor((safeRemaining % 3600) / 60);

  const canChallenge = hasAll && ranksAbove && !inSafePeriod;

  function doChallenge() {
    setChallengeError(null);
    writeContract({
      address: CONTRACTS.COUNTDOWN,
      abi: COUNTDOWN_ABI,
      functionName: "challengeCountdown",
      gas: BigInt(800_000),
    }, {
      onError: (e) => setChallengeError(e.shortMessage || "Challenge failed"),
    });
  }

  return (
    <div style={{
      border: `2px solid ${canChallenge ? '#cc66ff' : 'rgba(204,102,255,0.2)'}`,
      background: canChallenge ? 'rgba(184,107,255,0.08)' : 'rgba(0,0,0,0.2)',
      padding: '20px 24px', marginBottom: 24,
      boxShadow: canChallenge ? '0 0 20px rgba(184,107,255,0.15)' : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: '#cc66ff', letterSpacing: 2 }}>
          ⚔ CHALLENGE COUNTDOWN
        </div>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>
          YOU HOLD ALL 6 TIERS
        </div>
      </div>

      {/* Score comparison */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(204,102,255,0.2)', padding: '10px 14px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, marginBottom: 4 }}>YOUR RANK</div>
          <div style={{ fontFamily: "'VT323', monospace", fontSize: 28, color: ranksAbove ? '#6eff8a' : '#ff8888' }}>
            {myScoreNum.toLocaleString()}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontFamily: "'VT323', monospace", fontSize: 24, color: 'rgba(255,255,255,0.3)' }}>vs</span>
        </div>
        <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(204,51,34,0.2)', padding: '10px 14px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, marginBottom: 4 }}>HOLDER</div>
          <div style={{ fontFamily: "'VT323', monospace", fontSize: 28, color: EMBER_LT }}>
            {holderScoreNum.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Status messages */}
      {inSafePeriod && (
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: '#ffcc33', marginBottom: 10, lineHeight: 1.8 }}>
          ⏳ 24-HOUR SAFE PERIOD — challenge opens in {safeHours}h {safeMins}m
        </div>
      )}
      {!ranksAbove && !inSafePeriod && (
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: '#ff8888', marginBottom: 10, lineHeight: 1.8 }}>
          Your score must exceed the holder's to challenge.
        </div>
      )}

      {challengeError && (
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: '#ff8888', marginBottom: 10, background: 'rgba(255,50,30,0.08)', border: '1px solid rgba(255,50,30,0.2)', padding: '8px 12px' }}>
          {challengeError}
        </div>
      )}

      {isSuccess && (
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: '#6eff8a', marginBottom: 10, textAlign: 'center', padding: '12px', background: 'rgba(110,255,138,0.08)', border: '1px solid rgba(110,255,138,0.2)' }}>
          ⚔ TAKEOVER SUCCESSFUL — YOU ARE NOW THE COUNTDOWN HOLDER
        </div>
      )}

      {!showConfirm ? (
        <button
          onClick={() => canChallenge && setShowConfirm(true)}
          disabled={!canChallenge || isPending}
          style={{
            width: '100%', padding: '14px 0',
            fontFamily: "'Press Start 2P', monospace", fontSize: 9, letterSpacing: 2,
            color: canChallenge ? '#0a0705' : 'rgba(255,255,255,0.2)',
            background: canChallenge ? 'linear-gradient(135deg,#9933cc,#cc66ff)' : 'rgba(255,255,255,0.05)',
            border: canChallenge ? '2px solid #6600aa' : '2px solid rgba(255,255,255,0.08)',
            boxShadow: canChallenge ? '3px 3px 0 #0a0705' : 'none',
            cursor: canChallenge ? 'pointer' : 'not-allowed',
          }}
        >
          {isPending ? '⏳ CONFIRMING...' : '⚔ CHALLENGE HOLDER'}
        </button>
      ) : (
        <div style={{ background: 'rgba(204,51,34,0.08)', border: '1px solid rgba(204,51,34,0.3)', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: EMBER_LT, marginBottom: 10 }}>
            ⚠ CONFIRM TAKEOVER
          </div>
          <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 14, lineHeight: 1.6 }}>
            This will reset the 7-day countdown and make you the new holder. You must maintain all 6 tiers for the entire duration.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={() => setShowConfirm(false)} style={{
              fontFamily: "'Press Start 2P', monospace", fontSize: 8, letterSpacing: 1,
              background: 'transparent', color: 'rgba(255,255,255,0.4)',
              border: '1px solid rgba(255,255,255,0.2)', padding: '10px 20px', cursor: 'pointer',
            }}>CANCEL</button>
            <button onClick={doChallenge} disabled={isPending} style={{
              fontFamily: "'Press Start 2P', monospace", fontSize: 8, letterSpacing: 1,
              background: '#cc3322', color: CREAM, border: '2px solid #0a0705',
              boxShadow: '3px 3px 0 #0a0705', padding: '10px 20px',
              cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.6 : 1,
            }}>{isPending ? 'CONFIRMING...' : 'CONFIRM CHALLENGE'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TICKER — live data
// ═══════════════════════════════════════════════════════════════
function Ticker({ holderShort, eth, claimPct, secondsRemaining = 999999 }) {
  const urgent = secondsRemaining < 86400;
  const items = urgent
    ? [
        "YOUR WINDOW IS CLOSING",
        `HOLDER: ${holderShort || "—"}`,
        `PRIZE POOL: Ξ ${eth.toFixed(4)}`,
        "TIME IS RUNNING OUT",
        `COMMUNITY VOTE: ${claimPct}% CLAIM`,
        "ACT NOW OR LOSE EVERYTHING",
        "TRADING STILL OPEN",
      ]
    : [
        "YOUR WINDOW IS CLOSING",
        `HOLDER: ${holderShort || "—"}`,
        `PRIZE POOL: Ξ ${eth.toFixed(4)}`,
        `COMMUNITY VOTE: ${claimPct}% CLAIM`,
        "SEASON 1",
        "MINTING CONTINUES",
        "TRADING STILL OPEN",
      ];
  const doubled = [...items, ...items];
  return (
    <div style={{
      overflow: "hidden", background: "rgba(0,0,0,.35)",
      borderTop: `1px solid ${GOLD_DK}33`, borderBottom: `1px solid ${GOLD_DK}33`,
      padding: "8px 0", marginBottom: 24,
    }}>
      <div style={{ display: "flex", gap: 0, animation: "ticker-scroll 30s linear infinite", whiteSpace: "nowrap" }}>
        {doubled.map((item, i) => (
          <span key={i} style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: 6,
            color: urgent ? EMBER_LT : GOLD, opacity: .8, letterSpacing: 1, padding: "0 32px",
          }}>◈ {item}</span>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LEADERBOARD — live from subgraph
// ═══════════════════════════════════════════════════════════════
const SUBGRAPH_URL = "https://api.studio.thegraph.com/query/1744131/blok-hunt/version/latest";
const BURN_ADDRESSES = [
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
];
const TIER_COLS_LB = ["#9ba8b0", "#8fa8c8", "#8fb87a", "#c8c870", "#c87a7a", "#c8a84b"];

function Leaderboard({ holderAddress }) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLb() {
      try {
        const query = `{
          players(
            first: 5,
            orderBy: progressionScore,
            orderDirection: desc,
            where: { id_not_in: ${JSON.stringify(BURN_ADDRESSES)} }
          ) {
            id
            tier2Balance tier3Balance tier4Balance
            tier5Balance tier6Balance tier7Balance
            tiersUnlocked
            progressionScore
          }
        }`;
        const res = await fetch(SUBGRAPH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });
        if (!res.ok) throw new Error('Rate limited');
        const json = await res.json();
        setPlayers(json?.data?.players || []);
      } catch (e) {
        console.warn("Spectator leaderboard fetch failed:", e);
      }
      setLoading(false);
    }
    fetchLb();
    const interval = setInterval(fetchLb, 30_000);
    return () => clearInterval(interval);
  }, []);

  const holderLower = holderAddress?.toLowerCase();

  return (
    <div style={{
      border: "1px solid rgba(255,255,255,.06)", background: "rgba(0,0,0,.2)",
      padding: "18px 20px", marginBottom: 24,
    }}>
      <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: CREAM, opacity: .7, letterSpacing: 2, marginBottom: 14 }}>
        THE RACE — WHO'S CLOSEST
      </div>
      {loading ? (
        <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:12, color:"rgba(255,255,255,0.3)", padding:"12px 0" }}>Loading...</div>
      ) : players.length === 0 ? (
        <div style={{ fontFamily:"'Courier Prime', monospace", fontSize:12, color:"rgba(255,255,255,0.3)", padding:"12px 0" }}>No players yet</div>
      ) : players.map((p, i) => {
        const addr = p.id;
        const short = `${addr.slice(0,6)}…${addr.slice(-4)}`;
        const isHolder = addr.toLowerCase() === holderLower;
        const tiersHeld = Number(p.tiersUnlocked || 0);
        const away = 6 - tiersHeld;
        const dots = [
          Number(p.tier7Balance) > 0,
          Number(p.tier6Balance) > 0,
          Number(p.tier5Balance) > 0,
          Number(p.tier4Balance) > 0,
          Number(p.tier3Balance) > 0,
          Number(p.tier2Balance) > 0,
        ];
        const col = isHolder ? EMBER_LT : i === 0 ? GOLD : CREAM;
        return (
          <div key={addr} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.04)",
          }}>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: col, width: 20, flexShrink: 0 }}>#{i + 1}</div>
            <div style={{ fontFamily: "'VT323', monospace", fontSize: 20, color: col, flex: 1 }}>{short}</div>
            <div style={{ display: "flex", gap: 3 }}>
              {dots.map((held, di) => (
                <div key={di} style={{ width: 6, height: 6, background: held ? TIER_COLS_LB[di] : "rgba(255,255,255,0.08)" }} />
              ))}
            </div>
            <div style={{
              fontFamily: "'Press Start 2P', monospace", fontSize: 7,
              color: isHolder ? EMBER_LT : away <= 2 ? GOLD : "rgba(255,255,255,.3)",
              border: `1px solid ${isHolder ? EMBER_LT + "44" : "rgba(255,255,255,.08)"}`,
              padding: "3px 7px",
            }}>
              {isHolder ? "HOLDER" : `${away} AWAY`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN — COUNTDOWN SPECTATOR SCREEN
// ═══════════════════════════════════════════════════════════════
export default function CountdownSpectator({ onBack }) {
  // ── Live chain reads ────────────────────────────────────────
  const { data: countdownStartTime } = useReadContract({
    address: CONTRACTS.TOKEN,
    abi: TOKEN_ABI,
    functionName: "countdownStartTime",
    query: { refetchInterval: 10000 },
  });

  const { data: countdownHolder } = useReadContract({
    address: CONTRACTS.TOKEN,
    abi: TOKEN_ABI,
    functionName: "countdownHolder",
    query: { refetchInterval: 10000 },
  });
  const { disconnect } = useDisconnect();
  const { data: treasuryBalanceData } = useBalance({
    address: CONTRACTS.TREASURY,
    query: { refetchInterval: 5000 },
  });

  const { data: countdownInfo } = useReadContract({
    address: CONTRACTS.COUNTDOWN,
    abi: COUNTDOWN_ABI,
    functionName: "getCountdownInfo",
    query: { refetchInterval: 8000 },
  });

  // ── Derived values ──────────────────────────────────────────
  const countdownEndTime = countdownInfo ? Number(countdownInfo[3]) : 0;
  const secondsRemaining = (() => {
    if (!countdownEndTime) return 0;
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, countdownEndTime - now);
  })();

  const eth = treasuryBalanceData?.value
  ? parseFloat(treasuryBalanceData.value.toString()) / 1e18
  : 0;

  const burnVotes  = countdownInfo ? Number(countdownInfo[5]) : 0;
  const claimVotes = countdownInfo ? Number(countdownInfo[6]) : 0;
  const total      = burnVotes + claimVotes;
  const claimPct   = total === 0 ? 50 : Math.round((claimVotes / total) * 100);

  const holderShort = countdownHolder
    ? `${countdownHolder.slice(0, 6)}…${countdownHolder.slice(-4)}`
    : "—";

  return (
    <div className="spectator-root" style={{
      minHeight: "100vh",
      background: "#07120d",
      backgroundImage: `
        radial-gradient(ellipse 60% 50% at 50% 0%, rgba(204,51,34,0.12) 0%, transparent 70%),
        radial-gradient(ellipse 80% 60% at 50% 100%, rgba(200,168,75,0.07) 0%, transparent 60%),
        radial-gradient(ellipse 100% 100% at 50% 50%, #0e2a1a 0%, #07120d 100%),
        repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px),
        repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px)
      `,
      fontFamily: "'Courier Prime', monospace", color: CREAM, position: "relative",
    }}>
      <style>{SPECTATOR_CSS}</style>

      <div style={{
        position: "fixed", top: -60, left: "50%", transform: "translateX(-50%)",
        width: 600, height: 200,
        background: "radial-gradient(ellipse, rgba(204,51,34,0.18) 0%, transparent 70%)",
        animation: "ember-breathe 4s ease-in-out infinite", zIndex: 1, pointerEvents: "none",
      }} />

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
  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: EMBER_LT,
      border: "1px solid rgba(204,51,34,.4)", padding: "6px 12px",
      background: "rgba(204,51,34,.08)", letterSpacing: 1,
      animation: "pulse-dot 2s ease-in-out infinite",
    }}>
      <div style={{ width: 6, height: 6, background: EMBER_LT, animation: "pulse-dot 1.2s ease-in-out infinite" }} />
      COUNTDOWN ACTIVE
    </div>
    <button onClick={onBack} style={{
      fontFamily: "'Press Start 2P', monospace", fontSize: 7,
      background: "transparent", color: "rgba(255,255,255,0.4)",
      border: "1px solid rgba(255,255,255,0.15)", padding: "0 16px",
      cursor: "pointer", letterSpacing: 1, height: 44,
    }}>← BACK TO GAME</button>
    <button onClick={() => { disconnect(); onBack(); }} style={{
      fontFamily: "'Press Start 2P', monospace", fontSize: 7,
      background: "transparent", color: "rgba(255,255,255,0.4)",
      border: "1px solid rgba(255,255,255,0.15)", padding: "0 16px",
      cursor: "pointer", letterSpacing: 1, height: 44,
    }}>DISCONNECT</button>
  </div>
</div>
      {/* Main */}
      <div style={{ position: "relative", zIndex: 5, maxWidth: 900, margin: "0 auto", padding: "28px 36px 80px" }}>

        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: EMBER_LT, letterSpacing: 3, opacity: secondsRemaining < 86400 ? 1 : .6, marginBottom: 16 }}>
            {secondsRemaining < 86400 ? "⚠ YOUR WINDOW IS CLOSING" : "● COUNTDOWN IN PROGRESS"}
          </div>
          {countdownStartTime
          ? <BigClock seconds={secondsRemaining} />
          : <div style={{ fontFamily: "'VT323', monospace", fontSize: 64, color: "rgba(255,255,255,0.2)" }}>——:——:——</div>
          }
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: CREAM, opacity: .8, letterSpacing: 2, marginTop: 12 }}>
            UNTIL EXPIRY
          </div>
        </div>

        <div style={{ margin: "24px 0" }}>
          <Ticker holderShort={holderShort} eth={eth} claimPct={claimPct} secondsRemaining={secondsRemaining} />
        </div>

        <PrizeDisplay eth={eth} />

        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: CREAM, opacity: .6, letterSpacing: 3, marginBottom: 10 }}>
          CURRENT HOLDER
        </div>
        <HolderCard holderAddress={countdownHolder} startTime={countdownStartTime} />

        <ChallengeSection holderAddress={countdownHolder} />

        <VoteSection burnVotes={burnVotes} claimVotes={claimVotes} />

        <Leaderboard holderAddress={countdownHolder} />

        <div style={{
          textAlign: "center", padding: "24px",
          border: `1px solid ${GOLD_DK}44`, background: "rgba(0,0,0,.2)",
        }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: CREAM, opacity: .7, letterSpacing: 2, marginBottom: 10 }}>
            MINTING CONTINUES
          </div>
          <div style={{ fontFamily: "'VT323', monospace", fontSize: 24, color: CREAM, opacity: .8, marginBottom: 8 }}>
            The countdown is active — but minting, combining, forging, and trading remain open.
          </div>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: CREAM, opacity: .6, lineHeight: 2.4, letterSpacing: .5, marginBottom: 20 }}>
            Build your collection. If you hold all 6 tiers and rank above<br/>
            the holder, you can challenge and take over the countdown.
          </div>
          <button onClick={onBack} style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: 9, letterSpacing: 2,
            background: GOLD, color: INK, border: `3px solid ${INK}`,
            boxShadow: `4px 4px 0 ${INK}`, padding: "12px 32px", cursor: "pointer",
          }}>▶ BACK TO GAME</button>
        </div>

      </div>
    </div>
  );
}

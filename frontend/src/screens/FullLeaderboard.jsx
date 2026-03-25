import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { FALLBACK_PLAYERS } from "../config/leaderboard-fallback";

const GOLD = "#c8a84b";
const GOLD_DK = "#8b7633";
const GOLD_LT = "#e8d48b";
const CREAM = "#d4c9a8";
const INK = "#1a1a12";
const TIER_COLS = ["#9ba8b0", "#8fa8c8", "#8fb87a", "#c8c870", "#c87a7a", "#c8a84b"];

const fp = { fontFamily: "'Press Start 2P', monospace" };
const fv = { fontFamily: "'VT323', monospace" };
const fc = { fontFamily: "'Courier Prime', monospace" };

function fmtAddr(a) { return a ? `${a.slice(0,6)}...${a.slice(-4)}` : ""; }
function fmtScore(s) { return Number(s).toLocaleString(); }

function tierDots(p) {
  return [7,6,5,4,3,2].map(t => Number(p[`tier${t}Balance`] || 0) > 0);
}

export default function FullLeaderboard({ onBack }) {
  const [players, setPlayers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { address } = useAccount();
  const connLower = address?.toLowerCase();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/leaderboard");
        if (!res.ok) throw new Error("API error");
        const json = await res.json();
        setPlayers(json.players || []);
        setStats(json.stats || null);
      } catch {
        try {
          const cached = JSON.parse(localStorage.getItem("blockhunt_lb_cache"));
          if (cached?.players?.length) { setPlayers(cached.players); setStats(cached.stats); }
          else { setPlayers(FALLBACK_PLAYERS); }
        } catch { setPlayers(FALLBACK_PLAYERS); }
      }
      setLoading(false);
    }
    load();
  }, []);

  // Find connected player's rank
  const myIdx = connLower ? players.findIndex(p => p.id === connLower) : -1;
  const myRank = myIdx !== -1 ? myIdx + 1 : null;

  // Filter by search
  const filtered = search
    ? players.filter(p => p.id.toLowerCase().includes(search.toLowerCase()))
    : players;

  return (
    <div style={{
      minHeight: "100vh", background: "#0e0f0a",
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,.06)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(0,0,0,.3)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={onBack} style={{
            ...fp, fontSize: 8, color: CREAM, opacity: .5, background: "none",
            border: "1px solid rgba(255,255,255,.12)", padding: "8px 12px", cursor: "pointer",
          }}>BACK</button>
          <div>
            <div style={{ ...fp, fontSize: 12, color: GOLD, letterSpacing: 1 }}>FULL LEADERBOARD</div>
            <div style={{ ...fc, fontSize: 11, color: "rgba(255,255,255,.3)", marginTop: 2 }}>
              {players.length} players{stats ? ` · ${Number(stats.totalMinted).toLocaleString()} minted` : ""}
            </div>
          </div>
        </div>

        {/* Your rank badge */}
        {myRank && (
          <div style={{
            ...fp, fontSize: 9, color: GOLD, background: "rgba(200,168,75,.1)",
            border: `1px solid ${GOLD_DK}`, padding: "8px 16px", letterSpacing: 1,
          }}>
            YOUR RANK: #{myRank} of {players.length}
          </div>
        )}
        {connLower && !myRank && !loading && (
          <div style={{
            ...fp, fontSize: 8, color: "rgba(255,255,255,.4)",
            border: "1px solid rgba(255,255,255,.1)", padding: "8px 16px",
          }}>NOT RANKED YET</div>
        )}
      </div>

      {/* Search */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
        <input
          type="text"
          placeholder="Search by wallet address..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: "100%", padding: "10px 14px",
            ...fc, fontSize: 13, color: CREAM, background: "rgba(0,0,0,.3)",
            border: "1px solid rgba(255,255,255,.1)", outline: "none",
          }}
        />
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 0 40px" }}>
        {loading ? (
          <div style={{ ...fp, fontSize: 9, color: CREAM, opacity: .3, textAlign: "center", padding: 60 }}>LOADING...</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, background: "#0e0f0a", zIndex: 1 }}>
                {["#", "PLAYER", "TIERS", "SCORE", "MINTS", "COMBINES", "FORGES"].map((h, i) => (
                  <th key={h} style={{
                    ...fp, fontSize: 7, color: CREAM, opacity: .3, letterSpacing: 1,
                    padding: "10px 12px", textAlign: i >= 3 ? "right" : "left",
                    borderBottom: "1px solid rgba(255,255,255,.08)",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, idx) => {
                const rank = search ? players.indexOf(p) + 1 : idx + 1;
                const isMe = connLower && p.id === connLower;
                const dots = tierDots(p);
                return (
                  <tr key={p.id} style={{
                    background: isMe ? "rgba(200,168,75,.08)" : "transparent",
                    borderLeft: isMe ? `3px solid ${GOLD}` : "3px solid transparent",
                  }}>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,.03)" }}>
                      <span style={{ ...fv, fontSize: 18, color: rank <= 3 ? GOLD : rank <= 10 ? GOLD_LT : CREAM, opacity: rank <= 3 ? 1 : rank <= 10 ? .7 : .4 }}>{rank}</span>
                    </td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,.03)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ ...fc, fontSize: 11, color: CREAM, opacity: .6 }}>{fmtAddr(p.id)}</span>
                        {isMe && <span style={{ ...fp, fontSize: 7, color: GOLD, background: "rgba(200,168,75,.15)", border: `1px solid ${GOLD_DK}`, padding: "2px 6px" }}>YOU</span>}
                      </div>
                    </td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,.03)" }}>
                      <div style={{ display: "flex", gap: 3 }}>
                        {dots.map((held, i) => (
                          <div key={i} style={{ width: 8, height: 8, background: held ? TIER_COLS[i] : "transparent", border: held ? "none" : "1px solid rgba(255,255,255,.15)" }} />
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,.03)", textAlign: "right" }}>
                      <span style={{ ...fv, fontSize: 18, color: GOLD_LT, opacity: .8 }}>{fmtScore(p.progressionScore)}</span>
                    </td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,.03)", textAlign: "right" }}>
                      <span style={{ ...fv, fontSize: 16, color: CREAM, opacity: .4 }}>{Number(p.totalMints).toLocaleString()}</span>
                    </td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,.03)", textAlign: "right" }}>
                      <span style={{ ...fv, fontSize: 16, color: CREAM, opacity: .4 }}>{Number(p.totalCombines).toLocaleString()}</span>
                    </td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,.03)", textAlign: "right" }}>
                      <span style={{ ...fv, fontSize: 16, color: CREAM, opacity: .4 }}>{Number(p.totalForges).toLocaleString()}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {!loading && filtered.length === 0 && search && (
          <div style={{ ...fp, fontSize: 8, color: "rgba(255,255,255,.3)", textAlign: "center", padding: 40 }}>
            NO PLAYERS MATCH "{search}"
          </div>
        )}
      </div>
    </div>
  );
}

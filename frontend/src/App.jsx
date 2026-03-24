import { useState, useEffect, useRef, useCallback } from "react";
import { useAccount } from "wagmi";
import LandingScreen from "./screens/Landing";
import GameScreen from "./screens/Game";
import Modals from "./components/Modals";
import CountdownHolder from "./screens/CountdownHolder";
import CountdownSpectator from "./screens/CountdownSpectator";
import { useGameState } from "./hooks/useGameState";
import { FALLBACK_PLAYERS, FALLBACK_STATS } from "./config/leaderboard-fallback";

const LB_URL = "https://api.studio.thegraph.com/query/1744131/blok-hunt/version/latest";
const LB_POLL = 300_000; // 5 minutes — conserve subgraph quota
const LB_CACHE_KEY = "blockhunt_lb_cache";

function getCachedLeaderboard() {
  try {
    const raw = localStorage.getItem(LB_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function setCachedLeaderboard(players, stats) {
  try {
    localStorage.setItem(LB_CACHE_KEY, JSON.stringify({ players, stats, ts: Date.now() }));
  } catch {}
}

function useLeaderboardCache() {
  const [data, setData] = useState({ players: [], stats: null, error: null, loading: true });
  const fetchRef = useRef(null);

  const doFetch = useCallback(async () => {
    try {
      const res = await fetch(LB_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: `{
          players(first: 100, orderBy: progressionScore, orderDirection: desc, where: { totalMints_gt: "0" }) {
            id totalMints totalCombines totalForges progressionScore
            tier2Balance tier3Balance tier4Balance tier5Balance tier6Balance tier7Balance
          }
          seasonStat(id: "season-1") { totalMinted uniquePlayers totalBurned }
        }` }),
      });
      if (!res.ok) throw new Error("Rate limited");
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);
      const players = json.data?.players || [];
      const stats = json.data?.seasonStat || null;
      setCachedLeaderboard(players, stats);
      setData({ players, stats, error: null, loading: false });
    } catch (e) {
      // Subgraph unavailable — try localStorage cache, then hardcoded fallback
      const cached = getCachedLeaderboard();
      setData(prev => ({
        players: prev.players.length ? prev.players : (cached?.players || FALLBACK_PLAYERS),
        stats: prev.stats || cached?.stats || FALLBACK_STATS,
        error: e.message,
        loading: false,
      }));
    }
  }, []);

  useEffect(() => {
    doFetch();
    fetchRef.current = setInterval(doFetch, LB_POLL);
    return () => clearInterval(fetchRef.current);
  }, [doFetch]);

  return data;
}

export default function App() {
  const [screen, setScreen] = useState("landing");
  const [dismissedSpectator, setDismissedSpectator] = useState(false);
  const [modal, setModal] = useState(null); // "rules" | "leaderboard" | "profile" | null
  const { address } = useAccount();
  const { prizePool } = useGameState();
  const leaderboardCache = useLeaderboardCache();

  function openModal(m) { setModal(m); }
  function closeModal() { setModal(null); }

  if (screen === "countdown-holder") return <CountdownHolder />;

  if (screen === "countdown-spectator") return (
    <CountdownSpectator onBack={() => { setDismissedSpectator(true); setScreen("game"); }} />
  );

  if (screen === "game") return (
    <>
      <GameScreen
        onOpenModal={openModal}
        onNavigate={(s) => setScreen(s)}
        dismissedSpectator={dismissedSpectator}
      />
      <Modals
        open={modal}
        onClose={closeModal}
        onOpenProfile={() => setModal("profile")}
        connectedAddress={address}
        prizePool={prizePool}
        leaderboardCache={leaderboardCache}
      />
    </>
  );

  return <LandingScreen onEnter={() => setScreen("game")} />;
}

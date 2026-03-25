import { useState, useEffect, useRef, useCallback } from "react";
import { useAccount } from "wagmi";
import LandingScreen from "./screens/Landing";
import GameScreen from "./screens/Game";
import Modals from "./components/Modals";
import CountdownHolder from "./screens/CountdownHolder";
import CountdownSpectator from "./screens/CountdownSpectator";
import { useGameState } from "./hooks/useGameState";
import { FALLBACK_PLAYERS, FALLBACK_STATS } from "./config/leaderboard-fallback";

const LB_API = "/api/leaderboard";
const LB_POLL = 60_000; // 1 minute — server caches for 5 min, so this is cheap
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
      const res = await fetch(LB_API);
      if (!res.ok) throw new Error("API error");
      const json = await res.json();
      const players = json.players || [];
      const stats = json.stats || null;
      setCachedLeaderboard(players, stats);
      setData({ players, stats, error: null, loading: false });
    } catch (e) {
      // API unavailable — try localStorage cache, then hardcoded fallback
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

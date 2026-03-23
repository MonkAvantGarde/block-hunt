import { useState, useEffect, useRef, useCallback } from "react";
import { useAccount } from "wagmi";
import LandingScreen from "./screens/Landing";
import GameScreen from "./screens/Game";
import Modals from "./components/Modals";
import CountdownHolder from "./screens/CountdownHolder";
import CountdownSpectator from "./screens/CountdownSpectator";
import { useGameState } from "./hooks/useGameState";

const LB_URL = "https://api.studio.thegraph.com/query/1744131/blok-hunt/version/latest";
const LB_POLL = 30_000;

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
      setData({ players: json.data?.players || [], stats: json.data?.seasonStat || null, error: null, loading: false });
    } catch (e) {
      setData(prev => ({ ...prev, error: e.message, loading: false }));
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

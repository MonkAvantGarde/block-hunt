import { useState, useEffect, useRef, useCallback } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
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
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { prizePool } = useGameState();
  const leaderboardCache = useLeaderboardCache();

  const wrongNetwork = isConnected && chainId !== 84532;

  function openModal(m) { setModal(m); }
  function closeModal() { setModal(null); }

  // ── WRONG NETWORK BLOCKER ─────────────────────────────────────
  if (wrongNetwork) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: '#07120d',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20,
      }}>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 14, color: '#ff4444', letterSpacing: 2, textAlign: 'center' }}>
          ⚠ WRONG NETWORK
        </div>
        <div style={{ fontFamily: "'VT323', monospace", fontSize: 22, color: 'rgba(255,255,255,0.6)', textAlign: 'center', maxWidth: 400, lineHeight: 1.5 }}>
          Block Hunt runs on Base Sepolia. You are connected to a different network.
          Please switch to continue playing.
        </div>
        <button
          onClick={() => switchChain({ chainId: 84532 })}
          style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: 10, letterSpacing: 1,
            color: '#0a0705', background: '#c8a84b', border: '2px solid #8a6820',
            padding: '14px 28px', cursor: 'pointer',
            boxShadow: '0 0 20px rgba(255,170,0,0.5), 0 4px 0 #7a4000',
          }}
        >
          SWITCH TO BASE SEPOLIA
        </button>
        <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 10 }}>
          Chain ID: 84532
        </div>
      </div>
    );
  }

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

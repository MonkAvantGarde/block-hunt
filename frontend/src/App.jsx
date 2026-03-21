import { useState } from "react";
import { useAccount } from "wagmi";
import LandingScreen from "./screens/Landing";
import GameScreen from "./screens/Game";
import Modals from "./components/Modals";
import CountdownHolder from "./screens/CountdownHolder";
import CountdownSpectator from "./screens/CountdownSpectator";
import { useGameState } from "./hooks/useGameState";

export default function App() {
  const [screen, setScreen] = useState("landing");
  const [dismissedSpectator, setDismissedSpectator] = useState(false);
  const [modal, setModal] = useState(null); // "rules" | "leaderboard" | "profile" | null
  const { address } = useAccount();
  const { prizePool } = useGameState();

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
      />
    </>
  );

  return <LandingScreen onEnter={() => setScreen("game")} />;
}

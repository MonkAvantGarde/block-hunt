import { useState } from "react";
import { useAccount } from "wagmi";
import LandingScreen from "./screens/Landing";
import GameScreen from "./screens/Game";
import Modals from "./components/Modals";
import CountdownHolder from "./screens/CountdownHolder";
import CountdownSpectator from "./screens/CountdownSpectator";

export default function App() {
  const [screen, setScreen] = useState("landing");
  const [modal, setModal] = useState(null); // "rules" | "leaderboard" | "profile" | null
  const { address } = useAccount();

  function openModal(m) { setModal(m); }
  function closeModal() { setModal(null); }

  if (screen === "countdown-holder") return <CountdownHolder />;

  if (screen === "countdown-spectator") return (
    <CountdownSpectator onBack={() => setScreen("game")} />
  );

  if (screen === "game") return (
    <>
      <GameScreen
        onOpenModal={openModal}
        onNavigate={(s) => setScreen(s)}
      />
      <Modals
        open={modal}
        onClose={closeModal}
        onOpenProfile={() => setModal("profile")}
        connectedAddress={address}
      />
    </>
  );

  return <LandingScreen onEnter={() => setScreen("game")} />;
}

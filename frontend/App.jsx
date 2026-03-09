import { useState } from "react";
import LandingScreen from "./screens/Landing";
import GameScreen from "./screens/Game";

export default function App() {
  const [screen, setScreen] = useState("landing");

  if (screen === "game") return <GameScreen />;
  return <LandingScreen onEnter={() => setScreen("game")} />;
}

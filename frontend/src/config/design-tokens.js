// ─────────────────────────────────────────────────────────────────────────────
// design-tokens.js — Single source of truth for all colours and shared constants
//
// Previously duplicated across Game.jsx, Landing.jsx, Modals.jsx,
// CountdownSpectator.jsx, CountdownHolder.jsx, and AllTiersTrigger.jsx.
//
// Import what you need:
//   import { FELT, GOLD, CREAM, TIER_NAMES, COMBINE_RATIOS } from '../config/design-tokens'
// ─────────────────────────────────────────────────────────────────────────────

// ── CORE PALETTE ─────────────────────────────────────────────────────────────
export const FELT       = "#1e4d32";
export const FELT_DARK  = "#152e1f";
export const FELT_DEEP  = "#142e1e";
export const WOOD       = "#1c0e08";
export const WOOD_LIGHT = "#2c1810";
export const WOOD_EDGE  = "#3d1e0a";
export const GOLD       = "#c8a84b";
export const GOLD_DK    = "#8a6820";
export const GOLD_LT    = "#e8c86b";
export const INK        = "#0a0705";
export const INK_DEEP   = "#1a1208";
export const CREAM      = "#f0ead6";
export const EMBER      = "#cc3322";
export const EMBER_LT   = "#ff4433";
export const GREEN      = "#6eff8a";
export const PURPLE     = "#b86bff";
export const ORANGE     = "#ffa84b";
export const REWARDS_ACCENT = "#4ecdc4";
export const REWARDS_BG = "#0a1a15";

// ── TIER METADATA ────────────────────────────────────────────────────────────
export const TIERS = [
  { id:7, name:"The Inert",      short:"Inert",     bg:"linear-gradient(160deg,#1c1c1c,#0a0a0a)", accent:"#888888", border:"#3a3a3a", label:"COMMON"    },
  { id:6, name:"The Restless",   short:"Restless",  bg:"linear-gradient(160deg,#3a0000,#180000)", accent:"#ff4444", border:"#660000", label:"COMMON"    },
  { id:5, name:"The Remembered", short:"Rem'd",     bg:"linear-gradient(160deg,#002244,#001133)", accent:"#33aaff", border:"#003366", label:"UNCOMMON"  },
  { id:4, name:"The Ordered",    short:"Ordered",   bg:"linear-gradient(160deg,#2e1e00,#160e00)", accent:"#ffcc33", border:"#5a3a00", label:"RARE"      },
  { id:3, name:"The Chaotic",    short:"Chaotic",   bg:"linear-gradient(160deg,#1e0033,#0a001a)", accent:"#cc66ff", border:"#440077", label:"EPIC"      },
  { id:2, name:"The Willful",    short:"Willful",   bg:"linear-gradient(160deg,#2e0f00,#160700)", accent:"#ff6622", border:"#551500", label:"MYTHIC"    },
  { id:1, name:"The Origin",     short:"Origin",    bg:"linear-gradient(160deg,#00082a,#000414)", accent:"#4466ff", border:"#001877", label:"LEGENDARY" },
];

export const TMAP = Object.fromEntries(TIERS.map(t => [t.id, t]));

export const TIER_NAMES = {
  1: 'The Origin',
  2: 'The Willful',
  3: 'The Chaotic',
  4: 'The Ordered',
  5: 'The Remembered',
  6: 'The Restless',
  7: 'The Inert',
};

// ── GAME CONSTANTS ───────────────────────────────────────────────────────────
// T2→T1 combine does NOT exist. The Origin is sacrifice-only.
export const COMBINE_RATIOS = { 7:21, 6:19, 5:17, 4:15, 3:13 };

// Forge probability is ratio-anchored: burning N of M = (N/M × 100)% chance
// M = combine ratio for the source tier
export const FORGE_RATIOS = { 7:21, 6:19, 5:17, 4:15, 3:13 };

export const BATCH_PRICES_ETH = {
  1: 0.00008, 2: 0.00012, 3: 0.00020, 4: 0.00032, 5: 0.00056,
  6: 0.00100, 7: 0.00180, 8: 0.00320, 9: 0.00520, 10: 0.00800,
};

export const BATCH_SUPPLY = {
  1: 100000, 2: 100000, 3: 150000, 4: 200000, 5: 250000,
  6: 300000, 7: 400000, 8: 500000, 9: 500000, 10: 400000,
};

export const WINDOW_DURATION_HOURS = 3;
export const COUNTDOWN_DURATION_DAYS = 7;
export const PER_USER_WINDOW_CAP = 500;
export const CLAIM_WINDOW_DAYS = 30;

// ── TIER COLOURS (for leaderboard dots, spectator badges, etc.) ──────────────
export const TIER_COLORS = {
  7: "#9ba8b0",
  6: "#8fa8c8",
  5: "#8fb87a",
  4: "#c8c870",
  3: "#c87a7a",
  2: "#c8a84b",
  1: "#ffffff",
};

// ── HELPER ────────────────────────────────────────────────────────────────────
export function getMintPrice(batch) {
  return BATCH_PRICES_ETH[batch] || BATCH_PRICES_ETH[1];
}

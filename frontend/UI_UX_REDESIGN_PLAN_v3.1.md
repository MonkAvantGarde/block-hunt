# The Block Hunt — UI/UX Redesign Plan v3.1 (Final)
> **Date:** March 13, 2026
> **Supersedes:** All previous plans (FRONTEND_IMPROVEMENT_PLAN.md, v2, v3)
> **Scope:** Complete redesign — every screen, component, interaction, and system-level fix
> **Purpose:** One document that covers everything. Nothing lost between versions.

---

## Design Frameworks Applied

Every recommendation traces to one or more of these 12 frameworks. Tags appear in [brackets].

| Tag | Framework | What It Governs |
|-----|-----------|-----------------|
| F1 | Gestalt — Focal Point | One dominant element per screen |
| F2 | Gestalt — Proximity, Similarity, Common Region | Group related elements, consistent patterns |
| F3 | Don Norman's Emotional Design (Visceral/Behavioural/Reflective) | Gut reaction, usability in use, memory after |
| F4 | Miller's Law (7±2) | Max cognitive chunks visible at once |
| F5 | Hick-Hyman Law | Fewer choices = faster decisions |
| F6 | Fitts's Law | Important targets are large and close |
| F7 | Nielsen's 10 Heuristics | Usability standards (referenced as H1-H10) |
| F8 | WCAG Accessibility | Contrast, target size, not colour-sole-indicator |
| F9 | Z-Pattern / F-Pattern Scanning | Layout follows natural eye movement |
| F10 | Progressive Disclosure | Show what's needed now, hide the rest |
| F11 | Hook Model (Eyal) | Trigger → Action → Variable Reward → Investment |
| F12 | Bartle Player Types | Killer (compete), Achiever (collect), Socializer (share), Explorer (understand) |

---

## Design Principles

1. **One Focal Point Per Screen.** [F1]
2. **Show the Game, Not the Data.** Data serves emotion. [F3]
3. **Progressive Disclosure.** One decision at a time. [F4, F5, F10]
4. **Big Targets for Big Actions.** [F6]
5. **Group What Belongs Together.** [F2]

---

## Part 1 — Landing Page Redesign

### Redesigned Layout

**Zone 1: The Hook (above fold, 100vh)** [F1, F9: Z-pattern]

```
┌──────────────────────────────────────────────────────────────┐
│  SEASON 1                                      ■ BASE SEPOLIA│
│                                                               │
│                      [spinning block — 120px]                 │
│                      THE BLOCK HUNT                           │
│                                                               │
│                ─────── ◈ ───────                              │
│                                                               │
│                Ξ  0.0095                    ← FOCAL POINT [F1]│
│                ≈ $24 USD                    ← prize-glow anim │
│                                                               │
│           One player wins everything.                         │
│           The community watches it happen.                    │
│                                                               │
│                ┌───────────────────────┐                       │
│                │    ▶  ENTER THE HUNT   │  ← 52px tall [F6]   │
│                └───────────────────────┘                       │
│           7 tiers  ·  10M blocks  ·  1 winner                │
└──────────────────────────────────────────────────────────────┘
```

Prize pool at Z-diagonal intersection = maximum attention zone. [F9]
ENTER at Z-terminal point. Button: 52px tall, 240px min width. [F6]

**Removed from above fold:** Action pills, tier badges, "collect · combine · forge · claim" tagline. [F10]
**Moved below fold:** Mechanics section with action pills + tier table. [F10]
**Fix:** CLAIM pill text → "Win the prize pool" (was "Win the treasury"). [F7-H4]

---

## Part 2 — Game Screen Architecture: Three Layers

### The Problem
20+ information groups visible simultaneously. No focal point. Three equal-weight panels. [F4 violated, F1 violated]

### The Solution

**Layer 1 — Collection (top):** The emotional core. Tier cards. Focal point. [F1]
**Layer 2 — StatusBar (middle):** Prize pool + window + batch. 3 chunks. Always visible. [F4]
**Layer 3 — Action Panels (bottom):** Tabs — Mint OR Forge OR Trade. One at a time. [F4, F5, F10]

20px gaps between layers create perceptual separation. [F2]

```
┌────────────────────────── HEADER ──────────────────────────┐
│ BLOKHUNT         LEADERBOARD  RULES  PROFILE    0xd382..32 │
├───────────────────────── LAYER 1 ──────────────────────────┤
│ COLLECTION  ┌═══════════════════░░░░░░░░░░┐  3 / 6 TIERS  │
│                                                             │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ │
│ │ T7  │ │ T6  │ │ T5  │ │ T4  │ │ T3  │ │ T2  │ │ T1  │ │
│ │ ×6  │ │ ×3  │ │ ×4  │ │ 🔒  │ │ 🔒  │ │ 🔒  │ │  ★  │ │
│ │6/20 │ │3/20 │ │4/30 │ │0/30 │ │0/50 │ │ —   │ │SACR.│ │
│ │14+  │ │17+  │ │26+  │ │30→T3│ │50→T2│ │     │ │ONLY │ │
│ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ │
│                                                             │
│ Collection: ~0.0013 Ξ value · 150 S2 starters · Rank #1   │
│                                                             │
├───────────────────────── LAYER 2 ──────────────────────────┤
│  PRIZE POOL          │  MINT WINDOW            │  BATCH    │
│  Ξ 0.0095  ≈$24     │  ○ CLOSED  opens 2:14   │  1 / 6   │
│                      │  ████░░░ 132/25K        │  0.00008  │
├───────────────────────── LAYER 3 ──────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                     │
│ │ ⬡ MINT ● │ │ ⚡ FORGE  │ │ ⇄ TRADE  │    ← tab bar 48px  │
│ └──────────┘ └──────────┘ └──────────┘                     │
│ ┌──────────────────────────────────────────────────────┐   │
│ │          [ ACTIVE PANEL — FULL WIDTH ]               │   │
│ └──────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
```

---

### Layer 1 Specs: The Collection

**Card size:** 120×120px (from 92). [F1: larger = more weight for focal point]

**Card states:** [F7-H1, F3]
- **Held (count > 0):** Full art, vibrant, count badge, elevation shadow
- **Empty (T3-T7):** Dark silhouette with lock icon. Art hidden — preserves discovery. [F3-Reflective]
- **T2 empty:** Silhouette, no combine info (T2→T1 doesn't exist)
- **T1:** Gold border, "★ SACRIFICE ONLY" — communicates it exists but isn't obtainable normally. [F7-H6]
- **Combine-ready:** Gold glow pulse. COMBINE button grows to 82×36px. [F6]

**Micro-goals:** [F4, F11-Investment]
- Has blocks, needs more: `"{remaining} more"` in tier accent, 15px
- Zero blocks: `"{ratio} → 1 T{tier-1}"` at 0.45 opacity
- Ready to combine: `"▲ READY"` in gold, pulsing

**Collection summary:** [F3-Reflective, F12-Achiever]
`"~X.XX Ξ combine value  ·  Y Season 2 starters  ·  Rank #Z"`

**Responsive grid:** [F8]
- Desktop >1200px: 7 cols
- Tablet 800-1200px: 4+3
- Mobile <800px: 3+3+1, cards at 100×100

---

### Layer 2 Specs: GameStatusBar

**Component:** `GameStatusBar.jsx` — 64px fixed height [F2, F4]

Three columns, identical internal structure (Gestalt Similarity): [F2]
```
Row 1: Label  — Press Start 2P, 7px, GOLD 0.6, uppercase
Row 2: Value  — VT323, 28px, GOLD_LT
Row 3: Detail — Press Start 2P, 7px, CREAM 0.45
```

**Col 1: Prize Pool** — "Ξ 0.0095", "≈ $24", prize-glow animation
**Col 2: Window** — "● OPEN" (green) or "○ CLOSED" (red) with text [F8: not colour alone], countdown, 4px minted/allocated bar
**Col 3: Batch** — "1 / 6", "0.00008 Ξ per block"

**Timer edge case:** When no window scheduled, show "Not yet scheduled" — never 00:00:00. [F7-H1]

**Header simplification:** Remove "◈ Ξ 0.0095" from header. StatusBar owns it. Header becomes: logo | nav | wallet. [F4]

---

### Layer 3 Specs: Tab Navigation

**Tab bar:** 48px height, full clickable face. [F6, F8]
Active: gold 3px bottom border, 9px font. Inactive: 7px font, 0.5 opacity.
Tab + panel share background, 0px gap — reads as one unit. [F2: Common Region]

**Badge dots:** [F7-H1]
- MINT: green ● when window open
- FORGE: purple ● when any tier has ≥10 blocks
- TRADE: none (future: orange when listings exist)

**No transition animation.** Instant swap. Speed matters in a game loop.

---

## Part 3 — Mint Panel Redesign

Two columns at full panel width (~900px). [F1, F9]

**Left (60%): The Action** [F1: MINT button is focal point]
1. Quick-set: [10] [50] [100] [MAX] — 44px height [F6, F8]
2. Fine-tune: [-10] [-1] | qty | [+1] [+10] — 44×36px buttons [F6]
3. Total: "TOTAL: 0.002 ETH"
4. **MINT NOW** — 52px tall, full column width, gold gradient [F6]
5. "Current price: 0.00008 Ξ (Batch 1)" — supporting text

**Right (40%): Context** [F10]
- Batch price ladder (compact, B1-B6 with current highlighted)
- "Batch 1 is the cheapest entry. Prices rise as batches advance."
- Recent mints list (moved from top)
- Completed mints auto-dismiss after 60 seconds [F7-H8]

**Removed:** Giant timer (→ StatusBar), minted bar (→ StatusBar), BATCH/PRICE/SLOTS boxes (→ StatusBar + ladder).

---

## Part 4 — Forge Panel Redesign

### Empty State [F7-H1, F10, F12-Explorer]
Replace purple void with: one-line description, tier selector showing "X more needed" per tier, and a "HOW THE FORGE WORKS" reference box with ratio table for all tiers.

### Active State — Two Columns [F1, F2, F3]
Left: burn slider, burn count, holdings impact ("You hold: 6 / After forge: -10"), warning box in EMBER
Right: source card → target card visually with arrow at 120px, percentage, success/failure outcomes

**FORGE button:** 52px tall. [F6]

### Forge Result — Ceremony [F3-Reflective]

**Success:** 200px card reveal with tier glow + share button (44px). [F6]
**Failure + Near-Miss:** "Your roll: 47%. Needed: 50%. 3% away." If within 10%: "So close." [F11: Variable Reward — near-misses drive retry]

### Forge Batch UI [F5, F11-Investment]

New sub-mode in forge panel for `forgeBatch()`. Reduces friction — 3 forges in 1 transaction instead of 3.

```
┌────────────────────────────────────────────────────────────┐
│ ⚡ BATCH FORGE                                              │
│                                                              │
│  Build multiple forge attempts. One transaction. One VRF.   │
│                                                              │
│  ┌ Attempt 1 ────────────────────────────────────────────┐  │
│  │  T7 → T6    Burn: 15    Chance: 75%                   │  │
│  │  [remove]                                              │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌ Attempt 2 ────────────────────────────────────────────┐  │
│  │  T6 → T5    Burn: 10    Chance: 50%                   │  │
│  │  [remove]                                              │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  [+ ADD ATTEMPT]                                             │
│                                                              │
│  Total burn: 25 blocks across 2 tiers                       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         ⚡  FORGE ALL  (2 attempts)                    │   │ ← 52px [F6]
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
```

Toggle between single forge and batch forge via a small switch at the top of the panel. [F10]

### Forge Confirmation Dialog [F7-H5]
When burn count > 80% of tier holdings: "This will burn X of your Y T7 blocks (Z%). Continue?" with CONFIRM and CANCEL buttons. Both 44px. [F6]

---

## Part 5 — Trade Panel Redesign

Replace all fake listings with honest content. [F7-H2]

- "Secondary market opens at mainnet launch."
- Combine-path value table (T7 through T2 with ETH cost and mint count)
- "↗ VIEW ON OPENSEA (TESTNET)" — 48px button, real link [F6]

The value table creates speculation without fake data. "T2 costs 18M mints" drives desire. [F3-Reflective, F12-Explorer]

---

## Part 6 — The Reveal Moment [F3, F11]

**The highest-impact single feature.** This is the Variable Reward in the Hook Model cycle. Without it, the loop breaks at step 3: Trigger → Action → ??? → no Investment.

### Trigger Logic
After VRF callback, compare before/after per-tier balances:
- **T7/T6 only:** Quiet toast "+6 T7, +1 T6" [F10]
- **T5 (Uncommon):** 1.5s card reveal, blue glow, 200px card
- **T4 (Rare):** 2s, dark overlay, golden particles, 200px card
- **T3 (Epic):** 3s, screen shake, lightning particles, 300px card, share prompt
- **T2 (Mythic):** 4s, fire particles, ember glow, 300px card, "YOU JUST PULLED THE WILLFUL", share prompt

### Component: `RevealMoment.jsx`
Fixed overlay z-index 8000, backdrop blur, centered card art (actual PNG), tier-appropriate CSS particles, auto-dismiss OR click, share button for T3/T2 (44px [F6]).

Share text: "I just pulled [Tier Name] in @TheBlockHunt. Prize pool: Ξ {pool}. One player wins everything."

### Combine Ceremony
New tier unlocked → 1.5s mini-reveal at 160px with tier glow. Duplicate tier → keep existing banner toast. [F10: ceremony proportional to significance]

---

## Part 7 — CountdownSpectator Fixes

### Loss Framing Language [F3-Behavioural, Prospect Theory]
Replace ticker items:
- "COUNTDOWN ACTIVE" → "YOUR WINDOW IS CLOSING"
- "MINTING LOCKED" → "MINTING SUSPENDED"
- When < 24 hours remain: ticker shifts to EMBER colour, add "FINAL HOURS" item

### Live Leaderboard [F7-H2]
Replace hardcoded `LEADERS` array with subgraph query (reuse `buildLbQuery` from LeaderboardModal). Show top 5 with tier dots and "X AWAY" badges. [F12-Killer]

### Back to Game Button [F7-H3: User control and freedom]
Persistent "← BACK TO GAME" button (44px [F6]) in top-left. Players need to forge/trade during countdown, not be trapped on spectator screen.

---

## Part 8 — Rank Change Notifications [F12-Killer, F3-Reflective]

When subgraph poll detects leaderboard rank change for connected wallet:

**Rank up:** Green toast: "↑ You moved from #47 to #31"
**Rank down:** Amber toast: "↓ You dropped from #31 to #38 — someone overtook you"

Store last known rank in React state (localStorage as cache). Poll every 60s via subgraph. Toast persists for 5 seconds, dismissable.

This feeds the Killer player type — competitive players who want to dominate and see their position relative to others. [F12]

---

## Part 9 — Typography & Readability [F8]

### Font Size Minimums
- Press Start 2P: minimum 7px (raise from 5px on labels)
- VT323: minimum 16px (raise from 13px on micro-goals)
- Courier Prime: minimum 11px (unchanged)

### Contrast Fix
All `rgba(255,255,255,0.25)` → `rgba(255,255,255,0.45)` for WCAG AA 4.5:1.

### Tier Dot Accessibility
Held: ■ (filled square). Not held: ◇ (empty diamond). Shape + colour. [F8]

---

## Part 10 — Fitts's Law Target Sizing [F6]

| Element | Current | Required | Reason |
|---------|---------|----------|--------|
| MINT NOW | ~36px | 52px, full column | Highest-frequency action |
| FORGE | ~36px | 52px, full column | High-stakes action |
| ENTER THE HUNT | ~42px | 52px, 240px wide | Only landing CTA |
| COMBINE (ready) | 82×24px | 82×36px + glow | Size signals availability |
| Tab targets | unspec | 48px height, 1/3 width | Touch devices |
| Quick-set buttons | new | 44×44px | WCAG touch target |
| Stepper buttons | 36×28px | 44×36px | Frequent interaction |
| Modal close | ~20×12px | 36×36px | Most-wanted post-read action |
| Share button | new | 44px height, 120px wide | Easy hit in excitement |
| OpenSea link | new | 48px, full width | Trade panel primary action |
| Back to Game | new | 44px height | Escape hatch on spectator |

**Proximity:** Elements used in sequence are adjacent — quantity → MINT, slider → FORGE, tab → panel (0px gap). [F6 corollary]

---

## Part 11 — Gestalt Grouping [F2]

**Layer separation:** 20px gaps between Collection / StatusBar / Panels.
**StatusBar columns:** Identical Row1-Row2-Row3 structure (Similarity).
**Tier grid containment:** Left/right edges align with StatusBar and panels (implicit Common Region).
**Tab + panel:** Shared background, 0px gap (Common Region + Closure).
**Mint columns:** 1px divider or 16px gap. Left column slightly lighter background (Figure-Ground).

---

## Part 12 — Z/F-Pattern Optimization [F9]

**Landing (Z):** Prize pool at diagonal intersection. ENTER at terminal point.
**Game (F):** First scan: header. Second scan: collection bar + tier cards. Left edge: StatusBar → tabs → primary panel column. Left-aligned action controls get most attention.

---

## Part 13 — Nielsen's Heuristics Complete Audit [F7]

| # | Heuristic | Fix |
|---|-----------|-----|
| H1 | Visibility of system status | StatusBar, forge empty state, honest timer, loading skeleton states (Part 15) |
| H2 | Match system/real world | Kill fake trades, "prize pool" not "treasury", live leaderboard on spectator |
| H3 | User control and freedom | Back button on spectator, cancel mint, undo not applicable (blockchain) |
| H4 | Consistency | Design tokens, button sizing tiers (52/44/36), StatusBar column rhythm |
| H5 | Error prevention | Forge >80% confirmation dialog, slider capped at ratio |
| H6 | Recognition not recall | Tier names everywhere, ratios on slots, forge ratio table, batch prices visible |
| H7 | Flexibility/efficiency | Quick-set buttons, keyboard Enter for mint, tab for panel switch |
| H8 | Minimalist design | Tab panels, batch ladder in secondary column, auto-dismiss mints |
| H9 | Error recovery | Near-miss on forge fail, expandable "What happened?" on tx errors, VRF timeout path |
| H10 | Help/documentation | Rules carousel, forge empty state education, trade panel value explainer |

### Transaction Error Recovery Panel
On any `writeContract` failure:
```
┌────────────────────────────────────────────┐
│  ✕  Transaction failed                      │
│  "User rejected the request."               │
│  ┌ What happened? ──────────────────────┐    │
│  │ Your wallet rejected the transaction. │    │
│  │ No blocks burned. No ETH spent.      │    │
│  │ You can try again safely.            │    │
│  └──────────────────────────────────────┘    │
│  [← TRY AGAIN]  44px [F6]                    │
└────────────────────────────────────────────┘
```

---

## Part 14 — System-Level Fixes

These aren't visible design changes but they prevent the design from breaking.

### 14A: Global Font Import [F3-Visceral]
Move `@import url('fonts.googleapis.com/...')` from Landing.jsx and Modals.jsx CSS strings into `index.html` `<head>`. Currently, deep-linking to `/game` causes font flash because Press Start 2P hasn't loaded yet. Font flash breaks the visceral design level — the first 200ms of visual impression matters.

### 14B: VRF Recovery Guard [F7-H1]
Uncomment `recoveryRan.current = true` in VRFMintPanel (currently line ~477). Without this, the on-chain VRF recovery scan runs on every component re-mount, creating duplicate pending mint entries. Also: make on-chain data the primary source for pending mints, with localStorage as a speed-up cache only. If localStorage is cleared, the on-chain recovery should reconstruct the pending state completely.

### 14C: React Error Boundary [F7-H9]
Add a top-level `ErrorBoundary` component wrapping the app. When a contract read fails (RPC down, wrong chain, Vite hot-reload crash), show a styled error screen matching the game aesthetic:
```
"Connection lost. Check your wallet and refresh."
[↻ REFRESH]
```
Not a white page. Never a white page.

### 14D: CRT Overlay Z-Index [F7-H3]
The scanline overlay in Game.jsx uses `z-index: 9999`. Modals use `z-index: 200`. The CRT overlay sits ABOVE modals, potentially intercepting clicks. Fix: reduce CRT to `z-index: 1` with `pointer-events: none` (already has pointer-events none, but z-index should be low regardless as defensive practice).

### 14E: Loading Skeleton States [F7-H1]
When `useGameState.isLoading` is true:
- Tier cards show shimmering placeholder rectangles (standard skeleton pattern)
- StatusBar shows "—" in value slots with a subtle pulse
- Panel content shows "Loading game state..." centered

Currently shows zeros — a player landing for the first time sees "0/6 TIERS" and empty cards, thinks the game is dead. Skeleton states communicate "data is arriving" instead of "nothing exists."

### 14F: WalletButton Component Consolidation [F7-H4]
Game.jsx reimplements wallet connect/disconnect inline (~120 lines). `WalletButton.jsx` exists as a dedicated component. Remove the inline implementation from Game.jsx and use the component. Single implementation = fewer bugs.

---

## Part 15 — Code Architecture

### 15A: Module Splitting [F7-H4: Consistency, maintainability]
After all panel redesigns are complete, split Game.jsx (~1500+ lines) into:
```
components/TierCard.jsx
components/TierSlot.jsx
components/GameStatusBar.jsx
components/RevealMoment.jsx
panels/MintPanel.jsx
panels/ForgePanel.jsx
panels/TradePanel.jsx
screens/Game.jsx  (layout shell — imports panels, manages tab state)
```
Do this LAST (after all other changes) so you don't have to coordinate multi-file edits during the redesign.

### 15B: Design Tokens Consolidation
Game.jsx still defines local FELT, GOLD, CREAM, TIERS, TMAP, COMBINE_RATIOS etc. (lines 29-60) despite `design-tokens.js` existing. Remove all local duplicates. Import from `config/design-tokens.js`. Also update CountdownHolder, CountdownSpectator, and Modals to import from the shared file.

---

## Part 16 — Pre-Mainnet Art Fix

**T7.png Typo:** The card art reads "TEIR 7" instead of "TIER 7". Fix the PNG before mainnet. This is an image edit, not a code change. [F7-H4]

---

## Part 17 — Deferred to Post-Beta

These items from the original engagement roadmap are explicitly deferred. They're high-value but depend on infrastructure (subgraph events, WebSockets) or aren't critical for testnet beta:

| ID | Item | Why deferred |
|----|------|-------------|
| E17 | Live events feed (rare mints, large forges, failures) | Needs subgraph event indexing + new component |
| E18 | Treasury milestone announcements ($10K, $100K, $1M) | Low value at testnet scale |
| E19 | Session streak indicator ("3-window streak 🔥") | Nice-to-have, not core loop |
| E20 | Whale watch alerts ("A player just minted 200 blocks") | Needs event listening infrastructure |
| E21 | Season 2 migration banner | Players don't care about S2 until S1 is exciting |
| E22 | Social share hooks at all key moments | Partially covered by reveal moment shares; extend later |

These should be revisited after the testnet beta gathers feedback from 10-20 real players.

---

## Implementation Order

Six groups, dependency-ordered. Each group is a Claude Code session.

### Group 1: Structural Architecture (do first)

| # | Item | Part | Frameworks | Effort |
|---|------|------|-----------|--------|
| 1 | Global font import to index.html | 14A | F3-Visceral | 10 min |
| 2 | CRT overlay z-index fix | 14D | F7-H3 | 5 min |
| 3 | React Error Boundary component | 14C | F7-H9 | 45 min |
| 4 | Tab-based panel navigation | 2 | F4, F5, F10 | 2.5 hrs |
| 5 | GameStatusBar component | 2 | F2, F4, F9 | 1.5 hrs |
| 6 | Remove header prize pool | 2 | F4 | 15 min |
| 7 | Mint panel two-column layout | 3 | F1, F6, F9 | 2.5 hrs |
| 8 | Quick-set quantity buttons | 3 | F5, F6, F8 | 45 min |
| 9 | Timer edge case | 3 | F7-H1 | 20 min |
| 10 | Fitts's Law button sizing pass | 10 | F6 | 45 min |
| 11 | 20px layer gaps + Gestalt grouping | 11 | F2 | 30 min |
| 12 | Loading skeleton states | 14E | F7-H1 | 1.5 hrs |

**Group 1 total: ~11.5 hours**

### Group 2: Content & Honesty (do second)

| # | Item | Part | Frameworks | Effort |
|---|------|------|-----------|--------|
| 13 | Trade panel honest redesign | 5 | F7-H2, F3 | 1.5 hrs |
| 14 | Forge panel empty state | 4 | F7-H1, F10 | 1 hr |
| 15 | Forge panel active two-column | 4 | F1, F2, F3 | 1.5 hrs |
| 16 | Profile modal live data or honest empty | 13 | F7-H2 | 1.5 hrs |
| 17 | Auto-dismiss completed mints (60s) | 3 | F7-H8 | 20 min |
| 18 | Rules modal final number check | 13 | F7-H4 | 30 min |
| 19 | Forge confirmation dialog (>80%) | 4 | F7-H5 | 45 min |
| 20 | Transaction error recovery panel | 13 | F7-H9 | 45 min |
| 21 | VRF recovery guard fix | 14B | F7-H1 | 30 min |
| 22 | CountdownSpectator live leaderboard | 7 | F7-H2 | 1 hr |
| 23 | CountdownSpectator loss framing | 7 | F3, Prospect Theory | 15 min |
| 24 | CountdownSpectator back button | 7 | F7-H3 | 15 min |

**Group 2 total: ~10 hours**

### Group 3: Emotional Design (do third)

| # | Item | Part | Frameworks | Effort |
|---|------|------|-----------|--------|
| 25 | RevealMoment component (T5-T2) | 6 | F3, F11 | 3.5 hrs |
| 26 | Hook RevealMoment into mint delivery | 6 | F3, F11 | 1 hr |
| 27 | Combine ceremony (new tier unlock) | 6 | F3-Reflective | 1.5 hrs |
| 28 | Forge result ceremony + near-miss | 4 | F3-Reflective, F11 | 1.5 hrs |
| 29 | Share prompts (T2/T3 reveal + forge) | 6 | F3-Reflective, F12-Socializer | 45 min |
| 30 | Rank change notifications | 8 | F12-Killer, F3 | 1.5 hrs |
| 31 | Forge batch UI | 4 | F5, F11-Investment | 3 hrs |

**Group 3 total: ~13 hours**

### Group 4: Landing + Collection (do fourth)

| # | Item | Part | Frameworks | Effort |
|---|------|------|-----------|--------|
| 32 | Landing page restructure | 1 | F1, F9, F3 | 2.5 hrs |
| 33 | CLAIM pill + remaining "treasury" refs | 1 | F7-H4 | 10 min |
| 34 | Tier card size 92→120px | 2 | F1 | 30 min |
| 35 | Empty tier locked silhouette | 2 | F3-Reflective | 1 hr |
| 36 | T1 "SACRIFICE ONLY" state | 2 | F7-H6 | 20 min |
| 37 | Collection summary line | 2 | F3, F12-Achiever | 1.5 hrs |

**Group 4 total: ~6 hours**

### Group 5: Accessibility & Polish (do fifth)

| # | Item | Part | Frameworks | Effort |
|---|------|------|-----------|--------|
| 38 | Typography minimum sizes | 9 | F8 | 45 min |
| 39 | Contrast ratio fix (0.25→0.45) | 9 | F8 | 30 min |
| 40 | Tier dot accessibility (■/◇) | 9 | F8 | 15 min |
| 41 | Mobile responsive pass | 2,3 | F8 | 2.5 hrs |
| 42 | F-pattern audit on game screen | 12 | F9 | 30 min |
| 43 | WalletButton consolidation | 14F | F7-H4 | 30 min |
| 44 | Stale address in AllTiersTrigger | 14 | F7-H4 | 1 min |

**Group 5 total: ~5 hours**

### Group 6: Code Architecture (do last)

| # | Item | Part | Frameworks | Effort |
|---|------|------|-----------|--------|
| 45 | Design tokens consolidation | 15B | F7-H4 | 30 min |
| 46 | Module split (Game.jsx → panels) | 15A | F7-H4 | 2 hrs |
| 47 | T7.png typo art fix | 16 | F7-H4 | Art edit |

**Group 6 total: ~2.5 hours + art edit**

---

**Grand total: ~48 hours across 6 groups (47 items)**

---

## Claude Code Session Prompts

For each group:

```
Read /Users/bhuri/Desktop/block-hunt/UI_UX_REDESIGN_PLAN_v3.1.md

Execute Group [N] items. The item numbers, part references, and framework tags
tell you what to build and WHY. Follow specs precisely — dimensions, colours,
and behaviors are deliberate, not suggestions.

Project: /Users/bhuri/Desktop/block-hunt
Stack: React + Vite + wagmi v2 + viem
Dev browser: Safari (Chrome/MetaMask SES lockdown)
Shared tokens: frontend/src/config/design-tokens.js
New components go in: frontend/src/components/
Panel components go in: frontend/src/panels/ (create if needed)

Work items in numbered order. Run npm run dev after each. Fix before moving on.
```

---

## Success Criteria

When complete:

1. Prize pool visible within 2 seconds of landing [F1, F9]
2. ≤7 info groups visible at any time on game screen [F4]
3. Primary buttons are the largest targets per panel [F6]
4. Zero fake data or fake interactions anywhere [F7-H2]
5. Rare mints trigger celebration proportional to rarity [F3, F11]
6. First mint achievable in ≤3 taps from game screen [F5]
7. All interactive elements ≥44px touch target [F6, F8]
8. All text ≥4.5:1 contrast ratio [F8]
9. Related info grouped, unrelated separated [F2]
10. Font flash never occurs on any entry path [F3-Visceral]
11. App crash shows styled error, never white page [F7-H9]
12. Forge batch reduces multi-forge from 3 transactions to 1 [F5, F11]
13. Rank changes create competitive notification moments [F12-Killer]
14. Countdown spectator drives urgency through loss framing [F3, Prospect Theory]
15. The game feels like opening packs, not operating a control panel [F3]

---

## What This Plan Does NOT Cover

- Smart contract changes (batch-scaled rarity, keeper automation, SeasonEscrow)
- Subgraph redeployment to new contract addresses
- Sound design for reveal moments
- E17-E22 engagement roadmap items (deferred to post-beta — see Part 17)
- Guild mechanics, Season 2 features
- Security audit or mainnet deployment checklist
- Firefox scrollbar styling (cosmetic, non-blocking)

---

*Every item traces to a named framework. Every spec has dimensions. Every gap from every prior plan version is accounted for. This is the final document. Ready for implementation.*

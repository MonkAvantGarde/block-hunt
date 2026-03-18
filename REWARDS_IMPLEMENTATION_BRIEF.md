# Rewards System — Claude Code Implementation Brief
> **Read this entire document before writing any code.**
> This is the rules of engagement for adding the rewards system to The Block Hunt.

---

## Golden Rule

**The game works right now. Your job is to add to it without breaking anything.**

Everything that currently works — minting, combining, forging, tier cards, leaderboard, status bar, landing page, countdown screens — must continue working exactly as before after every single change you make. If something breaks, stop and revert.

---

## Reference Documents

Before starting, read these in order:

1. **REWARDS_SYSTEM_DESIGN_v1.1.docx** — Complete design spec. All reward mechanics, funding model, budget, claim UX, and contract spec.
2. **REWARDS_PANEL_INTERACTIVE.html** — Open in browser. This is the visual spec. Click through all 5 cards to see exactly what each detail view looks like. Match this pixel-for-pixel using the existing design tokens.
3. **STATUS_26.md** — Current project state. Read this to understand what's deployed and what's working.
4. **design-tokens.js** — The design system. All colours, tier data, game constants. You will add 1 new colour here.
5. **Game.jsx** — The main game screen. You will add ~10 lines here for the 4th tab. Understand the existing tab structure before touching it.

---

## Safety Rules (non-negotiable)

### 1. Branch first
```bash
git checkout -b rewards-system
```
All work happens on this branch. Never commit to `main` directly.

### 2. New files only (except the 2 listed below)
All rewards functionality goes in **new files**. You may only edit these 2 existing files:

| File | What you may change | Max lines changed |
|------|-------------------|------------------|
| `frontend/src/config/design-tokens.js` | Add `REWARDS_ACCENT` colour export | ~2 lines |
| `frontend/src/screens/Game.jsx` | Add rewards tab to `panels` array + import RewardsPanel | ~12 lines |

**DO NOT modify any other existing file.** Not the panels, not the hooks, not the components, not the ABIs, not wagmi.js, not the styles. If you think you need to edit an existing file not listed above, stop and explain why before proceeding.

### 3. Run the safety checklist after every change
After every file creation or edit, run:

```bash
# 1. Does it compile?
cd frontend && npm run build

# 2. Does it start?
npm run dev
# Open in Safari (Chrome is blocked by MetaMask SES lockdown)
# Verify: game screen loads, tier cards visible, tabs work

# 3. Do existing contract tests still pass? (only for contract sessions)
cd .. && forge test
```

If any check fails, revert your last change immediately with `git checkout -- <file>`.

### 4. Never rename, move, or restructure existing files
The current file structure is working and deployed. Do not reorganise it.

### 5. Import from design-tokens.js
Never hardcode colours, tier data, or game constants. Import everything from `frontend/src/config/design-tokens.js`. For the new rewards accent colour, add it there first, then import it everywhere.

---

## What You Are Building

A 4th tab (★ REWARDS) in the existing game tab bar. Inside this tab: a panel with 5 clickable summary cards that expand to detail views. No sub-tabs. Cards-only navigation with breadcrumb back.

### The 5 reward layers:

| Layer | Name | ETH? | Data Source |
|-------|------|------|------------|
| 1 | Daily Streak | No | Subgraph events (timestamps) |
| 2 | Milestone Ladder | No | Subgraph aggregates (counts) |
| 3 | Hall of Fame | Yes (batch firsts) | Subgraph (firsts) + Contract (claims) |
| 4 | Daily Minter Lottery | Yes | Contract (BlockHuntRewards.sol) |
| 5 | Batch Milestone Bounty | Yes | Contract (BlockHuntRewards.sol) |

---

## Phase A: Frontend (free layers — no contract needed)

**This is the first session.** Build everything that reads from the subgraph only. The ETH claim functionality (Layers 3-5 claim buttons) will be wired in Phase C after the contract exists. For now, build the UI with placeholder data where contract reads would go.

### New files to create:

```
frontend/src/
├── panels/
│   └── RewardsPanel.jsx          ← Main panel (mounted in Game.jsx tab)
├── components/rewards/
│   ├── RewardsOverview.jsx       ← The 5-card grid + "tap to learn more" hint
│   ├── StreakDetail.jsx          ← Streak detail view (streak count, timeline, tier ladder)
│   ├── MilestoneDetail.jsx       ← Milestone categories, badges, progress bars
│   ├── LotteryDetail.jsx         ← Daily prize, stats, history, eligibility
│   ├── BountyDetail.jsx          ← Batch progress, bounty amount, eligibility
│   ├── HallOfFameDetail.jsx      ← Legends + batch firsts + tier discovery firsts
│   ├── ClaimModal.jsx            ← Confirmation modal (reward name, amount, gas, confirm button)
│   └── RewardToast.jsx           ← Notification toast component
└── hooks/
    └── useRewardsData.js         ← All rewards data fetching (subgraph + contract reads)
```

### Edits to existing files:

**design-tokens.js** — Add at the end of the CORE PALETTE section:
```js
export const REWARDS_ACCENT = "#4ecdc4";
export const REWARDS_BG = "#0a1520";
```

**Game.jsx** — Three changes:

1. Add import at top:
```js
import RewardsPanel from '../panels/RewardsPanel'
```

2. Add to the `panels` array (after the trade entry):
```js
{ id:"rewards", label:"★ REWARDS", bg:"#0a1520", titleColor:"#4ecdc4" },
```

3. Add to the panel rendering switch (inside the active panel block):
```js
{p.id==="rewards" && <RewardsPanel address={address} blocks={blocks} />}
```

That's it for Game.jsx. Do not change anything else in that file.

---

## RewardsPanel.jsx — Architecture

```
RewardsPanel
├── Header (title + rewards pool balance)
├── Breadcrumb (only visible when in detail view)
├── [Overview mode] → RewardsOverview (5 cards)
│   ├── Streak card (click → StreakDetail)
│   ├── Lottery card (click → LotteryDetail)
│   ├── Milestones card (click → MilestoneDetail)
│   ├── Batch Bounty card (click → BountyDetail)
│   └── Hall of Fame card (click → HallOfFameDetail) [full-width]
├── [Detail mode] → One of the 5 detail components
└── "TAP ANY CARD TO LEARN MORE →" hint (overview only)
```

State management is simple: `useState('overview')` for the current view. When a card is clicked, set to `'streak'` / `'lottery'` / `'milestones'` / `'bounty'` / `'hof'`. Breadcrumb click sets back to `'overview'`.

---

## useRewardsData.js — Data Sources

### Available now (subgraph):
```graphql
# Subgraph URL: https://api.studio.thegraph.com/query/1744131/blok-hunt/version/latest

# For streaks — get player's events, group by UTC day
{
  mintEvents(where: { player: "0x..." }, orderBy: timestamp, orderDirection: desc) {
    timestamp
  }
  combineEvents(where: { player: "0x..." }, orderBy: timestamp, orderDirection: desc) {
    timestamp
  }
  forgeEvents(where: { player: "0x..." }, orderBy: timestamp, orderDirection: desc) {
    timestamp
  }
}

# For milestones — aggregate counts
{
  player(id: "0x...") {
    totalMints
    totalCombines
    totalForges
    totalForgeSuccesses
    totalForgeFails
  }
}

# For hall of fame — earliest events
{
  mintEvents(first: 1, orderBy: timestamp, orderDirection: asc) {
    player
    timestamp
  }
}
```

Note: The subgraph schema may not have all these fields. Check what's available first with an introspection query. If fields are missing, the subgraph will need updating — flag this and use placeholder data for now.

### Available later (contract — Phase C):
- `getClaimable(wallet)` — pending claims
- Daily lottery state (current day, prize, eligible wallets, winner)
- Batch bounty state (entitlements per wallet)
- Batch first state (winners per achievement)

For Phase A, use hardcoded mock data for anything that requires the contract. Mark these clearly with `// TODO: Replace with contract read when BlockHuntRewards.sol is deployed` comments.

---

## Styling Rules

### Match the existing game exactly:
- Fonts: `'Press Start 2P'` for labels/headings (7-9px), `'VT323'` for numbers/data (16-28px), `'Courier Prime'` for body text
- All colours from design-tokens.js — never hardcode hex values
- The rewards panel accent is `#4ecdc4` (teal) — distinct from mint green, forge purple, trade orange
- Background for rewards panel: `#0a1520` (dark navy)
- Card borders: `1px solid rgba(78,205,196,0.08)` — hover state: `rgba(78,205,196,0.25)`
- Use the same inline style pattern as existing components (no CSS modules, no styled-components, no external stylesheets)
- Animations: subtle only. `fadeInUp` for cards entering, `goldPulse` for streak fire, `lotteryGlow` for lottery card. Define these in a `<style>` tag within RewardsPanel.jsx, same pattern as Game.jsx's GLOBAL_CSS

### Reference the HTML mockup:
Open `REWARDS_PANEL_INTERACTIVE.html` in a browser. Every colour, spacing, font size, and layout is defined there. Match it exactly. The mockup IS the spec.

---

## Phase B: Contract (separate session)

**Do not start this until Phase A is reviewed and merged.**

### New files:
```
src/BlockHuntRewards.sol           ← ~250-350 lines
test/BlockHuntRewards.t.sol        ← Comprehensive tests
script/DeployRewards.s.sol         ← Deploy script
```

### Safety:
- Does not import or interact with any existing contract except reading events
- `forge test` must pass ALL existing 200+ tests plus new tests
- Deploy to Base Sepolia separately — new contract address, new ABI

### After deploy, add to wagmi.js:
```js
// Add to CONTRACTS object (do not modify existing entries)
REWARDS: '0x...',  // BlockHuntRewards address
```

### After deploy, add ABI to abis/index.js:
```js
// Add new export (do not modify existing exports)
export const REWARDS_ABI = [ ... ];
```

---

## Phase C: Wire Contract to Frontend (separate session)

**Do not start this until Phase B is deployed and tested on BaseScan.**

### Changes to existing new files only:
- `useRewardsData.js` — replace mock data with `useReadContract` calls to BlockHuntRewards
- `ClaimModal.jsx` — wire `useWriteContract` for the 3 claim functions
- `LotteryDetail.jsx` — add claim button (visible only to winners)
- `BountyDetail.jsx` — add claim button (visible only to eligible minters)
- `HallOfFameDetail.jsx` — add claim buttons for batch firsts

### Claim button visibility:
```js
// Read claimable state
const claimable = useReadContract({
  address: CONTRACTS.REWARDS,
  abi: REWARDS_ABI,
  functionName: 'getClaimable',  // or per-type check — TBD in contract session
  args: [address],
})

// Only show button if wallet has a pending claim
{claimable?.dailyPrize > 0 && <ClaimButton ... />}
```

### Claim flow:
1. Button click → open ClaimModal with reward details
2. User clicks CONFIRM CLAIM in modal
3. `useWriteContract` fires the appropriate function
4. On success: close modal, gold flash animation, refetch data
5. On error: show transaction error panel (reuse existing TxErrorPanel pattern from Game.jsx)

---

## What NOT To Build (deferred or out of scope)

- No changes to the subgraph schema in Phase A (use available fields or mock data)
- No Gelato keeper configuration (that's a separate infrastructure session)
- No changes to existing contract tests
- No changes to Landing.jsx, CountdownHolder.jsx, CountdownSpectator.jsx, AllTiersTrigger.jsx
- No changes to MintPanel.jsx, ForgePanel.jsx, TradePanel.jsx
- No changes to GameStatusBar.jsx, TierSlot.jsx, TierCard.jsx, RevealMoment.jsx
- No changes to Modals.jsx (leaderboard, rules, profile)
- No changes to useGameState.js
- No changes to the deploy scripts for existing contracts
- No OpenSea API integration
- No "Claim All" functionality — every claim is individual

---

## Definition of Done (Phase A)

- [ ] `rewards-system` branch created, all work committed there
- [ ] `design-tokens.js` has REWARDS_ACCENT and REWARDS_BG exports (2 lines added)
- [ ] `Game.jsx` has 4th tab + RewardsPanel import (~12 lines changed)
- [ ] RewardsPanel.jsx renders overview with 5 clickable cards
- [ ] Each card click shows correct detail view with breadcrumb back
- [ ] "TAP ANY CARD TO LEARN MORE →" hint visible on overview
- [ ] Streak detail: shows streak count, tier badge, 7-day timeline, tier ladder, progress bar
- [ ] Milestone detail: shows minting/forging/collection categories with earned/next/locked badges and progress bars
- [ ] Lottery detail: shows prize amount, wallet count, eligibility, draw countdown, recent history
- [ ] Bounty detail: shows batch progress bar, bounty amount, eligible wallets, per-wallet estimate
- [ ] Hall of Fame detail: legends (15 overall firsts) + batch firsts (13 per batch, including 5 tier discovery) with tier accent colours
- [ ] ★ REWARDS tab badge dot pulses when content is actionable
- [ ] All fonts, colours, and spacing match REWARDS_PANEL_INTERACTIVE.html mockup
- [ ] `npm run build` succeeds with zero errors
- [ ] Game loads in Safari — existing mint/combine/forge flows unaffected
- [ ] No existing file modified except the 2 listed above
- [ ] TODO comments mark every place where contract reads will be wired in Phase C

---

## Session Start Checklist (paste this at the beginning of each Claude Code session)

```
Before starting:
1. Read REWARDS_IMPLEMENTATION_BRIEF.md (this file)
2. Open REWARDS_PANEL_INTERACTIVE.html in browser for visual reference
3. Read REWARDS_SYSTEM_DESIGN_v1.1.docx for full mechanics
4. Run: git status (confirm clean working tree)
5. Run: git checkout rewards-system (or create if first session)
6. Run: cd frontend && npm run build (confirm it works BEFORE you touch anything)
```

---

*Last updated: March 16, 2026 — Session 17 (Rewards System Design)*

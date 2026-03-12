# The Block Hunt — Frontend Improvement Plan
> **Version:** 1.0 | **Date:** March 12, 2026  
> **Scope:** Code review findings + engagement mechanics + detailed execution specs  
> **Purpose:** Align on all changes before implementation begins

---

## Part 1 — Frontend Code Review

A thorough reading of every screen, component, hook, ABI, and asset. Issues are grouped by severity.

---

### CRITICAL — Bugs Breaking Current UX

**C1: Hardcoded Mint Price (Game.jsx line 524, 534)**

The VRF mint panel calculates cost using `qty * 0.00025` — the old flat price. The contracts now use batch-scaled pricing starting at 0.00008 ETH. Players see inflated costs, overpay, and get silently refunded. The `BATCH_PRICES_ETH` table and `getMintPrice()` helper already exist in wagmi.js (added Session 14) but the mint panel never calls them. Also, the `MINT_PRICE` ABI entry in index.js references the old contract function.

*Fix:* Read `currentBatch()` from MintWindow, look up price from `BATCH_PRICES_ETH` table in wagmi.js, use that for both display and `parseEther` calculation. Remove the `MINT_PRICE` ABI entry.

**C2: ABI Missing Phase 2 Functions (index.js)**

The ABI file doesn't include: `forgeBatch(uint256[], uint256[])` on Forge, `burnForForge()` / `resolveForge()` on Token (which replaced `executeForge`), `currentMintPrice()` on Token, `currentBatch()` on MintWindow, or the entire BlockHuntEscrow ABI. The `sacrifice()` signature in the ABI takes no params (correct for the new contract), but `executeDefaultOnExpiry()` is missing entirely.

*Fix:* Regenerate ABIs from compiled artifacts after `forge build`, or manually add the missing function signatures. Add a new `ESCROW_ABI` export.

**C3: Escrow Contract Not Wired**

The frontend has zero awareness of BlockHuntEscrow (0x932E...). Any UI reading sacrifice distribution, community pool, or leaderboard entitlements from Countdown will get nothing — that data lives in Escrow now.

*Fix:* Add ESCROW address to wagmi.js contracts config. Add Escrow ABI to abis/index.js. Update CountdownHolder and CountdownSpectator to read from Escrow for sacrifice state.

**C4: Combine Ratio for T2→T1 Incorrect (Game.jsx line 48)**

`COMBINE_RATIOS` includes `2:100`, implying players can combine 100 T2s into T1. This was blocked in the contracts — T2→T1 combine doesn't exist. The Origin is sacrifice-only. The combine button would show for T2 holders with 100+ blocks and the transaction would revert on-chain.

*Fix:* Remove the `2:100` entry from `COMBINE_RATIOS`. T2 slots should show count but no combine button.

**C5: Contract Addresses Stale in AllTiersTrigger.jsx (line 17)**

The file header comment still references the old Token address `0x57Efa...`. While `CONTRACTS.TOKEN` from wagmi.js is used in the actual code (correct), this could cause confusion during debugging.

*Fix:* Remove hardcoded address from the comment header.

**C6: Progress Bar Off-By-One (Game.jsx line 1128)**

`have6` counts tiers 2-7 where balance > 0, giving 0-6. The progress bar displays `have6 / 6`. When all 6 tiers are held (have6 = 6), the bar should show full and "6 / 6". The known bug is that it shows "5/6" when all 6 are held. Looking at the code, `have6` calculation looks correct. The bug is likely a rendering timing issue — the refetchAll after combine/mint hasn't returned yet when the UI re-renders.

*Fix:* Add a `useEffect` that explicitly checks after `refetchAll` completes. Or: use the `all6held` boolean (which is correctly computed on line 1131) to force `have6 = 6` display.

---

### HIGH — Significant UX Issues

**H1: localStorage Used for Pending Mints (Game.jsx line 423-429)**

The `loadPending()` / `savePending()` functions use `localStorage` to persist in-flight VRF mint requests across sessions. This works in production but will fail in any artifact preview environment. More importantly, if a user clears browser data, they lose track of pending mints and can't cancel them. The on-chain recovery (lines 474-519) is the safety net but the comment says `recoveryRan.current = true` is commented out, meaning recovery might run multiple times.

*Fix:* Uncomment the recovery guard. Consider moving pending mint state into a React context that initialises from on-chain data as the primary source, with localStorage as a speed-up cache only.

**H2: Forge Panel Shows Old Probability Model (Game.jsx line 890-891, 899)**

The burn count slider shows "10 = 10%" to "99 = 99%" — the old flat probability model. Contracts now use ratio-anchored probability: burning N of M blocks = N/M × 100% chance, where M is the combine ratio for that tier. For example, forging T7→T6 with ratio 20: burning 10 of 20 = 50%, not 10%. The slider labels and the percentage display are both wrong.

*Fix:* Read the combine ratio for the selected tier. Calculate probability as `(burnCount / ratio) * 100`. Update the slider min to reflect the minimum meaningful burn count (which is still 10 per contract, but the displayed percentage should be `10/20 = 50%` for T7, not "10%"). Update labels to show "Burn 10 of 20 = 50%" format.

**H3: Trade Panel is Fully Hardcoded (Game.jsx lines 930-936)**

The Trade panel shows fake listings with fake prices. All interactions (BUY, LIST, OPENSEA) just show toast messages. This is fine for early dev, but confusing for testnet beta players who might think the market is live.

*Fix:* Either connect to OpenSea's Seaport protocol for real listings, or clearly label the panel as "COMING SOON — Secondary market" with a link to the collection on OpenSea testnet. Don't show fake listings that look real.

**H4: Game Rules Modal Shows Outdated Numbers (Modals.jsx lines 89-93, 126-137)**

The rules carousel shows: "0.00025 ETH per block" (should be batch-scaled starting at 0.00008), "50,000 daily cap" (now batch-scaled via `windowCapForBatch`), "8 hours" window (now 6 hours), and "5% royalty" (now 10%). T2→T1 combine ratio of 100:1 is mentioned implicitly through the full tier table.

*Fix:* Update all numbers to match current contract state. Reference batch pricing dynamically or show the Batch 1 price with a note that it increases. Remove any T2→T1 combine reference.

**H5: Profile Modal Entirely Hardcoded (Modals.jsx lines 541-574, 576-715)**

The profile shows "vitalik.eth" with hardcoded stats and a fake activity feed. Holdings data is static. No data comes from the subgraph or on-chain reads.

*Fix:* Wire to subgraph for: connected wallet address display, tier balances, total mints/burns/combines/forges, and activity feed from indexed events. If subgraph isn't redeployed yet, show "Profile data loading..." with a note, not fake data.

**H6: Design Tokens Duplicated Across 6 Files**

FELT, WOOD, GOLD, GOLD_DK, GOLD_LT, INK, CREAM are defined independently in Game.jsx, Landing.jsx, Modals.jsx, CountdownSpectator.jsx, CountdownHolder.jsx, and AllTiersTrigger.jsx. Some files have slight variations (Landing uses FELT_DEEP, CountdownHolder has EMBER). If any colour changes, all 6 files need manual updates.

*Fix:* Extract a shared `design-tokens.js` module. Import everywhere. This also helps when building new components for the engagement features.

**H7: Font Import Only in Landing.jsx and Modals.jsx**

The `@import url('fonts.googleapis.com...')` for Press Start 2P, VT323, and Courier Prime only appears in Landing.jsx and Modals.jsx CSS strings. Game.jsx, CountdownHolder.jsx, and AllTiersTrigger.jsx rely on the fonts being loaded by whichever screen rendered first. If a user deep-links to `/game`, fonts might flash.

*Fix:* Move the font import to `index.html` or `main.jsx` so it loads once globally.

**H8: CountdownSpectator Has Hardcoded Leaderboard (CountdownSpectator.jsx)**

The `LEADERS` array at the bottom of the spectator screen is fully fake data. It should pull from the subgraph like the leaderboard modal does.

*Fix:* Reuse the subgraph query from LeaderboardModal, or import a shared leaderboard hook.

---

### MEDIUM — Code Quality & Maintainability

**M1: Game.jsx is 1,437 Lines**

One file contains: design tokens, 7 components (TierCard, TierSlot, Btn, StatBox, VRFStatusHeader, SpinnerBlock, PendingMintItem), the VRFMintPanel, ForgePanel, TradePanel, and the main GameScreen. This makes it hard to modify individual panels without risking regressions elsewhere.

*Fix:* Extract into separate files: `components/TierCard.jsx`, `components/TierSlot.jsx`, `panels/MintPanel.jsx`, `panels/ForgePanel.jsx`, `panels/TradePanel.jsx`. The main `GameScreen` becomes a layout shell that imports panels.

**M2: Side Effects in Render (Game.jsx line 1190, 1217)**

`{countdownActive === true && isConnected && !isActiveHolder && onNavigate('countdown-spectator')}` — this calls `onNavigate` during render, not in an effect. This can cause React warnings and unpredictable behavior (navigation might fire on every re-render).

*Fix:* Move navigation logic to `useEffect` hooks that depend on `countdownActive`, `isConnected`, and `isActiveHolder`.

**M3: No Error Boundaries**

If any contract read fails (RPC down, wrong chain), the entire screen crashes with a white page. No error UI exists.

*Fix:* Add a top-level error boundary component. Show a "Connection error — please check your wallet" screen instead of a crash.

**M4: WalletButton.jsx is Unused**

The dedicated `WalletButton` component exists but Game.jsx reimplements wallet connect/disconnect inline (lines 1042-1360). Two implementations of the same thing.

*Fix:* Use `WalletButton` in the Game header. Remove the inline implementation.

**M5: Batch Display Shows "day" Instead of "batch" (Game.jsx line 610)**

The stat box reads `windowInfo.day` and labels it "BATCH". The `day` field from `getWindowInfo()` is the window day counter, not the batch number. These are different — batch advances when supply is exhausted, day increments every window opening.

*Fix:* Add `currentBatch()` read from MintWindow contract to `useGameState.js`. Display batch number in the BATCH stat box, not day.

**M6: No Mobile Responsiveness**

The 7-column tier grid (`gridTemplateColumns: "repeat(7, 1fr)"`) and 3-column panel grid (`repeat(3, minmax(280px, 1fr))`) don't adapt to mobile screens. Cards become unreadably small below ~900px viewport width.

*Fix:* Add responsive breakpoints. On mobile: tier grid becomes 2 rows (4+3), panels stack vertically with tab navigation instead of side-by-side.

---

### LOW — Polish Items

**L1: T7.png Typo** — "TEIR 7" instead of "TIER 7". Fix the image before mainnet.

**L2: Scrollbar Styling Only Webkit** — The custom scrollbar CSS (Game.jsx line 99) only targets `::-webkit-scrollbar`. Firefox shows default scrollbar.

**L3: No Loading States** — When `useGameState` is fetching, the UI shows zeros instead of skeleton/loading indicators. First-time users might think the game is empty.

**L4: CRT Overlay on Every Screen** — The scanline overlay (Game.jsx line 1164) has `zIndex: 9999` and sits above modals. Could interfere with modal interactions on some browsers.

---

## Part 2 — Engagement Mechanics: Framework-Backed Recommendations

Each recommendation is anchored to an established behavioural framework. Items are tagged with the framework name so you can see the psychological reasoning.

---

### TIER 1 — Highest Leverage (Do First)

**E1: The Reveal Moment** `[Variable Ratio Reinforcement / Hook Model]`

*What:* When VRF delivers a mint result, the frontend should treat rare tiers as events — not silent inventory updates. T7 gets a quiet confirmation. T6 gets a minor visual bump. T5 gets a noticeable animation. T4 gets a full card reveal. T3 gets a dramatic animation with camera shake. T2 gets a full-screen spectacle with share prompt.

*Why:* The entire game loop depends on variable rewards. VRF minting is a slot machine. But slot machines don't work if the jackpot looks the same as a loss. The reveal moment is the reinforcement signal that makes the variable ratio schedule psychologically effective. Without it, the loop is: Trigger → Action → Nothing Visible → No Investment. With it: Trigger → Action → Dramatic Reward → Share (Investment).

*Implementation:* After VRF callback delivers, check which tiers were received. If the highest tier is ≤ T4, trigger a reveal overlay component. The component should: show the card art (the PNGs are gorgeous — T2 with flames, T3 with lightning, they deserve screen time), play a tier-appropriate animation (shake intensity, glow radius, particle count), and end with a share prompt: "You just pulled [Tier Name]. The prize pool is Ξ X." Share text pre-formatted for Twitter/X.

The mint detection is already partially built — `prevBlocksRef` tracking in VRFMintPanel detects when new blocks arrive. Extend this to compare before/after balances per tier and determine which tiers were newly received.

*Effort:* Medium. New component (~200 lines), modification to VRFMintPanel delivery detection.

---

**E2: Prize Pool as Centrepiece** `[Anchoring Effect / Loss Aversion]`

*What:* The prize pool balance should be the dominant visual element on every screen — Landing, Game, CountdownSpectator, CountdownHolder. Not a small stat box. A large, animated, glowing number that updates live and serves as the emotional anchor for every decision.

*Why:* The prize pool is the entire emotional engine. A player who sees "$2M and climbing" mints immediately. The same player seeing "Ξ 0.004" on testnet doesn't feel anything. The number needs to be big enough to anchor all downstream decisions: "Is this forge worth it? The prize pool is $X." By making it the centrepiece, every screen constantly reminds the player what's at stake.

*Current state:* Landing has a treasury bar (top center, small). Game has it in a small stat box at the bottom of the mint panel. CountdownHolder has it prominently. CountdownSpectator has it large. Inconsistent treatment.

*Implementation:* Create a shared `PrizePoolDisplay` component with three sizes (compact for headers, medium for panels, hero for landing/countdown). All sizes show: ETH amount, USD estimate (ETH × $2,500 or use a price feed), and a subtle pulse animation. The hero version shows "IF YOU WIN: Ξ X (claim) / Ξ X/2 (sacrifice)" breakdown.

*Effort:* Low. Shared component (~80 lines), drop into each screen.

---

**E3: "Treasury" → "Prize Pool" Rename** `[Framing Effect]`

*What:* Replace every instance of "treasury" in player-facing UI with "prize pool."

*Why:* "Treasury" is a DeFi/protocol term. "Prize pool" is a competition term. Different emotional register entirely. "The treasury is $2M" sounds like protocol TVL. "The prize pool is $2M" sounds like something you can win. This is pure framing — same fact, different emotional response.

*Current instances:* Landing.jsx line 401 ("TREASURY"), Game.jsx line 654 ("TREASURY"), Game.jsx header line 1254 (displays "◈ Ξ {treasury}"), CountdownSpectator Ticker ("PRIZE POOL:" — already correct), CountdownHolder ("PRIZE POOL" — already correct).

*Implementation:* Find-and-replace across all files. Also update `useGameState.js` return value name from `treasuryBalance` to `prizePool` for clarity (or keep the variable name internal and just change display labels).

*Effort:* Very low. Text changes only, 15 minutes.

---

**E4: Fix the 3 Critical Bugs (C1, C2, C3)**

These aren't engagement features — they're broken functionality. A player who sees the wrong price, can't interact with Escrow state, or triggers a revert because the ABI is wrong won't stay long enough for any engagement mechanic to matter.

*Effort:* Medium. ABI regeneration + price calculation fix + Escrow wiring.

---

### TIER 2 — Retention Mechanics (Do Second)

**E5: Mint Remaining Bar** `[FOMO / Social Proof / Scarcity]`

*What:* A visual progress bar on the Game screen showing how much of the current mint window has been consumed. `minted / allocated` from `getWindowInfo()`. When the bar passes 80%, visual urgency increases (colour shift, label change to "FILLING FAST"). When it hits 100%, "WINDOW SOLD OUT — next window in X:XX:XX".

*Why:* Scarcity drives action. "There are 2,000 slots left" doesn't create urgency. A bar that's 94% full creates urgency. This is the same mechanism as "only 3 left in stock" on e-commerce sites. The data already exists in `getWindowInfo()` — it just needs a visual treatment.

*Implementation:* Add to VRFMintPanel between the window status indicator and the quantity selector. Read `minted` and `allocated` from `windowInfo`. Render a bar with percentage label and conditional colour (green < 50%, yellow 50-80%, red > 80%).

*Effort:* Low. ~40 lines of JSX in the mint panel.

---

**E6: Batch Price Ladder** `[Endowed Progress Effect / Loss Aversion]`

*What:* Display all 6 batches with their prices on the Game screen. Current batch highlighted. Message: "You're in Batch 1 — the cheapest entry point. Prices rise as batches advance."

*Why:* Two effects. First, the Endowed Progress Effect: current players see they have an advantage over future players, which feels like earned progress. Second, Loss Aversion: the threat of prices doubling creates urgency to mint now rather than wait. The price table is fully deterministic from `BATCH_PRICES_ETH` — no contract call needed, just display.

*Implementation:* A `BatchLadder` component showing 6 rows. Each row: batch number, price in ETH, price in USD estimate, supply. Current batch gets a highlighted border and "◄ YOU ARE HERE" label. Place above or beside the mint quantity selector.

*Effort:* Low. ~60 lines, purely frontend display.

---

**E7: "X Blocks Away from Combine" Micro-Goal** `[Endowed Progress Effect / Zeigarnik Effect]`

*What:* For each tier, show a specific progress message: "12 more T7s to your first T6" or "Need 8 more T6s to combine." This appears below each tier slot in the card grid.

*Why:* The Zeigarnik Effect says unfinished tasks occupy the mind more than completed ones. By giving players a specific, countable target, every session ends with an incomplete task pulling them back. The Endowed Progress Effect amplifies this — showing "8 of 20" feels like being 40% done, which is motivating. "0 of 20" feels like starting from nothing.

*Current state:* TierSlot already shows a progress bar with `count/ratio`, but it's small (5px tall, unlabelled). The ratio is shown but the "X more needed" message isn't surfaced.

*Implementation:* In TierSlot, below the progress bar, add: `{count < ratio && <div>"Need {ratio - count} more"</div>}`. For tiers the player doesn't hold at all, show the full path: "20 T7s = 1 T6."

*Effort:* Very low. ~10 lines per tier slot.

---

**E8: Near-Miss Feedback on Forge Failure** `[Near-Miss Effect / Variable Ratio Reinforcement]`

*What:* When a forge fails, show how close the player was to success. "Your roll: 47. Threshold: 50. Almost." The nearer the miss, the more dramatic the display.

*Why:* The near-miss effect is one of the strongest motivators in probabilistic games. Slot machines deliberately show "two cherries and a near-cherry" because near-misses activate the same brain reward pathways as wins. In Block Hunt, the VRF random number and the threshold are both deterministic — the frontend can compute proximity. A player who missed by 3% will forge again. A player who sees "FAILED" with no context might not.

*Implementation:* After `ForgeResolved` event fires with `success: false`, compute what the threshold was (burnCount / ratio × 100 for the percentage). Show: "Roll: X%. Needed: Y%. {Z}% away." If within 5%, show "SO CLOSE" with a near-miss animation. The VRF random number isn't directly exposed in the event, but the probability threshold is derivable from the burn count and ratio.

*Effort:* Low-Medium. Modify ForgePanel delivered state to show proximity info. May need a contract read or event field to get the actual roll value — check if `ForgeResolved` includes it.

---

**E9: Leaderboard Reframe + "1 Away" Badge** `[Competition / Social Comparison]`

*What:* Change leaderboard header from "Top Players" to "The Race — Who's Closest to Winning". Add a highlighted badge for any player with `tiersUnlocked == 5`: "1 AWAY" in ember/red with a pulse animation.

*Why:* Two effects. The header change reframes the leaderboard from a static ranking into a live competition — same data, more urgency. The "1 away" badge creates a watchlist: players monitor specific wallets, creating community narratives ("0x3f is one tier away, will they forge or buy?"). The badge data (`tiersUnlocked`) is already in the subgraph.

*Implementation:* In LeaderboardModal, change the header text. In the row renderer, add conditional badge when `tiersUnlocked >= 5`. Use EMBER colour with badgePulse animation.

*Effort:* Very low. ~15 lines of changes in Modals.jsx.

---

**E10: Wire CountdownSpectator Routing** `[Loss Aversion / Spectator Engagement]`

*What:* When countdown is active and the connected player is NOT the holder, automatically route to CountdownSpectator screen. Currently built, not routed (Game.jsx line 1190 has the logic but it fires during render, which is a bug — see M2).

*Why:* During countdown, every non-holder needs to feel the urgency of "your window is closing." The spectator screen is the highest-tension moment in the game for 99.99% of players. It shows: live prize pool, holder wallet, community vote, and time remaining. This is where non-holders either accept defeat or start urgently forging/trading to become the next holder if countdown resets.

*Implementation:* Move the navigation call from render to a `useEffect`. When `countdownActive` becomes true and `isActiveHolder` is false, navigate to spectator screen. Add a "Back to Game" button on spectator for players who want to keep forging/trading.

*Effort:* Low. Fix the side-effect-in-render bug and add the back button.

---

### TIER 3 — Depth & Stickiness (Do Third)

**E11: "Your Collection Value" Summary** `[Portfolio Mental Model / Escalation of Commitment]`

*What:* A single line above the tier card grid: "Your collection: est. X.XX ETH combine value · Y Season 2 starters · Rank #Z"

*Why:* This shifts the player's mental model from "I have some blocks" to "I have a portfolio worth X ETH." Portfolio thinking increases commitment because selling or quitting feels like dismantling something you built (Escalation of Commitment). The combine value is deterministic — sum up the ETH cost to reach each held tier from T7 using mint prices and combine ratios.

*Implementation:* Calculate: for each tier held, what would it cost to reach that tier from scratch? (T7: 1 mint = 0.00008 ETH. T6: 20 mints = 0.0016 ETH. T5: 20×20 = 400 mints = 0.032 ETH. Etc.) Sum across all held blocks. Add Season 2 migration tier lookup (100-499 → 100, 500-999 → 150, 1000+ → 200 starters). Add leaderboard rank from subgraph.

*Effort:* Medium. New component with several calculations, subgraph query for rank.

---

**E12: Forge Panel Stakes Language** `[Loss Aversion / Irreversibility Framing]`

*What:* Before committing to a forge, show: "If this fails, all X blocks are gone permanently. No undo. No refund." Make the consequence visceral, not technical.

*Why:* Irreversibility creates drama. A warning that says "blocks will be burned" is factual but flat. "All 50 blocks gone permanently" makes the player feel the weight of the decision. Paradoxically, this increases engagement — high-stakes decisions are memorable, and memorable moments keep players coming back.

*Current state:* The forge panel shows "⚠ FAILURE DESTROYS ALL BURNED BLOCKS" (line 906) in small text. It's there but not emotionally weighted.

*Implementation:* Replace the small warning with a more prominent display above the FORGE button: a styled box with the exact block count and tier name: "If this fails: 50× The Restless — gone forever." Use EMBER colour. Make it impossible to ignore.

*Effort:* Very low. Copy change + slight style adjustment.

---

**E13: Loss Framing During Countdown** `[Loss Aversion / Framing Effect]`

*What:* When countdown is active, non-holders should see "Your window is closing" instead of neutral "Countdown active" language. The spectator screen's ticker should emphasise: "TIME IS RUNNING OUT" rather than just "COUNTDOWN ACTIVE."

*Why:* Prospect Theory demonstrates that people feel losses ~2× more strongly than equivalent gains. "Your window is closing" triggers loss aversion. "Countdown active" is a neutral status update. Same information, different emotional weight.

*Implementation:* Update CountdownSpectator ticker items. Replace "COUNTDOWN ACTIVE" with "YOUR WINDOW IS CLOSING". Add a red urgency state when < 24 hours remain.

*Effort:* Very low. Text changes in CountdownSpectator.jsx.

---

**E14: Landing Page Reframe** `[Anchoring / First Impression]`

*What:* Lead with prize pool and competitive tension: "One player wins everything. The community watches it happen." The live prize pool should be the very first thing a visitor sees — before the spinning block, before the tier badges.

*Current state:* Landing shows the spinning block hero first, "THE BLOCK HUNT" title, "collect · combine · forge · claim" tagline, action pills, and ENTER button. Treasury is in a small bar at top center. The page is beautiful but it leads with mechanics, not stakes.

*Why:* The Anchoring Effect means the first number a person sees sets their reference point. If the first thing they see is "Ξ 12.4375 prize pool" (or "$31,000 at stake"), every subsequent action is evaluated against that anchor. If the first thing they see is a spinning block and game mechanics, there's no emotional anchor.

*Implementation:* Restructure the layout hierarchy: (1) Prize pool — huge, glowing, center stage, (2) One-line hook: "One player wins everything.", (3) Spinning block (smaller), (4) Three things: there is a prize, there is a race, you can start now, (5) ENTER button. Push tier badges and action pills below the fold or into the rules modal.

*Effort:* Medium. Layout restructure of Landing.jsx, no new data requirements.

---

**E15: Forge Batch UI** `[Reduced Friction / Efficiency]`

*What:* UI for the new `forgeBatch()` function that lets players submit multiple forge attempts in one transaction. A "batch builder" where the player adds rows (select tier, select burn count), sees total blocks to burn and combined probability, then submits all at once.

*Why:* Reduced transaction friction means more forging. A player who wants to forge 3 different tiers currently needs 3 separate transactions (3 gas fees, 3 wallet prompts, 3 VRF waits). With batch forge, it's 1 transaction.

*Implementation:* New section in ForgePanel (or a separate BatchForgePanel). Allow adding multiple "forge rows". Each row: tier selector + burn count slider. Summary: total blocks burned, per-attempt probability, number of VRF words. Submit button calls `forgeBatch(uint256[] tiers, uint256[] burnCounts)`.

*Effort:* Medium-High. New panel with dynamic row management, new ABI integration.

---

**E16: Rank Change Notifications** `[Competition / Social Comparison / Killer Player Type]`

*What:* When a player's leaderboard rank changes (up or down), show a transient notification: "↑ You moved from #47 to #31" or "↓ You dropped from #31 to #38."

*Why:* This serves the Killer player type (competitive, wants to dominate). Rank increases feel like winning. Rank decreases trigger loss aversion and drive immediate action (mint more, forge more). Both directions increase engagement.

*Implementation:* Store last known rank in React state (or localStorage as cache). On each subgraph poll for leaderboard data, compare current rank to stored rank. If changed, show a toast notification. Upward movement: green, positive framing. Downward: amber, urgency framing.

*Effort:* Medium. Requires subgraph query integration for rank tracking.

---

### TIER 4 — Post-Beta Polish

**E17: Live Events Feed** — Scrolling feed of significant on-chain events (rare mints, large forges, forge failures, countdown triggers). Powered by subgraph event indexing. High-value but high-effort.

**E18: Treasury Milestone Announcements** — When prize pool crosses thresholds ($10K, $100K, $1M), trigger a visible banner moment + share prompt. Frontend-only threshold check.

**E19: Session Streak Indicator** — Track consecutive windows the player has minted in. Display as "3-window streak 🔥". Frontend-only, localStorage-based. Creates commitment via streak psychology.

**E20: Whale Watch Alerts** — When someone mints 200+ blocks, surface it to all players. "A player just minted 200 blocks." Creates social proof and competitive anxiety. Requires subgraph event or on-chain event listening.

**E21: Season 2 Migration Banner** — Persistent indicator: "Your current holdings → 150 Season 2 starter blocks." Calculation from GDD migration tiers. Low urgency for testnet.

**E22: Social Share Hooks** — At rare mint (T2/T3), countdown trigger, and countdown resolution: prompt with pre-formatted share text. AllTiersTrigger already has this pattern — extend to other moments.

---

## Part 3 — Execution Order

Ordered by: (1) unblocks other work, (2) engagement impact, (3) effort required.

| # | Item | Type | Est. Effort | Dependencies |
|---|------|------|-------------|--------------|
| 1 | E3: "Treasury" → "Prize Pool" rename | Language | 15 min | None |
| 2 | C4: Fix T2→T1 combine ratio | Bug fix | 5 min | None |
| 3 | H6: Extract shared design tokens | Refactor | 30 min | None |
| 4 | H7: Global font import | Refactor | 10 min | None |
| 5 | C2: Regenerate ABIs + add Escrow | Bug fix | 45 min | Forge build |
| 6 | C1: Fix mint price to batch-scaled | Bug fix | 30 min | #5 (ABI) |
| 7 | M5: Fix batch display (day → batch) | Bug fix | 20 min | #5 (ABI) |
| 8 | C3: Wire Escrow reads | Bug fix | 1 hr | #5 (ABI) |
| 9 | C6: Fix progress bar off-by-one | Bug fix | 20 min | None |
| 10 | M2: Fix side-effects in render | Bug fix | 30 min | None |
| 11 | E2: Prize pool centrepiece component | Engagement | 1 hr | #3 (tokens) |
| 12 | E5: Mint remaining bar | Engagement | 45 min | None |
| 13 | E6: Batch price ladder | Engagement | 45 min | #6 (price fix) |
| 14 | E7: "X blocks from combine" micro-goal | Engagement | 30 min | None |
| 15 | H2: Fix forge probability display | Bug fix | 45 min | None |
| 16 | E12: Forge panel stakes language | Language | 15 min | None |
| 17 | E9: Leaderboard reframe + "1 away" badge | Engagement | 30 min | None |
| 18 | E10: Wire CountdownSpectator routing | Feature | 30 min | #10 (render fix) |
| 19 | E13: Loss framing during countdown | Language | 15 min | None |
| 20 | H4: Update Game Rules modal numbers | Bug fix | 30 min | None |
| 21 | E1: Reveal moment animation | Engagement | 3-4 hrs | #3 (tokens) |
| 22 | E14: Landing page reframe | Engagement | 2 hrs | #11 (prize pool) |
| 23 | E11: "Your Collection Value" summary | Engagement | 2 hrs | Subgraph live |
| 24 | E8: Near-miss forge feedback | Engagement | 1.5 hrs | #15 (forge fix) |
| 25 | E15: Forge batch UI | Feature | 3 hrs | #5 (ABI) |
| 26 | M4: Use WalletButton component | Refactor | 30 min | None |
| 27 | H3: Trade panel placeholder | UX fix | 45 min | None |
| 28 | H5: Wire profile modal to subgraph | Feature | 2 hrs | Subgraph live |
| 29 | M1: Split Game.jsx into modules | Refactor | 2 hrs | After all panel changes |
| 30 | E16: Rank change notifications | Engagement | 1.5 hrs | Subgraph live |
| 31+ | Tier 4 items (E17-E22) | Polish | Various | Post-beta |

**Total estimated effort for Tiers 1-3:** ~25-30 hours of implementation work.

**Recommended session batches:**

- **Session A (Foundation):** Items 1-10 — all bug fixes and refactors. Gets the codebase correct before adding features.
- **Session B (Core Engagement):** Items 11-20 — prize pool, mint bar, batch ladder, micro-goals, forge fix, leaderboard, spectator routing, language changes. The game starts feeling alive.
- **Session C (The Reveal):** Item 21 — reveal moment animation. This is the single highest-impact engagement feature and deserves a focused session.
- **Session D (Polish & Depth):** Items 22-30 — landing reframe, collection value, near-miss, batch forge, profile, refactoring.

---

## Part 4 — What This Plan Does NOT Cover

These are tracked elsewhere and remain as-is:

- **Smart contract changes** — batch-scaled rarity, two 4-hour windows, SeasonEscrow contract
- **Keeper automation** — openWindow, checkHolderStatus, executeDefaultOnExpiry via Gelato
- **Subgraph redeployment** — new contract address in subgraph.yaml
- **BaseScan verification** — fix BASESCAN_API_KEY in .env
- **Security audit** — pre-mainnet requirement
- **Mobile layout pass** — listed as M6 above but detailed responsive design specs are a separate document

---

*End of document. Ready for alignment review before implementation begins.*

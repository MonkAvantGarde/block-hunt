# Blok-Hunt — Animation Specs: Remaining Animations + Micro-Interactions
> **Status:** LOCKED — Ready for implementation
> **Date:** March 18, 2026
> **Constraint:** CSS-only animations, no canvas, no external libraries, must work in Safari
> **Brand:** Always "Blok-Hunt" (not "Block Hunt")
> **Stack:** React + Vite + wagmi v2 + viem
> **Colours:** Import everything from config/design-tokens.js

---

## Already Implemented

These two animations are DONE and live in the codebase. Do NOT rebuild or modify them:

- **Animation 4: VRF Drum Roll** — Implemented. Energy charge with 5-phase timing.
- **Animation 5: Mint Reveal Card Flip** — Implemented. Genshin-style pre-signal card flip.

The remaining animations in this file must integrate with them (e.g. Forge Number Reveal enters after the Drum Roll shatter, Prize Pool Rolling Digits fires after Card Flip completes and balances update).

---

## Complete Animation Chain Reference

```
MINT FLOW:
  Player clicks MINT NOW
  → VRF Drum Roll charges (Animation 4) [ALREADY BUILT]
  → VRF delivers → snap → freeze → shatter
  → Card Flip reveals tiers (Animation 5) [ALREADY BUILT]
  → Balances update (with B3 roll-up + B5 StatusBar flash)
  → Prize Pool ticks (Animation 1) [this file]

FORGE FLOW:
  Player clicks FORGE
  → VRF Drum Roll charges in tier accent colour (Animation 4) [ALREADY BUILT]
  → VRF delivers → snap → freeze → shatter
  → Number Reveal spins and lands (Animation 3) [this file — CHAINS FROM EXISTING DRUM ROLL]
  → Success: new tier card appears (with B3 roll-up)
  → Failure: "You rolled X%. Needed: Y%"
  → Prize Pool ticks if applicable (Animation 1) [this file]

COMBINE FLOW:
  Player clicks COMBINE
  → Countdown Crunch: count accelerates down → squeeze → pop (Animation 2) [this file]
  → Balances update (with B3 roll-up)

ALL SIX TIERS HELD:
  → Captain Planet Cascade (Animation 6) [this file]
  → Dissolve into countdown screen
```

---

## Animation 1: Prize Pool Heartbeat — Rolling Digits

**Trigger:** Prize pool value increases (detected by comparing current poll to previous value)
**Where:** StatusBar prize pool display + Landing page hero prize pool
**Frequency:** Continuous/ambient — fires on every poll that returns a higher value
**New file:** `frontend/src/components/RollingDigits.jsx` (reusable component)

### Behaviour

When the prize pool value changes from one number to another, each digit that changes rolls through intermediate values visually — like a mechanical counter or airport departure board.

**The roll animation:**
- Each digit position is an independent rolling element
- When a digit changes (e.g. 5 → 8), it scrolls upward through 6, 7, 8 — landing on the new value
- Digits that don't change stay still
- Roll duration: 0.4s per digit
- Stagger: rightmost digit (smallest decimal place) starts first, each position to the left starts 50ms later — creates a "settling" ripple from right to left
- Easing: `cubic-bezier(0.2, 0, 0.1, 1)` — fast start, smooth deceleration, like a mechanical counter clicking into place

**Large vs small changes:**
- Small tick (e.g. +0.0008): only the last few digits roll, quick and subtle
- Large tick (e.g. +0.05 after a big mint): many digits roll, the stagger makes it dramatic — the counter is "catching up" to a big jump
- The roll speed stays constant (0.4s per digit) — it's the NUMBER of rolling digits that creates the drama

**Green arrow indicator:**
- A small green "▲" appears to the right of the value on each update
- Fades in instantly, fades out over 2s
- If another tick arrives before the arrow fades, it resets (stays visible, opacity snaps back to 1)

**Throttle:** If multiple ticks arrive within 2 seconds of each other, batch them — roll once to the final value rather than rolling twice. During active mint windows, the pool can update every few seconds; this prevents the counter from perpetually spinning.

### Technical Notes

**Digit roller implementation:**
- Each digit is a div with `overflow: hidden` and fixed height (one character tall)
- Inside: a column of 0-9 stacked vertically
- Roll = `transform: translateY(-{digit * charHeight}px)` with CSS transition
- The Ξ symbol and decimal point are static, only numeric digits roll

**State tracking:**
- `previousPrizePool` stored in a `useRef`
- On each contract read that returns a new value, compare with previous
- If higher: trigger roll animation, update ref
- If same or lower: do nothing (prize pool only goes up in normal gameplay)

**Reusable:** The `RollingDigits` component should accept any numeric value and animate between old and new. It'll be used for the prize pool, and potentially for the StatusBar batch count and minted count too.

**CSS:**
```
.digit-roller {
  display: inline-block;
  overflow: hidden;
  height: 1em; /* single character height */
}
.digit-column {
  transition: transform 0.4s cubic-bezier(0.2, 0, 0.1, 1);
}
```

---

## Animation 2: Combine Collapse — Countdown Crunch

**Trigger:** Combine transaction confirms on-chain
**Where:** Mint/Forge panel area (wherever the combine action lives)
**Duration:** 2 seconds total
**New file:** `frontend/src/components/CombineCollapse.jsx`

### Visual Sequence

**Step 1 — The Countdown (0–1.2s):**

The source tier card's count begins visually counting down. Not a smooth decrement — discrete steps that accelerate:

```
20 → 15 → 10 → 7 → 5 → 3 → 2 → 1 → 0
```

Timing between each step (accelerating):
```
20→15: 200ms
15→10: 180ms
10→7:  150ms
7→5:   120ms
5→3:   100ms
3→2:   80ms
2→1:   60ms
1→0:   40ms
```

As the count decreases:
- The source tier card scales down slightly: `1.0 → 0.85` (proportional to count, shrinking as blocks are consumed)
- The card's opacity decreases subtly: `1.0 → 0.7`
- The count number uses the same rolling digit style as Animation 1 for visual consistency
- The background of the card pulses faintly in the source tier's accent colour — faster as the countdown accelerates

**Step 2 — The Crunch (1.2–1.5s):**

At count = 0:
- The source card compresses to a single point (scale → 0) over 0.2s with `cubic-bezier(0.6, 0, 1, 0.4)` (accelerating into the crunch)
- Brief white flash at the compression point (a 20×20px div, opacity 0→1→0 over 0.15s)
- Screen shake: the entire game panel translates 2px right, then 2px left, then back to center over 0.1s
- The source tier count updates to the real remaining value (e.g. if player had 376, it now shows 356)

**Step 3 — The Pop (1.5–2.0s):**

The target tier card (the tier being created) does a pop entrance:
- Scale: `0 → 1.15 → 1.0` over 0.4s
- The card flashes bright (filter: brightness(1.5) → 1.0) as it appears
- The tier accent colour flares behind the card as a brief glow (box-shadow, 0.3s)
- The target tier count updates (e.g. 0 → 1, or 5 → 6) using the B3 roll-up animation
- A single line of text appears below: `"T7 × 20 → T6 × 1"` in cream, fades out after 1.5s

### Edge Cases

**Player has more blocks than needed:** If the player has 376 T7 and combines 20, the countdown shows 376 → 371 → 366... → 356 (same accelerating rhythm, but starting from actual count and ending at actual count minus combine ratio). The card doesn't fully disappear since blocks remain — it just squeezes to 0.85 scale at the crunch, flashes, then pops back to 1.0 with the new count.

**Combine ratio varies by tier:** T7→T6 and T6→T5 use 20 blocks. T5→T4 and T4→T3 use 30. T3→T2 uses 50. The countdown step sequence adapts — more steps for higher ratios:
- 20 blocks: `20→15→10→7→5→3→2→1→0` (8 steps)
- 30 blocks: `30→25→20→15→10→7→5→3→2→1→0` (10 steps)  
- 50 blocks: `50→40→30→20→15→10→7→5→3→2→1→0` (11 steps)
Total duration stays at ~1.2s regardless — individual step timing compresses for larger ratios.

### Technical Notes

- Countdown steps: array of target values, iterated with `setTimeout` at decreasing intervals
- Card scale/opacity: CSS transitions driven by React state, updated in sync with countdown
- Screen shake: CSS keyframe on the panel container, triggered by adding a class
- Pop entrance: CSS keyframe — `@keyframes popIn { 0% { transform: scale(0) } 70% { transform: scale(1.15) } 100% { transform: scale(1) } }`
- Keep the DOM simple: this animates EXISTING tier card elements, it doesn't create new overlay elements

---

## Animation 3: Forge Roulette — Number Reveal

**Trigger:** ForgeFulfilled event received (VRF callback delivers forge result)
**Enters after:** VRF Drum Roll shatters (Animation 4)
**Where:** Forge panel area, center
**Duration:** 2.5–3 seconds
**New file:** `frontend/src/components/ForgeNumberReveal.jsx`

### Overview

After the Drum Roll block shatters, the panel is clear. A spinning percentage counter appears and decelerates to land on the actual VRF result. A threshold line shows what was needed. The gap between the two numbers tells the story.

### Visual Sequence

**Step 1 — The Threshold (0–0.3s):**

A horizontal line appears across the panel at ~60% height. Above the line, right-aligned, in Press Start 2P, 9px, cream at 0.6:
```
NEED: 70%
```
(The actual probability the player chose when they set their forge burn amount.)

This appears instantly and stays visible throughout — it's the goalpost.

**Step 2 — The Spin (0.3–2s):**

A large number appears center-panel. VT323 font, 64px, gold.

The number spins rapidly — cycling through random percentages (0–100) at ~15 changes per second. It's a blur of digits, clearly random and unsettled.

Over 1.7 seconds, the spin decelerates:
- 0.3–0.8s: Full speed, ~15 changes/sec, numbers are a blur
- 0.8–1.3s: Slowing, ~8 changes/sec, individual numbers become readable
- 1.3–1.7s: Slow, ~3 changes/sec, the number is close to its final value now — tension builds
- 1.7–2.0s: Near-stop, ~1 change/sec, the last 2-3 values shown are near the final result

**The deceleration is weighted toward the final result.** In the last 0.7s, the displayed numbers cluster within ±15% of the actual result. This creates tension — the player sees numbers near the threshold and doesn't know which side they'll land on.

**Step 3 — The Landing (2.0s):**

The number stops. The final VRF result is displayed. Brief freeze — 0.3s of stillness.

**Step 4 — The Verdict (2.3–3.0s):**

**If SUCCESS (result ≤ probability threshold):**
- The landed number turns bright green
- The number scales up: `1.0 → 1.2` over 0.3s
- Text appears below: `"SUCCESS"` in the target tier's accent colour, Press Start 2P, 12px
- Below that: `"Rolled 47%. Needed: 70%"` in cream, VT323, 16px
- The panel background flashes the tier accent colour for 0.2s
- After 1s hold: the new tier card fades in below (or replaces the number), showing the tier art + name

**If FAILURE (result > probability threshold):**
- The landed number turns red
- The number shakes briefly (translateX ±3px, 3 oscillations, 0.2s)
- Text appears below: `"FAILED"` in red, Press Start 2P, 12px
- Below that: `"Rolled 73%. Needed: 70%"` in cream, VT323, 16px
- The panel dims slightly

**If NEAR-MISS (failed, but result was within 5% of threshold):**
- Same as failure, but add:
- `"So close."` appears above the FAILED text, in amber/gold, 0.5s fade-in
- The threshold line pulses red twice (opacity 0.5 → 1.0 → 0.5 → 1.0)
- The gap between rolled and needed is highlighted: e.g. `"Missed by 3%"` in small text

### Technical Notes

**The spin mechanic:**
- Use `setInterval` starting at ~67ms (15/sec), gradually increasing the interval
- Displayed values during spin are random `Math.floor(Math.random() * 101)`
- In the last 0.7s, constrain random range to `[result - 15, result + 15]` (clamped to 0–100)
- The final value is always the actual VRF result — the animation is a dramatic reveal of a known outcome

**Success/failure determination:**
- The forge contract returns a boolean success flag alongside the VRF random number
- The displayed percentage is: `(vrfRandomNumber % 100) + 1` (or however the contract calculates it)
- Success = rolled number ≤ player's chosen probability
- The spec here must match the contract's actual logic — verify with `BlockHuntForge.sol`

**Near-miss threshold:** Failed AND `(rolledNumber - neededNumber) ≤ 5`

**Number font:** VT323 at 64px for the spinning number. Large enough to be the focal point.

**No new dependencies.** Pure React state + CSS transitions.

---

## Animation 6: Collection Completion Cascade — Captain Planet

**Trigger:** Player holds all 6 tiers (T2–T7) simultaneously, detected on-chain
**Where:** Full-screen overlay, z-index 9000
**Duration:** 9 seconds total — the longest animation in the game
**This moment may happen ONCE per player, EVER. The ceremony matches the significance.**
**New file:** `frontend/src/components/CollectionCascade.jsx`

### Phase 1 — The Formation (0–3s)

Full-screen overlay fades in. Background: pure black.

Six tier cards (120×160px each, showing tier art) are positioned in a **circle** around the center of the screen, like Planeteers standing in formation. Evenly spaced at 60° intervals. Radius: ~200px from center.

The cards appear one at a time, starting dim and lighting up on activation:

| Order | Tier | Position (clock) | Accent Colour | Activation Time |
|-------|------|-------------------|---------------|-----------------|
| 1st | T7 — The Inert | 12 o'clock | Grey | 0.0s (slow) |
| 2nd | T6 — The Restless | 2 o'clock | Red | 0.5s |
| 3rd | T5 — The Remembered | 4 o'clock | Blue | 0.9s |
| 4th | T4 — The Ordered | 8 o'clock | Purple | 1.2s (accelerating) |
| 5th | T3 — The Chaotic | 10 o'clock | Orange | 1.4s |
| 6th | T2 — The Willful | 6 o'clock | Red-orange | 1.5s (rapid) |

**Each activation:**
- Card starts at opacity 0.2, greyscale, scale 0.8
- On activation: snaps to full opacity, full colour, scale 1.0
- A ring of the tier's accent colour pulses outward from the card (like a radar ping) — expands from card size to ~180% then fades
- The activation rhythm accelerates: first card is deliberate, last two are rapid-fire (Captain Planet energy — the final rings come fast)

After all six are lit, hold for 0.5s. All cards glow steadily.

### Phase 2 — The Beams (3–4.5s)

All six cards simultaneously emit a **wide energy beam** (15px width) toward the exact center of the screen. Each beam is the card's accent colour.

**Beam implementation:**
- Each beam is a div, absolutely positioned, with its width = 15px and height = distance from card center to screen center
- Rotated with `transform: rotate()` to point from card to center
- The beam doesn't appear instantly — it EXTENDS from the card toward center using a clip-path or scaleY animation over 0.5s (the beam "shoots" from card to center)
- Each beam has a glow: `box-shadow: 0 0 20px 5px {tierColour}` at 0.6 opacity

**Center convergence point:**
- Where all six beams meet, a white circle grows
- Starts at 0px radius, grows to 40px over the 1.5s of Phase 2
- Brightness increases: starts warm gold, shifts to blazing white
- `filter: brightness(2)` + `box-shadow: 0 0 60px 30px white` at the peak

### Phase 3 — The Flash (4.5–6s)

The white center point expands rapidly to engulf everything:

**4.5–5.0s:** The white circle expands from 40px to fill 30% of the screen. The beams begin dissolving — their opacity drops as the white overtakes them.

**5.0–5.5s:** White fills 70% of the screen. The cards at the edges are fading — consumed by the light. The beams are gone.

**5.5–6.0s:** Pure white screen. Everything is gone. Complete white. Hold for 0.5s.

**Implementation:** A single div centered on screen, `border-radius: 50%`, background white, scaling from `scale(0)` to `scale(20)` (large enough to cover viewport) over 1.5s. Easing: `cubic-bezier(0.4, 0, 0, 1)` — starts moderate, accelerates, hits the screen edges fast.

### Phase 4 — The Message (6–8s)

On the pure white screen, text fades in. Black text on white — stark, clean, unmistakable. Press Start 2P font.

**6.0s:** `"ALL SIX TIERS HELD."` — 14px, fades in over 0.4s. Centered, upper third.

**6.5s:** `"THE COUNTDOWN HAS BEGUN."` — 14px, fades in below the first line.

**7.0s:** `"7 DAYS."` — 24px, bold, fades in below. This is the largest text. The number that matters.

**7.5s:** `"The community is watching."` — 9px, 0.5 opacity, fades in at the bottom. Quiet. A reminder that this affects everyone.

### Phase 5 — Dissolve to Countdown (8–9s)

The white background and text slowly dissolve, revealing the actual Countdown screen underneath:

- The Countdown screen component is already mounted behind the overlay (z-index layering)
- The overlay opacity transitions from 1.0 to 0.0 over 1s
- The text fades first (0.3s), then the white background (0.7s)
- By 9s, the overlay is gone. The player is looking at the live Countdown screen with the clock already ticking

**Alternative:** If tapped/clicked at any point during Phase 4 or 5, skip immediately to the Countdown screen. Respect the player's time if they've absorbed the message.

### Technical Notes

**Card circle positioning:**
```javascript
const POSITIONS = [
  { angle: -90, tier: 7 },   // 12 o'clock
  { angle: -30, tier: 6 },   // 2 o'clock
  { angle: 30, tier: 5 },    // 4 o'clock
  { angle: 150, tier: 4 },   // 8 o'clock
  { angle: 210, tier: 3 },   // 10 o'clock
  { angle: 90, tier: 2 },    // 6 o'clock
];
// x = centerX + radius * cos(angle), y = centerY + radius * sin(angle)
```

**Beam geometry:**
- Calculate angle from card center to screen center
- Beam div: `position: absolute`, `transform-origin: top center`, rotated to point at center
- Beam extension animation: `scaleY(0) → scaleY(1)` with transform-origin at the card end

**Full-screen flash div:**
- `position: fixed`, `inset: 0`, `background: white`, `border-radius: 50%` initially
- Starts as small circle at screen center using `top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0)`
- Animates to `scale(20)` which more than covers any viewport
- Then `border-radius: 0` and `inset: 0` for the flat white background phase

**Z-index management:** The overlay must sit above everything including the StatusBar and nav. Use `z-index: 9000`. The Countdown screen behind it loads at `z-index: 1` (normal).

**Performance:** 6 card divs + 6 beam divs + 1 flash div + text divs = ~16 DOM elements total. Lightweight. All animations are CSS transitions/keyframes, no JS animation loops.

---

## Section B — Micro-Interactions (B1–B5)

These are small CSS/JS enhancements to existing components. No new files needed unless the code structure demands it. Each is independent.

### B1. Tier Card Hover Tilt

**What:** When hovering over a held tier card on desktop, the card tilts slightly toward the cursor position — like a physical card being tilted in hand.

**Implementation:**
- Add `onMouseMove` handler to each tier card div
- Calculate cursor position relative to card center
- Apply `transform: perspective(600px) rotateX({tiltY}deg) rotateY({tiltX}deg)`
- Max tilt: ±8 degrees on each axis
- Transition: `transform 0.1s ease-out` for smooth tracking
- On mouse leave: reset to `rotateX(0) rotateY(0)` with `transition: transform 0.3s ease-out`

**Desktop only:** Wrap in `@media (hover: hover)` or check for touch device. No tilt on mobile/tablet.

**Only on held cards:** Cards with count > 0. Empty/locked cards don't tilt (they're not "yours" yet).

### B2. COMBINE Button Pop

**What:** When a tier slot crosses the combine threshold (e.g. T7 count goes from 19 to 20), the COMBINE button appears with a celebratory pop.

**Implementation:**
- Track previous block counts in a ref
- When new count ≥ combine ratio AND previous count < combine ratio: trigger pop
- Pop animation: `@keyframes combinePopIn { 0% { transform: scale(0); opacity: 0 } 60% { transform: scale(1.15) } 100% { transform: scale(1); opacity: 1 } }` — 0.3s duration
- Single gold particle burst: 6-8 small gold squares (3×3px) that fly outward from the button center and fade — each with a random direction, 0.4s duration, CSS keyframes
- The particles are absolutely positioned divs, removed from DOM after animation completes

**Only fires on threshold crossing, not on page load.** If the player already has 50 T7 when they load the page, the button is just there — no animation.

### B3. Count Number Roll-Up

**What:** When a tier's block count changes, the number animates from old value to new value over 0.5s instead of snapping instantly.

**Implementation:**
- Use `requestAnimationFrame` loop
- Easing: ease-out curve — fast at start, decelerating toward final value
- Duration: 0.5s
- Round to integers at each frame
- Example: 376 → 396 over 0.5s, showing ~15 intermediate values

**This is distinct from the RollingDigits component (Animation 1).** RollingDigits scrolls individual digit columns mechanically. B3 is a simple numeric interpolation — the whole number changes as one, rapidly counting up/down. Both can coexist: RollingDigits for the prize pool, B3 for tier counts.

**Cancel on new update:** If the count changes again while still animating, snap to the current animation target and start a new animation to the new target. No stacking.

### B4. Quantity Selector Press Feel

**What:** Quick-set buttons [10] [50] [100] [MAX] and stepper buttons [-10] [-1] [+1] [+10] have a brief press animation.

**Implementation:**
- On `mousedown` / `touchstart`: `transform: scale(0.97)` with `transition: transform 50ms`
- On `mouseup` / `touchend`: `transform: scale(1.0)` with `transition: transform 50ms`
- Total press feel: 100ms round-trip
- Apply to all interactive buttons in the mint quantity selector

**CSS only — no JS state needed:**
```css
.qty-btn:active {
  transform: scale(0.97);
  transition: transform 50ms;
}
```

### B5. StatusBar Number Flash

**What:** When any number in the StatusBar updates (prize pool, batch info, minted count), the text briefly flashes white before returning to gold.

**Implementation:**
- When a StatusBar value changes, add CSS class `status-flash`
- Class applies: `color: #ffffff` immediately, then transitions back to gold over 0.3s
- Remove class after 0.5s (via setTimeout) so it can be re-triggered

```css
.status-flash {
  color: #ffffff !important;
  transition: color 0.3s ease-out;
}
```

**Frequency throttle:** Same as Animation 1 — if updates come faster than every 2s, batch them. One flash per batch.

---

## Build Order

Recommended implementation sequence:

```
PHASE 1 — Micro-interactions (low risk, touches existing files only)
  B4: Quantity selector press feel (CSS only, 2 minutes)
  B5: StatusBar number flash (CSS + tiny JS, 5 minutes)
  B3: Count number roll-up (JS utility, 15 minutes)
  B1: Tier card hover tilt (JS mouse handler, 15 minutes)
  B2: COMBINE button pop (JS + CSS keyframes, 15 minutes)

PHASE 2 — Ambient animation
  Animation 1: Prize Pool Rolling Digits (new component, 30 minutes)

PHASE 3 — Action animations
  Animation 2: Combine Collapse / Countdown Crunch (new component, 30 minutes)
  Animation 3: Forge Number Reveal (new component, 45 minutes)
  NOTE: Animation 3 chains from the EXISTING VRF Drum Roll (Animation 4).
        After the drum roll shatters, the Number Reveal takes over.
        Read the existing VRFDrumRoll component to understand the handoff.

PHASE 4 — Rare ceremony
  Animation 6: Collection Completion Cascade (new component, 60 minutes)
```

**Screenshot checkpoints:** After each phase, take screenshots and review before proceeding.

---

## Claude Code Master Prompt

```
Read this file:
/Users/bhuri/Desktop/block-hunt/frontend/ANIMATION_SPECS_REMAINING.md

Then read the existing codebase to understand what's already built:
- frontend/src/config/design-tokens.js (colours and tokens)
- frontend/src/components/VRFDrumRoll.jsx (already implemented — Animation 4)
- frontend/src/components/MintRevealCardFlip.jsx (already implemented — Animation 5)

DO NOT modify VRFDrumRoll.jsx or MintRevealCardFlip.jsx — they are done.

Implement all remaining animations and micro-interactions in the build order
specified in the spec. Follow every spec exactly. Screenshot after each phase 
for review.

Key rules:
- CSS-only animations (no canvas, no external libraries)
- Must work in Safari
- Import all colours from config/design-tokens.js
- Brand is "Blok-Hunt" everywhere
- New components go in frontend/src/components/
- Micro-interactions (B1-B5) modify existing components, no new files
- Wire animations into the correct event handlers:
  - Number Reveal → triggered on ForgeFulfilled event (enters after existing Drum Roll shatter)
  - Combine Collapse → triggered on combine transaction confirmation
  - Prize Pool Rolling Digits → triggered on prize pool value change
  - Collection Cascade → triggered when player holds all 6 tiers
- Test each animation by triggering the relevant game action on Base Sepolia

Project: /Users/bhuri/Desktop/block-hunt
Stack: React + Vite + wagmi v2 + viem
```

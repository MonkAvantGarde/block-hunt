# Animation 5: Mint Reveal — Card Flip
> **Status:** LOCKED — Ready for implementation
> **Trigger:** MintFulfilled event received (VRF callback delivers results)
> **Replaces:** Instant balance update after VRF delivery
> **Constraint:** CSS-only animations, no canvas, no external libraries, must work in Safari
> **Brand:** Always "Blok-Hunt" (not "Block Hunt")

---

## The Card Back

A single card element (160×220px) in the mint panel area. Face-down state:

- **Background:** Flat felt-green colour (from design-tokens.js, `FELT_MID`)
- **Border:** 3px solid, colour depends on best tier in results (see Pre-Signal below)
- **Center:** Blok-Hunt pixel block logo (~48×48px), same asset used on landing page
- **Corner decoration:** Small pixel dots or simple geometric border pattern — keep it clean, retro, card-back feel
- **Overall feel:** Like the back of a playing card in the Blok-Hunt universe

---

## The Three Acts

### Act 1 — The Pre-Signal (0.5s)

The card appears face-down in the center of the mint panel. Its **border colour** reveals the best tier pulled before any flip happens:

| Best Tier in Results | Border Colour | Border Effect |
|---------------------|---------------|---------------|
| T7 or T6 only | Grey (`#8a8a8a`) | Static |
| T5 | Blue (T5 accent from design-tokens) | Subtle pulse |
| T4 | Purple (T4 accent) | Steady glow |
| T3 | Orange (T3 accent) | Bright glow + slight vibrate |
| T2 | Red-orange (T2 accent) | Intense glow + stronger vibrate |

The player sees the border and has 0.5 seconds of anticipation before the first flip. This is the key psychological moment — they know *something* about what's coming but not the details.

### Act 2 — The Commons Batch (2.5s for commons-only mints)

The card flips to reveal commons. Each flip is a CSS `rotateY(180deg)` transition.

**T7 reveal (first flip, 0.3s flip speed):**
- Card flips to show: T7 card art (small, ~64×64px top area) + count in large VT323 text
- Format: `"87× THE INERT"` in grey/cream
- Brief hold (0.5s) then flip to next tier

**T6 reveal (second flip, 0.4s flip speed — slightly slower):**
- Card flips to show: T6 card art + count
- Format: `"10× THE RESTLESS"` in T6 red accent
- Brief hold (0.5s)

If this is a commons-only mint (no T5 or above), the sequence ends here. Card shrinks slightly and the summary line fades in below. **Total time: ~3 seconds.**

**Flip speed rule:** Each successive tier flips slightly slower than the last. T7 = 0.3s, T6 = 0.4s, T5 = 0.6s, T4 = 0.8s, T3 = 1.0s, T2 = 1.2s.

### Act 3 — The Rare Reveal (only if T5 or above was pulled)

When rare tiers are present, after the commons batch, the mood shifts:

1. **Screen dims** — a 40% dark overlay (`rgba(0,0,0,0.4)`) covers everything EXCEPT the card. Not a full-screen takeover, just a spotlight effect. The collection row and status bar are still visible but dimmed.

2. **Card hovers face-down again** — briefly returns to the card back, but now the border is glowing in the upcoming tier's accent colour. The card vibrates slightly (CSS `translateX` oscillating ±1px, 50ms interval).

3. **Slow flip** — the card rotates at the slower speed for that tier (see table above). As it passes the halfway point (edge-on), a brief flash of the tier accent colour.

4. **Reveal** — the card lands face-up showing the tier art at FULL card size (fills the 160×220px card area). Tier name in Press Start 2P font below the art. Count in VT323.
   - Format: `"2× THE REMEMBERED"` with T5 blue accent
   - The panel background flashes the tier accent colour for 0.2s on reveal (T4+ only)

5. **Hold** — the revealed rare card holds for 1 full second so the player can absorb it.

If multiple rare tiers were pulled, they reveal in sequence from most common to rarest (T5 → T4 → T3 → T2). Each rare gets its own dim → vibrate → slow flip → reveal → hold cycle. **The rarest tier is always last.**

### Summary Fade-In (after all flips complete)

The card shrinks to 80% size and the summary appears below it:

```
+87 Inert · +10 Restless · +2 Remembered
```

Each tier appears with a 0.2s stagger, in its accent colour. The numbers use the count roll-up animation (B3) if implemented, otherwise instant.

After 2 seconds (or on tap), the summary and card fade out and balances update in the collection row.

### RevealMoment Handoff

If T3 or above was pulled, after the card flip reveal completes, transition to the existing RevealMoment overlay component. The card flip handles the initial drama; RevealMoment handles the celebration/share moment.

---

## Edge Cases

**Single block mint (qty = 1):** Skip the batch phase. Single card flip directly to whatever tier was received. Still uses the pre-signal border colour. Total time: ~2s.

**All T7 mint (very common):** Pre-signal border is grey. Single flip to "X× THE INERT". Quick and clean — don't overdramatise a commons-only result. Total time: 3s.

**Huge mint (200-500 blocks):** Same animation length. The cascade approach would scale with quantity, but the card flip doesn't — the drama comes from tier rarity, not block count. A 500-block all-commons mint is still 3 seconds.

**Player taps during animation:** If the player taps/clicks anywhere on the card area, skip to the summary immediately. This is the "experienced player skip" — they've seen the animation, they just want results. First-time players won't know to tap.

---

## Technical Notes

**State machine:**
```
IDLE → PRE_SIGNAL → FLIP_COMMONS → FLIP_RARES → SUMMARY → IDLE
```

**CSS approach:**
- Card flip: `transform: rotateY(180deg)` with `transition-duration` varying per tier
- Card back/front: Two divs with `backface-visibility: hidden`, positioned absolutely within the card container
- Screen dim: Absolutely positioned div with `pointer-events: none` and fade-in transition
- Vibrate: `@keyframes vibrate { 0%,100% { transform: translateX(0) } 50% { transform: translateX(1px) } }` at 20ms interval
- Border glow: `box-shadow: 0 0 Xpx Ypx {tierColour}` with pulsing opacity

**Data flow:**
- VRF delivers `MintFulfilled` event with tier counts
- Parse results into: `{ t7: 87, t6: 10, t5: 2, t4: 0, t3: 0, t2: 0 }`
- Determine `bestTier` for pre-signal border
- Build flip sequence: commons first (descending from T7), then rares (ascending to best)
- After animation completes, update actual balance state

**New file:** `frontend/src/components/MintRevealCardFlip.jsx`
**Touches:** Wherever `MintFulfilled` is currently handled (likely in `VRFMintPanel` or `Game.jsx`) — replace instant balance update with animation trigger.

**No new dependencies.** Pure React + CSS.

---

## Claude Code Prompt

```
Read /Users/bhuri/Desktop/block-hunt/frontend/SECOND_ORDER_POLISH.md
Read /Users/bhuri/Desktop/block-hunt/frontend/ANIMATION_05_MINT_REVEAL.md

Implement the Mint Reveal Card Flip animation (Animation 5).

Key requirements:
- New file: frontend/src/components/MintRevealCardFlip.jsx
- CSS-only animations (no canvas, no external libraries)
- Must work in Safari
- Card flip uses rotateY(180deg) with backface-visibility
- Import colours from config/design-tokens.js
- Wire into the MintFulfilled event handler — replace instant balance update
- Tap anywhere on card to skip to summary
- Follow the spec exactly: pre-signal → commons batch → rare reveals → summary

Project: /Users/bhuri/Desktop/block-hunt
Stack: React + Vite + wagmi v2 + viem
```

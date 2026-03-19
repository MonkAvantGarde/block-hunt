# Animation 4: VRF Oracle Drum Roll — Energy Charge
> **Status:** LOCKED — Ready for implementation
> **Trigger:** VRF request sent (mint transaction confirmed OR forge transaction confirmed)
> **Ends:** When MintFulfilled / ForgeFulfilled event arrives, OR player cancels, OR timeout
> **Constraint:** CSS-only animations, no canvas, no external libraries, must work in Safari
> **Brand:** Always "Blok-Hunt"

---

## Overview

After the player sends a mint or forge transaction and VRF is requested, the panel transforms into a charging sequence. A pixel block sits center-panel while energy streams into it, building toward a crescendo. A progress ring creates the illusion of building toward a threshold. When VRF delivers, everything snaps to full charge, freezes, then the block shatters — handing off to the next animation (Card Flip for mints, Forge Roulette/result for forges).

If VRF takes longer than 20 seconds, the animation gracefully degrades with a helpful message about pending mints.

---

## The Pixel Block

The Blok-Hunt pixel block logo, same asset used on the landing page and card back. Displayed at 80×80px, centered in the mint/forge panel.

**Colour behaviour:**
- **Mint:** Block starts dark grey, charges toward gold/white glow (neutral — outcome is unknown)
- **Forge:** Block starts dark grey, charges toward the TARGET tier's accent colour (the player chose what they're forging toward)

---

## The Charge Sequence

### Phase 1 — Awakening (0–3s)

The block appears center-panel, dark and still. The panel background subtly darkens (15% overlay).

- **Progress ring:** A circular ring (radius ~60px) appears around the block. Thin (3px), starts at 0%. Fills clockwise using a smooth ease-out curve. Reaches ~30% by 3s.
- **Ring colour:** Faint grey at start, gradually shifting toward gold (mint) or tier accent (forge) as it fills.
- **Block:** Barely illuminated. A faint inner glow begins — like embers starting to catch.
- **Particles:** 4-6 small pixel squares (4×4px) drift slowly inward from the panel edges toward the block. Sparse. Slow. The energy is just starting to gather.
- **Text:** Below the block in VT323, 16px, cream at 0.6 opacity:
  - Mint: `"The oracle is listening..."`
  - Forge: `"Forging {N}× {sourceTierName} → {targetTierName}..."`

### Phase 2 — Building (3–8s)

The charge intensifies. This is where most VRF responses arrive on Base Sepolia.

- **Progress ring:** Fills from ~30% to ~70%. Speed is steady. Ring colour is now clearly gold/tier accent. Ring thickness increases subtly from 3px to 4px.
- **Block:** Noticeably brighter. The glow extends outward — a soft halo around the block (~8px blur radius). Block scales very slightly: `1.0 → 1.03`.
- **Particles:** 10-14 pixel squares now, moving faster. Their paths curve inward with slight gravity-well arcs (not straight lines). Some particles reach the block and disappear into it with a brief flash.
- **Background pulse:** The panel background begins a slow pulse — darkening and brightening on a 2s cycle. Like breathing.
- **Text update at 5s:**
  - Mint: `"The oracle is deciding..."`
  - Forge: `"The forge burns hotter..."`

### Phase 3 — Crescendo (8–15s)

Maximum visual intensity. The player should feel like something is about to happen.

- **Progress ring:** Fills from ~70% to ~90%. Ring is now 5px thick, bright, pulsing slightly (opacity 0.8 → 1.0 on a 0.5s cycle). 
- **Block:** Blazing. Glow radius extends to ~16px. Block scales to `1.05`. The block itself pulses in sync with the ring — breathing together.
- **Particles:** 18-22 pixel squares, fast, tight orbits. Dense cloud being pulled inward. Creates visual "noise" that reads as energy.
- **Background pulse:** Faster — 1s cycle now. The vignette at panel edges is darker.
- **Text update at 10s:**
  - Mint: `"The oracle speaks soon..."`
  - Forge: `"Almost there..."`

### Phase 4 — Stall (15–20s)

VRF is taking longer than typical. Visual language shifts from "building" to "holding."

- **Progress ring:** Stalls at ~95%. No longer advancing. Flickers occasionally — the ring stutters for a frame, like a signal struggling to connect.
- **Block:** Still bright but the glow flickers with the ring. Not dimming yet, but no longer building.
- **Particles:** Same density but their motion becomes slightly erratic — less smooth arcs, more jittery paths.
- **Text update at 15s:**
  - `"Still waiting for the oracle..."` (both mint and forge)

### Phase 5 — Timeout Degradation (20s+)

Something may be wrong. Gracefully degrade and inform the player.

- **Progress ring:** Slowly drains backward from ~95% toward ~60% over 10s. Ring colour desaturates — going from bright gold/accent back toward grey.
- **Block:** Dims. Glow radius shrinks back to ~4px. Scale eases back to `1.0`.
- **Particles:** Thin out to 4-6 again. Slow. Drifting rather than streaming.
- **Text (appears at 20s, persists):**
  - `"Taking longer than expected."`
  - Below, smaller (7px Press Start 2P, cream at 0.5): `"Pending mints can be viewed and cancelled in the right panel."`
- **The animation continues at this low-energy state indefinitely** until VRF delivers or the player navigates away. It doesn't stop — it just breathes quietly.

---

## The Release — VRF Delivers

When the MintFulfilled or ForgeFulfilled event is detected, regardless of which phase the animation is in:

### Snap to Full (0.2s)
- Progress ring instantly fills to 100%. Bright flash on the ring.
- Block blazes to maximum brightness (filter: brightness(2) for one frame).
- All particles snap inward to the block simultaneously.

### The Freeze (0.3s)
- Everything goes completely still. Ring at 100%, block blazing, no particles, no pulse.
- Panel background dims to 30% overlay.
- Total stillness. This is the held breath before the exhale.

### The Shatter (0.5s)
- The block breaks apart. 12-16 pixel fragments (8×8px each) fly outward from center in all directions.
- Fragments use the charge colour (gold for mint, tier accent for forge).
- Fragments fade out as they travel (opacity 1 → 0 over the 0.5s).
- The progress ring dissolves simultaneously (opacity fade out).
- Screen dim lightens slightly.

### Handoff (0.3s gap, then next animation)
- Brief empty moment — the block is gone, fragments have faded, the panel is clear.
- **For mints:** The Card Flip animation (Animation 5) begins. The face-down card fades in where the block was.
- **For forges:** The Forge Roulette animation (Animation 3, when built) begins. Until Animation 3 is built, transition directly to forge success/failure display.

---

## Edge Cases

**VRF responds in under 3s:** Still play the full snap → freeze → shatter sequence, but skip phases 2-5. The player sees: block appears (Phase 1, abbreviated to 1s) → ring fills rapidly → snap to 100% → freeze → shatter → handoff. Minimum animation time before handoff: ~2s. This ensures the anticipation beat always lands even on fast VRF responses.

**Player navigates away during charge:** Cancel the animation cleanly. If they return to the mint/forge panel and VRF hasn't delivered yet, restart the charge animation from the beginning (state is tracked, animation is visual-only).

**Multiple VRF requests:** Should not happen (UI prevents minting while a request is pending), but if it does, the animation only responds to the matching request ID.

**Forge-specific note:** For forges, after the shatter, the next animation in the chain is the Forge Roulette (Animation 3). The drum roll charges in the target tier's colour, shatters, then the roulette bar appears. This creates a two-part drama: charging = "will it work?", roulette = "DID it work?"

---

## Technical Notes

**State machine:**
```
IDLE → CHARGING → SNAP → FREEZE → SHATTER → HANDOFF → IDLE
         │
         └─ (if >20s) → DEGRADED (continues charging at low energy)
```

**Progress ring implementation:**
- SVG circle with `stroke-dasharray` and `stroke-dashoffset` for the fill animation
- Total circumference calculated, offset animated to reveal the ring progressively
- The "fake progress" curve: `progress = 1 - (1 / (1 + elapsed * 0.15))` — fast early, asymptotic toward 1.0, never quite reaches it naturally

**Particle system:**
- 22 max particle divs, absolutely positioned within the panel
- Each particle: 4×4px div with border-radius 0 (pixel squares), background colour matching charge colour
- Position animated with CSS transitions or keyframes
- "Gravity well" inward pull: particles start at random panel-edge positions, animate toward center using `cubic-bezier(0.4, 0, 0.2, 1)`
- On reaching center: scale to 0 + opacity to 0 (absorbed into block)
- Recycled: when a particle is absorbed, it respawns at a new edge position after a random delay (200-600ms)

**Block glow:**
- `box-shadow: 0 0 {radius}px {spread}px {colour}` with radius/spread interpolated based on charge phase
- Brightness: `filter: brightness({value})` interpolated from 0.6 (dark) to 1.5 (blazing)
- Scale: `transform: scale({value})` interpolated from 1.0 to 1.05

**Shatter fragments:**
- 12-16 divs (8×8px), initially hidden, positioned at center
- On shatter trigger: each gets a random direction vector (angle from center) and distance (80-160px)
- Animated with CSS transitions: `transform: translate(Xpx, Ypx)` + `opacity: 0` over 0.5s
- Each fragment has a slightly different delay (0-50ms stagger) for organic feel

**Elapsed timer:**
- Use `useRef` + `setInterval(1000)` for the phase tracking
- Particle count, ring progress, glow intensity all derived from elapsed time
- VRF event detection triggers phase transition regardless of elapsed time

**New file:** `frontend/src/components/VRFDrumRoll.jsx`
**Touches:** VRF state machine in `VRFMintPanel` (or equivalent) — when VRF state enters PENDING, mount VRFDrumRoll. When MintFulfilled/ForgeFulfilled fires, trigger the release sequence, then unmount and mount the next animation.

**No new dependencies.** Pure React + CSS + inline SVG for the ring.

---

## Claude Code Prompt

```
Read /Users/bhuri/Desktop/block-hunt/frontend/SECOND_ORDER_POLISH.md
Read /Users/bhuri/Desktop/block-hunt/frontend/ANIMATION_04_VRF_DRUM_ROLL.md

Implement the VRF Oracle Drum Roll animation (Animation 4).

Key requirements:
- New file: frontend/src/components/VRFDrumRoll.jsx
- CSS-only animations (no canvas, no external libraries)
- Must work in Safari
- Progress ring uses SVG circle with stroke-dashoffset
- Particle system: max 22 divs, 4×4px pixel squares, gravity-well paths
- Import colours from config/design-tokens.js
- Gold charge colour for mints, tier accent colour for forges
- 5-phase charge sequence: awakening → building → crescendo → stall → degraded
- At 20s+: ring drains, block dims, message about pending mints in right panel
- When VRF delivers: snap to 100% → 0.3s freeze → shatter → clear panel for next animation
- Minimum 2s animation even if VRF responds instantly
- Wire into VRF PENDING state — mount when VRF request sent, trigger release on fulfillment

Project: /Users/bhuri/Desktop/block-hunt
Stack: React + Vite + wagmi v2 + viem
```

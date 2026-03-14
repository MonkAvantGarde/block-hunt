# Block Hunt — Contract Changes Master Prompt (v2)
> **Date:** March 14, 2026
> **Updated:** Reflects Token redeployment (needed for challenge mechanic)
> **Work order:** SPEC 00 (done) → SPEC 01 → SPEC 02 v2

---

## What Changed From v1

SPEC 00 revealed that countdown state (countdownHolder, countdownStartTime, countdownActive) lives on BlockHuntToken, not on BlockHuntCountdown. For the challenge mechanic to work, Token needs one new function: `updateCountdownHolder(address)` callable only by the Countdown contract.

This means **Token is also being redeployed**. On testnet this just means minting fresh test blocks after deployment. On mainnet, all contracts are fresh anyway — this is the correct architecture from day one.

---

## How to Use This

Feed this file to Claude Code along with the SPEC files. Run them in order.

### Prompt for Claude Code:

```
Read these spec files in my project directory:
- CONTRACT_CHANGES_MASTER_v2.md
- SPEC_01_MINTWINDOW.md
- SPEC_02_COUNTDOWN_CHALLENGE_v2.md

SPEC 00 is already complete. Proceed with SPEC 01 (MintWindow changes).
After SPEC 01 is complete and tests pass, proceed to SPEC 02 v2 (Countdown 
challenge — includes Token modification).

Project path: /Users/bhuri/Desktop/block-hunt
Stack: Solidity, Foundry (forge test, forge build)
Test file: test/BlockHunt.t.sol

IMPORTANT RULES:
1. Read existing code thoroughly before making changes
2. Make incremental changes — don't rewrite entire files
3. Run `forge test` after each logical group of changes
4. If tests fail, fix them before moving on
5. Report what you changed after each step
```

---

## Summary of All Changes

### SPEC 01 — BlockHuntMintWindow.sol
| Change | From | To |
|--------|------|----|
| Window duration | 6 hours (21600s) | 3 hours (10800s) |
| Time guard | 12 hours (43200s) | 4 hours (14400s) |
| New function | — | `forceOpenWindow()` (owner-only, test-mode-only) |

### SPEC 02 v2 — BlockHuntCountdown.sol + BlockHuntToken.sol
| Contract | Change | Details |
|----------|--------|---------|
| Token | New function | `updateCountdownHolder(address)` — only callable by Countdown contract |
| Token | New event | `CountdownHolderUpdated(address, uint256)` |
| Countdown | New function | `calculateScore(address)` — weighted score from tier balances |
| Countdown | New function | `challengeCountdown()` — take over countdown with higher score |
| Countdown | Modified | `startCountdown()` — now records score and challenge time |
| Countdown | Modified | `syncReset()` — clears challenge state |
| Countdown | New state | `holderScore`, `lastChallengeTime`, scoring weight constants |
| Countdown | New events | `CountdownChallenged`, `CountdownShifted` |
| Countdown | Design | 24-hour safe period, full 7-day reset on successful challenge |

### Scoring Weights
```
T2 (Willful)    = 10,000 points per block
T3 (Chaotic)    = 2,000 points per block
T4 (Ordered)    = 500 points per block
T5 (Remembered) = 100 points per block
T6 (Restless)   = 20 points per block
T7 (Inert)      = 1 point per block
T1 (Origin)     = NOT scored (sacrifice-only tier)
```

---

## Post-Deployment Wiring (All Contracts)

Since Token is being redeployed, ALL wiring must be redone:

```
1. Deploy new BlockHuntToken
2. Deploy new BlockHuntMintWindow  
3. Deploy new BlockHuntCountdown
4. Keep existing: Treasury, Forge, Escrow, Migration, SeasonRegistry

Wire Token outbound:
5. token.setTreasuryContract(existingTreasury)
6. token.setMintWindowContract(newMintWindow)
7. token.setForgeContract(existingForge)
8. token.setCountdownContract(newCountdown)
9. token.setEscrowContract(existingEscrow)
10. token.setMigrationContract(existingMigration)

Wire other contracts to new Token:
11. treasury.setTokenContract(newToken)     — CHECK: is this a one-time setter? May need new Treasury too
12. mintWindow.setTokenContract(newToken)
13. forge.setTokenContract(newToken)        — CHECK: is this a one-time setter? May need new Forge too
14. countdown.setTokenContract(newToken)
15. escrow.setTokenContract(newToken)

VRF setup:
16. token.setVrfConfig(subId, keyHash, 2500000)
17. forge.setVrfConfig(subId, keyHash, callbackGasLimit)
18. Add new Token + (new Forge if redeployed) as VRF consumers on Chainlink subscription
19. Remove old Token + old Forge from VRF consumers

Other setup:
20. Register Season 1 on SeasonRegistry (if needed)
21. treasury.setEscrowContract(existingEscrow)  — if Treasury is redeployed
22. mintWindow.forceOpenWindow() to test

CRITICAL CHECK: Some setter functions on Treasury and Forge may be one-time-use 
(locked after first call). If so, those contracts MUST also be redeployed.
Claude Code should check for this pattern in the source code before deployment.
```

### Window Schedule (for Gelato keepers)
```
Window 1: 10:00 UTC — 13:00 UTC (Japan/Korea/Australia evening)
Window 2: 18:00 UTC — 21:00 UTC (Europe/UK evening)  
Window 3: 02:00 UTC — 05:00 UTC (US East/West evening)
```

---

## What Is NOT Changing (Architecture)
- BlockHuntTreasury.sol — fund flows unchanged (may need redeploy if setTokenContract is one-time)
- BlockHuntForge.sol — forge mechanics unchanged (may need redeploy if setTokenContract is one-time)
- BlockHuntEscrow.sol — unchanged
- BlockHuntMigration.sol — unchanged  
- BlockHuntSeasonRegistry.sol — unchanged
- Mint logic, combine logic, forge probability, VRF integration — all unchanged
- Pricing, batches, caps, rarity tables — all unchanged

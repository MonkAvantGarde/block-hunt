# Block Hunt — Contract Changes Master Prompt
> **Date:** March 14, 2026
> **What this is:** Instructions for Claude Code to implement contract changes
> **Work order:** SPEC 00 → SPEC 01 → SPEC 02

---

## How to Use This

Feed this file to Claude Code along with the three SPEC files. Run them in order.

### Prompt for Claude Code:

```
Read these spec files in my project directory:
- SPEC_00_VERIFICATION.md
- SPEC_01_MINTWINDOW.md
- SPEC_02_COUNTDOWN_CHALLENGE.md

Start with SPEC 00. Read all the source files listed and provide the 
verification summary. Do NOT make any changes yet — just report what exists.

After I confirm the summary, proceed to SPEC 01 (MintWindow changes).
After SPEC 01 is complete and tests pass, proceed to SPEC 02 (Countdown challenge).

Project path: /Users/bhuri/Desktop/block-hunt
Stack: Solidity, Foundry (forge test, forge build)
Test file: test/BlockHunt.t.sol

IMPORTANT RULES:
1. Read existing code thoroughly before making changes
2. Make incremental changes — don't rewrite entire files
3. Run `forge test` after each logical group of changes
4. If tests fail, fix them before moving on
5. Do NOT modify BlockHuntToken.sol — it is not being redeployed
6. Do NOT modify BlockHuntForge.sol — it is not being redeployed
7. Report what you changed after each step
```

---

## Summary of All Changes

### SPEC 01 — BlockHuntMintWindow.sol
| Change | From | To |
|--------|------|----|
| Window duration | 6 hours (21600s) | 3 hours (10800s) |
| Time guard | 12 hours (43200s) | 4 hours (14400s) |
| New function | — | `forceOpenWindow()` (owner-only, test-mode-only) |

### SPEC 02 — BlockHuntCountdown.sol
| Change | Details |
|--------|---------|
| New function | `calculateScore(address)` — weighted score from tier balances |
| New function | `challengeCountdown()` — take over countdown with higher score |
| Modified function | `claimHolderStatus()` — now records score and challenge time |
| New state | `holderScore`, `lastChallengeTime`, scoring weight constants |
| New events | `CountdownChallenged`, `CountdownShifted` |
| Design | 24-hour safe period, full 7-day reset on successful challenge |

### Scoring Weights (SPEC 02)
```
T2 (Willful)    = 10,000 points per block
T3 (Chaotic)    = 2,000 points per block
T4 (Ordered)    = 500 points per block
T5 (Remembered) = 100 points per block
T6 (Restless)   = 20 points per block
T7 (Inert)      = 1 point per block
T1 (Origin)     = NOT scored (sacrifice-only tier)
```

### Post-Deployment Wiring
After deploying new MintWindow and Countdown contracts:
1. On BlockHuntToken: call `setMintWindowContract(newMintWindowAddress)`
2. On BlockHuntToken: call `setCountdownContract(newCountdownAddress)`
3. On new Countdown: call whatever setup functions are needed (check Deploy.s.sol)
4. On new MintWindow: call whatever setup functions are needed (check Deploy.s.sol)

### Window Schedule (for Gelato keepers later)
```
Window 1: 10:00 UTC — 13:00 UTC (Japan/Korea/Australia evening)
Window 2: 18:00 UTC — 21:00 UTC (Europe/UK evening)
Window 3: 02:00 UTC — 05:00 UTC (US East/West evening)
```

---

## What Is NOT Changing
- BlockHuntToken.sol — all minted blocks preserved
- BlockHuntForge.sol — forge mechanics unchanged
- BlockHuntTreasury.sol — fund flows unchanged
- BlockHuntMigration.sol — migration unchanged
- BlockHuntSeasonRegistry.sol — unchanged
- BlockHuntEscrow.sol — verify if it already exists, don't recreate

# The Block Hunt — Smart Contract Architecture
## Technical Specification v0.1
### Target Chain: Base (EVM-compatible L2)

---

## Overview

The Block Hunt is implemented across four smart contracts. Each has a single responsibility. They communicate through defined interfaces rather than tight coupling, making each independently upgradeable and auditable.

	┌─────────────────────────────────────────────────────────┐
	│                   PLAYER / FRONTEND                      │
	└────────────┬────────────────────────┬───────────────────┘
	             │                        │
	             ▼                        ▼
	┌─────────────────────┐   ┌──────────────────────────────┐
	│  BlockHuntMintWindow│   │       BlockHuntForge          │
	│                     │   │                               │
	│  - Window open/close│   │  - forge(fromTier, burnCount) │
	│  - Daily cap mgmt   │   │  - Chainlink VRF (post-audit) │
	│  - Rollover supply  │   │  - Resolves to TokenContract  │
	│  - Batch tracking   │   │                               │
	└─────────┬───────────┘   └──────────────┬────────────────┘
	          │                              │
	          ▼                              ▼
	┌─────────────────────────────────────────────────────────┐
	│                  BlockHuntToken (ERC-1155)               │
	│                                                          │
	│  - mint()          - combine() / combineMany()          │
	│  - executeForge()  - claimTreasury() / sacrifice()      │
	│  - ERC-2981 royalties (OpenSea compatible)              │
	│  - _checkCountdownTrigger() → starts 7-day clock        │
	└──────────────────────┬──────────────────────────────────┘
	                       │
	          ┌────────────┴────────────┐
	          ▼                         ▼
	┌──────────────────┐    ┌──────────────────────────────┐
	│ BlockHuntTreasury│    │    BlockHuntCountdown          │
	│                  │    │                                │
	│ - receiveMint()  │    │  - startCountdown()            │
	│ - claimPayout()  │    │  - castVote() (social signal)  │
	│ - sacrificePayout│    │  - checkHolderStatus()         │
	│ - Creator fee 5% │    │  - timeRemaining()             │
	└──────────────────┘    └──────────────────────────────┘

---

## Contract 1: BlockHuntToken.sol

**Standard:** ERC-1155 + ERC-2981

**Token IDs:**

| ID  | Tier   | Name                            |
| --- | ------ | ------------------------------- |
| 1   | Origin | The Origin (only via Sacrifice) |
| 2   | 2      | The Willful                     |
| 3   | 3      | The Chaotic                     |
| 4   | 4      | The Ordered                     |
| 5   | 5      | The Remembered                  |
| 6   | 6      | The Restless                    |
| 7   | 7      | The Inert                       |

**Why ERC-1155 not ERC-721:**
Tiers 2–7 are fungible within their tier. A player's 50 Tier-7 blocks are interchangeable. ERC-1155 handles this natively and dramatically reduces gas costs for batch operations. VV's Infinity contracts used the same reasoning.

**Royalties (ERC-2981):**
- Default royalty: 5% to creator wallet
- Readable by OpenSea, Blur, and all ERC-2981-compliant marketplaces
- Soft enforcement — compliant marketplaces honour it, others may not
- Adjustable by owner (hard cap enforced in Treasury at 10%)

**Key functions:**
- `mint(quantity)` — mints during open window, randomly assigns tiers
- `combine(fromTier)` — deterministic: burn N → get 1 of tier N-1
- `combineMany(fromTiers[])` — batch combine, inspired by VV's xyzMany pattern
- `executeForge(player, fromTier, burnCount, success)` — called by ForgeContract only
- `claimTreasury()` — winner claims 100% of treasury
- `sacrifice()` — winner burns everything, gets The Origin title, seeds Season 2

---

## Contract 2: BlockHuntTreasury.sol

**Holds all mint revenue. Distributes on endgame.**

**Money flow:**
	Player pays MINT_PRICE per block
	         │
	         ▼
	receiveMintFunds()
	         │
	    ┌────┴────┐
	    ▼         ▼
	Creator     Treasury
	5% fee      95% held
	(immediate) (until endgame)

**Endgame flows:**
	CLAIM path:
	Treasury balance → 100% → Winner wallet
	
	SACRIFICE path:
	Treasury balance → 50% → Winner wallet
	                → 50% → Stays in contract as Season 2 seed

**Season reset:**
After sacrifice, `startNextSeason()` advances the season counter. The 50% seed becomes the starting treasury for Season 2, giving Season 2 players an immediate prize pool from day one.

**Emergency withdrawal:**
An owner-controlled emergency withdrawal exists as a safety valve. This will be replaced with a multisig (Gnosis Safe) before mainnet and noted in the audit scope.

---

## Contract 3: BlockHuntMintWindow.sol

**Manages the IPO-style daily mint windows.**

**Window lifecycle:**
	Owner (or Keeper) calls openWindow()
	         │
	         ▼
	Window open for 8 hours
	Players mint during this time
	         │
	         ▼
	Window closes (8h elapsed or owner calls closeWindow())
	Unused supply calculated → added to rolloverSupply
	         │
	         ▼
	16h cooldown
	         │
	         ▼
	Next window opens with BASE_CAP + rolloverSupply

**Rollover mechanic:**
If 30,000 of 50,000 daily slots are minted, 20,000 roll to the next window. This prevents artificial scarcity from missed windows and rewards consistent community participation.

**Batch progression:**
6 batches total, ~30 days each. Batch advancement is automatic based on day count. Batch number is a parameter passed to token metadata for visual differentiation.

**Automation note:**
In production, `openWindow()` and `closeWindow()` should be automated via a keeper service (Gelato Network or Chainlink Automation). This removes the need for manual owner calls and makes the schedule trustless.

---

## Contract 4: BlockHuntForge.sol

**Handles probabilistic tier upgrades.**

**Forge mechanics:**
- Player specifies fromTier (2–7) and burnCount (10–99)
- burnCount = success probability (10 burned = 10% chance, 99 burned = 99% chance)
- All burned blocks are destroyed regardless of outcome
- On success: one block of tier N-1 is minted

**Randomness roadmap:**
	Phase 1 (Testnet):   block.prevrandao — fast, cheap, insecure
	Phase 2 (Mainnet):   Chainlink VRF V2.5 — verifiable, trustless

Chainlink VRF uses a request/callback pattern:
1. Player calls `forge()` → emits ForgeRequested
2. VRF coordinator generates randomness off-chain
3. `fulfillRandomWords()` callback resolves the outcome
4. TokenContract.executeForge() called with result

The async nature means players wait ~1-2 blocks for forge resolution. The UI shows a "Forging..." pending state during this time.

**Forge fee:**
Currently 0. Can be set by owner to cover VRF LINK costs if needed.

---

## Contract 5: BlockHuntCountdown.sol

**Manages the 7-day endgame countdown.**

**Trigger condition:**
When a player holds ≥1 of each of Tiers 2–7 simultaneously, `_checkCountdownTrigger()` in the token contract fires and calls `startCountdown()` here.

**Holder protection:**
`checkHolderStatus()` can be called by anyone at any time. If the countdown holder has sold or transferred their blocks below the qualifying threshold, the countdown resets. This prevents griefing — a player can't trigger the countdown and then dump their blocks while locking everyone out.

**Community vote:**
The vote (Burn vs Claim) is a social signal only. It does not restrict the winner's choice. Any wallet can vote once per countdown. The outcome is displayed in the UI to create narrative tension and community participation.

---

## Security Considerations

**Before testnet:**
- Replace pseudo-random tier roll with a commit-reveal scheme or Chainlink VRF
- Add comprehensive unit tests (Foundry recommended)
- Fuzz test combine ratios and treasury math

**Before mainnet (audit scope):**
- Full Chainlink VRF integration in ForgeContract
- Replace emergency withdrawal with Gnosis Safe multisig
- Reentrancy analysis on all ETH-handling functions
- Integer overflow/underflow audit (Solidity 0.8.x has built-in checks but verify)
- Front-running analysis on forge (VRF resolves this)
- Review ERC-2981 integration with major marketplace contracts
- Gas optimisation pass

**Known limitations in v0.1:**
- `_rollTier()` uses block.prevrandao — manipulable by validators
- Emergency withdrawal is owner-only — should be multisig
- Window open/close is manual — should be keeper-automated
- No upgrade mechanism — contracts are immutable once deployed (intentional for trust, but limits bug fixes)

---

## Deployment Order

	1. Deploy BlockHuntTreasury(creatorWallet)
	2. Deploy BlockHuntMintWindow()
	3. Deploy BlockHuntCountdown()
	4. Deploy BlockHuntForge()
	5. Deploy BlockHuntToken(uri, royaltyReceiver, royaltyFee)
	
	6. Configure:
	   BlockHuntToken.setTreasuryContract(treasury.address)
	   BlockHuntToken.setMintWindowContract(mintWindow.address)
	   BlockHuntToken.setForgeContract(forge.address)
	   BlockHuntTreasury.setTokenContract(token.address)
	   BlockHuntMintWindow.setTokenContract(token.address)
	   BlockHuntForge.setTokenContract(token.address)
	   BlockHuntCountdown.setTokenContract(token.address)
	
	7. Verify all contracts on BaseScan
	8. Transfer ownership to Gnosis Safe multisig (pre-mainnet)

---

## Tech Stack

| Component         | Choice             | Reason                                      |
| ----------------- | ------------------ | ------------------------------------------- |
| Smart contracts   | Solidity 0.8.20    | Latest stable, built-in overflow protection |
| Base library      | OpenZeppelin 5.x   | Industry standard, audited                  |
| Randomness        | Chainlink VRF V2.5 | Verifiable, manipulation-resistant          |
| Testing           | Foundry            | Fast, fuzz testing built-in                 |
| Deployment        | Hardhat + viem     | Good Base/L2 tooling                        |
| Keeper automation | Gelato Network     | Reliable, Base-native support               |
| Chain             | Base mainnet       | Low fees, Coinbase audience, EVM-compatible |
| Royalties         | ERC-2981           | OpenSea/Blur compatible, widely honoured    |

---

## Files

- `BlockHuntToken.sol` — Core ERC-1155 token, game logic
- `BlockHuntTreasury.sol` — ETH custody, payout logic
- `BlockHuntMintWindow.sol` — Daily window, allocation, rollover
- `BlockHuntForge.sol` — Probabilistic upgrades, VRF integration
- `BlockHuntCountdown.sol` — Endgame timer, community vote

---

*Architecture v0.1 — Pre-audit. All contracts require security review before mainnet deployment.*

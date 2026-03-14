# The Block Hunt — Owner Rights & Limitations
> **Version:** 2.0 | **Published:** Pre-Launch | **Status:** Living document
> **Updated:** March 14, 2026 — Session 17

---

## Why This Document Exists

Trust is the foundation of any onchain game. Players are putting real money into a system controlled in part by a human owner. This document is completely transparent about what the owner can and cannot do — both by design and by code.

Published before launch so the community can make an informed decision about whether to participate. If you find something missing, tell us publicly.

---

## What the Owner CANNOT Do (blocked by contract code)

**Steal the treasury**
The treasury only pays out when a player calls `claimTreasury()` or `sacrifice()` after winning. No other function moves the balance to an external wallet. The owner cannot drain the treasury.

**Change where the season seed goes**
When a winner sacrifices, 10% is reserved as Season 2 seed. The SeasonRegistry contract locks in the Season 2 treasury address publicly before the season ends. The seed can only go to that registered address. The owner cannot redirect it.

**Change which token contract the treasury talks to**
`setTokenContract()` in the Treasury is locked to one-time use once test mode is disabled at mainnet launch. The owner cannot swap in a fake token contract after launch.

**Claim the treasury without winning**
`claimTreasury()` and `sacrifice()` verify the caller holds all 6 tiers simultaneously. The owner has no bypass — they must win like everyone else.

**Mint unlimited blocks for free (post-launch)**
`mintForTest()` exists for testing. Before mainnet, `disableTestMint()` will be called and verified on-chain. After that, no free minting is possible for anyone.

**Manipulate countdown challenges**
The `challengeCountdown()` function is open to any player holding all 6 tiers. The score calculation reads directly from on-chain balances — no admin input. The owner cannot prevent a valid challenge or alter scoring weights (they are constants in the contract).

**Manipulate tier randomness**
Tier assignment uses Chainlink VRF V2.5 — verifiable random numbers generated off-chain by Chainlink's decentralized oracle network. The owner cannot influence which tiers a player receives. Results are verifiable on-chain.

---

## What the Owner CAN Do (legitimate operational functions)

**Open and close daily mint windows**
The owner controls window timing. In production this will be automated via Gelato Network (keeper service) at 10:00, 18:00, and 02:00 UTC to make the schedule trustless. Until automation is live, the owner manages it manually.

**Force open a test window**
`forceOpenWindow()` bypasses the normal time guard between windows. This is gated behind `testModeEnabled` and will be permanently disabled before mainnet via `disableTestMode()`.

**Pause the contracts**
The owner can pause minting in an emergency (e.g. critical bug discovered). Pausing stops minting but does not move any funds.

**Set the creator fee**
Adjustable between 0% and 10% (hard cap enforced in contract). Currently set at 10%.

**Set the royalty rate**
Secondary market royalties (ERC-2981) adjustable by owner. Hard cap: 10%.

**Update the metadata URI**
The token metadata URI can be updated (e.g. for art reveals or IPFS migration).

**Emergency withdrawal**
An owner-controlled emergency withdrawal exists as a safety valve for catastrophic bugs. This will be **removed** after the security audit and replaced by Gnosis Safe multisig control. Any use before removal would be visible on-chain and constitute a betrayal of community trust.

**Transfer ownership to Gnosis Safe**
Before mainnet, all contract ownership will be transferred to a Gnosis Safe multisig requiring signatures from independent community members. The owner will hold ≤2 of 5 signing keys.

---

## The Countdown Challenge Mechanic

When a player collects all 6 tiers and triggers the 7-day countdown, they are not guaranteed to win. Any other player who also holds all 6 tiers AND has a higher weighted score can challenge and take over the countdown.

**How scoring works:**
Each tier contributes points based on its rarity: T2 (10,000 per block), T3 (2,000), T4 (500), T5 (100), T6 (20), T7 (1). T1 (The Origin) is not scored. A player's score is the sum of all their tier balances multiplied by these weights. Scores are calculated directly from on-chain balances at the moment of the challenge — no off-chain data, no admin input.

**How challenges work:**
- After a player triggers the countdown, there is a 24-hour safe period where no challenges can occur.
- After 24 hours, any player holding all 6 tiers can call `challengeCountdown()`. If their score is strictly higher than the current holder's score (recalculated live, not from storage), the countdown resets to a fresh 7 days under the new holder.
- The new holder gets their own 24-hour safe period before the next challenge can occur.
- If the holder survives all 7 days without being overtaken, they can claim or sacrifice.

**Why this exists:**
Without the challenge mechanic, the first player to assemble all 6 tiers effectively wins — the 7-day countdown becomes a formality. The challenge mechanic means the countdown is a live competition, not a waiting room. It rewards depth of collection, not just luck. It also enables organized groups (guilds, DAOs) to compete against solo players for the right to decide claim vs sacrifice.

**What the owner cannot do:** The scoring weights are constants in the contract. The challenge function is open to any player. The owner cannot block, alter, or manipulate challenges.

---

## What Could Still Go Wrong (honest risks)

**Owner delaying the migration window**
After Season 1 ends, the owner must call `openMigrationWindow()`. A delay would disadvantage players who want to migrate. We commit to opening the window within 7 days of Season 1 ending.

**SeasonRegistry not deployed before Season 1 endgame**
If the owner fails to deploy SeasonRegistry and register a Season 2 treasury address before a winner sacrifices, the sacrifice seed has no destination. We commit to deploying SeasonRegistry before mainnet and verifying it publicly.

**Upgrading contracts**
There is no upgrade mechanism by design. Contracts are immutable once deployed. If a critical bug is found post-launch, the only option is a new deployment and migration. This is a feature for trust, not a limitation.

**Controlling enough Gnosis Safe signers to act unilaterally**
The Gnosis Safe will require signatures from independent, publicly-known community members. We commit to never holding more than 2 of 5 signing keys.

**Keeper delay when a countdown holder loses their tiers**
If the countdown holder sells or transfers a required tier mid-countdown, the contracts do not self-reset. A keeper (Gelato) must call `checkHolderStatus()` to detect the change and reset both contracts. Until the keeper acts, the countdown appears active on-chain even though the holder no longer qualifies. We commit to configuring the keeper with a short polling interval before mainnet to ensure this is resolved quickly.

**VRF callback failure on large mints**
If a player mints a large quantity (e.g. 500 blocks), the Chainlink VRF callback requires sufficient gas to process all tier rolls. The callback gas limit is set to 2,500,000 to accommodate this. If a callback fails, the player can call `cancelMintRequest()` after 1 hour to reclaim their ETH. No funds are lost — the transaction is simply retried.

**Challenge mechanic edge cases**
A well-funded guild could theoretically pool resources to repeatedly challenge and overtake solo holders. This is intentional game design — the challenge mechanic is meant to create competitive tension between solo players and organized groups. The 24-hour safe period prevents constant ping-ponging.

---

## Pre-Mainnet Checklist (publicly verifiable on BaseScan)

- [ ] `disableTestMint()` called on Token contract
- [ ] `disableTestMode()` called on Treasury, Escrow, and MintWindow contracts
- [ ] `setTokenContract()` locked to one-time use on Treasury ✓ (locked after test mode disabled)
- [ ] `emergencyWithdraw()` removed from Treasury after audit
- [ ] Gnosis Safe multisig deployed with published signer list
- [ ] Ownership of all contracts transferred to Gnosis Safe
- [ ] SeasonRegistry deployed with Season 2 treasury address registered
- [ ] Independent security audit completed and report published
- [x] Chainlink VRF V2.5 integrated into BlockHuntForge.sol ✓
- [x] Chainlink VRF V2.5 integrated into BlockHuntToken.sol ✓
- [ ] VRF subscription funded for expected mainnet volume
- [ ] Both Token and Forge added as VRF consumers on mainnet subscription
- [ ] `setVrfConfig()` called on deployed Token and Forge with mainnet coordinator and key hash
- [ ] Callback gas limit set to 2,500,000 on Token (verified sufficient for 500-block mints)
- [ ] Keeper automation (Gelato) configured for: openWindow (3×/day), checkHolderStatus, executeDefaultOnExpiry, sweepUnclaimedRewards
- [ ] Keeper polling interval confirmed to prevent stuck countdowns
- [ ] All contract addresses verified and published on BaseScan
- [ ] Subgraph deployed to decentralised network with all events indexed

---

## Contract Addresses (to be filled at deployment)

| Contract | Address | BaseScan |
|----------|---------|---------|
| BlockHuntToken | TBD | TBD |
| BlockHuntTreasury | TBD | TBD |
| BlockHuntMintWindow | TBD | TBD |
| BlockHuntForge | (existing — re-wired) | TBD |
| BlockHuntCountdown | TBD | TBD |
| BlockHuntEscrow | TBD | TBD |
| BlockHuntMigration | (existing — re-wired) | TBD |
| BlockHuntSeasonRegistry | (existing) | TBD |
| Gnosis Safe (Multisig) | TBD | TBD |

---

## Security Audit

An independent audit will be conducted before mainnet. The full report will be published. The firm will be announced in advance so the community can verify independence.

**Audit scope:**
- All 8 smart contracts
- Treasury fund flow analysis
- Randomness manipulation resistance (Forge VRF + Mint VRF)
- Reentrancy and integer overflow checks
- Owner privilege analysis
- Countdown challenge mechanic security
- Score calculation correctness
- Cross-contract state synchronization (Token ↔ Countdown)
- Migration contract security

**Pre-audit:** A comprehensive automated audit (14 sections, 17 game invariants) has been conducted via Claude Code. The report is available in the repository as `AUDIT_REPORT.md`. This does not replace professional human review.

---

## Reporting Issues

If you find a vulnerability or something that contradicts this document, contact us before public disclosure. Responsible disclosure will be rewarded.

---

## Migration Window Commitment

We commit to giving the community a minimum of 2 weeks notice before opening the migration window, announced across all official channels.

---

## A Note from the Founder

Building in public means being honest about what you can and cannot do. This document is uncomfortable to write because it lists real ways I could theoretically act against the community's interest. But publishing it is the right thing to do.

The Block Hunt only works if players trust the system. That trust has to be earned through transparency, not assumed. If anything in this document concerns you, ask us about it publicly. We will answer.

The goal is a game where the rules are set by code, the prize is real, and nobody — including the people who built it — can cheat.

*This document will be updated as the contracts evolve. Version history tracked in the project repository.*

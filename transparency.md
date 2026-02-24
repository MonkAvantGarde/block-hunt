# The Block Hunt — Owner Rights & Limitations
## A Transparency Document for the Community
### Version 1.0 — Published Pre-Launch

---

## Why This Document Exists

Trust is the foundation of any onchain game. Players are putting real money into a system controlled in part by a human owner. This document exists to be completely transparent about what the owner can and cannot do — both by design and by code.

We are publishing this before launch so the community can make an informed decision about whether to participate. Nothing in here is hidden. If you find something we have missed, tell us.

---

## What the Owner CANNOT Do

These actions are **blocked by the smart contract code itself**. No matter what the owner wants, the contracts will reject these actions.

**Steal the treasury**
The treasury contract only pays out in two situations: a player calls `claimTreasury()` after winning the game, or a player calls `sacrifice()` after winning the game. No other function moves the treasury balance to an external wallet. The owner cannot call a function to drain the treasury to their personal wallet.

**Change where the season seed goes**
When a winner sacrifices, 50% of the treasury is reserved as a seed for the next season. The Season Registry contract locks in the next season's treasury address publicly before the season starts. The seed transfer can only go to that registered address. The owner cannot redirect it to a personal wallet.

**Change which token contract the treasury talks to**
The treasury only accepts funds from one token contract address. This address is set once at deployment and permanently locked. The owner cannot swap in a fake token contract to drain the treasury.

**Claim the treasury without winning**
The `claimTreasury()` and `sacrifice()` functions check that the caller holds all 6 tiers simultaneously. The owner has no special bypass. They must win the game like everyone else to claim.

**Mint unlimited blocks for free**
The `mintForTest` function exists in the current codebase for testing purposes. Before mainnet deployment, `disableTestMint()` will be called and verified on-chain. After that call, no free minting is possible by anyone including the owner.

---

## What the Owner CAN Do

These are legitimate operational functions the owner retains. We are listing them honestly.

**Open and close daily mint windows**
The owner controls when each daily window opens and closes. In production this will be automated via a keeper service (Gelato Network) to make the schedule trustless. Until then the owner manages it manually.

**Pause the contracts**
The owner can pause minting in an emergency — for example if a critical bug is discovered. This is a safety mechanism, not a way to steal funds. Pausing stops minting but does not move any funds.

**Set the creator fee**
The owner can adjust the creator fee between 0% and 10%. It is currently set at 5%. This affects how much of each mint goes to the creator wallet vs the treasury. The hard cap of 10% is enforced by the contract.

**Open the migration window**
The owner controls when the 30-day migration window opens after each season ends. The window duration is fixed at 30 days by the contract once opened.

**Update token metadata URI**
The owner can update the URI that points to token metadata (the images and attributes). This is necessary to update visuals between seasons. It does not affect token ownership or balances.

**Register next season addresses in the Season Registry**
The owner (via Gnosis Safe multisig) registers the next season's treasury address before each season ends. This registration is public and visible on-chain before the season concludes.

---

## What the Owner COULD Do That We Are Committed Not To

These are actions that are technically possible but that we are publicly committing not to take. The community should hold us accountable to these commitments.

**Never launching Season 2**
Nothing in the code forces us to deploy Season 2. We are committing to it but a smart contract cannot enforce this promise. Our commitment is public and our reputation is on the line.

**Opening the migration window at an unreasonable time**
We could technically open the migration window for only a short period or with minimal notice. We commit to giving the community a minimum of 2 weeks notice before opening the migration window, announced across all official channels.

**Controlling enough Gnosis Safe signers to act unilaterally**
The Gnosis Safe multisig will require signatures from independent community members who are publicly known. The signer list will be published before mainnet. We commit to never holding more than 2 of 5 signing keys ourselves.

---

## Pre-Mainnet Checklist

The following actions will be completed and verifiable on-chain before mainnet launch. The community can verify each one on BaseScan.

- [ ] `disableTestMint()` called on the token contract
- [ ] `setTokenContract()` locked to one-time use on treasury
- [ ] `emergencyWithdraw()` removed from treasury after audit
- [ ] Gnosis Safe multisig deployed with published signer list
- [ ] Ownership of all contracts transferred to Gnosis Safe
- [ ] Season Registry deployed with Season 2 treasury address registered
- [ ] Independent security audit completed and report published
- [ ] Chainlink VRF integrated for forge randomness
- [ ] Keeper automation configured for mint window scheduling

---

## Contract Addresses

To be filled in at mainnet deployment. All contracts will be verified on BaseScan so the community can read the source code directly.

| Contract                | Address | BaseScan |
| ----------------------- | ------- | -------- |
| BlockHuntToken          | TBD     | TBD      |
| BlockHuntTreasury       | TBD     | TBD      |
| BlockHuntMintWindow     | TBD     | TBD      |
| BlockHuntForge          | TBD     | TBD      |
| BlockHuntCountdown      | TBD     | TBD      |
| BlockHuntMigration      | TBD     | TBD      |
| BlockHuntSeasonRegistry | TBD     | TBD      |
| Gnosis Safe (Multisig)  | TBD     | TBD      |

---

## Security Audit

An independent security audit will be conducted before mainnet deployment. The full audit report will be published publicly. The auditing firm will be announced in advance so the community can verify their independence.

Audit scope will include:
- All smart contracts in this repository
- Treasury fund flow analysis
- Randomness manipulation resistance
- Reentrancy and integer overflow checks
- Owner privilege analysis
- Migration contract security

---

## Reporting Issues

If you find a vulnerability or something that contradicts this document, contact us at [to be added] before disclosing publicly. Responsible disclosure will be rewarded.

---

## A Note from the Founder

Building in public means being honest about what you can and cannot do. This document is uncomfortable to write because it lists real ways I could theoretically act against the community's interest. But publishing it is the right thing to do.

The Block Hunt only works if players trust the system. That trust has to be earned through transparency, not assumed. If anything in this document concerns you, ask us about it publicly. We will answer.

The goal is a game where the rules are set by code, the prize is real, and nobody — including the people who built it — can cheat.

---

*This document will be updated as the contracts evolve. Version history is tracked in the project repository.*

*Last updated: Pre-launch — Version 1.0*

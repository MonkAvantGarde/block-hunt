# Block Hunt — Contract Audit Report

## Date: 2026-03-14
## Auditor: Claude Opus 4.6 (automated)

## Contracts audited:
| Contract | Lines | Pragma | Dependencies |
|---|---|---|---|
| BlockHuntToken.sol | 765 | ^0.8.20 | OZ ERC1155, ERC2981, ReentrancyGuard, Pausable; Chainlink VRFConsumerBaseV2Plus |
| BlockHuntTreasury.sol | 130 | ^0.8.20 | OZ Ownable, ReentrancyGuard |
| BlockHuntMintWindow.sol | 251 | ^0.8.20 | OZ Ownable |
| BlockHuntForge.sol | 446 | ^0.8.20 | OZ ReentrancyGuard; Chainlink VRFConsumerBaseV2Plus |
| BlockHuntCountdown.sol | 246 | ^0.8.20 | OZ Ownable |
| BlockHuntEscrow.sol | 238 | ^0.8.20 | OZ Ownable, ReentrancyGuard |
| BlockHuntMigration.sol | 332 | ^0.8.20 | OZ Ownable, ReentrancyGuard |
| BlockHuntSeasonRegistry.sol | 153 | ^0.8.20 | OZ Ownable |
| **Total source** | **2,561** | | |
| test/BlockHunt.t.sol | 3,637 | | |
| script/Deploy.s.sol | 216 | | |

## Tests: 265 total across 2 test suites — ALL PASSING

---

### CRITICAL FINDINGS

_None._ No automatically exploitable bug that puts funds at immediate risk without owner collaboration.

---

### HIGH FINDINGS

#### H-1: Token admin setters have no one-time or test-mode guards — owner can redirect funds at any time

**Affected contract:** BlockHuntToken.sol
**Affected functions:** `setTreasuryContract`, `setMintWindowContract`, `setForgeContract`, `setCountdownContract`, `setEscrowContract` (lines 177-181)
**Description:** Unlike Treasury and Escrow (which use test-mode-gated one-time setters), the Token contract's five peripheral setters are bare `onlyOwner` with no guards. The owner can call `setTreasuryContract(maliciousAddress)` at any time — even on mainnet — to redirect all future mint ETH. Similarly, changing `escrowContract` would redirect sacrifice funds.
**Impact:** Owner can steal all mint revenue and sacrifice payouts by swapping contract addresses. Violates the transparency promise that the owner cannot redirect funds after deployment.
**Recommended fix:** Apply the same test-mode-gated one-time setter pattern used in Treasury/Escrow:
```solidity
function setTreasuryContract(address addr) external onlyOwner {
    require(treasuryContract == address(0) || testMintEnabled, "Already set");
    treasuryContract = addr;
}
```
Apply to all 5 setters. After `disableTestMint()`, they become permanently locked.

---

#### H-2: `emergencyWithdraw` on Treasury allows owner to drain all funds

**Affected contract:** BlockHuntTreasury.sol
**Affected function:** `emergencyWithdraw` (line 123)
**Description:** Owner can withdraw arbitrary amounts from Treasury at any time. Combined with `pause()` on Token, the owner can freeze minting and drain the prize pool. The code comment says "Remove this function after security audit before mainnet."
**Impact:** Complete fund drain by owner.
**Recommended fix:** Remove before mainnet deployment, or add a timelock + multisig requirement.

---

#### H-3: Voter list DoS in Countdown._resetCountdown

**Affected contract:** BlockHuntCountdown.sol
**Affected function:** `_resetCountdown` (lines 233-245)
**Description:** `_resetCountdown` iterates over `_voterList` to clear each voter's `hasVoted` mapping entry. The voter list grows unboundedly — anyone can vote (no token-holder requirement). An attacker can create thousands of wallets, each calling `castVote`, growing `_voterList` to a size where `_resetCountdown` exceeds the block gas limit.
**Impact:** If the voter list grows large enough, `syncReset()`, `checkHolderStatus()`, and any challenge that triggers `_resetCountdown` become uncallable. The countdown cannot be reset, and the game is stuck.
**Recommended fix:** Replace the voter-clearing loop with a `season`/`round` counter. Instead of clearing `hasVoted`, increment a `countdownRound` variable. Check `hasVoted[round][msg.sender]` instead. This makes reset O(1).

---

#### H-4: Royalty fee has no 10% hard cap

**Affected contract:** BlockHuntToken.sol
**Affected function:** `setRoyalty` (line 183)
**Description:** The spec states "Royalty never exceeds 10%." However, `setRoyalty` calls `_setDefaultRoyalty` with no cap check. OpenZeppelin's implementation only caps at 100% (10000 bps), not 10%.
**Impact:** Owner can set royalty to any value up to 100%, extracting excessive fees from secondary sales.
**Recommended fix:** Add a cap:
```solidity
function setRoyalty(address receiver, uint96 fee) external onlyOwner {
    require(fee <= 1000, "Exceeds 10% cap");
    _setDefaultRoyalty(receiver, fee);
}
```

---

### MEDIUM FINDINGS

#### M-1: Malicious contract as countdown holder can grief sacrifice

**Affected contracts:** BlockHuntEscrow.sol, BlockHuntToken.sol
**Affected function:** `initiateSacrifice` (Escrow line 114)
**Description:** `initiateSacrifice` sends 50% to the winner via `payable(winner).call{value: winnerShare}("")`. If the winner is a smart contract that reverts on ETH receipt, the entire sacrifice transaction fails. Since `executeDefaultOnExpiry` uses the same path, the game is permanently stuck — nobody can end it.
**Impact:** Game-breaking if a smart contract becomes the countdown holder. The `checkHolderStatus`/challenge mechanism mitigates this only if someone can outbid the malicious contract's score.
**Recommended fix:** Use a pull-payment pattern for the winner's 50%: store the amount and let the winner withdraw separately, rather than pushing ETH during sacrifice.

---

#### M-2: Escrow uses `address(this).balance` — vulnerable to balance inflation

**Affected contract:** BlockHuntEscrow.sol
**Affected function:** `initiateSacrifice` (line 101)
**Description:** `initiateSacrifice` calculates the 50/40/10 split based on `address(this).balance`. ETH can be force-sent to any contract via `selfdestruct` (or `SELFDESTRUCT` in Cancun+). If an attacker sends ETH to the Escrow before sacrifice, the split is calculated on an inflated balance. This doesn't steal funds but distorts the 50/40/10 percentages.
**Impact:** Low-to-medium. The attacker loses the ETH they sent, and the split amounts are larger than expected. Winner gets extra ETH, but no funds are stolen from players.
**Recommended fix:** Accept the total amount as a parameter from the Token contract and verify it matches what Treasury sent, rather than reading balance.

---

#### M-3: `challengeCountdown` callable from smart contracts — MEV/griefing risk

**Affected contract:** BlockHuntCountdown.sol
**Affected function:** `challengeCountdown` (line 121)
**Description:** No `tx.origin == msg.sender` check. A contract could atomically buy blocks on a marketplace, call `challengeCountdown` to displace the current holder, then sell/transfer blocks back. The new holder loses their position when `checkHolderStatus` detects missing tiers. Net effect: the previous holder's 7-day countdown is reset.
**Impact:** Griefing only — attacker cannot profit directly since they'd need to maintain holdings for 7 days. But they can repeatedly disrupt other players' countdowns.
**Recommended fix:** Consider adding `require(msg.sender == tx.origin, "No contracts")` if this is a concern. Note: this blocks legitimate smart wallet users (like Safe).

---

#### M-4: Countdown cooldown boundary is inclusive (`>=`)

**Affected contract:** BlockHuntCountdown.sol
**Affected function:** `challengeCountdown` (line 129)
**Description:** The cooldown check uses `>=`: `block.timestamp >= lastChallengeTime + CHALLENGE_COOLDOWN`. This means a challenge is possible at exactly `lastChallengeTime + 24 hours`, which is correct and expected. This is INFO-level — documented here for completeness.
**Impact:** None — `>=` is the correct boundary.

---

#### M-5: Owner can pause Token and change parameters mid-game

**Affected contract:** BlockHuntToken.sol
**Affected functions:** `pause()`, `unpause()`, `setVrfConfig()`, `setVrfEnabled()` (lines 184-199)
**Description:** The owner can pause the Token contract at any time, stopping all minting. While paused, the countdown timer continues running. Combined with the ability to change VRF config or toggle VRF on/off, the owner has significant power to manipulate game state.
**Impact:** Centralization risk. Owner can disrupt gameplay timing.
**Recommended fix:** Document clearly in TRANSPARENCY.md. Consider adding a timelock for pause operations, or allow endgame functions (`claimTreasury`, `sacrifice`, `executeDefaultOnExpiry`) to work while paused.

---

### LOW FINDINGS

#### L-1: `castVote` has no token-holder check

**Affected contract:** BlockHuntCountdown.sol
**Affected function:** `castVote` (line 186)
**Description:** Any address can vote, even without holding any Block Hunt tokens. The vote is documented as "social signal only" and doesn't affect game mechanics, but allows Sybil voting.
**Recommended fix:** Consider requiring `hasAllTiers(msg.sender)` or at minimum a non-zero balance of any tier.

---

#### L-2: Multiple pending VRF requests per player

**Affected contract:** BlockHuntToken.sol
**Affected function:** `mint` / `_mintVRF` (lines 206-265)
**Description:** A player can submit multiple mint transactions before VRF fulfills any. Each reserves cap space via `windowDayMinted`. This is by design and correctly handled (each request tracks its own `quantity` and `amountPaid`), but could lead to a player having many pending requests that fill the window cap.
**Impact:** Low — the per-user day cap (500) limits this naturally.

---

#### L-3: Forge `setTokenContract` has no guard

**Affected contract:** BlockHuntForge.sol
**Affected function:** `setTokenContract` (line 107)
**Description:** Unlike Treasury/Escrow, Forge's `setTokenContract` can be called repeatedly with no test-mode guard. Owner can point Forge at a different Token contract at any time.
**Impact:** Lower risk than Token setters (Forge doesn't hold ETH beyond fees), but still a centralization concern.
**Recommended fix:** Add test-mode-gated one-time setter pattern.

---

#### L-4: MintWindow `setTokenContract` has no guard

**Affected contract:** BlockHuntMintWindow.sol
**Affected function:** `setTokenContract` (line 75)
**Description:** Same issue as L-3 but for MintWindow. No one-time or test-mode protection.
**Recommended fix:** Add test-mode-gated one-time setter pattern.

---

#### L-5: Countdown `setTokenContract` has no guard

**Affected contract:** BlockHuntCountdown.sol
**Affected function:** `setTokenContract` (line 78)
**Description:** Same pattern — bare `onlyOwner` setter with no lock.
**Recommended fix:** Add test-mode-gated one-time setter pattern.

---

#### L-6: Deploy script comment references "6hr windows"

**Affected file:** Deploy.s.sol (line 109)
**Description:** Comment says "manages 6hr windows" but `WINDOW_DURATION` is now 3 hours.
**Recommended fix:** Update comment.

---

#### L-7: Migration uses pseudo-randomness for starter tier allocation

**Affected contract:** BlockHuntMigration.sol
**Affected function:** `_rollStarterTier` (line 231)
**Description:** Uses `block.prevrandao` and `block.timestamp` for randomness. Comment says "Replace with Chainlink VRF before mainnet." A miner/validator could influence outcomes.
**Impact:** Low — migration starters are T3-T7 (lower value). Mainnet deployment should use VRF.

---

#### L-8: Gas cost of `_resetCountdown` voter list clearing

**Affected contract:** BlockHuntCountdown.sol
**Description:** Covered under H-3. Even without malicious Sybil attack, organic voting over 7 days could accumulate hundreds of voters, increasing gas cost of every reset. At ~5,000 gas per voter clear, 1,000 voters = 5M gas — approaching block limit.

---

### INFO / OBSERVATIONS

#### I-1: Solidity 0.8.20 provides built-in overflow/underflow protection
No `unchecked` blocks in any contract. All arithmetic is checked.

#### I-2: `calculateScore` overflow analysis
Maximum possible score: if a player held `type(uint256).max` of every tier, multiplication would overflow. In practice, total token supply is bounded by window caps (~10M total across all batches). Max realistic score: 10M × 10,000 = 1e11, well within uint256.

#### I-3: VRF request confirmations = 3 on both Token and Forge
This is the standard minimum. Sufficient for Base L2 where block reorgs are extremely rare.

#### I-4: Checks-effects-interactions pattern followed consistently
All functions that send ETH (Treasury `claimPayout`, `sacrificePayout`, Escrow `initiateSacrifice`, `claimLeaderboardReward`, `releaseSeason2Seed`, `sweepUnclaimedRewards`) update state before external calls.

#### I-5: ReentrancyGuard used on all ETH-sending functions
Token, Treasury, Escrow, Forge, and Migration all use `nonReentrant` on functions with external calls.

#### I-6: VRF callback replay protection
Token: `fulfillRandomWords` deletes the request (`delete vrfMintRequests[requestId]`) and checks `req.player == address(0)` — replay returns silently.
Forge: Uses `resolved` flag — replay reverts with "Already resolved."

#### I-7: `cancelMintRequest` is player-only
Line 323: `require(req.player == msg.sender, "Not your request")`. Only the player who made the request can cancel it.

#### I-8: Forge burns blocks before VRF request
Both single and batch forge burn blocks in the same transaction as the VRF request (lines 146, 247). The callback cannot fail due to insufficient balance.

#### I-9: Events appropriately indexed
Key events use `indexed` on addresses and IDs for efficient subgraph indexing.

#### I-10: `executeDefaultOnExpiry` safely references `countdownHolder` and `countdownStartTime`
After a challenge, these values are updated on both Token (via `updateCountdownHolder`) and Countdown. The default sacrifice reads from Token state, which is always synced.

---

### INVARIANT CHECK RESULTS

| # | Invariant | Result | Notes |
|---|---|---|---|
| 1 | T1 is never mintable via VRF | **PASS** | `_tierFromRandom` returns 2-7 only |
| 2 | T1 is only obtainable via sacrifice | **PASS** | Only `sacrifice()` and `executeDefaultOnExpiry()` mint T1 |
| 3 | Player needs T2-T7 to trigger countdown (T1 not required) | **PASS** | `_checkCountdownTrigger` checks tiers 2-7 |
| 4 | Creator fee never exceeds 10% | **PASS** | `MAX_CREATOR_FEE = 1000`, enforced in `setCreatorFee` |
| 5 | Royalty never exceeds 10% | **FAIL** | No 10% cap in `setRoyalty`. See H-4 |
| 6 | Daily mint cap is enforced | **PASS** | `windowCapForBatch` + `windowDayMinted` tracking |
| 7 | Window duration is exactly 3 hours | **PASS** | `WINDOW_DURATION = 3 hours` |
| 8 | Countdown is exactly 7 days | **PASS** | `COUNTDOWN_DURATION = 7 days` in both Token and Countdown |
| 9 | Challenge cooldown is exactly 24 hours | **PASS** | `CHALLENGE_COOLDOWN = 24 hours` |
| 10 | Score excludes T1 | **PASS** | `calculateScore` uses bals[2]-bals[7] only |
| 11 | Challenger must have strictly higher score | **PASS** | `require(challengerScore > currentHolderScore)` |
| 12 | Only Countdown can call updateCountdownHolder | **PASS** | `onlyCountdown` modifier enforced |
| 13 | testMintEnabled/testModeEnabled can only be disabled, never re-enabled | **PASS** | Only `disable*` functions exist, no setter to re-enable |
| 14 | Combine ratios: 20:1 (T7→T6, T6→T5), 30:1 (T5→T4, T4→T3), 50:1 (T3→T2) | **PASS** | `combineRatio[7]=20, [6]=20, [5]=30, [4]=30, [3]=50` |
| 15 | T2→T1 combine disabled | **PASS** | `combine` requires `fromTier >= 3` |
| 16 | Forge cannot produce T1 | **PASS** | Forge requires `fromTier >= 3`, minimum output is T2 |
| 17 | Cap reservation at request time | **PASS** | `windowDayMinted += allocated` in `mint()` before VRF request |

**Result: 16 PASS, 1 FAIL (Invariant #5 — royalty cap)**

---

### FUND FLOW VERIFICATION

#### Inflow: Player calls `mint()`
1. Player sends ETH to Token
2. Token calculates `totalCost = mintPrice * allocated`, refunds excess
3. Token calls `treasury.receiveMintFunds{value: totalCost}()`
4. Treasury calculates `creatorFee = (msg.value * 1000) / 10000` = 10%
5. Treasury sends `creatorFee` to `creatorWallet`
6. Treasury retains `treasuryAmount = msg.value - creatorFee` = 90%

**Verified: 10% to creator, 90% to treasury. Math is correct.**

#### Outflow — Claim path
1. Winner calls `claimTreasury()`
2. Token burns winner's T2-T7 blocks
3. Token calls `treasury.claimPayout(winner)`
4. Treasury sends 100% of `address(this).balance` to winner

**Verified: No double-spend — `_finaliseEndgame()` sets `countdownActive = false`. No rounding errors.**

#### Outflow — Sacrifice path
1. Winner calls `sacrifice()` or `executeDefaultOnExpiry()` is called
2. Token burns winner's T2-T7 blocks, mints T1
3. Token calls `treasury.sacrificePayout(winner)` → Treasury sends 100% to Escrow
4. Token calls `escrow.initiateSacrifice(winner)` → Escrow reads `address(this).balance`
5. Split: `winnerShare = total / 2` (50%), `seedShare = total / 10` (10%), `community = total - winner - seed` (40%, handles rounding)
6. 50% sent immediately to winner
7. 40% stored as `communityPool`
8. 10% stored as `season2Seed`

**Verified: 50 + 40 + 10 = 100%. Rounding handled by `community = total - winner - seed`. Double-spend prevented by `sacrificeExecuted` flag.**

#### Outflow — Escrow
- `setLeaderboardEntitlements`: keeper-only, one-time (`entitlementsSet` flag), max 100 players, total cannot exceed `communityPool`
- `claimLeaderboardReward`: player claims their share, `hasClaimed` prevents double-claim, `communityPool` decremented
- `sweepUnclaimedRewards`: permissionless after 30 days, sends remaining pool to Season 2 treasury
- `releaseSeason2Seed`: permissionless, sends 10% to pre-set Season 2 address, `season2SeedReleased` flag prevents double-send

**Verified: No fund leaks. All outflows accounted for.**

#### ETH accounting
- Total inflow = all mint payments
- Total outflow = creator fee (10%) + winner payout (claim: 90%, sacrifice: 45%) + community pool (36%) + season 2 seed (9%)
- Sacrifice: 10% creator + 90% × (50% + 40% + 10%) = 10% + 90% = 100%. **Correct.**
- Claim: 10% creator + 90% winner = 100%. **Correct.**
- No ETH permanently stuck: Treasury has `emergencyWithdraw`. Escrow has `sweepUnclaimedRewards` and `releaseSeason2Seed`. Token's `receive()` accepts ETH for pending VRF requests, refunded via `cancelMintRequest`.

**Potential leak:** If the Forge contract accumulates forge fees, the `withdrawFees` function exists to extract them. No leak.

**Potential leak:** If `cancelMintRequest` refunds from Token's balance, and Token also receives ETH from other sources (direct sends), those extra funds become available for refunds. Low risk.

---

### GAS REPORT

| Function | Min Gas | Avg Gas | Max Gas | Notes |
|---|---|---|---|---|
| Token.mint (pseudo-random) | ~250k | ~330k | ~340k | 500 blocks |
| Token.combine | ~80k | ~80k | ~80k | Single combine |
| Token.claimTreasury | ~160k | ~160k | ~160k | Full endgame |
| Token.sacrifice | ~250k | ~250k | ~250k | Full endgame + escrow |
| Token.updateCountdownHolder | ~24k | ~30k | ~35k | Via countdown |
| Countdown.challengeCountdown | ~50k-80k (est.) | | | 2 balancesOf calls + state updates |
| Countdown._resetCountdown | O(n) | | | n = voter count. **DoS risk at scale** |
| Escrow.claimLeaderboardReward | ~40k | ~40k | ~40k | Single claim |
| Forge.forge (pseudo-random) | ~130k | ~130k | ~130k | Single attempt |
| Forge.forgeBatch (pseudo-random) | ~130k per attempt | | | Scales linearly |
| Treasury.receiveMintFunds | ~50k | ~50k | ~50k | With creator fee send |

**Key concern:** `_resetCountdown` gas scales linearly with voter count. At 1,000 voters, reset costs ~5M gas.

---

### TESTNET-TO-MAINNET CHECKLIST

| # | Action | Status | Notes |
|---|---|---|---|
| 1 | Call `disableTestMint()` on Token | Required | Disables `mintForTest` and locks `setMigrationContract` |
| 2 | Call `disableTestMode()` on MintWindow | Required | Disables `forceOpenWindow` |
| 3 | Call `disableTestMode()` on Treasury | Required | Locks `setTokenContract` |
| 4 | Call `disableTestMode()` on Escrow | Required | Locks `setTokenContract` |
| 5 | Remove `emergencyWithdraw` from Treasury | **CRITICAL** | Code comment says to remove after audit |
| 6 | Deploy Gnosis Safe multisig, transfer ownership of all 8 contracts | Required | |
| 7 | Update `creatorWallet` to cold wallet | Required | Currently set to deployer |
| 8 | Apply H-1 fix: guard Token setters | **CRITICAL** | Without this, owner can redirect funds |
| 9 | Apply H-4 fix: add 10% royalty cap | Required | |
| 10 | Fix H-3: replace voter list with round-based tracking | Required | DoS risk |
| 11 | Fund VRF subscription with sufficient LINK | Required | Both Token and Forge are consumers |
| 12 | Add Token and Forge as VRF consumers on Chainlink dashboard | Required | Not done in deploy script (manual step) |
| 13 | Configure and test Gelato keeper bots | Required | `openWindow`, `checkHolderStatus`, `executeDefaultOnExpiry` |
| 14 | Verify all 8 contracts on BaseScan | Required | |
| 15 | Deploy subgraph to decentralized network | Required | Currently Studio |
| 16 | Replace Migration pseudo-random with VRF | Recommended | Comment in code says to do this |
| 17 | Update Deploy.s.sol comment "6hr windows" → "3hr windows" | Minor | |
| 18 | Consider adding pull-payment for sacrifice winner (M-1) | Recommended | Prevents griefing by contract holders |
| 19 | Review and finalize TRANSPARENCY.md against actual owner powers | Required | |
| 20 | Set `forgeFee` to intended mainnet value | Required | Currently 0 |

---

### SUMMARY

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 4 |
| MEDIUM | 5 |
| LOW | 8 |
| INFO | 10 |
| Invariants | 16/17 PASS |

The contracts are well-structured with good separation of concerns. The primary risks are **centralization** (owner can redirect funds via Token setters, drain Treasury via emergencyWithdraw) and the **voter list DoS** in Countdown. These must be addressed before mainnet deployment. The fund flow math is correct, reentrancy protections are thorough, and the challenge mechanic is sound.

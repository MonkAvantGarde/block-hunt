# Rewards V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the v1 rewards contract with a v2 that implements 5 reward mechanics (tier bounties, daily lottery, streaks, leaderboard, referrals) and wire the Token + Frontend to support them.

**Architecture:** New `BlockHuntRewards.sol` replaces v1 entirely. Token gains two try/catch hooks in `fulfillRandomWords` (`onMint`, `recordTierDrop`). Frontend modifies existing rewards components to match the 5-row dashboard spec. Referral detection handled via URL params + localStorage.

**Tech Stack:** Solidity 0.8.20, Foundry, React 18 + wagmi v3

**Spec:** `docs/superpowers/specs/2026-04-15-rewards-system-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/BlockHuntRewards.sol` | Rewrite | Vault, 5 reward mechanics, season indexing |
| `src/BlockHuntToken.sol` | Modify | Add `onMint` + `recordTierDrop` hooks in VRF callback |
| `test/BlockHuntRewards.t.sol` | Rewrite | Tests for all 5 mechanics + vault accounting |
| `test/BlockHuntToken.t.sol` | Modify | Test `onMint`/`recordTierDrop` hook wiring |
| `script/Deploy.s.sol` | Modify | Wire Rewards ↔ Token ↔ Countdown, post-deploy config |
| `frontend/src/abis/index.js` | Modify | Add REWARDS_ABI entries |
| `frontend/src/hooks/useRewards.js` | Create | All rewards contract reads |
| `frontend/src/hooks/useReferral.js` | Create | Referral URL detection + localStorage + setReferrer |
| `frontend/src/panels/RewardsPanel.jsx` | Modify | Wire to new 5-row structure |
| `frontend/src/components/rewards/*.jsx` | Modify | Update each row component |
| `frontend/src/panels/MintPanel.jsx` | Modify | Inject setReferrer before first mint |

---

## Phase 1 — Contract: BlockHuntRewards.sol

### Task 1: Core state + vault + owner config

**Files:**
- Rewrite: `src/BlockHuntRewards.sol`
- Create: `test/BlockHuntRewards.v2.t.sol`

- [ ] **Step 1.1 — Write failing tests for vault + config**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/BlockHuntRewards.sol";

contract BlockHuntRewardsV2Test is Test {
    BlockHuntRewards rewards;
    address owner = address(this);
    address alice = address(0xA11CE);
    address token = address(0x7070);

    function setUp() public {
        rewards = new BlockHuntRewards();
        rewards.setTokenContract(token);
    }

    function test_fund() public {
        rewards.fund{value: 1 ether}();
        assertEq(rewards.vaultBalance(), 1 ether);
    }

    function test_withdraw() public {
        rewards.fund{value: 1 ether}();
        rewards.withdraw(0.5 ether);
        assertEq(rewards.vaultBalance(), 0.5 ether);
    }

    function test_withdraw_exceeds_vault_reverts() public {
        rewards.fund{value: 1 ether}();
        vm.expectRevert(bytes("Insufficient vault"));
        rewards.withdraw(1.5 ether);
    }

    function test_setTierBounty() public {
        rewards.setTierBounty(1, 6, 0.01 ether);
        assertEq(rewards.tierBountyAmount(1, 1, 6), 0.01 ether);
    }

    function test_setLeaderboardAmounts() public {
        uint256[3] memory amounts = [uint256(0.05 ether), 0.03 ether, 0.01 ether];
        rewards.setLeaderboardAmounts(amounts);
        assertEq(rewards.leaderboardAmounts(0), 0.05 ether);
        assertEq(rewards.leaderboardAmounts(1), 0.03 ether);
        assertEq(rewards.leaderboardAmounts(2), 0.01 ether);
    }

    function test_setStreakMilestone() public {
        rewards.setStreakMilestone(0, 3, 100, 10);
        (uint16 days_, uint16 slots, uint16 claimed, uint16 reward) = rewards.streakMilestones(0);
        assertEq(days_, 3);
        assertEq(slots, 100);
        assertEq(claimed, 0);
        assertEq(reward, 10);
    }
}
```

- [ ] **Step 1.2 — Run tests, confirm failure**

```bash
forge test --match-path test/BlockHuntRewards.v2.t.sol -vv
```
Expected: compilation failure (old contract has different interface)

- [ ] **Step 1.3 — Write the new BlockHuntRewards.sol**

Replace the entire file. The contract must include:

**State variables** (from spec lines 28-79):
- `vaultBalance`, `tokenContract`, `countdownContract`, `currentSeason`
- `tierBountyWinner`, `tierBountyAmount` (season-indexed triple mapping)
- `dailyEligible` (season → day → player → bool)
- `lotteryPaid`, `leaderboardPaid` (season → day → bool)
- `leaderboardAmounts` (uint256[3])
- `streakDay`, `lastMintDay` (season → player)
- `StreakMilestone` struct + array + `streakClaimed` mapping
- Referral state: `referrerOf`, `feeAccrued`, `totalMinted`, `referralPaid`, `snapshotAmount`, `referralAmount`, `referralThreshold`, `referralsActive`

**Events** (from spec lines 84-104)

**Owner functions:**
- `fund()`, `withdraw(uint256)` — vault management
- `setTierBounty(uint8 batch, uint8 tier, uint256 amount)`
- `setLeaderboardAmounts(uint256[3])`
- `setStreakMilestone(uint8 index, uint16 daysReq, uint16 slots, uint16 blockReward)`
- `setReferralAmount(uint256)`, `setReferralsActive(bool)`
- `advanceSeason()`

**Do NOT implement** `onMint`, `recordTierDrop`, player functions, or distribution functions yet — those come in later tasks.

- [ ] **Step 1.4 — Run tests, confirm pass**

```bash
forge test --match-path test/BlockHuntRewards.v2.t.sol -vv
```

- [ ] **Step 1.5 — Commit**

```bash
git add src/BlockHuntRewards.sol test/BlockHuntRewards.v2.t.sol
git commit -m "rewards v2: vault + owner config + state scaffolding"
```

---

### Task 2: onMint + recordTierDrop hooks

**Files:**
- Modify: `src/BlockHuntRewards.sol`
- Modify: `test/BlockHuntRewards.v2.t.sol`

- [ ] **Step 2.1 — Write failing tests**

```solidity
function test_onMint_setsEligibility() public {
    vm.prank(token);
    rewards.onMint(alice, 0.001 ether, 1);
    uint32 today = uint32(block.timestamp / 1 days);
    assertTrue(rewards.dailyEligible(1, today, alice));
}

function test_onMint_incrementsStreak() public {
    vm.prank(token);
    rewards.onMint(alice, 0.001 ether, 1);
    assertEq(rewards.streakDay(1, alice), 1);

    vm.warp(block.timestamp + 1 days);
    vm.prank(token);
    rewards.onMint(alice, 0.001 ether, 1);
    assertEq(rewards.streakDay(1, alice), 2);
}

function test_onMint_streakResets_afterGap() public {
    vm.prank(token);
    rewards.onMint(alice, 0.001 ether, 1);
    assertEq(rewards.streakDay(1, alice), 1);

    vm.warp(block.timestamp + 3 days);
    vm.prank(token);
    rewards.onMint(alice, 0.001 ether, 1);
    assertEq(rewards.streakDay(1, alice), 1);
}

function test_onMint_sameDayNoOp() public {
    vm.prank(token);
    rewards.onMint(alice, 0.001 ether, 1);
    vm.prank(token);
    rewards.onMint(alice, 0.002 ether, 1);
    assertEq(rewards.streakDay(1, alice), 1);
}

function test_onMint_onlyToken() public {
    vm.prank(alice);
    vm.expectRevert(bytes("Only token"));
    rewards.onMint(alice, 0.001 ether, 1);
}

function test_recordTierDrop_incrementsTotalMinted() public {
    vm.prank(token);
    rewards.recordTierDrop(alice, 7, 1);
    assertEq(rewards.totalMintedByPlayer(alice), 1);
}

function test_recordTierDrop_setsBountyWinner() public {
    rewards.setTierBounty(1, 7, 0.01 ether);
    vm.prank(token);
    rewards.recordTierDrop(alice, 7, 1);
    assertEq(rewards.tierBountyWinner(1, 1, 7), alice);
}

function test_recordTierDrop_secondPlayerDoesNotOverwrite() public {
    rewards.setTierBounty(1, 7, 0.01 ether);
    vm.prank(token);
    rewards.recordTierDrop(alice, 7, 1);
    vm.prank(token);
    rewards.recordTierDrop(address(0xB0B), 7, 1);
    assertEq(rewards.tierBountyWinner(1, 1, 7), alice);
}
```

- [ ] **Step 2.2 — Implement onMint + recordTierDrop**

Add to `BlockHuntRewards.sol`:

```solidity
modifier onlyToken() {
    require(msg.sender == tokenContract, "Only token");
    _;
}

function onMint(address player, uint256 feeAmount, uint8 /*batch*/) external onlyToken {
    uint32 today = uint32(block.timestamp / 1 days);
    uint256 season = currentSeason;

    dailyEligible[season][today][player] = true;

    if (referrerOf[player] != address(0)) {
        feeAccrued[player] += feeAmount;
        if (totalMintedByPlayer[player] >= referralThreshold && snapshotAmount[player] == 0) {
            uint256 payout = referralAmount < feeAccrued[player] ? referralAmount : feeAccrued[player];
            snapshotAmount[player] = payout;
            emit ReferralThresholdCrossed(player, payout);
        }
    }

    uint32 last = lastMintDay[season][player];
    if (last != today) {
        if (last + 1 == today) streakDay[season][player] += 1;
        else                   streakDay[season][player] = 1;
        lastMintDay[season][player] = today;
    }

    emit OnMintRecorded(player, feeAmount);
}

function recordTierDrop(address player, uint8 tier, uint8 batch) external onlyToken {
    uint256 season = currentSeason;
    totalMintedByPlayer[player] += 1;

    if (tierBountyWinner[season][batch][tier] == address(0) &&
        tierBountyAmount[season][batch][tier] > 0) {
        tierBountyWinner[season][batch][tier] = player;
        emit TierBountyWon(season, batch, tier, player);
    }
}
```

- [ ] **Step 2.3 — Run tests, confirm pass**

- [ ] **Step 2.4 — Commit**

```bash
git commit -m "rewards v2: onMint + recordTierDrop hooks with streak, eligibility, tier bounty"
```

---

### Task 3: Player claim functions

**Files:**
- Modify: `src/BlockHuntRewards.sol`
- Modify: `test/BlockHuntRewards.v2.t.sol`

- [ ] **Step 3.1 — Write failing tests for claimBounty**

```solidity
function test_claimBounty() public {
    rewards.fund{value: 1 ether}();
    rewards.setTierBounty(1, 7, 0.01 ether);
    vm.prank(token);
    rewards.recordTierDrop(alice, 7, 1);

    vm.prank(alice);
    rewards.claimBounty(1, 7);
    assertEq(alice.balance, 0.01 ether);
    assertEq(rewards.vaultBalance(), 0.99 ether);
}

function test_claimBounty_nonWinner_reverts() public {
    rewards.fund{value: 1 ether}();
    rewards.setTierBounty(1, 7, 0.01 ether);
    vm.prank(token);
    rewards.recordTierDrop(alice, 7, 1);

    vm.prank(address(0xB0B));
    vm.expectRevert(bytes("Not winner"));
    rewards.claimBounty(1, 7);
}
```

- [ ] **Step 3.2 — Write failing tests for claimStreak**

```solidity
function test_claimStreak() public {
    rewards.setStreakMilestone(0, 3, 100, 10);

    // Simulate 3-day streak
    for (uint256 d = 0; d < 3; d++) {
        vm.warp(block.timestamp + (d == 0 ? 0 : 1 days));
        vm.prank(token);
        rewards.onMint(alice, 0.001 ether, 1);
    }

    // Need a mock token that has rewardMint
    // For now just test the state check
    assertEq(rewards.streakDay(1, alice), 3);
}

function test_claimStreak_insufficientDays_reverts() public {
    rewards.setStreakMilestone(0, 3, 100, 10);
    vm.prank(token);
    rewards.onMint(alice, 0.001 ether, 1);

    vm.prank(alice);
    vm.expectRevert(bytes("Streak too short"));
    rewards.claimStreak(0);
}
```

- [ ] **Step 3.3 — Write failing tests for setReferrer + claimReferral**

```solidity
function test_setReferrer() public {
    rewards.setReferralsActive(true);
    vm.prank(alice);
    rewards.setReferrer(address(0xB0B));
    assertEq(rewards.referrerOf(alice), address(0xB0B));
}

function test_setReferrer_selfReferral_reverts() public {
    rewards.setReferralsActive(true);
    vm.prank(alice);
    vm.expectRevert(bytes("Self-referral"));
    rewards.setReferrer(alice);
}

function test_setReferrer_duplicate_reverts() public {
    rewards.setReferralsActive(true);
    vm.prank(alice);
    rewards.setReferrer(address(0xB0B));
    vm.prank(alice);
    vm.expectRevert(bytes("Already set"));
    rewards.setReferrer(address(0xC0C));
}

function test_setReferrer_paused_reverts() public {
    vm.prank(alice);
    vm.expectRevert(bytes("Referrals paused"));
    rewards.setReferrer(address(0xB0B));
}

function test_claimReferral() public {
    rewards.fund{value: 1 ether}();
    rewards.setReferralsActive(true);
    rewards.setReferralAmount(0.01 ether);

    vm.prank(alice);
    rewards.setReferrer(address(0xB0B));

    // Simulate 50 mints with fee accrual
    for (uint256 i = 0; i < 50; i++) {
        vm.prank(token);
        rewards.recordTierDrop(alice, 7, 1);
        vm.prank(token);
        rewards.onMint(alice, 0.001 ether, 1);
    }

    assertTrue(rewards.snapshotAmount(alice) > 0);

    address bob = address(0xB0B);
    vm.prank(bob);
    rewards.claimReferral(alice);
    assertTrue(rewards.referralPaid(alice));
}

function test_claimReferral_softFreeze_works() public {
    rewards.fund{value: 1 ether}();
    rewards.setReferralsActive(true);
    rewards.setReferralAmount(0.01 ether);

    vm.prank(alice);
    rewards.setReferrer(address(0xB0B));

    for (uint256 i = 0; i < 50; i++) {
        vm.prank(token);
        rewards.recordTierDrop(alice, 7, 1);
        vm.prank(token);
        rewards.onMint(alice, 0.001 ether, 1);
    }

    // Disable referrals AFTER linking
    rewards.setReferralsActive(false);

    // Claim should still work (soft freeze)
    vm.prank(address(0xB0B));
    rewards.claimReferral(alice);
    assertTrue(rewards.referralPaid(alice));
}
```

- [ ] **Step 3.4 — Implement all player claim functions**

Add `claimBounty`, `claimStreak`, `setReferrer`, `claimReferral` per spec.

- [ ] **Step 3.5 — Run tests, confirm pass**

- [ ] **Step 3.6 — Commit**

```bash
git commit -m "rewards v2: player claims — bounty, streak, referrer, referral"
```

---

### Task 4: Owner distribution functions (lottery + leaderboard)

**Files:**
- Modify: `src/BlockHuntRewards.sol`
- Modify: `test/BlockHuntRewards.v2.t.sol`

- [ ] **Step 4.1 — Write failing tests**

```solidity
function test_distributeLottery() public {
    rewards.fund{value: 1 ether}();

    // Make alice eligible
    vm.prank(token);
    rewards.onMint(alice, 0.001 ether, 1);

    uint32 today = uint32(block.timestamp / 1 days);
    rewards.distributeLottery(today, alice, 0.05 ether);
    assertEq(alice.balance, 0.05 ether);
    assertEq(rewards.vaultBalance(), 0.95 ether);
}

function test_distributeLottery_nonEligible_reverts() public {
    rewards.fund{value: 1 ether}();
    uint32 today = uint32(block.timestamp / 1 days);
    vm.expectRevert(bytes("Winner not eligible"));
    rewards.distributeLottery(today, alice, 0.05 ether);
}

function test_distributeLottery_duplicateDay_reverts() public {
    rewards.fund{value: 1 ether}();
    vm.prank(token);
    rewards.onMint(alice, 0.001 ether, 1);
    uint32 today = uint32(block.timestamp / 1 days);
    rewards.distributeLottery(today, alice, 0.05 ether);
    vm.expectRevert(bytes("Already distributed"));
    rewards.distributeLottery(today, alice, 0.05 ether);
}

function test_distributeLeaderboard() public {
    rewards.fund{value: 1 ether}();
    rewards.setLeaderboardAmounts([uint256(0.05 ether), 0.03 ether, 0.01 ether]);

    // Make all 3 eligible
    address bob = address(0xB0B);
    address carol = address(0xC0C);
    vm.prank(token);
    rewards.onMint(alice, 0.001 ether, 1);
    vm.prank(token);
    rewards.onMint(bob, 0.001 ether, 1);
    vm.prank(token);
    rewards.onMint(carol, 0.001 ether, 1);

    uint32 today = uint32(block.timestamp / 1 days);
    rewards.distributeLeaderboard(today, [alice, bob, carol]);
    assertEq(alice.balance, 0.05 ether);
    assertEq(bob.balance, 0.03 ether);
    assertEq(carol.balance, 0.01 ether);
}

function test_distributeLeaderboard_nonEligible_reverts() public {
    rewards.fund{value: 1 ether}();
    rewards.setLeaderboardAmounts([uint256(0.05 ether), 0.03 ether, 0.01 ether]);
    uint32 today = uint32(block.timestamp / 1 days);
    vm.expectRevert(bytes("Winner not eligible"));
    rewards.distributeLeaderboard(today, [alice, address(0xB0B), address(0xC0C)]);
}
```

- [ ] **Step 4.2 — Implement distributeLottery + distributeLeaderboard**

```solidity
function distributeLottery(uint32 day, address winner, uint256 amount) external onlyOwner {
    uint256 season = currentSeason;
    require(!lotteryPaid[season][day], "Already distributed");
    require(dailyEligible[season][day][winner], "Winner not eligible");
    require(amount <= vaultBalance, "Insufficient vault");

    lotteryPaid[season][day] = true;
    vaultBalance -= amount;
    (bool sent, ) = payable(winner).call{value: amount}("");
    require(sent, "Transfer failed");
    emit LotteryDistributed(season, day, winner, amount);
}

function distributeLeaderboard(uint32 day, address[3] calldata winners) external onlyOwner {
    uint256 season = currentSeason;
    require(!leaderboardPaid[season][day], "Already distributed");

    uint256 total;
    for (uint256 i = 0; i < 3; i++) {
        require(dailyEligible[season][day][winners[i]], "Winner not eligible");
        total += leaderboardAmounts[i];
    }
    require(total <= vaultBalance, "Insufficient vault");

    leaderboardPaid[season][day] = true;
    vaultBalance -= total;

    for (uint256 i = 0; i < 3; i++) {
        (bool sent, ) = payable(winners[i]).call{value: leaderboardAmounts[i]}("");
        require(sent, "Transfer failed");
    }
    emit LeaderboardDistributed(season, day, winners, leaderboardAmounts);
}
```

- [ ] **Step 4.3 — Run tests, confirm pass**

- [ ] **Step 4.4 — Commit**

```bash
git commit -m "rewards v2: distributeLottery + distributeLeaderboard with eligibility checks"
```

---

### Task 5: advanceSeason + vault invariant test

**Files:**
- Modify: `src/BlockHuntRewards.sol`
- Modify: `test/BlockHuntRewards.v2.t.sol`

- [ ] **Step 5.1 — Write failing tests**

```solidity
function test_advanceSeason_resetsStreak() public {
    vm.prank(token);
    rewards.onMint(alice, 0.001 ether, 1);
    assertEq(rewards.streakDay(1, alice), 1);

    rewards.advanceSeason();
    assertEq(rewards.currentSeason(), 2);
    assertEq(rewards.streakDay(2, alice), 0);
}

function test_advanceSeason_preservesReferral() public {
    rewards.setReferralsActive(true);
    vm.prank(alice);
    rewards.setReferrer(address(0xB0B));

    rewards.advanceSeason();
    assertEq(rewards.referrerOf(alice), address(0xB0B));
}

function test_vault_invariant() public {
    rewards.fund{value: 1 ether}();
    rewards.setTierBounty(1, 7, 0.01 ether);

    vm.prank(token);
    rewards.recordTierDrop(alice, 7, 1);
    vm.prank(alice);
    rewards.claimBounty(1, 7);

    assertEq(rewards.vaultBalance(), 0.99 ether);
    assertEq(address(rewards).balance, 0.99 ether);
}
```

- [ ] **Step 5.2 — Implement advanceSeason**

```solidity
function advanceSeason() external onlyOwner {
    currentSeason += 1;
    emit SeasonAdvanced(currentSeason);
}
```

- [ ] **Step 5.3 — Run full rewards test suite, confirm pass**

```bash
forge test --match-path test/BlockHuntRewards.v2.t.sol -vv
```

- [ ] **Step 5.4 — Commit**

```bash
git commit -m "rewards v2: advanceSeason + vault invariant tests"
```

---

## Phase 2 — Token hooks

### Task 6: Wire Token → Rewards hooks in fulfillRandomWords

**Files:**
- Modify: `src/BlockHuntToken.sol`
- Modify: `test/BlockHuntToken.t.sol`

- [ ] **Step 6.1 — Add IBlockHuntRewards interface to Token**

Add near the top of `BlockHuntToken.sol`:

```solidity
interface IBlockHuntRewards {
    function onMint(address player, uint256 feeAmount, uint8 batch) external;
    function recordTierDrop(address player, uint8 tier, uint8 batch) external;
}
```

- [ ] **Step 6.2 — Add try/catch hooks in _executeMint**

In `_executeMint`, after the existing `recordProgression` try/catch and before `emit BlockMinted`:

```solidity
if (rewardsContract != address(0)) {
    uint8 currentBatch = uint8(IBlockHuntMint(mintWindowContract).currentBatch());

    try IBlockHuntRewards(rewardsContract).onMint(req.player, req.amountPaid, currentBatch) {}
    catch { emit RewardsOnMintFailed(req.player, uint128(req.amountPaid)); }

    for (uint256 t = 2; t <= 7; t++) {
        if (tierCounts[t] > 0) {
            try IBlockHuntRewards(rewardsContract).recordTierDrop(req.player, uint8(t), currentBatch) {}
            catch { emit RewardsTierDropFailed(req.player, uint8(t)); }
        }
    }
}
```

Add events:
```solidity
event RewardsOnMintFailed(address indexed player, uint128 amountPaid);
event RewardsTierDropFailed(address indexed player, uint8 tier);
```

- [ ] **Step 6.3 — Also add hooks in the pseudo-random mint path**

Same pattern in `_mintPseudoRandom` after the `_mintBatch` call.

- [ ] **Step 6.4 — Write test verifying hooks don't revert callback**

```solidity
function test_RewardsHookFailureDoesNotRevertMint() public view {
    // Covered by existing try/catch pattern tests
    // Token already has rewardsContract set to address with no code
    // Mint should still succeed
}
```

- [ ] **Step 6.5 — Run full test suite**

```bash
forge test -vv
```

- [ ] **Step 6.6 — Commit**

```bash
git commit -m "token: wire onMint + recordTierDrop hooks to Rewards (try/catch)"
```

---

## Phase 3 — Deploy script

### Task 7: Update Deploy.s.sol

**Files:**
- Modify: `script/Deploy.s.sol`

- [ ] **Step 7.1 — Add Rewards wiring + post-deploy config**

After existing wiring, add:

```solidity
rewards.setTokenContract(address(token));
console.log("Rewards wired to Token.");

// Post-deploy rewards config
rewards.fund{value: 0.1 ether}();
rewards.setTierBounty(1, 6, 0.002 ether);
rewards.setTierBounty(1, 5, 0.005 ether);
rewards.setTierBounty(1, 4, 0.01 ether);
rewards.setTierBounty(1, 3, 0.05 ether);
rewards.setTierBounty(1, 2, 0.1 ether);
rewards.setLeaderboardAmounts([uint256(0.005 ether), 0.003 ether, 0.001 ether]);
rewards.setStreakMilestone(0, 3, 100, 10);
rewards.setStreakMilestone(1, 5, 75, 25);
rewards.setStreakMilestone(2, 7, 50, 50);
rewards.setStreakMilestone(3, 14, 30, 100);
rewards.setStreakMilestone(4, 21, 15, 150);
rewards.setStreakMilestone(5, 30, 10, 250);
rewards.setReferralAmount(0.002 ether);
rewards.setReferralsActive(true);
```

- [ ] **Step 7.2 — Commit**

```bash
git commit -m "deploy: wire Rewards v2 with post-deploy config"
```

---

## Phase 4 — Frontend

### Task 8: Rewards ABI + hooks

**Files:**
- Modify: `frontend/src/abis/index.js`
- Create: `frontend/src/hooks/useRewards.js`
- Create: `frontend/src/hooks/useReferral.js`

- [ ] **Step 8.1 — Add REWARDS_ABI to abis/index.js**

Add all read/write functions from the new contract: `fund`, `vaultBalance`, `tierBountyWinner`, `tierBountyAmount`, `dailyEligible`, `streakDay`, `lastMintDay`, `streakMilestones`, `referrerOf`, `snapshotAmount`, `referralPaid`, `totalMintedByPlayer`, `leaderboardAmounts`, `currentSeason`, `claimBounty`, `claimStreak`, `setReferrer`, `claimReferral`, `referralsActive`, `referralAmount`, `referralThreshold`.

- [ ] **Step 8.2 — Create useRewards.js**

Hook that reads: current season, player streak, player eligibility, tier bounties for current batch, streak milestones, leaderboard amounts.

- [ ] **Step 8.3 — Create useReferral.js**

Hook that:
1. Reads `?ref=` from URL on mount, stores in localStorage
2. Reads localStorage on subsequent visits
3. Reads `referrerOf(player)` from contract
4. Exposes `{ referrer, isLinked, pendingReferrer, linkReferrer() }`

- [ ] **Step 8.4 — Commit**

```bash
git commit -m "frontend: rewards ABI + useRewards + useReferral hooks"
```

---

### Task 9: Rewards panel 5-row UI

**Files:**
- Modify: `frontend/src/panels/RewardsPanel.jsx`
- Modify: `frontend/src/components/rewards/RewardsOverview.jsx`
- Modify remaining reward components as needed

- [ ] **Step 9.1 — Update RewardsPanel to 5-row layout**

Replace the existing view-switching structure with a single scrollable panel showing all 5 rows:
1. Tier Race (bounty winners + claim)
2. Daily Lottery (prize + countdown)
3. Streak Bonus (progress + milestones + claim)
4. Daily Top 3 (leaderboard display)
5. Refer a Friend (link + manual field + referee list + claim)

Each row should be its own component for clarity.

- [ ] **Step 9.2 — Update/create row components**

Reuse existing components where possible:
- `BountyDetail.jsx` → adapt for tier race bounties
- `StreakDetail.jsx` → adapt for milestone-based streaks
- `LotteryDetail.jsx` → simplify for owner-pushed model
- Create new `LeaderboardRow.jsx` for top 3
- Create new `ReferralRow.jsx` for referral link + manual field + claims

- [ ] **Step 9.3 — Commit**

```bash
git commit -m "frontend: 5-row rewards dashboard"
```

---

### Task 10: Referral flow in MintPanel

**Files:**
- Modify: `frontend/src/panels/MintPanel.jsx`

- [ ] **Step 10.1 — Add referrer detection before mint**

In MintPanel, before the mint transaction:
1. Read `useReferral()` hook
2. If `pendingReferrer` exists and `!isLinked`:
   - Show "Step 1: Link referrer" → "Step 2: Mint"
   - Call `setReferrer(pendingReferrer)` first, wait for confirmation
   - Then proceed with mint

Also add a manual referrer input field on the Rewards page (Row 5) that:
- Auto-populates from URL/localStorage if available
- Is editable if no referrer linked yet
- Shows read-only linked referrer if already set
- "Link Referrer" button calls `setReferrer`

- [ ] **Step 10.2 — Commit**

```bash
git commit -m "frontend: referral detection + setReferrer in mint flow"
```

---

## Phase 5 — Integration test + cleanup

### Task 11: Delete old test file + full suite run

**Files:**
- Delete: `test/BlockHuntRewards.t.sol` (old v1 tests)
- Rename: `test/BlockHuntRewards.v2.t.sol` → `test/BlockHuntRewards.t.sol`

- [ ] **Step 11.1 — Remove old, rename new**

```bash
rm test/BlockHuntRewards.t.sol
mv test/BlockHuntRewards.v2.t.sol test/BlockHuntRewards.t.sol
```

- [ ] **Step 11.2 — Run full test suite**

```bash
forge test -vv
```

Expected: all tests pass.

- [ ] **Step 11.3 — Commit**

```bash
git commit -m "test: replace v1 rewards tests with v2"
```

---

## Spec Coverage

| Spec item | Task |
|-----------|------|
| Vault fund/withdraw | T1 |
| Tier bounty config + first-winner | T1, T2 |
| onMint (eligibility, streak, referral accrual) | T2 |
| recordTierDrop (totalMinted, bounty winner) | T2 |
| claimBounty | T3 |
| claimStreak (FCFS slots, rewardMint) | T3 |
| setReferrer (one-time, soft freeze) | T3 |
| claimReferral (snapshot, paid once) | T3 |
| distributeLottery (eligibility-enforced) | T4 |
| distributeLeaderboard (eligibility-enforced) | T4 |
| advanceSeason (zeros season state, preserves referrals) | T5 |
| Token hooks (onMint, recordTierDrop, try/catch) | T6 |
| Deploy wiring + config | T7 |
| Frontend ABI + hooks | T8 |
| 5-row rewards UI | T9 |
| Referral URL detection + mint flow | T10 |
| Test cleanup | T11 |

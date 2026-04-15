# Rewards System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `BlockHuntRewards.sol` to match the 2026-04-15 rewards system design (owner-trusted distribution, 5 rewards: tier bounty, daily lottery, streak, top-3 leaderboard, referral), wire it into the redeploy Token contract from Plan 1, and add the rewards page to the frontend.

**Architecture:** Full rewrite of `BlockHuntRewards.sol` — the existing v1 (keeper-based, bps-of-batch-deposit, 3 reward types) is replaced. Token's `fulfillRandomWords` gains two new try/catch hooks (`onMint`, `recordTierDrop`) that feed rewards state. Token's `rewardMint` (Plan 1 Task D10) is now actually called by the Rewards contract's streak claim path. Daily lottery and leaderboard eligibility are enforced via on-chain `dailyEligible[season][day][player]` — owner picks winners off-chain but cannot fabricate addresses outside the minter set.

**Tech Stack:** Solidity 0.8.28, Foundry, OpenZeppelin Ownable/ReentrancyGuard/Pausable, Address library for sendValue.

**Depends on:** Plan 1 (`2026-04-15-redeploy-implementation.md`) must be implemented first. Specifically Task D10 (`rewardMint`) and Task D2 (try/catch wrapper) — the new rewards hooks plug into that wrapper.

**Source spec:** `docs/superpowers/specs/2026-04-15-rewards-system-design.md`

---

## File Map

| File | Responsibility in this plan |
|------|----------------------------|
| `src/BlockHuntRewards.sol` | Full rewrite: vault, 5 reward mechanics, owner-trusted distribution, season-indexed state, soft-freeze referrals |
| `src/BlockHuntToken.sol` | Add `onMint`/`recordTierDrop` try/catch calls into Rewards inside `fulfillRandomWords` |
| `src/interfaces/IBlockHuntRewards.sol` | New interface file (or in-file interface in Token) |
| `test/BlockHuntRewards.t.sol` | Full rewrite of the existing test file to match new surface |
| `test/BlockHuntRewardsIntegration.t.sol` | Token ↔ Rewards integration tests |
| `script/Deploy.s.sol` | Insert Rewards deployment between Countdown and Forge, add post-deploy config |
| `frontend/src/config/wagmi.js` | New Rewards address + ABI |
| `frontend/src/abis/index.js` | New Rewards ABI export |
| `frontend/src/hooks/useRewards.js` | New hook for rewards page reads |
| `frontend/src/hooks/useReferral.js` | New hook for referral linking flow |
| `frontend/src/screens/Rewards.jsx` | New page — 5 rows per spec §"Frontend — Rewards page" |
| `frontend/src/components/MintModal.jsx` | Modify to inject `setReferrer` tx when `?ref=` is present |

**Contract deployment order (this plan extends Plan 1's order):**
```
1. Treasury
2. MintWindow
3. Countdown
4. Rewards            ← NEW position
5. Forge
6. Token
7. Escrow, Migration, SeasonRegistry
```

---

## Phase G — Rewards Contract Rewrite

### Task G1: Delete existing rewards surface + create fresh test scaffold

**Files:**
- Modify: `src/BlockHuntRewards.sol` (full replace)
- Modify: `test/BlockHuntRewards.t.sol` (full replace)

- [ ] **Step G1.1 — Back up existing rewards contract for reference**

```bash
git mv src/BlockHuntRewards.sol src/BlockHuntRewards.v1.sol.bak
git mv test/BlockHuntRewards.t.sol test/BlockHuntRewards.v1.t.sol.bak
git commit -m "rewards: archive v1 before rewrite"
```

- [ ] **Step G1.2 — Create empty scaffold for the new contract**

```solidity
// src/BlockHuntRewards.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

interface IBlockHuntTokenRewards {
    function rewardMint(address to, uint32 quantity) external;
}

contract BlockHuntRewards is Ownable, ReentrancyGuard, Pausable {
    using Address for address payable;

    constructor() Ownable(msg.sender) {}
}
```

- [ ] **Step G1.3 — Create empty test scaffold**

```solidity
// test/BlockHuntRewards.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/BlockHuntRewards.sol";

contract BlockHuntRewardsTest is Test {
    BlockHuntRewards rewards;
    address owner = address(0xBEEF);
    address token = address(0x7070);
    address alice = address(0xA11CE);
    address bob   = address(0xB0B);

    function setUp() public {
        vm.prank(owner);
        rewards = new BlockHuntRewards();
        vm.prank(owner);
        rewards.setTokenContract(token);
    }
}
```

- [ ] **Step G1.4 — Compile baseline**

```bash
forge build
```
Expected: compiles cleanly (will grow tasks incrementally).

- [ ] **Step G1.5 — Commit**

```bash
git add src/BlockHuntRewards.sol test/BlockHuntRewards.t.sol
git commit -m "rewards: scaffold new contract per 2026-04-15 spec"
```

---

### Task G2: Vault — fund, withdraw, balance tracking

- [ ] **Step G2.1 — Failing tests**

Add to `test/BlockHuntRewards.t.sol`:

```solidity
function test_FundIncrementsVaultBalance() public {
    vm.deal(alice, 5 ether);
    vm.prank(alice);
    rewards.fund{value: 5 ether}();
    assertEq(rewards.vaultBalance(), 5 ether);
}

function test_WithdrawOnlyOwner() public {
    vm.deal(address(rewards), 1 ether);
    vm.prank(alice);
    vm.expectRevert();
    rewards.withdraw(0.5 ether);
}

function test_WithdrawReducesVaultBalance() public {
    vm.deal(alice, 2 ether);
    vm.prank(alice);
    rewards.fund{value: 2 ether}();

    vm.prank(owner);
    rewards.withdraw(1 ether);
    assertEq(rewards.vaultBalance(), 1 ether);
    assertEq(owner.balance, 1 ether);
}
```

- [ ] **Step G2.2 — Run, confirm failure**

- [ ] **Step G2.3 — Implement vault state + functions**

```solidity
// Wiring
address public tokenContract;
uint256 public currentSeason;

// Vault
uint256 public vaultBalance;

event VaultFunded(address indexed from, uint256 amount);
event VaultWithdrawn(address indexed to, uint256 amount);

modifier onlyToken() {
    require(msg.sender == tokenContract, "Only token");
    _;
}

function setTokenContract(address _token) external onlyOwner {
    tokenContract = _token;
}

function fund() external payable {
    require(msg.value > 0, "Zero value");
    vaultBalance += msg.value;
    emit VaultFunded(msg.sender, msg.value);
}

function withdraw(uint256 amount) external onlyOwner {
    require(amount <= vaultBalance, "Insufficient vault");
    vaultBalance -= amount;
    payable(owner()).sendValue(amount);
    emit VaultWithdrawn(owner(), amount);
}
```

- [ ] **Step G2.4 — Run, confirm pass**

- [ ] **Step G2.5 — Commit**

```bash
git add src/BlockHuntRewards.sol test/BlockHuntRewards.t.sol
git commit -m "rewards: vault fund + withdraw"
```

---

### Task G3: Tier Race Bounty — per (season, batch, tier)

- [ ] **Step G3.1 — Failing tests**

```solidity
function test_SetTierBountyOnlyOwner() public {
    vm.prank(alice);
    vm.expectRevert();
    rewards.setTierBounty(1, 5, 0.01 ether);
}

function test_RecordTierDropSetsWinnerOnce() public {
    vm.prank(owner);
    rewards.setTierBounty(1, 5, 0.01 ether);

    vm.prank(token);
    rewards.recordTierDrop(alice, 5, 1);
    assertEq(rewards.tierBountyWinner(0, 1, 5), alice);

    // Second call doesn't overwrite
    vm.prank(token);
    rewards.recordTierDrop(bob, 5, 1);
    assertEq(rewards.tierBountyWinner(0, 1, 5), alice);
}

function test_ClaimBountyPaysWinner() public {
    vm.deal(address(this), 1 ether);
    rewards.fund{value: 1 ether}();
    vm.prank(owner);
    rewards.setTierBounty(1, 5, 0.01 ether);

    vm.prank(token);
    rewards.recordTierDrop(alice, 5, 1);

    uint256 before = alice.balance;
    vm.prank(alice);
    rewards.claimBounty(1, 5);
    assertEq(alice.balance - before, 0.01 ether);
}

function test_ClaimBountyRejectsNonWinner() public {
    vm.prank(owner);
    rewards.setTierBounty(1, 5, 0.01 ether);
    vm.prank(token);
    rewards.recordTierDrop(alice, 5, 1);

    vm.prank(bob);
    vm.expectRevert(bytes("Not winner"));
    rewards.claimBounty(1, 5);
}

function test_ClaimBountyRejectsDoubleClaim() public {
    vm.deal(address(this), 1 ether);
    rewards.fund{value: 1 ether}();
    vm.prank(owner);
    rewards.setTierBounty(1, 5, 0.01 ether);
    vm.prank(token);
    rewards.recordTierDrop(alice, 5, 1);

    vm.prank(alice);
    rewards.claimBounty(1, 5);

    vm.prank(alice);
    vm.expectRevert(bytes("Already claimed"));
    rewards.claimBounty(1, 5);
}
```

- [ ] **Step G3.2 — Run, confirm failure**

- [ ] **Step G3.3 — Implement**

```solidity
mapping(uint256 => mapping(uint8 => mapping(uint8 => address))) public tierBountyWinner;
mapping(uint256 => mapping(uint8 => mapping(uint8 => uint256))) public tierBountyAmount;
mapping(uint256 => mapping(uint8 => mapping(uint8 => bool)))    public tierBountyClaimed;

event TierBountySet(uint256 season, uint8 batch, uint8 tier, uint256 amount);
event TierBountyWon(uint256 season, uint8 batch, uint8 tier, address indexed winner);
event TierBountyClaimed(uint256 season, uint8 batch, uint8 tier, address indexed winner, uint256 amount);

function setTierBounty(uint8 batch, uint8 tier, uint256 amount) external onlyOwner {
    require(tier >= 2 && tier <= 7, "Invalid tier");
    tierBountyAmount[currentSeason][batch][tier] = amount;
    emit TierBountySet(currentSeason, batch, tier, amount);
}

function recordTierDrop(address player, uint8 tier, uint8 batch) external onlyToken {
    uint256 s = currentSeason;
    if (tierBountyWinner[s][batch][tier] == address(0) &&
        tierBountyAmount[s][batch][tier] > 0) {
        tierBountyWinner[s][batch][tier] = player;
        emit TierBountyWon(s, batch, tier, player);
    }
}

function claimBounty(uint8 batch, uint8 tier) external nonReentrant {
    uint256 s = currentSeason;
    require(tierBountyWinner[s][batch][tier] == msg.sender, "Not winner");
    require(!tierBountyClaimed[s][batch][tier], "Already claimed");
    uint256 amount = tierBountyAmount[s][batch][tier];
    require(amount > 0, "Nothing to claim");
    require(amount <= vaultBalance, "Insufficient vault");

    tierBountyClaimed[s][batch][tier] = true;
    vaultBalance -= amount;
    payable(msg.sender).sendValue(amount);
    emit TierBountyClaimed(s, batch, tier, msg.sender, amount);
}
```

- [ ] **Step G3.4 — Run, confirm pass**

- [ ] **Step G3.5 — Commit**

```bash
git add src/BlockHuntRewards.sol test/BlockHuntRewards.t.sol
git commit -m "rewards: tier race bounty per (season, batch, tier)"
```

---

### Task G4: `onMint` hook — daily eligibility + streak counter

- [ ] **Step G4.1 — Failing tests**

```solidity
function test_OnMintRecordsDailyEligibility() public {
    uint32 day = uint32(block.timestamp / 1 days);
    vm.prank(token);
    rewards.onMint(alice, 0.001 ether, 1);
    assertTrue(rewards.dailyEligible(0, day, alice));
}

function test_OnMintStreakIncrementsOnConsecutiveDays() public {
    vm.prank(token);
    rewards.onMint(alice, 0.001 ether, 1);
    assertEq(rewards.streakDay(0, alice), 1);

    vm.warp(block.timestamp + 1 days);
    vm.prank(token);
    rewards.onMint(alice, 0.001 ether, 1);
    assertEq(rewards.streakDay(0, alice), 2);
}

function test_OnMintStreakResetsOnGap() public {
    vm.prank(token);
    rewards.onMint(alice, 0.001 ether, 1);

    vm.warp(block.timestamp + 3 days);
    vm.prank(token);
    rewards.onMint(alice, 0.001 ether, 1);
    assertEq(rewards.streakDay(0, alice), 1);
}

function test_OnMintSameDayNoDoubleCount() public {
    vm.prank(token);
    rewards.onMint(alice, 0.001 ether, 1);
    uint16 first = rewards.streakDay(0, alice);

    vm.prank(token);
    rewards.onMint(alice, 0.001 ether, 1);
    assertEq(rewards.streakDay(0, alice), first);
}
```

- [ ] **Step G4.2 — Run, confirm failure**

- [ ] **Step G4.3 — Implement**

```solidity
mapping(uint256 => mapping(uint32 => mapping(address => bool))) public dailyEligible;
mapping(uint256 => mapping(address => uint16)) public streakDay;
mapping(uint256 => mapping(address => uint32)) public lastMintDay;

event OnMintRecorded(address indexed player, uint256 feeAmount);

function onMint(address player, uint256 feeAmount, uint8 /*batch*/) external onlyToken {
    uint32 today  = uint32(block.timestamp / 1 days);
    uint256 s     = currentSeason;

    dailyEligible[s][today][player] = true;

    uint32 last = lastMintDay[s][player];
    if (last != today) {
        streakDay[s][player] = (last + 1 == today) ? streakDay[s][player] + 1 : 1;
        lastMintDay[s][player] = today;
    }

    // Referral accrual — filled in Task G7
    _maybeAccrueReferral(player, feeAmount);

    emit OnMintRecorded(player, feeAmount);
}

function _maybeAccrueReferral(address /*player*/, uint256 /*feeAmount*/) internal {
    // Placeholder — populated in G7
}
```

- [ ] **Step G4.4 — Run, confirm pass**

- [ ] **Step G4.5 — Commit**

```bash
git add src/BlockHuntRewards.sol test/BlockHuntRewards.t.sol
git commit -m "rewards: onMint hook — daily eligibility + streak counter"
```

---

### Task G5: Streak milestones — config + FCFS claim

- [ ] **Step G5.1 — Failing tests**

```solidity
function test_SetStreakMilestoneAppendsOrUpdates() public {
    vm.prank(owner);
    rewards.setStreakMilestone(0, 3, 100, 10);
    (uint16 days_, uint16 slots, uint16 claimed, uint16 reward) = rewards.getMilestone(0);
    assertEq(days_, 3);
    assertEq(slots, 100);
    assertEq(claimed, 0);
    assertEq(reward, 10);
}

function test_ClaimStreakMintsT6Blocks() public {
    vm.prank(owner);
    rewards.setStreakMilestone(0, 3, 100, 10);

    // Simulate alice has a 3-day streak
    for (uint256 i = 0; i < 3; i++) {
        vm.prank(token);
        rewards.onMint(alice, 0.001 ether, 1);
        vm.warp(block.timestamp + 1 days);
    }
    assertEq(rewards.streakDay(0, alice), 3);

    // rewardMint mock — expect the call
    vm.expectCall(
        token,
        abi.encodeWithSignature("rewardMint(address,uint32)", alice, uint32(10))
    );
    vm.mockCall(
        token,
        abi.encodeWithSignature("rewardMint(address,uint32)", alice, uint32(10)),
        abi.encode()
    );
    vm.prank(alice);
    rewards.claimStreak(0);

    (, , uint16 claimedSlots, ) = rewards.getMilestone(0);
    assertEq(claimedSlots, 1);
}

function test_ClaimStreakRejectsBelowMilestone() public {
    vm.prank(owner);
    rewards.setStreakMilestone(0, 7, 50, 50);
    vm.prank(token);
    rewards.onMint(alice, 0.001 ether, 1);
    vm.prank(alice);
    vm.expectRevert(bytes("Below milestone"));
    rewards.claimStreak(0);
}

function test_ClaimStreakRejectsWhenSlotsExhausted() public {
    vm.prank(owner);
    rewards.setStreakMilestone(0, 1, 1, 10);

    vm.prank(token);
    rewards.onMint(alice, 0.001 ether, 1);
    vm.mockCall(token, abi.encodeWithSignature("rewardMint(address,uint32)", alice, uint32(10)), abi.encode());
    vm.prank(alice);
    rewards.claimStreak(0);

    vm.prank(token);
    rewards.onMint(bob, 0.001 ether, 1);
    vm.prank(bob);
    vm.expectRevert(bytes("Slots exhausted"));
    rewards.claimStreak(0);
}
```

- [ ] **Step G5.2 — Run, confirm failure**

- [ ] **Step G5.3 — Implement**

```solidity
struct StreakMilestone {
    uint16 daysRequired;
    uint16 slotsTotal;
    uint16 slotsClaimed;
    uint16 blockReward;
}
StreakMilestone[] public streakMilestones;
mapping(uint256 => mapping(address => mapping(uint8 => bool))) public streakClaimed;

event StreakMilestoneSet(uint8 index, uint16 daysRequired, uint16 slotsTotal, uint16 blockReward);
event StreakClaimed(uint256 season, address indexed player, uint8 milestoneIndex, uint16 blocks);

function setStreakMilestone(uint8 index, uint16 daysReq, uint16 slots, uint16 blockReward) external onlyOwner {
    if (index >= streakMilestones.length) {
        require(index == streakMilestones.length, "Skipped index");
        streakMilestones.push(StreakMilestone(daysReq, slots, 0, blockReward));
    } else {
        streakMilestones[index].daysRequired = daysReq;
        streakMilestones[index].slotsTotal   = slots;
        streakMilestones[index].blockReward  = blockReward;
    }
    emit StreakMilestoneSet(index, daysReq, slots, blockReward);
}

function getMilestone(uint8 index) external view returns (uint16, uint16, uint16, uint16) {
    StreakMilestone memory m = streakMilestones[index];
    return (m.daysRequired, m.slotsTotal, m.slotsClaimed, m.blockReward);
}

function claimStreak(uint8 index) external nonReentrant {
    StreakMilestone storage m = streakMilestones[index];
    uint256 s = currentSeason;
    require(streakDay[s][msg.sender] >= m.daysRequired, "Below milestone");
    require(!streakClaimed[s][msg.sender][index], "Already claimed");
    require(m.slotsClaimed < m.slotsTotal, "Slots exhausted");

    streakClaimed[s][msg.sender][index] = true;
    m.slotsClaimed += 1;

    IBlockHuntTokenRewards(tokenContract).rewardMint(msg.sender, m.blockReward);
    emit StreakClaimed(s, msg.sender, index, m.blockReward);
}
```

- [ ] **Step G5.4 — Run, confirm pass**

- [ ] **Step G5.5 — Commit**

```bash
git add src/BlockHuntRewards.sol test/BlockHuntRewards.t.sol
git commit -m "rewards: streak milestones + FCFS claim via rewardMint"
```

---

### Task G6: Daily lottery + daily top 3 leaderboard distribution

- [ ] **Step G6.1 — Failing tests**

```solidity
function test_DistributeLotteryRejectsNonEligibleWinner() public {
    vm.deal(address(this), 1 ether);
    rewards.fund{value: 1 ether}();

    uint32 day = uint32(block.timestamp / 1 days);
    vm.prank(owner);
    vm.expectRevert(bytes("Winner not eligible"));
    rewards.distributeLottery(day, alice, 0.1 ether);
}

function test_DistributeLotteryPaysEligibleWinner() public {
    vm.deal(address(this), 1 ether);
    rewards.fund{value: 1 ether}();

    vm.prank(token);
    rewards.onMint(alice, 0.001 ether, 1);

    uint32 day = uint32(block.timestamp / 1 days);
    vm.prank(owner);
    rewards.distributeLottery(day, alice, 0.1 ether);
    assertEq(alice.balance, 0.1 ether);
}

function test_DistributeLotteryRejectsDuplicateDay() public {
    vm.deal(address(this), 1 ether);
    rewards.fund{value: 1 ether}();
    vm.prank(token);
    rewards.onMint(alice, 0.001 ether, 1);

    uint32 day = uint32(block.timestamp / 1 days);
    vm.prank(owner);
    rewards.distributeLottery(day, alice, 0.1 ether);

    vm.prank(owner);
    vm.expectRevert(bytes("Day already paid"));
    rewards.distributeLottery(day, alice, 0.1 ether);
}

function test_DistributeLeaderboardPays3Winners() public {
    vm.deal(address(this), 1 ether);
    rewards.fund{value: 1 ether}();

    vm.startPrank(token);
    rewards.onMint(alice, 0.001 ether, 1);
    rewards.onMint(bob, 0.001 ether, 1);
    rewards.onMint(address(0xCAFE), 0.001 ether, 1);
    vm.stopPrank();

    vm.prank(owner);
    rewards.setLeaderboardAmounts([uint256(0.06 ether), uint256(0.03 ether), uint256(0.01 ether)]);

    uint32 day = uint32(block.timestamp / 1 days);
    address[3] memory winners = [alice, bob, address(0xCAFE)];
    vm.prank(owner);
    rewards.distributeLeaderboard(day, winners);

    assertEq(alice.balance, 0.06 ether);
    assertEq(bob.balance, 0.03 ether);
    assertEq(address(0xCAFE).balance, 0.01 ether);
}
```

- [ ] **Step G6.2 — Run, confirm failure**

- [ ] **Step G6.3 — Implement**

```solidity
mapping(uint256 => mapping(uint32 => bool)) public lotteryPaid;
mapping(uint256 => mapping(uint32 => bool)) public leaderboardPaid;
uint256[3] public leaderboardAmounts;

event LotteryDistributed(uint256 season, uint32 day, address indexed winner, uint256 amount);
event LeaderboardDistributed(uint256 season, uint32 day, address[3] winners, uint256[3] amounts);
event LeaderboardAmountsSet(uint256[3] amounts);

function setLeaderboardAmounts(uint256[3] calldata amounts) external onlyOwner {
    leaderboardAmounts = amounts;
    emit LeaderboardAmountsSet(amounts);
}

function distributeLottery(uint32 day, address winner, uint256 amount) external onlyOwner nonReentrant {
    uint256 s = currentSeason;
    require(!lotteryPaid[s][day], "Day already paid");
    require(dailyEligible[s][day][winner], "Winner not eligible");
    require(amount <= vaultBalance, "Insufficient vault");

    lotteryPaid[s][day] = true;
    vaultBalance -= amount;
    payable(winner).sendValue(amount);
    emit LotteryDistributed(s, day, winner, amount);
}

function distributeLeaderboard(uint32 day, address[3] calldata winners) external onlyOwner nonReentrant {
    uint256 s = currentSeason;
    require(!leaderboardPaid[s][day], "Day already paid");
    uint256 total = leaderboardAmounts[0] + leaderboardAmounts[1] + leaderboardAmounts[2];
    require(total <= vaultBalance, "Insufficient vault");

    for (uint256 i = 0; i < 3; i++) {
        require(dailyEligible[s][day][winners[i]], "Winner not eligible");
    }

    leaderboardPaid[s][day] = true;
    vaultBalance -= total;

    uint256[3] memory amts = leaderboardAmounts;
    for (uint256 i = 0; i < 3; i++) {
        payable(winners[i]).sendValue(amts[i]);
    }
    emit LeaderboardDistributed(s, day, winners, amts);
}
```

- [ ] **Step G6.4 — Run, confirm pass**

- [ ] **Step G6.5 — Commit**

```bash
git add src/BlockHuntRewards.sol test/BlockHuntRewards.t.sol
git commit -m "rewards: daily lottery + top-3 leaderboard with eligibility enforcement"
```

---

### Task G7: Referrals — link, accrual, snapshot, claim, soft freeze

- [ ] **Step G7.1 — Failing tests**

```solidity
function test_SetReferrerRejectsZero() public {
    vm.prank(owner);
    rewards.setReferralsActive(true);
    vm.prank(alice);
    vm.expectRevert(bytes("Zero address"));
    rewards.setReferrer(address(0));
}

function test_SetReferrerRejectsSelf() public {
    vm.prank(owner);
    rewards.setReferralsActive(true);
    vm.prank(alice);
    vm.expectRevert(bytes("Self-referral"));
    rewards.setReferrer(alice);
}

function test_SetReferrerRejectsWhenPaused() public {
    vm.prank(alice);
    vm.expectRevert(bytes("Referrals paused"));
    rewards.setReferrer(bob);
}

function test_SetReferrerOneTime() public {
    vm.prank(owner);
    rewards.setReferralsActive(true);
    vm.prank(alice);
    rewards.setReferrer(bob);
    vm.prank(alice);
    vm.expectRevert(bytes("Already set"));
    rewards.setReferrer(address(0xCAFE));
}

function test_OnMintAccruesReferralFee() public {
    vm.prank(owner);
    rewards.setReferralsActive(true);
    vm.prank(alice);
    rewards.setReferrer(bob);

    vm.prank(token);
    rewards.onMint(alice, 0.001 ether, 1);
    assertEq(rewards.feeAccrued(alice), 0.001 ether);
}

function test_RecordTierDropIncrementsTotalMinted() public {
    vm.prank(owner);
    rewards.setTierBounty(1, 7, 0);  // no bounty, just counting
    vm.prank(token);
    rewards.recordTierDrop(alice, 7, 1);
    assertEq(rewards.totalMinted(alice), 1);
}

function test_ReferralThresholdSnapshotsAtExactly50() public {
    vm.prank(owner);
    rewards.setReferralsActive(true);
    vm.prank(owner);
    rewards.setReferralAmount(0.002 ether);
    vm.prank(alice);
    rewards.setReferrer(bob);

    // Simulate 50 blocks of minting — each with fee accrual
    for (uint256 i = 0; i < 50; i++) {
        vm.prank(token);
        rewards.recordTierDrop(alice, 7, 1);
        vm.prank(token);
        rewards.onMint(alice, 0.0002 ether, 1);  // 50 * 0.0002 = 0.01 ether total fee
    }
    // Snapshot should be min(0.002, 0.01) = 0.002
    assertEq(rewards.snapshotAmount(alice), 0.002 ether);
}

function test_ClaimReferralPaysSnapshottedAmount() public {
    vm.deal(address(this), 1 ether);
    rewards.fund{value: 1 ether}();
    vm.prank(owner);
    rewards.setReferralsActive(true);
    vm.prank(owner);
    rewards.setReferralAmount(0.002 ether);
    vm.prank(alice);
    rewards.setReferrer(bob);

    for (uint256 i = 0; i < 50; i++) {
        vm.prank(token);
        rewards.recordTierDrop(alice, 7, 1);
        vm.prank(token);
        rewards.onMint(alice, 0.0002 ether, 1);
    }

    uint256 before = bob.balance;
    vm.prank(bob);
    rewards.claimReferral(alice);
    assertEq(bob.balance - before, 0.002 ether);
    assertTrue(rewards.referralPaid(alice));
}

function test_SoftFreezePendingClaimsStillWork() public {
    vm.deal(address(this), 1 ether);
    rewards.fund{value: 1 ether}();
    vm.prank(owner);
    rewards.setReferralsActive(true);
    vm.prank(owner);
    rewards.setReferralAmount(0.002 ether);
    vm.prank(alice);
    rewards.setReferrer(bob);

    for (uint256 i = 0; i < 50; i++) {
        vm.prank(token);
        rewards.recordTierDrop(alice, 7, 1);
        vm.prank(token);
        rewards.onMint(alice, 0.0002 ether, 1);
    }

    // Pause
    vm.prank(owner);
    rewards.setReferralsActive(false);

    // Claim should still work
    vm.prank(bob);
    rewards.claimReferral(alice);
    assertTrue(rewards.referralPaid(alice));
}
```

- [ ] **Step G7.2 — Run, confirm failure**

- [ ] **Step G7.3 — Implement**

```solidity
mapping(address => address) public referrerOf;
mapping(address => uint256) public feeAccrued;
mapping(address => uint256) public totalMinted;
mapping(address => bool)    public referralPaid;
mapping(address => uint256) public snapshotAmount;

uint256 public referralAmount;
uint256 public referralThreshold = 50;
bool    public referralsActive;

event ReferrerLinked(address indexed referee, address indexed referrer);
event ReferralThresholdCrossed(address indexed referee, uint256 snapshotAmount);
event ReferralClaimed(address indexed referrer, address indexed referee, uint256 amount);
event ReferralsToggled(bool active);
event ReferralAmountSet(uint256 amount);

function setReferralAmount(uint256 amount) external onlyOwner {
    referralAmount = amount;
    emit ReferralAmountSet(amount);
}

function setReferralsActive(bool active) external onlyOwner {
    referralsActive = active;
    emit ReferralsToggled(active);
}

function setReferrer(address referrer) external {
    require(referralsActive, "Referrals paused");
    require(referrer != address(0), "Zero address");
    require(referrer != msg.sender, "Self-referral");
    require(referrerOf[msg.sender] == address(0), "Already set");
    referrerOf[msg.sender] = referrer;
    emit ReferrerLinked(msg.sender, referrer);
}

// Replace _maybeAccrueReferral placeholder from G4
function _maybeAccrueReferral(address player, uint256 feeAmount) internal {
    if (referrerOf[player] == address(0)) return;
    feeAccrued[player] += feeAmount;
    if (totalMinted[player] >= referralThreshold && snapshotAmount[player] == 0) {
        uint256 payout = referralAmount < feeAccrued[player] ? referralAmount : feeAccrued[player];
        snapshotAmount[player] = payout;
        emit ReferralThresholdCrossed(player, payout);
    }
}

function claimReferral(address referee) external nonReentrant {
    require(referrerOf[referee] == msg.sender, "Not referrer");
    require(snapshotAmount[referee] > 0, "Below threshold");
    require(!referralPaid[referee], "Already claimed");

    uint256 amount = snapshotAmount[referee];
    require(amount <= vaultBalance, "Insufficient vault");

    referralPaid[referee] = true;
    vaultBalance -= amount;
    payable(msg.sender).sendValue(amount);
    emit ReferralClaimed(msg.sender, referee, amount);
}
```

Also update `recordTierDrop` from G3 to increment `totalMinted`:
```solidity
function recordTierDrop(address player, uint8 tier, uint8 batch) external onlyToken {
    totalMinted[player] += 1;  // NEW
    uint256 s = currentSeason;
    if (tierBountyWinner[s][batch][tier] == address(0) &&
        tierBountyAmount[s][batch][tier] > 0) {
        tierBountyWinner[s][batch][tier] = player;
        emit TierBountyWon(s, batch, tier, player);
    }
}
```

- [ ] **Step G7.4 — Run, confirm pass**

- [ ] **Step G7.5 — Commit**

```bash
git add src/BlockHuntRewards.sol test/BlockHuntRewards.t.sol
git commit -m "rewards: referral system with snapshot cap + soft freeze"
```

---

### Task G8: advanceSeason

- [ ] **Step G8.1 — Failing test**

```solidity
function test_AdvanceSeasonResetsStreakButNotReferrals() public {
    vm.prank(owner);
    rewards.setReferralsActive(true);
    vm.prank(alice);
    rewards.setReferrer(bob);

    vm.prank(token);
    rewards.onMint(alice, 0.001 ether, 1);
    assertEq(rewards.streakDay(0, alice), 1);
    assertEq(rewards.referrerOf(alice), bob);

    vm.prank(owner);
    rewards.advanceSeason();

    assertEq(rewards.currentSeason(), 1);
    assertEq(rewards.streakDay(1, alice), 0);
    assertEq(rewards.referrerOf(alice), bob);   // lifetime
}
```

- [ ] **Step G8.2 — Implement**

```solidity
event SeasonAdvanced(uint256 newSeason);

function advanceSeason() external onlyOwner {
    currentSeason += 1;
    emit SeasonAdvanced(currentSeason);
}
```

- [ ] **Step G8.3 — Run, confirm pass**

- [ ] **Step G8.4 — Commit**

```bash
git add src/BlockHuntRewards.sol test/BlockHuntRewards.t.sol
git commit -m "rewards: advanceSeason resets season-scoped state"
```

---

## Phase H — Token ↔ Rewards Integration

### Task H1: Token — call rewards.onMint + recordTierDrop in fulfillRandomWords

**Files:**
- Modify: `src/BlockHuntToken.sol`
- Modify: `test/BlockHuntToken.t.sol`

- [ ] **Step H1.1 — Failing test**

```solidity
function test_TokenCallsRewardsOnMintAndRecordTierDrop() public {
    // Point token at a mock rewards contract
    // Fulfill a VRF mint request
    // Assert rewards mock saw onMint + recordTierDrop per block
}

function test_RewardsCallRevertDoesNotRevertFulfillRandomWords() public {
    // Point token at a reverting rewards mock
    // Fulfill a VRF request, expect it to complete successfully
    // Expect RewardsOnMintFailed event
}
```

- [ ] **Step H1.2 — Add rewards wiring to Token**

```solidity
address public rewardsContract;

function setRewardsContract(address _rewards) external onlyOwner {
    rewardsContract = _rewards;
}

event RewardsOnMintFailed(address indexed player, uint256 feeAmount);
event RewardsTierDropFailed(address indexed player, uint8 tier);
```

- [ ] **Step H1.3 — Extend `_executeMint` from Plan 1 D4.6**

Inside `_executeMint` after the `_mintBatch` call and after the existing try/catch blocks for recordMint/recordProgression:

```solidity
if (rewardsContract != address(0)) {
    try IBlockHuntRewards(rewardsContract).onMint(req.player, req.amountPaid, uint8(currentBatch)) {}
    catch { emit RewardsOnMintFailed(req.player, req.amountPaid); }

    for (uint256 i = 0; i < tiersAssigned.length; i++) {
        uint8 t = tiersAssigned[i];
        try IBlockHuntRewards(rewardsContract).recordTierDrop(req.player, t, uint8(currentBatch)) {}
        catch { emit RewardsTierDropFailed(req.player, t); }
    }
}
```

Add the interface declaration at file top:
```solidity
interface IBlockHuntRewards {
    function onMint(address player, uint256 feeAmount, uint8 batch) external;
    function recordTierDrop(address player, uint8 tier, uint8 batch) external;
}
```

- [ ] **Step H1.4 — Run, confirm pass**

- [ ] **Step H1.5 — Commit**

```bash
git add src/BlockHuntToken.sol test/BlockHuntToken.t.sol
git commit -m "token: wire rewards.onMint + recordTierDrop hooks (try/catch)"
```

---

### Task H2: Integration test — full mint-to-claim rewards flow

**Files:**
- Create: `test/BlockHuntRewardsIntegration.t.sol`

- [ ] **Step H2.1 — Write integration test**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/BlockHuntToken.sol";
import "../src/BlockHuntRewards.sol";
// + all wiring

contract BlockHuntRewardsIntegrationTest is Test {
    BlockHuntToken token;
    BlockHuntRewards rewards;
    address owner = address(0xBEEF);
    address alice = address(0xA11CE);
    address bob   = address(0xB0B);

    function setUp() public {
        // Deploy full stack: Treasury, MintWindow, Countdown, Rewards, Forge, Token, Escrow
        // Wire all cross-references
        // Fund Rewards vault
    }

    function test_TierBountyWonOnFirstT5Mint() public {
        vm.prank(owner);
        rewards.setTierBounty(1, 5, 0.01 ether);

        // Mint until alice hits a T5 via VRF mock
        // Assert tierBountyWinner[0][1][5] == alice
        // Assert alice can claim
    }

    function test_StreakBuildsOverTimeAndClaims() public {
        vm.prank(owner);
        rewards.setStreakMilestone(0, 3, 100, 10);

        for (uint256 i = 0; i < 3; i++) {
            _mintForPlayer(alice, 1);
            vm.warp(block.timestamp + 1 days);
        }
        assertEq(rewards.streakDay(0, alice), 3);

        uint256 balBefore = token.balanceOf(alice, 6);
        vm.prank(alice);
        rewards.claimStreak(0);
        assertEq(token.balanceOf(alice, 6) - balBefore, 10);
    }

    function test_ReferralEndToEnd() public {
        vm.prank(owner);
        rewards.setReferralsActive(true);
        vm.prank(owner);
        rewards.setReferralAmount(0.002 ether);

        vm.prank(alice);
        rewards.setReferrer(bob);

        // 50 mints from alice
        _mintForPlayer(alice, 50);

        vm.prank(bob);
        rewards.claimReferral(alice);
        assertTrue(rewards.referralPaid(alice));
    }

    function _mintForPlayer(address player, uint256 quantity) internal {
        // Use existing VRF mock helpers from integration test pattern
    }
}
```

- [ ] **Step H2.2 — Run, confirm pass**

```bash
forge test --match-path test/BlockHuntRewardsIntegration.t.sol -vv
```

- [ ] **Step H2.3 — Commit**

```bash
git add test/BlockHuntRewardsIntegration.t.sol
git commit -m "test: rewards integration — bounty, streak, referral end-to-end"
```

---

## Phase I — Deploy Script

### Task I1: Update `script/Deploy.s.sol` for Rewards

- [ ] **Step I1.1 — Insert Rewards deployment between Countdown and Forge**

```solidity
// Existing: Treasury, MintWindow, Countdown
BlockHuntRewards rewards = new BlockHuntRewards();
// Existing: Forge, Token, Escrow, Migration, SeasonRegistry
```

- [ ] **Step I1.2 — Wire cross-references**

```solidity
token.setRewardsContract(address(rewards));
rewards.setTokenContract(address(token));
```

- [ ] **Step I1.3 — Post-deploy config**

```solidity
// Fund the vault (amount configurable via env)
rewards.fund{value: INITIAL_VAULT_AMOUNT}();

// Tier bounties per (batch, tier)
rewards.setTierBounty(1, 6, 0.001 ether);
rewards.setTierBounty(1, 5, 0.004 ether);
rewards.setTierBounty(1, 4, 0.01 ether);
rewards.setTierBounty(1, 3, 0.03 ether);
rewards.setTierBounty(1, 2, 0.2 ether);

// Leaderboard amounts [1st, 2nd, 3rd]
uint256[3] memory lbAmounts = [uint256(0.0045 ether), uint256(0.0019 ether), uint256(0.0011 ether)];
rewards.setLeaderboardAmounts(lbAmounts);

// Streak milestones
rewards.setStreakMilestone(0, 3, 100, 10);
rewards.setStreakMilestone(1, 5, 75, 25);
rewards.setStreakMilestone(2, 7, 50, 50);
rewards.setStreakMilestone(3, 14, 30, 100);
rewards.setStreakMilestone(4, 21, 15, 150);
rewards.setStreakMilestone(5, 30, 10, 250);

// Referrals
rewards.setReferralAmount(0.002 ether);
rewards.setReferralsActive(true);
```

- [ ] **Step I1.4 — Dry run**

```bash
forge script script/Deploy.s.sol:Deploy --rpc-url $BASE_SEPOLIA_RPC_URL -vvvv
```

- [ ] **Step I1.5 — Commit**

```bash
git add script/Deploy.s.sol
git commit -m "deploy: insert Rewards between Countdown and Forge, post-deploy config"
```

---

## Phase J — Frontend

### Task J1: Add Rewards ABI + address + hook

**Files:**
- Modify: `frontend/src/config/wagmi.js`
- Modify: `frontend/src/abis/index.js`
- Create: `frontend/src/hooks/useRewards.js`

- [ ] **Step J1.1 — Add Rewards address + ABI**

In `wagmi.js`:
```js
export const REWARDS_ADDRESS = '0x...'; // filled from deploy output
```

In `abis/index.js`:
```js
export { default as BlockHuntRewardsABI } from './BlockHuntRewards.json';
```

Copy the compiled ABI from `out/BlockHuntRewards.sol/BlockHuntRewards.json` into `frontend/src/abis/BlockHuntRewards.json`.

- [ ] **Step J1.2 — Create `useRewards.js` hook**

```js
import { useReadContracts, useAccount } from 'wagmi';
import { REWARDS_ADDRESS, BlockHuntRewardsABI } from '../config/wagmi';

export function useRewards() {
  const { address } = useAccount();

  const { data } = useReadContracts({
    contracts: [
      { address: REWARDS_ADDRESS, abi: BlockHuntRewardsABI, functionName: 'currentSeason' },
      { address: REWARDS_ADDRESS, abi: BlockHuntRewardsABI, functionName: 'vaultBalance' },
      { address: REWARDS_ADDRESS, abi: BlockHuntRewardsABI, functionName: 'referralsActive' },
      { address: REWARDS_ADDRESS, abi: BlockHuntRewardsABI, functionName: 'referralAmount' },
      address && {
        address: REWARDS_ADDRESS, abi: BlockHuntRewardsABI,
        functionName: 'streakDay',
        args: [0n, address],  // todo: use currentSeason
      },
    ].filter(Boolean),
  });

  return {
    currentSeason: data?.[0]?.result,
    vaultBalance: data?.[1]?.result,
    referralsActive: data?.[2]?.result,
    referralAmount: data?.[3]?.result,
    myStreakDay: data?.[4]?.result,
  };
}
```

- [ ] **Step J1.3 — Commit**

```bash
git add frontend/src
git commit -m "frontend: rewards contract ABI, address, useRewards hook"
```

---

### Task J2: Build Rewards page (5 rows)

**Files:**
- Create: `frontend/src/screens/Rewards.jsx`

- [ ] **Step J2.1 — Create page with 5 row components**

```jsx
import { useRewards } from '../hooks/useRewards';
import { TierBountyRow } from '../components/rewards/TierBountyRow';
import { LotteryRow } from '../components/rewards/LotteryRow';
import { StreakRow } from '../components/rewards/StreakRow';
import { LeaderboardRow } from '../components/rewards/LeaderboardRow';
import { ReferralRow } from '../components/rewards/ReferralRow';

export function Rewards() {
  const state = useRewards();

  return (
    <div className="rewards-page">
      <h1>Rewards</h1>
      <TierBountyRow />
      <LotteryRow />
      <StreakRow streak={state.myStreakDay} />
      <LeaderboardRow />
      <ReferralRow
        active={state.referralsActive}
        amount={state.referralAmount}
      />
    </div>
  );
}
```

Create each `components/rewards/*.jsx` component with minimal markup matching spec §"Frontend — Rewards page".

- [ ] **Step J2.2 — Add route in the app router**

- [ ] **Step J2.3 — Test in dev server**

```bash
cd frontend && npm run dev
```

Open browser, navigate to `/rewards`, verify all 5 rows render without errors.

- [ ] **Step J2.4 — Commit**

```bash
git add frontend/src
git commit -m "frontend: rewards page with 5 reward rows"
```

---

### Task J3: Referral link detection + setReferrer flow in mint modal

**Files:**
- Modify: `frontend/src/components/MintModal.jsx`
- Create: `frontend/src/hooks/useReferral.js`

- [ ] **Step J3.1 — Create `useReferral.js`**

```js
import { useEffect, useState } from 'react';
import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import { REWARDS_ADDRESS, BlockHuntRewardsABI } from '../config/wagmi';

export function useReferral() {
  const { address } = useAccount();
  const [pendingReferrer, setPendingReferrer] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && /^0x[0-9a-fA-F]{40}$/.test(ref)) {
      localStorage.setItem('pendingReferrer', ref);
      setPendingReferrer(ref);
    } else {
      const stored = localStorage.getItem('pendingReferrer');
      if (stored) setPendingReferrer(stored);
    }
  }, []);

  const { data: existingReferrer } = useReadContract({
    address: REWARDS_ADDRESS,
    abi: BlockHuntRewardsABI,
    functionName: 'referrerOf',
    args: address ? [address] : undefined,
  });

  const { writeContractAsync } = useWriteContract();

  const needsLink =
    pendingReferrer &&
    address &&
    existingReferrer === '0x0000000000000000000000000000000000000000';

  async function linkReferrer() {
    if (!needsLink) return;
    await writeContractAsync({
      address: REWARDS_ADDRESS,
      abi: BlockHuntRewardsABI,
      functionName: 'setReferrer',
      args: [pendingReferrer],
    });
    localStorage.removeItem('pendingReferrer');
  }

  return { needsLink, pendingReferrer, linkReferrer };
}
```

- [ ] **Step J3.2 — Inject into MintModal**

```jsx
import { useReferral } from '../hooks/useReferral';

function MintModal() {
  const { needsLink, pendingReferrer, linkReferrer } = useReferral();

  async function handleMint() {
    if (needsLink) {
      // Step 1: link
      await linkReferrer();
    }
    // Step 2: existing mint flow
    await mint();
  }

  return (
    <div>
      {needsLink && (
        <div className="referral-banner">
          Invited by {pendingReferrer.slice(0,6)}…{pendingReferrer.slice(-4)} —
          your first mint will link your account (~$0.01 gas).
        </div>
      )}
      <button onClick={handleMint}>
        {needsLink ? 'Link + Mint' : 'Mint'}
      </button>
    </div>
  );
}
```

- [ ] **Step J3.3 — Test in Safari (Chrome has SES lockdown)**

Visit `?ref=0x...`, connect wallet, click mint, verify both txs fire.

- [ ] **Step J3.4 — Commit**

```bash
git add frontend/src
git commit -m "frontend: referral link detection + setReferrer inject in mint flow"
```

---

## Phase K — Final Verification

### Task K1: Full contract suite run

- [ ] **Step K1.1 — All tests**

```bash
forge test -vv
```

- [ ] **Step K1.2 — Gas report**

```bash
forge test --gas-report > /tmp/gas-report-plan2.txt
```

Verify VRF callback gas with rewards hooks added is under 220k for 50-block mints.

- [ ] **Step K1.3 — Coverage**

```bash
forge coverage --report summary
```

Rewards contract should hit >85% line coverage.

---

### Task K2: Daily workflow script

**Files:**
- Create: `script/DailyOwnerDistribute.s.sol` (owner convenience script)

- [ ] **Step K2.1 — Create script**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import "../src/BlockHuntRewards.sol";

contract DailyOwnerDistribute is Script {
    function run() external {
        address rewardsAddr = vm.envAddress("REWARDS_ADDRESS");
        uint32 day = uint32(vm.envUint("DAY"));
        address lotteryWinner = vm.envAddress("LOTTERY_WINNER");
        uint256 lotteryAmount = vm.envUint("LOTTERY_AMOUNT");
        address[3] memory top3 = [
            vm.envAddress("LB_FIRST"),
            vm.envAddress("LB_SECOND"),
            vm.envAddress("LB_THIRD")
        ];

        uint256 pk = vm.envUint("OWNER_KEY");
        vm.startBroadcast(pk);
        BlockHuntRewards rewards = BlockHuntRewards(rewardsAddr);
        rewards.distributeLottery(day, lotteryWinner, lotteryAmount);
        rewards.distributeLeaderboard(day, top3);
        vm.stopBroadcast();
    }
}
```

- [ ] **Step K2.2 — Commit**

```bash
git add script/DailyOwnerDistribute.s.sol
git commit -m "script: daily owner distribution convenience script"
```

---

## Spec Coverage Verification

| Rewards spec section | Task(s) |
|----------------------|---------|
| Overview / design principles | Structural — reflected across all tasks |
| Contract surface — State | G2–G7 |
| Contract surface — Events | G2–G8 |
| Owner functions | G2, G3, G5, G6, G7, G8 |
| Token-only hooks | G4 (`onMint`), G3 (`recordTierDrop`) |
| Player functions | G3 (`claimBounty`), G5 (`claimStreak`), G7 (`setReferrer`, `claimReferral`) |
| Reward processing table row 1 (tier bounty) | G3 |
| Row 2 (daily lottery) | G6 |
| Row 3 (streak) | G5 |
| Row 4 (daily top 3) | G6 |
| Row 5 (referral) | G7 |
| Data flow Token → Rewards | H1 |
| `rewardMint` on Token | Plan 1 D10 (dependency) |
| Referral flow detailed | G7 + J3 |
| Frontend rewards page | J1, J2 |
| Daily owner workflow | K2 |
| Security integrations (BUG-7/12/NEW-F/SH-3) | G4 (eligibility), G7 (snapshot), G8 (season), H1 (try/catch) |
| Deploy + wiring sequence | I1 |

---

## Out of Scope

- Subgraph updates (`subgraph/`) — follows this plan, not blocking
- Welcome blocks (optional per REWARD_SYSTEM_FINAL.md) — can ship later as an owner-gated `grantWelcomeBlocks(addr[])`
- Social share prompts (rare-mint → X share) — separate spec
- Animation + sound pass — separate spec
- Sorting / game score calculation — lives in Countdown per Plan 1 B2

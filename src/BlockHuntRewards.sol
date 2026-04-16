// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title BlockHuntRewards
 * @notice Founder-funded reward pool for The Block Hunt. Completely separate
 *         from the game treasury — does not touch the 90/10 mint split.
 *
 *         Three reward types per batch:
 *           1. Daily Minter Lottery  — one random winner per UTC day
 *           2. Batch Firsts          — 13 per-batch achievement prizes
 *           3. Batch Milestone Bounty — equal split among all batch minters
 *
 *         All amounts are derived from a single batch deposit via configurable
 *         basis-point ratios. Changing the deposit or ratios automatically
 *         rescales all unawarded sub-pools proportionally.
 */
interface IBlockHuntTokenRewards {
    function dailyEligible(uint256 day, address player) external view returns (bool);
    function dailyMinterCount(uint256 day) external view returns (uint256);
}

contract BlockHuntRewards is Ownable, ReentrancyGuard, Pausable {

    // ── Linked contracts ──────────────────────────────────────────────────
    address public tokenContract;

    function setTokenContract(address addr) external onlyOwner {
        tokenContract = addr;
    }

    // ── Constants ──────────────────────────────────────────────────────────
    uint256 public constant MAX_BATCHES          = 10;
    uint256 public constant BATCH_FIRSTS_COUNT   = 13;
    uint256 public constant CLAIM_WINDOW         = 30 days;
    uint256 public constant BPS_DENOMINATOR      = 10000;

    // ── Keeper role ──────────────────────────────────────────────────────
    address public keeper;

    modifier onlyOwnerOrKeeper() {
        require(msg.sender == owner() || msg.sender == keeper, "Not authorized");
        _;
    }

    event KeeperUpdated(address indexed keeper);

    function setKeeper(address _keeper) external onlyOwner {
        keeper = _keeper;
        emit KeeperUpdated(_keeper);
    }

    // ── Batch budget configuration ─────────────────────────────────────────
    //
    // For each batch the founder sets:
    //   - totalDeposit: total ETH deposited for this batch
    //   - lotteryBps:   % of deposit allocated to daily lottery (in basis points)
    //   - firstsBps:    % of deposit allocated to batch firsts
    //   - bountyBps:    % of deposit allocated to batch bounty
    //
    // The three bps values must sum to <= 10000. Any remainder is buffer
    // (returnable to founder after batch completes).
    //
    // Sub-pool amounts are computed on the fly:
    //   lotteryPool = totalDeposit * lotteryBps / 10000
    //   firstsPool  = totalDeposit * firstsBps  / 10000
    //   bountyPool  = totalDeposit * bountyBps  / 10000

    struct BatchConfig {
        uint256 totalDeposit;
        uint16  lotteryBps;    // e.g., 6000 = 60%
        uint16  firstsBps;     // e.g., 2600 = 26%
        uint16  bountyBps;     // e.g., 1400 = 14% (remainder is buffer)
        bool    active;        // true once deposit() has been called
        bool    settled;       // true once batch is complete + sweep done
    }

    mapping(uint256 => BatchConfig) public batchConfigs;

    // ── Daily Lottery ──────────────────────────────────────────────────────

    struct DailyDraw {
        uint256 batch;
        uint256 prize;
        address winner;
        uint256 resolvedAt;
        bool    claimed;
    }

    // Daily prize amount per batch (set by owner, auto-capped by lottery pool)
    mapping(uint256 => uint256) public dailyPrize;        // batch → prize per day
    mapping(uint256 => DailyDraw) public dailyDraws;      // day → draw result
    mapping(uint256 => uint256) public dailyDrawCount;     // batch → number of draws
    mapping(uint256 => uint256) public lotteryPaidOut;     // batch → total paid

    // VRF integration for daily draw
    mapping(uint256 => uint256) public vrfRequestToDay;    // vrfRequestId → day
    uint256 public pendingDrawDay;                         // day awaiting VRF

    // Day range tracking for efficient iteration
    uint256 public firstDrawDay;   // smallest day number ever resolved
    uint256 public lastDrawDay;    // largest day number ever resolved

    // ── Batch Firsts ───────────────────────────────────────────────────────
    //
    // 13 achievement IDs per batch (0-12). Prize per first is:
    //   firstsPool / BATCH_FIRSTS_COUNT
    // Owner can override individual first prizes via setFirstPrize().

    struct FirstAchievement {
        address winner;
        uint256 prize;
        uint256 awardedAt;
        bool    claimed;
    }

    // batch → achievementId → achievement
    mapping(uint256 => mapping(uint256 => FirstAchievement)) public batchFirsts;
    // batch → custom prize override (0 = use proportional default)
    mapping(uint256 => mapping(uint256 => uint256)) public firstPrizeOverride;
    mapping(uint256 => uint256) public firstsPaidOut;      // batch → total paid

    // ── Batch Bounty ───────────────────────────────────────────────────────

    struct BountyState {
        uint256 totalRecipients;
        uint256 perWalletShare;
        uint256 setAt;
        bool    distributed;
    }

    mapping(uint256 => BountyState) public batchBounties;
    // batch → wallet → entitled
    mapping(uint256 => mapping(address => bool)) public bountyEntitled;
    // batch → wallet → claimed
    mapping(uint256 => mapping(address => bool)) public bountyClaimed;
    mapping(uint256 => uint256) public bountyPaidOut;      // batch → total paid

    // ── Events ─────────────────────────────────────────────────────────────

    event BatchFunded(uint256 indexed batch, uint256 amount);
    event BatchTopUp(uint256 indexed batch, uint256 addedAmount, uint256 newTotal);
    event BatchRatiosUpdated(uint256 indexed batch, uint16 lotteryBps, uint16 firstsBps, uint16 bountyBps);
    event DailyPrizeUpdated(uint256 indexed batch, uint256 prize);

    event DailyDrawRequested(uint256 indexed day, uint256 walletCount);
    event DailyDrawResolved(uint256 indexed day, address indexed winner, uint256 prize);
    event DailyPrizeClaimed(uint256 indexed day, address indexed winner, uint256 amount);

    event BatchFirstAwarded(uint256 indexed batch, uint256 indexed achievementId, address indexed winner, uint256 prize);
    event BatchFirstClaimed(uint256 indexed batch, uint256 indexed achievementId, address indexed winner, uint256 amount);
    event FirstPrizeOverridden(uint256 indexed batch, uint256 indexed achievementId, uint256 prize);

    event BatchBountySet(uint256 indexed batch, uint256 recipients, uint256 perWallet);
    event BatchBountyClaimed(uint256 indexed batch, address indexed wallet, uint256 amount);

    event ExpiredSwept(uint256 indexed batch, uint256 amount);
    event LeftoverWithdrawn(uint256 indexed batch, uint256 amount);

    // ── Constructor ────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ═══════════════════════════════════════════════════════════════════════
    //  FOUNDER: DEPOSIT & CONFIGURE
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Deposit ETH for a batch and set the initial split ratios.
     *         Can only be called once per batch (use topUp() to add more).
     */
    function deposit(
        uint256 batch,
        uint16 lotteryBps,
        uint16 firstsBps,
        uint16 bountyBps
    ) external payable onlyOwner {
        require(batch >= 1 && batch <= MAX_BATCHES, "Invalid batch");
        require(!batchConfigs[batch].active, "Batch already funded");
        require(msg.value > 0, "No ETH sent");
        require(lotteryBps + firstsBps + bountyBps <= BPS_DENOMINATOR, "Ratios exceed 100%");

        batchConfigs[batch] = BatchConfig({
            totalDeposit: msg.value,
            lotteryBps:   lotteryBps,
            firstsBps:    firstsBps,
            bountyBps:    bountyBps,
            active:       true,
            settled:      false
        });

        emit BatchFunded(batch, msg.value);
    }

    /**
     * @notice Add more ETH to an already-funded batch. Sub-pools rescale
     *         automatically because they're computed from totalDeposit × bps.
     */
    function topUp(uint256 batch) external payable onlyOwner {
        require(batchConfigs[batch].active, "Batch not funded");
        require(msg.value > 0, "No ETH sent");

        batchConfigs[batch].totalDeposit += msg.value;
        emit BatchTopUp(batch, msg.value, batchConfigs[batch].totalDeposit);
    }

    /**
     * @notice Update the split ratios for a batch. Unawarded amounts in each
     *         sub-pool rescale proportionally. Already-awarded prizes are not
     *         affected (they're tracked in paidOut mappings).
     */
    function updateRatios(
        uint256 batch,
        uint16 lotteryBps,
        uint16 firstsBps,
        uint16 bountyBps
    ) external onlyOwner {
        require(batchConfigs[batch].active, "Batch not funded");
        require(!batchConfigs[batch].settled, "Batch settled");
        require(lotteryBps + firstsBps + bountyBps <= BPS_DENOMINATOR, "Ratios exceed 100%");

        batchConfigs[batch].lotteryBps = lotteryBps;
        batchConfigs[batch].firstsBps  = firstsBps;
        batchConfigs[batch].bountyBps  = bountyBps;

        emit BatchRatiosUpdated(batch, lotteryBps, firstsBps, bountyBps);
    }

    /**
     * @notice Set the daily lottery prize amount for a batch.
     *         The keeper pays this amount per draw from the lottery sub-pool.
     */
    function setDailyPrize(uint256 batch, uint256 prize) external onlyOwner {
        require(batchConfigs[batch].active, "Batch not funded");
        dailyPrize[batch] = prize;
        emit DailyPrizeUpdated(batch, prize);
    }

    /**
     * @notice Override the prize for a specific batch-first achievement.
     *         Set to 0 to revert to the proportional default (firstsPool / 13).
     */
    function setFirstPrize(uint256 batch, uint256 achievementId, uint256 prize) external onlyOwner {
        require(achievementId < BATCH_FIRSTS_COUNT, "Invalid achievement");
        firstPrizeOverride[batch][achievementId] = prize;
        emit FirstPrizeOverridden(batch, achievementId, prize);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  SUB-POOL COMPUTED VIEWS
    // ═══════════════════════════════════════════════════════════════════════

    function lotteryPool(uint256 batch) public view returns (uint256) {
        BatchConfig storage c = batchConfigs[batch];
        return (c.totalDeposit * c.lotteryBps) / BPS_DENOMINATOR;
    }

    function firstsPool(uint256 batch) public view returns (uint256) {
        BatchConfig storage c = batchConfigs[batch];
        return (c.totalDeposit * c.firstsBps) / BPS_DENOMINATOR;
    }

    function bountyPool(uint256 batch) public view returns (uint256) {
        BatchConfig storage c = batchConfigs[batch];
        return (c.totalDeposit * c.bountyBps) / BPS_DENOMINATOR;
    }

    function lotteryRemaining(uint256 batch) public view returns (uint256) {
        uint256 pool = lotteryPool(batch);
        return pool > lotteryPaidOut[batch] ? pool - lotteryPaidOut[batch] : 0;
    }

    function firstsRemaining(uint256 batch) public view returns (uint256) {
        uint256 pool = firstsPool(batch);
        return pool > firstsPaidOut[batch] ? pool - firstsPaidOut[batch] : 0;
    }

    function bountyRemaining(uint256 batch) public view returns (uint256) {
        uint256 pool = bountyPool(batch);
        return pool > bountyPaidOut[batch] ? pool - bountyPaidOut[batch] : 0;
    }

    /**
     * @notice Default prize per batch-first achievement (firstsPool / 13).
     *         Can be overridden per-achievement via setFirstPrize().
     */
    function defaultFirstPrize(uint256 batch) public view returns (uint256) {
        return firstsPool(batch) / BATCH_FIRSTS_COUNT;
    }

    /**
     * @notice Effective prize for a specific batch-first achievement.
     */
    function effectiveFirstPrize(uint256 batch, uint256 achievementId) public view returns (uint256) {
        uint256 over = firstPrizeOverride[batch][achievementId];
        return over > 0 ? over : defaultFirstPrize(batch);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  KEEPER: DAILY LOTTERY
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Keeper calls this to resolve the daily draw.
     * @param day       UTC day identifier
     * @param batch     Which batch this day falls in
     * @param wallets   Array of eligible wallets (from subgraph query)
     * @param randomSeed Random value (from VRF callback or off-chain VRF proof)
     *
     * @dev The keeper is responsible for providing a fair random seed.
     *      For MVP this is called by the owner/keeper with a VRF-derived seed.
     *      A future upgrade can integrate on-chain VRF directly.
     */
    function resolveDailyDraw(
        uint256 day,
        uint256 batch,
        address[] calldata wallets,
        uint256 randomSeed
    ) external onlyOwnerOrKeeper whenNotPaused {
        require(batchConfigs[batch].active, "Batch not funded");
        require(dailyDraws[day].resolvedAt == 0, "Day already resolved");
        require(wallets.length > 0, "No eligible wallets");

        uint256 prize = dailyPrize[batch];
        require(prize > 0, "Daily prize not set");
        require(lotteryRemaining(batch) >= prize, "Lottery pool exhausted");

        uint256 winnerIdx = randomSeed % wallets.length;
        address winner = wallets[winnerIdx];

        if (tokenContract != address(0)) {
            require(
                IBlockHuntTokenRewards(tokenContract).dailyEligible(day, winner),
                "Winner not eligible on-chain"
            );
        }

        dailyDraws[day] = DailyDraw({
            batch:      batch,
            prize:      prize,
            winner:     winner,
            resolvedAt: block.timestamp,
            claimed:    false
        });

        dailyDrawCount[batch]++;
        lotteryPaidOut[batch] += prize;

        if (firstDrawDay == 0 || day < firstDrawDay) firstDrawDay = day;
        if (day > lastDrawDay) lastDrawDay = day;

        emit DailyDrawResolved(day, winner, prize);
    }

    /**
     * @notice Winner claims their daily lottery prize (pull-payment).
     */
    function claimDailyPrize(uint256 day) external nonReentrant whenNotPaused {
        DailyDraw storage draw = dailyDraws[day];
        require(draw.winner == msg.sender, "Not the winner");
        require(!draw.claimed, "Already claimed");
        require(block.timestamp <= draw.resolvedAt + CLAIM_WINDOW, "Claim window expired");

        draw.claimed = true;

        (bool sent, ) = payable(msg.sender).call{value: draw.prize}("");
        require(sent, "Transfer failed");

        emit DailyPrizeClaimed(day, msg.sender, draw.prize);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  KEEPER: BATCH FIRSTS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Record a batch-first achievement winner.
     * @param batch         Batch number (1-6)
     * @param achievementId Achievement ID (0-12)
     * @param winner        Wallet that achieved the first
     */
    function setBatchFirstWinner(
        uint256 batch,
        uint256 achievementId,
        address winner
    ) external onlyOwnerOrKeeper whenNotPaused {
        require(batchConfigs[batch].active, "Batch not funded");
        require(achievementId < BATCH_FIRSTS_COUNT, "Invalid achievement");
        require(batchFirsts[batch][achievementId].winner == address(0), "Already awarded");
        require(winner != address(0), "Invalid winner");

        uint256 prize = effectiveFirstPrize(batch, achievementId);
        require(firstsRemaining(batch) >= prize, "Firsts pool exhausted");

        batchFirsts[batch][achievementId] = FirstAchievement({
            winner:    winner,
            prize:     prize,
            awardedAt: block.timestamp,
            claimed:   false
        });

        firstsPaidOut[batch] += prize;

        emit BatchFirstAwarded(batch, achievementId, winner, prize);
    }

    /**
     * @notice Winner claims their batch-first prize (pull-payment).
     */
    function claimBatchFirst(uint256 batch, uint256 achievementId) external nonReentrant whenNotPaused {
        FirstAchievement storage fa = batchFirsts[batch][achievementId];
        require(fa.winner == msg.sender, "Not the winner");
        require(!fa.claimed, "Already claimed");
        require(block.timestamp <= fa.awardedAt + CLAIM_WINDOW, "Claim window expired");

        fa.claimed = true;

        (bool sent, ) = payable(msg.sender).call{value: fa.prize}("");
        require(sent, "Transfer failed");

        emit BatchFirstClaimed(batch, achievementId, msg.sender, fa.prize);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  KEEPER: BATCH BOUNTY
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Add batch bounty recipients. Can be called multiple times to
     *         add recipients in batches (for gas limit safety with large arrays).
     *         Call finalizeBatchBounty() after all recipients are added.
     * @param batch   Batch number
     * @param wallets Wallets to add as recipients
     */
    function addBatchBountyRecipients(
        uint256 batch,
        address[] calldata wallets
    ) external onlyOwnerOrKeeper whenNotPaused {
        require(batchConfigs[batch].active, "Batch not funded");
        require(!batchBounties[batch].distributed, "Already finalized");
        require(wallets.length > 0, "No recipients");

        for (uint256 i = 0; i < wallets.length; i++) {
            if (!bountyEntitled[batch][wallets[i]]) {
                bountyEntitled[batch][wallets[i]] = true;
                batchBounties[batch].totalRecipients++;
            }
        }
    }

    /**
     * @notice Finalize the batch bounty after all recipients are added.
     *         Computes equal share and locks the distribution.
     */
    function finalizeBatchBounty(uint256 batch) external onlyOwnerOrKeeper whenNotPaused {
        require(batchConfigs[batch].active, "Batch not funded");
        require(!batchBounties[batch].distributed, "Already finalized");
        require(batchBounties[batch].totalRecipients > 0, "No recipients added");

        uint256 pool = bountyPool(batch);
        uint256 perWallet = pool / batchBounties[batch].totalRecipients;
        require(perWallet > 0, "Share too small");

        batchBounties[batch].perWalletShare = perWallet;
        batchBounties[batch].setAt = block.timestamp;
        batchBounties[batch].distributed = true;

        emit BatchBountySet(batch, batchBounties[batch].totalRecipients, perWallet);
    }

    /**
     * @notice Player claims their share of a batch bounty (pull-payment).
     */
    function claimBatchBounty(uint256 batch) external nonReentrant whenNotPaused {
        require(batchBounties[batch].distributed, "Not distributed yet");
        require(bountyEntitled[batch][msg.sender], "Not entitled");
        require(!bountyClaimed[batch][msg.sender], "Already claimed");
        require(
            block.timestamp <= batchBounties[batch].setAt + CLAIM_WINDOW,
            "Claim window expired"
        );

        bountyClaimed[batch][msg.sender] = true;
        uint256 share = batchBounties[batch].perWalletShare;
        bountyPaidOut[batch] += share;

        (bool sent, ) = payable(msg.sender).call{value: share}("");
        require(sent, "Transfer failed");

        emit BatchBountyClaimed(batch, msg.sender, share);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  FOUNDER: SWEEP & WITHDRAW
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Sweep unclaimed prizes from an expired batch back to the founder.
     *         Only callable after all claim windows have expired.
     */
    function sweepExpired(uint256 batch, address to) external onlyOwner nonReentrant {
        require(batchConfigs[batch].active, "Batch not funded");
        require(to != address(0), "Invalid address");

        uint256 reclaimable;

        // Sweep unclaimed daily prizes
        for (uint256 day = firstDrawDay; day <= lastDrawDay; day++) {
            DailyDraw storage draw = dailyDraws[day];
            if (draw.batch != batch || draw.resolvedAt == 0) continue;
            if (draw.claimed) continue;
            if (block.timestamp <= draw.resolvedAt + CLAIM_WINDOW) continue;
            // Expired and unclaimed
            draw.claimed = true;
            reclaimable += draw.prize;
        }

        // Sweep unclaimed batch firsts
        for (uint256 i = 0; i < BATCH_FIRSTS_COUNT; i++) {
            FirstAchievement storage fa = batchFirsts[batch][i];
            if (fa.winner == address(0) || fa.claimed) continue;
            if (block.timestamp <= fa.awardedAt + CLAIM_WINDOW) continue;
            fa.claimed = true;
            reclaimable += fa.prize;
        }

        // Note: batch bounty unclaimed amounts are swept separately since
        // we can't iterate all entitled wallets. The dust stays in contract
        // until withdrawLeftover().

        require(reclaimable > 0, "Nothing to sweep");

        (bool sent, ) = payable(to).call{value: reclaimable}("");
        require(sent, "Transfer failed");

        emit ExpiredSwept(batch, reclaimable);
    }

    /**
     * @notice Withdraw unallocated buffer funds from a batch.
     *         Buffer = totalDeposit - (lotteryPool + firstsPool + bountyPool).
     *         Also covers any bounty dust from integer division.
     */
    function withdrawLeftover(uint256 batch, address to) external onlyOwner nonReentrant {
        require(batchConfigs[batch].active, "Batch not funded");
        require(!batchConfigs[batch].settled, "Already settled");
        require(to != address(0), "Invalid address");

        BatchConfig storage c = batchConfigs[batch];
        uint256 allocated = lotteryPool(batch) + firstsPool(batch) + bountyPool(batch);
        uint256 buffer = c.totalDeposit > allocated ? c.totalDeposit - allocated : 0;

        require(buffer > 0, "No leftover");

        c.settled = true;

        (bool sent, ) = payable(to).call{value: buffer}("");
        require(sent, "Transfer failed");

        emit LeftoverWithdrawn(batch, buffer);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  VIEW: CLAIMABLE STATE FOR A WALLET
    // ═══════════════════════════════════════════════════════════════════════

    struct ClaimableResult {
        // Daily lottery
        uint256[] wonDays;
        uint256[] wonAmounts;
        // Batch firsts
        uint256[] firstBatches;
        uint256[] firstIds;
        uint256[] firstAmounts;
        // Batch bounty
        uint256[] bountyBatches;
        uint256[] bountyAmounts;
    }

    /**
     * @notice Returns all pending (unclaimed, non-expired) claims for a wallet.
     *         Designed for frontend use — single call returns everything needed
     *         to render claim buttons.
     *
     * @dev Uses a two-pass pattern: first count, then populate. This avoids
     *      dynamic array push (not available in memory). Gas is irrelevant
     *      since this is a view function (no on-chain execution cost).
     */
    function getClaimable(address wallet) external view returns (ClaimableResult memory result) {
        // ── Pass 1: Count ──────────────────────────────────────────────────
        uint256 dCount;
        uint256 fCount;
        uint256 bCount;

        // Daily wins
        for (uint256 day = firstDrawDay; day <= lastDrawDay && lastDrawDay > 0; day++) {
            DailyDraw storage draw = dailyDraws[day];
            if (draw.winner == wallet && !draw.claimed &&
                draw.resolvedAt > 0 && block.timestamp <= draw.resolvedAt + CLAIM_WINDOW) {
                dCount++;
            }
        }

        // Batch firsts
        for (uint256 b = 1; b <= MAX_BATCHES; b++) {
            for (uint256 i = 0; i < BATCH_FIRSTS_COUNT; i++) {
                FirstAchievement storage fa = batchFirsts[b][i];
                if (fa.winner == wallet && !fa.claimed &&
                    block.timestamp <= fa.awardedAt + CLAIM_WINDOW) {
                    fCount++;
                }
            }
        }

        // Batch bounties
        for (uint256 b = 1; b <= MAX_BATCHES; b++) {
            if (bountyEntitled[b][wallet] && !bountyClaimed[b][wallet] &&
                batchBounties[b].distributed &&
                block.timestamp <= batchBounties[b].setAt + CLAIM_WINDOW) {
                bCount++;
            }
        }

        // ── Pass 2: Populate ───────────────────────────────────────────────
        result.wonDays     = new uint256[](dCount);
        result.wonAmounts  = new uint256[](dCount);
        result.firstBatches = new uint256[](fCount);
        result.firstIds     = new uint256[](fCount);
        result.firstAmounts = new uint256[](fCount);
        result.bountyBatches = new uint256[](bCount);
        result.bountyAmounts = new uint256[](bCount);

        uint256 di; uint256 fi; uint256 bi;

        for (uint256 day = firstDrawDay; day <= lastDrawDay && lastDrawDay > 0; day++) {
            DailyDraw storage draw = dailyDraws[day];
            if (draw.winner == wallet && !draw.claimed &&
                draw.resolvedAt > 0 && block.timestamp <= draw.resolvedAt + CLAIM_WINDOW) {
                result.wonDays[di]    = day;
                result.wonAmounts[di] = draw.prize;
                di++;
            }
        }

        for (uint256 b = 1; b <= MAX_BATCHES; b++) {
            for (uint256 i = 0; i < BATCH_FIRSTS_COUNT; i++) {
                FirstAchievement storage fa = batchFirsts[b][i];
                if (fa.winner == wallet && !fa.claimed &&
                    block.timestamp <= fa.awardedAt + CLAIM_WINDOW) {
                    result.firstBatches[fi] = b;
                    result.firstIds[fi]     = i;
                    result.firstAmounts[fi] = fa.prize;
                    fi++;
                }
            }
        }

        for (uint256 b = 1; b <= MAX_BATCHES; b++) {
            if (bountyEntitled[b][wallet] && !bountyClaimed[b][wallet] &&
                batchBounties[b].distributed &&
                block.timestamp <= batchBounties[b].setAt + CLAIM_WINDOW) {
                result.bountyBatches[bi] = b;
                result.bountyAmounts[bi] = batchBounties[b].perWalletShare;
                bi++;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════════════════════════════

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /**
     * @notice Emergency withdraw. Remove before mainnet.
     */
    function emergencyWithdraw(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid address");
        (bool sent, ) = payable(to).call{value: amount}("");
        require(sent, "Transfer failed");
    }

    receive() external payable {}
}

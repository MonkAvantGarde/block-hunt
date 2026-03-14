// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║          THE BLOCK HUNT — ESCROW CONTRACT                    ║
 * ║                                                              ║
 * ║  Holds and distributes treasury funds after sacrifice.       ║
 * ║                                                              ║
 * ║  Split: 50% winner | 40% community pool | 10% Season 2 seed ║
 * ║                                                              ║
 * ║  Winner's 50% is stored for pull-payment withdrawal.         ║
 * ║  40% is held for top-100 leaderboard claims (30-day window). ║
 * ║  10% is held until Season 2 treasury address is confirmed.   ║
 * ║                                                              ║
 * ║  Entitlements are set by the keeper AFTER sacrifice, based   ║
 * ║  on a subgraph snapshot. The winner never controls who       ║
 * ║  receives the community pool.                                ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

contract BlockHuntEscrow is Ownable, ReentrancyGuard {

    // ── Linked contracts ────────────────────────────────────────────────────
    address public tokenContract;
    address public keeperAddress;
    address public season2TreasuryAddress;

    bool public testModeEnabled = true;

    // ── Constants ───────────────────────────────────────────────────────────
    uint256 public constant CLAIM_WINDOW = 30 days;

    // ── Sacrifice state ─────────────────────────────────────────────────────
    // Set once per sacrifice. Persists until Season 2 sweep completes.
    bool    public sacrificeExecuted;
    uint256 public communityPool;           // 40% held for top-100 claims
    uint256 public season2Seed;             // 10% held until Season 2 address confirmed
    uint256 public claimWindowExpiry;       // block.timestamp + 30 days at sacrifice time
    bool    public entitlementsSet;         // true after keeper calls setLeaderboardEntitlements
    bool    public season2SeedReleased;     // true after releaseSeason2Seed() completes

    mapping(address => uint256) public leaderboardEntitlement;  // player → claimable ETH
    address[] private _entitlementList;                         // tracks who has an entitlement
    mapping(address => bool) public hasClaimed;                 // prevents double-claims
    mapping(address => uint256) public pendingWithdrawal;       // winner's 50% (pull-payment)

    // ── Events ──────────────────────────────────────────────────────────────
    event SacrificeReceived(address indexed winner, uint256 winnerShare, uint256 communityPool, uint256 season2Seed);
    event EntitlementsSet(uint256 playerCount, uint256 totalAllocated);
    event LeaderboardRewardClaimed(address indexed player, uint256 amount);
    event Season2SeedReleased(address indexed to, uint256 amount);
    event UnclaimedRewardsSwept(address indexed to, uint256 amount);
    event WinnerShareWithdrawn(address indexed winner, uint256 amount);

    // ── Constructor ─────────────────────────────────────────────────────────
    constructor(address keeperAddress_) Ownable(msg.sender) {
        require(keeperAddress_ != address(0), "Invalid keeper");
        keeperAddress = keeperAddress_;
    }

    // ── Modifiers ───────────────────────────────────────────────────────────
    modifier onlyToken() {
        require(msg.sender == tokenContract, "Only token contract");
        _;
    }

    modifier onlyKeeper() {
        require(msg.sender == keeperAddress, "Only keeper");
        _;
    }

    // ── Owner setup (call during deployment, before renouncing ownership) ──

    function setTokenContract(address addr) external onlyOwner {
        require(tokenContract == address(0) || testModeEnabled, "Already set");
        require(addr != address(0), "Invalid address");
        tokenContract = addr;
    }

    function disableTestMode() external onlyOwner {
        testModeEnabled = false;
    }

    // Keeper-callable: set once Season 2 treasury is deployed and registered.
    // Not owner-gated so it works after ownership is renounced.
    function setSeason2TreasuryAddress(address addr) external onlyKeeper {
        require(addr != address(0), "Invalid address");
        season2TreasuryAddress = addr;
    }

    // ── Called by BlockHuntToken during sacrifice execution ──────────────────
    //
    // Treasury sends 100% ETH to this contract first, then Token calls
    // this function to trigger the 50/10 immediate sends and park the 40%.

    function initiateSacrifice(address winner) external onlyToken nonReentrant {
        require(!sacrificeExecuted, "Sacrifice already executed");

        uint256 total = address(this).balance;
        require(total > 0, "No ETH received");

        uint256 winnerShare  = total / 2;                          // 50%
        uint256 seedShare    = total / 10;                         // 10%
        uint256 community    = total - winnerShare - seedShare;    // 40% (handles rounding)

        sacrificeExecuted   = true;
        communityPool       = community;
        season2Seed         = seedShare;
        claimWindowExpiry   = block.timestamp + CLAIM_WINDOW;

        // 50% stored for winner to withdraw (pull-payment prevents griefing)
        pendingWithdrawal[winner] = winnerShare;

        emit SacrificeReceived(winner, winnerShare, community, seedShare);
    }

    // ── Keeper sets entitlements after querying subgraph snapshot ────────────
    //
    // Called once after sacrifice. Keeper queries the subgraph for top-100
    // players by progressionScore (tiebreak: totalMints), excluding the winner.
    // Each player's share = (playerScore / sumOfTop100Scores) × communityPool.
    //
    // The formula is documented in TRANSPARENCY.md so players can verify
    // the keeper's output independently.

    function setLeaderboardEntitlements(
        address[] calldata players,
        uint256[] calldata amounts
    ) external onlyKeeper {
        require(sacrificeExecuted,              "No sacrifice yet");
        require(!entitlementsSet,               "Entitlements already set");
        require(players.length == amounts.length, "Array length mismatch");
        require(players.length <= 100,          "Max 100 players");

        uint256 totalAllocated;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAllocated += amounts[i];
        }
        require(totalAllocated <= communityPool, "Exceeds community pool");

        for (uint256 i = 0; i < players.length; i++) {
            if (amounts[i] > 0) {
                leaderboardEntitlement[players[i]] = amounts[i];
                _entitlementList.push(players[i]);
            }
        }

        entitlementsSet = true;
        emit EntitlementsSet(players.length, totalAllocated);
    }

    // ── Players claim their share of the 40% community pool ─────────────────

    function claimLeaderboardReward() external nonReentrant {
        require(entitlementsSet,                  "Entitlements not set yet");
        require(block.timestamp <= claimWindowExpiry, "Claim window expired");
        require(!hasClaimed[msg.sender],          "Already claimed");

        uint256 amount = leaderboardEntitlement[msg.sender];
        require(amount > 0,             "No entitlement");
        require(amount <= communityPool, "Insufficient pool");

        hasClaimed[msg.sender] = true;
        communityPool -= amount;

        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "Claim transfer failed");

        emit LeaderboardRewardClaimed(msg.sender, amount);
    }

    // ── Winner withdraws their 50% share ─────────────────────────────────────

    /**
     * @notice Winner withdraws their 50% share after sacrifice.
     * @dev Pull-payment pattern prevents griefing by contract holders.
     */
    function withdrawWinnerShare() external nonReentrant {
        uint256 amount = pendingWithdrawal[msg.sender];
        require(amount > 0, "Nothing to withdraw");

        pendingWithdrawal[msg.sender] = 0;

        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "Transfer failed");

        emit WinnerShareWithdrawn(msg.sender, amount);
    }

    // ── Release 10% seed to Season 2 treasury ───────────────────────────────
    //
    // Permissionless — callable by anyone (Gelato keeper or community member).
    // The guard is that season2TreasuryAddress must be set by the keeper.
    // Funds can only flow to the pre-set address; callers cannot redirect.

    function releaseSeason2Seed() external nonReentrant {
        require(sacrificeExecuted,                      "No sacrifice yet");
        require(!season2SeedReleased,                   "Already released");
        require(season2TreasuryAddress != address(0),   "Season 2 address not set");
        require(season2Seed > 0,                        "No seed to release");

        season2SeedReleased = true;
        uint256 amount = season2Seed;
        season2Seed = 0;

        (bool sent, ) = payable(season2TreasuryAddress).call{value: amount}("");
        require(sent, "Seed transfer failed");

        emit Season2SeedReleased(season2TreasuryAddress, amount);
    }

    // ── Sweep unclaimed community rewards after 30-day window ────────────────
    //
    // Permissionless — callable by anyone after the claim window expires.
    // Sends remaining community pool to Season 2 treasury (same destination
    // as the seed, so unclaimed rewards strengthen the next season).

    function sweepUnclaimedRewards() external nonReentrant {
        require(sacrificeExecuted,                      "No sacrifice");
        require(block.timestamp > claimWindowExpiry,    "Claim window still open");
        require(communityPool > 0,                      "Nothing to sweep");
        require(season2TreasuryAddress != address(0),   "Season 2 address not set");

        uint256 amount = communityPool;
        communityPool = 0;

        (bool sent, ) = payable(season2TreasuryAddress).call{value: amount}("");
        require(sent, "Sweep failed");

        emit UnclaimedRewardsSwept(season2TreasuryAddress, amount);
    }

    // ── View helpers ────────────────────────────────────────────────────────

    function getEscrowInfo() external view returns (
        bool    isSacrificeExecuted,
        bool    areEntitlementsSet,
        uint256 pool,
        uint256 seed,
        uint256 claimExpiry,
        bool    seedReleased
    ) {
        isSacrificeExecuted = sacrificeExecuted;
        areEntitlementsSet  = entitlementsSet;
        pool                = communityPool;
        seed                = season2Seed;
        claimExpiry         = claimWindowExpiry;
        seedReleased        = season2SeedReleased;
    }

    // ── Must accept ETH from Treasury during sacrifice ──────────────────────
    receive() external payable {}
}

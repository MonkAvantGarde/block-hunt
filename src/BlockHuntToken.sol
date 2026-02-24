// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface IBlockHuntTreasury {
    function receiveMintFunds() external payable;
    function claimPayout(address winner) external;
    function sacrificePayout(address winner) external;
}

interface IBlockHuntMint {
    function isWindowOpen() external view returns (bool);
    function recordMint(address minter, uint256 quantity) external;
}

contract BlockHuntToken is ERC1155, ERC2981, Ownable, ReentrancyGuard, Pausable {

    uint256 public constant TIER_ORIGIN   = 1;
    uint256 public constant TIER_WILLFUL  = 2;
    uint256 public constant TIER_CHAOTIC  = 3;
    uint256 public constant TIER_ORDERED  = 4;
    uint256 public constant TIER_REMEMBER = 5;
    uint256 public constant TIER_RESTLESS = 6;
    uint256 public constant TIER_INERT    = 7;

    uint256 public constant MINT_PRICE = 0.00025 ether;
    uint256 public constant DAILY_CAP  = 50_000;

    mapping(uint256 => uint256) public combineRatio;

    address public mintWindowContract;
    address public treasuryContract;
    address public forgeContract;

    uint256 public currentWindowDay;
    uint256 public windowDayMinted;
    uint256[8] public tierTotalSupply;

    bool public countdownActive;
    address public countdownHolder;

    uint256 private _nonce;

    event BlockMinted(address indexed to, uint256 quantity);
    event BlocksCombined(address indexed by, uint256 indexed fromTier, uint256 indexed toTier);
    event BlocksForged(address indexed by, uint256 indexed fromTier, bool success);
    event CountdownTriggered(address indexed holder);
    event OriginClaimed(address indexed holder);
    event OriginSacrificed(address indexed holder);

    constructor(string memory uri_, address royaltyReceiver_, uint96 royaltyFee_)
        ERC1155(uri_) Ownable(msg.sender)
    {
        _setDefaultRoyalty(royaltyReceiver_, royaltyFee_);
        combineRatio[7] = 20;
        combineRatio[6] = 20;
        combineRatio[5] = 30;
        combineRatio[4] = 30;
        combineRatio[3] = 50;
        combineRatio[2] = 100;
    }

    modifier onlyMintWindow() {
        require(msg.sender == mintWindowContract, "Only mint window contract");
        _;
    }

    modifier onlyForge() {
        require(msg.sender == forgeContract, "Only forge contract");
        _;
    }

    modifier notCountdown() {
        require(!countdownActive, "Countdown is active");
        _;
    }

    function setMintWindowContract(address addr) external onlyOwner { mintWindowContract = addr; }
    function setTreasuryContract(address addr) external onlyOwner { treasuryContract = addr; }
    function setForgeContract(address addr) external onlyOwner { forgeContract = addr; }
    function setURI(string memory newuri) external onlyOwner { _setURI(newuri); }
    function setRoyalty(address receiver, uint96 fee) external onlyOwner { _setDefaultRoyalty(receiver, fee); }
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function mint(uint256 quantity) external payable nonReentrant whenNotPaused notCountdown {
        require(mintWindowContract != address(0), "Mint not configured");
        require(IBlockHuntMint(mintWindowContract).isWindowOpen(), "Window closed");
        require(quantity > 0 && quantity <= 500, "Invalid quantity");
        require(msg.value >= MINT_PRICE * quantity, "Insufficient payment");

        uint256 dayRemaining = DAILY_CAP - windowDayMinted;
        require(dayRemaining > 0, "Daily cap reached");
        uint256 allocated = quantity > dayRemaining ? dayRemaining : quantity;

        uint256 totalCost = MINT_PRICE * allocated;
        if (msg.value > totalCost) {
            (bool refunded, ) = payable(msg.sender).call{value: msg.value - totalCost}("");
            require(refunded, "Refund failed");
        }

        IBlockHuntTreasury(treasuryContract).receiveMintFunds{value: totalCost}();
        windowDayMinted += allocated;

        uint256[] memory ids = new uint256[](allocated);
        uint256[] memory amounts = new uint256[](allocated);

        for (uint256 i = 0; i < allocated; i++) {
            uint256 tier = _rollTier(i);
            ids[i] = tier;
            amounts[i] = 1;
            tierTotalSupply[tier]++;
        }

        _mintBatch(msg.sender, ids, amounts, "");
        IBlockHuntMint(mintWindowContract).recordMint(msg.sender, allocated);
        emit BlockMinted(msg.sender, allocated);
        _checkCountdownTrigger(msg.sender);
    }

    function combine(uint256 fromTier) external nonReentrant whenNotPaused {
        require(fromTier >= 2 && fromTier <= 7, "Invalid tier");
        uint256 ratio = combineRatio[fromTier];
        require(balanceOf(msg.sender, fromTier) >= ratio, "Insufficient blocks");

        uint256 toTier = fromTier - 1;
        _burn(msg.sender, fromTier, ratio);
        tierTotalSupply[fromTier] -= ratio;
        _mint(msg.sender, toTier, 1, "");
        tierTotalSupply[toTier]++;

        emit BlocksCombined(msg.sender, fromTier, toTier);
        _checkCountdownTrigger(msg.sender);
    }

    function combineMany(uint256[] calldata fromTiers) external nonReentrant whenNotPaused {
        for (uint256 i = 0; i < fromTiers.length; i++) {
            uint256 fromTier = fromTiers[i];
            require(fromTier >= 2 && fromTier <= 7, "Invalid tier");
            uint256 ratio = combineRatio[fromTier];
            require(balanceOf(msg.sender, fromTier) >= ratio, "Insufficient blocks");
            uint256 toTier = fromTier - 1;
            _burn(msg.sender, fromTier, ratio);
            tierTotalSupply[fromTier] -= ratio;
            _mint(msg.sender, toTier, 1, "");
            tierTotalSupply[toTier]++;
            emit BlocksCombined(msg.sender, fromTier, toTier);
        }
        _checkCountdownTrigger(msg.sender);
    }

    function executeForge(address player, uint256 fromTier, uint256 burnCount, bool success)
        external onlyForge nonReentrant
    {
        require(fromTier >= 2 && fromTier <= 7, "Invalid tier");
        require(burnCount >= 10 && burnCount <= 99, "Invalid burn count");
        require(balanceOf(player, fromTier) >= burnCount, "Insufficient blocks");

        uint256 toTier = fromTier - 1;
        _burn(player, fromTier, burnCount);
        tierTotalSupply[fromTier] -= burnCount;

        if (success) {
            _mint(player, toTier, 1, "");
            tierTotalSupply[toTier]++;
        }

        emit BlocksForged(player, fromTier, success);
        if (success) _checkCountdownTrigger(player);
    }

    function claimTreasury() external nonReentrant {
        require(countdownActive, "No countdown active");
        require(msg.sender == countdownHolder, "Not the countdown holder");
        _verifyHoldsAllTiers(msg.sender);

        for (uint256 tier = 2; tier <= 7; tier++) {
            uint256 bal = balanceOf(msg.sender, tier);
            _burn(msg.sender, tier, bal);
            tierTotalSupply[tier] -= bal;
        }

        IBlockHuntTreasury(treasuryContract).claimPayout(msg.sender);
        emit OriginClaimed(msg.sender);
    }

    function sacrifice() external nonReentrant {
        require(countdownActive, "No countdown active");
        require(msg.sender == countdownHolder, "Not the countdown holder");
        _verifyHoldsAllTiers(msg.sender);

        for (uint256 tier = 2; tier <= 7; tier++) {
            uint256 bal = balanceOf(msg.sender, tier);
            _burn(msg.sender, tier, bal);
            tierTotalSupply[tier] -= bal;
        }

        _mint(msg.sender, TIER_ORIGIN, 1, "");
        tierTotalSupply[TIER_ORIGIN]++;

        IBlockHuntTreasury(treasuryContract).sacrificePayout(msg.sender);
        emit OriginSacrificed(msg.sender);

        countdownActive = false;
        countdownHolder = address(0);
    }

    function resetDailyWindow(uint256 newDay) external onlyMintWindow {
        currentWindowDay = newDay;
        windowDayMinted = 0;
    }

    function _checkCountdownTrigger(address player) internal {
        if (countdownActive) return;
        for (uint256 tier = 2; tier <= 7; tier++) {
            if (balanceOf(player, tier) == 0) return;
        }
        countdownActive = true;
        countdownHolder = player;
        emit CountdownTriggered(player);
    }

    function _verifyHoldsAllTiers(address player) internal view {
        for (uint256 tier = 2; tier <= 7; tier++) {
            require(balanceOf(player, tier) > 0, "Must hold all 6 tiers");
        }
    }

    function _rollTier(uint256 salt) internal returns (uint256) {
        _nonce++;
        uint256 rand = uint256(keccak256(abi.encodePacked(
            block.prevrandao, block.timestamp, msg.sender, _nonce, salt
        ))) % 100000;

        if (rand < 1)     return TIER_ORIGIN;
        if (rand < 50)    return TIER_WILLFUL;
        if (rand < 300)   return TIER_CHAOTIC;
        if (rand < 1500)  return TIER_ORDERED;
        if (rand < 6000)  return TIER_REMEMBER;
        if (rand < 20000) return TIER_RESTLESS;
        return TIER_INERT;
    }

    function balancesOf(address player) external view returns (uint256[8] memory) {
        uint256[8] memory bals;
        for (uint256 tier = 1; tier <= 7; tier++) {
            bals[tier] = balanceOf(player, tier);
        }
        return bals;
    }

    function hasAllTiers(address player) external view returns (bool) {
        for (uint256 tier = 2; tier <= 7; tier++) {
            if (balanceOf(player, tier) == 0) return false;
        }
        return true;
    }

    function supportsInterface(bytes4 interfaceId)
        public view virtual override(ERC1155, ERC2981) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
    // ── TEST ONLY — remove before mainnet ─────────────────────────────────

    bool public testMintEnabled = true;

    function mintForTest(address player, uint256 tier, uint256 amount) external {
        require(testMintEnabled, "Test mint disabled");
        require(tier >= 1 && tier <= 7, "Invalid tier");
        _mint(player, tier, amount, "");
        tierTotalSupply[tier] += amount;
        _checkCountdownTrigger(player);
    }

    function disableTestMint() external onlyOwner {
        testMintEnabled = false;
    }
// ── Migration support ─────────────────────────────────────────────────

    address public migrationContract;

    function setMigrationContract(address addr) external onlyOwner {
        require(migrationContract == address(0), "Already set");
        migrationContract = addr;
    }

    /**
     * @notice Called by migration contract to burn a player's Season 1 blocks.
     *         Only the migration contract can call this.
     */
    function burnForMigration(
        address player,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external {
        require(msg.sender == migrationContract, "Only migration contract");
        _burnBatch(player, ids, amounts);
        for (uint256 i = 0; i < ids.length; i++) {
            tierTotalSupply[ids[i]] -= amounts[i];
        }
    }

    /**
     * @notice Called by migration contract to mint Season 2 starter blocks.
     *         This same function lives on the Season 2 token contract.
     *         Only the migration contract can call this.
     */
    function mintMigrationStarters(
        address player,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external {
        require(msg.sender == migrationContract, "Only migration contract");
        _mintBatch(player, ids, amounts, "");
        for (uint256 i = 0; i < ids.length; i++) {
            tierTotalSupply[ids[i]] += amounts[i];
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║      THE BLOCK HUNT — MARKETPLACE (Fixed-Price Listings)    ║
 * ║                                                              ║
 * ║  Non-custodial P2P trading of Block Hunt ERC-1155 tokens.   ║
 * ║  Tokens stay in seller's wallet until a buyer fills.        ║
 * ║  10% protocol fee on every sale → creator wallet.           ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
contract BlockHuntMarketplace is Ownable, ReentrancyGuard {

    // ── Linked contracts ──────────────────────────────────────────────────
    IERC1155 public immutable token;

    // ── Fee config ────────────────────────────────────────────────────────
    uint256 public protocolFeeBps = 1000; // 10%
    address public feeRecipient;

    // ── Listing constraints ───────────────────────────────────────────────
    uint256 public constant MIN_PRICE = 0.00001 ether;
    uint256 public constant MIN_DURATION = 1 hours;
    uint256 public constant MAX_DURATION = 30 days;
    uint256 public constant DEFAULT_DURATION = 7 days;

    // ── Listing data ──────────────────────────────────────────────────────
    struct Listing {
        address seller;
        uint256 tier;
        uint256 quantity;
        uint256 pricePerBlock;
        uint256 createdAt;
        uint256 expiresAt;
        bool    active;
    }

    uint256 public nextListingId = 1;
    mapping(uint256 => Listing) public listings;

    // ── Events ────────────────────────────────────────────────────────────
    event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 tier, uint256 quantity, uint256 pricePerBlock, uint256 expiresAt);
    event ListingFilled(uint256 indexed listingId, address indexed buyer, uint256 quantity, uint256 totalPaid);
    event ListingCancelled(uint256 indexed listingId);

    // ── Constructor ───────────────────────────────────────────────────────
    constructor(address tokenAddress_, address feeRecipient_) Ownable(msg.sender) {
        require(tokenAddress_ != address(0), "Invalid token");
        require(feeRecipient_ != address(0), "Invalid fee recipient");
        token = IERC1155(tokenAddress_);
        feeRecipient = feeRecipient_;
    }

    // ── Admin ─────────────────────────────────────────────────────────────
    function setProtocolFeeBps(uint256 bps) external onlyOwner {
        require(bps <= 2000, "Max 20%");
        protocolFeeBps = bps;
    }

    function setFeeRecipient(address addr) external onlyOwner {
        require(addr != address(0), "Invalid address");
        feeRecipient = addr;
    }

    // ── Create listing ────────────────────────────────────────────────────
    function createListing(
        uint256 tier,
        uint256 quantity,
        uint256 pricePerBlock,
        uint256 duration
    ) external returns (uint256 listingId) {
        require(tier >= 1 && tier <= 7, "Invalid tier");
        require(quantity > 0, "Zero quantity");
        require(pricePerBlock >= MIN_PRICE, "Below min price");
        require(token.balanceOf(msg.sender, tier) >= quantity, "Insufficient balance");
        require(token.isApprovedForAll(msg.sender, address(this)), "Marketplace not approved");

        if (duration == 0) duration = DEFAULT_DURATION;
        require(duration >= MIN_DURATION, "Duration too short");
        require(duration <= MAX_DURATION, "Duration too long");

        listingId = nextListingId++;
        listings[listingId] = Listing({
            seller:        msg.sender,
            tier:           tier,
            quantity:       quantity,
            pricePerBlock:  pricePerBlock,
            createdAt:      block.timestamp,
            expiresAt:      block.timestamp + duration,
            active:         true
        });

        emit ListingCreated(listingId, msg.sender, tier, quantity, pricePerBlock, block.timestamp + duration);
    }

    // ── Buy from listing ──────────────────────────────────────────────────
    function buyListing(uint256 listingId, uint256 quantity) external payable nonReentrant {
        Listing storage listing = listings[listingId];
        require(listing.active, "Listing not active");
        require(block.timestamp <= listing.expiresAt, "Listing expired");
        require(quantity > 0 && quantity <= listing.quantity, "Invalid quantity");

        uint256 totalPrice = listing.pricePerBlock * quantity;
        require(msg.value >= totalPrice, "Insufficient ETH");

        // Update listing
        listing.quantity -= quantity;
        if (listing.quantity == 0) listing.active = false;

        // Fee split
        uint256 fee = (totalPrice * protocolFeeBps) / 10000;
        uint256 sellerAmount = totalPrice - fee;

        // Transfer tokens (non-custodial: from seller's wallet)
        token.safeTransferFrom(listing.seller, msg.sender, listing.tier, quantity, "");

        // Transfer ETH
        if (fee > 0) {
            (bool feeSent, ) = payable(feeRecipient).call{value: fee}("");
            require(feeSent, "Fee transfer failed");
        }
        (bool sellerSent, ) = payable(listing.seller).call{value: sellerAmount}("");
        require(sellerSent, "Seller transfer failed");

        // Refund excess
        if (msg.value > totalPrice) {
            (bool refunded, ) = payable(msg.sender).call{value: msg.value - totalPrice}("");
            require(refunded, "Refund failed");
        }

        emit ListingFilled(listingId, msg.sender, quantity, totalPrice);
    }

    // ── Cancel listing ────────────────────────────────────────────────────
    function cancelListing(uint256 listingId) external {
        Listing storage listing = listings[listingId];
        require(listing.seller == msg.sender, "Not seller");
        require(listing.active, "Already cancelled");
        listing.active = false;
        emit ListingCancelled(listingId);
    }

    // ── View helpers ──────────────────────────────────────────────────────

    function getListing(uint256 listingId) external view returns (
        address seller, uint256 tier, uint256 quantity,
        uint256 pricePerBlock, uint256 createdAt, uint256 expiresAt, bool active
    ) {
        Listing storage l = listings[listingId];
        return (l.seller, l.tier, l.quantity, l.pricePerBlock, l.createdAt, l.expiresAt, l.active);
    }

    /// @notice Returns up to `limit` active listings starting from listingId `offset`.
    function getActiveListings(uint256 offset, uint256 limit) external view returns (
        uint256[] memory ids,
        address[] memory sellers,
        uint256[] memory tiers,
        uint256[] memory quantities,
        uint256[] memory prices,
        uint256[] memory expiresAts
    ) {
        // Count active listings in range
        uint256 count = 0;
        uint256 end = nextListingId;
        uint256 start = offset > 0 ? offset : 1;

        // First pass: count
        for (uint256 i = start; i < end && count < limit; i++) {
            if (listings[i].active && block.timestamp <= listings[i].expiresAt) count++;
        }

        ids = new uint256[](count);
        sellers = new address[](count);
        tiers = new uint256[](count);
        quantities = new uint256[](count);
        prices = new uint256[](count);
        expiresAts = new uint256[](count);

        // Second pass: fill
        uint256 idx = 0;
        for (uint256 i = start; i < end && idx < count; i++) {
            Listing storage l = listings[i];
            if (l.active && block.timestamp <= l.expiresAt) {
                ids[idx] = i;
                sellers[idx] = l.seller;
                tiers[idx] = l.tier;
                quantities[idx] = l.quantity;
                prices[idx] = l.pricePerBlock;
                expiresAts[idx] = l.expiresAt;
                idx++;
            }
        }
    }
}

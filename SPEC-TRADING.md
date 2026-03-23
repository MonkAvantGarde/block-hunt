# SPEC: Block Trading — In-Game Marketplace

**Status:** Draft — awaiting review
**Date:** 2026-03-22
**Objective:** Enable localized P2P trading of blocks (ERC-1155 tokens) among Block Hunt players

---

## 1. Summary

Build an in-game marketplace where players can trade blocks with each other using two mechanisms:

1. **Fixed-Price Listings** — Seller lists N blocks of tier X at a set ETH price. Any buyer can fill the order.
2. **Time-Bound Auctions** — Seller lists N blocks of tier X with a minimum bid and a deadline. Highest bidder wins when the auction expires.

The marketplace is a **new standalone contract** — no changes to existing deployed contracts (Token, Treasury, Forge, etc.). It leverages ERC-1155's standard `setApprovalForAll` + `safeTransferFrom` for secure atomic swaps.

---

## 2. Why a Custom Marketplace (vs OpenSea)

| Feature | OpenSea | In-Game Marketplace |
|---------|---------|---------------------|
| UX | Leaves the game, separate app | Integrated in the Trade panel |
| Fees | 2.5% platform + royalties | Configurable (can be 0% or small fee to treasury) |
| Game context | No tier names, no progression data | Shows tier rarity, combine value, player rank |
| Auctions | Limited to Seaport mechanics | Custom time-bound bidding tuned for Block Hunt |
| Discovery | Mixed with millions of NFTs | Only Block Hunt blocks, filtered by tier |
| Subgraph integration | None | Can show seller's rank, tier scarcity, price history |

---

## 3. Contract: BlockHuntMarketplace.sol — NEW

### 3.1 Architecture

A single new contract that:
- Holds no tokens (non-custodial for listings, custodial for auctions)
- Uses ERC-1155 approval for fixed-price fills
- Escrows tokens only for auctions (to prevent seller from moving them during bidding)
- Charges a configurable protocol fee (sent to Treasury or creator wallet)
- Enforces ERC-2981 royalties on every trade

### 3.2 Data Structures

```solidity
// ── Fixed-Price Listing ──────────────────────────────────────────────
struct Listing {
    address seller;
    uint256 tier;           // token ID (2-7)
    uint256 quantity;       // how many blocks
    uint256 pricePerBlock;  // ETH per block (wei)
    uint256 createdAt;
    uint256 expiresAt;      // auto-expires (default 7 days from creation)
    bool    active;
}

// ── Time-Bound Auction ───────────────────────────────────────────────
struct Auction {
    address seller;
    uint256 tier;
    uint256 quantity;
    uint256 minBid;         // minimum total bid (wei)
    uint256 highestBid;     // current highest bid
    address highestBidder;
    uint256 startAt;
    uint256 endAt;          // deadline
    bool    settled;        // true after winner claims or seller reclaims
}
```

### 3.3 Core Functions — Fixed-Price

```solidity
/// @notice Create a fixed-price listing.
///         Seller must have called setApprovalForAll(marketplace, true) on Token.
/// @param tier Token tier (2-7)
/// @param quantity Number of blocks to sell
/// @param pricePerBlock Price per block in wei
/// @param duration Listing duration in seconds (default 7 days, max 30 days)
function createListing(
    uint256 tier,
    uint256 quantity,
    uint256 pricePerBlock,
    uint256 duration
) external returns (uint256 listingId);

/// @notice Buy blocks from a listing. Partial fills allowed.
/// @param listingId The listing to buy from
/// @param quantity Number of blocks to buy (can be less than listed)
function buyListing(
    uint256 listingId,
    uint256 quantity
) external payable;

/// @notice Cancel an active listing.
function cancelListing(uint256 listingId) external;
```

**Flow:**
1. Seller calls `Token.setApprovalForAll(marketplace, true)` (one-time)
2. Seller calls `marketplace.createListing(tier, qty, price, duration)`
3. Buyer calls `marketplace.buyListing(listingId, qty)` with ETH
4. Marketplace atomically: transfers ETH to seller (minus fees/royalties), transfers tokens to buyer via `safeTransferFrom`

**Non-custodial:** Tokens stay in seller's wallet until a buyer fills the order. If seller transfers tokens elsewhere, the fill will revert (insufficient balance).

### 3.4 Core Functions — Auctions

```solidity
/// @notice Create a time-bound auction.
///         Tokens are escrowed in the marketplace contract.
/// @param tier Token tier (2-7)
/// @param quantity Number of blocks
/// @param minBid Minimum bid in wei (total, not per block)
/// @param duration Auction duration in seconds
function createAuction(
    uint256 tier,
    uint256 quantity,
    uint256 minBid,
    uint256 duration
) external returns (uint256 auctionId);

/// @notice Place a bid on an auction. Must exceed current highest bid.
///         Previous highest bidder is automatically refunded.
function bid(uint256 auctionId) external payable;

/// @notice Settle a completed auction. Callable by anyone after endAt.
///         Transfers tokens to winner, ETH to seller (minus fees/royalties).
///         If no bids, returns tokens to seller.
function settleAuction(uint256 auctionId) external;

/// @notice Cancel an auction with no bids. Seller reclaims escrowed tokens.
function cancelAuction(uint256 auctionId) external;
```

**Flow:**
1. Seller calls `Token.setApprovalForAll(marketplace, true)` (one-time)
2. Seller calls `marketplace.createAuction(...)` — tokens transferred to marketplace (escrow)
3. Bidders call `marketplace.bid(auctionId)` with ETH — previous bidder auto-refunded
4. After `endAt`, anyone calls `settleAuction(auctionId)` — tokens to winner, ETH to seller
5. If no bids, seller calls `cancelAuction(auctionId)` to reclaim tokens

**Custodial for auctions only:** Tokens are escrowed to prevent the seller from transferring them during active bidding. ETH bids are also held in the contract until settlement.

### 3.5 Fee Structure

```solidity
uint256 public protocolFeeBps = 1000;  // 10% — configurable by owner
address public feeRecipient;          // Treasury or creator wallet

function setProtocolFee(uint256 bps) external onlyOwner;
function setFeeRecipient(address addr) external onlyOwner;
```

On every trade:
1. **ERC-2981 royalty** is queried from Token contract and paid to royalty receiver
2. **Protocol fee** (on remaining amount after royalty) is sent to `feeRecipient`
3. **Remainder** goes to seller

Example on a 0.01 ETH sale:
- Protocol fee (10%): 0.001 ETH → creator wallet
- Seller receives: 0.009 ETH

Note: ERC-2981 royalty and protocol fee share the same recipient (creator wallet), so they're effectively one 10% cut.

### 3.6 Safety Features

```solidity
// Minimum listing price (prevent dust spam)
uint256 public minListingPrice = 0.00001 ether;

// Maximum auction duration
uint256 public maxAuctionDuration = 7 days;

// Minimum auction duration
uint256 public minAuctionDuration = 1 hours;

// Bid increment (minimum % above previous bid)
uint256 public minBidIncrementBps = 500; // 5%

// All tiers allowed (1-7, including T1 Origin)
function _validateTier(uint256 tier) internal pure {
    require(tier >= 1 && tier <= 7, "Invalid tier");
}
```

### 3.7 View Functions (Frontend reads)

```solidity
// Get all active listings (paginated)
function getListings(uint256 offset, uint256 limit)
    external view returns (Listing[] memory);

// Get listings for a specific tier
function getListingsByTier(uint256 tier, uint256 offset, uint256 limit)
    external view returns (Listing[] memory);

// Get all active auctions (paginated)
function getAuctions(uint256 offset, uint256 limit)
    external view returns (Auction[] memory);

// Get a player's active listings
function getPlayerListings(address player)
    external view returns (uint256[] memory listingIds);

// Get a player's active bids
function getPlayerBids(address player)
    external view returns (uint256[] memory auctionIds);

// Listing/auction counts
function listingCount() external view returns (uint256);
function auctionCount() external view returns (uint256);
```

### 3.8 Events (for subgraph indexing)

```solidity
event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 tier, uint256 quantity, uint256 pricePerBlock);
event ListingFilled(uint256 indexed listingId, address indexed buyer, uint256 quantity, uint256 totalPaid);
event ListingCancelled(uint256 indexed listingId);

event AuctionCreated(uint256 indexed auctionId, address indexed seller, uint256 tier, uint256 quantity, uint256 minBid, uint256 endAt);
event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount);
event AuctionSettled(uint256 indexed auctionId, address indexed winner, uint256 amount);
event AuctionCancelled(uint256 indexed auctionId);
```

---

## 4. Impact on Existing Contracts

### Zero changes required

| Contract | Impact |
|----------|--------|
| BlockHuntToken | **None** — standard ERC-1155 `safeTransferFrom` and `setApprovalForAll` work out of the box. No custom transfer hooks. No overrides needed. |
| BlockHuntTreasury | **None** — marketplace has its own fee collection. Can optionally route fees to Treasury address. |
| BlockHuntForge | **None** |
| BlockHuntCountdown | **None** — transfers not restricted during countdown |
| BlockHuntMintWindow | **None** |
| BlockHuntEscrow | **None** |
| BlockHuntRewards | **None** |
| Subgraph | **Addition only** — new data source for marketplace events (optional for MVP) |

**Why this works:** BlockHuntToken has:
- No `_beforeTokenTransfer` or `_afterTokenTransfer` hooks
- No transfer restrictions or allowlists
- Standard ERC-1155 approval mechanics
- Pause only affects `mint()` and `combine()`, NOT transfers
- ERC-2981 royalty info queryable by marketplace

---

## 5. Frontend: TradePanel.jsx — REWRITE

### 5.1 Tabs

```
[ LISTINGS ]  [ AUCTIONS ]  [ MY TRADES ]
```

### 5.2 Listings Tab

**Filter bar:** Tier dropdown (All / T7 / T6 / T5 / T4 / T3 / T2) + Sort (Price low→high, Price high→low, Newest)

**Listing cards:**
```
┌─────────────────────────────────────┐
│ T6 × 50          SELLER: 0xab9..74b│
│ THE RESTLESS      Rank #4           │
│                                     │
│ 0.0003 Ξ each    Total: 0.015 Ξ    │
│                                     │
│ [  BUY 10  ] [  BUY ALL  ]         │
│                        expires 2h   │
└─────────────────────────────────────┘
```

**Create listing button:** Opens modal with tier selector, quantity, price per block, duration.

### 5.3 Auctions Tab

**Auction cards:**
```
┌─────────────────────────────────────┐
│ T4 × 5           SELLER: 0xff8..303│
│ THE ORDERED       Rank #1           │
│                                     │
│ Current bid: 0.02 Ξ   by 0xd38..332│
│ Min bid: 0.025 Ξ (5% increment)    │
│                                     │
│ [  PLACE BID  ]     ends in 4h 22m │
└─────────────────────────────────────┘
```

### 5.4 My Trades Tab

Shows:
- Your active listings (with cancel button)
- Your active bids (with current status)
- Your won auctions (with claim/settle button)
- Trade history (past fills and settlements)

### 5.5 Approval Flow

On first trade action, check `isApprovedForAll(user, marketplace)`. If not approved, show a one-time "APPROVE MARKETPLACE" button that calls `setApprovalForAll(marketplace, true)`.

---

## 6. Subgraph Extension (Optional for MVP)

Add a new data source for `BlockHuntMarketplace` events:
- Track listing/auction history
- Price history per tier (floor price, average sale price)
- Volume metrics (total traded per tier, per day)
- Player trade stats (for leaderboard/profile enrichment)

**Can be added later** — MVP can read directly from contract view functions.

---

## 7. Implementation Phases

### Phase 1: MVP — Fixed-Price Listings Only (Recommended Start)

**Scope:**
- `BlockHuntMarketplace.sol` with listing functions only (no auctions)
- Deploy script
- Frontend: TradePanel with listing/buy UI
- Approval flow

**Why start here:**
- Simpler contract (no escrow, no bid refunds, no settlement)
- Lower gas costs
- Immediate value — players can trade right away
- Auctions can be added in Phase 2 without contract changes (separate functions)

**Estimated files:**
| File | Action |
|------|--------|
| `src/BlockHuntMarketplace.sol` | New — listings only |
| `script/DeployMarketplace.s.sol` | New |
| `frontend/src/panels/TradePanel.jsx` | Rewrite |
| `frontend/src/abis/index.js` | Add MARKETPLACE_ABI |
| `frontend/src/config/wagmi.js` | Add MARKETPLACE address |
| `frontend/src/hooks/useTradeData.js` | New — read listings |

### Phase 2: Auctions

**Scope:**
- Add auction functions to marketplace contract (or deploy v2)
- Frontend: Auctions tab
- Bid/settle UI
- Timer components

### Phase 3: Subgraph + Analytics

**Scope:**
- Index marketplace events
- Price history charts
- Floor price per tier
- Trade volume metrics
- Player trade profiles

---

## 8. Key Design Decisions

### 8.1 Custodial vs Non-Custodial

| Approach | Listings | Auctions |
|----------|----------|----------|
| Non-custodial | Tokens stay in wallet until fill. Seller can move them (fill reverts). | Not safe — seller could move tokens during bidding. |
| Custodial | Tokens escrowed in contract. Guaranteed fill. | Required — tokens locked until auction ends. |

**Decision:** Non-custodial for listings (simpler, no gas for escrow). Custodial for auctions (necessary for bid integrity).

### 8.2 Partial Fills

Listings support partial fills — a buyer can buy 10 out of 50 listed blocks. The listing stays active with reduced quantity. This improves liquidity.

Auctions do NOT support partial fills — winner gets all or nothing.

### 8.3 Tier Restrictions

- **All tiers (1-7) are tradeable**, including T1 Origin.
- Marketplace validates tier (1-7) on listing/auction creation.

### 8.4 Price Discovery

The marketplace provides organic price discovery:
- Players can see what others are listing blocks for
- Auction mechanism finds fair market price for rare tiers
- Over time, floor prices establish per tier
- Combine ratios provide a "fundamental value" anchor (e.g., T6 is worth ~21 T7s via combine)

---

## 9. Gas Considerations

| Operation | Estimated Gas |
|-----------|---------------|
| Create listing | ~80k |
| Buy from listing | ~120k (includes safeTransferFrom + ETH transfers) |
| Cancel listing | ~30k |
| Create auction (with escrow) | ~130k |
| Place bid (with refund) | ~80k |
| Settle auction | ~130k |

All reasonable for Base L2 (sub-cent gas costs).

---

## 10. Security Considerations

| Risk | Mitigation |
|------|------------|
| Reentrancy on ETH transfers | `ReentrancyGuard` on all payable functions |
| Seller front-runs buyer by moving tokens | Non-custodial listings: fill reverts if seller has insufficient balance. Not a loss for buyer. |
| Bid griefing (place bid then revert on refund) | Use pull-payment pattern for bid refunds if needed. Or accept that Base L2 gas is cheap enough that this isn't economical. |
| Stale listings (seller no longer has tokens) | View functions check `balanceOf` before displaying. `buyListing` reverts gracefully. |
| Price manipulation | Minimum listing price prevents dust spam. Min bid increment prevents micro-bidding. |
| Approval scope | `setApprovalForAll` grants marketplace access to ALL tiers. Standard ERC-1155 pattern used by OpenSea. |

---

## 11. Decisions (Confirmed)

1. **Protocol fee:** 10% to creator wallet
2. **Fee recipient:** Creator wallet (same as mint royalty recipient)
3. **T1 (Origin):** Tradeable — all tiers 1-7 allowed on marketplace
4. **Listing expiry:** Seller sets a listing window. Default 7 days. Auto-expires when window ends. No indefinite listings.
5. **Trade during countdown:** No restrictions — holder can trade freely
6. **Auction minimum duration:** 1 hour minimum, 7 days maximum

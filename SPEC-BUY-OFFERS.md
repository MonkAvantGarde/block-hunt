# SPEC: Buy-Side Offers (Extension to BlockHuntMarketplace)

**Status:** Draft — awaiting review
**Date:** 2026-03-23

---

## 1. Summary

Add buy-side offers to the existing marketplace. A buyer posts "I want to buy N blocks of tier X at Y ETH each" with ETH escrowed in the contract. Any seller holding that tier can fill the offer instantly.

**Sell-side (existing):** Seller lists → Buyer fills with ETH → Tokens move to buyer
**Buy-side (new):** Buyer creates offer with ETH → Seller fills → Tokens move to buyer, ETH moves to seller

---

## 2. Contract Changes

### 2.1 New Data Structure (added to BlockHuntMarketplace.sol)

```solidity
struct Offer {
    address buyer;
    uint256 tier;           // wanted tier (1-7)
    uint256 quantity;       // how many blocks wanted
    uint256 pricePerBlock;  // ETH per block (wei) — escrowed
    uint256 createdAt;
    uint256 expiresAt;
    bool    active;
}

uint256 public nextOfferId = 1;
mapping(uint256 => Offer) public offers;
```

### 2.2 New Functions

```solidity
/// @notice Create a buy offer. ETH is escrowed in the contract.
/// @param tier Wanted tier (1-7)
/// @param quantity How many blocks to buy
/// @param pricePerBlock Price willing to pay per block (wei)
/// @param duration Offer duration in seconds (0 = default 7 days)
function createOffer(
    uint256 tier,
    uint256 quantity,
    uint256 pricePerBlock,
    uint256 duration
) external payable returns (uint256 offerId);
```

- Validates: tier 1-7, quantity > 0, pricePerBlock >= MIN_PRICE
- Requires: `msg.value >= pricePerBlock * quantity` (exact amount escrowed)
- Refunds excess ETH if overpaid
- Duration: same constraints as listings (min 1h, max 30 days, default 7 days)

```solidity
/// @notice Seller fills a buy offer. Partial fills allowed.
/// @param offerId The offer to fill
/// @param quantity How many blocks to sell (can be less than offered)
function fillOffer(uint256 offerId, uint256 quantity) external nonReentrant;
```

- Validates: offer active, not expired, quantity valid
- Requires: seller has enough tokens + marketplace approved
- Transfers tokens from seller to buyer via `safeTransferFrom`
- Distributes ETH: 10% fee to feeRecipient, 90% to seller
- Partial fills: offer stays active with reduced quantity and reduced escrowed ETH
- When fully filled: `active = false`

```solidity
/// @notice Cancel an active offer. Remaining escrowed ETH returned to buyer.
function cancelOffer(uint256 offerId) external;
```

- Only callable by offer creator
- Returns all remaining escrowed ETH to buyer
- Sets `active = false`

```solidity
/// @notice View: get active offers (paginated)
function getActiveOffers(uint256 offset, uint256 limit) external view returns (
    uint256[] memory ids,
    address[] memory buyers,
    uint256[] memory tiers,
    uint256[] memory quantities,
    uint256[] memory prices,
    uint256[] memory expiresAts
);

/// @notice View: get single offer
function getOffer(uint256 offerId) external view returns (
    address buyer, uint256 tier, uint256 quantity,
    uint256 pricePerBlock, uint256 createdAt, uint256 expiresAt, bool active
);
```

### 2.3 New Events

```solidity
event OfferCreated(uint256 indexed offerId, address indexed buyer, uint256 tier, uint256 quantity, uint256 pricePerBlock, uint256 expiresAt);
event OfferFilled(uint256 indexed offerId, address indexed seller, uint256 quantity, uint256 totalPaid);
event OfferCancelled(uint256 indexed offerId, uint256 ethReturned);
```

### 2.4 ETH Tracking

The contract needs to track how much ETH is escrowed per offer for partial fill accounting:

```solidity
// No separate tracking needed — computed from offer.pricePerBlock * offer.quantity
// On partial fill: quantity decreases, so remaining escrow = pricePerBlock * remaining quantity
// On cancel: refund = pricePerBlock * remaining quantity
```

No extra storage needed — the escrowed amount is always `offer.pricePerBlock * offer.quantity`.

### 2.5 Fee Structure

Same as sell-side listings: flat 10% of the fill amount.

On a fill of 10 blocks at 0.03 ETH each (0.3 ETH total):
- Fee (10%): 0.03 ETH → feeRecipient
- Seller receives: 0.27 ETH
- From the buyer's escrowed 0.3 ETH

### 2.6 Edge Cases

| Scenario | Behavior |
|----------|----------|
| Offer expires with ETH still escrowed | Buyer calls `cancelOffer()` to reclaim. `fillOffer` reverts with "Offer expired". ETH is safe — never lost. |
| Partial fill then cancel | Buyer gets refund of remaining `pricePerBlock * remainingQuantity` |
| Buyer creates offer, then seller fills with marketplace not approved | `fillOffer` reverts — seller must approve marketplace first |
| Buyer overpays on `createOffer` | Excess refunded immediately in `createOffer` |

---

## 3. Deployment

**Option A (recommended): Redeploy marketplace with offers included.**
- The current marketplace is fresh (just deployed, few/no active listings).
- Simpler than upgrading — one contract with both listings and offers.
- Re-wire frontend to new address.
- Existing listings would be lost (acceptable if few/none).

**Option B: Deploy a separate OfferBook contract.**
- Keeps existing marketplace untouched.
- Adds a second contract address to manage.
- More complexity in frontend (two contract addresses).

**Recommendation:** Option A — redeploy the full marketplace with offers added. It's early enough that there's no meaningful listing history to preserve.

---

## 4. Frontend Changes

### 4.1 TradePanel.jsx — Add OFFERS tab

Tabs become: `[ LISTINGS ] [ OFFERS ] [ MY TRADES ] [ CREATE ]`

### 4.2 Offers Tab

Shows all active buy offers from other players. Each offer card:

```
┌────────────────────────────────────────────────┐
│ T4  WANTED ×5   0.03000 Ξ each   0xab9..74b   │
│                               [SELL 1] [+][-]  │
└────────────────────────────────────────────────┘
```

- Compact single-row like listings
- "SELL" button (instead of "BUY") — fills the offer
- Seller needs marketplace approval (same flow as listings)
- Quantity stepper for partial fills

### 4.3 Create Tab — Add offer creation

Toggle at top of Create tab: `[ SELL LISTING ] [ BUY OFFER ]`

When "BUY OFFER" is selected:
- Tier selector (same as listing)
- Quantity input
- Price per block input
- Summary shows total ETH that will be escrowed
- "CREATE OFFER · ESCROW X.XXXXX ETH" button

### 4.4 My Trades Tab

Add "MY OFFERS" section showing buyer's active offers with cancel button.

### 4.5 useTradeData.js

Add `getActiveOffers` read and parse offers alongside listings.

### 4.6 abis/index.js

Add `createOffer`, `fillOffer`, `cancelOffer`, `getOffer`, `getActiveOffers` to MARKETPLACE_ABI.

---

## 5. Tests (additions to BlockHuntMarketplace.t.sol)

- `test_createOffer` — buyer escrows ETH, offer stored correctly
- `test_fillOfferFull` — seller fills, tokens transfer, ETH distributed (90% seller, 10% fee)
- `test_fillOfferPartial` — partial fill, offer stays active with reduced quantity
- `test_cancelOffer` — buyer reclaims remaining ETH
- `test_revert_fillExpiredOffer` — expired offer can't be filled
- `test_revert_fillInsufficientTokens` — seller doesn't have enough blocks
- `test_revert_fillNotApproved` — seller hasn't approved marketplace
- `test_revert_cancelNotBuyer` — only offer creator can cancel
- `test_excessRefundOnCreate` — overpayment refunded on offer creation

---

## 6. Files Changed

| File | Action |
|------|--------|
| `src/BlockHuntMarketplace.sol` | Add Offer struct, createOffer, fillOffer, cancelOffer, getActiveOffers, getOffer |
| `test/BlockHuntMarketplace.t.sol` | Add 9 offer tests |
| `script/DeployMarketplace.s.sol` | No change (same deploy, new contract code) |
| `frontend/src/abis/index.js` | Add offer functions to MARKETPLACE_ABI |
| `frontend/src/hooks/useTradeData.js` | Add offers read + parsing |
| `frontend/src/panels/TradePanel.jsx` | Add OFFERS tab, buy offer creation toggle, fill/cancel UI |
| `frontend/src/config/wagmi.js` | Update MARKETPLACE address after redeploy |

**No existing contracts modified.** Token, Treasury, Forge, etc. all untouched.

---

## 7. Security

| Risk | Mitigation |
|------|------------|
| Escrowed ETH stuck if buyer disappears | Buyer can always `cancelOffer()` to reclaim. No admin intervention needed. |
| Reentrancy on fillOffer | `nonReentrant` modifier |
| Seller front-runs by revoking approval | `fillOffer` reverts cleanly — no ETH lost, offer stays active |
| Offer created with 0 ETH | `require(msg.value >= pricePerBlock * quantity)` |
| Expired offers with stuck ETH | `cancelOffer` works on expired offers — buyer can always reclaim |

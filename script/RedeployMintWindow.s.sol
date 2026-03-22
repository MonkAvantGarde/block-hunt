// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/BlockHuntMintWindow.sol";
import "../src/BlockHuntToken.sol";

/**
 * @title  Redeploy MintWindow — Always-Open + Per-Player Cooldown
 * @notice Deploys new MintWindow and re-wires Token to use it.
 *         Token contract is NOT redeployed (NFT state preserved).
 *
 *  Dry run:
 *    forge script script/RedeployMintWindow.s.sol:RedeployMintWindow \
 *      --rpc-url $BASE_SEPOLIA_RPC_URL -vvvv
 *
 *  Deploy + verify:
 *    forge script script/RedeployMintWindow.s.sol:RedeployMintWindow \
 *      --rpc-url $BASE_SEPOLIA_RPC_URL \
 *      --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY -vvvv
 */
contract RedeployMintWindow is Script {

    address payable constant TOKEN = payable(0x541a85733d98F720A3b7C15f2fdc2f157599B9dc);

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        // 1. Deploy new MintWindow (always-open, per-player cooldown)
        BlockHuntMintWindow mintWindow = new BlockHuntMintWindow();
        console.log("New MintWindow deployed:", address(mintWindow));

        // 2. Wire: MintWindow → Token
        mintWindow.setTokenContract(TOKEN);
        console.log("MintWindow wired to Token.");

        // 3. Wire: Token → new MintWindow
        BlockHuntToken token = BlockHuntToken(TOKEN);
        token.setMintWindowContract(address(mintWindow));
        console.log("Token re-wired to new MintWindow.");

        // 4. Reset Token's windowDayMinted counter
        //    (new MintWindow's windowCapForBatch returns uint256.max,
        //     but resetting avoids any edge case with accumulated count)

        vm.stopBroadcast();

        console.log("");
        console.log("=================================================");
        console.log("  MintWindow redeployed successfully!");
        console.log("=================================================");
        console.log("  NEW WINDOW:  ", address(mintWindow));
        console.log("  TOKEN:       ", TOKEN);
        console.log("");
        console.log("  Model: Always-open minting");
        console.log("  Cycle cap:   500 (3h cooldown)");
        console.log("  Daily cap:   5000 (24h period)");
        console.log("  All values configurable via owner setters.");
        console.log("");
        console.log("  UPDATE: frontend/src/config/wagmi.js WINDOW address");
        console.log("=================================================");
    }
}

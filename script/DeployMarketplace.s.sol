// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/BlockHuntMarketplace.sol";

/**
 * @title  Deploy BlockHuntMarketplace
 *
 *  Dry run:
 *    forge script script/DeployMarketplace.s.sol:DeployMarketplace \
 *      --rpc-url $BASE_SEPOLIA_RPC_URL -vvvv
 *
 *  Deploy + verify:
 *    forge script script/DeployMarketplace.s.sol:DeployMarketplace \
 *      --rpc-url $BASE_SEPOLIA_RPC_URL \
 *      --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY -vvvv
 */
contract DeployMarketplace is Script {

    address constant TOKEN = 0x541a85733d98F720A3b7C15f2fdc2f157599B9dc;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("=================================================");
        console.log("  Block Hunt - Deploy Marketplace");
        console.log("=================================================");
        console.log("  Deployer:       ", deployer);
        console.log("  Token:          ", TOKEN);
        console.log("  Fee recipient:  ", deployer);
        console.log("-------------------------------------------------");

        vm.startBroadcast(deployerKey);

        BlockHuntMarketplace marketplace = new BlockHuntMarketplace(TOKEN, deployer);
        console.log("Marketplace deployed:", address(marketplace));

        vm.stopBroadcast();

        console.log("");
        console.log("=================================================");
        console.log("  MARKETPLACE:  ", address(marketplace));
        console.log("  Fee:           10% (1000 bps)");
        console.log("  Fee recipient: ", deployer);
        console.log("");
        console.log("  UPDATE: frontend/src/config/wagmi.js");
        console.log("    MARKETPLACE: '", address(marketplace), "'");
        console.log("=================================================");
    }
}

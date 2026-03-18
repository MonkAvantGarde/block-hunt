// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/BlockHuntRewards.sol";

contract DeployRewards is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        BlockHuntRewards rewards = new BlockHuntRewards();

        console.log("BlockHuntRewards deployed at:", address(rewards));

        vm.stopBroadcast();
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IBlockHuntTokenForge {
    function executeForge(address player, uint256 fromTier, uint256 burnCount, bool success) external;
    function balanceOf(address account, uint256 id) external view returns (uint256);
}

contract BlockHuntForge is Ownable, ReentrancyGuard {

    address public tokenContract;
    bool public vrfEnabled;
    uint256 public forgeFee = 0;
    uint256 public requestNonce;

    struct ForgeRequest {
        address player;
        uint256 fromTier;
        uint256 burnCount;
        bool resolved;
    }

    mapping(uint256 => ForgeRequest) public forgeRequests;

    event ForgeRequested(uint256 indexed requestId, address indexed player, uint256 fromTier, uint256 burnCount);
    event ForgeResolved(uint256 indexed requestId, address indexed player, uint256 fromTier, bool success);

    constructor() Ownable(msg.sender) {}

    function setTokenContract(address addr) external onlyOwner { tokenContract = addr; }
    function setForgeFee(uint256 fee) external onlyOwner { forgeFee = fee; }
    function setVrfEnabled(bool enabled) external onlyOwner { vrfEnabled = enabled; }

    function forge(uint256 fromTier, uint256 burnCount) external payable nonReentrant {
        require(tokenContract != address(0), "Token contract not set");
        require(fromTier >= 2 && fromTier <= 7, "Invalid tier");
        require(burnCount >= 10 && burnCount <= 99, "Burn count must be 10-99");
        require(msg.value >= forgeFee, "Insufficient forge fee");
        require(
            IBlockHuntTokenForge(tokenContract).balanceOf(msg.sender, fromTier) >= burnCount,
            "Insufficient blocks"
        );

        requestNonce++;

        forgeRequests[requestNonce] = ForgeRequest({
            player: msg.sender,
            fromTier: fromTier,
            burnCount: burnCount,
            resolved: false
        });

        bool success = _pseudoRandom(msg.sender, fromTier, burnCount, requestNonce) < burnCount;
        forgeRequests[requestNonce].resolved = true;

        IBlockHuntTokenForge(tokenContract).executeForge(
            msg.sender,
            fromTier,
            burnCount,
            success
        );

        emit ForgeRequested(requestNonce, msg.sender, fromTier, burnCount);
        emit ForgeResolved(requestNonce, msg.sender, fromTier, success);
    }

    function _pseudoRandom(
        address player,
        uint256 fromTier,
        uint256 burnCount,
        uint256 nonce
    ) internal view returns (uint256) {
        return uint256(keccak256(abi.encodePacked(
            block.prevrandao,
            block.timestamp,
            player,
            fromTier,
            burnCount,
            nonce
        ))) % 100;
    }

    function withdrawFees(address to) external onlyOwner {
        (bool sent, ) = payable(to).call{value: address(this).balance}("");
        require(sent, "Transfer failed");
    }

    receive() external payable {}
}
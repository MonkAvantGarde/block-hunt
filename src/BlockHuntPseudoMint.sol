// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITokenForPseudo {
    function pseudoMintCallback(
        address player,
        uint256 seed,
        uint256 totalCost,
        uint256 allocated
    ) external payable;
}

contract BlockHuntPseudoMint {
    address public tokenContract;
    uint256 private _nonce;

    constructor(address _token) {
        tokenContract = _token;
    }

    function execute(address player, uint256 allocated, uint256 totalCost) external payable {
        require(msg.sender == tokenContract, "Only token");

        _nonce++;
        uint256 seed = uint256(keccak256(abi.encodePacked(
            block.prevrandao, block.timestamp, player, _nonce
        )));

        ITokenForPseudo(tokenContract).pseudoMintCallback{value: msg.value}(
            player, seed, totalCost, allocated
        );
    }
}

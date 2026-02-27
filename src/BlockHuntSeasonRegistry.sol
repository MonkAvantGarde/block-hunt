// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract BlockHuntSeasonRegistry is Ownable {

    struct SeasonContracts {
        address treasury;
        address token;
        address mintWindow;
        address forge;
        address migration;
    }

    struct SeasonState {
        bool    registered;
        bool    launched;
        bool    ended;
        uint256 registeredAt;
        uint256 launchedAt;
        uint256 endedAt;
    }

    struct SeasonOutcome {
        address winner;
        bool    wasSacrifice;
        uint256 finalTreasury;
        uint256 seedToNextSeason;
    }

    mapping(uint256 => SeasonContracts) public seasonContracts;
    mapping(uint256 => SeasonState)     public seasonState;
    mapping(uint256 => SeasonOutcome)   public seasonOutcome;

    uint256 public currentSeason;
    uint256 public totalSeasons;

    event SeasonRegistered(uint256 indexed seasonNumber, address treasury, address token);
    event SeasonLaunched(uint256 indexed seasonNumber, uint256 launchedAt);
    event SeasonEnded(uint256 indexed seasonNumber, address winner, bool wasSacrifice, uint256 finalTreasury);
    event SeedTransferLogged(uint256 indexed fromSeason, uint256 indexed toSeason, uint256 amount);

    constructor() Ownable(msg.sender) {}

    function registerSeason(
        uint256 seasonNumber,
        address treasury,
        address token,
        address mintWindow,
        address forge
    ) external onlyOwner {
        require(seasonNumber > 0, "Season must be > 0");
        require(!seasonState[seasonNumber].registered, "Already registered");
        require(treasury   != address(0), "Treasury required");
        require(token      != address(0), "Token required");
        require(mintWindow != address(0), "MintWindow required");
        require(forge      != address(0), "Forge required");

        if (totalSeasons > 0) {
            require(seasonNumber == totalSeasons + 1, "Register in order");
        } else {
            require(seasonNumber == 1, "First season must be 1");
        }

        seasonContracts[seasonNumber] = SeasonContracts({
            treasury:   treasury,
            token:      token,
            mintWindow: mintWindow,
            forge:      forge,
            migration:  address(0)
        });

        seasonState[seasonNumber] = SeasonState({
            registered:   true,
            launched:     false,
            ended:        false,
            registeredAt: block.timestamp,
            launchedAt:   0,
            endedAt:      0
        });

        totalSeasons++;

        emit SeasonRegistered(seasonNumber, treasury, token);
    }

    function setSeasonMigration(uint256 seasonNumber, address migration) external onlyOwner {
        require(seasonState[seasonNumber].registered, "Season not registered");
        require(migration != address(0), "Migration required");
        seasonContracts[seasonNumber].migration = migration;
    }

    function markSeasonLaunched(uint256 seasonNumber) external onlyOwner {
        require(seasonState[seasonNumber].registered, "Not registered");
        require(!seasonState[seasonNumber].launched,  "Already launched");
        seasonState[seasonNumber].launched   = true;
        seasonState[seasonNumber].launchedAt = block.timestamp;
        currentSeason = seasonNumber;
        emit SeasonLaunched(seasonNumber, block.timestamp);
    }

    function markSeasonEnded(
        uint256 seasonNumber,
        address winner,
        bool    wasSacrifice,
        uint256 finalTreasury,
        uint256 seedAmount
    ) external onlyOwner {
        require(seasonState[seasonNumber].launched, "Not launched");
        require(!seasonState[seasonNumber].ended,   "Already ended");
        seasonState[seasonNumber].ended   = true;
        seasonState[seasonNumber].endedAt = block.timestamp;
        seasonOutcome[seasonNumber] = SeasonOutcome({
            winner:           winner,
            wasSacrifice:     wasSacrifice,
            finalTreasury:    finalTreasury,
            seedToNextSeason: seedAmount
        });
        emit SeasonEnded(seasonNumber, winner, wasSacrifice, finalTreasury);
    }

    function getAuthorisedSeedDestination(uint256 fromSeason) external view returns (address) {
        require(seasonState[fromSeason].ended,          "Season not ended");
        require(seasonOutcome[fromSeason].wasSacrifice, "Not a sacrifice");
        uint256 toSeason = fromSeason + 1;
        require(seasonState[toSeason].registered,       "Next season not registered");
        return seasonContracts[toSeason].treasury;
    }

    function logSeedTransfer(uint256 fromSeason, uint256 toSeason, uint256 amount) external {
        require(msg.sender == seasonContracts[fromSeason].treasury, "Only from-season treasury");
        require(seasonState[toSeason].registered, "To season not registered");
        emit SeedTransferLogged(fromSeason, toSeason, amount);
    }

    function getNextSeasonTreasury(uint256 currentSeasonNumber) external view returns (address) {
        uint256 next = currentSeasonNumber + 1;
        require(seasonState[next].registered, "Next season not registered");
        return seasonContracts[next].treasury;
    }

    function isRegisteredTreasury(address addr) external view returns (bool) {
        for (uint256 i = 1; i <= totalSeasons; i++) {
            if (seasonContracts[i].treasury == addr) return true;
        }
        return false;
    }

    function getCurrentSeason() external view returns (uint256) {
        return currentSeason;
    }
}

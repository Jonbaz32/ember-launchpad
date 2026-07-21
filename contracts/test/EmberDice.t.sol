// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EmberDice} from "../src/EmberDice.sol";

contract EmberDiceTest is Test {
    EmberDice public dice;
    address public owner = address(0x111);
    address public player = address(0x222);

    function setUp() public {
        vm.startPrank(owner);
        dice = new EmberDice();
        vm.stopPrank();

        // Seed bankroll liquidity to the contract
        vm.deal(owner, 10 ether);
        vm.prank(owner);
        dice.depositBankroll{value: 5 ether}();

        // Seed player balance
        vm.deal(player, 2 ether);
    }

    function test_InitialState() public view {
        assertEq(dice.owner(), owner);
        assertEq(dice.houseEdgeBps(), 100);
        assertEq(dice.minWagerLimit(), 0.001 ether);
        assertEq(dice.maxWagerLimit(), 0.5 ether);
        assertEq(address(dice).balance, 5 ether);
    }

    function test_DepositBankroll() public {
        uint256 startBalance = address(dice).balance;
        vm.deal(owner, 1 ether);
        vm.prank(owner);
        dice.depositBankroll{value: 1 ether}();
        assertEq(address(dice).balance, startBalance + 1 ether);
    }

    function test_CalculateMultiplier() public view {
        // Under target 5000 (50.00% win chance)
        // multiplier = 99.00% / 50.00% = 1.98x
        uint256 mult = dice.calculateMultiplier(5000, true);
        assertEq(mult, 1.98 * 1e18);

        // Over target 7000 (win chance = 9999 - 7000 = 2999 = 29.99%)
        // multiplier = 99.00% / 29.99% = 3.3011...x
        uint256 multOver = dice.calculateMultiplier(7000, false);
        assertEq(multOver, (9900 * 1e18) / 2999);
    }

    function test_Roll_InvalidLimits() public {
        // Below min limit (0.0005 ETH)
        vm.prank(player);
        vm.expectRevert("wager below minimum");
        dice.roll{value: 0.0005 ether}(5000, true);

        // Above max limit (0.6 ETH)
        vm.prank(player);
        vm.expectRevert("wager exceeds maximum");
        dice.roll{value: 0.6 ether}(5000, true);

        // Invalid roll target (0 or >= 10000)
        vm.prank(player);
        vm.expectRevert("invalid roll target"); // from calculateMultiplier
        dice.roll{value: 0.1 ether}(0, true);
    }

    function test_Roll_WinningAndLosing() public {
        // Simulate a few rolls with player account
        vm.startPrank(player);
        
        // Target 9800 under (98% win probability)
        // Multiplier: 99% / 98% = 1.0102x
        // We do this to ensure high win probability
        for (uint256 i = 0; i < 5; i++) {
            // Predict outcome by setting block hashes or just playing
            uint256 playerBalBefore = player.balance;
            uint256 contractBalBefore = address(dice).balance;
            uint256 bet = 0.05 ether;
            
            (uint256 rollResult, bool won, uint256 payout) = dice.roll{value: bet}(9800, true);
            
            if (won) {
                assertEq(rollResult < 9800, true);
                assertEq(player.balance, playerBalBefore - bet + payout);
                assertEq(address(dice).balance, contractBalBefore + bet - payout);
            } else {
                assertEq(rollResult >= 9800, true);
                assertEq(player.balance, playerBalBefore - bet);
                assertEq(address(dice).balance, contractBalBefore + bet);
            }
        }
        vm.stopPrank();
    }

    function test_WithdrawBankroll() public {
        uint256 initialOwnerBalance = owner.balance;
        uint256 contractBalance = address(dice).balance;

        vm.prank(owner);
        dice.withdrawBankroll(2 ether);

        assertEq(address(dice).balance, contractBalance - 2 ether);
        assertEq(owner.balance, initialOwnerBalance + 2 ether);

        // Non-owner withdraw should fail
        vm.prank(player);
        vm.expectRevert();
        dice.withdrawBankroll(1 ether);
    }
}

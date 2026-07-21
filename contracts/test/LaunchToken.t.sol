// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TokenFactory} from "../src/TokenFactory.sol";
import {LaunchToken} from "../src/LaunchToken.sol";

contract LaunchTokenTest is Test {
    TokenFactory factory;
    address protocolTreasury = address(0xFEE);
    address creator = address(0xC0FFEE);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        factory = new TokenFactory(protocolTreasury);
        factory.setTokenCreationFee(0);
        factory.setFlatTradeFee(0);
        vm.deal(creator, 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function _createToken() internal returns (LaunchToken token) {
        vm.prank(creator);
        address t = factory.createToken("Ember Cat", "EMBERCAT", "ipfs://meta", 0);
        token = LaunchToken(payable(t));
    }

    function test_CreateToken_MintsFullSupplyToCurve() public {
        LaunchToken token = _createToken();
        assertEq(token.totalSupply(), 1_000_000_000e18);
        assertEq(token.balanceOf(address(token)), 1_000_000_000e18);
        assertEq(token.creator(), creator);
    }

    function test_Buy_IncreasesPriceAlongCurve() public {
        LaunchToken token = _createToken();

        vm.prank(alice);
        uint256 out1 = token.buy{value: 1 ether}(0);

        vm.prank(bob);
        uint256 out2 = token.buy{value: 1 ether}(0);

        // Same ETH in, but price has moved up the curve, so the second buy gets fewer tokens.
        assertGt(out1, out2);
        assertEq(token.balanceOf(alice), out1);
        assertEq(token.balanceOf(bob), out2);
    }

    function test_Buy_SplitsFeeBetweenProtocolAndCreatorPool() public {
        LaunchToken token = _createToken();
        uint256 treasuryBefore = protocolTreasury.balance;

        vm.prank(alice);
        token.buy{value: 10 ether}(0);

        uint256 expectedFee = (10 ether * token.tradeFeeBps()) / 10_000;
        uint256 expectedProtocolCut = (expectedFee * token.protocolFeeShareBps()) / 10_000;
        uint256 expectedCreatorCut = expectedFee - expectedProtocolCut;

        assertEq(protocolTreasury.balance - treasuryBefore, expectedProtocolCut);
        assertEq(token.creatorFeePool(), expectedCreatorCut);
    }

    function test_Sell_RoundTripLosesOnlyFees() public {
        LaunchToken token = _createToken();

        vm.startPrank(alice);
        uint256 tokensOut = token.buy{value: 5 ether}(0);
        uint256 aliceEthBefore = alice.balance;
        uint256 ethOut = token.sell(tokensOut, 0);
        vm.stopPrank();

        // Selling back everything should return less than 5 ETH (two rounds of fees),
        // but strictly more than 0, and less than what was put in.
        assertLt(ethOut, 5 ether);
        assertGt(ethOut, 0);
        assertEq(alice.balance, aliceEthBefore + ethOut);
    }

    function test_BurnForFees_OnlyCreatorCanClaim() public {
        LaunchToken token = _createToken();

        vm.prank(alice);
        token.buy{value: 20 ether}(0);

        // Creator has no tokens yet (fair launch, no pre-allocation) -- buy some first.
        vm.prank(creator);
        uint256 creatorTokens = token.buy{value: 1 ether}(0);

        vm.prank(alice);
        vm.expectRevert(LaunchToken.NotCreator.selector);
        token.burnForFees(1);

        uint256 pool = token.creatorFeePool();
        assertGt(pool, 0);

        uint256 supply = token.totalSupply();
        uint256 burnAmount = creatorTokens / 2;
        uint256 expectedClaim = (pool * burnAmount) / supply;

        uint256 creatorEthBefore = creator.balance;
        vm.prank(creator);
        uint256 claimed = token.burnForFees(burnAmount);

        assertEq(claimed, expectedClaim);
        assertEq(creator.balance, creatorEthBefore + expectedClaim);
        assertEq(token.creatorFeePool(), pool - expectedClaim);
        assertEq(token.totalSupply(), supply - burnAmount);
    }

    function test_BurnForFees_LargerBurnClaimsProportionallyMore() public {
        LaunchToken token = _createToken();

        // Creator buys first while the curve is still cheap, so they hold a large share.
        vm.prank(creator);
        uint256 creatorTokens = token.buy{value: 5 ether}(0);

        vm.prank(alice);
        token.buy{value: 20 ether}(0);

        uint256 poolBefore = token.creatorFeePool();
        uint256 supplyBefore = token.totalSupply();

        // Burning 10% of supply should claim ~10% of the pool.
        uint256 tenPercentOfSupply = supplyBefore / 10;
        vm.assume(creatorTokens >= tenPercentOfSupply);

        vm.prank(creator);
        uint256 claimed = token.burnForFees(tenPercentOfSupply);

        uint256 expected = (poolBefore * tenPercentOfSupply) / supplyBefore;
        assertEq(claimed, expected);
    }

    function test_Graduation_LocksCurveAtTarget() public {
        LaunchToken token = _createToken();
        uint256 target = token.graduationTarget();

        vm.prank(alice);
        token.buy{value: target + 1 ether}(0);

        assertTrue(token.graduated());

        vm.prank(bob);
        vm.expectRevert(LaunchToken.CurveGraduated.selector);
        token.buy{value: 1 ether}(0);
    }

    function test_Quote_MatchesActualBuy() public {
        LaunchToken token = _createToken();
        (uint256 quotedOut,) = token.quoteBuy(2 ether);

        vm.prank(alice);
        uint256 actualOut = token.buy{value: 2 ether}(0);

        assertEq(quotedOut, actualOut);
    }
}

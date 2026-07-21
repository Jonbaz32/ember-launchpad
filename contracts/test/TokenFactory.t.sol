// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TokenFactory} from "../src/TokenFactory.sol";
import {LaunchToken} from "../src/LaunchToken.sol";

contract TokenFactoryTest is Test {
    TokenFactory factory;
    address treasury = address(0xFEE);
    address creator = address(0xC0FFEE);

    function setUp() public {
        factory = new TokenFactory(treasury);
        factory.setTokenCreationFee(0);
        factory.setFlatTradeFee(0);
        vm.deal(creator, 10 ether);
    }

    function test_CreateToken_BootstrapBuyCreditsCreator() public {
        vm.prank(creator);
        address t = factory.createToken{value: 1 ether}("Ember Cat", "EMBERCAT", "ipfs://meta", 0);
        LaunchToken token = LaunchToken(payable(t));

        // The creator, not the factory, should hold the purchased tokens.
        assertGt(token.balanceOf(creator), 0);
        assertEq(token.balanceOf(address(factory)), 0);
    }

    function test_CreateToken_ZeroValueDeploysWithoutBuying() public {
        vm.prank(creator);
        address t = factory.createToken("No Buy", "NOBUY", "ipfs://meta", 0);
        LaunchToken token = LaunchToken(payable(t));
        assertEq(token.balanceOf(creator), 0);
        assertEq(token.balanceOf(address(token)), token.TOTAL_SUPPLY());
    }

    function test_AllTokensTracking() public {
        vm.startPrank(creator);
        factory.createToken("A", "A", "", 0);
        factory.createToken("B", "B", "", 0);
        vm.stopPrank();

        assertEq(factory.allTokensLength(), 2);
        uint256[] memory idx = factory.getTokensByCreator(creator);
        assertEq(idx.length, 2);
    }

    function test_OnlyOwnerCanUpdateConfig() public {
        vm.prank(creator);
        vm.expectRevert();
        factory.setTradeFeeBps(200);

        factory.setTradeFeeBps(200); // called by test contract, which is the owner
        assertEq(factory.tradeFeeBps(), 200);
    }

    function test_TradeFeeBps_CannotExceedCeiling() public {
        uint256 tooHigh = factory.MAX_TRADE_FEE_BPS() + 1;
        vm.expectRevert("fee too high");
        factory.setTradeFeeBps(tooHigh);
    }
}

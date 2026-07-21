import TokenFactoryAbi from "../abi/TokenFactory.json";
import LaunchTokenAbi from "../abi/LaunchToken.json";
import BridgeGatewayAbi from "../abi/BridgeGateway.json";
import EmberDiceAbi from "../abi/EmberDice.json";

/// Set after deploying TokenFactory (see contracts/script/Deploy.s.sol).
/// Populate via .env as VITE_FACTORY_ADDRESS, or hardcode post-deploy.
export const FACTORY_ADDRESS = (import.meta.env.VITE_FACTORY_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const PROTOCOL_FEE_RECIPIENT = (import.meta.env.VITE_PROTOCOL_FEE_RECIPIENT ||
  "0x415e16Ad0Cd00485a7479B0a31b862c5ba27222A") as `0x${string}`;

export const DICE_VAULT_ADDRESS = (import.meta.env.VITE_DICE_VAULT_ADDRESS ||
  "0x415e16Ad0Cd00485a7479B0a31b862c5ba27222A") as `0x${string}`;

export const DICE_ADDRESS = (import.meta.env.VITE_DICE_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const L1_BRIDGE_ADDRESS = (import.meta.env.VITE_L1_BRIDGE_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const L2_BRIDGE_ADDRESS = (import.meta.env.VITE_L2_BRIDGE_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const factoryAbi = TokenFactoryAbi;
export const launchTokenAbi = LaunchTokenAbi;
export const bridgeGatewayAbi = BridgeGatewayAbi;
export const emberDiceAbi = EmberDiceAbi;

export const INDEXER_URL = import.meta.env.VITE_INDEXER_URL || "http://localhost:8787";

import { defineChain } from "viem";

/// Robinhood Chain mainnet — chain id 4663, Arbitrum-based L2, ETH gas token.
/// Public RPC is rate-limited; swap in an Alchemy/QuickNode/etc endpoint for production
/// via VITE_RH_MAINNET_RPC. See docs.robinhood.com/chain/connecting.
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [import.meta.env.VITE_RH_MAINNET_RPC || "https://rpc.mainnet.chain.robinhood.com"],
      webSocket: ["wss://feed.mainnet.chain.robinhood.com"],
    },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
});

/// Robinhood Chain testnet — chain id 46630. Use this while developing; get testnet ETH
/// from faucet.testnet.chain.robinhood.com.
export const robinhoodChainTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [import.meta.env.VITE_RH_TESTNET_RPC || "https://rpc.testnet.chain.robinhood.com"],
      webSocket: ["wss://feed.testnet.chain.robinhood.com"],
    },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://explorer.testnet.chain.robinhood.com" },
  },
  testnet: true,
});

/// DeBank Chain L2 — chain id 20231, EVM L2 built for social Web3 & DeBank ecosystem.
export const debankChain = defineChain({
  id: 20231,
  name: "DeBank Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.debankchain.com"],
    },
  },
  blockExplorers: {
    default: { name: "DeBank Explorer", url: "https://explorer.debankchain.com" },
  },
});

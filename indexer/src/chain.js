import { createPublicClient, http, defineChain } from "viem";
import "dotenv/config";

const useTestnet = process.env.USE_TESTNET === "true";

const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RH_MAINNET_RPC || "https://rpc.mainnet.chain.robinhood.com"] } },
});

const robinhoodChainTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RH_TESTNET_RPC || "https://rpc.testnet.chain.robinhood.com"] } },
  testnet: true,
});

export const chain = useTestnet ? robinhoodChainTestnet : robinhoodChain;

export const publicClient = createPublicClient({
  chain,
  transport: http(),
});

export const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS;
export const FACTORY_START_BLOCK = BigInt(process.env.FACTORY_START_BLOCK || "0");

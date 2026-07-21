import { createPublicClient, createWalletClient, http, defineChain, parseAbiItem, keccak256, encodePacked } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, arbitrum, sepolia, arbitrumSepolia } from "viem/chains";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
dotenv.config();
const contractsEnv = dotenv.parse(fs.readFileSync(path.resolve(__dirname, "../../contracts/.env")));

const PRIVATE_KEY = contractsEnv.PRIVATE_KEY || "0x3cb1c3907aed967594f3c6820805439669200e8cda713680baf536d0ce75fb05";
const useTestnet = process.env.USE_TESTNET === "true";

const L1_BRIDGE_ADDRESS = process.env.L1_BRIDGE_ADDRESS;
const L2_BRIDGE_ADDRESS = process.env.L2_BRIDGE_ADDRESS;

const account = privateKeyToAccount(PRIVATE_KEY);

// Setup Clients
const l1Chain = useTestnet ? arbitrumSepolia : arbitrum;
const l1Rpc = useTestnet ? "https://sepolia-rollup.arbitrum.io/rpc" : "https://arb1.arbitrum.io/rpc";

const l1PublicClient = createPublicClient({
  chain: l1Chain,
  transport: http(l1Rpc),
});

const robinhoodChainMainnet = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [contractsEnv.VITE_RH_MAINNET_RPC || "https://rpc.mainnet.chain.robinhood.com"] } },
});

const robinhoodChainTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RH_TESTNET_RPC || "https://rpc.testnet.chain.robinhood.com"] } },
  testnet: true,
});

const l2Chain = useTestnet ? robinhoodChainTestnet : robinhoodChainMainnet;

const l2PublicClient = createPublicClient({
  chain: l2Chain,
  transport: http(),
});

const l2WalletClient = createWalletClient({
  account,
  chain: l2Chain,
  transport: http(),
});

// Load ABI
const bridgeAbi = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../abi/BridgeGateway.json"), "utf8")
);

const BridgeDepositedEvent = parseAbiItem(
  "event BridgeDeposited(address indexed depositor, address indexed receiver, uint256 amount, uint256 indexed nonce, uint256 sourceChainId, uint256 destChainId)"
);

// We keep a local block cursor for the source chain L1
let l1Cursor = 0n;

async function processDepositLog(log) {
  const { receiver, amount, nonce, sourceChainId, destChainId } = log.args;

  console.log(`[relayer] found deposit: Nonce ${nonce}, Amount: ${amount} wei, Receiver: ${receiver}`);

  if (Number(destChainId) !== l2Chain.id) {
    console.log(`[relayer] ignoring deposit: target chain ID ${destChainId} does not match current L2 ${l2Chain.id}`);
    return;
  }

  try {
    // Check if already processed on L2
    const processed = await l2PublicClient.readContract({
      address: L2_BRIDGE_ADDRESS,
      abi: bridgeAbi,
      functionName: "processedDeposits",
      args: [sourceChainId, nonce],
    });

    if (processed) {
      console.log(`[relayer] deposit ${nonce} already processed on-chain.`);
      return;
    }

    console.log(`[relayer] signing and releasing deposit ${nonce} to receiver ${receiver}...`);

    // Construct hash and sign
    const msgHash = keccak256(
      encodePacked(
        ["address", "uint256", "uint256", "uint256", "uint256"],
        [receiver, amount, nonce, sourceChainId, destChainId]
      )
    );

    const signature = await account.signMessage({
      message: { raw: msgHash },
    });

    // Execute release on L2
    const hash = await l2WalletClient.writeContract({
      address: L2_BRIDGE_ADDRESS,
      abi: bridgeAbi,
      functionName: "release",
      args: [receiver, amount, nonce, sourceChainId, signature],
    });

    console.log(`[relayer] release tx sent: ${hash}`);
    await l2PublicClient.waitForTransactionReceipt({ hash });
    console.log(`[relayer] ✅ deposit ${nonce} successfully released to ${receiver}!`);

  } catch (err) {
    console.error(`[relayer] failed to process deposit ${nonce}:`, err.message);
  }
}

export async function startRelayer() {
  if (!L1_BRIDGE_ADDRESS || !L2_BRIDGE_ADDRESS) {
    console.warn("[relayer] L1_BRIDGE_ADDRESS or L2_BRIDGE_ADDRESS not set. Relayer idle. Configure them in indexer/.env.");
    return;
  }

  console.log(`[relayer] starting bridge relayer (L1: ${L1_BRIDGE_ADDRESS} on ${l1Chain.name}, L2: ${L2_BRIDGE_ADDRESS} on ${l2Chain.name})`);
  console.log(`[relayer] relayer account address: ${account.address}`);

  // Start checking from the current L1 block
  try {
    l1Cursor = await l1PublicClient.getBlockNumber();
    console.log(`[relayer] L1 start block cursor: ${l1Cursor}`);
  } catch (err) {
    console.error("[relayer] failed to get initial L1 block number:", err.message);
    l1Cursor = 0n;
  }

  // Poll Loop
  const POLL_INTERVAL = 8000;
  while (true) {
    try {
      if (l1Cursor > 0n) {
        const latest = await l1PublicClient.getBlockNumber();
        if (l1Cursor <= latest) {
          const from = l1Cursor;
          const to = latest;
          console.log(`[relayer] checking L1 logs from ${from} to ${to}...`);

          const logs = await l1PublicClient.getLogs({
            address: L1_BRIDGE_ADDRESS,
            event: BridgeDepositedEvent,
            fromBlock: from,
            toBlock: to,
          });

          for (const log of logs) {
            await processDepositLog(log);
          }

          l1Cursor = latest + 1n;
        }
      }
    } catch (err) {
      console.error("[relayer] check loop error:", err.message);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }
}

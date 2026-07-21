import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain } from "./src/chain.js";
import fs from "fs";
import dotenv from "dotenv";

// Read from contracts/.env
const contractsEnv = dotenv.parse(fs.readFileSync("../contracts/.env"));

const PRIVATE_KEY = contractsEnv.PRIVATE_KEY;
const FACTORY_ADDRESS = contractsEnv.FACTORY_ADDRESS;
const DEX_ROUTER_ADDRESS = contractsEnv.DEX_ROUTER_ADDRESS;

if (!PRIVATE_KEY || !FACTORY_ADDRESS || !DEX_ROUTER_ADDRESS) {
  console.error("Error: Please make sure PRIVATE_KEY, FACTORY_ADDRESS, and DEX_ROUTER_ADDRESS are set in contracts/.env");
  process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY);

const walletClient = createWalletClient({
  account,
  chain,
  transport: http(),
});

const abi = [
  {
    name: "setDexRouter",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "router",
        type: "address",
      },
    ],
    outputs: [],
  },
];

async function main() {
  console.log("Updating on-chain DEX router address...");
  console.log("Owner Account Address:", account.address);
  console.log("Target Factory Address:", FACTORY_ADDRESS);
  console.log("New DEX Router Address:", DEX_ROUTER_ADDRESS);

  try {
    const hash = await walletClient.writeContract({
      address: FACTORY_ADDRESS,
      abi,
      functionName: "setDexRouter",
      args: [DEX_ROUTER_ADDRESS],
    });
    console.log("Transaction sent! Transaction hash:", hash);
  } catch (err) {
    console.error("Failed to set DEX Router:", err);
  }
}

main();

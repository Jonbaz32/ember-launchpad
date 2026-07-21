import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount, privateKeyToAddress } from "viem/accounts";
import { defineChain } from "viem";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Load env from contracts/.env
const contractsEnvPath = path.resolve("../contracts/.env");
if (fs.existsSync(contractsEnvPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(contractsEnvPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PROTOCOL_FEE_RECIPIENT = process.env.PROTOCOL_FEE_RECIPIENT;

if (!PRIVATE_KEY) {
  console.error("Error: PRIVATE_KEY not found in env.");
  process.exit(1);
}

const deployerAccount = privateKeyToAccount(PRIVATE_KEY);
const deployerAddress = deployerAccount.address;
const feeRecipient = PROTOCOL_FEE_RECIPIENT || deployerAddress;

console.log("Deployer Address:", deployerAddress);
console.log("Protocol Fee Recipient:", feeRecipient);

// Define Robinhood Chain Mainnet
const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.VITE_RH_MAINNET_RPC || "https://rpc.mainnet.chain.robinhood.com"] },
    public: { http: [process.env.VITE_RH_MAINNET_RPC || "https://rpc.mainnet.chain.robinhood.com"] },
  },
});

const client = createPublicClient({
  chain: robinhoodChain,
  transport: http(),
});

const wallet = createWalletClient({
  chain: robinhoodChain,
  transport: http(),
});

async function main() {
  // Load compile artifact
  const artifactPath = path.resolve("../contracts/out/TokenFactory.sol/TokenFactory.json");
  if (!fs.existsSync(artifactPath)) {
    console.error(`Error: Compiled artifact not found at ${artifactPath}. Run forge build or check compilation.`);
    process.exit(1);
  }

  const { abi, bytecode } = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  
  console.log("Deploying TokenFactory to Robinhood Chain Mainnet...");
  
  try {
    const hash = await wallet.deployContract({
      abi,
      bytecode: bytecode.object,
      account: deployerAccount,
      args: [feeRecipient],
    });
    
    console.log("Transaction Hash:", hash);
    console.log("Waiting for transaction receipt...");
    
    const receipt = await client.waitForTransactionReceipt({ hash });
    
    console.log("----------------------------------------------");
    console.log("SUCCESS! TokenFactory deployed successfully.");
    console.log("Contract Address:", receipt.contractAddress);
    console.log("Block Number:", receipt.blockNumber.toString());
    console.log("----------------------------------------------");
  } catch (error) {
    console.error("Deployment failed:", error);
    process.exit(1);
  }
}

main();

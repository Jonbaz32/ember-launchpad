import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain } from "./src/chain.js";
import fs from "fs";
import dotenv from "dotenv";

// Read from contracts/.env
const contractsEnv = dotenv.parse(fs.readFileSync("../contracts/.env"));

const PRIVATE_KEY = contractsEnv.PRIVATE_KEY;
const PROTOCOL_FEE_RECIPIENT = contractsEnv.PROTOCOL_FEE_RECIPIENT;

if (!PRIVATE_KEY || !PROTOCOL_FEE_RECIPIENT) {
  console.error("Error: Please make sure PRIVATE_KEY and PROTOCOL_FEE_RECIPIENT are set in contracts/.env");
  process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY);

const walletClient = createWalletClient({
  account,
  chain,
  transport: http(),
});

const publicClient = createPublicClient({
  chain,
  transport: http(),
});

// Read compiled artifact JSON
const artifact = JSON.parse(
  fs.readFileSync("../contracts/out/TokenFactory.sol/TokenFactory.json", "utf8")
);

async function main() {
  console.log("Deploying updated TokenFactory contract to Robinhood Chain Testnet...");
  console.log("Deployer account:", account.address);
  console.log("Protocol Fee Recipient:", PROTOCOL_FEE_RECIPIENT);

  try {
    const hash = await walletClient.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode.object,
      args: [PROTOCOL_FEE_RECIPIENT],
    });
    console.log("Deployment transaction sent! Transaction hash:", hash);

    console.log("Waiting for transaction confirmation...");
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log("Deployment complete! New TokenFactory address:", receipt.contractAddress);
  } catch (err) {
    console.error("Deployment failed:", err);
  }
}

main();

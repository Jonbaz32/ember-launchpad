import { createPublicClient, createWalletClient, http, defineChain, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import solc from "solc";

import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from contracts/.env
const contractsEnvPath = path.resolve(__dirname, "../contracts/.env");
if (fs.existsSync(contractsEnvPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(contractsEnvPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x3cb1c3907aed967594f3c6820805439669200e8cda713680baf536d0ce75fb05";
const PROTOCOL_FEE_RECIPIENT = process.env.PROTOCOL_FEE_RECIPIENT || "0x415e16Ad0Cd00485a7479B0a31b862c5ba27222A";
const USE_TESTNET = process.env.USE_TESTNET !== "false";

const deployerAccount = privateKeyToAccount(PRIVATE_KEY);
const deployerAddress = deployerAccount.address;

console.log("=== COMPILING & DEPLOYING EMBER DICE VAULT ===");
console.log("Deployer Address:", deployerAddress);
console.log("Protocol Fee Recipient:", PROTOCOL_FEE_RECIPIENT);
console.log("Target Network:", USE_TESTNET ? "Robinhood Chain Testnet (46630)" : "Robinhood Chain Mainnet (4663)");

// Chain Definition
const targetChain = defineChain({
  id: USE_TESTNET ? 46630 : 4663,
  name: USE_TESTNET ? "Robinhood Chain Testnet" : "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        USE_TESTNET
          ? "https://rpc.testnet.chain.robinhood.com"
          : process.env.VITE_RH_MAINNET_RPC || "https://rpc.mainnet.chain.robinhood.com",
      ],
    },
  },
});

const client = createPublicClient({
  chain: targetChain,
  transport: http(),
});

const wallet = createWalletClient({
  chain: targetChain,
  transport: http(),
});

function compileVault() {
  console.log("Compiling EmberDiceVault.sol via solc JS...");
  const contractPath = path.resolve("../contracts/src/EmberDiceVault.sol");
  const source = fs.readFileSync(contractPath, "utf8");

  const input = {
    language: "Solidity",
    sources: {
      "EmberDiceVault.sol": { content: source },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode"],
        },
      },
    },
  };

  function findImports(importPath) {
    if (importPath.startsWith("@openzeppelin/")) {
      const fullPath = path.resolve("../contracts/lib/openzeppelin-contracts/", importPath.replace("@openzeppelin/", ""));
      if (fs.existsSync(fullPath)) {
        return { contents: fs.readFileSync(fullPath, "utf8") };
      }
    }
    return { error: "File not found: " + importPath };
  }

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  if (output.errors) {
    const errs = output.errors.filter((e) => e.severity === "error");
    if (errs.length > 0) {
      console.error("Solidity Compilation Errors:", errs);
      process.exit(1);
    }
  }

  const contract = output.contracts["EmberDiceVault.sol"]["EmberDiceVault"];
  return {
    abi: contract.abi,
    bytecode: "0x" + contract.evm.bytecode.object,
  };
}

async function main() {
  const { abi, bytecode } = compileVault();
  const initialProfitThresholdWei = parseEther("4.0"); // $10,000 threshold (~4 ETH)

  console.log("Deploying EmberDiceVault contract on-chain...");

  try {
    const hash = await wallet.deployContract({
      abi,
      bytecode,
      account: deployerAccount,
      args: [initialProfitThresholdWei, PROTOCOL_FEE_RECIPIENT],
    });

    console.log("Deployment Tx Hash:", hash);
    console.log("Waiting for block confirmation...");

    const receipt = await client.waitForTransactionReceipt({ hash });
    const vaultAddress = receipt.contractAddress;

    console.log("\n==================================================");
    console.log("🎉 SUCCESS! EmberDiceVault Deployed On-Chain!");
    console.log("Contract Address:", vaultAddress);
    console.log("Block Number:", receipt.blockNumber.toString());
    console.log("==================================================\n");

    // Save compiled ABI artifact for frontend/indexer use
    const outDir = path.resolve("../contracts/out/EmberDiceVault.sol");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "EmberDiceVault.json"), JSON.stringify({ abi, bytecode: { object: bytecode } }, null, 2));

    // Update frontend/.env
    const frontendEnvPath = path.resolve("../frontend/.env");
    let envContent = fs.existsSync(frontendEnvPath) ? fs.readFileSync(frontendEnvPath, "utf8") : "";
    
    if (envContent.includes("VITE_DICE_VAULT_ADDRESS=")) {
      envContent = envContent.replace(/VITE_DICE_VAULT_ADDRESS=.*/, `VITE_DICE_VAULT_ADDRESS=${vaultAddress}`);
    } else {
      envContent += `\nVITE_DICE_VAULT_ADDRESS=${vaultAddress}\n`;
    }

    fs.writeFileSync(frontendEnvPath, envContent);
    console.log(`Updated VITE_DICE_VAULT_ADDRESS=${vaultAddress} in frontend/.env`);
  } catch (error) {
    console.error("Deployment failed:", error);
    process.exit(1);
  }
}

main();

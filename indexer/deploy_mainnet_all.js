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

const deployerAccount = privateKeyToAccount(PRIVATE_KEY);
const deployerAddress = deployerAccount.address;

console.log("==================================================");
console.log("🚀 MAINNET DEPLOYMENT ENGINE — ROBINHOOD CHAIN");
console.log("==================================================");
console.log("Deployer Address:", deployerAddress);
console.log("Protocol Fee Recipient:", PROTOCOL_FEE_RECIPIENT);
console.log("Target Network: Robinhood Chain Mainnet (Chain ID 4663)");

// Robinhood Chain Mainnet Definition
const rhMainnet = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.VITE_RH_MAINNET_RPC || "https://rpc.mainnet.chain.robinhood.com"],
    },
  },
});

const client = createPublicClient({
  chain: rhMainnet,
  transport: http(),
});

const wallet = createWalletClient({
  chain: rhMainnet,
  transport: http(),
});

function compileSolidity(filename, contractName) {
  console.log(`Compiling ${filename} via solc JS...`);
  const contractPath = path.resolve(__dirname, `../contracts/src/${filename}`);
  const source = fs.readFileSync(contractPath, "utf8");

  const input = {
    language: "Solidity",
    sources: {
      [filename]: { content: source },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode"],
        },
      },
    },
  };

  function findImports(importPath) {
    if (importPath.startsWith("@openzeppelin/")) {
      const fullPath = path.resolve(__dirname, "../contracts/lib/openzeppelin-contracts/", importPath.replace("@openzeppelin/", ""));
      if (fs.existsSync(fullPath)) {
        return { contents: fs.readFileSync(fullPath, "utf8") };
      }
    }
    const localPath = path.resolve(__dirname, "../contracts/src/", importPath);
    if (fs.existsSync(localPath)) {
      return { contents: fs.readFileSync(localPath, "utf8") };
    }
    return { error: "File not found: " + importPath };
  }

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  if (output.errors) {
    const errs = output.errors.filter((e) => e.severity === "error");
    if (errs.length > 0) {
      console.error(`Compilation Errors in ${filename}:`, errs);
      process.exit(1);
    }
  }

  const contract = output.contracts[filename][contractName];
  return {
    abi: contract.abi,
    bytecode: "0x" + contract.evm.bytecode.object,
  };
}

async function main() {
  // Check deployer ETH balance
  const balance = await client.getBalance({ address: deployerAddress });
  console.log(`Deployer ETH Balance: ${parseEther(balance.toString())} ETH`);

  // 1. Deploy TokenFactory
  console.log("\n1/2 Deploying TokenFactory to Mainnet...");
  const factoryCompiled = compileSolidity("TokenFactory.sol", "TokenFactory");
  
  const factoryTxHash = await wallet.deployContract({
    abi: factoryCompiled.abi,
    bytecode: factoryCompiled.bytecode,
    account: deployerAccount,
    args: [PROTOCOL_FEE_RECIPIENT],
  });
  console.log("TokenFactory Tx Hash:", factoryTxHash);
  console.log("Waiting for block confirmation...");
  const factoryReceipt = await client.waitForTransactionReceipt({ hash: factoryTxHash });
  const factoryAddress = factoryReceipt.contractAddress;
  console.log("✅ TokenFactory Mainnet Address:", factoryAddress);

  // 2. Deploy EmberDiceVault
  console.log("\n2/2 Deploying EmberDiceVault to Mainnet...");
  const vaultCompiled = compileSolidity("EmberDiceVault.sol", "EmberDiceVault");
  const initialProfitThresholdWei = parseEther("4.0"); // $10,000 threshold

  const vaultTxHash = await wallet.deployContract({
    abi: vaultCompiled.abi,
    bytecode: vaultCompiled.bytecode,
    account: deployerAccount,
    args: [initialProfitThresholdWei, PROTOCOL_FEE_RECIPIENT],
  });
  console.log("EmberDiceVault Tx Hash:", vaultTxHash);
  console.log("Waiting for block confirmation...");
  const vaultReceipt = await client.waitForTransactionReceipt({ hash: vaultTxHash });
  const vaultAddress = vaultReceipt.contractAddress;
  console.log("✅ EmberDiceVault Mainnet Address:", vaultAddress);

  console.log("\n==================================================");
  console.log("🎉 MAINNET DEPLOYMENT COMPLETE!");
  console.log("TokenFactory:", factoryAddress);
  console.log("EmberDiceVault:", vaultAddress);
  console.log("Protocol Fee Wallet:", PROTOCOL_FEE_RECIPIENT);
  console.log("==================================================\n");

  // Save compiled ABIs
  fs.writeFileSync(path.resolve("../frontend/src/abi/TokenFactory.json"), JSON.stringify(factoryCompiled.abi, null, 2));
  fs.writeFileSync(path.resolve("../frontend/src/abi/LaunchToken.sol/LaunchToken.json"), JSON.stringify(vaultCompiled.abi, null, 2));

  // Update frontend/.env
  const frontendEnvPath = path.resolve("../frontend/.env");
  let envContent = `VITE_USE_TESTNET=false\nVITE_FACTORY_ADDRESS=${factoryAddress}\nVITE_DICE_VAULT_ADDRESS=${vaultAddress}\nVITE_PROTOCOL_FEE_RECIPIENT=${PROTOCOL_FEE_RECIPIENT}\n`;
  fs.writeFileSync(frontendEnvPath, envContent);
  console.log("Updated frontend/.env with Mainnet addresses.");
}

main().catch((err) => {
  console.error("Mainnet deployment failed:", err);
  process.exit(1);
});

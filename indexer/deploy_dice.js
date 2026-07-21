import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import fs from "fs";
import path from "path";
import solc from "solc";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Load env and settings
const indexerEnvPath = path.resolve(__dirname, "./.env");
const indexerEnv = dotenv.parse(fs.readFileSync(indexerEnvPath));
const contractsEnv = dotenv.parse(fs.readFileSync(path.resolve(__dirname, "../contracts/.env")));

const PRIVATE_KEY = contractsEnv.PRIVATE_KEY || "0x3cb1c3907aed967594f3c6820805439669200e8cda713680baf536d0ce75fb05";
const useTestnet = indexerEnv.USE_TESTNET === "true";

const account = privateKeyToAccount(PRIVATE_KEY);
const ownerAddress = account.address;

// 2. Setup Chain
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
  rpcUrls: { default: { http: [indexerEnv.RH_TESTNET_RPC || "https://rpc.testnet.chain.robinhood.com"] } },
  testnet: true,
});

const targetChain = useTestnet ? robinhoodChainTestnet : robinhoodChainMainnet;

const publicClient = createPublicClient({
  chain: targetChain,
  transport: http(),
});

const walletClient = createWalletClient({
  account,
  chain: targetChain,
  transport: http(),
});

// 3. Compile Solidity using solc JS
function compileDice() {
  console.log("Compiling EmberDice.sol via solc JS...");
  const contractPath = path.resolve(__dirname, "../contracts/src/EmberDice.sol");
  const source = fs.readFileSync(contractPath, "utf8");

  const input = {
    language: "Solidity",
    sources: {
      "EmberDice.sol": { content: source },
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
      const fullPath = path.resolve(
        __dirname,
        "../contracts/lib/openzeppelin-contracts/",
        importPath.replace("@openzeppelin/", "")
      );
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
      console.error("Compilation Errors:", errs);
      process.exit(1);
    }
  }

  const contract = output.contracts["EmberDice.sol"]["EmberDice"];
  return {
    abi: contract.abi,
    bytecode: "0x" + contract.evm.bytecode.object,
  };
}

async function main() {
  console.log("Deployer Address:", ownerAddress);
  console.log("Active Network:", targetChain.name);

  // 1. Compile
  const result = compileDice();

  // Write compiled JSON files
  const contractsOutDir = path.resolve(__dirname, "../contracts/out/EmberDice.sol");
  if (!fs.existsSync(contractsOutDir)) fs.mkdirSync(contractsOutDir, { recursive: true });
  fs.writeFileSync(
    path.join(contractsOutDir, "EmberDice.json"),
    JSON.stringify({ abi: result.abi, bytecode: { object: result.bytecode } }, null, 2)
  );

  const frontendAbiDir = path.resolve(__dirname, "../frontend/src/abi");
  if (!fs.existsSync(frontendAbiDir)) fs.mkdirSync(frontendAbiDir, { recursive: true });
  fs.writeFileSync(
    path.join(frontendAbiDir, "EmberDice.json"),
    JSON.stringify(result.abi, null, 2)
  );

  const indexerAbiDir = path.resolve(__dirname, "./abi");
  if (!fs.existsSync(indexerAbiDir)) fs.mkdirSync(indexerAbiDir, { recursive: true });
  fs.writeFileSync(
    path.join(indexerAbiDir, "EmberDice.json"),
    JSON.stringify(result.abi, null, 2)
  );
  console.log("Compiled & saved ABI to target folders!");

  // 2. Check Balance
  const balance = await publicClient.getBalance({ address: ownerAddress });
  console.log(`Deployer ETH Balance: ${balance.toString()} wei (${(Number(balance) / 1e18).toFixed(18)} ETH)`);

  // 3. Deploy contract
  console.log("Deploying EmberDice contract...");
  const hash = await walletClient.deployContract({
    abi: result.abi,
    bytecode: result.bytecode,
  });
  console.log(`  Tx Hash: ${hash}`);
  console.log("  Waiting for confirmation...");
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const diceAddress = receipt.contractAddress;
  console.log(`  ✅ Deployed EmberDice at: ${diceAddress}`);

  // 4. Fund initial bankroll (e.g. 0.001 ETH)
  console.log("Funding house bankroll liquidity...");
  const fundValue = 1000000000000000n; // 0.001 ETH
  const fundHash = await walletClient.sendTransaction({
    to: diceAddress,
    value: fundValue,
  });
  console.log(`  Liquidity tx sent: ${fundHash}`);
  await publicClient.waitForTransactionReceipt({ hash: fundHash });
  console.log("  ✅ Bankroll funded successfully!");

  // 5. Update frontend env
  console.log("Updating configuration file...");
  const frontendEnvPath = path.resolve(__dirname, "../frontend/.env");
  let frontendEnvContent = fs.readFileSync(frontendEnvPath, "utf8");
  
  if (frontendEnvContent.includes("VITE_DICE_ADDRESS=")) {
    frontendEnvContent = frontendEnvContent.replace(
      /VITE_DICE_ADDRESS=0x[a-fA-F0-9]{40}/,
      `VITE_DICE_ADDRESS=${diceAddress}`
    );
  } else {
    frontendEnvContent += `\nVITE_DICE_ADDRESS=${diceAddress}\n`;
  }
  fs.writeFileSync(frontendEnvPath, frontendEnvContent);
  console.log("  ✅ Updated VITE_DICE_ADDRESS in frontend/.env!");

  console.log("\n--------------------------------------------------");
  console.log("🏆 DEPLOYMENT COMPLETE & READY FOR SWAP INTEGRATION!");
  console.log("--------------------------------------------------");
}

main().catch(console.error);

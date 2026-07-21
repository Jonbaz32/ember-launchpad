import { parseAbiItem } from "viem";
import { publicClient, FACTORY_ADDRESS, FACTORY_START_BLOCK } from "./chain.js";
import {
  db,
  getLastSyncedBlock,
  setLastSyncedBlock,
  insertToken,
  insertTrade,
  insertBurn,
} from "./db.js";

const CHUNK_SIZE = 2000n; // conservative block range per getLogs call for public RPC limits
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 5000);

const TokenCreated = parseAbiItem(
  "event TokenCreated(address indexed token, address indexed creator, string name, string symbol, string metadataURI, uint256 index)"
);
const Buy = parseAbiItem("event Buy(address indexed buyer, uint256 ethIn, uint256 tokensOut, uint256 fee)");
const Sell = parseAbiItem("event Sell(address indexed seller, uint256 tokensIn, uint256 ethOut, uint256 fee)");
const CreatorBurn = parseAbiItem(
  "event CreatorBurn(address indexed creator, uint256 tokensBurned, uint256 ethClaimed)"
);

function knownTokenAddresses() {
  return db.prepare("SELECT address FROM tokens").all().map((r) => r.address);
}

async function blockTimestamp(blockNumber) {
  const block = await publicClient.getBlock({ blockNumber });
  return Number(block.timestamp);
}

async function syncRange(fromBlock, toBlock) {
  // 1. New token launches from the factory.
  const createdLogs = await publicClient.getLogs({
    address: FACTORY_ADDRESS,
    event: TokenCreated,
    fromBlock,
    toBlock,
  });

  for (const log of createdLogs) {
    const ts = await blockTimestamp(log.blockNumber);
    insertToken.run({
      address: log.args.token,
      creator: log.args.creator,
      name: log.args.name,
      symbol: log.args.symbol,
      metadata_uri: log.args.metadataURI,
      created_at: ts,
      block_number: Number(log.blockNumber),
      tx_hash: log.transactionHash,
    });
    console.log(`[indexer] new token ${log.args.symbol} @ ${log.args.token}`);
  }

  // 2. Trade + burn activity for every token we know about so far (including ones
  //    just discovered in step 1).
  const tokens = knownTokenAddresses();
  if (tokens.length === 0) return;

  const [buyLogs, sellLogs, burnLogs] = await Promise.all([
    publicClient.getLogs({ address: tokens, event: Buy, fromBlock, toBlock }),
    publicClient.getLogs({ address: tokens, event: Sell, fromBlock, toBlock }),
    publicClient.getLogs({ address: tokens, event: CreatorBurn, fromBlock, toBlock }),
  ]);

  for (const log of buyLogs) {
    const ts = await blockTimestamp(log.blockNumber);
    insertTrade.run({
      token: log.address,
      trader: log.args.buyer,
      side: "buy",
      eth_amount: log.args.ethIn.toString(),
      token_amount: log.args.tokensOut.toString(),
      fee: log.args.fee.toString(),
      block_number: Number(log.blockNumber),
      log_index: log.logIndex,
      tx_hash: log.transactionHash,
      timestamp: ts,
    });
  }

  for (const log of sellLogs) {
    const ts = await blockTimestamp(log.blockNumber);
    insertTrade.run({
      token: log.address,
      trader: log.args.seller,
      side: "sell",
      eth_amount: log.args.ethOut.toString(),
      token_amount: log.args.tokensIn.toString(),
      fee: log.args.fee.toString(),
      block_number: Number(log.blockNumber),
      log_index: log.logIndex,
      tx_hash: log.transactionHash,
      timestamp: ts,
    });
  }

  for (const log of burnLogs) {
    const ts = await blockTimestamp(log.blockNumber);
    insertBurn.run({
      token: log.address,
      creator: log.args.creator,
      tokens_burned: log.args.tokensBurned.toString(),
      eth_claimed: log.args.ethClaimed.toString(),
      block_number: Number(log.blockNumber),
      log_index: log.logIndex,
      tx_hash: log.transactionHash,
      timestamp: ts,
    });
  }
}

export async function startSync() {
  if (!FACTORY_ADDRESS) {
    console.warn("[indexer] FACTORY_ADDRESS not set — sync loop idle. Set it in .env once deployed.");
    return;
  }

  let cursor = getLastSyncedBlock(FACTORY_START_BLOCK);
  console.log(`[indexer] starting sync from block ${cursor}`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const latest = await publicClient.getBlockNumber();
      if (cursor <= latest) {
        let from = cursor;
        while (from <= latest) {
          const to = from + CHUNK_SIZE > latest ? latest : from + CHUNK_SIZE;
          await syncRange(from, to);
          setLastSyncedBlock(to + 1n);
          from = to + 1n;
        }
        cursor = latest + 1n;
      }
    } catch (err) {
      console.error("[indexer] sync error:", err.message);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

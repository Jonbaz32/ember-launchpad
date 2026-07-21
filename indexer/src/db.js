import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "ember.sqlite");

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS tokens (
    address TEXT PRIMARY KEY,
    creator TEXT NOT NULL,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    metadata_uri TEXT,
    created_at INTEGER NOT NULL,
    block_number INTEGER NOT NULL,
    tx_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL,
    trader TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    eth_amount TEXT NOT NULL,
    token_amount TEXT NOT NULL,
    fee TEXT NOT NULL,
    block_number INTEGER NOT NULL,
    log_index INTEGER NOT NULL,
    tx_hash TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    UNIQUE(tx_hash, log_index)
  );

  CREATE TABLE IF NOT EXISTS burns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL,
    creator TEXT NOT NULL,
    tokens_burned TEXT NOT NULL,
    eth_claimed TEXT NOT NULL,
    block_number INTEGER NOT NULL,
    log_index INTEGER NOT NULL,
    tx_hash TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    UNIQUE(tx_hash, log_index)
  );

  CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_trades_token ON trades(token);
  CREATE INDEX IF NOT EXISTS idx_burns_token ON burns(token);
`);

export function getLastSyncedBlock(defaultBlock) {
  const row = db.prepare("SELECT value FROM sync_state WHERE key = 'last_block'").get();
  return row ? BigInt(row.value) : BigInt(defaultBlock);
}

export function setLastSyncedBlock(blockNumber) {
  db.prepare(
    "INSERT INTO sync_state (key, value) VALUES ('last_block', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(blockNumber.toString());
}

export const insertToken = db.prepare(`
  INSERT INTO tokens (address, creator, name, symbol, metadata_uri, created_at, block_number, tx_hash)
  VALUES (@address, @creator, @name, @symbol, @metadata_uri, @created_at, @block_number, @tx_hash)
  ON CONFLICT(address) DO NOTHING
`);

export const insertTrade = db.prepare(`
  INSERT INTO trades (token, trader, side, eth_amount, token_amount, fee, block_number, log_index, tx_hash, timestamp)
  VALUES (@token, @trader, @side, @eth_amount, @token_amount, @fee, @block_number, @log_index, @tx_hash, @timestamp)
  ON CONFLICT(tx_hash, log_index) DO NOTHING
`);

export const insertBurn = db.prepare(`
  INSERT INTO burns (token, creator, tokens_burned, eth_claimed, block_number, log_index, tx_hash, timestamp)
  VALUES (@token, @creator, @tokens_burned, @eth_claimed, @block_number, @log_index, @tx_hash, @timestamp)
  ON CONFLICT(tx_hash, log_index) DO NOTHING
`);

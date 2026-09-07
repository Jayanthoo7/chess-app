const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'chess.db');

let db;
let SQL;

async function initDB() {
  SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    fen TEXT NOT NULL,
    pgn TEXT,
    white_player TEXT,
    black_player TEXT,
    white_user_id TEXT,
    black_user_id TEXT,
    status TEXT DEFAULT 'playing',
    winner TEXT,
    time_control INTEGER DEFAULT 600,
    board_rows INTEGER DEFAULT 8,
    board_state TEXT,
    created_at INTEGER,
    updated_at INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS moves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    move_san TEXT NOT NULL,
    fen_after TEXT NOT NULL,
    state_after TEXT,
    move_number INTEGER,
    color TEXT,
    timestamp INTEGER
  )`);

  // Player accounts
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    password_hash TEXT NOT NULL,
    email_verified INTEGER DEFAULT 0,
    created_at INTEGER,
    last_login_at INTEGER
  )`);

  // OTP codes for email verification / passwordless login
  db.run(`CREATE TABLE IF NOT EXISTS otp_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    purpose TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    consumed INTEGER DEFAULT 0,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`);

  // Friend requests (pending/accepted/declined) — one row per request sent.
  db.run(`CREATE TABLE IF NOT EXISTS friend_requests (
    id TEXT PRIMARY KEY,
    from_user_id TEXT NOT NULL,
    to_user_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    responded_at INTEGER
  )`);

  // Accepted friendships — one row per pair, order doesn't matter (query with OR).
  db.run(`CREATE TABLE IF NOT EXISTS friendships (
    id TEXT PRIMARY KEY,
    user_id_a TEXT NOT NULL,
    user_id_b TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);

  // Best-effort migration for DBs created before white_user_id/black_user_id existed
  const gameCols = dbAll(`PRAGMA table_info(games)`).map(c => c.name);
  if (!gameCols.includes('white_user_id')) {
    try { db.run('ALTER TABLE games ADD COLUMN white_user_id TEXT'); } catch (e) {}
  }
  if (!gameCols.includes('black_user_id')) {
    try { db.run('ALTER TABLE games ADD COLUMN black_user_id TEXT'); } catch (e) {}
  }
  if (!gameCols.includes('board_rows')) {
    try { db.run('ALTER TABLE games ADD COLUMN board_rows INTEGER DEFAULT 8'); } catch (e) {}
  }
  if (!gameCols.includes('board_state')) {
    try { db.run('ALTER TABLE games ADD COLUMN board_state TEXT'); } catch (e) {}
  }

  // state_after holds a variant-board JSON snapshot for 10x8/12x8 moves;
  // fen_after (NOT NULL) stays '' for those rows since there's no FEN.
  const moveCols = dbAll(`PRAGMA table_info(moves)`).map(c => c.name);
  if (!moveCols.includes('state_after')) {
    try { db.run('ALTER TABLE moves ADD COLUMN state_after TEXT'); } catch (e) {}
  }

  saveDB();
}

function saveDB() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function dbRun(sql, params = []) {
  db.run(sql, params);
  saveDB();
}

function dbGet(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function dbAll(sql, params = []) {
  const results = db.exec(sql, params);
  if (!results.length) return [];
  const { columns, values } = results[0];
  return values.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  });
}

module.exports = { initDB, dbRun, dbGet, dbAll, saveDB };

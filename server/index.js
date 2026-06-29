const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { Chess } = require('chess.js');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3001;
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
    status TEXT DEFAULT 'playing',
    winner TEXT,
    time_control INTEGER DEFAULT 600,
    created_at INTEGER,
    updated_at INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS moves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    move_san TEXT NOT NULL,
    fen_after TEXT NOT NULL,
    move_number INTEGER,
    color TEXT,
    timestamp INTEGER
  )`);

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

// In-memory rooms for active games
const rooms = {};

// REST API
app.get('/api/games', (req, res) => {
  const games = dbAll(`SELECT * FROM games ORDER BY created_at DESC LIMIT 20`);
  res.json(games);
});

app.get('/api/games/:id', (req, res) => {
  const game = dbGet(`SELECT * FROM games WHERE id = ?`, [req.params.id]);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const moves = dbAll(`SELECT * FROM moves WHERE game_id = ? ORDER BY move_number`, [req.params.id]);
  res.json({ ...game, moves });
});

app.post('/api/games', (req, res) => {
  const id = uuidv4();
  const chess = new Chess();
  const now = Date.now();
  const timeControl = req.body.timeControl || 600;
  dbRun(`INSERT INTO games (id, fen, pgn, white_player, black_player, status, time_control, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, chess.fen(), '', 'Waiting...', 'Waiting...', 'waiting', timeControl, now, now]);
  res.json({ id, fen: chess.fen(), timeControl });
});

// Socket.io
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join_room', ({ roomId, playerName }) => {
    if (!rooms[roomId]) {
      rooms[roomId] = {
        chess: new Chess(),
        players: {},
        spectators: [],
        clocks: { w: null, b: null },
        clockInterval: null,
        lastMoveTime: null,
        timeControl: 600,
        gameStarted: false,
      };
      // Load from DB if exists
      const dbGame = dbGet(`SELECT * FROM games WHERE id = ?`, [roomId]);
      if (dbGame) {
        rooms[roomId].timeControl = dbGame.time_control || 600;
        rooms[roomId].clocks = { w: dbGame.time_control || 600, b: dbGame.time_control || 600 };
        if (dbGame.fen && dbGame.status === 'playing') {
          try { rooms[roomId].chess.load(dbGame.fen); } catch(e) {}
        }
      }
    }

    const room = rooms[roomId];
    const playerCount = Object.keys(room.players).length;

    if (playerCount < 2 && !Object.values(room.players).find(p => p.id === socket.id)) {
      const color = playerCount === 0 ? 'w' : 'b';
      room.players[color] = { id: socket.id, name: playerName || `Player ${playerCount + 1}` };

      if (room.clocks.w === null) {
        room.clocks.w = room.timeControl;
        room.clocks.b = room.timeControl;
      }

      socket.join(roomId);
      socket.emit('joined', {
        color,
        fen: room.chess.fen(),
        pgn: room.chess.pgn(),
        clocks: room.clocks,
        timeControl: room.timeControl,
        players: room.players,
      });

      // Update DB player names
      const wp = room.players.w?.name || 'Waiting...';
      const bp = room.players.b?.name || 'Waiting...';
      dbRun(`UPDATE games SET white_player=?, black_player=?, updated_at=? WHERE id=?`,
        [wp, bp, Date.now(), roomId]);

      if (Object.keys(room.players).length === 2) {
        room.gameStarted = true;
        io.to(roomId).emit('game_start', {
          players: room.players,
          fen: room.chess.fen(),
          clocks: room.clocks,
        });
        startClock(roomId);
      }
    } else {
      // Spectator
      room.spectators.push(socket.id);
      socket.join(roomId);
      socket.emit('joined', {
        color: 'spectator',
        fen: room.chess.fen(),
        pgn: room.chess.pgn(),
        clocks: room.clocks,
        players: room.players,
      });
    }

    io.to(roomId).emit('room_update', {
      players: room.players,
      spectatorCount: room.spectators.length,
    });
  });

  socket.on('move', ({ roomId, move }) => {
    const room = rooms[roomId];
    if (!room) return;

    const playerColor = Object.entries(room.players).find(([, p]) => p.id === socket.id)?.[0];
    if (!playerColor) return;
    if (room.chess.turn() !== playerColor) return;

    try {
      const result = room.chess.move(move);
      if (!result) return;

      const moveNumber = Math.ceil(room.chess.history().length / 2);
      const now = Date.now();

      dbRun(`INSERT INTO moves (game_id, move_san, fen_after, move_number, color, timestamp) VALUES (?,?,?,?,?,?)`,
        [roomId, result.san, room.chess.fen(), moveNumber, playerColor, now]);

      dbRun(`UPDATE games SET fen=?, pgn=?, updated_at=? WHERE id=?`,
        [room.chess.fen(), room.chess.pgn(), now, roomId]);

      // Switch clock
      if (room.clockInterval) {
        clearInterval(room.clockInterval);
        room.clockInterval = null;
      }
      room.lastMoveTime = now;

      let status = 'playing';
      let winner = null;

      if (room.chess.isCheckmate()) {
        status = 'checkmate';
        winner = playerColor;
      } else if (room.chess.isDraw()) {
        status = 'draw';
      } else if (room.chess.isStalemate()) {
        status = 'stalemate';
      }

      if (status !== 'playing') {
        clearInterval(room.clockInterval);
        dbRun(`UPDATE games SET status=?, winner=?, updated_at=? WHERE id=?`,
          [status, winner, Date.now(), roomId]);
      }

      io.to(roomId).emit('move_made', {
        move: result,
        fen: room.chess.fen(),
        pgn: room.chess.pgn(),
        turn: room.chess.turn(),
        clocks: room.clocks,
        status,
        winner,
        inCheck: room.chess.inCheck(),
        isCheckmate: room.chess.isCheckmate(),
        isDraw: room.chess.isDraw(),
      });

      if (status === 'playing') startClock(roomId);

    } catch (e) {
      socket.emit('invalid_move', { error: e.message });
    }
  });

  socket.on('offer_draw', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    const opp = Object.entries(room.players).find(([, p]) => p.id !== socket.id);
    if (opp) io.to(opp[1].id).emit('draw_offered');
  });

  socket.on('accept_draw', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    clearInterval(room.clockInterval);
    dbRun(`UPDATE games SET status='draw', updated_at=? WHERE id=?`, [Date.now(), roomId]);
    io.to(roomId).emit('game_over', { status: 'draw', reason: 'agreement' });
  });

  socket.on('resign', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    clearInterval(room.clockInterval);
    const playerColor = Object.entries(room.players).find(([, p]) => p.id === socket.id)?.[0];
    const winner = playerColor === 'w' ? 'b' : 'w';
    dbRun(`UPDATE games SET status='resigned', winner=?, updated_at=? WHERE id=?`, [winner, Date.now(), roomId]);
    io.to(roomId).emit('game_over', { status: 'resigned', winner, reason: 'resignation' });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    for (const [roomId, room] of Object.entries(rooms)) {
      const colorEntry = Object.entries(room.players).find(([, p]) => p.id === socket.id);
      if (colorEntry) {
        io.to(roomId).emit('player_disconnected', { color: colorEntry[0], name: colorEntry[1].name });
        clearInterval(room.clockInterval);
      }
      room.spectators = room.spectators.filter(id => id !== socket.id);
    }
  });
});

function startClock(roomId) {
  const room = rooms[roomId];
  if (!room || !room.gameStarted) return;
  if (room.clockInterval) clearInterval(room.clockInterval);

  room.clockInterval = setInterval(() => {
    const turn = room.chess.turn();
    room.clocks[turn] = Math.max(0, (room.clocks[turn] || 0) - 1);

    io.to(roomId).emit('clock_tick', { clocks: room.clocks, turn });

    if (room.clocks[turn] <= 0) {
      clearInterval(room.clockInterval);
      const winner = turn === 'w' ? 'b' : 'w';
      dbRun(`UPDATE games SET status='timeout', winner=?, updated_at=? WHERE id=?`, [winner, Date.now(), roomId]);
      io.to(roomId).emit('game_over', { status: 'timeout', winner, reason: 'timeout' });
    }
  }, 1000);
}

initDB().then(() => {
  server.listen(PORT, () => console.log(`Chess server running on port ${PORT}`));
});

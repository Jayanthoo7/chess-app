require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { Chess } = require('chess.js');

const { initDB, dbRun, dbGet, dbAll } = require('./db');
const { optionalAuth, verifyToken } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const friendsRoutes = require('./routes/friends');

const app = express();
// Render (and most PaaS providers) put the app behind one reverse-proxy hop,
// which sets X-Forwarded-For. Without this, express-rate-limit can't safely
// derive the real client IP and throws on every request.
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3001;

// In-memory rooms for active games
const rooms = {};

// Online presence: userId -> Set of connected socket ids (a user can have
// more than one tab/device open at once).
const onlineUsers = new Map();

// Pending game invites: inviteId -> { gameId, fromUserId, toUserId, timeControl }
const pendingInvites = new Map();

function getFriendIds(userId) {
  const rows = dbAll(
    `SELECT user_id_a, user_id_b FROM friendships WHERE user_id_a = ? OR user_id_b = ?`,
    [userId, userId]
  );
  return rows.map(r => (r.user_id_a === userId ? r.user_id_b : r.user_id_a));
}

function emitToUser(userId, event, payload) {
  const sockets = onlineUsers.get(userId);
  if (!sockets) return;
  for (const socketId of sockets) io.to(socketId).emit(event, payload);
}

function createStandardGame(timeControl, boardRows) {
  const id = uuidv4();
  const rows = [8, 10, 12].includes(boardRows) ? boardRows : 8;
  const now = Date.now();
  let fen = null;
  if (rows === 8) {
    fen = new Chess().fen();
  }
  dbRun(
    `INSERT INTO games (id, fen, pgn, white_player, black_player, status, time_control, board_rows, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, fen || '', '', 'Waiting...', 'Waiting...', 'waiting', timeControl, rows, now, now]
  );
  return { id, fen, timeControl, boardRows: rows };
}

// Auth API (register / login / OTP / captcha)
app.use('/api/auth', authRoutes);
app.use('/api/friends', friendsRoutes);

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

app.post('/api/games', optionalAuth, (req, res) => {
  const timeControl = req.body.timeControl || 600;
  const boardRows = Number(req.body.boardRows) || 8;
  const game = createStandardGame(timeControl, boardRows);
  res.json(game);
});

// Socket.io
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Every page that opens a socket connection is behind ProtectedRoute, so a
  // real user is always logged in — authenticate via the JWT passed at
  // handshake time (socket.io has no per-message Authorization header).
  const decoded = verifyToken(socket.handshake.auth?.token);
  if (decoded?.id) {
    socket.data.userId = decoded.id;
    if (!onlineUsers.has(decoded.id)) onlineUsers.set(decoded.id, new Set());
    onlineUsers.get(decoded.id).add(socket.id);

    // Tell any already-online friends this user just came online, and send
    // this socket a snapshot of which of ITS friends are already online (the
    // online/offline events above only cover future transitions).
    const friendIds = getFriendIds(decoded.id);
    for (const friendId of friendIds) {
      emitToUser(friendId, 'friend_online', { userId: decoded.id });
    }
    socket.emit('online_friends', { userIds: friendIds.filter(id => onlineUsers.has(id)) });
  }

  socket.on('invite_friend', ({ toUserId, timeControl }) => {
    const fromUserId = socket.data.userId;
    if (!fromUserId) return;
    const friendIds = getFriendIds(fromUserId);
    if (!friendIds.includes(toUserId)) {
      return socket.emit('invite_failed', { reason: 'not_friends' });
    }
    if (!onlineUsers.has(toUserId) || onlineUsers.get(toUserId).size === 0) {
      return socket.emit('invite_failed', { reason: 'offline', toUserId });
    }

    const fromUser = dbGet(`SELECT id, name FROM users WHERE id = ?`, [fromUserId]);
    const game = createStandardGame(timeControl || 600, 8);
    const inviteId = uuidv4();
    pendingInvites.set(inviteId, { gameId: game.id, fromUserId, toUserId, timeControl: game.timeControl });

    emitToUser(toUserId, 'game_invite', {
      inviteId,
      gameId: game.id,
      timeControl: game.timeControl,
      fromUser: { id: fromUser.id, name: fromUser.name },
    });
    socket.emit('invite_sent', { inviteId, toUserId });
  });

  socket.on('respond_invite', ({ inviteId, accept }) => {
    const invite = pendingInvites.get(inviteId);
    if (!invite || invite.toUserId !== socket.data.userId) return;
    pendingInvites.delete(inviteId);

    if (accept) {
      emitToUser(invite.fromUserId, 'invite_accepted', { inviteId, gameId: invite.gameId });
    } else {
      emitToUser(invite.fromUserId, 'invite_declined', { inviteId });
    }
  });

  socket.on('join_room', ({ roomId, playerName, userId }) => {
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
      room.players[color] = { id: socket.id, name: playerName || `Player ${playerCount + 1}`, userId: userId || null };

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

      // Update DB player names + linked accounts
      const wp = room.players.w?.name || 'Waiting...';
      const bp = room.players.b?.name || 'Waiting...';
      dbRun(`UPDATE games SET white_player=?, black_player=?, white_user_id=?, black_user_id=?, updated_at=? WHERE id=?`,
        [wp, bp, room.players.w?.userId || null, room.players.b?.userId || null, Date.now(), roomId]);

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

    const userId = socket.data.userId;
    if (userId && onlineUsers.has(userId)) {
      const sockets = onlineUsers.get(userId);
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        onlineUsers.delete(userId);
        for (const friendId of getFriendIds(userId)) {
          emitToUser(friendId, 'friend_offline', { userId });
        }
      }
    }

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

// Catch-all error handler — must be last. Any error thrown or passed to
// next() by a route (including via asyncHandler in routes/auth.js) ends up
// here as a normal JSON 500 instead of crashing the process.
app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

process.on('unhandledRejection', (err) => {
  console.error('[server] Unhandled promise rejection:', err);
});

initDB().then(() => {
  server.listen(PORT, () => console.log(`Chess server running on port ${PORT}`));
});

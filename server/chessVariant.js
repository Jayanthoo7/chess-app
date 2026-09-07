// Chess move-generation/rules engine generalized to a variable BOARD HEIGHT
// (8, 10, or 12 ranks) with a fixed width of 8 files. The extra ranks on
// taller boards are empty "no man's land" inserted between the two sides'
// starting rows — every rule (castling, en passant, promotion, etc.) is
// otherwise identical to standard chess.
//
// This is intentionally independent of chess.js/FEN: nothing here needs to
// interoperate with an engine like Stockfish (which only understands
// standard 8x8 boards), so state is plain JSON that can be stored directly.
//
// Board convention: board[row][col], row 0 = White's back rank, row
// (rows-1) = Black's back rank, col 0 = the 'a' file, col 7 = the 'h' file.

const FILES = 'abcdefgh';

const KNIGHT_DELTAS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING_DELTAS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const QUEEN_DIRS = [...BISHOP_DIRS, ...ROOK_DIRS];

function opponent(color) {
  return color === 'w' ? 'b' : 'w';
}

function inBounds(rows, cols, row, col) {
  return row >= 0 && row < rows && col >= 0 && col < cols;
}

function cloneBoard(board) {
  return board.map(row => row.map(cell => (cell ? { ...cell } : null)));
}

function cloneState(state) {
  return {
    rows: state.rows,
    cols: state.cols,
    board: cloneBoard(state.board),
    turn: state.turn,
    castling: { w: { ...state.castling.w }, b: { ...state.castling.b } },
    enPassant: state.enPassant ? { ...state.enPassant } : null,
    halfmoveClock: state.halfmoveClock,
    status: state.status,
    winner: state.winner,
    inCheck: state.inCheck,
    moveHistory: state.moveHistory.slice(),
  };
}

// ---- Setup ----

function createInitialState(rows) {
  const cols = 8;
  const board = Array.from({ length: rows }, () => Array(cols).fill(null));
  const backRank = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let c = 0; c < cols; c++) {
    board[0][c] = { type: backRank[c], color: 'w' };
    board[1][c] = { type: 'p', color: 'w' };
    board[rows - 2][c] = { type: 'p', color: 'b' };
    board[rows - 1][c] = { type: backRank[c], color: 'b' };
  }
  return {
    rows,
    cols,
    board,
    turn: 'w',
    castling: { w: { k: true, q: true }, b: { k: true, q: true } },
    enPassant: null,
    halfmoveClock: 0,
    status: 'playing',
    winner: null,
    inCheck: false,
    moveHistory: [],
  };
}

// ---- Attack detection (works on a plain board, so it can be reused against
// simulated "what if this move were made" boards without building a full
// state object each time) ----

function isSquareAttackedOnBoard(board, rows, cols, row, col, byColor) {
  const inB = (r, c) => inBounds(rows, cols, r, c);

  // Pawns: a byColor pawn at (row-dir, col±1) attacks (row,col), where dir
  // is that color's forward direction.
  const pawnDir = byColor === 'w' ? 1 : -1;
  for (const dc of [-1, 1]) {
    const pr = row - pawnDir, pc = col + dc;
    if (inB(pr, pc)) {
      const p = board[pr][pc];
      if (p && p.type === 'p' && p.color === byColor) return true;
    }
  }

  for (const [dr, dc] of KNIGHT_DELTAS) {
    const r = row + dr, c = col + dc;
    if (inB(r, c)) {
      const p = board[r][c];
      if (p && p.type === 'n' && p.color === byColor) return true;
    }
  }

  for (const [dr, dc] of KING_DELTAS) {
    const r = row + dr, c = col + dc;
    if (inB(r, c)) {
      const p = board[r][c];
      if (p && p.type === 'k' && p.color === byColor) return true;
    }
  }

  for (const [dr, dc] of BISHOP_DIRS) {
    let r = row + dr, c = col + dc;
    while (inB(r, c)) {
      const p = board[r][c];
      if (p) {
        if (p.color === byColor && (p.type === 'b' || p.type === 'q')) return true;
        break;
      }
      r += dr; c += dc;
    }
  }

  for (const [dr, dc] of ROOK_DIRS) {
    let r = row + dr, c = col + dc;
    while (inB(r, c)) {
      const p = board[r][c];
      if (p) {
        if (p.color === byColor && (p.type === 'r' || p.type === 'q')) return true;
        break;
      }
      r += dr; c += dc;
    }
  }

  return false;
}

function isSquareAttacked(state, row, col, byColor) {
  return isSquareAttackedOnBoard(state.board, state.rows, state.cols, row, col, byColor);
}

function findKingOnBoard(board, rows, cols, color) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = board[r][c];
      if (p && p.type === 'k' && p.color === color) return { row: r, col: c };
    }
  }
  return null;
}

function findKing(state, color) {
  return findKingOnBoard(state.board, state.rows, state.cols, color);
}

function isInCheck(state, color) {
  const kingPos = findKing(state, color);
  if (!kingPos) return false;
  return isSquareAttacked(state, kingPos.row, kingPos.col, opponent(color));
}

// ---- Pseudo-legal move generation (per piece, ignoring whether it leaves
// the mover's own king in check — that filter is applied separately) ----

function pawnMoves(state, row, col, color) {
  const moves = [];
  const dir = color === 'w' ? 1 : -1;
  const startRow = color === 'w' ? 1 : state.rows - 2;
  const promoteRow = color === 'w' ? state.rows - 1 : 0;
  const oneStep = row + dir;

  const addForward = (r, c) => {
    if (r === promoteRow) moves.push({ row: r, col: c, promotion: true });
    else moves.push({ row: r, col: c });
  };

  if (inBounds(state.rows, state.cols, oneStep, col) && !state.board[oneStep][col]) {
    addForward(oneStep, col);
    const twoStep = row + 2 * dir;
    if (row === startRow && inBounds(state.rows, state.cols, twoStep, col) && !state.board[twoStep][col]) {
      moves.push({ row: twoStep, col, isDoubleStep: true });
    }
  }

  for (const dc of [-1, 1]) {
    const r = oneStep, c = col + dc;
    if (!inBounds(state.rows, state.cols, r, c)) continue;
    const target = state.board[r][c];
    if (target && target.color !== color) {
      addForward(r, c);
    } else if (!target && state.enPassant && state.enPassant.row === r && state.enPassant.col === c) {
      moves.push({ row: r, col: c, isEnPassant: true });
    }
  }

  return moves;
}

function steppingMoves(state, row, col, color, deltas) {
  const moves = [];
  for (const [dr, dc] of deltas) {
    const r = row + dr, c = col + dc;
    if (!inBounds(state.rows, state.cols, r, c)) continue;
    const target = state.board[r][c];
    if (!target || target.color !== color) moves.push({ row: r, col: c });
  }
  return moves;
}

function slidingMoves(state, row, col, color, dirs) {
  const moves = [];
  for (const [dr, dc] of dirs) {
    let r = row + dr, c = col + dc;
    while (inBounds(state.rows, state.cols, r, c)) {
      const target = state.board[r][c];
      if (!target) {
        moves.push({ row: r, col: c });
      } else {
        if (target.color !== color) moves.push({ row: r, col: c });
        break;
      }
      r += dr; c += dc;
    }
  }
  return moves;
}

function kingMoves(state, row, col, color) {
  const moves = steppingMoves(state, row, col, color, KING_DELTAS);
  const backRank = color === 'w' ? 0 : state.rows - 1;

  if (row === backRank && col === 4 && !isSquareAttacked(state, backRank, 4, opponent(color))) {
    const rights = state.castling[color];

    if (rights.k &&
        !state.board[backRank][5] && !state.board[backRank][6] &&
        state.board[backRank][7]?.type === 'r' && state.board[backRank][7]?.color === color &&
        !isSquareAttacked(state, backRank, 5, opponent(color)) &&
        !isSquareAttacked(state, backRank, 6, opponent(color))) {
      moves.push({ row: backRank, col: 6, isCastle: 'k' });
    }

    if (rights.q &&
        !state.board[backRank][3] && !state.board[backRank][2] && !state.board[backRank][1] &&
        state.board[backRank][0]?.type === 'r' && state.board[backRank][0]?.color === color &&
        !isSquareAttacked(state, backRank, 3, opponent(color)) &&
        !isSquareAttacked(state, backRank, 2, opponent(color))) {
      moves.push({ row: backRank, col: 2, isCastle: 'q' });
    }
  }

  return moves;
}

function pseudoMoves(state, row, col) {
  const piece = state.board[row][col];
  if (!piece) return [];
  switch (piece.type) {
    case 'p': return pawnMoves(state, row, col, piece.color);
    case 'n': return steppingMoves(state, row, col, piece.color, KNIGHT_DELTAS);
    case 'b': return slidingMoves(state, row, col, piece.color, BISHOP_DIRS);
    case 'r': return slidingMoves(state, row, col, piece.color, ROOK_DIRS);
    case 'q': return slidingMoves(state, row, col, piece.color, QUEEN_DIRS);
    case 'k': return kingMoves(state, row, col, piece.color);
    default: return [];
  }
}

// ---- Legality filter (does this move leave the mover's own king in check?) ----

function simulateBoardAfter(state, fromRow, fromCol, move) {
  const board = cloneBoard(state.board);
  const piece = board[fromRow][fromCol];
  board[fromRow][fromCol] = null;

  if (move.isEnPassant) {
    const capturedRow = piece.color === 'w' ? move.row - 1 : move.row + 1;
    board[capturedRow][move.col] = null;
  }

  board[move.row][move.col] = { ...piece };

  if (move.isCastle) {
    const backRank = fromRow;
    if (move.isCastle === 'k') {
      board[backRank][5] = board[backRank][7];
      board[backRank][7] = null;
    } else {
      board[backRank][3] = board[backRank][0];
      board[backRank][0] = null;
    }
  }

  return board;
}

function legalMovesForSquare(state, row, col) {
  const piece = state.board[row][col];
  if (!piece || piece.color !== state.turn) return [];

  return pseudoMoves(state, row, col).filter(m => {
    const boardAfter = simulateBoardAfter(state, row, col, m);
    const kingPos = piece.type === 'k'
      ? { row: m.row, col: m.col }
      : findKingOnBoard(boardAfter, state.rows, state.cols, piece.color);
    if (!kingPos) return false;
    return !isSquareAttackedOnBoard(boardAfter, state.rows, state.cols, kingPos.row, kingPos.col, opponent(piece.color));
  });
}

function hasAnyLegalMove(state) {
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const p = state.board[r][c];
      if (p && p.color === state.turn && legalMovesForSquare(state, r, c).length > 0) return true;
    }
  }
  return false;
}

function getLegalMovesByFrom(state) {
  const map = {};
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const p = state.board[r][c];
      if (p && p.color === state.turn) {
        const moves = legalMovesForSquare(state, r, c);
        if (moves.length) {
          map[`${r},${c}`] = moves.map(m => ({ row: m.row, col: m.col, promotion: !!m.promotion }));
        }
      }
    }
  }
  return map;
}

// ---- Notation (for move-history display; not a full SAN implementation,
// but unambiguous and readable — ranks simply extend past 8 on taller
// boards, e.g. a10, e12) ----

function squareName(row, col) {
  return `${FILES[col]}${row + 1}`;
}

function buildNotation({ piece, from, to, captured, isCastle, promotion, isCheck, isCheckmate }) {
  let s;
  if (isCastle === 'k') s = 'O-O';
  else if (isCastle === 'q') s = 'O-O-O';
  else {
    const pieceLetter = piece.type === 'p' ? '' : piece.type.toUpperCase();
    const fromFile = piece.type === 'p' && captured ? FILES[from.col] : '';
    s = `${pieceLetter}${fromFile}${captured ? 'x' : ''}${squareName(to.row, to.col)}`;
    if (promotion) s += `=${promotion.toUpperCase()}`;
  }
  if (isCheckmate) s += '#';
  else if (isCheck) s += '+';
  return s;
}

// ---- Applying a move ----

function applyMove(state, from, to, promotionPiece) {
  if (state.status !== 'playing') return { ok: false, error: 'This game is already over.' };
  if (!inBounds(state.rows, state.cols, from.row, from.col)) return { ok: false, error: 'Invalid square.' };

  const piece = state.board[from.row][from.col];
  if (!piece || piece.color !== state.turn) return { ok: false, error: "There's no piece of yours there." };

  const candidates = legalMovesForSquare(state, from.row, from.col);
  const chosen = candidates.find(m => m.row === to.row && m.col === to.col);
  if (!chosen) return { ok: false, error: 'Illegal move.' };

  const next = cloneState(state);
  const movingPiece = { ...piece };
  const captured = next.board[to.row][to.col] ? { ...next.board[to.row][to.col] } : null;

  next.board[from.row][from.col] = null;

  let epCapturedPiece = null;
  if (chosen.isEnPassant) {
    const capturedRow = movingPiece.color === 'w' ? to.row - 1 : to.row + 1;
    epCapturedPiece = next.board[capturedRow][to.col];
    next.board[capturedRow][to.col] = null;
  }

  let finalType = movingPiece.type;
  if (chosen.promotion) {
    finalType = ['q', 'r', 'b', 'n'].includes(promotionPiece) ? promotionPiece : 'q';
  }
  next.board[to.row][to.col] = { type: finalType, color: movingPiece.color };

  if (chosen.isCastle) {
    const backRank = from.row;
    if (chosen.isCastle === 'k') {
      next.board[backRank][5] = next.board[backRank][7];
      next.board[backRank][7] = null;
    } else {
      next.board[backRank][3] = next.board[backRank][0];
      next.board[backRank][0] = null;
    }
  }

  // Castling rights: revoked the moment the king or a rook LEAVES its home
  // square, and never restored — also revoked if the rook itself gets
  // captured on its home square without ever having moved.
  if (movingPiece.type === 'k') {
    next.castling[movingPiece.color].k = false;
    next.castling[movingPiece.color].q = false;
  }
  if (movingPiece.type === 'r') {
    const backRank = movingPiece.color === 'w' ? 0 : state.rows - 1;
    if (from.row === backRank && from.col === 0) next.castling[movingPiece.color].q = false;
    if (from.row === backRank && from.col === 7) next.castling[movingPiece.color].k = false;
  }
  if (captured && captured.type === 'r') {
    const oppColor = opponent(movingPiece.color);
    const backRank = oppColor === 'w' ? 0 : state.rows - 1;
    if (to.row === backRank && to.col === 0) next.castling[oppColor].q = false;
    if (to.row === backRank && to.col === 7) next.castling[oppColor].k = false;
  }

  next.enPassant = chosen.isDoubleStep
    ? { row: (from.row + to.row) / 2, col: from.col }
    : null;

  const wasCaptureOrPawn = !!captured || !!epCapturedPiece || movingPiece.type === 'p';
  next.halfmoveClock = wasCaptureOrPawn ? 0 : state.halfmoveClock + 1;

  next.turn = opponent(state.turn);

  const nextInCheck = isInCheck(next, next.turn);
  next.inCheck = nextInCheck;

  if (!hasAnyLegalMove(next)) {
    next.status = nextInCheck ? 'checkmate' : 'stalemate';
    next.winner = nextInCheck ? movingPiece.color : null;
  } else if (next.halfmoveClock >= 100) {
    next.status = 'draw';
    next.winner = null;
  } else {
    next.status = 'playing';
    next.winner = null;
  }

  const notation = buildNotation({
    piece: movingPiece,
    from,
    to,
    captured: !!captured || !!epCapturedPiece,
    isCastle: chosen.isCastle,
    promotion: chosen.promotion ? finalType : null,
    isCheck: nextInCheck,
    isCheckmate: next.status === 'checkmate',
  });

  const moveRecord = {
    from,
    to,
    piece: movingPiece.type,
    color: movingPiece.color,
    captured: captured?.type || (epCapturedPiece ? epCapturedPiece.type : null),
    promotion: chosen.promotion ? finalType : null,
    isCastle: chosen.isCastle || null,
    isEnPassant: !!chosen.isEnPassant,
    notation,
  };
  next.moveHistory.push(moveRecord);

  return { ok: true, state: next, move: moveRecord };
}

module.exports = {
  createInitialState,
  getLegalMovesByFrom,
  applyMove,
  isInCheck,
  findKing,
  isSquareAttacked,
  squareName,
};

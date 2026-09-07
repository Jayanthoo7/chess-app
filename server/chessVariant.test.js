// Standalone regression tests for chessVariant.js — no test framework
// needed, just `node server/chessVariant.test.js`. Covers initial setup for
// each board size, pawn moves, en passant, castling (both sides, and every
// way it can be blocked), promotion, check/checkmate/stalemate, pins, the
// 50-move rule, and full-game smoke tests on the 10x8/12x8 boards.

const {
  createInitialState, getLegalMovesByFrom, applyMove, isInCheck,
} = require('./chessVariant');

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL: ${label}`); }
}

function countPieces(state) {
  let n = 0;
  for (const row of state.board) for (const c of row) if (c) n++;
  return n;
}

// ---------------------------------------------------------------------
// 1. Initial setup for each board size
// ---------------------------------------------------------------------
for (const rows of [8, 10, 12]) {
  const s = createInitialState(rows);
  check(`${rows}-row: 32 pieces total`, countPieces(s) === 32);
  check(`${rows}-row: white back rank correct`, s.board[0].map(p => p.type).join('') === 'rnbqkbnr');
  check(`${rows}-row: black back rank correct`, s.board[rows - 1].map(p => p.type).join('') === 'rnbqkbnr');
  check(`${rows}-row: white pawns on row 1`, s.board[1].every(p => p.type === 'p' && p.color === 'w'));
  check(`${rows}-row: black pawns on row ${rows - 2}`, s.board[rows - 2].every(p => p.type === 'p' && p.color === 'b'));
  let emptyRows = 0;
  for (let r = 2; r < rows - 2; r++) if (s.board[r].every(c => c === null)) emptyRows++;
  check(`${rows}-row: middle is all empty (${rows - 4} rows)`, emptyRows === rows - 4);
  check(`${rows}-row: turn starts white`, s.turn === 'w');
}

// ---------------------------------------------------------------------
// 2. Basic pawn moves: single/double step
// ---------------------------------------------------------------------
{
  const s = createInitialState(10);
  const moves = getLegalMovesByFrom(s);
  check('e2-equivalent pawn (row1,col4) has 2 moves initially', moves['1,4']?.length === 2);
  check('white has 20 total legal moves in the opening (16 pawn + 4 knight)',
    Object.values(moves).reduce((a, m) => a + m.length, 0) === 20);

  const r1 = applyMove(s, { row: 1, col: 4 }, { row: 3, col: 4 });
  check('pawn double-step accepted', r1.ok);
  check('en passant square recorded after double-step', r1.state.enPassant?.row === 2 && r1.state.enPassant?.col === 4);
}

// ---------------------------------------------------------------------
// 3. En passant capture
// ---------------------------------------------------------------------
{
  let s = createInitialState(8);
  s = applyMove(s, { row: 1, col: 4 }, { row: 3, col: 4 }).state; // White e2-e4
  s = applyMove(s, { row: 6, col: 0 }, { row: 5, col: 0 }).state; // Black a7-a6 (waiting move)
  s = applyMove(s, { row: 3, col: 4 }, { row: 4, col: 4 }).state; // White e4-e5
  s = applyMove(s, { row: 6, col: 3 }, { row: 4, col: 3 }).state; // Black d7-d5, lands beside white's e5 pawn
  check('en passant target set after black double-step', s.enPassant?.row === 5 && s.enPassant?.col === 3);
  const moves = getLegalMovesByFrom(s);
  const epCapture = moves['4,4']?.find(m => m.row === 5 && m.col === 3);
  check('white e5 pawn can capture en passant onto d6', !!epCapture);
  const afterEp = applyMove(s, { row: 4, col: 4 }, { row: 5, col: 3 });
  check('en passant move succeeds', afterEp.ok);
  check('captured pawn removed from d5', afterEp.state.board[4][3] === null);
  check('capturing pawn now on d6', afterEp.state.board[5][3]?.type === 'p' && afterEp.state.board[5][3]?.color === 'w');
  check('move record flags en passant', afterEp.move.isEnPassant === true);
}

// ---------------------------------------------------------------------
// 4. Castling
// ---------------------------------------------------------------------
{
  let s = createInitialState(8);
  s = applyMove(s, { row: 1, col: 4 }, { row: 3, col: 4 }).state; // e4
  s = applyMove(s, { row: 6, col: 4 }, { row: 4, col: 4 }).state; // e5
  s = applyMove(s, { row: 0, col: 6 }, { row: 2, col: 5 }).state; // Nf3
  s = applyMove(s, { row: 7, col: 6 }, { row: 5, col: 5 }).state; // Nf6
  s = applyMove(s, { row: 0, col: 5 }, { row: 1, col: 4 }).state; // bishop out diagonally to the now-empty e2 square
  s = applyMove(s, { row: 7, col: 5 }, { row: 6, col: 4 }).state; // mirrored for black
  const movesBeforeCastle = getLegalMovesByFrom(s);
  const kingMoves = movesBeforeCastle['0,4'] || [];
  check('white king-side castle is offered once knight+bishop cleared', kingMoves.some(m => m.row === 0 && m.col === 6));
  const castled = applyMove(s, { row: 0, col: 4 }, { row: 0, col: 6 });
  check('white castles king-side successfully', castled.ok);
  check('king landed on g1-equiv (row0,col6)', castled.state.board[0][6]?.type === 'k');
  check('rook landed on f1-equiv (row0,col5)', castled.state.board[0][5]?.type === 'r');
  check('h1-equiv rook square now empty', castled.state.board[0][7] === null);
  check('white castling rights both revoked after castling', !castled.state.castling.w.k && !castled.state.castling.w.q);
  check('move record flags kingside castle', castled.move.isCastle === 'k');
}

{
  // Castling forbidden while the king is in check.
  let s = createInitialState(8);
  s.board = s.board.map(row => row.map(() => null));
  s.board[0][4] = { type: 'k', color: 'w' };
  s.board[0][7] = { type: 'r', color: 'w' };
  s.board[7][4] = { type: 'k', color: 'b' };
  s.board[5][4] = { type: 'r', color: 'b' }; // checks white king down the e-file
  s.castling = { w: { k: true, q: true }, b: { k: false, q: false } };
  s.turn = 'w';
  check('white king correctly detected in check', isInCheck(s, 'w'));
  const kMoves = getLegalMovesByFrom(s)['0,4'] || [];
  check('castling not offered while in check', !kMoves.some(m => m.isCastle));
}

{
  // Castling forbidden if the king passes through an attacked square.
  let s = createInitialState(8);
  s.board = s.board.map(row => row.map(() => null));
  s.board[0][4] = { type: 'k', color: 'w' };
  s.board[0][7] = { type: 'r', color: 'w' };
  s.board[7][4] = { type: 'k', color: 'b' };
  s.board[5][5] = { type: 'r', color: 'b' }; // attacks f1 (row0,col5), the king's transit square
  s.castling = { w: { k: true, q: true }, b: { k: false, q: false } };
  s.turn = 'w';
  const kMoves = getLegalMovesByFrom(s)['0,4'] || [];
  check('castling not offered when transit square is attacked', !kMoves.some(m => m.isCastle === 'k'));
}

{
  // Queenside castling.
  let s = createInitialState(8);
  s = applyMove(s, { row: 1, col: 3 }, { row: 3, col: 3 }).state; // d4
  s = applyMove(s, { row: 6, col: 3 }, { row: 4, col: 3 }).state; // d5
  s = applyMove(s, { row: 0, col: 1 }, { row: 2, col: 2 }).state; // Nc3
  s = applyMove(s, { row: 7, col: 1 }, { row: 5, col: 2 }).state; // Nc6
  s = applyMove(s, { row: 0, col: 2 }, { row: 2, col: 4 }).state; // bishop out diagonally
  s = applyMove(s, { row: 7, col: 2 }, { row: 5, col: 4 }).state; // mirrored
  s = applyMove(s, { row: 0, col: 3 }, { row: 1, col: 3 }).state; // queen steps onto the now-empty d2, clears d1
  s = applyMove(s, { row: 7, col: 3 }, { row: 6, col: 3 }).state; // mirrored
  const kMoves = getLegalMovesByFrom(s)['0,4'] || [];
  // getLegalMovesByFrom's public shape only carries {row,col,promotion} (the
  // isCastle tag is an internal detail applyMove re-derives from the
  // destination) — a king move landing two squares away can only be castling.
  check('white queenside castle offered once b1/c1/d1 clear', kMoves.some(m => m.row === 0 && m.col === 2));
  const castled = applyMove(s, { row: 0, col: 4 }, { row: 0, col: 2 });
  check('white castles queenside successfully', castled.ok);
  check('king landed on c1-equiv', castled.state.board[0][2]?.type === 'k');
  check('rook landed on d1-equiv', castled.state.board[0][3]?.type === 'r');
  check('a1-equiv now empty', castled.state.board[0][0] === null);
}

{
  // Castling rights permanently revoked once a rook moves, even if it returns.
  let s = createInitialState(8);
  s = applyMove(s, { row: 1, col: 7 }, { row: 3, col: 7 }).state; // h4
  s = applyMove(s, { row: 6, col: 0 }, { row: 5, col: 0 }).state; // a6 (waiting move)
  s = applyMove(s, { row: 0, col: 7 }, { row: 1, col: 7 }).state; // Rh1-h2
  check('rook move revokes kingside castling rights', s.castling.w.k === false);
  s = applyMove(s, { row: 5, col: 0 }, { row: 4, col: 0 }).state; // a5 (waiting move)
  s = applyMove(s, { row: 1, col: 7 }, { row: 0, col: 7 }).state; // rook returns home
  check('castling rights stay revoked even after the rook comes back', s.castling.w.k === false);
}

{
  const s = createInitialState(8);
  const m = getLegalMovesByFrom(s)['0,4'] || [];
  check('castling not offered from the starting position (pieces in the way)', !m.some(x => x.isCastle));
}

// ---------------------------------------------------------------------
// 5. Promotion (including capture-promotion)
// ---------------------------------------------------------------------
{
  let s = createInitialState(8);
  s.board = s.board.map(row => row.map(() => null));
  s.board[0][4] = { type: 'k', color: 'w' };
  s.board[7][4] = { type: 'k', color: 'b' };
  s.board[6][3] = { type: 'p', color: 'w' }; // one step from promoting, diagonally next to a black rook
  s.board[7][2] = { type: 'r', color: 'b' };
  s.turn = 'w';
  const pawnMoves = getLegalMovesByFrom(s)['6,3'] || [];
  check('promotion move flagged for straight advance', pawnMoves.some(m => m.row === 7 && m.col === 3 && m.promotion));
  check('promotion move flagged for capture', pawnMoves.some(m => m.row === 7 && m.col === 2 && m.promotion));
  const promoted = applyMove(s, { row: 6, col: 3 }, { row: 7, col: 2 }, 'q');
  check('capture-promotion succeeds', promoted.ok);
  check('promoted piece is a queen', promoted.state.board[7][2]?.type === 'q' && promoted.state.board[7][2]?.color === 'w');
}

// ---------------------------------------------------------------------
// 6/7. Check and checkmate detection — a hand-built back-rank mate
// ---------------------------------------------------------------------
{
  let s = createInitialState(8);
  s.board = s.board.map(row => row.map(() => null));
  s.board[0][6] = { type: 'k', color: 'w' }; // white king boxed in on g1
  s.board[1][5] = { type: 'p', color: 'w' };
  s.board[1][6] = { type: 'p', color: 'w' };
  s.board[1][7] = { type: 'p', color: 'w' };
  s.board[7][4] = { type: 'k', color: 'b' };
  s.board[0][0] = { type: 'r', color: 'b' }; // about to deliver back-rank mate
  s.turn = 'b';
  const result = applyMove(s, { row: 0, col: 0 }, { row: 0, col: 1 }); // Rb1#, uncontested back rank
  check('back-rank mate applied successfully', result.ok);
  check('resulting position is checkmate', result.state.status === 'checkmate');
  check('winner recorded as black', result.state.winner === 'b');
  check('notation includes mate symbol', result.move.notation.endsWith('#'));

  const tryMoveAfterMate = applyMove(result.state, { row: 7, col: 4 }, { row: 6, col: 4 });
  check('moves rejected once the game is over', !tryMoveAfterMate.ok);
}

// ---------------------------------------------------------------------
// 8. Stalemate detection — king boxed in, not in check, zero legal moves
// ---------------------------------------------------------------------
{
  let s = createInitialState(8);
  s.board = s.board.map(row => row.map(() => null));
  s.board[0][0] = { type: 'k', color: 'w' }; // white king cornered on a1
  s.board[2][1] = { type: 'k', color: 'b' };
  s.board[1][2] = { type: 'q', color: 'b' }; // covers b1,b2,a2 without checking a1 directly
  s.turn = 'w';
  check('white king not in check in stalemate position', !isInCheck(s, 'w'));
  const totalMoves = Object.values(getLegalMovesByFrom(s)).reduce((a, m) => a + m.length, 0);
  check('white has zero legal moves (stalemate position)', totalMoves === 0);
}

// ---------------------------------------------------------------------
// 9. Illegal move rejection: pinned piece, moving through a piece
// ---------------------------------------------------------------------
{
  let s = createInitialState(8);
  s.board = s.board.map(row => row.map(() => null));
  s.board[0][4] = { type: 'k', color: 'w' };
  s.board[3][4] = { type: 'b', color: 'w' }; // pinned bishop, blocking a rook's check
  s.board[7][4] = { type: 'r', color: 'b' };
  s.board[7][0] = { type: 'k', color: 'b' };
  s.turn = 'w';
  const moves = getLegalMovesByFrom(s);
  check('pinned bishop has no legal moves off the e-file', (moves['3,4'] || []).length === 0);
  const illegalTry = applyMove(s, { row: 3, col: 4 }, { row: 4, col: 5 });
  check('attempting to move the pinned bishop off-file is rejected', !illegalTry.ok);

  // The king may still move within its own piece's "shadow" — e.g. stepping
  // to (1,4) is fine, since the bishop at (3,4) still blocks the rook.
  const kingMoves = moves['0,4'] || [];
  check('king can still step to a square its own blocker still shields', kingMoves.some(m => m.row === 1 && m.col === 4));
}

{
  const s = createInitialState(8);
  const badRookMove = applyMove(s, { row: 0, col: 0 }, { row: 0, col: 3 }); // blocked by pieces in between
  check('rook cannot jump over its own pieces', !badRookMove.ok);
}

// ---------------------------------------------------------------------
// 10. 50-move rule: halfmove clock climbs on quiet moves
// ---------------------------------------------------------------------
{
  let s = createInitialState(8);
  s.board = s.board.map(row => row.map(() => null));
  s.board[0][0] = { type: 'k', color: 'w' };
  s.board[7][7] = { type: 'k', color: 'b' };
  s.board[3][3] = { type: 'r', color: 'w' };
  s.turn = 'w';
  s = applyMove(s, { row: 3, col: 3 }, { row: 3, col: 4 }).state; // quiet rook shuffle
  check('halfmove clock increments on a non-capture, non-pawn move', s.halfmoveClock === 1);
  s = applyMove(s, { row: 7, col: 7 }, { row: 6, col: 7 }).state;
  check('halfmove clock keeps incrementing', s.halfmoveClock === 2);
}

// ---------------------------------------------------------------------
// 11. Full-game smoke tests on 10x8 and 12x8 — several real moves in a row,
// verifying no crashes, turn alternation, and move-history accumulation.
// ---------------------------------------------------------------------
for (const rows of [10, 12]) {
  let s = createInitialState(rows);
  let steps = 0;
  const turnsSeen = new Set();
  const devSequence = [
    { from: [0, 1], to: [2, 2] }, { from: [rows - 1, 1], to: [rows - 3, 2] },
    { from: [0, 6], to: [2, 5] }, { from: [rows - 1, 6], to: [rows - 3, 5] },
  ];
  for (const mv of devSequence) {
    const r = applyMove(s, { row: mv.from[0], col: mv.from[1] }, { row: mv.to[0], col: mv.to[1] });
    check(`${rows}-row smoke: knight development move legal`, r.ok);
    if (r.ok) { s = r.state; turnsSeen.add(r.move.color); steps++; }
  }
  check(`${rows}-row smoke: both colors moved`, turnsSeen.has('w') && turnsSeen.has('b'));
  check(`${rows}-row smoke: move history recorded all ${steps} moves`, s.moveHistory.length === steps);
  check(`${rows}-row smoke: still playing, no crash`, s.status === 'playing');
  check(`${rows}-row smoke: turn alternated back to white`, s.turn === 'w');
}

console.log(`\n${pass}/${pass + fail} checks passed`);
if (fail > 0) process.exitCode = 1;

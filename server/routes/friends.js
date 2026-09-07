const express = require('express');
const { v4: uuidv4 } = require('uuid');

const { dbGet, dbAll, dbRun } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, email: u.email };
}

// Are these two users already friends, in either direction?
function areFriends(aId, bId) {
  return !!dbGet(
    `SELECT id FROM friendships WHERE (user_id_a = ? AND user_id_b = ?) OR (user_id_a = ? AND user_id_b = ?)`,
    [aId, bId, bId, aId]
  );
}

// Is there already a pending request between these two, in either direction?
function pendingRequestBetween(aId, bId) {
  return dbGet(
    `SELECT * FROM friend_requests WHERE status = 'pending' AND
     ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))`,
    [aId, bId, bId, aId]
  );
}

// ---- Send a friend request by email ----
router.post('/request', (req, res) => {
  const { email } = req.body || {};
  if (typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'An email is required.' });
  }
  const normalized = email.trim().toLowerCase();
  const target = dbGet(`SELECT * FROM users WHERE email = ?`, [normalized]);
  if (!target) return res.status(404).json({ error: 'No account found with that email.' });
  if (target.id === req.user.id) return res.status(400).json({ error: "You can't add yourself." });

  if (areFriends(req.user.id, target.id)) {
    return res.status(409).json({ error: 'You are already friends.' });
  }
  if (pendingRequestBetween(req.user.id, target.id)) {
    return res.status(409).json({ error: 'A request between you two is already pending.' });
  }

  const id = uuidv4();
  const now = Date.now();
  dbRun(
    `INSERT INTO friend_requests (id, from_user_id, to_user_id, status, created_at) VALUES (?,?,?,?,?)`,
    [id, req.user.id, target.id, 'pending', now]
  );
  res.status(201).json({ message: 'Friend request sent.', request: { id, to: publicUser(target) } });
});

// ---- List my pending requests (incoming + outgoing) ----
router.get('/requests', (req, res) => {
  const incoming = dbAll(
    `SELECT r.id, r.created_at, u.id as user_id, u.name, u.email
     FROM friend_requests r JOIN users u ON u.id = r.from_user_id
     WHERE r.to_user_id = ? AND r.status = 'pending' ORDER BY r.created_at DESC`,
    [req.user.id]
  ).map(r => ({ id: r.id, createdAt: r.created_at, from: { id: r.user_id, name: r.name, email: r.email } }));

  const outgoing = dbAll(
    `SELECT r.id, r.created_at, u.id as user_id, u.name, u.email
     FROM friend_requests r JOIN users u ON u.id = r.to_user_id
     WHERE r.from_user_id = ? AND r.status = 'pending' ORDER BY r.created_at DESC`,
    [req.user.id]
  ).map(r => ({ id: r.id, createdAt: r.created_at, to: { id: r.user_id, name: r.name, email: r.email } }));

  res.json({ incoming, outgoing });
});

// ---- Accept an incoming request ----
router.post('/requests/:id/accept', (req, res) => {
  const request = dbGet(`SELECT * FROM friend_requests WHERE id = ?`, [req.params.id]);
  if (!request || request.to_user_id !== req.user.id || request.status !== 'pending') {
    return res.status(404).json({ error: 'Request not found.' });
  }
  const now = Date.now();
  dbRun(`UPDATE friend_requests SET status = 'accepted', responded_at = ? WHERE id = ?`, [now, request.id]);
  dbRun(
    `INSERT INTO friendships (id, user_id_a, user_id_b, created_at) VALUES (?,?,?,?)`,
    [uuidv4(), request.from_user_id, request.to_user_id, now]
  );
  res.json({ message: 'Friend request accepted.' });
});

// ---- Decline an incoming request ----
router.post('/requests/:id/decline', (req, res) => {
  const request = dbGet(`SELECT * FROM friend_requests WHERE id = ?`, [req.params.id]);
  if (!request || request.to_user_id !== req.user.id || request.status !== 'pending') {
    return res.status(404).json({ error: 'Request not found.' });
  }
  dbRun(`UPDATE friend_requests SET status = 'declined', responded_at = ? WHERE id = ?`, [Date.now(), request.id]);
  res.json({ message: 'Friend request declined.' });
});

// ---- List my accepted friends ----
router.get('/', (req, res) => {
  const rows = dbAll(
    `SELECT f.*, 
            ua.id as a_id, ua.name as a_name, ua.email as a_email,
            ub.id as b_id, ub.name as b_name, ub.email as b_email
     FROM friendships f
     JOIN users ua ON ua.id = f.user_id_a
     JOIN users ub ON ub.id = f.user_id_b
     WHERE f.user_id_a = ? OR f.user_id_b = ?
     ORDER BY f.created_at DESC`,
    [req.user.id, req.user.id]
  );
  const friends = rows.map(r => {
    const isA = r.a_id === req.user.id;
    return {
      friendshipId: r.id,
      id: isA ? r.b_id : r.a_id,
      name: isA ? r.b_name : r.a_name,
      email: isA ? r.b_email : r.a_email,
      since: r.created_at,
    };
  });
  res.json({ friends });
});

module.exports = router;

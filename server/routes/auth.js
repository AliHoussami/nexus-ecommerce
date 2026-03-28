const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// Login
router.post('/login', async (req, res) => {
  const { email: identifier, password } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE name = ? OR email = ?', [identifier, identifier]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    req.session.userId   = user.id;
    req.session.userRole = user.role;
    req.session.userName = user.name;
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logged out' });
});

// Current user
router.get('/me', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = ?',
      [req.session.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All users
router.get('/users', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, name, email, role, created_at FROM users ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create user
router.post('/users', requireAuth, async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, role || 'support']
    );
    res.json({ id: result.insertId, name, email, role: role || 'support' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete user
router.delete('/users/:id', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

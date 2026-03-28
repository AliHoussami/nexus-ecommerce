const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireCustomerAuth } = require('../middleware/customer-auth');

router.post('/register', async (req, res) => {
  const { name, email, phone, password } = req.body;
  try {
    const [existing] = await db.query('SELECT id FROM customers WHERE email = ?', [email]);
    if (existing.length) return res.status(400).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO customers (name, email, phone, password) VALUES (?, ?, ?, ?)',
      [name, email, phone || null, hash]
    );
    req.session.customerId = result.insertId;
    res.json({ id: result.insertId, name, email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM customers WHERE email = ?', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid email or password' });
    const customer = rows[0];
    if (!customer.password) return res.status(401).json({ error: 'No password set. Please contact support.' });
    const valid = await bcrypt.compare(password, customer.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });
    req.session.customerId = customer.id;
    res.json({ id: customer.id, name: customer.name, email: customer.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', requireCustomerAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, phone, address, created_at FROM customers WHERE id = ?',
      [req.session.customerId]
    );
    if (!rows.length) { req.session.destroy(); return res.status(401).json({ error: 'Not found' }); }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ message: 'Logged out' }));
});

module.exports = router;

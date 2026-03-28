const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// Get all customers
router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT c.*, COUNT(o.id) as total_orders, COALESCE(SUM(o.total), 0) as total_spent
      FROM customers c
      LEFT JOIN orders o ON c.id = o.customer_id
      GROUP BY c.id
      ORDER BY c.name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single customer with order history
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const [customers] = await db.query('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (!customers.length) return res.status(404).json({ error: 'Customer not found' });

    const [orders] = await db.query(`
      SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC
    `, [req.params.id]);

    res.json({ ...customers[0], orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create customer
router.post('/', requireAuth, async (req, res) => {
  const { name, email, phone, address } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO customers (name, email, phone, address) VALUES (?, ?, ?, ?)',
      [name, email, phone, address]
    );
    res.json({ id: result.insertId, message: 'Customer created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update customer
router.put('/:id', requireAuth, async (req, res) => {
  const { name, email, phone, address } = req.body;
  try {
    await db.query(
      'UPDATE customers SET name=?, email=?, phone=?, address=? WHERE id=?',
      [name, email, phone, address, req.params.id]
    );
    res.json({ message: 'Customer updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

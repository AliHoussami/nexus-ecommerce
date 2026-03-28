const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// Get all returns
router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT r.*, c.name as customer_name, c.email as customer_email,
             o.order_number, o.total as order_total
      FROM returns r
      JOIN customers c ON r.customer_id = c.id
      JOIN orders o ON r.order_id = o.id
      ORDER BY r.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single return
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT r.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
             o.order_number, o.total as order_total, o.created_at as order_date
      FROM returns r
      JOIN customers c ON r.customer_id = c.id
      JOIN orders o ON r.order_id = o.id
      WHERE r.id = ?
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Return not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create return request
router.post('/', requireAuth, async (req, res) => {
  const { order_id, customer_id, reason, refund_amount } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO returns (order_id, customer_id, reason, refund_amount) VALUES (?, ?, ?, ?)',
      [order_id, customer_id, reason, refund_amount]
    );
    res.json({ id: result.insertId, message: 'Return request created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update return status
router.put('/:id/status', requireAuth, async (req, res) => {
  const { status, notes } = req.body;
  try {
    await db.query(
      'UPDATE returns SET status = ?, notes = COALESCE(?, notes), updated_at = NOW() WHERE id = ?',
      [status, notes, req.params.id]
    );
    res.json({ message: 'Return status updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// Get all orders
router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT o.*, c.name as customer_name, c.email as customer_email
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      ORDER BY o.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single order with items
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const [orders] = await db.query(`
      SELECT o.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.id = ?
    `, [req.params.id]);
    if (!orders.length) return res.status(404).json({ error: 'Order not found' });

    const [items] = await db.query(`
      SELECT oi.*, p.name as product_name, p.sku
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `, [req.params.id]);

    res.json({ ...orders[0], items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create order
router.post('/', requireAuth, async (req, res) => {
  const { customer_id, shipping_address, notes, items } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const orderNum = 'ORD-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-6);
    const [result] = await conn.query(
      'INSERT INTO orders (order_number, customer_id, total, shipping_address, notes) VALUES (?, ?, ?, ?, ?)',
      [orderNum, customer_id, total, shipping_address, notes]
    );
    for (const item of items) {
      await conn.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [result.insertId, item.product_id, item.quantity, item.price]
      );
    }
    await conn.commit();
    res.json({ id: result.insertId, order_number: orderNum, message: 'Order created' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// Update order status
router.put('/:id/status', requireAuth, async (req, res) => {
  const { status, notes } = req.body;
  try {
    await db.query(
      'UPDATE orders SET status = ?, notes = COALESCE(?, notes), updated_at = NOW() WHERE id = ?',
      [status, notes, req.params.id]
    );
    res.json({ message: 'Order status updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

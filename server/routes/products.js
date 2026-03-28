const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// Get all products with inventory
router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.*, COALESCE(i.quantity, 0) as stock, i.low_stock_threshold
      FROM products p
      LEFT JOIN inventory i ON p.id = i.product_id
      ORDER BY p.category, p.name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single product
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.*, COALESCE(i.quantity, 0) as stock, i.low_stock_threshold
      FROM products p
      LEFT JOIN inventory i ON p.id = i.product_id
      WHERE p.id = ?
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create product
router.post('/', requireAuth, async (req, res) => {
  const { name, sku, description, price, category, initial_stock, low_stock_threshold } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      'INSERT INTO products (name, sku, description, price, category) VALUES (?, ?, ?, ?, ?)',
      [name, sku, description, price, category]
    );
    await conn.query(
      'INSERT INTO inventory (product_id, quantity, low_stock_threshold) VALUES (?, ?, ?)',
      [result.insertId, initial_stock || 0, low_stock_threshold || 10]
    );
    await conn.commit();
    res.json({ id: result.insertId, message: 'Product created' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// Update product
router.put('/:id', requireAuth, async (req, res) => {
  const { name, sku, description, price, category } = req.body;
  try {
    await db.query(
      'UPDATE products SET name=?, sku=?, description=?, price=?, category=? WHERE id=?',
      [name, sku, description, price, category, req.params.id]
    );
    res.json({ message: 'Product updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete product
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

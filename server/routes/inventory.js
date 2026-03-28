const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// Get all inventory
router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT i.*, p.name as product_name, p.sku, p.category, p.price
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      ORDER BY p.category, p.name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get low stock items
router.get('/low-stock', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT i.*, p.name as product_name, p.sku, p.category
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      WHERE i.quantity <= i.low_stock_threshold
      ORDER BY i.quantity ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update stock quantity
router.put('/:productId', requireAuth, async (req, res) => {
  const { quantity, low_stock_threshold } = req.body;
  try {
    await db.query(
      'UPDATE inventory SET quantity = ?, low_stock_threshold = COALESCE(?, low_stock_threshold) WHERE product_id = ?',
      [quantity, low_stock_threshold, req.params.productId]
    );
    res.json({ message: 'Inventory updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Adjust stock (add/subtract)
router.post('/:productId/adjust', requireAuth, async (req, res) => {
  const { adjustment, reason } = req.body;
  try {
    await db.query(
      'UPDATE inventory SET quantity = GREATEST(0, quantity + ?) WHERE product_id = ?',
      [adjustment, req.params.productId]
    );
    res.json({ message: 'Stock adjusted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

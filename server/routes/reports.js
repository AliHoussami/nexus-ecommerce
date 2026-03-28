const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// Dashboard summary stats
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const [[orderStats]] = await db.query(`
      SELECT
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'pending'    THEN 1 ELSE 0 END) as pending_orders,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing_orders,
        SUM(CASE WHEN status = 'shipped'    THEN 1 ELSE 0 END) as shipped_orders,
        SUM(CASE WHEN status = 'delivered'  THEN 1 ELSE 0 END) as delivered_orders,
        SUM(CASE WHEN status = 'cancelled'  THEN 1 ELSE 0 END) as cancelled_orders,
        SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as orders_today,
        SUM(CASE WHEN DATE(created_at) = CURDATE() THEN total ELSE 0 END) as revenue_today,
        SUM(total) as total_revenue
      FROM orders
    `);

    const [[customerCount]] = await db.query('SELECT COUNT(*) as total FROM customers');
    const [[productCount]]  = await db.query('SELECT COUNT(*) as total FROM products');
    const [[lowStockCount]] = await db.query(
      'SELECT COUNT(*) as total FROM inventory WHERE quantity <= low_stock_threshold'
    );
    const [[pendingReturns]] = await db.query(
      "SELECT COUNT(*) as total FROM returns WHERE status = 'pending'"
    );
    const [[pendingTasks]] = await db.query(
      "SELECT COUNT(*) as total FROM tasks WHERE status != 'done'"
    );

    res.json({
      orders: orderStats,
      customers: customerCount.total,
      products: productCount.total,
      low_stock: lowStockCount.total,
      pending_returns: pendingReturns.total,
      pending_tasks: pendingTasks.total
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sales over last 30 days
router.get('/sales', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as order_count,
        SUM(total) as revenue
      FROM orders
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        AND status != 'cancelled'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Revenue by category
router.get('/by-category', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.category, SUM(oi.quantity * oi.price) as revenue, SUM(oi.quantity) as units_sold
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status != 'cancelled'
      GROUP BY p.category
      ORDER BY revenue DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Top products
router.get('/top-products', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.name, p.sku, p.category,
             SUM(oi.quantity) as units_sold,
             SUM(oi.quantity * oi.price) as revenue
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status != 'cancelled'
      GROUP BY p.id
      ORDER BY units_sold DESC
      LIMIT 10
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recent orders for dashboard
router.get('/recent-orders', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT o.id, o.order_number, o.status, o.total, o.created_at,
             c.name as customer_name
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      ORDER BY o.created_at DESC
      LIMIT 8
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

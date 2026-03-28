const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireCustomerAuth } = require('../middleware/customer-auth');

router.get('/dashboard', requireCustomerAuth, async (req, res) => {
  try {
    const cid = req.session.customerId;
    const [[stats]] = await db.query(`
      SELECT COUNT(*) as total_orders, COALESCE(SUM(total),0) as total_spent,
        SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status IN ('pending','processing','shipped') THEN 1 ELSE 0 END) as active
      FROM orders WHERE customer_id = ?`, [cid]);
    const [recent] = await db.query(
      'SELECT id, order_number, status, total, created_at FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 5',
      [cid]);
    const [[wc]] = await db.query('SELECT COUNT(*) as count FROM wishlists WHERE customer_id = ?', [cid]);
    res.json({ stats, recent_orders: recent, wishlist_count: wc.count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/orders', requireCustomerAuth, async (req, res) => {
  try {
    const [orders] = await db.query(
      'SELECT id, order_number, status, total, created_at FROM orders WHERE customer_id = ? ORDER BY created_at DESC',
      [req.session.customerId]);
    res.json(orders);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/orders/:id', requireCustomerAuth, async (req, res) => {
  try {
    const [orders] = await db.query(
      'SELECT * FROM orders WHERE id = ? AND customer_id = ?',
      [req.params.id, req.session.customerId]);
    if (!orders.length) return res.status(404).json({ error: 'Order not found' });
    const order = orders[0];
    const [items] = await db.query(
      'SELECT oi.*, p.name, p.sku, p.category FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?',
      [order.id]);
    order.items = items;
    res.json(order);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/returns', requireCustomerAuth, async (req, res) => {
  try {
    const [returns] = await db.query(
      'SELECT r.*, o.order_number FROM returns r JOIN orders o ON r.order_id = o.id WHERE r.customer_id = ? ORDER BY r.created_at DESC',
      [req.session.customerId]);
    res.json(returns);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/returns', requireCustomerAuth, async (req, res) => {
  const { order_id, reason, refund_amount } = req.body;
  try {
    const [orders] = await db.query(
      'SELECT id, total FROM orders WHERE id = ? AND customer_id = ?',
      [order_id, req.session.customerId]);
    if (!orders.length) return res.status(403).json({ error: 'Order not found' });
    const [result] = await db.query(
      'INSERT INTO returns (order_id, customer_id, reason, refund_amount, status) VALUES (?, ?, ?, ?, ?)',
      [order_id, req.session.customerId, reason, refund_amount || orders[0].total, 'pending']);
    res.json({ id: result.insertId, message: 'Return request submitted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/products', requireCustomerAuth, async (req, res) => {
  try {
    const { category, search, max_price, sort } = req.query;
    let sql = 'SELECT p.*, COALESCE(i.quantity,0) as stock FROM products p LEFT JOIN inventory i ON p.id = i.product_id WHERE 1=1';
    const params = [];
    if (category) { sql += ' AND p.category = ?'; params.push(category); }
    if (search) { sql += ' AND (p.name LIKE ? OR p.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (max_price) { sql += ' AND p.price <= ?'; params.push(parseFloat(max_price)); }
    if (sort === 'price_asc') sql += ' ORDER BY p.price ASC';
    else if (sort === 'price_desc') sql += ' ORDER BY p.price DESC';
    else sql += ' ORDER BY p.name ASC';
    const [products] = await db.query(sql, params);
    const [[cats]] = await db.query('SELECT GROUP_CONCAT(DISTINCT category ORDER BY category) as cats FROM products');
    res.json({ products, categories: cats.cats ? cats.cats.split(',') : [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/products/:id', requireCustomerAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT p.*, COALESCE(i.quantity,0) as stock FROM products p LEFT JOIN inventory i ON p.id = i.product_id WHERE p.id = ?',
      [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/wishlist', requireCustomerAuth, async (req, res) => {
  try {
    const [items] = await db.query(
      'SELECT p.*, COALESCE(i.quantity,0) as stock, w.created_at as added_at FROM wishlists w JOIN products p ON w.product_id = p.id LEFT JOIN inventory i ON p.id = i.product_id WHERE w.customer_id = ? ORDER BY w.created_at DESC',
      [req.session.customerId]);
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/wishlist', requireCustomerAuth, async (req, res) => {
  try {
    await db.query('INSERT IGNORE INTO wishlists (customer_id, product_id) VALUES (?, ?)',
      [req.session.customerId, req.body.product_id]);
    res.json({ message: 'Added to wishlist' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/wishlist/:productId', requireCustomerAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM wishlists WHERE customer_id = ? AND product_id = ?',
      [req.session.customerId, req.params.productId]);
    res.json({ message: 'Removed from wishlist' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/profile', requireCustomerAuth, async (req, res) => {
  const { name, phone, address } = req.body;
  try {
    await db.query('UPDATE customers SET name=?, phone=?, address=? WHERE id=?',
      [name, phone||null, address||null, req.session.customerId]);
    res.json({ message: 'Profile updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/profile/password', requireCustomerAuth, async (req, res) => {
  const { current_password, new_password } = req.body;
  try {
    const [rows] = await db.query('SELECT password FROM customers WHERE id=?', [req.session.customerId]);
    if (!rows.length || !rows[0].password) return res.status(400).json({ error: 'No password set' });
    const valid = await bcrypt.compare(current_password, rows[0].password);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE customers SET password=? WHERE id=?', [hash, req.session.customerId]);
    res.json({ message: 'Password updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- CART ---- */
router.get('/cart', requireCustomerAuth, async (req, res) => {
  try {
    const [items] = await db.query(`
      SELECT ci.id, ci.quantity, p.id as product_id, p.name, p.price, p.category, p.sku,
             COALESCE(i.quantity,0) as stock
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      LEFT JOIN inventory i ON p.id = i.product_id
      WHERE ci.customer_id = ?
      ORDER BY ci.created_at DESC`, [req.session.customerId]);
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cart', requireCustomerAuth, async (req, res) => {
  const { product_id, quantity = 1 } = req.body;
  try {
    await db.query(
      'INSERT INTO cart_items (customer_id, product_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?',
      [req.session.customerId, product_id, quantity, quantity]);
    res.json({ message: 'Added to cart' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/cart/:id', requireCustomerAuth, async (req, res) => {
  const { quantity } = req.body;
  try {
    if (quantity < 1) {
      await db.query('DELETE FROM cart_items WHERE id = ? AND customer_id = ?', [req.params.id, req.session.customerId]);
    } else {
      await db.query('UPDATE cart_items SET quantity = ? WHERE id = ? AND customer_id = ?', [quantity, req.params.id, req.session.customerId]);
    }
    res.json({ message: 'Cart updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/cart/:id', requireCustomerAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM cart_items WHERE id = ? AND customer_id = ?', [req.params.id, req.session.customerId]);
    res.json({ message: 'Removed from cart' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/cart', requireCustomerAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM cart_items WHERE customer_id = ?', [req.session.customerId]);
    res.json({ message: 'Cart cleared' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- CHECKOUT ---- */
router.post('/checkout', requireCustomerAuth, async (req, res) => {
  const { address, notes } = req.body;
  try {
    const cid = req.session.customerId;
    const [cartItems] = await db.query(`
      SELECT ci.quantity, p.id as product_id, p.price, p.name, COALESCE(i.quantity,0) as stock
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      LEFT JOIN inventory i ON p.id = i.product_id
      WHERE ci.customer_id = ?`, [cid]);

    if (!cartItems.length) return res.status(400).json({ error: 'Cart is empty' });

    // Check stock
    for (const item of cartItems) {
      if (item.stock < item.quantity) return res.status(400).json({ error: `"${item.name}" has insufficient stock (only ${item.stock} left)` });
    }

    const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const orderNumber = 'ORD-' + Date.now();

    const [orderResult] = await db.query(
      'INSERT INTO orders (customer_id, order_number, status, total, shipping_address, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [cid, orderNumber, 'pending', total, address || null, notes || null]);
    const orderId = orderResult.insertId;

    for (const item of cartItems) {
      await db.query('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [orderId, item.product_id, item.quantity, item.price]);
      await db.query('UPDATE inventory SET quantity = quantity - ? WHERE product_id = ?',
        [item.quantity, item.product_id]);
    }

    await db.query('DELETE FROM cart_items WHERE customer_id = ?', [cid]);

    res.json({ order_id: orderId, order_number: orderNumber, total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

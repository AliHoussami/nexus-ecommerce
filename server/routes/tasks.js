const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// Get all tasks
router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT t.*,
             u1.name as assigned_to_name,
             u2.name as created_by_name
      FROM tasks t
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users u2 ON t.created_by = u2.id
      ORDER BY
        FIELD(t.priority, 'urgent', 'high', 'medium', 'low'),
        t.due_date ASC,
        t.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create task
router.post('/', requireAuth, async (req, res) => {
  const { title, description, assigned_to, priority, due_date } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO tasks (title, description, assigned_to, created_by, priority, due_date) VALUES (?, ?, ?, ?, ?, ?)',
      [title, description, assigned_to || null, req.session.userId, priority || 'medium', due_date || null]
    );
    res.json({ id: result.insertId, message: 'Task created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update task
router.put('/:id', requireAuth, async (req, res) => {
  const { title, description, assigned_to, status, priority, due_date } = req.body;
  try {
    await db.query(
      'UPDATE tasks SET title=?, description=?, assigned_to=?, status=?, priority=?, due_date=? WHERE id=?',
      [title, description, assigned_to || null, status, priority, due_date || null, req.params.id]
    );
    res.json({ message: 'Task updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update task status only
router.patch('/:id/status', requireAuth, async (req, res) => {
  const { status } = req.body;
  try {
    await db.query('UPDATE tasks SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ message: 'Task status updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete task
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

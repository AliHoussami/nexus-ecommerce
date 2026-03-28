const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const OLLAMA_HOST  = process.env.OLLAMA_HOST  || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';

const SYSTEM_PROMPT = `You are Nexus AI, an internal assistant for an e-commerce company called Nexus.
RULES:
- Answer directly. Never show your reasoning, thinking process, or steps.
- When live database data is provided, use ONLY that data to answer. Do not invent anything.
- Be concise and factual. Use bullet points for lists.
- Never say "Let me think", "I need to", or explain what you are about to do. Just do it.`;

// Detect what data topics the message is about and fetch real data from DB
async function fetchContext(message) {
  const msg = message.toLowerCase();
  const context = [];

  try {
    if (msg.match(/task|in.?progress|todo|due|assign|pending task/)) {
      const [tasks] = await db.query(`
        SELECT t.title, t.status, t.priority, t.due_date, u.name as assigned_to
        FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id
        ORDER BY FIELD(t.priority,'urgent','high','medium','low'), t.due_date ASC`);
      if (tasks.length) context.push(`TASKS IN DATABASE (${tasks.length} total):\n` +
        tasks.map(t => `- [${t.status.toUpperCase()}] "${t.title}" | Priority: ${t.priority} | Assigned to: ${t.assigned_to || 'Unassigned'} | Due: ${t.due_date ? new Date(t.due_date).toDateString() : 'No date'}`).join('\n'));
    }

    if (msg.match(/order|shipment|ship|deliver|pending order|recent order/)) {
      const [orders] = await db.query(`
        SELECT o.order_number, o.status, o.total, o.created_at, c.name as customer
        FROM orders o JOIN customers c ON o.customer_id = c.id
        ORDER BY o.created_at DESC LIMIT 20`);
      if (orders.length) context.push(`RECENT ORDERS (${orders.length}):\n` +
        orders.map(o => `- ${o.order_number} | ${o.customer} | ${o.status.toUpperCase()} | $${o.total} | ${new Date(o.created_at).toDateString()}`).join('\n'));
    }

    if (msg.match(/inventor|stock|low.?stock|restock|warehouse/)) {
      const [inv] = await db.query(`
        SELECT p.name, p.sku, p.category, i.quantity, i.low_stock_threshold
        FROM inventory i JOIN products p ON i.product_id = p.id
        ORDER BY i.quantity ASC`);
      if (inv.length) context.push(`INVENTORY STATUS (${inv.length} products):\n` +
        inv.map(i => `- ${i.name} (${i.sku}) | Stock: ${i.quantity} | Min: ${i.low_stock_threshold} | ${i.quantity <= i.low_stock_threshold ? '⚠️ LOW STOCK' : 'OK'}`).join('\n'));
    }

    if (msg.match(/customer|client|buyer|top customer/)) {
      const [customers] = await db.query(`
        SELECT c.name, c.email, COUNT(o.id) as orders, COALESCE(SUM(o.total),0) as spent
        FROM customers c LEFT JOIN orders o ON c.id = o.customer_id
        GROUP BY c.id ORDER BY spent DESC`);
      if (customers.length) context.push(`CUSTOMERS (${customers.length}):\n` +
        customers.map(c => `- ${c.name} (${c.email}) | Orders: ${c.orders} | Total spent: $${parseFloat(c.spent).toFixed(2)}`).join('\n'));
    }

    if (msg.match(/return|refund|complaint/)) {
      const [returns] = await db.query(`
        SELECT r.id, r.status, r.reason, r.refund_amount, c.name as customer, o.order_number
        FROM returns r JOIN customers c ON r.customer_id = c.id JOIN orders o ON r.order_id = o.id
        ORDER BY r.created_at DESC`);
      if (returns.length) context.push(`RETURNS (${returns.length}):\n` +
        returns.map(r => `- #${r.id} | ${r.customer} | Order: ${r.order_number} | ${r.status.toUpperCase()} | Refund: $${r.refund_amount} | Reason: ${r.reason}`).join('\n'));
    }

    if (msg.match(/product|catalog|item|sku|category/)) {
      const [products] = await db.query(`
        SELECT p.name, p.sku, p.price, p.category, COALESCE(i.quantity,0) as stock
        FROM products p LEFT JOIN inventory i ON p.id = i.product_id
        ORDER BY p.category, p.name`);
      if (products.length) context.push(`PRODUCTS (${products.length}):\n` +
        products.map(p => `- ${p.name} (${p.sku}) | $${p.price} | Category: ${p.category} | Stock: ${p.stock}`).join('\n'));
    }

    if (msg.match(/report|revenue|sales|analytics|performance|summary|total/)) {
      const [[stats]] = await db.query(`
        SELECT COUNT(*) as total_orders,
               SUM(total) as total_revenue,
               SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) as delivered,
               SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending,
               SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) as cancelled
        FROM orders`);
      context.push(`BUSINESS SUMMARY:\n- Total Orders: ${stats.total_orders} | Revenue: $${parseFloat(stats.total_revenue||0).toFixed(2)} | Delivered: ${stats.delivered} | Pending: ${stats.pending} | Cancelled: ${stats.cancelled}`);
    }
  } catch (err) {
    // silently skip context if DB query fails
  }

  return context.length ? '\n\nLIVE DATA FROM DATABASE:\n' + context.join('\n\n') : '';
}

async function ollamaChat(messages) {
  const response = await axios.post(`${OLLAMA_HOST}/api/chat`, {
    model: OLLAMA_MODEL,
    messages,
    stream: false
  }, { timeout: 60000 });

  let content = response.data.message.content;

  // Strip thinking/reasoning blocks (DeepSeek-R1, QwQ, and similar models)
  content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // Strip lines that look like internal reasoning ("Let me think...", "I need to...", etc.)
  content = content.replace(/^(let me|i need to|i should|i'll|i will|okay,?\s*(so|let)|alright|thinking|first,?\s*i)[^\n]*/gim, '').trim();
  // Clean up extra blank lines left after stripping
  content = content.replace(/\n{3,}/g, '\n\n').trim();

  return content;
}

// Start new conversation or get all conversations
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM ai_conversations WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
      [req.session.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get messages for a conversation
router.get('/conversations/:id/messages', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send message in conversation
router.post('/chat', requireAuth, async (req, res) => {
  const { message, conversation_id } = req.body;
  try {
    let convId = conversation_id;

    // Create new conversation if needed
    if (!convId) {
      const title = message.slice(0, 60) + (message.length > 60 ? '...' : '');
      const [result] = await db.query(
        'INSERT INTO ai_conversations (user_id, title) VALUES (?, ?)',
        [req.session.userId, title]
      );
      convId = result.insertId;
    }

    // Save user message
    await db.query(
      'INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, ?, ?)',
      [convId, 'user', message]
    );

    // Get conversation history
    const [history] = await db.query(
      'SELECT role, content FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [convId]
    );

    // Fetch real database context based on what the user is asking
    const dataContext = await fetchContext(message);
    const systemWithContext = SYSTEM_PROMPT + dataContext;

    const messages = [
      { role: 'system', content: systemWithContext },
      ...history.map(m => ({ role: m.role, content: m.content }))
    ];

    // Call Ollama
    const reply = await ollamaChat(messages);

    // Save assistant message
    await db.query(
      'INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, ?, ?)',
      [convId, 'assistant', reply]
    );

    res.json({ reply, conversation_id: convId });
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      return res.status(503).json({ error: 'Ollama is not running. Please start Ollama and try again.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Generate product description
router.post('/generate-description', requireAuth, async (req, res) => {
  const { name, category, price, keywords } = req.body;
  try {
    const prompt = `Write ONE short product description (2-3 sentences only) for this product.
Product: ${name}
Category: ${category}
Price: $${price}
${keywords ? `Keywords: ${keywords}` : ''}

Rules: Write only the description text. No options, no headers, no bullet points, no markdown, no "Option 1" or "Here are". Just the description itself.`;

    const reply = await ollamaChat([
      { role: 'system', content: 'You are a professional e-commerce copywriter.' },
      { role: 'user',   content: prompt }
    ]);

    res.json({ description: reply });
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'Ollama is not running.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Generate support reply suggestion
router.post('/suggest-reply', requireAuth, async (req, res) => {
  const { customer_message, customer_name, order_info } = req.body;
  try {
    const prompt = `A customer named ${customer_name} sent this message:
"${customer_message}"
${order_info ? `\nContext: ${order_info}` : ''}

Write a professional, empathetic customer support reply. Be helpful and solution-oriented. Keep it concise (3-5 sentences).`;

    const reply = await ollamaChat([
      { role: 'system', content: 'You are a professional customer support agent for an e-commerce company.' },
      { role: 'user',   content: prompt }
    ]);

    res.json({ suggestion: reply });
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'Ollama is not running.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Generate marketing email
router.post('/generate-email', requireAuth, async (req, res) => {
  const { subject, campaign_type, details } = req.body;
  try {
    const prompt = `Write a marketing email for an e-commerce company.
Campaign: ${campaign_type}
Subject: ${subject}
Details: ${details}

Write a complete email with greeting, body (2-3 paragraphs), and call-to-action. Professional and engaging tone.`;

    const reply = await ollamaChat([
      { role: 'system', content: 'You are a professional marketing copywriter for an e-commerce company.' },
      { role: 'user',   content: prompt }
    ]);

    res.json({ email: reply });
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'Ollama is not running.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Streaming chat endpoint (SSE)
router.post('/chat-stream', requireAuth, async (req, res) => {
  const { message, conversation_id } = req.body;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = data => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    let convId = conversation_id;
    if (!convId) {
      const title = message.slice(0, 60) + (message.length > 60 ? '...' : '');
      const [result] = await db.query('INSERT INTO ai_conversations (user_id, title) VALUES (?, ?)', [req.session.userId, title]);
      convId = result.insertId;
    }
    await db.query('INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, ?, ?)', [convId, 'user', message]);
    const [history] = await db.query('SELECT role, content FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC', [convId]);
    const dataContext = await fetchContext(message);
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + dataContext },
      ...history.map(m => ({ role: m.role, content: m.content }))
    ];

    send({ conversation_id: convId });

    const response = await axios({
      method: 'post',
      url: `${OLLAMA_HOST}/api/chat`,
      data: { model: OLLAMA_MODEL, messages, stream: true },
      responseType: 'stream',
      timeout: 120000
    });

    let fullContent = '';
    let insideThink = false;
    let thinkBuf = '';
    let rawBuf = '';

    response.data.on('data', chunk => {
      rawBuf += chunk.toString();
      const lines = rawBuf.split('\n');
      rawBuf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.message?.content) {
            let token = data.message.content;
            fullContent += token;
            // Filter <think> blocks
            if (insideThink) {
              thinkBuf += token;
              if (thinkBuf.includes('</think>')) {
                const after = thinkBuf.split('</think>').slice(1).join('</think>');
                insideThink = false; thinkBuf = '';
                if (after.trim()) send({ token: after });
              }
            } else {
              if (token.includes('<think>')) {
                insideThink = true;
                const before = token.split('<think>')[0];
                thinkBuf = token.split('<think>').slice(1).join('<think>');
                if (before.trim()) send({ token: before });
                if (thinkBuf.includes('</think>')) {
                  const after = thinkBuf.split('</think>').slice(1).join('</think>');
                  insideThink = false; thinkBuf = '';
                  if (after.trim()) send({ token: after });
                }
              } else {
                send({ token });
              }
            }
          }
          if (data.done) {
            const cleaned = fullContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            db.query('INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, ?, ?)', [convId, 'assistant', cleaned]);
            send({ done: true });
            res.end();
          }
        } catch {}
      }
    });

    response.data.on('error', err => { send({ error: err.message }); res.end(); });

  } catch (err) {
    if (err.code === 'ECONNREFUSED') { send({ error: 'Ollama is not running.' }); }
    else { send({ error: err.message }); }
    res.end();
  }
});

// Delete conversation
router.delete('/conversations/:id', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM ai_conversations WHERE id = ? AND user_id = ?',
      [req.params.id, req.session.userId]);
    res.json({ message: 'Conversation deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

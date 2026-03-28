const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../db');
const { requireCustomerAuth } = require('../middleware/customer-auth');

const OLLAMA_HOST  = process.env.OLLAMA_HOST  || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';

const SYSTEM_PROMPT = `You are a friendly and expert shopping assistant for Nexus Store.
Your job is to recommend the best products from our catalog based on the customer's needs, preferences, and budget.
RULES:
- ONLY recommend products that exist in the AVAILABLE PRODUCTS list provided.
- Always mention the exact product name as it appears in the catalog (in **bold**).
- Strictly respect the customer's budget — never recommend products over budget.
- Be warm, enthusiastic, and helpful like a personal shopper.
- Explain clearly WHY each product fits their specific needs.
- If multiple products fit, rank them by best value/fit.
- Suggest accessories or complementary products when relevant.
- If no products match their needs/budget, say so honestly and suggest alternatives.
- Keep responses organized with clear sections.`;

function extractBudget(message) {
  const m = message.match(/\$?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(?:dollars?|usd|budget|bucks?)?/i);
  return m ? parseFloat(m[1].replace(',', '')) : null;
}

router.get('/conversations', requireCustomerAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM customer_ai_conversations WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20',
      [req.session.customerId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/conversations/:id/messages', requireCustomerAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM customer_ai_messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [req.params.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/conversations/:id', requireCustomerAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM customer_ai_conversations WHERE id = ? AND customer_id = ?',
      [req.params.id, req.session.customerId]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/recommend-stream', requireCustomerAuth, async (req, res) => {
  const { message, conversation_id, budget } = req.body;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = data => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    let convId = conversation_id;
    if (!convId) {
      const title = message.slice(0, 60) + (message.length > 60 ? '...' : '');
      const [result] = await db.query(
        'INSERT INTO customer_ai_conversations (customer_id, title) VALUES (?, ?)',
        [req.session.customerId, title]);
      convId = result.insertId;
    }

    await db.query('INSERT INTO customer_ai_messages (conversation_id, role, content) VALUES (?, ?, ?)',
      [convId, 'user', message]);
    const [history] = await db.query(
      'SELECT role, content FROM customer_ai_messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [convId]);

    const detectedBudget = budget || extractBudget(message);

    let productSql = `SELECT p.id, p.name, p.price, p.category, p.description, p.sku, COALESCE(i.quantity,0) as stock
      FROM products p LEFT JOIN inventory i ON p.id = i.product_id WHERE COALESCE(i.quantity,0) > 0`;
    const params = [];
    if (detectedBudget) { productSql += ' AND p.price <= ?'; params.push(detectedBudget * 1.15); }
    productSql += ' ORDER BY p.price ASC';
    const [products] = await db.query(productSql, params);

    const catalog = products.length
      ? `\n\nAVAILABLE PRODUCTS${detectedBudget ? ` (budget: $${detectedBudget})` : ''}:\n` +
        products.map(p => `[ID:${p.id}] ${p.name} | $${p.price} | ${p.category}${p.description ? ' | ' + p.description.slice(0,80) : ''}`).join('\n')
      : '\n\nNo products in stock match the specified criteria.';

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + catalog },
      ...history.map(m => ({ role: m.role, content: m.content }))
    ];

    send({ conversation_id: convId });
    if (detectedBudget) send({ budget: detectedBudget });

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
            db.query('INSERT INTO customer_ai_messages (conversation_id, role, content) VALUES (?, ?, ?)',
              [convId, 'assistant', cleaned]);
            // Match recommended products
            const mentionedIds = new Set();
            for (const m of cleaned.matchAll(/\[ID:(\d+)\]/g)) mentionedIds.add(parseInt(m[1]));
            products.forEach(p => {
              if (cleaned.toLowerCase().includes(p.name.toLowerCase())) mentionedIds.add(p.id);
            });
            const recommended = products.filter(p => mentionedIds.has(p.id));
            send({ done: true, products: recommended });
            res.end();
          }
        } catch {}
      }
    });

    response.data.on('error', err => { send({ error: err.message }); res.end(); });

  } catch (err) {
    send({ error: err.code === 'ECONNREFUSED' ? 'AI is offline. Please try again.' : err.message });
    res.end();
  }
});

module.exports = router;

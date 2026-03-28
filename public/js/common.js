// ============================================================
// Nexus — Shared API, Theme, Sidebar, Utilities
// ============================================================

/* ---------- API ---------- */
const API = {
  async request(method, url, data) {
    const opts = { method, credentials: 'include', headers: {} };
    if (data) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(data); }
    const res = await fetch(url, opts);
    if (res.status === 401) { window.location.href = '/index.html'; return null; }
    return res.json();
  },
  get:    url       => API.request('GET',    url),
  post:   (url, d)  => API.request('POST',   url, d),
  put:    (url, d)  => API.request('PUT',    url, d),
  patch:  (url, d)  => API.request('PATCH',  url, d),
  delete: url       => API.request('DELETE', url),
};

/* ---------- THEME ---------- */
function initTheme() {
  if (localStorage.getItem('nexus-theme') === 'dark' ||
      (!localStorage.getItem('nexus-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
}

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('nexus-theme', isDark ? 'dark' : 'light');
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = isDark ? '☀️' : '🌙';
}

initTheme();

/* ---------- AUTH ---------- */
async function checkAuth() {
  const user = await API.get('/api/auth/me');
  if (!user) return null;
  const name = document.getElementById('user-name');
  const role = document.getElementById('user-role');
  const av   = document.getElementById('user-avatar');
  if (name) name.textContent = user.name;
  if (role) role.textContent = capitalize(user.role);
  if (av)   av.textContent   = user.name.charAt(0).toUpperCase();
  return user;
}

async function logout() {
  await API.post('/api/auth/logout');
  window.location.href = '/index.html';
}

/* ---------- SIDEBAR ---------- */
function renderSidebar(activePage) {
  const nav = [
    { id: 'dashboard', label: 'Dashboard',   icon: '📊', href: '/dashboard.html' },
    { id: 'orders',    label: 'Orders',       icon: '🛍️', href: '/orders.html' },
    { id: 'products',  label: 'Products',     icon: '📦', href: '/products.html' },
    { id: 'inventory', label: 'Inventory',    icon: '🏭', href: '/inventory.html' },
    { id: 'customers', label: 'Customers',    icon: '👥', href: '/customers.html' },
    { id: 'returns',   label: 'Returns',      icon: '↩️',  href: '/returns.html' },
    { id: 'tasks',     label: 'Tasks',        icon: '✅', href: '/tasks.html' },
    { id: 'reports',   label: 'Reports',      icon: '📈', href: '/reports.html' },
    { id: 'ai',        label: 'AI Assistant', icon: '🤖', href: '/ai.html' },
  ];

  const links = nav.map(item => `
    <a href="${item.href}" class="nav-item ${item.id === activePage ? 'active' : ''}">
      <span class="nav-icon">${item.icon}</span>
      <span>${item.label}</span>
    </a>`).join('');

  document.getElementById('sidebar-container').innerHTML = `
    <aside class="sidebar">
      <div class="sidebar-logo">
        <div class="sidebar-logo-icon">⚡</div>
        <div>
          <h1>Nexus</h1>
          <p>E-Commerce Assistant</p>
        </div>
      </div>
      <nav class="sidebar-nav">${links}</nav>
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="s-avatar" id="user-avatar">?</div>
          <div style="flex:1;min-width:0">
            <div class="s-name" id="user-name">Loading...</div>
            <div class="s-role" id="user-role"></div>
          </div>
        </div>
        <button class="sidebar-logout" onclick="logout()">
          <span>⎋</span> Sign out
        </button>
      </div>
    </aside>`;
}

/* ---------- FORMATTERS ---------- */
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ') : ''; }
function formatCurrency(n) { return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(n||0); }
function formatDate(d) { return d ? new Date(d).toLocaleDateString('en-US',{ month:'short', day:'numeric', year:'numeric' }) : '—'; }
function formatDateTime(d) { return d ? new Date(d).toLocaleString('en-US',{ month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'; }
function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return Math.floor(s/60)   + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

/* ---------- BADGES ---------- */
function statusBadge(status) {
  const map = {
    pending:    'b-yellow', processing: 'b-blue',   shipped:   'b-purple',
    delivered:  'b-green',  cancelled:  'b-red',    approved:  'b-green',
    rejected:   'b-red',    completed:  'b-gray',   todo:      'b-gray',
    in_progress:'b-blue',   done:       'b-green',  open:      'b-yellow',
    resolved:   'b-green',
  };
  return `<span class="badge ${map[status]||'b-gray'}">${capitalize(status)}</span>`;
}
function priorityBadge(p) {
  const map = { low:'b-gray', medium:'b-blue', high:'b-yellow', urgent:'b-red' };
  const dot = { low:'#94a3b8', medium:'#3b82f6', high:'#f59e0b', urgent:'#ef4444' }[p] || '#94a3b8';
  return `<span class="badge ${map[p]||'b-gray'}"><span style="width:6px;height:6px;border-radius:50%;background:${dot};display:inline-block;flex-shrink:0"></span>${capitalize(p)}</span>`;
}

/* ---------- TOAST ---------- */
function showToast(msg, type = 'success') {
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type]||'✓'}</span> ${msg}`;
  document.body.appendChild(t);
  setTimeout(() => { t.style.animation = 'toastOut .3s ease forwards'; setTimeout(() => t.remove(), 300); }, 3000);
}

/* ---------- MODAL ---------- */
function openModal(id) {
  const el = document.getElementById(id);
  el.classList.remove('hidden');
  requestAnimationFrame(() => el.classList.add('open'));
}
function closeModal(id) {
  const el = document.getElementById(id);
  el.classList.remove('open');
  setTimeout(() => el.classList.add('hidden'), 200);
}

/* ---------- MARKDOWN RENDERER ---------- */
function renderMarkdown(text) {
  return text.trim()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    // code blocks
    .replace(/```[\s\S]*?```/g, m => `<pre style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:12px;overflow-x:auto;margin:8px 0"><code>${m.slice(3,-3).replace(/^[a-z]+\n/,'')}</code></pre>`)
    // inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // headings
    .replace(/^### (.+)$/gm, '<h3 style="font-size:14px;font-weight:700;margin:12px 0 6px">$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2 style="font-size:15px;font-weight:700;margin:14px 0 6px">$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1 style="font-size:16px;font-weight:800;margin:14px 0 8px">$1</h1>')
    // horizontal rule
    .replace(/^---$/gm, '<hr>')
    // unordered list
    .replace(/^[*-] (.+)$/gm, '<li style="margin-bottom:3px">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>[\n]?)+/g, m => `<ul style="padding-left:18px;margin:6px 0">${m}</ul>`)
    // ordered list
    .replace(/^\d+\. (.+)$/gm, '<li style="margin-bottom:3px">$1</li>')
    // paragraphs & line breaks
    .replace(/\n\n/g, '</p><p style="margin-bottom:8px">')
    .replace(/\n/g, '<br>');
}

/* ---------- STREAMING CHAT ---------- */
async function streamChat(message, convId, onToken, onDone, onError) {
  try {
    const res = await fetch('/api/ai/chat-stream', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, conversation_id: convId })
    });
    if (!res.ok) { const e = await res.json(); onError(e.error || 'Error'); return null; }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let newConvId = convId;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.conversation_id) newConvId = data.conversation_id;
          if (data.token)   onToken(data.token);
          if (data.done)    onDone(newConvId);
          if (data.error)   onError(data.error);
        } catch {}
      }
    }
    return newConvId;
  } catch (err) {
    onError(err.message);
    return null;
  }
}

// ============================================================
// Nexus Store — Customer Portal Shared Utilities
// ============================================================

/* ---------- API ---------- */
const CAPI = {
  async request(method, url, data) {
    const opts = { method, credentials: 'include', headers: {} };
    if (data) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(data); }
    const res = await fetch(url, opts);
    if (res.status === 401) { window.location.href = '/customer/login.html'; return null; }
    return res.json();
  },
  get:    url       => CAPI.request('GET',    url),
  post:   (url, d)  => CAPI.request('POST',   url, d),
  put:    (url, d)  => CAPI.request('PUT',    url, d),
  delete: url       => CAPI.request('DELETE', url),
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
let _currentCustomer = null;
async function checkCustomerAuth() {
  const customer = await CAPI.get('/api/customer/auth/me');
  if (!customer) return null;
  _currentCustomer = customer;
  const nameEl   = document.getElementById('c-user-name');
  const avatarEl = document.getElementById('c-user-avatar');
  if (nameEl)   nameEl.textContent   = customer.name;
  if (avatarEl) avatarEl.textContent = customer.name.charAt(0).toUpperCase();
  return customer;
}
async function customerLogout() {
  await CAPI.post('/api/customer/auth/logout');
  window.location.href = '/customer/login.html';
}

/* ---------- NAVBAR ---------- */
function renderCustomerNav(activePage) {
  const links = [
    { id: 'home',    label: 'Home',       icon: '🏠', href: '/customer/dashboard.html' },
    { id: 'shop',    label: 'Shop',       icon: '🛍️', href: '/customer/shop.html' },
    { id: 'orders',  label: 'My Orders',  icon: '📦', href: '/customer/orders.html' },
    { id: 'returns', label: 'Returns',    icon: '↩️',  href: '/customer/returns.html' },
    { id: 'advisor', label: 'AI Advisor', icon: '✨', href: '/customer/ai-advisor.html' },
  ];

  const navHtml = `
    <nav class="c-nav">
      <div class="c-nav-inner">
        <a href="/customer/dashboard.html" class="c-nav-logo">
          <div class="c-nav-logo-icon">⚡</div>
          Nexus <span>Store</span>
        </a>
        <div class="c-nav-links">
          ${links.map(l => `
            <a href="${l.href}" class="c-nav-link ${l.id === activePage ? 'active' : ''}">
              ${l.icon} ${l.label}
            </a>`).join('')}
        </div>
        <div class="c-nav-right">
          <button class="theme-toggle" id="theme-toggle" onclick="toggleTheme()">🌙</button>
          <button class="c-nav-icon-btn" onclick="window.location.href='/customer/shop.html?wishlist=1'" title="Wishlist" id="wishlist-btn">
            ♡
            <span class="c-nav-badge" id="wishlist-count" style="display:none">0</span>
          </button>
          <button class="c-nav-icon-btn" onclick="openCart()" title="Cart" id="cart-nav-btn">
            🛒
            <span class="c-nav-badge" id="cart-count" style="display:none">0</span>
          </button>
          <div class="c-nav-avatar" id="c-user-avatar" title="My Account" onclick="window.location.href='/customer/profile.html'">?</div>
        </div>
      </div>
    </nav>`;

  document.body.insertAdjacentHTML('afterbegin', navHtml);
  document.getElementById('theme-toggle').textContent = document.documentElement.classList.contains('dark') ? '☀️' : '🌙';

  // Load wishlist count
  CAPI.get('/api/customer/wishlist').then(items => {
    if (items && items.length) {
      const badge = document.getElementById('wishlist-count');
      if (badge) { badge.textContent = items.length; badge.style.display = 'flex'; }
    }
  });

  // Inject cart drawer into DOM
  document.body.insertAdjacentHTML('beforeend', `
    <div class="c-cart-overlay" id="cart-overlay" onclick="closeCart(event)">
      <div class="c-cart-drawer" id="cart-drawer">
        <div class="c-cart-head">
          <div class="c-cart-title">🛒 Your Cart <span class="c-cart-count" id="cart-item-count">0</span></div>
          <button class="c-modal-close" onclick="closeCart()">✕</button>
        </div>
        <div class="c-cart-items" id="cart-items-list">
          <div style="text-align:center;padding:60px;color:var(--text-3)">Loading…</div>
        </div>
        <div class="c-cart-footer" id="cart-footer" style="display:none">
          <div class="c-cart-subtotal">
            <span class="label">Subtotal</span>
            <span class="val" id="cart-total">$0.00</span>
          </div>
          <button class="c-btn c-btn-primary c-btn-lg" style="width:100%;justify-content:center" onclick="openCheckout()">
            Proceed to Checkout →
          </button>
          <button class="c-btn c-btn-ghost c-btn-sm" style="width:100%;justify-content:center;color:var(--danger)" onclick="clearCart()">
            Clear Cart
          </button>
        </div>
      </div>
    </div>

    <!-- Checkout Modal -->
    <div class="c-modal-overlay hidden" id="checkout-modal">
      <div class="c-modal" style="max-width:520px">
        <div class="c-modal-head">
          <span class="c-modal-title">Checkout</span>
          <button class="c-modal-close" onclick="cCloseModal('checkout-modal')">✕</button>
        </div>
        <div class="c-modal-body">
          <div class="c-checkout-steps">
            <div class="c-checkout-step active" id="step-1">1. Delivery</div>
            <div class="c-checkout-step" id="step-2">2. Review</div>
            <div class="c-checkout-step" id="step-3">3. Done</div>
          </div>
          <div id="checkout-step-1">
            <div class="c-form-group">
              <label class="c-label">Delivery Address</label>
              <textarea class="c-input c-textarea" id="co-address" rows="3" placeholder="Enter your full delivery address…"></textarea>
            </div>
            <div class="c-form-group">
              <label class="c-label">Order Notes (optional)</label>
              <input class="c-input" id="co-notes" placeholder="Special instructions for delivery…">
            </div>
            <button class="c-btn c-btn-primary" style="width:100%;justify-content:center" onclick="goToCheckoutReview()">
              Continue to Review →
            </button>
          </div>
          <div id="checkout-step-2" style="display:none">
            <div id="checkout-review-items" style="margin-bottom:16px"></div>
            <div style="background:var(--surface-2);border-radius:var(--r-md);padding:16px;margin-bottom:16px">
              <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:8px">
                <span style="color:var(--text-2)">Shipping</span><span style="color:var(--success);font-weight:600">Free</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:800">
                <span>Total</span><span style="color:var(--accent)" id="checkout-total-display">$0.00</span>
              </div>
            </div>
            <div style="display:flex;gap:10px">
              <button class="c-btn c-btn-ghost" onclick="goToCheckoutStep(1)" style="flex:1;justify-content:center">← Back</button>
              <button class="c-btn c-btn-primary" onclick="placeOrder()" id="place-order-btn" style="flex:2;justify-content:center">Place Order 🎉</button>
            </div>
          </div>
          <div id="checkout-step-3" style="display:none;text-align:center;padding:20px 0">
            <div style="font-size:56px;margin-bottom:16px">🎉</div>
            <div style="font-size:22px;font-weight:800;color:var(--text);margin-bottom:8px">Order Placed!</div>
            <div style="font-size:14px;color:var(--text-2);margin-bottom:6px">Your order number is:</div>
            <div style="font-size:20px;font-weight:800;color:var(--accent);margin-bottom:20px" id="checkout-order-num"></div>
            <div style="display:flex;flex-direction:column;gap:10px">
              <a id="checkout-view-order" href="#" class="c-btn c-btn-primary" style="justify-content:center">View Order →</a>
              <button class="c-btn c-btn-ghost" onclick="cCloseModal('checkout-modal')" style="justify-content:center">Continue Shopping</button>
            </div>
          </div>
        </div>
      </div>
    </div>`);

  // Init cart count
  refreshCartCount();
}

/* ---------- CART ---------- */
let _cartItems = [];

async function refreshCartCount() {
  const items = await CAPI.get('/api/customer/cart');
  _cartItems = items || [];
  const total = _cartItems.reduce((s, i) => s + i.quantity, 0);
  const badge = document.getElementById('cart-count');
  if (badge) { badge.textContent = total; badge.style.display = total ? 'flex' : 'none'; }
  return _cartItems;
}

async function addToCart(productId, qty = 1) {
  const res = await CAPI.post('/api/customer/cart', { product_id: productId, quantity: qty });
  if (res && !res.error) {
    cShowToast('Added to cart!', 'success');
    refreshCartCount();
  } else {
    cShowToast(res?.error || 'Failed to add to cart', 'error');
  }
}

function openCart() {
  document.getElementById('cart-overlay').classList.add('open');
  loadCartDrawer();
}

function closeCart(e) {
  if (e && e.target !== document.getElementById('cart-overlay')) return;
  document.getElementById('cart-overlay').classList.remove('open');
}

async function loadCartDrawer() {
  const items = await refreshCartCount();
  const list   = document.getElementById('cart-items-list');
  const footer = document.getElementById('cart-footer');
  document.getElementById('cart-item-count').textContent = items.reduce((s, i) => s + i.quantity, 0);

  if (!items.length) {
    list.innerHTML = `<div style="text-align:center;padding:60px 24px;color:var(--text-3)">
      <div style="font-size:48px;margin-bottom:12px">🛒</div>
      <div style="font-size:15px;font-weight:600;color:var(--text-2)">Your cart is empty</div>
      <div style="margin-top:12px"><a href="/customer/shop.html" class="c-btn c-btn-primary c-btn-sm">Browse Products</a></div>
    </div>`;
    footer.style.display = 'none';
    return;
  }

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  list.innerHTML = items.map(item => `
    <div class="c-cart-item" id="cart-item-${item.id}">
      <div class="c-cart-item-img">${categoryEmoji(item.category)}</div>
      <div class="c-cart-item-info">
        <div class="c-cart-item-name">${item.name}</div>
        <div class="c-cart-item-price">${cFormatCurrency(item.price)} each</div>
        <div class="c-cart-item-qty">
          <button class="c-qty-btn" onclick="updateCartQty(${item.id}, ${item.quantity - 1})">−</button>
          <span class="c-qty-val">${item.quantity}</span>
          <button class="c-qty-btn" onclick="updateCartQty(${item.id}, ${item.quantity + 1})" ${item.quantity >= item.stock ? 'disabled style="opacity:.4"' : ''}>+</button>
          <span style="font-size:12px;color:var(--text-3);margin-left:4px">${cFormatCurrency(item.price * item.quantity)}</span>
        </div>
      </div>
      <button class="c-cart-item-del" onclick="removeCartItem(${item.id})">✕</button>
    </div>
  `).join('');

  document.getElementById('cart-total').textContent = cFormatCurrency(subtotal);
  footer.style.display = 'flex';
}

async function updateCartQty(itemId, newQty) {
  await CAPI.put('/api/customer/cart/' + itemId, { quantity: newQty });
  loadCartDrawer();
}

async function removeCartItem(itemId) {
  await CAPI.delete('/api/customer/cart/' + itemId);
  loadCartDrawer();
}

async function clearCart() {
  await CAPI.delete('/api/customer/cart');
  loadCartDrawer();
}

function openCheckout() {
  document.getElementById('cart-overlay').classList.remove('open');
  goToCheckoutStep(1);
  cOpenModal('checkout-modal');
  // Pre-fill address from profile
  CAPI.get('/api/customer/auth/me').then(c => {
    if (c && c.address) document.getElementById('co-address').value = c.address;
  });
}

function goToCheckoutStep(n) {
  [1,2,3].forEach(i => {
    document.getElementById('checkout-step-' + i).style.display = i === n ? '' : 'none';
    const stepEl = document.getElementById('step-' + i);
    stepEl.className = 'c-checkout-step' + (i < n ? ' done' : i === n ? ' active' : '');
  });
}

async function goToCheckoutReview() {
  const address = document.getElementById('co-address').value.trim();
  if (!address) { cShowToast('Please enter a delivery address', 'error'); return; }
  const items = _cartItems;
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  document.getElementById('checkout-review-items').innerHTML = items.map(i => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:22px">${categoryEmoji(i.category)}</span>
        <div>
          <div style="font-weight:600;font-size:13.5px">${i.name}</div>
          <div style="font-size:12px;color:var(--text-3)">Qty: ${i.quantity}</div>
        </div>
      </div>
      <div style="font-weight:700">${cFormatCurrency(i.price * i.quantity)}</div>
    </div>`).join('');
  document.getElementById('checkout-total-display').textContent = cFormatCurrency(subtotal);
  goToCheckoutStep(2);
}

async function placeOrder() {
  const btn = document.getElementById('place-order-btn');
  btn.disabled = true; btn.textContent = 'Placing order…';
  const res = await CAPI.post('/api/customer/checkout', {
    address: document.getElementById('co-address').value,
    notes:   document.getElementById('co-notes').value,
  });
  btn.disabled = false; btn.textContent = 'Place Order 🎉';
  if (res && !res.error) {
    document.getElementById('checkout-order-num').textContent = res.order_number;
    document.getElementById('checkout-view-order').href = '/customer/order.html?id=' + res.order_id;
    goToCheckoutStep(3);
    refreshCartCount();
  } else {
    cShowToast(res?.error || 'Checkout failed', 'error');
  }
}

/* ---------- FORMATTERS ---------- */
function cFormatCurrency(n) { return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(n||0); }
function cFormatDate(d)      { return d ? new Date(d).toLocaleDateString('en-US',{ month:'short', day:'numeric', year:'numeric' }) : '—'; }
function cCapitalize(s)      { return s ? s.charAt(0).toUpperCase() + s.slice(1).replace('_',' ') : ''; }

/* ---------- BADGES ---------- */
function cStatusBadge(status) {
  const map = {
    pending:'cb-yellow', processing:'cb-blue', shipped:'cb-purple',
    delivered:'cb-green', cancelled:'cb-red', approved:'cb-green',
    rejected:'cb-red', completed:'cb-gray',
  };
  return `<span class="c-badge ${map[status]||'cb-gray'}">${cCapitalize(status)}</span>`;
}

/* ---------- PRODUCT EMOJI ---------- */
function categoryEmoji(cat) {
  const map = {
    'Electronics':'💻', 'Furniture':'🪑', 'Clothing':'👕', 'Books':'📚',
    'Sports':'⚽', 'Toys':'🧸', 'Home':'🏠', 'Kitchen':'🍳',
    'Beauty':'💄', 'Automotive':'🚗', 'Garden':'🌱', 'Music':'🎵',
  };
  if (!cat) return '📦';
  for (const [k, v] of Object.entries(map)) {
    if (cat.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return '📦';
}

/* ---------- TOAST ---------- */
function cShowToast(msg, type = 'success') {
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const t = document.createElement('div');
  t.className = `c-toast ${type}`;
  t.innerHTML = `<span>${icons[type]||'✓'}</span> ${msg}`;
  document.body.appendChild(t);
  setTimeout(() => { t.style.animation = 'none'; t.style.opacity = '0'; t.style.transform = 'translateY(20px)'; t.style.transition = 'all .3s'; setTimeout(() => t.remove(), 300); }, 3000);
}

/* ---------- MODAL ---------- */
function cOpenModal(id) {
  const el = document.getElementById(id);
  el.classList.remove('hidden');
  requestAnimationFrame(() => el.classList.add('open'));
}
function cCloseModal(id) {
  const el = document.getElementById(id);
  el.classList.remove('open');
  setTimeout(() => el.classList.add('hidden'), 200);
}

/* ---------- MARKDOWN ---------- */
function cRenderMarkdown(text) {
  return text.trim()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/```[\s\S]*?```/g, m => `<pre style="background:var(--surface-3);border-radius:8px;padding:12px;overflow-x:auto;margin:8px 0"><code>${m.slice(3,-3).replace(/^[a-z]+\n/,'')}</code></pre>`)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:14px;font-weight:700;margin:10px 0 5px">$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2 style="font-size:15px;font-weight:700;margin:12px 0 6px">$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1 style="font-size:16px;font-weight:800;margin:14px 0 8px">$1</h1>')
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:10px 0">')
    .replace(/^[*-] (.+)$/gm, '<li style="margin-bottom:4px">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>[\n]?)+/g, m => `<ul style="padding-left:18px;margin:6px 0">${m}</ul>`)
    .replace(/^\d+\. (.+)$/gm, '<li style="margin-bottom:4px">$1</li>')
    .replace(/\n\n/g, '</p><p style="margin-bottom:8px">')
    .replace(/\n/g, '<br>');
}

/* ---------- AI STREAMING ---------- */
async function streamAdvisor(message, convId, budget, onToken, onDone, onError) {
  try {
    const res = await fetch('/api/customer/ai/recommend-stream', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, conversation_id: convId, budget })
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
          if (data.token)    onToken(data.token);
          if (data.done)     onDone(newConvId, data.products || []);
          if (data.error)    onError(data.error);
        } catch {}
      }
    }
    return newConvId;
  } catch (err) {
    onError(err.message);
    return null;
  }
}

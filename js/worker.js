// ============================================================
// worker.js  –  Worker portal
//  • Checks session set by customer.js login → if not worker, redirect
//  • Listens to orders collection in real-time with onSnapshot()
//  • Displays orders with paid_status badge and order items
//  • Worker can mark an order as "Prepared"
//  • Firebase is ONLY used for Firestore (orders) — no Firebase Auth
// ============================================================

import { db } from './firebase-config.js';
import {
  collection, onSnapshot, doc, updateDoc, query
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ── Sync Site Branding ─────────────────────────────────────────
onSnapshot(doc(db, 'settings', 'branding'), (snapshot) => {
  if (snapshot.exists()) {
    const data = snapshot.data();
    if (data.ownerLogo) {
      const allDynamicLogos = document.querySelectorAll('#dynamic-owner-logo');
      allDynamicLogos.forEach(img => img.src = data.ownerLogo);
    }
  }
});

// ── DOM refs ─────────────────────────────────────────────────
const ordersContainer = document.getElementById('live-orders-container');
const userEmailEl     = document.getElementById('user-email');
const logoutBtn       = document.getElementById('logout-btn');
const totalCountEl    = document.getElementById('total-count');
const paidCountEl     = document.getElementById('paid-count');
const pendingCountEl  = document.getElementById('pending-count');

// ── Session-based auth guard ─────────────────────────────────
// The role is set in sessionStorage by customer.js when worker logs in
const staffRole = sessionStorage.getItem('staffRole');
if (staffRole !== 'worker') {
  // Not a logged-in worker → send back to shop
  window.location.href = 'customer.html';
}

// Show the username in the header
if (userEmailEl) userEmailEl.textContent = 'worker@farm2buy.in';

// ── Logout ───────────────────────────────────────────────────
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem('staffRole');
    window.location.href = 'customer.html';
  });
}

// ── Real-time order listener ─────────────────────────────────
function startOrderListener() {
  ordersContainer.innerHTML = '<div class="loader"><span class="spinner"></span>Connecting to live feed…</div>';

  const q = query(collection(db, 'orders'));
  let isInitialLoad = true;

  onSnapshot(q, (snapshot) => {
    // Check for NEW orders specifically (not just updates or initial load)
    const hasNewOrders = snapshot.docChanges().some(change => change.type === 'added');
    if (!isInitialLoad && hasNewOrders) {
      playNotificationSound();
      showToast('🔔 New Order Arrived!', 'success');
    }
    isInitialLoad = false;
    // Sort client-side: newest first (no Firestore index required)
    const docs = [...snapshot.docs].sort((a, b) => {
      const ta = a.data().timestamp?.seconds || 0;
      const tb = b.data().timestamp?.seconds || 0;
      return tb - ta;
    });
    const paidDocs = docs.filter(d => d.data().paid_status === 'Paid');
    const pendDocs = docs.filter(d => d.data().paid_status === 'Pending');

    if (totalCountEl)   totalCountEl.textContent   = docs.length;
    if (paidCountEl)    paidCountEl.textContent    = paidDocs.length;
    if (pendingCountEl) pendingCountEl.textContent = pendDocs.length;

    if (docs.length === 0) {
      ordersContainer.innerHTML = `
        <div class="empty-state">
          <span class="icon">📋</span>
          No orders yet. Waiting for customers…
        </div>`;
      return;
    }

    ordersContainer.innerHTML = '';
    docs.forEach(docSnap => {
      const order = { id: docSnap.id, ...docSnap.data() };
      ordersContainer.appendChild(buildOrderCard(order));
    });
  }, (err) => {
    console.error('onSnapshot error:', err);
    ordersContainer.innerHTML = `
      <div class="empty-state">
        <span class="icon">⚠️</span>
        Failed to load orders. Check Firestore rules.
      </div>`;
  });
}

startOrderListener();

// ── Build a single order card ─────────────────────────────────
function buildOrderCard(order) {
  const isPaid     = order.paid_status === 'Paid';
  const isPrepared = order.order_status === 'Prepared';

  const card = document.createElement('div');
  const isFiveStar = order.rating === 5;
  card.className = `order-card ${isPaid ? 'paid' : 'pending'} ${isFiveStar ? 'five-star' : ''}`;
  card.id        = `order-${order.id}`;

  const itemsHtml = Array.isArray(order.items)
    ? order.items.map(i => `<span>${escHtml(i.name)} — ₹${Number(i.price).toFixed(2)}</span>`).join('<br>')
    : '<span>No items info</span>';

  const timestamp = order.timestamp?.toDate
    ? order.timestamp.toDate().toLocaleString()
    : '—';

  card.innerHTML = `
    <div class="order-info">
      <p class="order-id" style="color: #60a5fa; font-family: monospace;">🆔 ${order.id}</p>
      <h3 style="color: #4ade80; font-size: 1.5rem; letter-spacing: -0.5px;">₹${Number(order.total_amount || 0).toFixed(2)}</h3>
      <div class="items-list" style="color: #fef08a; background: rgba(254, 240, 138, 0.05); border-left: 2px solid #fef08a; padding-left: 10px;">${itemsHtml}</div>
      <p class="meta" style="font-size: 0.95rem; line-height: 1.6;">
        <strong style="color: #fff;">👤 Customer:</strong> <span style="color: #e2e8f0; font-weight: 600;">${escHtml(order.customer_name || '—')}</span><br>
        <strong style="color: #fff;">📞 Mobile:</strong> <span style="color: #fb923c; font-weight: 700; font-size: 1rem;">${escHtml(order.customer_mobile || '—')}</span><br>
        <strong style="color: #fff;">📍 Address:</strong> <span style="color: #f9fafb; display: inline-block; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;">${escHtml(order.customer_address || '—')}</span><br>
        <strong style="color: #fff;">🕒 Placed:</strong> <span style="color: #94a3b8;">${timestamp}</span>
      </p>
    </div>
    <div class="order-actions">
      <span class="total-label">₹${Number(order.total_amount || 0).toFixed(2)}</span>

      <!-- Payment status badge -->
      <span class="badge ${isPaid ? 'badge-paid' : 'badge-pending'}">
        ${isPaid ? '✔ Paid' : '⏳ Pending'}
      </span>

      <!-- Preparation status badge -->
      <span class="badge ${isPrepared ? 'badge-done' : 'badge-prep'}">
        ${isPrepared ? '✅ Delivered' : '🍳 In Progress'}
      </span>

      <!-- Mark as Prepared / Delivered -->
      ${!isPrepared ? `
        <button class="btn-orange prepare-btn" data-id="${order.id}">
          Mark as Delivered
        </button>` : `
        <button class="btn-ghost" disabled>Delivered ✓</button>`
      }

      <!-- Payment toggle: one-time only -->
      ${isPaid
        ? `<button class="btn-pay pay-btn" disabled style="opacity:0.6;cursor:default;">✔ Paid</button>`
        : `<button class="btn-pay pay-btn" data-id="${order.id}">✔ Mark as Paid</button>`
      }

      <!-- Worker WhatsApp to Customer -->
      <button class="btn-green wa-btn" data-id="${order.id}" style="background-color:#25D366;color:white;border:none;border-radius:999px;padding:10px 18px;font-weight:700;cursor:pointer;margin-top:8px;width:100%;">💬 WhatsApp Receipt</button>
    </div>`;

  const prepBtn = card.querySelector('.prepare-btn');
  if (prepBtn) prepBtn.addEventListener('click', () => markPrepared(order.id, prepBtn));

  const payBtn = card.querySelector('.pay-btn:not([disabled])');
  if (payBtn)  payBtn.addEventListener('click', () => markPayment(order.id, 'Paid', payBtn));

  const waBtn = card.querySelector('.wa-btn');
  if (waBtn) {
    waBtn.addEventListener('click', () => {
      if (!order.customer_mobile) {
        showToast('No mobile number available.', 'error');
        return;
      }
      const message = `Hello ${order.customer_name},\n\nWe have received your order for ₹${Number(order.total_amount).toFixed(2)}.\n\nItems:\n${order.items.map(i => '- ' + i.name).join('\n')}\n\nDelivering to: ${order.customer_address}\n\nWe will update you soon! After delivery, please rate us here:\n${window.location.origin}/customer.html\n\nThank you for ordering!`;
      let phone = order.customer_mobile.replace(/\D/g, '');
      if (phone.length === 10) phone = '91' + phone;
      
      // ==========================================
      // NATIVE APP TRIGGER: Opens the native WhatsApp app directly
      // ==========================================
      const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      
      const newWin = window.open(waUrl, '_blank');
      if (!newWin || newWin.closed || typeof newWin.closed === 'undefined') {
        window.location.assign(waUrl);
      }

      /*
      // ==========================================
      // META CLOUD API BACKGROUND AUTOMATION (FOR LATER)
      // 100% Silent Background Sending
      // Uncomment this once you have your Permanent or Temporary Access Token
      // ==========================================
      // const metaToken = "YOUR_META_ACCESS_TOKEN_HERE";
      // const phoneNumberId = "YOUR_PHONE_NUMBER_ID_HERE";
      // 
      // fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
      //   method: 'POST',
      //   headers: {
      //     'Authorization': `Bearer ${metaToken}`,
      //     'Content-Type': 'application/json'
      //   },
      //   body: JSON.stringify({
      //     messaging_product: "whatsapp",
      //     to: phone,
      //     type: "text",
      //     text: { body: message }
      //   })
      // })
      // .then(res => res.json())
      // .then(data => console.log('Message sent silently!', data))
      // .catch(err => console.error('Error sending Meta API message', err));
      */
    });
  }

  return card;
}

// ── Mark order as Prepared/Delivered ─────────────────────────
async function markPrepared(orderId, btn) {
  btn.disabled    = true;
  btn.textContent = 'Updating…';
  try {
    await updateDoc(doc(db, 'orders', orderId), { order_status: 'Prepared' });
    showToast('Order marked as Delivered!', 'success');
  } catch (err) {
    console.error('Error updating order:', err);
    showToast('Failed to update order.', 'error');
    btn.disabled    = false;
    btn.textContent = 'Mark as Delivered';
  }
}

// ── Mark payment as Paid or Unpaid ────────────────────────────
async function markPayment(orderId, status, btn) {
  btn.disabled    = true;
  btn.textContent = 'Updating…';
  try {
    await updateDoc(doc(db, 'orders', orderId), { paid_status: status });
    showToast(status === 'Paid' ? '✔ Marked as Paid!' : 'Marked as Unpaid.', 'success');
  } catch (err) {
    console.error('Error updating payment:', err);
    showToast('Failed to update payment status.', 'error');
    btn.disabled    = false;
    btn.textContent = status === 'Paid' ? '✔ Mark as Paid' : 'Mark as Unpaid';
  }
}

// ── Utilities ─────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, type = 'success') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className   = `show ${type}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.className = ''; }, 4000);
}

// Play a realistic bell sound
function playNotificationSound() {
  try {
    const bellAudio = new Audio('https://actions.google.com/sounds/v1/doors/store_door_chime.ogg');
    bellAudio.play().catch(e => console.warn('Bell audio blocked:', e));
  } catch (err) {
    console.warn('Audio blocked by browser policy:', err);
  }
}

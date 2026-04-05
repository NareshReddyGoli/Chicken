// ============================================================
// admin.js  –  Admin portal
//  • Session-based auth guard (no Firebase Auth)
//  • Real-time live orders with full customer details
//  • Product management (add / delete)
//  • Admin can toggle paid status and mark orders as delivered
// ============================================================

import { db } from './firebase-config.js';
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  onSnapshot, updateDoc, serverTimestamp, query
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

// ── Session auth guard ────────────────────────────────────────
const staffRole = sessionStorage.getItem('staffRole');
if (staffRole !== 'admin') {
  window.location.href = 'customer.html';
}

// ── DOM refs ─────────────────────────────────────────────────
const addProductForm    = document.getElementById('add-product-form');
const productNameInput  = document.getElementById('product-name');
const productPriceInput = document.getElementById('product-price');
const productDescInput  = document.getElementById('product-desc');
const addProductBtn     = document.getElementById('add-product-btn');
const productsListEl    = document.getElementById('admin-products-list');
const ordersContainer   = document.getElementById('live-orders-container');
const userEmailEl       = document.getElementById('user-email');
const logoutBtn         = document.getElementById('logout-btn');
const totalCountEl      = document.getElementById('total-count');
const paidCountEl       = document.getElementById('paid-count');
const pendingCountEl    = document.getElementById('pending-count');
const productCountEl    = document.getElementById('product-count');
const revenueCountEl    = document.getElementById('revenue-count');
const deleteDateInput   = document.getElementById('delete-date-input');
const deleteDateBtn     = document.getElementById('delete-date-btn');
if (userEmailEl) userEmailEl.textContent = 'admin@farm2buy.in';

// ── Logout ───────────────────────────────────────────────────
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem('staffRole');
    window.location.href = 'customer.html';
  });
}

// Boot up
loadAdminProducts();
startOrderListener();
setupEditProductModal();

// ── Bulk Delete Orders by Date ───────────────────────────────
if (deleteDateBtn && deleteDateInput) {
  deleteDateBtn.addEventListener('click', async () => {
    const dateValue = deleteDateInput.value;
    if (!dateValue) {
      showToast('Please select a date first.', 'error');
      return;
    }
    
    if (!confirm(`Are you sure you want to completely delete ALL orders for ${dateValue}? This action cannot be undone.`)) {
      return;
    }
    
    const originalText = deleteDateBtn.innerHTML;
    deleteDateBtn.innerHTML = '<span class="icon-md" style="font-size: 16px; margin-right: 4px; vertical-align: middle;">hourglass_empty</span>Deleting...';
    deleteDateBtn.disabled = true;
    
    try {
      const snap = await getDocs(collection(db, 'orders'));
      const deletePromises = [];
      let deleteCount = 0;
      
      snap.forEach(docSnap => {
        const data = docSnap.data();
        if (data.timestamp && data.timestamp.toDate) {
          const d = data.timestamp.toDate();
          // Construct YYYY-MM-DD in local time
          const orderDateValue = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          
          if (orderDateValue === dateValue) {
            deletePromises.push(deleteDoc(doc(db, 'orders', docSnap.id)));
            deleteCount++;
          }
        }
      });
      
      if (deleteCount === 0) {
        showToast(`No orders found for ${dateValue}.`, 'error');
      } else {
        await Promise.all(deletePromises);
        showToast(`Successfully deleted ${deleteCount} order(s) for ${dateValue}.`, 'success');
        // Because of the real-time listener, the UI will automatically update.
      }
    } catch (err) {
      console.error('Error deleting orders by date:', err);
      showToast('Failed to delete orders. Check connection or permissions.', 'error');
    } finally {
      deleteDateBtn.disabled = false;
      deleteDateBtn.innerHTML = originalText;
    }
  });
}

// ═══════════════════════════════════════════════════════════
// SECTION 1 – PRODUCT MANAGEMENT
// ═══════════════════════════════════════════════════════════

if (addProductForm) {
  addProductForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name  = productNameInput.value.trim();
    const price = parseFloat(productPriceInput.value);
    const desc  = productDescInput?.value.trim() || '';

    if (!name || isNaN(price) || price < 0) {
      showToast('Please fill in a valid name and price.', 'error');
      return;
    }

    addProductBtn.disabled    = true;
    addProductBtn.textContent = 'Adding…';

    try {
      await addDoc(collection(db, 'products'), {
        name, price, description: desc, timestamp: serverTimestamp()
      });
      showToast(`✅ "${name}" added!`, 'success');
      await loadAdminProducts();
    } catch (err) {
      console.error('Error adding product:', err);
      showToast('Failed to add product.', 'error');
    } finally {
      addProductBtn.disabled    = false;
      addProductBtn.textContent = 'Add Product';
    }
  });
}

async function loadAdminProducts() {
  if (!productsListEl) return;
  productsListEl.innerHTML = '<div class="loader"><span class="spinner"></span>Loading products…</div>';

  try {
    const snap = await getDocs(collection(db, 'products'));
    if (productCountEl) productCountEl.textContent = snap.size;

    if (snap.empty) {
      productsListEl.innerHTML = '<div class="empty-state"><span class="icon">📦</span>No products yet. Add one above!</div>';
      return;
    }

    productsListEl.innerHTML = '';
    snap.forEach(docSnap => {
      const p = { id: docSnap.id, ...docSnap.data() };
      productsListEl.appendChild(buildAdminProductRow(p));
    });
  } catch (err) {
    console.error('Error loading products:', err);
    productsListEl.innerHTML = '<div class="empty-state"><span class="icon">⚠️</span>Failed to load products.</div>';
  }
}

function buildAdminProductRow(product) {
  const row = document.createElement('div');
  row.className = 'product-card';
  row.id        = `admin-product-${product.id}`;

  const weightHtml = product.weight
    ? `<p class="description" style="font-size:0.8rem;color:#94a3b8;margin-top:2px;">⚖️ ${escHtml(product.weight)}</p>`
    : '';
  const categoryLabel = product.category === 'daily' 
    ? '<span style="background:rgba(245,166,35,0.15);color:#f5a623;border:1px solid rgba(245,166,35,0.3);border-radius:4px;padding:2px 6px;font-size:0.7rem;font-weight:700;margin-right:8px;">🍳 Daily Cooking</span>'
    : '<span style="background:rgba(56,189,248,0.15);color:#38bdf8;border:1px solid rgba(56,189,248,0.3);border-radius:4px;padding:2px 6px;font-size:0.7rem;font-weight:700;margin-right:8px;">⭐ Current Hit</span>';

  const productImage = product.imageUrl || product.image || '';
  const imageHtml = productImage
    ? `<img src="${escHtml(productImage)}" alt="${escHtml(product.name)}" style="width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,0.1));flex-shrink:0;">`
    : '';

  row.innerHTML = `
    <div class="flex-between" style="align-items:flex-start;gap:12px;">
      ${imageHtml}
      <div style="flex:1">
        <div style="display:flex;align-items:center;margin-bottom:4px;">
          ${categoryLabel}
          <h3 style="margin:0;">${escHtml(product.name)}</h3>
        </div>
        <p class="description">${escHtml(product.description || '—')}</p>
        ${weightHtml}
      </div>
      <p class="price" style="white-space:nowrap;">₹${Number(product.price).toFixed(2)}</p>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px;">
      <button class="btn-ghost edit-btn" data-id="${product.id}" style="flex:1;color:#38bdf8;border-color:rgba(56,189,248,0.3);">
        ✏️ Edit Product
      </button>
      <button class="btn-ghost delete-btn" data-id="${product.id}" style="flex:1;color:var(--accent);border-color:rgba(233,69,96,.3);">
        🗑 Delete Product
      </button>
    </div>`;

  row.querySelector('.edit-btn').addEventListener('click', () => openEditModal(product));
  row.querySelector('.delete-btn').addEventListener('click', () => deleteProduct(product.id, product.name));
  return row;
}

async function deleteProduct(productId, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  try {
    await deleteDoc(doc(db, 'products', productId));
    showToast(`"${name}" deleted.`, 'success');
    await loadAdminProducts();
  } catch (err) {
    console.error('Error deleting product:', err);
    showToast('Failed to delete product.', 'error');
  }
}

// ═══════════════════════════════════════════════════════════
// SECTION 2 – LIVE ORDER FEED (full customer details)
// ═══════════════════════════════════════════════════════════

function startOrderListener() {
  if (!ordersContainer) return;
  ordersContainer.innerHTML = '<div class="loader"><span class="spinner"></span>Connecting to live feed…</div>';

  const q = query(collection(db, 'orders'));
  let isInitialLoad = true;

  onSnapshot(q, (snapshot) => {
    // Check for NEW orders specifically
    const hasNewOrders = snapshot.docChanges().some(change => change.type === 'added');
    if (!isInitialLoad && hasNewOrders) {
      playNotificationSound();
      showToast('🔔 New Order Arrived!', 'success');
    }
    isInitialLoad = false;
    // Sort newest first client-side (no Firestore index needed)
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
    if (revenueCountEl) {
      const revenue = paidDocs.reduce((sum, d) => sum + (Number(d.data().total_amount) || 0), 0);
      revenueCountEl.textContent = `₹${revenue.toFixed(0)}`;
    }

    if (docs.length === 0) {
      ordersContainer.innerHTML = `
        <div class="empty-state">
          <span class="icon">📋</span>
          No orders yet.
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

function buildOrderCard(order) {
  const isPaid     = order.paid_status  === 'Paid';
  const isPrepared = order.order_status === 'Prepared';
  const timestamp  = order.timestamp?.toDate
    ? order.timestamp.toDate().toLocaleString() : '—';

  const itemsHtml = Array.isArray(order.items)
    ? order.items.map(i => `<span>${escHtml(i.name)} — ₹${Number(i.price).toFixed(2)}</span>`).join('<br>')
    : '<span>No item info</span>';

  const card = document.createElement('div');
  card.className = `order-card ${isPaid ? 'paid' : 'pending'} ${order.rating === 5 ? 'five-star' : ''}`;
  card.id        = `order-${order.id}`;

  const ratingHtml = order.rating 
    ? `<div class="rating-display">
        ${Array.from({length: 5}, (_, i) => `<span class="${i < order.rating ? 'filled' : ''}">★</span>`).join('')}
        ${order.rating_comment ? `<small style="display:block; color:#94a3b8; font-style:italic; margin-top:4px;">"${order.rating_comment}"</small>` : ''}
      </div>`
    : '';

  card.innerHTML = `
    <div class="order-info">
      <p class="order-id" style="color: #60a5fa; font-family: monospace;">🆔 ${order.id}</p>
      <h3 style="color: #4ade80; font-size: 1.5rem; letter-spacing: -0.5px;">₹${Number(order.total_amount || 0).toFixed(2)}</h3>
      <div class="items-list" style="color: #fef08a; background: rgba(254, 240, 138, 0.05); border-left: 2px solid #fef08a; padding-left: 10px;">${itemsHtml}</div>
      ${ratingHtml}
      <p class="meta" style="font-size: 0.95rem; line-height: 1.6;">
        <strong style="color: #fff;">👤 Customer:</strong> <span style="color: #e2e8f0; font-weight: 600;">${escHtml(order.customer_name  || '—')}</span><br>
        <strong style="color: #fff;">📞 Mobile:</strong>   <span style="color: #fb923c; font-weight: 700; font-size: 1rem;">${escHtml(order.customer_mobile || '—')}</span><br>
        <strong style="color: #fff;">📍 Address:</strong>  <span style="color: #f9fafb; display: inline-block; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;">${escHtml(order.customer_address || '—')}</span><br>
        <strong style="color: #fff;">🕒 Placed:</strong>   <span style="color: #94a3b8;">${timestamp}</span>
      </p>
    </div>
    <div class="order-actions">
      <span class="total-label">₹${Number(order.total_amount || 0).toFixed(2)}</span>

      <!-- Payment status -->
      <span class="badge ${isPaid ? 'badge-paid' : 'badge-pending'}">
        ${isPaid ? '✔ Paid' : '⏳ Pending'}
      </span>

      <!-- Delivery status -->
      <span class="badge ${isPrepared ? 'badge-done' : 'badge-prep'}">
        ${isPrepared ? '✅ Delivered' : '🍳 In Progress'}
      </span>

      <!-- Admin payment toggle: one-time only -->
      ${isPaid
        ? `<button class="btn-pay pay-btn" disabled style="opacity:0.6;cursor:default;">✔ Paid</button>`
        : `<button class="btn-pay pay-btn" data-id="${order.id}">✔ Mark as Paid</button>`
      }

      <!-- Admin delivery toggle -->
      ${!isPrepared
        ? `<button class="btn-orange prepare-btn" data-id="${order.id}">Mark as Delivered</button>`
        : `<button class="btn-ghost" disabled>Delivered ✓</button>`
      }

      <!-- Admin WhatsApp to Customer -->
      <button class="btn-green wa-btn" data-id="${order.id}" style="background-color:#25D366;color:white;border:none;">💬 WhatsApp</button>
      
      <!-- Admin Delete Order -->
      <button class="btn-ghost delete-order-btn" data-id="${order.id}" style="color:#e8001c; border-color:rgba(232,0,28,0.3); margin-top:8px; width:100%;">🗑 Delete Order</button>
    </div>`;

  const payBtn   = card.querySelector('.pay-btn');
  const unpayBtn = card.querySelector('.unpay-btn');
  const prepBtn  = card.querySelector('.prepare-btn');
  const waBtn    = card.querySelector('.wa-btn');

  if (payBtn)   payBtn.addEventListener('click',   () => updatePayment(order.id, 'Paid',    payBtn));
  if (unpayBtn) unpayBtn.addEventListener('click', () => updatePayment(order.id, 'Pending', unpayBtn));
  if (prepBtn)  prepBtn.addEventListener('click',  () => markDelivered(order.id, prepBtn));
  if (waBtn) {
    waBtn.addEventListener('click', () => {
      if (!order.customer_mobile) {
        showToast('No mobile number available.', 'error');
        return;
      }
      const message = `Hello ${order.customer_name},\n\nWe have received your order for ₹${Number(order.total_amount).toFixed(2)}.\n\nItems:\n${Array.isArray(order.items) ? order.items.map(i => '- ' + i.name).join('\\n') : ''}\n\nDelivering to: ${order.customer_address}\n\nWe will update you soon!`;
      let phone = order.customer_mobile.replace(/\D/g, '');
      if (phone.length === 10) phone = '91' + phone;
      const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      const newWin = window.open(waUrl, '_blank');
      if (!newWin || newWin.closed || typeof newWin.closed === 'undefined') {
        window.location.assign(waUrl);
      }
    });
  }

  const deleteOrderBtn = card.querySelector('.delete-order-btn');
  if (deleteOrderBtn) {
    deleteOrderBtn.addEventListener('click', async () => {
      if (confirm(`Are you sure you want to completely delete order ${order.id}? This cannot be undone.`)) {
        try {
          deleteOrderBtn.textContent = 'Deleting...';
          await deleteDoc(doc(db, 'orders', order.id));
          showToast('Order deleted.', 'success');
        } catch (err) {
          console.error('Delete error', err);
          showToast('Failed to delete. Check rules.', 'error');
          deleteOrderBtn.textContent = '🗑 Delete Order';
        }
      }
    });
  }

  return card;
}

async function updatePayment(orderId, status, btn) {
  btn.disabled    = true;
  btn.textContent = 'Updating…';
  try {
    await updateDoc(doc(db, 'orders', orderId), { paid_status: status });
    showToast(status === 'Paid' ? '✔ Marked as Paid!' : 'Marked as Unpaid.', 'success');
  } catch (err) {
    console.error('Error updating payment:', err);
    showToast('Update failed.', 'error');
    btn.disabled = false;
  }
}

async function markDelivered(orderId, btn) {
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

// ═══════════════════════════════════════════════════════════
// SECTION 3 – EDIT PRODUCT MODAL
// ═══════════════════════════════════════════════════════════

// ── Image compression helper ─────────────────────────────────
function compressImage(file, w = 600, h = 600, q = 0.8) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let sw = img.width, sh = img.height, sx = 0, sy = 0;
        const aspect = w / h;
        if (sw / sh > aspect) { const nw = sh * aspect; sx = (sw - nw) / 2; sw = nw; }
        else                  { const nh = sw / aspect; sy = (sh - nh) / 2; sh = nh; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', q));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

let _editCompressedImageUrl = null; // holds the new compressed image for the current edit session

function setupEditProductModal() {
  const modal      = document.getElementById('edit-product-modal');
  const closeBtn   = document.getElementById('edit-modal-close');
  const cancelBtn  = document.getElementById('edit-modal-cancel');
  const form       = document.getElementById('edit-product-form');
  const errorEl    = document.getElementById('edit-product-error');
  const imgFile    = document.getElementById('edit-product-image-file');
  const imgPreview = document.getElementById('edit-product-img-preview');
  const imgLabel   = document.getElementById('edit-product-img-label');

  if (!modal || !form) return;

  // ─ File picker: compress & preview on selection
  if (imgFile) {
    imgFile.addEventListener('change', async () => {
      const file = imgFile.files[0];
      if (!file) return;
      imgLabel.textContent = '⏳ Compressing…';
      _editCompressedImageUrl = await compressImage(file, 600, 600, 0.82);
      imgPreview.src          = _editCompressedImageUrl;
      imgPreview.style.display = 'block';
      imgLabel.textContent    = `✅ ${file.name}`;
    });
  }

  function closeModal() {
    modal.style.display         = 'none';
    _editCompressedImageUrl     = null;
    form.reset();
    if (imgPreview) { imgPreview.src = ''; imgPreview.style.display = 'none'; }
    if (imgLabel)   { imgLabel.textContent = '📷 Click to upload image from device'; }
    if (errorEl)    { errorEl.style.display = 'none'; errorEl.textContent = ''; }
  }

  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const productId = document.getElementById('edit-product-id').value;
    const name      = document.getElementById('edit-product-name').value.trim();
    const price     = parseFloat(document.getElementById('edit-product-price').value);
    const weight    = document.getElementById('edit-product-weight').value.trim();
    const category  = document.getElementById('edit-product-category') ? document.getElementById('edit-product-category').value : 'regular';

    if (!name || isNaN(price) || price < 0) {
      showEditError('Please provide a valid name and price.');
      return;
    }

    const saveBtn = document.getElementById('edit-product-save');
    saveBtn.disabled    = true;
    saveBtn.textContent = _editCompressedImageUrl ? 'Saving image…' : 'Saving…';
    if (errorEl) { errorEl.style.display = 'none'; }

    const updateData = { name, price, category };
    if (weight)                   updateData.weight   = weight;
    if (_editCompressedImageUrl)  updateData.imageUrl = _editCompressedImageUrl; // ✅ correct field name

    try {
      await updateDoc(doc(db, 'products', productId), updateData);
      showToast(`✅ "${name}" updated!`, 'success');
      closeModal();
      await loadAdminProducts();
    } catch (err) {
      console.error('Error updating product:', err);
      showEditError('Failed to update. Check permissions.');
    } finally {
      saveBtn.disabled    = false;
      saveBtn.textContent = 'Save Changes';
    }
  });
}

function openEditModal(product) {
  const modal      = document.getElementById('edit-product-modal');
  const imgPreview = document.getElementById('edit-product-img-preview');
  const imgLabel   = document.getElementById('edit-product-img-label');
  if (!modal) return;

  _editCompressedImageUrl = null; // reset pending image

  document.getElementById('edit-product-id').value     = product.id;
  document.getElementById('edit-product-name').value   = product.name   || '';
  document.getElementById('edit-product-price').value  = product.price  || '';
  document.getElementById('edit-product-weight').value = product.weight || '';
  const catSelect = document.getElementById('edit-product-category');
  if (catSelect) catSelect.value = product.category === 'daily' ? 'daily' : 'regular';

  // Show existing image if present
  const existingImg = product.imageUrl || product.image || '';
  if (imgPreview) {
    if (existingImg) {
      imgPreview.src           = existingImg;
      imgPreview.style.display = 'block';
      if (imgLabel) imgLabel.textContent = '🔄 Click to replace image';
    } else {
      imgPreview.src           = '';
      imgPreview.style.display = 'none';
      if (imgLabel) imgLabel.textContent = '📷 Click to upload image from device';
    }
  }

  const errorEl = document.getElementById('edit-product-error');
  if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }

  modal.style.display = 'flex';
}

function showEditError(msg) {
  const errorEl = document.getElementById('edit-product-error');
  if (!errorEl) return;
  errorEl.textContent    = msg;
  errorEl.style.display  = 'block';
}

// ── Utility helpers ───────────────────────────────────────────
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

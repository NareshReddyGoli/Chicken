// ============================================================
// customer.js  –  Customer Shop + Staff Login Modal + Admin Controls
//  • Products load immediately for all visitors
//  • Admin logs in via modal → stays on page, sees admin panel
//  • Admin can add products (addDoc) and delete them (deleteDoc)
//  • Worker logs in via modal → redirected to worker.html
//  • Cart sidebar with payment toggle and addDoc order
// ============================================================

import { db } from './firebase-config.js';
import {
  collection, getDocs, getDoc, addDoc, deleteDoc, serverTimestamp, doc, updateDoc, setDoc, onSnapshot, arrayUnion
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

// ── Staff Credentials (simple hardcoded login, no Firebase Auth) ──
// To change passwords, update the values below:
const STAFF_CREDENTIALS = {
  admin:  { username: 'poojan',  password: 'poojan830' },
  worker: { username: 'worker', password: 'worker321' },
};


// ── Image map ─────────────────────────────────────────────────
const IMAGE_MAP = {
  breast:   'images/chicken_breast.png',
  boneless: 'images/chicken_breast.png',
  curry:    'images/chicken_curry.png',
  egg:      'images/eggs.png',
  keema:    'images/keema.png',
};
const DEFAULT_IMG = 'images/chicken_curry.png';

function getProductImage(product) {
  if (product.imageUrl) return product.imageUrl;
  const name = (product.name || '').toLowerCase();
  for (const [key, path] of Object.entries(IMAGE_MAP)) {
    if (name.includes(key)) return path;
  }
  return DEFAULT_IMG;
}

// ── State ─────────────────────────────────────────────────────
const FALLBACK_PRODUCTS = [
  { id: 'default1', name: 'Original Chicken Curry Cut', price: 249, originalPrice: 299, badge: 'Best', weight: '500g', serves: 'Serves 2' },
  { id: 'default2', name: 'Premium Chicken Breast',     price: 349, originalPrice: 399, badge: 'New',  weight: '500g', serves: 'Serves 2' },
  { id: 'default3', name: 'Farm Fresh Classic Eggs',    price: 125, badge: 'Cold', weight: '12 pcs', serves: 'Daily Breakfast' },
  { id: 'default4', name: 'Chicken Keema (Mince)',       price: 310, originalPrice: 350, weight: '500g', serves: 'Serves 3-4' }
];

// ── "What's Cooking Today" — separate daily specials ─────────
const COOKING_TODAY = [
  { id: 'cook1', name: 'Spicy Andhra Chicken Fry',     price: 279, originalPrice: 329, badge: 'Best',  weight: '500g',  serves: 'Serves 2',   imageUrl: 'images/chicken_curry.png' },
  { id: 'cook2', name: 'Chicken Lollipop (6 pcs)',      price: 199, originalPrice: 249, badge: 'New',   weight: '300g',  serves: 'Starter',    imageUrl: 'images/chicken_breast.png' },
  { id: 'cook3', name: 'Boneless Chicken Tikka',        price: 389, originalPrice: 450, badge: 'Best',  weight: '500g',  serves: 'Serves 2-3', imageUrl: 'images/chicken_breast.png' },
  { id: 'cook4', name: 'Mutton Keema Special',          price: 420, originalPrice: 480,                 weight: '500g',  serves: 'Serves 3',   imageUrl: 'images/keema.png' },
  { id: 'cook5', name: 'Egg Curry Masala (Home Style)', price: 149, originalPrice: 180, badge: 'Cold',  weight: '4 eggs',serves: 'Serves 2',   imageUrl: 'images/eggs.png' },
  { id: 'cook6', name: 'Chicken Biryani Cut (Raw)',     price: 299, originalPrice: 349, badge: 'New',   weight: '750g',  serves: 'Serves 3-4', imageUrl: 'images/chicken_curry.png' },
];

let cart          = [];
let productsCache = [];
let isAdminMode   = false;

function isBuiltInProductId(id) {
  const pid = String(id || '');
  return pid.startsWith('default') || pid.startsWith('cook');
}

function getBuiltInProductById(id) {
  const pid = String(id || '');
  return [...FALLBACK_PRODUCTS, ...COOKING_TODAY].find(p => p.id === pid) || null;
}

const HIDDEN_DEFAULTS_DOC = doc(db, 'settings', 'hidden-default-products');

async function getHiddenDefaultIds() {
  try {
    const snap = await getDoc(HIDDEN_DEFAULTS_DOC);
    if (!snap.exists()) return new Set();
    const ids = Array.isArray(snap.data()?.ids) ? snap.data().ids : [];
    return new Set(ids.map(String));
  } catch (err) {
    console.warn('Failed to load hidden default products:', err);
    return new Set();
  }
}

async function hideDefaultProduct(id) {
  await setDoc(HIDDEN_DEFAULTS_DOC, {
    ids: arrayUnion(String(id)),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// ── DOM refs – Shop ───────────────────────────────────────────
const productContainer  = document.getElementById('product-container');
const productContainer2 = document.getElementById('product-container-2');
const cartItemsWrap     = document.getElementById('cart-items-wrap');
const cartEmptyMsg      = document.getElementById('cart-empty-msg');
const cartTotalEl       = document.getElementById('cart-total');
const cartCountBadge    = document.getElementById('cart-count-badge');
const placeOrderBtn     = document.getElementById('place-order-btn');
const cartSidebar       = document.getElementById('cart-sidebar');
const cartOverlay       = document.getElementById('cart-overlay');
const cartToggleBtn     = document.getElementById('cart-toggle-btn');
const cartCloseBtn      = document.getElementById('cart-close-btn');

// ── DOM refs – Staff Modal ────────────────────────────────────
const workerLoginBtn = document.getElementById('worker-login-btn');
const adminLoginBtn  = document.getElementById('admin-login-btn');
const staffLoginBtns = document.getElementById('staff-login-btns');
const modalTitle     = document.getElementById('modal-title');
const modalSubtext   = document.getElementById('modal-subtext');
const adminBadge     = document.getElementById('admin-badge');
const adminDashLink  = document.getElementById('admin-dashboard-link');
const adminLogoutBtn = document.getElementById('admin-logout-btn');
const modalOverlay   = document.getElementById('modal-overlay');
const loginModal     = document.getElementById('login-modal');
const modalCloseBtn  = document.getElementById('modal-close-btn');
const staffLoginForm = document.getElementById('staff-login-form');
const modalSubmitBtn = document.getElementById('modal-submit-btn');
const modalError     = document.getElementById('modal-error');
const usernameInput  = document.getElementById('staff-username');
const passwordInput  = document.getElementById('staff-password');

let lastAutoFilledRole = null;

// ── DOM refs – Admin Panel ────────────────────────────────────
const adminPanel     = document.getElementById('admin-panel');
const addProductForm = document.getElementById('add-product-form');
const apfSubmitBtn   = document.getElementById('apf-submit-btn');
const apfError       = document.getElementById('apf-error');

// ══════════════════════════════════════════════════════
// SECTION 1 – STAFF LOGIN MODAL
// ══════════════════════════════════════════════════════

workerLoginBtn.addEventListener('click', () => openModal('worker'));
adminLoginBtn.addEventListener('click', () => openModal('admin'));
modalCloseBtn.addEventListener('click', closeModal);
modalOverlay .addEventListener('click', closeModal);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

let currentLoginRole = null;
function openModal(role)  {
  currentLoginRole = role;
  modalOverlay.classList.add('open');
  loginModal.classList.add('open');
  
  if (role === 'worker') {
    modalTitle.innerHTML = '<img src="images/worker.png" style="width:22px;height:22px;vertical-align:middle;margin-right:8px;object-fit:contain;"> Worker Login';
    modalSubtext.innerHTML = 'For <strong>Workers</strong> only.';
  } else {
    modalTitle.innerHTML = '<img src="images/admin.png" style="width:24px;height:24px;vertical-align:middle;margin-right:8px;object-fit:contain;"> Admin Login';
    modalSubtext.innerHTML = 'For <strong>Admins</strong> only.';
  }
  
  autofillStaffCredentials(role);
  usernameInput.focus();
  clearModalError();
}

function autofillStaffCredentials(role) {
  usernameInput.value = '';
  passwordInput.value = '';
  lastAutoFilledRole = null;
}
function closeModal() {
  modalOverlay.classList.remove('open');
  loginModal.classList.remove('open');
  staffLoginForm.reset();
  clearModalError();
  lastAutoFilledRole = null;
}
function showModalError(msg) { modalError.textContent = msg; modalError.style.display = 'block'; }
function clearModalError()   { modalError.textContent = ''; modalError.style.display = 'none'; }

// Removed auto-select default password behavior

// ── Restore session on page refresh ─────────────────────────
const savedRole = sessionStorage.getItem('staffRole');
if (savedRole === 'admin') activateAdminMode();

// Staff login submit – simple credential check (no Firebase Auth needed)
staffLoginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  clearModalError();

  const username = usernameInput.value.trim().toLowerCase().split('@')[0];
  const password = passwordInput.value;

  if (!username || !password) {
    showModalError('Please enter both username and password.');
    return;
  }

  modalSubmitBtn.disabled    = true;
  modalSubmitBtn.textContent = 'Signing in…';

  // Check credentials against STAFF_CREDENTIALS
  const adminCreds  = STAFF_CREDENTIALS.admin;
  const workerCreds = STAFF_CREDENTIALS.worker;

  if (username === adminCreds.username && password === adminCreds.password) {
    sessionStorage.setItem('staffRole', 'admin');
    closeModal();
    activateAdminMode();
    showToast('👑 Admin mode activated!', 'success');
  } else if (username === workerCreds.username && password === workerCreds.password) {
    sessionStorage.setItem('staffRole', 'worker');
    window.location.href = 'worker.html';
  } else {
    showModalError('Incorrect username or password. Please try again.');
    modalSubmitBtn.disabled    = false;
    modalSubmitBtn.textContent = 'Login to Dashboard';
  }
});

// Admin logout
adminLogoutBtn.addEventListener('click', () => {
  sessionStorage.removeItem('staffRole');
  deactivateAdminMode();
  showToast('Logged out.', 'success');
});

// ── Admin mode on/off ─────────────────────────────────────────
function activateAdminMode() {
  isAdminMode = true;
  document.body.classList.add('admin-mode');
  adminPanel.style.display    = 'block';
  adminBadge.style.display    = 'inline-block';
  if (adminDashLink)  adminDashLink.style.display  = 'inline-block';
  adminLogoutBtn.style.display = 'inline-block';
  if (staffLoginBtns) staffLoginBtns.style.display = 'none';
}
function deactivateAdminMode() {
  isAdminMode = false;
  document.body.classList.remove('admin-mode');
  adminPanel.style.display     = 'none';
  adminBadge.style.display     = 'none';
  if (adminDashLink)  adminDashLink.style.display  = 'none';
  adminLogoutBtn.style.display = 'none';
  if (staffLoginBtns) staffLoginBtns.style.display  = 'flex';
}

// ══════════════════════════════════════════════════════
// SECTION 2 – ADMIN: ADD PRODUCT
// ══════════════════════════════════════════════════════

// ── Image compression helper ──────────────────────────────────
function compressImage(file, targetWidth, targetHeight, quality = 0.8) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let sw = img.width;
        let sh = img.height;
        let sx = 0;
        let sy = 0;

        // Auto-center-crop to the aspect ratio of targetWidth/targetHeight
        const targetAspect = targetWidth / targetHeight;
        const imgAspect = sw / sh;

        if (imgAspect > targetAspect) {
          // Image is wider than target aspect
          const newSw = sh * targetAspect;
          sx = (sw - newSw) / 2;
          sw = newSw;
        } else {
          // Image is taller than target aspect
          const newSh = sw / targetAspect;
          sy = (sh - newSh) / 2;
          sh = newSh;
        }

        const canvas = document.createElement('canvas');
        canvas.width  = targetWidth;
        canvas.height = targetHeight;
        canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── Image preview wiring ──────────────────────────────────────
const apfImageInput   = document.getElementById('apf-image');
const apfImagePreview = document.getElementById('apf-image-preview');
const apfImageLabel   = document.getElementById('apf-image-label');

if (apfImageInput) {
  apfImageInput.addEventListener('change', async () => {
    const file = apfImageInput.files[0];
    if (!file) return;
    // For standard product uploads, we still use 600x600 square for now
    const compressed = await compressImage(file, 600, 600);
    apfImagePreview.src          = compressed;
    apfImagePreview.style.display = 'block';
    apfImageLabel.textContent    = `✅ ${file.name}`;
    apfImageLabel.classList.add('has-image');
  });
}

// ── Branding Upload wiring with Dimension Modal ───────────────
const brandingImageInput = document.getElementById('branding-owner-logo');
const brandingImageLabel = document.getElementById('branding-owner-logo-label');
const brandingModalOverlay = document.getElementById('branding-modal-overlay');
const brandingModal        = document.getElementById('branding-modal');
const brandingModalClose   = document.getElementById('branding-modal-close');
const brandingWidth        = document.getElementById('branding-width');
const brandingHeight       = document.getElementById('branding-height');
const brandingFinalizeBtn  = document.getElementById('branding-finalize-btn');
const brandingCancelBtn    = document.getElementById('branding-cancel-btn');

let brandingFileToUpload = null;

function closeBrandingModal() {
  brandingModalOverlay.classList.remove('open');
  brandingModal.classList.remove('open');
  brandingFileToUpload = null;
  if (brandingImageInput) brandingImageInput.value = '';
}

if (brandingImageInput) {
  brandingImageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    brandingFileToUpload = file;
    // Show modal
    brandingModalOverlay.classList.add('open');
    brandingModal.classList.add('open');
  });
}

if (brandingModalClose) brandingModalClose.addEventListener('click', closeBrandingModal);
if (brandingCancelBtn)   brandingCancelBtn.addEventListener('click', closeBrandingModal);

if (brandingFinalizeBtn) {
  brandingFinalizeBtn.addEventListener('click', async () => {
    if (!brandingFileToUpload) return;
    const w = parseInt(brandingWidth.value) || 250;
    const h = parseInt(brandingHeight.value) || 250;

    try {
      brandingModalOverlay.classList.remove('open');
      brandingModal.classList.remove('open');
      
      brandingImageLabel.textContent = `⏳ Compressing to ${w}x${h}...`;
      const compressed = await compressImage(brandingFileToUpload, w, h, 0.85);
      brandingImageLabel.textContent = `⏳ Uploading...`;
      await setDoc(doc(db, 'settings', 'branding'), { ownerLogo: compressed }, { merge: true });
      brandingImageLabel.textContent = `✅ Updated to ${w}x${h}!`;
      showToast(`Logo updated to ${w}x${h}px!`, 'success');
      setTimeout(() => brandingImageLabel.textContent = `📷 Click to change Owner Logo`, 3000);
      brandingFileToUpload = null;
    } catch(err) {
      console.error(err);
      brandingImageLabel.textContent = `❌ Upload failed`;
      showToast('Failed to update branding.', 'error');
    }
  });
}


if (addProductForm) {
  addProductForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    apfError.style.display = 'none';

    const name     = document.getElementById('apf-name').value.trim();
    const price    = parseFloat(document.getElementById('apf-price').value);
    const original = parseFloat(document.getElementById('apf-original').value) || null;
    const badge    = document.getElementById('apf-badge').value;
    const weight   = document.getElementById('apf-weight').value.trim();
    const serves   = document.getElementById('apf-serves').value.trim();
    const desc     = document.getElementById('apf-desc').value.trim();
    const category = document.getElementById('apf-category').value;
    const imgFile  = apfImageInput?.files[0] || null;

    if (!name || isNaN(price) || price < 0) {
      apfError.textContent   = 'Product name and a valid price are required.';
      apfError.style.display = 'block';
      return;
    }

    apfSubmitBtn.disabled    = true;
    apfSubmitBtn.textContent = 'Adding…';

    try {
      // Compress & encode image if provided
      let imageUrl = null;
      if (imgFile) {
        apfSubmitBtn.textContent = 'Uploading image…';
        imageUrl = await compressImage(imgFile, 600, 600, 0.8);
      }

      const data = {
        name, price, category, timestamp: serverTimestamp(),
        ...(original  && { originalPrice: original }),
        ...(badge     && { badge }),
        ...(weight    && { weight }),
        ...(serves    && { serves }),
        ...(desc      && { description: desc }),
        ...(imageUrl  && { imageUrl }),
      };

      await addDoc(collection(db, 'products'), data);
      showToast(`✅ "${name}" added to products!`, 'success');
      addProductForm.reset();
      // Reset image preview
      if (apfImagePreview) { apfImagePreview.src = ''; apfImagePreview.style.display = 'none'; }
      if (apfImageLabel)   { apfImageLabel.textContent = '📷 Click to upload image from device'; apfImageLabel.classList.remove('has-image'); }
      await loadProducts();
    } catch (err) {
      console.error('Add product error:', err);
      apfError.textContent   = 'Failed to add product. Check Firestore rules.';
      apfError.style.display = 'block';
    } finally {
      apfSubmitBtn.disabled    = false;
      apfSubmitBtn.textContent = 'Add Product';
    }
  });
}

// ── Delete product ────────────────────────────────────────────
async function deleteProduct(productId, productName) {
  const isBuiltIn = isBuiltInProductId(productId);
  const msg = isBuiltIn 
    ? `Delete "${productName}" from the default list?`
    : `Delete "${productName}"? This cannot be undone.`;
  if (!confirm(msg)) return;
  try {
    if (isBuiltInProductId(productId)) {
      await hideDefaultProduct(productId);
      try {
        await deleteDoc(doc(db, 'products', productId));
      } catch (_) {
        // It's okay if the document does not exist yet.
      }
      showToast(`"${productName}" permanently hidden.`, 'success');
      await loadProducts();
      return;
    }

    await deleteDoc(doc(db, 'products', productId));
    showToast(`"${productName}" deleted.`, 'success');
    await loadProducts();
  } catch (err) {
    console.error('Delete error:', err);
    showToast('Failed to delete product.', 'error');
  }
}

// ── Edit product ──────────────────────────────────────────────
const editModalOverlay = document.getElementById('edit-modal-overlay');
const editModal        = document.getElementById('edit-modal');
const editModalClose   = document.getElementById('edit-modal-close');
const editProductForm  = document.getElementById('edit-product-form');
const editProdIdInput  = document.getElementById('edit-prod-id');
const editNameInput    = document.getElementById('edit-name');
const editPriceInput   = document.getElementById('edit-price');
const editWeightInput  = document.getElementById('edit-weight');
const editImageInput   = document.getElementById('edit-image');
const editImagePreview = document.getElementById('edit-image-preview');
const editImageLabel   = document.getElementById('edit-image-label');
const editConfirmBtn   = document.getElementById('edit-confirm-btn');
const editModalError   = document.getElementById('edit-modal-error');

function closeEditModal() {
  if (editModalOverlay) editModalOverlay.classList.remove('open');
  if (editModal) editModal.classList.remove('open');
  if (editProductForm) editProductForm.reset();
  if (editWeightInput) editWeightInput.value = '';
  if (editImagePreview) {
    editImagePreview.src = '';
    editImagePreview.style.display = 'none';
  }
  if (editImageLabel) editImageLabel.innerHTML = '📷 Click to upload new image';
  if (editModalError) editModalError.style.display = 'none';
}
if (editModalClose) editModalClose.addEventListener('click', closeEditModal);
if (editModalOverlay) editModalOverlay.addEventListener('click', closeEditModal);

if (editImageInput) {
  editImageInput.addEventListener('change', async () => {
    const file = editImageInput.files[0];
    if (!file) return;
    const compressed = await compressImage(file, 600, 600, 0.8);
    editImagePreview.src = compressed;
    editImagePreview.style.display = 'block';
    editImageLabel.textContent = `✅ ${file.name}`;
  });
}

if (editProductForm) {
  editProductForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (editModalError) editModalError.style.display = 'none';

    const id = (editProdIdInput?.value || editProductForm.dataset.productId || '').trim();
    const name = editNameInput.value.trim();
    const price = parseFloat(editPriceInput.value);
    const weight = editWeightInput ? editWeightInput.value.trim() : '';
    const editCategorySelect = document.getElementById('edit-category');
    const category = editCategorySelect ? editCategorySelect.value : null;
    const imgFile = editImageInput?.files?.[0] || null;

    if (!id) {
      if (editModalError) {
        editModalError.textContent = 'Unable to identify product. Reopen Edit and try again.';
        editModalError.style.display = 'block';
      }
      return;
    }

    if (!name || isNaN(price) || price < 0) {
      if (editModalError) {
        editModalError.textContent = 'Invalid name or price.';
        editModalError.style.display = 'block';
      }
      return;
    }

    editConfirmBtn.disabled = true;
    editConfirmBtn.textContent = 'Saving…';

    try {
      let imageUrl = null;
      if (imgFile) {
        imageUrl = await compressImage(imgFile, 600, 600, 0.8);
      }

      const baseUpdates = {
        name,
        price,
        ...(imageUrl && { imageUrl }),
      };

      const isBuiltIn = isBuiltInProductId(id);
      if (isBuiltIn) {
        const source = getBuiltInProductById(id) || {};
        const fallbackCategory = String(id).startsWith('cook') ? 'daily' : 'regular';
        const finalCategory = (editCategorySelect && category) ? category : (source.category || fallbackCategory);
        const currentImage = editProductForm?.dataset?.currentImage || source.imageUrl || getProductImage(source || { name });

        const builtInData = {
          name,
          price,
          category: finalCategory,
          timestamp: serverTimestamp(),
          ...(weight && { weight }),
          ...((imageUrl || currentImage) && { imageUrl: imageUrl || currentImage }),
          ...(source.originalPrice && { originalPrice: source.originalPrice }),
          ...(source.badge && { badge: source.badge }),
          ...(source.serves && { serves: source.serves }),
          ...(source.pieces && { pieces: source.pieces }),
          ...(source.description && { description: source.description }),
        };

        // Instead of setting doc by ID (which may fail permissions), add as new and hide the default one
        await addDoc(collection(db, 'products'), builtInData);
        await hideDefaultProduct(id);
        
        showToast('✅ Default product promoted to Firestore and updated!', 'success');
        closeEditModal();
        await loadProducts();
        return;
      }

      const updates = {
        ...baseUpdates,
        ...(editWeightInput && { weight: weight || '' }),
        ...(editCategorySelect && category && { category }),
      };

      try {
        await updateDoc(doc(db, 'products', id), updates);
      } catch (err) {
        const isNotFound = String(err?.code || '').includes('not-found');
        if (isNotFound) {
          await setDoc(doc(db, 'products', id), {
            ...updates,
            timestamp: serverTimestamp(),
          }, { merge: true });
          showToast('✅ Product created in Firestore and updated!', 'success');
          closeEditModal();
          await loadProducts();
          return;
        }

        // Some projects enforce strict allowed fields in Firestore rules.
        // Retry with base fields so name/price edits still work.
        const isPermissionDenied = String(err?.code || '').includes('permission-denied');
        const hasOptionalFields = Object.keys(updates).length > Object.keys(baseUpdates).length;
        if (!(isPermissionDenied && hasOptionalFields)) throw err;
        await updateDoc(doc(db, 'products', id), baseUpdates);
      }

      showToast('✅ Product updated!', 'success');
      closeEditModal();
      await loadProducts();
    } catch (err) {
      console.error('Update error:', err);
      if (editModalError) {
        const errCode = err?.code ? ` (${err.code})` : '';
        editModalError.textContent = `Failed to update. Check permissions${errCode}.`;
        editModalError.style.display = 'block';
      }
    } finally {
      editConfirmBtn.disabled = false;
      editConfirmBtn.textContent = '💾 Save Changes';
    }
  });
}

window.openEditModal = function(product, currentImg) {
  if (editProdIdInput) editProdIdInput.value = product.id;
  if (editProductForm) {
    editProductForm.dataset.productId = product.id;
    editProductForm.dataset.currentImage = currentImg || '';
  }
  editNameInput.value = product.name;
  editPriceInput.value = product.price || '';
  if (editWeightInput) editWeightInput.value = product.weight || '';
  const categorySelect = document.getElementById('edit-category');
  if (categorySelect) categorySelect.value = product.category === 'daily' ? 'daily' : 'regular';
  if (currentImg && editImagePreview) {
    editImagePreview.src = currentImg;
    editImagePreview.style.display = 'block';
  }
  if (editModalOverlay) editModalOverlay.classList.add('open');
  if (editModal) editModal.classList.add('open');
};

if (editConfirmBtn && editProductForm) {
  editConfirmBtn.addEventListener('click', () => {
    // Makes submit reliable even if button placement/markup differs across versions.
    if (typeof editProductForm.requestSubmit === 'function') editProductForm.requestSubmit();
  });
}

// ══════════════════════════════════════════════════════
// SECTION 3 – SHOP: Products & Cart
// ══════════════════════════════════════════════════════

// Cart sidebar open / close
function openCart()  { cartSidebar.classList.add('open');  cartOverlay.classList.add('open'); }
function closeCart() { cartSidebar.classList.remove('open'); cartOverlay.classList.remove('open'); }
cartToggleBtn.addEventListener('click', openCart);
cartCloseBtn .addEventListener('click', closeCart);
cartOverlay  .addEventListener('click', () => {
  if (!loginModal.classList.contains('open')) closeCart();
});

// Load products
window.addEventListener('DOMContentLoaded', loadProducts);

async function loadProducts() {
  const loader = '<div class="loader"><span class="spinner"></span>Loading fresh products…</div>';
  productContainer.innerHTML  = loader;
  if (productContainer2) productContainer2.innerHTML = '<div class="loader"><span class="spinner"></span>Loading fresh products…</div>';

  try {
    const hiddenDefaultIds = await getHiddenDefaultIds();
    const snap = await getDocs(collection(db, 'products'));

    if (snap.empty) {
      const regularFallback = FALLBACK_PRODUCTS.filter(p => !hiddenDefaultIds.has(String(p.id)));
      const dailyFallback = COOKING_TODAY.filter(p => !hiddenDefaultIds.has(String(p.id)));

      productsCache = regularFallback;
      renderProducts(productsCache, productContainer);
      if (productContainer2) renderProducts(dailyFallback, productContainer2);
    } else {
      let regularProducts = [];
      let dailyProducts = [];
      snap.docs.forEach(d => {
         const p = { id: d.id, ...d.data() };
         if (p.category === 'daily') {
           dailyProducts.push(p);
         } else {
           regularProducts.push(p);
         }
      });
      
      productsCache = regularProducts;
      renderProducts(regularProducts, productContainer);
      if (productContainer2) renderProducts(dailyProducts, productContainer2);
    }
  } catch (err) {
    console.error('Error loading products:', err);
    // Fallback on error
    productsCache = FALLBACK_PRODUCTS;
    renderProducts(productsCache, productContainer);
    if (productContainer2) renderProducts(COOKING_TODAY, productContainer2);
  }
}

function renderProducts(products, container) {
  container.innerHTML = '';
  products.forEach(p => container.appendChild(buildCard(p)));
}

function buildCard(product) {
  const img      = getProductImage(product);
  const price    = Number(product.price || 0);
  const original = product.originalPrice ? Number(product.originalPrice) : null;
  const rawDiscount = original ? Math.round((1 - price / original) * 100) : null;
  const discount = (rawDiscount && rawDiscount > 0) ? rawDiscount : null; // only show if positive
  const metaParts = [product.weight, product.pieces, product.serves].filter(Boolean);
  const badge     = product.badge || '';

  const card = document.createElement('div');
  card.className = 'product-card';
  card.id        = `prod-${product.id}`;

  card.innerHTML = `
    ${badge ? `<span class="badge-tag ${badge.toLowerCase()}">${escHtml(badge)}</span>` : ''}
    <img class="prod-img" src="${img}" alt="${escHtml(product.name)}" loading="lazy">
    <button class="add-btn"    id="add-${product.id}"    title="Add to cart">+</button>
    <button class="edit-btn"   id="edit-${product.id}"   title="Edit product">✏️ Edit</button>
    <button class="delete-btn" id="del-${product.id}"    title="Delete product">🗑 Delete</button>
    <div class="prod-info">
      <p class="prod-name">${escHtml(product.name)}</p>
      ${metaParts.length ? `<p class="prod-meta">${metaParts.map(m=>`<span>${escHtml(m)}</span>`).join('')}</p>` : ''}
      <div class="prod-pricing">
        <span class="price-current">₹${price}</span>
        ${original ? `<span class="price-original">₹${original}</span>` : ''}
        ${discount ? `<span class="discount">${discount}% off</span>` : ''}
      </div>
      <div class="delivery-tag"><span class="bolt">⚡</span> Delivery in 30 mins</div>
    </div>`;

  card.querySelector('.add-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    addToCart(product, img);
  });

  card.querySelector('.edit-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    window.openEditModal(product, img);
  });

  card.querySelector('.delete-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteProduct(product.id, product.name);
  });

  return card;
}

// Cart actions
function addToCart(product, img) {
  cart.push({ productId: product.id, name: product.name, price: Number(product.price), img });
  document.querySelectorAll(`#add-${product.id}`).forEach(btn => {
    btn.textContent = '✓';
    btn.classList.add('added');
    setTimeout(() => { btn.textContent = '+'; btn.classList.remove('added'); }, 900);
  });
  updateCartBadge();
  renderCartItems();
  showToast(`"${product.name}" added!`, 'success');
}

function removeFromCart(index) {
  cart.splice(index, 1);
  updateCartBadge();
  renderCartItems();
}

function updateCartBadge() {
  cartCountBadge.textContent = cart.length;
}

function renderCartItems() {
  cartItemsWrap.querySelectorAll('.cart-item').forEach(el => el.remove());

  if (cart.length === 0) {
    cartEmptyMsg.style.display = 'block';
    cartTotalEl.textContent    = '₹0';
    placeOrderBtn.disabled     = true;
    return;
  }

  cartEmptyMsg.style.display = 'none';
  placeOrderBtn.disabled     = false;

  const frag = document.createDocumentFragment();
  cart.forEach((item, idx) => {
    const el = document.createElement('div');
    el.className = 'cart-item';
    el.innerHTML = `
      <img src="${item.img}" alt="${escHtml(item.name)}">
      <div class="ci-info">
        <p class="ci-name">${escHtml(item.name)}</p>
        <p class="ci-price">₹${item.price.toFixed(2)}</p>
      </div>
      <button class="ci-remove" data-idx="${idx}" title="Remove">✕</button>`;
    el.querySelector('.ci-remove').addEventListener('click', () => removeFromCart(idx));
    frag.appendChild(el);
  });
  cartItemsWrap.appendChild(frag);

  const total = cart.reduce((s, i) => s + i.price, 0);
  cartTotalEl.textContent = `₹${total.toFixed(2)}`;
}

// ── Order details modal refs ──────────────────────────────────
const orderModalOverlay = document.getElementById('order-modal-overlay');
const orderModal        = document.getElementById('order-modal');
const orderModalClose   = document.getElementById('order-modal-close');
const orderDetailsForm  = document.getElementById('order-details-form');
const orderConfirmBtn   = document.getElementById('order-confirm-btn');
const orderModalError   = document.getElementById('order-modal-error');
const custNameInput     = document.getElementById('cust-name');
const custMobileInput   = document.getElementById('cust-mobile');
const custAddressInput  = document.getElementById('cust-address');

function openOrderModal() {
  orderModalOverlay.classList.add('open');
  orderModal.classList.add('open');
  orderModalError.style.display = 'none';
  custNameInput.focus();
}
function closeOrderModal() {
  orderModalOverlay.classList.remove('open');
  orderModal.classList.remove('open');
  orderDetailsForm.reset();
  orderModalError.style.display = 'none';
  placeOrderBtn.disabled    = false;
  placeOrderBtn.textContent = 'Place Order';
  orderConfirmBtn.disabled    = false;
  orderConfirmBtn.textContent = '🎉 Confirm Order';
}
orderModalClose.addEventListener('click', closeOrderModal);
orderModalOverlay.addEventListener('click', closeOrderModal);

// Step 1: clicking Place Order opens the details modal
placeOrderBtn.addEventListener('click', () => {
  if (!cart.length) return;
  openOrderModal();
});

// Step 2: submitting the form places the actual order
orderDetailsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  orderModalError.style.display = 'none';

  const name    = custNameInput.value.trim();
  const mobile  = custMobileInput.value.trim();
  const address = custAddressInput.value.trim();

  if (!name || !mobile || !address) {
    orderModalError.textContent   = 'Please fill in all fields.';
    orderModalError.style.display = 'block';
    return;
  }
  if (!/^\d{10}$/.test(mobile)) {
    orderModalError.textContent   = 'Enter a valid 10-digit mobile number.';
    orderModalError.style.display = 'block';
    return;
  }

  orderConfirmBtn.disabled    = true;
  orderConfirmBtn.textContent = 'Placing Order…';

  const total = cart.reduce((s, i) => s + i.price, 0);
  const items = cart.map(c => ({ productId: c.productId, name: c.name, price: c.price }));

  try {
    const docPromise = addDoc(collection(db, 'orders'), {
      customer_name:    name,
      customer_mobile:  mobile,
      customer_address: address,
      customer_id:  'guest',
      items,
      total_amount: total,
      paid_status:  'Pending',
      order_status: 'Pending',
      timestamp:    serverTimestamp()
    });

    // 3. Timeout Firebase write so it doesn't hang indefinitely 
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Firebase timeout')), 3500);
    });
    
    try {
      const docRef = await Promise.race([docPromise, timeoutPromise]);
      clearTimeout(timeoutId); // clear timeout to prevent unhandled rejection
      localStorage.setItem('lastOrderId', docRef.id);
      startLastOrderListener(docRef.id);
    } catch(fbErr) {
      console.warn("Firebase sync delayed.", fbErr);
    }

    closeOrderModal();
    
    // Play bell sound and synthesize voice
    try {
      const msg = new SpeechSynthesisUtterance("Your order is placed successfully!");
      window.speechSynthesis.speak(msg);

      const bellAudio = new Audio('https://actions.google.com/sounds/v1/doors/store_door_chime.ogg');
      bellAudio.play().catch(e => console.warn('Bell audio blocked:', e));
    } catch(err) { 
      console.warn('Audio blocked or not supported'); 
    }

    showToast('🎉 Order placed! Redirecting to WhatsApp...', 'success');
    
    // Auto-open WhatsApp for the customer to notify the store
    const waText = `Hello RK FARMS! 🐔
I just placed a new order on your website.

*Name:* ${name}
*Mobile:* ${mobile}
*Address:* ${address}

*Total Amount:* ₹${total.toFixed(2)}

Please confirm my order.`;
    const storePhone = "919290053193"; // Using primary founder number
    const waUrl = `https://wa.me/${storePhone}?text=${encodeURIComponent(waText)}`;
    
    cart = [];
    updateCartBadge();
    renderCartItems();
    closeCart();
    
    // Redirect customer to native WhatsApp application with a slight delay
    // to ensure Firebase has fully synced the document.
    setTimeout(() => {
      const newWin = window.open(waUrl, '_blank');
      // If popup blocker blocked it, fallback to same tab redirect
      if (!newWin || newWin.closed || typeof newWin.closed === 'undefined') {
        window.location.assign(waUrl);
      }
    }, 800);
  } catch (err) {
    console.error('Order error:', err);
    orderModalError.textContent   = 'Failed to place order. Please try again.';
    orderModalError.style.display = 'block';
    orderConfirmBtn.disabled    = false;
    orderConfirmBtn.textContent = '🎉 Confirm Order';
  }
});

// ── Rating System Logic ───────────────────────────────────────
const ratingModalOverlay = document.getElementById('rating-modal-overlay');
const ratingModal        = document.getElementById('rating-modal');
const ratingModalClose   = document.getElementById('rating-modal-close');
const ratingForm         = document.getElementById('rating-form');
const starContainer      = document.getElementById('star-rating-container');
const ratingSubmitBtn    = document.getElementById('rating-submit-btn');

let selectedRating = 0;
let lastOrderUnsub = null;

function openRatingModal() {
  ratingModalOverlay.classList.add('open');
  ratingModal.classList.add('open');
}

function closeRatingModal() {
  ratingModalOverlay.classList.remove('open');
  ratingModal.classList.remove('open');
  // Mark as "skipped this session" so it won't re-open on same tab
  sessionStorage.setItem('ratingSkipped', '1');
}

if (ratingModalClose) ratingModalClose.addEventListener('click', closeRatingModal);
if (ratingModalOverlay) ratingModalOverlay.addEventListener('click', closeRatingModal);

// Star click/touch handler
if (starContainer) {
  const stars = starContainer.querySelectorAll('span');
  
  function updateStars(rating) {
    stars.forEach(s => {
      if (parseInt(s.dataset.value) <= rating) {
        s.classList.add('active');
      } else {
        s.classList.remove('active');
      }
    });
  }

  stars.forEach(star => {
    // Standard click
    star.addEventListener('click', (e) => {
      e.preventDefault();
      selectedRating = parseInt(star.dataset.value);
      updateStars(selectedRating);
    });

    // Hover effects for desktop
    star.addEventListener('mouseenter', () => {
      updateStars(parseInt(star.dataset.value));
    });
    
    star.addEventListener('mouseleave', () => {
      updateStars(selectedRating);
    });

    // Instant touch support for mobile (bypasses click delay)
    star.addEventListener('touchstart', (e) => {
      e.preventDefault(); // Prevents simulated click later
      selectedRating = parseInt(star.dataset.value);
      updateStars(selectedRating);
    }, { passive: false });
  });
}

if (ratingForm) {
  ratingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (selectedRating === 0) {
      showToast('Please select a star rating!', 'error');
      return;
    }
    const orderId = localStorage.getItem('lastOrderId');
    const comment = document.getElementById('rating-comment').value.trim();

    ratingSubmitBtn.disabled = true;
    ratingSubmitBtn.textContent = 'Submitting...';

    try {
      await updateDoc(doc(db, 'orders', orderId), {
        rating: selectedRating,
        rating_comment: comment,
        rated: true
      });
      showToast('Thank you for your rating! ❤️', 'success');
      localStorage.removeItem('lastOrderId'); // Clear once rated
      closeRatingModal();
    } catch (err) {
      console.error('Rating error:', err);
      showToast('Failed to save rating.', 'error');
      ratingSubmitBtn.disabled = false;
      ratingSubmitBtn.textContent = 'Send My Rating';
    }
  });
}

function startLastOrderListener(forceId = null) {
  const orderId = forceId || localStorage.getItem('lastOrderId');
  if (!orderId) return;

  if (lastOrderUnsub) lastOrderUnsub();

  lastOrderUnsub = onSnapshot(doc(db, 'orders', orderId), (snapshot) => {
    if (!snapshot.exists()) return;
    const data = snapshot.data();
    
    // If marked as Prepared (Delivered) and not yet rated
    if (data.order_status === 'Prepared' && !data.rated) {
      openRatingModal();
      if (lastOrderUnsub) { 
        lastOrderUnsub(); 
        lastOrderUnsub = null; 
      }
    }
  });
}

// Initial live-order listener (fires when worker marks order as Prepared)
startLastOrderListener();

// ── Auto-show rating on page re-open ────────────────────────
// If the customer had an order last session that wasn't rated yet,
// ask them again when they re-open the page.
(async () => {
  const orderId  = localStorage.getItem('lastOrderId');
  const skipped  = sessionStorage.getItem('ratingSkipped');
  if (!orderId || skipped) return; // nothing pending or already skipped this tab

  try {
    const { getDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
    const snap = await getDoc(doc(db, 'orders', orderId));
    if (!snap.exists()) { localStorage.removeItem('lastOrderId'); return; }
    const data = snap.data();
    if (data.rated) { localStorage.removeItem('lastOrderId'); return; } // already rated

    // Show rating modal after a short warm-up delay
    setTimeout(() => openRatingModal(), 1500);
  } catch (e) {
    console.warn('Rating auto-check failed:', e);
  }
})();

// Utilities
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className   = `show ${type}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.className = ''; }, 3000);
}

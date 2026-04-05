// ============================================================
// index.js  –  Staff login by USERNAME + PASSWORD only
//  • No email required anywhere
//  • Username is converted to a hidden internal email:
//    e.g.  "admin"  →  "admin@farm2buy.in"
//  • Firestore users docs only need: username, role, name
// ============================================================

import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc }
  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Internal domain — users never see this
const INTERNAL_DOMAIN = '@farm2buy.in';

// ── Auto-redirect already-logged-in staff ────────────────────
onAuthStateChanged(auth, async (user) => {
  if (user) {
    await routeStaffByRole(user.uid);
  }
});

// ── Main login function (called from index.html) ──────────────
export async function loginUser(username, password) {
  const internalEmail = username.trim().toLowerCase() + INTERNAL_DOMAIN;

  try {
    const credential = await signInWithEmailAndPassword(auth, internalEmail, password);
    await routeStaffByRole(credential.user.uid);

  } catch (error) {
    console.error('Login error:', error.code);

    if (error.code === 'auth/user-not-found' ||
        error.code === 'auth/invalid-credential' ||
        error.code === 'auth/invalid-email') {
      showLoginError('Username not found. Please check and try again.');
    } else if (error.code === 'auth/wrong-password') {
      showLoginError('Incorrect password. Please try again.');
    } else if (error.code === 'auth/too-many-requests') {
      showLoginError('Too many failed attempts. Try again later.');
    } else {
      showLoginError('Login failed. Please check your credentials.');
    }
  }
}

// ── Route staff to their dashboard ───────────────────────────
async function routeStaffByRole(uid) {
  try {
    const userSnap = await getDoc(doc(db, 'users', uid));

    if (!userSnap.exists()) {
      await signOut(auth).catch(() => {});
      showLoginError('Account not configured. Contact Admin.');
      return;
    }

    const role = userSnap.data().role;

    if (role === 'admin') {
      window.location.href = 'admin.html';
    } else if (role === 'worker') {
      window.location.href = 'worker.html';
    } else {
      await signOut(auth).catch(() => {});
      window.location.href = 'customer.html';
    }
  } catch (error) {
    console.error('Role fetch error:', error);
    showLoginError('Could not verify your role. Please try again.');
  }
}

// ── Inline error display ──────────────────────────────────────
function showLoginError(msg) {
  const errEl = document.getElementById('login-error');
  if (errEl) {
    errEl.textContent    = msg;
    errEl.style.display = 'block';
  } else {
    alert(msg);
  }
}

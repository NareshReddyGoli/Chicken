// ============================================================
// firebase-config.js  –  Central Firebase initialization
// Firebase Auth removed – login uses simple hardcoded credentials
// Firebase is used ONLY for Firestore (products, orders)
// ============================================================

import { initializeApp }
  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore }
  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAnalytics } 
  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyBUBWxKXZ37CBLWvefHowk38KhMdOl2BTg",
  authDomain: "rkfarms-9aa46.firebaseapp.com",
  projectId: "rkfarms-9aa46",
  storageBucket: "rkfarms-9aa46.firebasestorage.app",
  messagingSenderId: "289700202216",
  appId: "1:289700202216:web:e9f9cb907182b72c2a2b5d",
  measurementId: "G-1WGB56TT51"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export const db = getFirestore(app);

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, PhoneAuthProvider, signInWithPopup, RecaptchaVerifier, signInWithPhoneNumber, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
// @ts-ignore
import { getDatabase, ref, set, get, update, push, query, orderByChild, equalTo, onValue, off } from 'firebase/database';
// @ts-ignore
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
// @ts-ignore
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCsDfwt4fDGWBJKlMRPzWIbBrCi0rzm0C0',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'vibe2ship-a740f.firebaseapp.com',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || 'https://vibe2ship-a740f-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'vibe2ship-a740f',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'vibe2ship-a740f.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '575192537847',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:575192537847:web:3e8185bb6a4ec21075d1f2',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-PYRL2CF6WG',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const database = getDatabase(app);
export const storage = getStorage(app);
export const messaging = getMessaging(app);

export const googleProvider = new GoogleAuthProvider();
export const phoneProvider = new PhoneAuthProvider(auth);

export {
  ref as dbRef,
  set as dbSet,
  get as dbGet,
  update as dbUpdate,
  push as dbPush,
  query as dbQuery,
  orderByChild as dbOrderByChild,
  equalTo as dbEqualTo,
  onValue as dbOnValue,
  off as dbOff,
  signInWithPopup,
  signInWithPhoneNumber,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  RecaptchaVerifier,
  storageRef,
  uploadBytes,
  getDownloadURL,
  getToken,
  onMessage,
};

export default app;

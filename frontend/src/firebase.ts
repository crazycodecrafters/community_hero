import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, PhoneAuthProvider, signInWithPopup, RecaptchaVerifier, signInWithPhoneNumber, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
// @ts-ignore
import { getDatabase, ref, set, get, update, push, query, orderByChild, equalTo, onValue, off } from 'firebase/database';
// @ts-ignore
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
// @ts-ignore
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: 'AIzaSyCsDfwt4fDGWBJKlMRPzWIbBrCi0rzm0C0',
  authDomain: 'vibe2ship-a740f.firebaseapp.com',
  databaseURL: 'https://vibe2ship-a740f-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'vibe2ship-a740f',
  storageBucket: 'vibe2ship-a740f.firebasestorage.app',
  messagingSenderId: '575192537847',
  appId: '1:575192537847:web:3e8185bb6a4ec21075d1f2',
  measurementId: 'G-PYRL2CF6WG',
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

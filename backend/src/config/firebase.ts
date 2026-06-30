import admin from 'firebase-admin';

let credential = admin.credential.applicationDefault();

// In serverless environments, it's easier to pass a base64 encoded JSON string
if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
  const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
  credential = admin.credential.cert(serviceAccount);
} else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  // Or raw JSON string
  credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential,
    projectId: 'vibe2ship-a740f',
    databaseURL: 'https://vibe2ship-a740f-default-rtdb.asia-southeast1.firebasedatabase.app',
    storageBucket: 'vibe2ship-a740f.firebasestorage.app',
  });
}

export const firebaseAuth = admin.auth();
export const firebaseDB = admin.database();
export const firebaseStorage = admin.storage().bucket();
export const firebaseAdmin = admin;

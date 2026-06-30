import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'vibe2ship-a740f',
    databaseURL: 'https://vibe2ship-a740f-default-rtdb.asia-southeast1.firebasedatabase.app',
    storageBucket: 'vibe2ship-a740f.firebasestorage.app',
  });
}

export const firebaseAuth = admin.auth();
export const firebaseDB = admin.database();
export const firebaseStorage = admin.storage().bucket();
export const firebaseAdmin = admin;

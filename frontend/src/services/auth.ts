import {
  auth, googleProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, database, dbRef, dbSet, dbGet, dbUpdate,
} from '../firebase';
import { UserProfile, UserRole } from '../types';

const USERS_REF = 'users';
const API_URL = '/api';

export async function getIdToken(): Promise<string> {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.getIdToken(true); // force refresh to capture any role claim updates
}

export async function signInWithGoogle(): Promise<UserProfile> {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;
  const idToken = await user.getIdToken();

  const idTokenResult = await user.getIdTokenResult();
  const role = (idTokenResult.claims.role as UserRole) || 'citizen';

  // Register in backend
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idToken,
      name: user.displayName,
      email: user.email,
      role,
    }),
  });

  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Registration failed');
  return data.data;
}

export async function loginWithEmail(email: string, password: string):Promise<UserProfile> {
  const result = await signInWithEmailAndPassword(auth, email, password);
  const idToken = await result.user.getIdToken();
  return loginWithIdToken(idToken);
}

export async function registerWithEmail(email: string, password: string, name: string, role: UserRole = 'citizen'):Promise<UserProfile> {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  const idToken = await result.user.getIdToken();
  
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, name, email, role }),
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Registration failed');
  return data.data;
}

export async function loginWithIdToken(idToken: string): Promise<UserProfile> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Login failed');
  return data.data;
}

export async function getProfile(): Promise<UserProfile> {
  const token = await getIdToken();
  const response = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Failed to get profile');
  return data.data;
}

export async function updateProfile(updates: Partial<UserProfile>): Promise<void> {
  const token = await getIdToken();
  await fetch(`${API_URL}/auth/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(updates),
  });
}

export async function setUserRole(uid: string, role: UserRole): Promise<void> {
  const token = await getIdToken();
  await fetch(`${API_URL}/auth/set-role`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ uid, role }),
  });
}

export function onAuthChange(callback: (user: any) => void) {
  return auth.onAuthStateChanged(callback);
}

export async function logout(): Promise<void> {
  await auth.signOut();
}

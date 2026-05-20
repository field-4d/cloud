import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type UserCredential,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

export const loginEmail = async (email: string, password: string): Promise<UserCredential> => {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const token = await credential.user.getIdToken();
  localStorage.setItem('jwtToken', token);
  return credential;
};

export const loginGoogle = async (): Promise<UserCredential> => {
  const credential = await signInWithPopup(auth, googleProvider);
  const token = await credential.user.getIdToken();
  localStorage.setItem('jwtToken', token);
  return credential;
};

export const getFirebaseToken = async (forceRefresh = false): Promise<string | null> => {
  const user = auth.currentUser;
  if (!user) {
    return null;
  }
  const token = await user.getIdToken(forceRefresh);
  localStorage.setItem('jwtToken', token);
  return token;
};

export const logoutFirebase = async (): Promise<void> => {
  await signOut(auth);
};

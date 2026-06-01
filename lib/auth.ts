import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyAJ-Fy5Qai4gAFBa55cGer8O3l8neMy2zI',
  authDomain: 'caliskancanta-seller.firebaseapp.com',
  projectId: 'caliskancanta-seller',
  storageBucket: 'caliskancanta-seller.firebasestorage.app',
  messagingSenderId: '161310364502',
  appId: '1:161310364502:web:47d52c38df6a3f60c6bcf7',
};

// Secondary app instance for creating users without disrupting admin session
const secondaryApp =
  getApps().find(a => a.name === 'secondary') ??
  initializeApp(firebaseConfig, 'secondary');

export const secondaryAuth = getAuth(secondaryApp);

'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';

async function fetchRole(uid: string): Promise<string | null> {
  try {
    const { collection, query, where, getDocs } = await import('firebase/firestore');
    const { db } = await import('@/lib/firebase');
    const snap = await getDocs(query(collection(db, 'users'), where('uid', '==', uid)));
    if (snap.empty) return null;
    return (snap.docs[0].data().role as string) ?? null;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const r = await fetchRole(u.uid);
        setRole(r);
      } else {
        setRole(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  return { user, role, loading };
}

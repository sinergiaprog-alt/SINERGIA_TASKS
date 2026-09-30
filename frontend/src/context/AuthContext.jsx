import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, getAuth } from 'firebase/auth';
import app from '../firebase';
import api from '../api/client';
import { resetE2ESession } from '../crypto/e2e';

const auth = getAuth(app);
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        resetE2ESession();
        setLoading(false);
        return;
      }
      // Una sesión Firebase anónima no debe intentar registrarse automáticamente.
      // El invitado se vincula explícitamente mediante su ID en /auth/guest-session.
      if (firebaseUser.isAnonymous) {
        setLoading(false);
        return;
      }
      try {
        const token = await firebaseUser.getIdToken();
        const res = await api.post('/auth/firebase-session', { idToken: token });
        setUser(res.data.user);
      } catch (err) {
        console.error(err);
        await auth.signOut();
        setUser(null);
      } finally { setLoading(false); }
    });
    return unsubscribe;
  }, []);

  async function refreshUser() {
    if (!auth.currentUser) return null;
    const token = await auth.currentUser.getIdToken();
    const res = await api.post('/auth/firebase-session', { idToken: token });
    setUser(res.data.user);
    return res.data.user;
  }

  async function logout() {
    await auth.signOut();
    resetE2ESession();
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, refreshUser, logout, auth }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }

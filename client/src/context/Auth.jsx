import { createContext, useContext, useState, useCallback } from 'react';
import api from '../api';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('crm_user')); } catch { return null; }
  });
  const login = useCallback((token, u) => {
    localStorage.setItem('crm_token', token);
    localStorage.setItem('crm_user', JSON.stringify(u));
    setUser(u);
  }, []);
  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* token may already be invalid */ }
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    setUser(null);
  }, []);
  const updateUser = useCallback((u) => { localStorage.setItem('crm_user', JSON.stringify(u)); setUser(u); }, []);
  const isAdmin = user?.role === 'admin';
  // Each role lives in its own panel: /admin/... or /executive/...
  const base = isAdmin ? '/admin' : '/executive';
  return <AuthCtx.Provider value={{ user, login, logout, updateUser, isAdmin, base }}>{children}</AuthCtx.Provider>;
}

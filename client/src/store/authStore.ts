import { create } from 'zustand';
import { User } from '../types';
import api from '../lib/api';

interface AuthState {
  user: User | null;
  token: string | null;
  initialized: boolean;
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  initialized: false,

  setAuth: (user, token) => {
    localStorage.setItem('token', token);
    set({ user, token });
  },

  clearAuth: () => {
    localStorage.removeItem('token');
    set({ user: null, token: null });
  },

  initialize: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ initialized: true });
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data.user, token, initialized: true });
    } catch {
      localStorage.removeItem('token');
      set({ user: null, token: null, initialized: true });
    }
  },
}));

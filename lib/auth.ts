
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { createClient } from '@supabase/supabase-js';
import { create } from 'zustand';
import { ConversationTurn } from './state';

// Supabase configuration - only initialize if valid environment variables are provided
const envSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const envSupabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = (envSupabaseUrl && envSupabaseKey) 
  ? createClient(envSupabaseUrl, envSupabaseKey) 
  : null;

// --- AUTH STORE ---
interface AuthState {
  session: any | null;
  user: { id: string; email: string; } | null;
  isSuperAdmin: boolean;
  loading: boolean;
  loadingData: boolean;
  signOut: () => void;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<void>;
}

export const useAuth = create<AuthState>(() => ({
  session: { MOCKED: true }, 
  user: { id: 'local-user', email: 'local-user@example.com' }, 
  isSuperAdmin: true,
  loading: false,
  loadingData: false,
  signOut: () => { /* No operation */ },
  signInWithPassword: async () => { return Promise.resolve(); },
  signUp: async () => { return Promise.resolve(); },
  sendPasswordResetEmail: async () => { return Promise.resolve(); },
}));

// --- DATABASE HELPERS ---
export const updateUserSettings = async (userId: string, newSettings: Partial<{ systemPrompt: string; voice: string }>) => {
  try {
    const storageKey = `eburon_settings_${userId}`;
    const existing = localStorage.getItem(storageKey);
    const merged = { ...(existing ? JSON.parse(existing) : {}), ...newSettings };
    localStorage.setItem(storageKey, JSON.stringify(merged));
  } catch {
    // Local storage fallback
  }

  if (supabase) {
    try {
      await supabase
        .from('user_settings')
        .upsert({ user_id: userId, ...newSettings });
    } catch {
      // Gracefully ignore remote sync failures
    }
  }
  return Promise.resolve();
};

export const updateUserConversations = async (userId: string, turns: ConversationTurn[]) => {
  const lastTurn = turns[turns.length - 1];
  if (!lastTurn || !lastTurn.isFinal) return;

  // Persist locally in localStorage
  try {
    const storageKey = `eburon_turns_${userId}`;
    const saved = localStorage.getItem(storageKey);
    const history = saved ? JSON.parse(saved) : [];
    history.push({
      role: lastTurn.role,
      text: lastTurn.text,
      translation: lastTurn.translation,
      transcription: lastTurn.transcription,
      timestamp: lastTurn.timestamp instanceof Date ? lastTurn.timestamp.toISOString() : new Date().toISOString(),
    });
    // Keep last 100 turns
    if (history.length > 100) history.shift();
    localStorage.setItem(storageKey, JSON.stringify(history));
  } catch {
    // Local storage fallback
  }

  // Attempt optional remote sync if Supabase is configured
  if (supabase) {
    try {
      await supabase
        .from('translations')
        .insert({
          user_id: userId,
          role: lastTurn.role,
          text: lastTurn.text,
          timestamp: lastTurn.timestamp instanceof Date ? lastTurn.timestamp.toISOString() : new Date().toISOString(),
        });
    } catch {
      // Gracefully ignore remote sync failures
    }
  }
};

export const clearUserConversations = async (userId: string) => {
  try {
    localStorage.removeItem(`eburon_turns_${userId}`);
  } catch {
    // Local storage fallback
  }

  if (supabase) {
    try {
      await supabase
        .from('translations')
        .delete()
        .eq('user_id', userId);
    } catch {
      // Gracefully ignore remote deletion failures
    }
  }
};

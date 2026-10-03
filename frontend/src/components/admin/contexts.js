import { createContext } from 'react';

// Shared React contexts for app-wide admin UI (kept separate from the
// provider components so Vite fast refresh works).
export const ToastContext = createContext(null);
export const ConfirmContext = createContext(null);

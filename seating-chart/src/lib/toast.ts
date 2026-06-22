import { create } from "zustand";

export interface ToastItem {
  id: number;
  message: string;
}

interface ToastState {
  toasts: ToastItem[];
  show: (message: string) => void;
  dismiss: (id: number) => void;
}

let seq = 0;

/** Tiny transient-toast store. Decoupled from the app store so a toast never
 *  lands in the undo history. */
export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  show: (message) => set((s) => ({ toasts: [...s.toasts, { id: ++seq, message }] })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Fire a brief confirmation toast from anywhere (callable outside React). */
export function toast(message: string): void {
  useToasts.getState().show(message);
}

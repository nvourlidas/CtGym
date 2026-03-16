import { X, CheckCircle, AlertTriangle } from 'lucide-react';
import type { ToastType } from '../types';

export default function Toast({ toast, onClose }: {
  toast: { type: ToastType; title: string; message?: string } | null;
  onClose: () => void;
}) {
  if (!toast) return null;
  const cls = toast.type === 'success'
    ? 'border-success/30 bg-success/10 text-success'
    : toast.type === 'error'
      ? 'border-danger/30 bg-danger/10 text-danger'
      : 'border-border/20 bg-secondary-background text-text-primary';
  const Icon = toast.type === 'success' ? CheckCircle : AlertTriangle;
  return (
    <div className={`fixed z-60 right-4 bottom-4 w-[min(420px,calc(100%-32px))] rounded-xl border px-4 py-3 shadow-xl backdrop-blur-sm flex items-start gap-3 ${cls}`}>
      <Icon className="h-4 w-4 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold">{toast.title}</div>
        {toast.message && <div className="mt-0.5 text-xs opacity-80 whitespace-pre-line">{toast.message}</div>}
      </div>
      <button type="button" onClick={onClose} className="shrink-0 h-5 w-5 rounded-lg flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity cursor-pointer">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

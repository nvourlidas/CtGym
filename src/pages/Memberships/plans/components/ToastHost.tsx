import { X } from 'lucide-react';
import type { Toast } from '../types';

export default function ToastHost({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  return (
    <div className="fixed right-4 top-4 z-100 flex w-88 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => {
        const isErr = t.variant === 'error';
        const isOk = t.variant === 'success';
        return (
          <div key={t.id} className="rounded-2xl border border-border/15 bg-secondary-background/95 backdrop-blur shadow-2xl overflow-hidden" style={{ animation: 'toastIn 0.25s ease' }}>
            <div className={['h-0.75', isErr ? 'bg-danger' : isOk ? 'bg-success' : 'bg-primary'].join(' ')} />
            <div className="px-4 py-3 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className={['text-sm font-bold', isErr ? 'text-danger' : isOk ? 'text-success' : 'text-text-primary'].join(' ')}>{t.title}</div>
                {t.message && <div className="mt-0.5 text-xs text-text-secondary">{t.message}</div>}
                {t.actionLabel && t.onAction && (
                  <button onClick={t.onAction} className="mt-2 h-7 px-3 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90 transition-all cursor-pointer">{t.actionLabel}</button>
                )}
              </div>
              <button onClick={() => dismiss(t.id)} className="p-1 rounded-lg border border-border/10 hover:bg-secondary/30 text-text-secondary cursor-pointer shrink-0"><X className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        );
      })}
      <style>{`@keyframes toastIn { from { opacity:0; transform:translateX(16px); } to { opacity:1; transform:none; } }`}</style>
    </div>
  );
}

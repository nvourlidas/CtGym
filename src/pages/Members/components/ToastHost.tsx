import { X } from 'lucide-react';
import type { Toast } from '../types';

export default function ToastHost({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  return (
    <div className="fixed right-4 top-4 z-100 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="rounded-xl border border-border/15 bg-secondary-background/95 backdrop-blur-xl shadow-2xl shadow-black/20 overflow-hidden"
          style={{ animation: 'toastIn 0.2s ease' }}
        >
          <div className={['h-0.75 w-full',
            t.variant === 'error'   ? 'bg-danger'  :
            t.variant === 'success' ? 'bg-success'  : 'bg-primary',
          ].join(' ')} />
          <div className="px-4 py-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={['text-sm font-bold',
                t.variant === 'error'   ? 'text-danger'  :
                t.variant === 'success' ? 'text-success'  : 'text-text-primary',
              ].join(' ')}>{t.title}</div>
              {t.message && <div className="mt-0.5 text-xs text-text-secondary leading-relaxed">{t.message}</div>}
              {t.actionLabel && t.onAction && (
                <button
                  type="button"
                  onClick={() => t.onAction?.()}
                  className="mt-2.5 h-7 rounded-lg px-3 text-xs font-bold bg-primary hover:bg-primary/90 text-white transition-all"
                >
                  {t.actionLabel}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="shrink-0 p-1 rounded-lg hover:bg-border/10 text-text-secondary hover:text-text-primary transition-all"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

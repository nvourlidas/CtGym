import { X } from 'lucide-react';
import type { Toast } from '../types';

type Props = { toasts: Toast[]; dismiss: (id: string) => void };

export default function ToastHost({ toasts, dismiss }: Props) {
  return (
    <div className="fixed right-4 top-4 z-100 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto rounded-2xl border border-border/15 bg-secondary-background/95 backdrop-blur-xl shadow-2xl shadow-black/25 overflow-hidden"
          style={{ animation: 'toastSlideIn 0.25s ease' }}
        >
          <div className={[
            'h-0.75',
            t.variant === 'error'   ? 'bg-danger'  :
            t.variant === 'success' ? 'bg-success'  : 'bg-primary',
          ].join(' ')} />
          <div className="px-4 py-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={[
                'text-sm font-bold',
                t.variant === 'error'   ? 'text-danger'  :
                t.variant === 'success' ? 'text-success'  : 'text-text-primary',
              ].join(' ')}>{t.title}</div>
              {t.message && <div className="mt-0.5 text-xs text-text-secondary">{t.message}</div>}
              {t.actionLabel && t.onAction && (
                <button
                  type="button"
                  onClick={() => t.onAction?.()}
                  className="mt-2.5 h-7 px-3 rounded-lg bg-primary hover:bg-primary/90 text-white text-xs font-bold transition-all cursor-pointer"
                >
                  {t.actionLabel}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="p-1 rounded-lg border border-border/15 hover:bg-secondary/30 text-text-secondary shrink-0 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0);    }
        }
      `}</style>
    </div>
  );
}

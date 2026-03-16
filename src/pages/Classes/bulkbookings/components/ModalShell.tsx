import { X, CalendarPlus } from 'lucide-react';

export default function ModalShell({ title, icon, subtitle, onClose, children, footer, maxW = 'max-w-lg' }: {
  title: string; icon?: React.ReactNode; subtitle?: string; onClose: () => void;
  children: React.ReactNode; footer?: React.ReactNode; maxW?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-3">
      <div className={`w-full ${maxW} rounded-2xl border border-border/10 bg-secondary-background text-text-primary shadow-2xl overflow-hidden`} style={{ animation: 'bulkModalIn 0.2s ease' }}>
        <div className="h-0.75 bg-linear-to-r from-primary/0 via-primary to-primary/0" />
        <div className="px-5 py-4 border-b border-border/10 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
              {icon ?? <CalendarPlus className="h-4 w-4 text-primary" />}
            </div>
            <div>
              <h2 className="font-black text-text-primary tracking-tight">{title}</h2>
              {subtitle && <p className="text-[11px] text-text-secondary mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl border border-border/10 hover:bg-secondary/30 text-text-secondary hover:text-text-primary transition-all cursor-pointer shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 max-h-[75vh] overflow-y-auto space-y-4">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-border/10 flex justify-end gap-2">{footer}</div>}
      </div>
      <style>{`@keyframes bulkModalIn { from { opacity:0; transform:translateY(16px) scale(0.98); } to { opacity:1; transform:none; } }`}</style>
    </div>
  );
}

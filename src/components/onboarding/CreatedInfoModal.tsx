import { CheckCircle2, X, Zap } from "lucide-react";

type Props = {
  open: boolean;
  tenantId: string;
  adminEmail: string;
  onClose: () => void;
};

export default function CreatedInfoModal({ open, adminEmail, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-800/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-md rounded-2xl bg-white border border-slate-200/80
                   shadow-[0_24px_60px_-8px_rgba(15,23,42,0.18),0_8px_20px_-4px_rgba(15,23,42,0.08)]
                   overflow-hidden"
        style={{ animation: "createdSlideUp 0.28s cubic-bezier(0.16,1,0.3,1)" }}
      >
        {/* Rainbow top bar */}
        <div className="h-0.75 w-full bg-linear-to-r from-emerald-400 via-teal-400 to-[#4c6fff]" />

        {/* Header */}
        <div className="flex items-start justify-between px-7 pt-6 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-100
                            text-emerald-700 text-[10.5px] font-bold uppercase tracking-widest
                            px-2.5 py-1 rounded-full mb-3">
              <Zap size={9} />
              Επιτυχής Δημιουργία
            </div>
            <h2 className="text-[22px] font-black text-slate-800 tracking-tight leading-none">
              Ο λογαριασμός είναι έτοιμος
            </h2>
            <p className="text-sm text-slate-400 mt-1 font-normal">
              Το γυμναστήριο και ο διαχειριστής δημιουργήθηκαν επιτυχώς.
            </p>
          </div>
          <button
            onClick={onClose}
            className="mt-0.5 p-1.5 rounded-xl text-slate-400 hover:text-slate-600
                       hover:bg-slate-100 transition-all cursor-pointer"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-7 pb-5 space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Email διαχειριστή
            </div>
            <div className="font-mono text-sm text-slate-800 break-all">
              {adminEmail || "—"}
            </div>
          </div>

          <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl">
            <CheckCircle2 size={14} className="text-amber-500 shrink-0 mt-px" />
            <p className="text-xs text-amber-700/90 leading-relaxed">
              Έχει σταλεί <strong className="font-bold">email επιβεβαίωσης</strong>. Άνοιξέ το και πάτα τον σύνδεσμο
              για να ενεργοποιηθεί ο λογαριασμός πριν κάνεις login.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-7 py-4 bg-slate-50/80 border-t border-slate-100">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white
                       bg-linear-to-br from-[#4c6fff] to-primary
                       shadow-lg shadow-indigo-200 hover:shadow-indigo-300
                       hover:-translate-y-px active:translate-y-0
                       transition-all duration-150 cursor-pointer"
          >
            <CheckCircle2 size={15} />
            Κλείσιμο
          </button>
        </div>
      </div>

      <style>{`
        @keyframes createdSlideUp {
          from { opacity: 0; transform: translateY(18px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0)    scale(1);     }
        }
      `}</style>
    </div>
  );
}

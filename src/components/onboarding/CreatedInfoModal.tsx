import { X } from "lucide-react";

type Props = {
  open: boolean;
  tenantId: string;
  adminEmail: string;
  onClose: () => void;
};

export default function CreatedInfoModal({
  open,
  adminEmail,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-60">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white border border-black/10 shadow-2xl overflow-hidden">
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-black/10">
            <div className="text-black">
              <div className="text-base font-semibold">Ο λογαριασμός δημιουργήθηκε</div>
              <div className="mt-1 text-sm text-success">
                Το γυμναστήριο και ο διαχειριστής δημιουργήθηκαν επιτυχώς.
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-black/5 text-black"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          <div className="px-5 py-4 text-sm text-black/80 space-y-3">
            <div className="rounded-xl border border-black/10 bg-[#ffc947]/35 px-3 py-2">
              <div className="text-xs text-black/60">Email διαχειριστή</div>
              <div className="font-mono text-sm text-black break-all">
                {adminEmail || "—"}
              </div>
            </div>

            <div className="text-center text-lg text-[#020201]">
              Σου έχει σταλεί email επιβεβαίωσης (verification). Άνοιξε το email και πάτα τον σύνδεσμο
              για να ενεργοποιηθεί ο λογαριασμός πριν κάνεις login.
            </div>
          </div>

          <div className="px-5 py-4 border-t border-black/10 flex items-center justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[#4c6fff] hover:bg-[#ffc947] hover:text-black text-white text-sm font-semibold cursor-pointer"
            >
              Κλείσιμο
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

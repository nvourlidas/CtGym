import { X, AlertTriangle } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function SubscriptionRequiredModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-secondary-background border border-border/10 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/10">
          <div className="flex items-center gap-2 text-warning">
            <AlertTriangle size={18} />
            <span className="font-semibold">Απαιτείται συνδρομή</span>
          </div>
          <button
            onClick={onClose}
            className="opacity-60 hover:opacity-100"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 text-sm text-text-primary space-y-3">
          <p>
            Η συνδρομή σας έχει λήξει ή δεν είναι ενεργή.
          </p>
          <p className="opacity-70">
            Για να χρησιμοποιήσετε αυτή τη λειτουργία, παρακαλώ ανανεώστε τη
            συνδρομή σας.
          </p>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border/10 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-md border border-border/15 hover:bg-border/5 text-sm"
          >
            Κλείσιμο
          </button>

          {/* optional – enable later */}
          {/* 
          <NavLink
            to="/billing"
            className="h-9 px-4 rounded-md bg-primary text-white text-sm flex items-center"
          >
            Μετάβαση στη Συνδρομή
          </NavLink>
          */}
        </div>
      </div>
    </div>
  );
}

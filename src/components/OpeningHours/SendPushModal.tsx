import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  canEdit: boolean;
  contextLabel: string; // e.g. "Αργία 2026-12-25" or "Κλείσιμο 2026-08-10 → 2026-08-20"
  defaultTitle?: string;
  defaultMessage?: string;
  onSend: (payload: { title: string; message: string }) => Promise<void>;
};

export default function SendPushModal({
  open,
  onClose,
  canEdit,
  contextLabel,
  defaultTitle = "",
  defaultMessage = "",
  onSend,
}: Props) {
  const [title, setTitle] = useState(defaultTitle);
  const [message, setMessage] = useState(defaultMessage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle);
    setMessage(defaultMessage);
    setError(null);
    setSaving(false);
  }, [open, defaultTitle, defaultMessage]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={saving ? undefined : onClose}
      />
      <div className="relative w-[min(560px,92vw)] rounded-2xl border border-white/10 bg-secondary-background p-5 shadow-xl">
        <div className="text-sm font-semibold text-text-primary">
          Αποστολή Push Notification
        </div>
        <div className="mt-1 text-xs text-text-secondary">
          {contextLabel}
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs text-text-secondary block mb-1">Τίτλος</label>
            <input
              className="input"
              value={title}
              disabled={!canEdit || saving}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="π.χ. Αλλαγή ωραρίου"
            />
          </div>

          <div>
            <label className="text-xs text-text-secondary block mb-1">Μήνυμα</label>
            <textarea
              className="input min-h-27.5 resize-none"
              value={message}
              disabled={!canEdit || saving}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Γράψε το μήνυμα που θα δουν οι χρήστες..."
            />
          </div>

          {error && (
            <div className="text-sm border border-danger/30 bg-danger/10 text-danger rounded-lg p-3">
              {error}
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm border border-white/10 bg-black/20 text-text-primary disabled:opacity-50"
          >
            Άκυρο
          </button>

          <button
            type="button"
            disabled={!canEdit || saving || !title.trim() || !message.trim()}
            onClick={async () => {
              setError(null);
              setSaving(true);
              try {
                await onSend({ title: title.trim(), message: message.trim() });
                onClose();
              } catch (e: any) {
                setError(e?.message ?? "Αποτυχία αποστολής.");
              } finally {
                setSaving(false);
              }
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white disabled:opacity-50"
          >
            {saving ? "Αποστολή..." : "Αποστολή"}
          </button>
        </div>
      </div>
    </div>
  );
}

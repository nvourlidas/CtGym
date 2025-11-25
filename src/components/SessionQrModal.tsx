// src/components/SessionQrModal.tsx
import { QRCodeCanvas } from "qrcode.react";

type SessionQrModalProps = {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  sessionId: string;
  sessionTitle?: string;
  token: string | null;
};

export function SessionQrModal({
  open,
  onClose,
  tenantId,
  sessionId,
  sessionTitle,
  token,
}: SessionQrModalProps) {
  if (!open || !token) return null;

  const value = JSON.stringify({
    type: "session_checkin",
    tenantId,
    sessionId,
    token,
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
      <div className="bg-secondary-background border border-white/10 rounded-xl p-6 w-full max-w-sm shadow-xl">
        <h2 className="text-lg font-semibold mb-1">QR Check-in</h2>
        {sessionTitle && (
          <p className="text-sm opacity-80 mb-4">{sessionTitle}</p>
        )}

        <div className="flex justify-center mb-4">
          <QRCodeCanvas value={value} size={260} includeMargin />
        </div>

        <p className="text-xs opacity-70 text-center mb-4">
          Οι συμμετέχοντες σκανάρουν αυτό το QR από την εφαρμογή για να
          κάνουν check-in.
        </p>

        <button
          onClick={onClose}
          className="w-full rounded px-3 py-2 bg-primary text-white text-sm"
        >
          Κλείσιμο
        </button>
      </div>
    </div>
  );
}

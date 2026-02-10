// src/components/Members/SendMemberPushModal.tsx
import { useState } from 'react';
import { supabase } from '../../lib/supabase';

type MemberLite = {
  id: string;
  full_name: string | null;
  email: string | null;
  user_id?: string | null;
};

type RecipientMode = 'selected' | 'all';

type SendMemberPushModalProps = {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string | null;
  tenantName?: string | null;
  selectedMembers?: MemberLite[];
};

export default function SendMemberPushModal({
  isOpen,
  onClose,
  tenantId,
  tenantName,
  selectedMembers = [],
}: SendMemberPushModalProps) {
  const [title, setTitle] = useState('Cloudtec Gym');
  const [body, setBody] = useState('');
  const [recipientMode, setRecipientMode] = useState<RecipientMode>('selected');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedCount = selectedMembers.length;

  const handleSend = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!tenantId) {
      setErrorMsg('Λείπει το tenant_id. Κάνε refresh ή ξανασύνδεση.');
      return;
    }

    if (!body.trim()) {
      setErrorMsg('Γράψε ένα μήνυμα για να σταλεί.');
      return;
    }

    const trimmedTitle = (title || 'Cloudtec Gym').trim();
    const trimmedBody = body.trim();

    const payload: any = {
      tenant_id: tenantId,
      title: trimmedTitle,
      body: trimmedBody,
      data: {
        kind: 'admin_broadcast',
        tenantId,
        sentAt: new Date().toISOString(),
      },
    };

    if (recipientMode === 'all') {
      payload.send_to_all = true;
    } else {
      const userIds =
        selectedMembers
          ?.map((m) => m.user_id)
          .filter((x): x is string => Boolean(x)) ?? [];

      if (!userIds.length) {
        setErrorMsg(
          'Δεν βρέθηκαν users με συνδεδεμένο λογαριασμό (user_id) για τα επιλεγμένα μέλη.',
        );
        return;
      }

      payload.user_ids = userIds;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-push', {
        body: payload,
      });

      console.log('send-push result', { data, error });

      if (error) {
        console.error('send-push error', error);
        setErrorMsg(error.message ?? 'Κάτι πήγε στραβά κατά την αποστολή.');
        return;
      }

      setSuccessMsg('Η ειδοποίηση στάλθηκε με επιτυχία ✅');
      setBody('');
      // onClose(); // αν θες να κλείνει αυτόματα, ξεσχολίασέ το
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message ?? 'Κάτι πήγε στραβά κατά την αποστολή.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-md border border-border/10 bg-secondary-background text-text-primary shadow-xl">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border/10 flex items-center justify-between">
          <div>
            <div className="font-semibold text-sm">Αποστολή Push Ειδοποίησης</div>
            {tenantName && (
              <div className="text-xs text-text-secondary mt-0.5">
                Γυμναστήριο: <span className="font-medium">{tenantName}</span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 hover:bg-border/5 text-sm"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Recipient mode */}
          <div className="text-xs text-text-secondary">
            <div className="mb-1">Παραλήπτες</div>
            <div className="inline-flex rounded-md border border-border/10 overflow-hidden">
              <button
                type="button"
                onClick={() => setRecipientMode('selected')}
                className={`px-3 py-1 text-xs ${
                  recipientMode === 'selected'
                    ? 'bg-primary text-white'
                    : 'bg-secondary-background text-text-primary hover:bg-secondary/40'
                }`}
              >
                Επιλεγμένα μέλη ({selectedCount})
              </button>
              <button
                type="button"
                onClick={() => setRecipientMode('all')}
                className={`px-3 py-1 text-xs border-l border-white/10 ${
                  recipientMode === 'all'
                    ? 'bg-primary text-white'
                    : 'bg-secondary-background text-text-primary hover:bg-secondary/40'
                }`}
              >
                Όλα τα μέλη του gym
              </button>
            </div>

            {recipientMode === 'selected' && selectedCount === 0 && (
              <div className="mt-1 text-[11px] text-accent">
                Δεν έχεις επιλέξει μέλη. Επίλεξε κάποια από τη λίστα ή άλλαξε
                σε &quot;Όλα τα μέλη&quot;.
              </div>
            )}
          </div>

          {/* Title */}
          <div className="block">
            <div className="mb-1 text-sm opacity-80">Τίτλος</div>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Cloudtec Gym"
            />
          </div>

          {/* Body */}
          <div className="block">
            <div className="mb-1 text-sm opacity-80">Μήνυμα</div>
            <textarea
              className="input min-h-30 resize-none"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Π.χ. Μην ξεχάσεις το σημερινό μάθημα στις 18:00 💪"
            />
          </div>

          {errorMsg && (
            <div className="text-xs text-red-400">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="text-xs text-emerald-500">
              {successMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border/10 flex justify-end gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
          >
            Ακύρωση
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSend}
            disabled={
              loading ||
              !tenantId ||
              (!body.trim()) ||
              (recipientMode === 'selected' && selectedCount === 0)
            }
          >
            {loading ? 'Αποστολή...' : 'Αποστολή Push'}
          </button>
        </div>
      </div>
    </div>
  );
}

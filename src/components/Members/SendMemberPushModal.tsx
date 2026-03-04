// src/components/Members/SendMemberPushModal.tsx
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Bell, X, AlertTriangle, CheckCircle2, Loader2, User, Users, Send } from 'lucide-react';

type MemberLite = { id: string; full_name: string | null; email: string | null; user_id?: string | null };
type RecipientMode = 'selected' | 'all';

type SendMemberPushModalProps = {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string | null;
  tenantName?: string | null;
  selectedMembers?: MemberLite[];
};

export default function SendMemberPushModal({
  isOpen, onClose, tenantId, tenantName, selectedMembers = [],
}: SendMemberPushModalProps) {
  const [title, setTitle]               = useState('Cloudtec Gym');
  const [body, setBody]                 = useState('');
  const [recipientMode, setRecipientMode] = useState<RecipientMode>('selected');
  const [loading, setLoading]           = useState(false);
  const [errorMsg, setErrorMsg]         = useState<string | null>(null);
  const [successMsg, setSuccessMsg]     = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedCount = selectedMembers.length;

  const handleSend = async () => {
    setErrorMsg(null); setSuccessMsg(null);

    if (!tenantId) { setErrorMsg('Λείπει το tenant_id. Κάνε refresh ή ξανασύνδεση.'); return; }
    if (!body.trim()) { setErrorMsg('Γράψε ένα μήνυμα για να σταλεί.'); return; }

    const payload: any = {
      tenant_id: tenantId,
      title: (title || 'Cloudtec Gym').trim(),
      body: body.trim(),
      data: { kind: 'admin_broadcast', tenantId, sentAt: new Date().toISOString() },
    };

    if (recipientMode === 'all') {
      payload.send_to_all = true;
    } else {
      const userIds = selectedMembers.map((m) => m.user_id).filter((x): x is string => Boolean(x));
      if (!userIds.length) { setErrorMsg('Δεν βρέθηκαν users με συνδεδεμένο λογαριασμό για τα επιλεγμένα μέλη.'); return; }
      payload.user_ids = userIds;
    }

    setLoading(true);
    try {
      const {error } = await supabase.functions.invoke('send-push', { body: payload });
      if (error) { setErrorMsg(error.message ?? 'Κάτι πήγε στραβά κατά την αποστολή.'); return; }
      setSuccessMsg('Η ειδοποίηση στάλθηκε με επιτυχία!');
      setBody('');
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Κάτι πήγε στραβά κατά την αποστολή.');
    } finally {
      setLoading(false);
    }
  };

  const canSend = !loading && !!tenantId && !!body.trim() && !(recipientMode === 'selected' && selectedCount === 0);

  // Live preview char count
  const bodyLen = body.trim().length;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="w-full max-w-lg rounded-2xl border border-border/10 bg-secondary-background text-text-primary shadow-2xl overflow-hidden"
        style={{ animation: 'pushModalIn 0.2s ease' }}
      >
        {/* Top accent bar */}
        <div className="h-0.75 w-full bg-linear-to-r from-primary/0 via-primary to-primary/0" />

        {/* Header */}
        <div className="px-5 py-4 border-b border-border/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
              <Bell className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="font-black text-text-primary tracking-tight">Αποστολή Push Ειδοποίησης</h2>
              {tenantName && (
                <p className="text-[11px] text-text-secondary mt-px">
                  Γυμναστήριο: <span className="font-medium">{tenantName}</span>
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl border border-border/10 hover:bg-secondary/30 text-text-secondary hover:text-text-primary transition-all cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">

          {/* Recipient mode */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Παραλήπτες</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'selected' as RecipientMode, icon: <User className="h-3.5 w-3.5" />, label: 'Επιλεγμένα μέλη', sub: selectedCount > 0 ? `${selectedCount} επιλεγμένα` : 'Κανένα επιλεγμένο' },
                { value: 'all' as RecipientMode, icon: <Users className="h-3.5 w-3.5" />, label: 'Όλα τα μέλη', sub: 'Μαζική αποστολή' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRecipientMode(opt.value)}
                  className={[
                    'text-left rounded-xl border p-3.5 transition-all duration-150 cursor-pointer',
                    recipientMode === opt.value
                      ? 'border-primary/40 bg-primary/8'
                      : 'border-border/10 bg-secondary/5 hover:border-primary/20',
                  ].join(' ')}
                >
                  <div className={['flex items-center gap-2 mb-1', recipientMode === opt.value ? 'text-primary' : 'text-text-secondary'].join(' ')}>
                    {opt.icon}
                    <span className="text-xs font-bold">{opt.label}</span>
                  </div>
                  <div className="text-[10.5px] text-text-secondary">{opt.sub}</div>
                </button>
              ))}
            </div>

            {recipientMode === 'selected' && selectedCount === 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-accent/25 bg-accent/8 text-accent text-xs">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Δεν έχεις επιλέξει μέλη. Επίλεξε κάποια από τη λίστα ή άλλαξε σε «Όλα τα μέλη».
              </div>
            )}
          </div>

          {/* Notification preview card */}
          <div className="rounded-xl border border-border/10 bg-secondary/5 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border/10 flex items-center gap-1.5">
              <Bell className="h-3 w-3 text-text-secondary opacity-60" />
              <span className="text-[10.5px] font-bold uppercase tracking-widest text-text-secondary">Προεπισκόπηση ειδοποίησης</span>
            </div>
            <div className="px-4 py-3 space-y-3">

              {/* Title input */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Τίτλος</label>
                <input
                  className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Cloudtec Gym"
                />
              </div>

              {/* Body input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Μήνυμα</label>
                  <span className={['text-[10px]', bodyLen > 160 ? 'text-warning' : 'text-text-secondary'].join(' ')}>
                    {bodyLen} χαρακτήρες
                  </span>
                </div>
                <textarea
                  className="w-full min-h-22.5 px-3.5 py-2.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all resize-none"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Π.χ. Μην ξεχάσεις το σημερινό μάθημα στις 18:00 💪"
                />
              </div>
            </div>

            {/* Live phone-style preview */}
            {(title.trim() || body.trim()) && (
              <div className="px-4 pb-3">
                <div className="rounded-xl border border-border/10 bg-secondary/15 px-3.5 py-3 flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Bell className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-text-primary truncate">{title || 'Cloudtec Gym'}</div>
                    <div className="text-[11px] text-text-secondary mt-0.5 line-clamp-2 leading-relaxed">{body || '…'}</div>
                  </div>
                  <div className="text-[10px] text-text-secondary opacity-50 shrink-0 mt-0.5">τώρα</div>
                </div>
              </div>
            )}
          </div>

          {/* Feedback */}
          {errorMsg && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-danger/25 bg-danger/8 text-danger text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-success/25 bg-success/8 text-success text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-px" />
              {successMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border/10 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer"
          >
            Ακύρωση
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className="
              group relative inline-flex items-center gap-2 h-9 px-5 rounded-xl
              text-sm font-bold text-white bg-primary hover:bg-primary/90
              shadow-sm shadow-primary/20 hover:-translate-y-px active:translate-y-0
              disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0
              transition-all duration-150 cursor-pointer overflow-hidden
            "
          >
            <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
            {loading
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin relative z-10" /><span className="relative z-10">Αποστολή…</span></>
              : <><Send className="h-3.5 w-3.5 relative z-10" /><span className="relative z-10">Αποστολή Push</span></>
            }
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pushModalIn {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>
    </div>
  );
}
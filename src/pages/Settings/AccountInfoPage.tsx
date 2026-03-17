import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import {
  UserCog, Mail, Hash, Lock, Trash2, AlertTriangle,
  CheckCircle2, Loader2, ShieldAlert, User,
} from 'lucide-react';

function FormField({ label, icon, children, hint }: {
  label: string; icon?: React.ReactNode; children: React.ReactNode; hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-text-secondary">
        {icon && <span className="opacity-60">{icon}</span>}
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-text-secondary">{hint}</p>}
    </div>
  );
}

function StyledInput({ value, onChange, placeholder, disabled = false }: {
  value: string; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; disabled?: boolean;
}) {
  return (
    <input
      value={value} onChange={onChange} placeholder={placeholder} disabled={disabled}
      className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-text-secondary disabled:opacity-50 disabled:cursor-not-allowed"
    />
  );
}

export default function AccountInfoPage() {
  const { profile } = useAuth();

  const [memberId, setMemberId]   = useState<string | null>(null);
  const [fullName, setFullName]   = useState('');
  const [afm, setAfm]             = useState('');
  const [loading, setLoading]     = useState(true);

  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent]       = useState(false);
  const [resetError, setResetError]     = useState<string | null>(null);

  const [showDeleteModal, setShowDeleteModal]       = useState(false);
  const [deleteConfirm, setDeleteConfirm]           = useState('');
  const [deleting, setDeleting]                     = useState(false);
  const [deleteError, setDeleteError]               = useState<string | null>(null);

  const email = profile?.email ?? '';

  useEffect(() => {
    if (profile?.id && profile?.tenant_id) loadMember();
  }, [profile?.id, profile?.tenant_id]);

  async function loadMember() {
    setLoading(true);
    const { data } = await supabase
      .from('members')
      .select('id, full_name, afm')
      .eq('user_id', profile!.id)
      .eq('tenant_id', profile!.tenant_id!)
      .maybeSingle();
    if (data) {
      setMemberId(data.id);
      setFullName(data.full_name ?? '');
      setAfm((data as any).afm ?? '');
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!memberId) return;
    setSaving(true); setSaveError(null); setSaveSuccess(false);
    try {
      const { error: memberErr } = await supabase
        .from('members')
        .update({ full_name: fullName.trim() || null, afm: afm.trim() || null })
        .eq('id', memberId);
      if (memberErr) throw new Error(memberErr.message);

      const { error: authErr } = await supabase.auth.updateUser({
        data: { full_name: fullName.trim() || null },
      });
      if (authErr) throw new Error(authErr.message);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: any) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordReset() {
    if (!email) return;
    setResetSending(true); setResetError(null); setResetSent(false);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setResetSending(false);
    if (error) { setResetError(error.message); return; }
    setResetSent(true);
  }

  async function handleDeleteAccount() {
    if (!profile?.id) return;
    setDeleting(true); setDeleteError(null);
    try {
      const res = await supabase.functions.invoke('tenant-delete', { method: 'POST' });
      const data = res.data as any;
      if (data?.error) throw new Error(data.error);
      if (res.error) throw new Error(res.error.message);
      await supabase.auth.signOut();
    } catch (e: any) {
      setDeleteError(e.message);
      setDeleting(false);
    }
  }

  function closeDeleteModal() {
    setShowDeleteModal(false);
    setDeleteConfirm('');
    setDeleteError(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-text-secondary text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />Φόρτωση…
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
          <UserCog className="h-4.5 w-4.5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-black text-text-primary tracking-tight">Στοιχεία Λογαριασμού</h1>
          <p className="text-xs text-text-secondary mt-px">Διαχείριση προσωπικών στοιχείων και ασφάλειας.</p>
        </div>
      </div>

      {/* Profile info */}
      <div className="rounded-2xl border border-border/10 bg-secondary-background shadow-sm p-5 space-y-4">
        <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Στοιχεία Προφίλ</div>

        <FormField label="Email" icon={<Mail className="h-3 w-3" />} hint="Το email δεν μπορεί να αλλαχθεί από εδώ.">
          <StyledInput value={email} disabled />
        </FormField>

        <FormField label="Ονοματεπώνυμο" icon={<User className="h-3 w-3" />}>
          <StyledInput value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="π.χ. Γιώργος Παπαδόπουλος" />
        </FormField>

        <FormField label="ΑΦΜ" icon={<Hash className="h-3 w-3" />}>
          <StyledInput value={afm} onChange={(e) => setAfm(e.target.value)} placeholder="π.χ. 123456789" />
        </FormField>

        {saveError && (
          <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-danger/25 bg-danger/8 text-danger text-xs">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{saveError}
          </div>
        )}
        {saveSuccess && (
          <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-success/25 bg-success/8 text-success text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />Οι αλλαγές αποθηκεύτηκαν.
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-primary/20 transition-all cursor-pointer"
          >
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Αποθήκευση…</> : 'Αποθήκευση αλλαγών'}
          </button>
        </div>
      </div>

      {/* Security */}
      <div className="rounded-2xl border border-border/10 bg-secondary-background shadow-sm p-5 space-y-4">
        <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Ασφάλεια</div>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-secondary/30 border border-border/10 flex items-center justify-center shrink-0">
              <Lock className="h-3.5 w-3.5 text-text-secondary" />
            </div>
            <div>
              <div className="text-sm font-semibold text-text-primary">Επαναφορά κωδικού</div>
              <div className="text-xs text-text-secondary">Θα σταλεί σύνδεσμος επαναφοράς στο email σου.</div>
            </div>
          </div>
          <button onClick={handlePasswordReset} disabled={resetSending || resetSent}
            className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0"
          >
            {resetSending
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1.5" />Αποστολή…</>
              : resetSent
              ? <><CheckCircle2 className="h-3.5 w-3.5 inline mr-1.5 text-success" />Στάλθηκε!</>
              : 'Αποστολή email'}
          </button>
        </div>

        {resetError && (
          <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-danger/25 bg-danger/8 text-danger text-xs">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{resetError}
          </div>
        )}
        {resetSent && (
          <div className="px-3.5 py-2.5 rounded-xl border border-success/25 bg-success/8 text-success text-xs">
            Ο σύνδεσμος στάλθηκε στο <span className="font-bold">{email}</span>. Έλεγξε το inbox σου.
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div className="rounded-2xl border border-danger/20 bg-secondary-background shadow-sm p-5 space-y-4">
        <div className="text-[11px] font-bold uppercase tracking-widest text-danger/70">Επικίνδυνη Ζώνη</div>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-danger/10 border border-danger/20 flex items-center justify-center shrink-0">
              <Trash2 className="h-3.5 w-3.5 text-danger" />
            </div>
            <div>
              <div className="text-sm font-semibold text-text-primary">Διαγραφή λογαριασμού</div>
              <div className="text-xs text-text-secondary">Αφαιρεί τον λογαριασμό σου. Η ενέργεια δεν αναιρείται.</div>
            </div>
          </div>
          <button onClick={() => setShowDeleteModal(true)}
            className="h-9 px-4 rounded-xl border border-danger/25 text-sm font-semibold text-danger hover:bg-danger/10 transition-all cursor-pointer shrink-0"
          >
            Διαγραφή λογαριασμού
          </button>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border/10 bg-secondary-background shadow-2xl p-6 space-y-4"
            style={{ animation: 'accountModalIn 0.2s ease' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-danger/10 border border-danger/20 flex items-center justify-center shrink-0">
                <ShieldAlert className="h-4.5 w-4.5 text-danger" />
              </div>
              <div>
                <h3 className="font-black text-text-primary">Διαγραφή λογαριασμού</h3>
                <p className="text-xs text-text-secondary">Η ενέργεια δεν μπορεί να αναιρεθεί.</p>
              </div>
            </div>

            <div className="px-3.5 py-3 rounded-xl border border-danger/20 bg-danger/5 text-xs space-y-1">
              <div className="font-bold text-danger/90">Τι θα διαγραφεί οριστικά:</div>
              <ul className="list-disc list-inside space-y-0.5 text-danger/70">
                <li>Ο λογαριασμός και τα στοιχεία σου</li>
                <li>Όλα τα μέλη και τα δεδομένα τους</li>
                <li>Όλα τα τμήματα και οι συνεδρίες</li>
                <li>Όλες οι κρατήσεις</li>
                <li>Όλες οι συνδρομές και τα πλάνα</li>
                <li>Όλα τα υπόλοιπα δεδομένα του γυμναστηρίου</li>
              </ul>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">
                Πληκτρολόγησε το email σου για επιβεβαίωση
              </label>
              <input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={email}
                className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-background text-sm text-text-primary outline-none focus:border-danger/40 focus:ring-2 focus:ring-danger/10 transition-all placeholder:text-text-secondary"
              />
            </div>

            {deleteError && (
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-danger/25 bg-danger/8 text-danger text-xs">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{deleteError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={closeDeleteModal} disabled={deleting}
                className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 disabled:opacity-50 transition-all cursor-pointer"
              >
                Ακύρωση
              </button>
              <button onClick={handleDeleteAccount} disabled={deleteConfirm !== email || deleting}
                className="h-9 px-4 rounded-xl text-sm font-bold text-white bg-danger hover:bg-danger/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                {deleting
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1.5" />Διαγραφή…</>
                  : 'Διαγραφή οριστικά'}
              </button>
            </div>
          </div>
          <style>{`@keyframes accountModalIn { from{opacity:0;transform:translateY(12px) scale(0.98)} to{opacity:1;transform:none} }`}</style>
        </div>
      )}
    </div>
  );
}

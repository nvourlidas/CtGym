// src/components/Members/SendMemberEmailModal.tsx
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import {
  Mail, X, ChevronRight, ChevronLeft, Loader2, AlertTriangle,
  Users, User, Calendar, KeyRound, Pencil, Send,
} from 'lucide-react';

type SendMemberEmailModalProps = {
  isOpen: boolean;
  onClose: () => void;
  tenantName?: string | null;
  tenantId?: string | null;
  memberIds?: string[];
  selectedMembers?: { id: string; full_name: string | null; email: string | null }[];
};

type RecipientMode = 'selected' | 'allActive';
type EmailType = 'custom' | 'bookings' | 'password_reset';

function getWeekInfo(offsetWeeks = 0) {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday + offsetWeeks * 7);
  monday.setHours(0, 0, 0, 0);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  nextMonday.setHours(0, 0, 0, 0);
  const endTmp = new Date(nextMonday);
  endTmp.setDate(nextMonday.getDate() - 1);
  const fmt = (d: Date) => d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit' });
  return { startIso: monday.toISOString(), endIso: nextMonday.toISOString(), startLabel: fmt(monday), endLabel: fmt(endTmp) };
}

function textToHtml(text: string): string {
  if (!text) return '<p></p>';
  const parts = text.split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => `<p>${l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`);
  return parts.join('') || '<p></p>';
}

function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, '').replace(/\s+\n/g, '\n').trim();
}

async function buildBookingsTemplate(args: { tenantId: string; member: { id: string; full_name: string | null; email: string | null }; gymName: string; weekOffset: number }) {
  const { tenantId, member, gymName, weekOffset } = args;
  const { startIso, endIso, startLabel, endLabel } = getWeekInfo(weekOffset);
  const { data, error } = await supabase.from('bookings')
    .select(`id, status, class_sessions(starts_at, classes(title))`)
    .eq('tenant_id', tenantId).eq('user_id', member.id)
    .gte('class_sessions.starts_at', startIso).lt('class_sessions.starts_at', endIso);

  const friendlyName = member.full_name ?? '';
  const baseSubject = `Το εβδομαδιαίο πρόγραμμά σου (${startLabel} – ${endLabel})`;

  if (error) {
    return { subject: baseSubject, body: `Γεια σου ${friendlyName},\n\nΑκολούθησε το πρόγραμμα των προπονήσεών σου για αυτή την εβδομάδα (${startLabel} – ${endLabel}).\n\nΚαλή προπόνηση!\n${gymName}` };
  }

  const rows = ((data ?? []) as any[]).sort((a, b) => new Date(a.class_sessions?.starts_at ?? 0).getTime() - new Date(b.class_sessions?.starts_at ?? 0).getTime());
  const entries = rows.map((b) => {
    const cs = b.class_sessions;
    if (!cs) return null;
    const dt = cs.starts_at ? new Date(cs.starts_at) : null;
    const title = cs.classes?.title ?? 'Μάθημα';
    const when = dt ? dt.toLocaleString('el-GR', { weekday:'short', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : 'Χωρίς ώρα';
    return `- ${when} – ${title}`;
  }).filter(Boolean);

  let body = `Γεια σου ${friendlyName},\n\nΑκολουθεί το πρόγραμμα των προπονήσεών σου για αυτή την εβδομάδα (${startLabel} – ${endLabel}):\n\n`;
  body += entries.length ? entries.join('\n') + '\n\n' : 'Δεν υπάρχουν κρατήσεις για αυτή την εβδομάδα.\n\n';
  body += `Καλή προπόνηση!\n${gymName}`;
  return { subject: baseSubject, body };
}

// ── Email type config ──────────────────────────────────────────────────────
const EMAIL_TYPES: { id: EmailType; icon: React.ReactNode; label: string; desc: string; note?: string }[] = [
  { id:'custom',         icon:<Pencil className="h-4 w-4"/>,    label:'Custom email',    desc:'Ελεύθερο κείμενο, για ανακοινώσεις, προσφορές κλπ.' },
  { id:'bookings',       icon:<Calendar className="h-4 w-4"/>,  label:'Send bookings',   desc:'Εβδομαδιαίο πρόγραμμα προπονήσεων ενός μέλους.', note:'Απαιτεί ακριβώς ένα επιλεγμένο μέλος.' },
  { id:'password_reset', icon:<KeyRound className="h-4 w-4"/>,  label:'Reset password',  desc:'Στέλνει email επαναφοράς κωδικού μέσω Supabase.', note:'Απαιτεί ακριβώς ένα επιλεγμένο μέλος.' },
];

export default function SendMemberEmailModal({
  isOpen, onClose, tenantName, tenantId, memberIds, selectedMembers,
}: SendMemberEmailModalProps) {
  const [step, setStep]                       = useState<1 | 2>(1);
  const [recipientMode, setRecipientMode]     = useState<RecipientMode>('allActive');
  const [emailType, setEmailType]             = useState<EmailType>('custom');
  const [weekOffset, setWeekOffset]           = useState(0);
  const [subject, setSubject]                 = useState('');
  const [body, setBody]                       = useState('');
  const [sending, setSending]                 = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);

  const safeTenantName   = tenantName || 'Cloudtec Gym';
  const safeMemberIds    = memberIds ?? [];
  const hasSelectedMembers = safeMemberIds.length > 0;
  const selectedMember   = selectedMembers && selectedMembers.length === 1 ? selectedMembers[0] : null;
  const { startLabel, endLabel } = getWeekInfo(weekOffset);
  const weekLabel = `${startLabel} – ${endLabel}`;

  useEffect(() => {
    if (isOpen) {
      setStep(1); setEmailType('custom'); setWeekOffset(0);
      setSending(false); setTemplateLoading(false);
      setSubject(''); setBody('');
      setRecipientMode(hasSelectedMembers ? 'selected' : 'allActive');
    }
  }, [isOpen, hasSelectedMembers]);

  if (!isOpen) return null;

  const handleNext = async () => {
    if (emailType === 'bookings' || emailType === 'password_reset') {
      if (recipientMode !== 'selected') { alert('Για αυτό το είδος email πρέπει να στείλεις μόνο σε ένα συγκεκριμένο μέλος.'); return; }
      if (!hasSelectedMembers) { alert('Δεν έχεις επιλέξει κάποιο μέλος στον πίνακα.'); return; }
      if (safeMemberIds.length !== 1 || !selectedMember) { alert('Πρέπει να έχεις επιλεγμένο ακριβώς ένα μέλος.'); return; }
    }

    setTemplateLoading(true);
    try {
      if (emailType === 'custom') {
        if (!subject && !body) {
          setSubject('Μήνυμα από το γυμναστήριο');
          setBody(textToHtml(`Γεια σου,\n\nΓράψε εδώ το μήνυμα που θέλεις να στείλεις στα μέλη σου.\n\nΚαλή συνέχεια,\n${safeTenantName}`));
        }
      } else if (emailType === 'bookings' && selectedMember && tenantId) {
        const tmpl = await buildBookingsTemplate({ tenantId, member: selectedMember, gymName: safeTenantName, weekOffset });
        setSubject(tmpl.subject); setBody(textToHtml(tmpl.body));
      } else if (emailType === 'password_reset' && selectedMember) {
        setSubject('Επαναφορά κωδικού πρόσβασης');
        setBody(textToHtml(`Γεια σου ${selectedMember.full_name ?? ''},\n\nΘα σταλεί στο email σου (${selectedMember.email ?? ''}) το επίσημο email επαναφοράς κωδικού από το σύστημα.\n\n${safeTenantName}`));
      }
    } finally {
      setTemplateLoading(false);
      setStep(2);
    }
  };

  const handleSend = async () => {
    if (emailType === 'password_reset') {
      if (!selectedMember?.email) { alert('Το επιλεγμένο μέλος δεν έχει email.'); return; }
      setSending(true);
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(selectedMember.email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        alert(`Στάλθηκε email επαναφοράς κωδικού στο ${selectedMember.email}.`);
        onClose();
      } catch (err) { alert('Κάτι πήγε στραβά με την αποστολή email επαναφοράς κωδικού.'); }
      finally { setSending(false); }
      return;
    }

    if (!subject || !body) { alert('Συμπλήρωσε θέμα και κείμενο email.'); return; }
    setSending(true);

    const payload: any = { tenant_name: safeTenantName, subject, html: body, text: stripHtml(body), mode: emailType };
    if (tenantId) payload.tenant_id = tenantId;
    if (recipientMode === 'selected' && hasSelectedMembers) payload.memberIds = safeMemberIds;
    else payload.allActive = true;

    const { data, error } = await supabase.functions.invoke('send-member-email', { body: payload });
    setSending(false);

    if (error) { alert('Κάτι πήγε στραβά με την αποστολή email.'); return; }
    if ((data as any)?.error) { alert(`Σφάλμα: ${(data as any).error}`); return; }
    alert(`Το email στάλθηκε σε ${(data as any)?.recipients ?? 0} μέλη.`);
    onClose();
  };

  const recipientsLabel = recipientMode === 'selected'
    ? hasSelectedMembers ? `Μόνο στα επιλεγμένα μέλη (${safeMemberIds.length})` : 'Μόνο στα επιλεγμένα μέλη (δεν υπάρχουν επιλεγμένα)'
    : 'Σε όλα τα ενεργά μέλη';

  const emailTypeConfig = EMAIL_TYPES.find((t) => t.id === emailType);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="w-full max-w-2xl rounded-2xl border border-border/10 bg-secondary-background text-text-primary shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{ animation: 'emailModalIn 0.2s ease' }}
      >
        {/* Top accent bar */}
        <div className="h-0.75 w-full bg-linear-to-r from-primary/0 via-primary to-primary/0 shrink-0" />

        {/* Header */}
        <div className="px-5 py-4 border-b border-border/10 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
              <Mail className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="font-black text-text-primary tracking-tight">
                {step === 1 ? 'Αποστολή Email σε Μέλη' : 'Επιβεβαίωση Email'}
              </h2>
              <p className="text-[11px] text-text-secondary mt-px">
                Βήμα <span className="font-bold text-text-primary">{step}</span> / 2 ·{' '}
                Από: <span className="font-medium">{safeTenantName}</span>
              </p>
            </div>
          </div>

          {/* Step dots */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5">
              {[1, 2].map((s) => (
                <div key={s} className={['w-2 h-2 rounded-full transition-all', s === step ? 'bg-primary scale-125' : s < step ? 'bg-primary/40' : 'bg-border/30'].join(' ')} />
              ))}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl border border-border/10 hover:bg-secondary/30 text-text-secondary hover:text-text-primary transition-all cursor-pointer shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <>
              {/* Recipients */}
              <div className="space-y-2.5">
                <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-md bg-primary/15 border border-primary/20 flex items-center justify-center text-[9px] font-black text-primary shrink-0">1</span>
                  Παραλήπτες
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'selected' as RecipientMode, icon: <User className="h-3.5 w-3.5" />, label: `Επιλεγμένα μέλη`, sub: hasSelectedMembers ? `${safeMemberIds.length} επιλεγμένα` : 'Κανένα επιλεγμένο' },
                    { value: 'allActive' as RecipientMode, icon: <Users className="h-3.5 w-3.5" />, label: 'Όλα τα ενεργά μέλη', sub: 'Μαζική αποστολή' },
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

                {!hasSelectedMembers && recipientMode === 'selected' && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-accent/25 bg-accent/8 text-accent text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Δεν έχεις επιλέξει μέλη. Επίλεξε κάποια από τη λίστα ή άλλαξε σε «Όλα τα ενεργά».
                  </div>
                )}
              </div>

              {/* Email type */}
              <div className="space-y-2.5">
                <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-md bg-primary/15 border border-primary/20 flex items-center justify-center text-[9px] font-black text-primary shrink-0">2</span>
                  Τύπος email
                </div>

                <div className="grid md:grid-cols-3 gap-2">
                  {EMAIL_TYPES.map((et) => (
                    <button
                      key={et.id}
                      type="button"
                      onClick={() => setEmailType(et.id)}
                      className={[
                        'text-left rounded-xl border p-3.5 transition-all duration-150 cursor-pointer',
                        emailType === et.id
                          ? 'border-primary/40 bg-primary/8'
                          : 'border-border/10 bg-secondary/5 hover:border-primary/20',
                      ].join(' ')}
                    >
                      <div className={['flex items-center gap-2 mb-1.5', emailType === et.id ? 'text-primary' : 'text-text-secondary'].join(' ')}>
                        {et.icon}
                        <span className="text-xs font-bold">{et.label}</span>
                      </div>
                      <div className="text-[10.5px] text-text-secondary leading-relaxed">{et.desc}</div>
                      {et.note && (
                        <div className="mt-1.5 text-[10px] text-accent font-medium">{et.note}</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Week selector (bookings only) */}
              {emailType === 'bookings' && (
                <div className="space-y-2.5">
                  <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-md bg-primary/15 border border-primary/20 flex items-center justify-center text-[9px] font-black text-primary shrink-0">3</span>
                    Εβδομάδα κρατήσεων
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {[
                      { offset: -1, label: 'Προηγούμενη' },
                      { offset:  0, label: 'Τρέχουσα' },
                      { offset:  1, label: 'Επόμενη' },
                    ].map((opt) => (
                      <button
                        key={opt.offset}
                        type="button"
                        onClick={() => setWeekOffset(opt.offset)}
                        className={[
                          'h-8 px-3.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer',
                          weekOffset === opt.offset
                            ? 'border-primary/40 bg-primary/12 text-primary'
                            : 'border-border/15 text-text-secondary hover:border-primary/25 hover:text-text-primary',
                        ].join(' ')}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <div className="text-[11px] text-text-secondary">
                    Επιλεγμένη εβδομάδα: <span className="font-bold text-text-primary">{weekLabel}</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <>
              {/* Summary pill row */}
              <div className="flex flex-wrap gap-2">
                {[
                  { icon: <Users className="h-3 w-3" />, label: recipientsLabel },
                  { icon: emailTypeConfig?.icon, label: emailTypeConfig?.label ?? '' },
                  ...(emailType === 'bookings' ? [{ icon: <Calendar className="h-3 w-3" />, label: weekLabel }] : []),
                  ...(emailType === 'password_reset' && selectedMember?.email ? [{ icon: <Mail className="h-3 w-3" />, label: selectedMember.email }] : []),
                ].map((chip, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border/15 bg-secondary/10 text-xs text-text-secondary">
                    {chip.icon}
                    {chip.label}
                  </span>
                ))}
              </div>

              {/* Password reset — read-only preview */}
              {emailType === 'password_reset' ? (
                <div className="space-y-3">
                  <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-md bg-primary/15 border border-primary/20 flex items-center justify-center text-[9px] font-black text-primary shrink-0">3</span>
                    Επιβεβαίωση αποστολής
                  </div>
                  <div className="px-4 py-3 rounded-xl border border-accent/20 bg-accent/5 text-xs text-text-secondary leading-relaxed">
                    Το πραγματικό email επαναφοράς κωδικού αποστέλλεται από το Cloudtec Auth και το περιεχόμενό του δεν μπορεί να τροποποιηθεί από εδώ.
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Θέμα (ενδεικτικό)</label>
                    <input className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary/5 text-sm text-text-primary opacity-60 cursor-not-allowed" value={subject} disabled />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Κείμενο (ενδεικτικό)</label>
                    <div className="ct-quill border border-border/10 rounded-xl bg-secondary/5 opacity-60 pointer-events-none overflow-hidden">
                      <ReactQuill theme="snow" value={body} readOnly />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-md bg-primary/15 border border-primary/20 flex items-center justify-center text-[9px] font-black text-primary shrink-0">3</span>
                    Σχεδίασε το email
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Θέμα</label>
                    <input
                      className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Κείμενο Email</label>
                    <div className="ct-quill border border-border/10 rounded-xl bg-secondary-background overflow-hidden">
                      <ReactQuill theme="snow" value={body} onChange={setBody} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border/10 flex items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-text-secondary hidden sm:block">
            {step === 1 ? 'Επιλέξτε παραλήπτες και τύπο email' : 'Ελέγξτε και στείλτε'}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {step === 1 ? (
              <>
                <button
                  onClick={onClose}
                  className="h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer"
                >
                  Ακύρωση
                </button>
                <button
                  onClick={handleNext}
                  disabled={templateLoading || sending}
                  className="
                    group relative inline-flex items-center gap-2 h-9 px-5 rounded-xl
                    text-sm font-bold text-white bg-primary hover:bg-primary/90
                    shadow-sm shadow-primary/20 hover:-translate-y-px active:translate-y-0
                    disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0
                    transition-all duration-150 cursor-pointer overflow-hidden
                  "
                >
                  <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
                  {templateLoading
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin relative z-10" /><span className="relative z-10">Φόρτωση…</span></>
                    : <><span className="relative z-10">Συνέχεια</span><ChevronRight className="h-3.5 w-3.5 relative z-10" /></>
                  }
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Πίσω
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="
                    group relative inline-flex items-center gap-2 h-9 px-5 rounded-xl
                    text-sm font-bold text-white bg-primary hover:bg-primary/90
                    shadow-sm shadow-primary/20 hover:-translate-y-px active:translate-y-0
                    disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0
                    transition-all duration-150 cursor-pointer overflow-hidden
                  "
                >
                  <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
                  {sending
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin relative z-10" /><span className="relative z-10">Αποστολή…</span></>
                    : <><Send className="h-3.5 w-3.5 relative z-10" /><span className="relative z-10">Αποστολή Email</span></>
                  }
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes emailModalIn {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>
    </div>
  );
}
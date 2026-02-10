// src/components/Members/SendMemberEmailModal.tsx
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

type SendMemberEmailModalProps = {
  isOpen: boolean;
  onClose: () => void;
  tenantName?: string | null;
  tenantId?: string | null;
  memberIds?: string[];
  selectedMembers?: {
    id: string;
    full_name: string | null;
    email: string | null;
  }[];
};

type RecipientMode = 'selected' | 'allActive';
// 👇 credentials removed, password_reset added
type EmailType = 'custom' | 'bookings' | 'password_reset';

/** Helper: get week range (Mon–Sun) with offset in weeks from current week */
function getWeekInfo(offsetWeeks = 0) {
  const now = new Date();
  const day = now.getDay(); // 0=Sun,...,6=Sat
  const diffToMonday = (day + 6) % 7;

  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday + offsetWeeks * 7);
  monday.setHours(0, 0, 0, 0);

  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  nextMonday.setHours(0, 0, 0, 0);

  const startIso = monday.toISOString();
  const endIso = nextMonday.toISOString();

  const startLabel = monday.toLocaleDateString('el-GR', {
    day: '2-digit',
    month: '2-digit',
  });

  const endTmp = new Date(nextMonday);
  endTmp.setDate(nextMonday.getDate() - 1);
  const endLabel = endTmp.toLocaleDateString('el-GR', {
    day: '2-digit',
    month: '2-digit',
  });

  return { startIso, endIso, startLabel, endLabel };
}

/** Helper: plain text → simple HTML paragraphs */
function textToHtml(text: string): string {
  if (!text) return '<p></p>';
  const parts = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(
      (line) =>
        `<p>${line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</p>`,
    );
  return parts.join('') || '<p></p>';
}

/** Helper: HTML → plain text (for text version of email) */
function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, '').replace(/\s+\n/g, '\n').trim();
}

async function buildBookingsTemplate(args: {
  tenantId: string;
  member: { id: string; full_name: string | null; email: string | null };
  gymName: string;
  weekOffset: number;
}) {
  const { tenantId, member, gymName, weekOffset } = args;
  const { startIso, endIso, startLabel, endLabel } = getWeekInfo(weekOffset);

  const { data, error } = await supabase
    .from('bookings')
    .select(
      `
      id,
      status,
      class_sessions (
        starts_at,
        classes (
          title
        )
      )
    `,
    )
    .eq('tenant_id', tenantId)
    .eq('user_id', member.id)
    .gte('class_sessions.starts_at', startIso)
    .lt('class_sessions.starts_at', endIso);

  const friendlyName = member.full_name ?? '';
  const baseSubject = `Το εβδομαδιαίο πρόγραμμά σου (${startLabel} – ${endLabel})`;

  if (error) {
    console.error('buildBookingsTemplate error:', error);
    const fallbackBody =
      `Γεια σου ${friendlyName},\n\n` +
      `Ακολούθησε το πρόγραμμα των προπονήσεών σου για αυτή την εβδομάδα (${startLabel} – ${endLabel}).\n` +
      `Δεν ήταν δυνατή η αυτόματη φόρτωση των κρατήσεων, μπορείς να προσθέσεις χειροκίνητα τις λεπτομέρειες εδώ.\n\n` +
      `Καλή προπόνηση!\n${gymName}`;

    return { subject: baseSubject, body: fallbackBody };
  }

  const rows = (data ?? []) as any[];

  // ταξινόμηση client-side
  rows.sort((a, b) => {
    const aDate = a.class_sessions?.starts_at
      ? new Date(a.class_sessions.starts_at).getTime()
      : 0;
    const bDate = b.class_sessions?.starts_at
      ? new Date(b.class_sessions.starts_at).getTime()
      : 0;
    return aDate - bDate;
  });

  const entries: string[] = [];

  rows.forEach((b) => {
    const cs = b.class_sessions;
    if (!cs) return;
    const dt = cs.starts_at ? new Date(cs.starts_at) : null;
    const title = cs.classes?.title ?? 'Μάθημα';

    const when = dt
      ? dt.toLocaleString('el-GR', {
          weekday: 'short',
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Χωρίς ώρα';

    entries.push(`- ${when} – ${title}`);
  });

  let body =
    `Γεια σου ${friendlyName},\n\n` +
    `Ακολουθεί το πρόγραμμα των προπονήσεών σου για αυτή την εβδομάδα (${startLabel} – ${endLabel}):\n\n`;

  if (entries.length === 0) {
    body +=
      'Δεν υπάρχουν κρατήσεις για αυτή την εβδομάδα.\n\n' +
      'Αν θέλεις να κλείσεις προπονήσεις, επικοινώνησε με τη γραμματεία ή χρησιμοποίησε την εφαρμογή.\n\n';
  } else {
    body += entries.join('\n') + '\n\n';
  }

  body += `Καλή προπόνηση!\n${gymName}`;

  return { subject: baseSubject, body };
}

export default function SendMemberEmailModal({
  isOpen,
  onClose,
  tenantName,
  tenantId,
  memberIds,
  selectedMembers,
}: SendMemberEmailModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [recipientMode, setRecipientMode] =
    useState<RecipientMode>('allActive');
  const [emailType, setEmailType] = useState<EmailType>('custom');
  const [weekOffset, setWeekOffset] = useState(0);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState(''); // HTML string for ReactQuill
  const [sending, setSending] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);

  const safeTenantName = tenantName || 'Cloudtec Gym';
  const safeMemberIds = memberIds ?? [];
  const hasSelectedMembers = safeMemberIds.length > 0;
  const selectedMember =
    selectedMembers && selectedMembers.length === 1
      ? selectedMembers[0]
      : null;

  const { startLabel, endLabel } = getWeekInfo(weekOffset);
  const weekLabel = `${startLabel} – ${endLabel}`;

  // Reset state κάθε φορά που ανοίγει το modal
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setEmailType('custom');
      setWeekOffset(0);
      setSending(false);
      setTemplateLoading(false);
      setSubject('');
      setBody('');
      setRecipientMode(hasSelectedMembers ? 'selected' : 'allActive');
    }
  }, [isOpen, hasSelectedMembers]);

  if (!isOpen) return null;

  const handleNext = async () => {
    // Για bookings / password_reset απαιτούμε 1 μέλος επιλεγμένο
    if (emailType === 'bookings' || emailType === 'password_reset') {
      if (recipientMode !== 'selected') {
        alert(
          'Για αυτό το είδος email πρέπει να στείλεις μόνο σε ένα συγκεκριμένο μέλος (όχι σε όλα τα ενεργά).',
        );
        return;
      }
      if (!hasSelectedMembers) {
        alert(
          'Δεν έχεις επιλέξει κάποιο μέλος στον πίνακα. Επίλεξε ένα μέλος και ξαναδοκίμασε.',
        );
        return;
      }
      if (safeMemberIds.length !== 1 || !selectedMember) {
        alert('Πρέπει να έχεις επιλεγμένο ακριβώς ένα μέλος.');
        return;
      }
    }

    setTemplateLoading(true);

    try {
      if (emailType === 'custom') {
        if (!subject && !body) {
          setSubject('Μήνυμα από το γυμναστήριο');
          setBody(
            textToHtml(
              'Γεια σου,\n\n' +
                'Γράψε εδώ το μήνυμα που θέλεις να στείλεις στα μέλη σου.\n\n' +
                'Καλή συνέχεια,\n' +
                safeTenantName,
            ),
          );
        }
      } else if (emailType === 'bookings' && selectedMember && tenantId) {
        const tmpl = await buildBookingsTemplate({
          tenantId,
          member: selectedMember,
          gymName: safeTenantName,
          weekOffset,
        });
        setSubject(tmpl.subject);
        setBody(textToHtml(tmpl.body));
      } else if (emailType === 'password_reset' && selectedMember) {
        // We don't control the Supabase email template, αλλά μπορούμε
        // να δείξουμε ένα ενδεικτικό θέμα/κείμενο για επιβεβαίωση.
        const memberEmail = selectedMember.email ?? '';
        const friendlyName = selectedMember.full_name ?? '';

        setSubject('Επαναφορά κωδικού πρόσβασης');
        setBody(
          textToHtml(
            `Γεια σου ${friendlyName || ''},\n\n` +
              `Θα σταλεί στο email σου (${memberEmail}) το επίσημο email επαναφοράς κωδικού από το σύστημα.\n` +
              `Το περιεχόμενο του email ορίζεται από το Cloudtec Auth και δεν μπορεί να τροποποιηθεί από εδώ.\n\n` +
              `${safeTenantName}`,
          ),
        );
      }
    } finally {
      setTemplateLoading(false);
      setStep(2);
    }
  };

  const handleBack = () => {
    setStep(1);
  };

  const handleSend = async () => {
    // ⭐ Branch: reset password – χρησιμοποιούμε Supabase Auth
    if (emailType === 'password_reset') {
      if (!selectedMember?.email) {
        alert('Το επιλεγμένο μέλος δεν έχει email.');
        return;
      }

      setSending(true);
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(
          selectedMember.email,
          { redirectTo: `${window.location.origin}/reset-password` },
        );

        if (error) throw error;

        alert(
          `Στάλθηκε email επαναφοράς κωδικού στο ${selectedMember.email}.`,
        );
        onClose();
      } catch (err) {
        console.error('resetPasswordForEmail error:', err);
        alert(
          'Κάτι πήγε στραβά με την αποστολή email επαναφοράς κωδικού.',
        );
      } finally {
        setSending(false);
      }
      return;
    }

    // ⭐ Οι υπόλοιποι τύποι (custom / bookings) πάνε μέσω edge function
    if (!subject || !body) {
      alert('Συμπλήρωσε θέμα και κείμενο email.');
      return;
    }

    setSending(true);

    const payload: any = {
      tenant_name: safeTenantName,
      subject,
      html: body, // HTML από ReactQuill
      text: stripHtml(body), // plain text έκδοση
      mode: emailType,
    };

    if (tenantId) {
      payload.tenant_id = tenantId;
    }

    if (recipientMode === 'selected' && hasSelectedMembers) {
      payload.memberIds = safeMemberIds;
    } else {
      payload.allActive = true;
    }

    const { data, error } = await supabase.functions.invoke(
      'send-member-email',
      {
        body: payload,
      },
    );

    setSending(false);

    if (error) {
      console.error('send-member-email error:', error);
      alert('Κάτι πήγε στραβά με την αποστολή email.');
      return;
    }

    if ((data as any)?.error) {
      alert(`Σφάλμα: ${(data as any).error}`);
      return;
    }

    const recipients = (data as any)?.recipients ?? 0;
    alert(`Το email στάλθηκε σε ${recipients} μέλη.`);
    onClose();
  };

  const recipientsLabel =
    recipientMode === 'selected'
      ? hasSelectedMembers
        ? `Μόνο στα επιλεγμένα μέλη (${safeMemberIds.length})`
        : 'Μόνο στα επιλεγμένα μέλη (δεν υπάρχουν επιλεγμένα)'
      : 'Σε όλα τα ενεργά μέλη';

  const emailTypeLabel =
    emailType === 'custom'
      ? 'Custom email'
      : emailType === 'bookings'
      ? 'Send bookings'
      : 'Reset password link';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-md border border-border/10 bg-secondary-background text-text-primary shadow-xl">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border/10 flex items-center justify-between">
          <div className="font-semibold">
            {step === 1 ? 'Αποστολή Email σε Μέλη' : 'Επιβεβαίωση Email'}
          </div>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 hover:bg-border/5"
          >
            ✕
          </button>
        </div>

        {/* BODY */}
        <div className="p-4 space-y-4 text-sm">
          <div className="text-xs text-text-secondary">
            Από:{' '}
            <span className="font-semibold">
              {safeTenantName} {'<no-reply@…>'}
            </span>
          </div>

          {step === 1 && (
            <>
              {/* Παραλήπτες */}
              <section className="space-y-2">
                <div className="font-semibold text-sm">
                  1. Ποιοι θα λάβουν το email;
                </div>
                <div className="flex flex-col gap-1 text-xs">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="recipientMode"
                      className="accent-primary"
                      value="selected"
                      checked={recipientMode === 'selected'}
                      onChange={() => setRecipientMode('selected')}
                    />
                    <span>
                      Μόνο στα επιλεγμένα μέλη{' '}
                      {hasSelectedMembers
                        ? `(${safeMemberIds.length})`
                        : '(δεν υπάρχουν επιλεγμένα)'}
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="recipientMode"
                      className="accent-primary"
                      value="allActive"
                      checked={recipientMode === 'allActive'}
                      onChange={() => setRecipientMode('allActive')}
                    />
                    <span>Σε όλα τα ενεργά μέλη</span>
                  </label>
                </div>
                {!hasSelectedMembers &&
                  recipientMode === 'selected' && (
                    <div className="text-[11px] text-accent">
                      Δεν έχεις επιλέξει μέλη στον πίνακα. Μπορείς είτε να
                      επιστρέψεις και να επιλέξεις, είτε να στείλεις σε όλα τα
                      ενεργά μέλη.
                    </div>
                  )}
              </section>

              {/* Τύπος email */}
              <section className="space-y-2">
                <div className="font-semibold text-sm">
                  2. Τι είδους email θέλεις να στείλεις;
                </div>
                <div className="grid md:grid-cols-3 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setEmailType('custom')}
                    className={`text-left rounded-md border px-3 py-2 transition ${
                      emailType === 'custom'
                        ? 'border-primary bg-primary/10'
                        : 'border-border/10 hover:bg-border/5'
                    }`}
                  >
                    <div className="font-semibold text-sm">Custom email</div>
                    <div className="mt-1 text-[11px] text-text-secondary">
                      Ελεύθερο κείμενο, για ανακοινώσεις, προσφορές κλπ.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEmailType('bookings')}
                    className={`text-left rounded-md border px-3 py-2 transition ${
                      emailType === 'bookings'
                        ? 'border-primary bg-primary/10'
                        : 'border-border/10 hover:bg-border/5'
                    }`}
                  >
                    <div className="font-semibold text-sm">
                      Send bookings
                    </div>
                    <div className="mt-1 text-[11px] text-text-secondary">
                      Email για το εβδομαδιαίο πρόγραμμα προπονήσεων ενός
                      μέλους.
                    </div>
                    <div className="mt-1 text-[10px] text-accent">
                      Απαιτεί ακριβώς ένα επιλεγμένο μέλος.
                    </div>
                  </button>

                  {/* Reset password replaces old "Send credentials" */}
                  <button
                    type="button"
                    onClick={() => setEmailType('password_reset')}
                    className={`text-left rounded-md border px-3 py-2 transition ${
                      emailType === 'password_reset'
                        ? 'border-primary bg-primary/10'
                        : 'border-border/10 hover:bg-border/5'
                    }`}
                  >
                    <div className="font-semibold text-sm">
                      Reset password
                    </div>
                    <div className="mt-1 text-[11px] text-text-secondary">
                      Στέλνει email επαναφοράς κωδικού μέσω Supabase στη διεύθυνση
                      του μέλους.
                    </div>
                    <div className="mt-1 text-[10px] text-accent">
                      Απαιτεί ακριβώς ένα επιλεγμένο μέλος. Θα επιβεβαιώσεις την
                      αποστολή στο επόμενο βήμα.
                    </div>
                  </button>
                </div>
              </section>

              {/* Εβδομάδα κρατήσεων (μόνο για bookings) */}
              {emailType === 'bookings' && (
                <section className="space-y-2">
                  <div className="font-semibold text-sm">
                    3. Εβδομάδα κρατήσεων
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setWeekOffset(-1)}
                      className={`rounded-md border px-3 py-1 transition ${
                        weekOffset === -1
                          ? 'border-primary bg-primary/10'
                          : 'border-border/10 hover:bg-border/5'
                      }`}
                    >
                      Προηγούμενη εβδομάδα
                    </button>
                    <button
                      type="button"
                      onClick={() => setWeekOffset(0)}
                      className={`rounded-md border px-3 py-1 transition ${
                        weekOffset === 0
                          ? 'border-primary bg-primary/10'
                          : 'border-border/10 hover:bg-border/5'
                      }`}
                    >
                      Τρέχουσα εβδομάδα
                    </button>
                    <button
                      type="button"
                      onClick={() => setWeekOffset(1)}
                      className={`rounded-md border px-3 py-1 transition ${
                        weekOffset === 1
                          ? 'border-primary bg-primary/10'
                          : 'border-border/10 hover:bg-border/5'
                      }`}
                    >
                      Επόμενη εβδομάδα
                    </button>
                  </div>
                  <div className="text-[11px] text-text-secondary">
                    Επιλεγμένη εβδομάδα: {weekLabel}
                  </div>
                </section>
              )}
            </>
          )}

          {step === 2 && (
            <>
              {/* Summary */}
              <section className="space-y-1 text-xs">
                <div>
                  <span className="opacity-70">Παραλήπτες: </span>
                  <span className="font-semibold">{recipientsLabel}</span>
                </div>
                <div>
                  <span className="opacity-70">Τύπος email: </span>
                  <span className="font-semibold">{emailTypeLabel}</span>
                </div>
                {emailType === 'bookings' && (
                  <div>
                    <span className="opacity-70">
                      Εβδομάδα κρατήσεων:{' '}
                    </span>
                    <span className="font-semibold">{weekLabel}</span>
                  </div>
                )}
                {emailType === 'password_reset' && selectedMember?.email && (
                  <div>
                    <span className="opacity-70">
                      Θα σταλεί στο email:{' '}
                    </span>
                    <span className="font-semibold">
                      {selectedMember.email}
                    </span>
                  </div>
                )}
              </section>

              {/* Designer / Confirmation */}
              {emailType === 'password_reset' ? (
                <section className="space-y-2 text-xs">
                  <div className="font-semibold text-sm">
                    3. Επιβεβαίωση αποστολής
                  </div>
                  <p className="text-text-secondary">
                    Το παρακάτω κείμενο είναι ενδεικτικό. Το πραγματικό email
                    επαναφοράς κωδικού αποστέλλεται από τo Cloudtec Auth και
                    το περιεχόμενό έιναι προκαθορισμένο από τη Cloudtec, δεν μπορεί να τροποποιηθεί από εδώ.
                  </p>
                  <div className="space-y-1 mt-2">
                    <label className="text-sm opacity-80">Θέμα (ενδεικτικό)</label>
                    <input
                      className="input w-full opacity-70 cursor-not-allowed"
                      value={subject}
                      disabled
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm opacity-80">
                      Κείμενο (ενδεικτικό)
                    </label>
                    <div className="ct-quill border border-white/10 rounded-md bg-secondary-background opacity-70 pointer-events-none">
                      <ReactQuill theme="snow" value={body} readOnly />
                    </div>
                  </div>
                </section>
              ) : (
                <section className="space-y-2">
                  <div className="font-semibold text-sm">
                    3. Σχεδίασε το email
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm opacity-80">Θέμα</label>
                    <input
                      className="input w-full"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm opacity-80">
                      Κείμενο Email
                    </label>
                    <div className="ct-quill border border-border/10 rounded-md bg-secondary-background">
                      <ReactQuill
                        theme="snow"
                        value={body}
                        onChange={setBody}
                      />
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* FOOTER BUTTONS */}
        <div className="px-4 py-3 border-t border-border/10 flex justify-end gap-2 text-sm">
          {step === 1 ? (
            <>
              <button className="btn-secondary" onClick={onClose}>
                Ακύρωση
              </button>
              <button
                className="btn-primary"
                onClick={handleNext}
                disabled={templateLoading || sending}
              >
                {templateLoading
                  ? 'Φόρτωση…'
                  : 'Συνέχεια'}
              </button>
            </>
          ) : (
            <>
              <button className="btn-secondary" onClick={handleBack}>
                Πίσω
              </button>
              <button
                className="btn-primary"
                onClick={handleSend}
                disabled={sending}
              >
                {sending ? 'Αποστολή…' : 'Αποστολή Email'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

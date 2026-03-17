import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import {
  LifeBuoy, Mail, MessageSquare, Tag,
  Loader2, CheckCircle2, AlertTriangle, Send,
} from 'lucide-react';

const CATEGORIES = [
  { value: 'bug',     label: '🐛 Αναφορά Σφάλματος' },
  { value: 'feature', label: '💡 Αίτημα Λειτουργίας' },
  { value: 'question',label: '❓ Ερώτηση' },
  { value: 'other',   label: '📋 Άλλο' },
];

export default function HelpSupportPage() {
  const { profile } = useAuth();

  const [gymName, setGymName] = useState('');
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');

  const [sending, setSending]   = useState(false);
  const [success, setSuccess]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Load gym name for context in the email
  useEffect(() => {
    if (!profile?.tenant_id) return;
    supabase
      .from('gym_info')
      .select('name')
      .eq('tenant_id', profile.tenant_id)
      .maybeSingle()
      .then(({ data }) => { if (data?.name) setGymName(data.name); });
  }, [profile?.tenant_id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) { setError('Επίλεξε κατηγορία.'); return; }
    if (!message.trim()) { setError('Γράψε το μήνυμά σου.'); return; }

    setSending(true); setError(null); setSuccess(false);
    try {
      const res = await supabase.functions.invoke('send-support-email', {
        method: 'POST',
        body: { category, message: message.trim(), gym_name: gymName },
      });
      const data = res.data as any;
      if (data?.error) throw new Error(data.error);
      if (res.error) throw new Error(res.error.message);
      setSuccess(true);
      setCategory('');
      setMessage('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  const charCount = message.length;
  const charLimit = 2000;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
          <LifeBuoy className="h-4.5 w-4.5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-black text-text-primary tracking-tight">Βοήθεια & Υποστήριξη</h1>
          <p className="text-xs text-text-secondary mt-px">Στείλε μήνυμα για οποιοδήποτε πρόβλημα ή αίτημα.</p>
        </div>
      </div>

      {/* Form card */}
      <div className="rounded-2xl border border-border/10 bg-secondary-background shadow-sm p-5">
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Email (read-only) */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-text-secondary">
              <span className="opacity-60"><Mail className="h-3 w-3" /></span>
              Email αποστολής
            </label>
            <input
              value={profile?.email ?? ''}
              disabled
              className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-background text-sm text-text-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <p className="text-[11px] text-text-secondary">Οι απαντήσεις θα σταλούν σε αυτό το email.</p>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-text-secondary">
              <span className="opacity-60"><Tag className="h-3 w-3" /></span>
              Κατηγορία
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer"
            >
              <option value="">Επίλεξε κατηγορία…</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-text-secondary">
              <span className="opacity-60"><MessageSquare className="h-3 w-3" /></span>
              Μήνυμα
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Περιέγραψε το πρόβλημα ή το αίτημά σου με όσες λεπτομέρειες μπορείς…"
              rows={6}
              maxLength={charLimit}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border/15 bg-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-text-secondary resize-none"
            />
            <div className={`text-[11px] text-right ${charCount > charLimit * 0.9 ? 'text-warning' : 'text-text-secondary'}`}>
              {charCount} / {charLimit}
            </div>
          </div>

          {/* Error / Success */}
          {error && (
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-danger/25 bg-danger/8 text-danger text-xs">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-success/25 bg-success/8 text-success text-xs">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />Το μήνυμά σου στάλθηκε! Θα επικοινωνήσουμε μαζί σου σύντομα.
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={sending}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-primary/20 transition-all cursor-pointer"
            >
              {sending
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Αποστολή…</>
                : <><Send className="h-3.5 w-3.5" />Αποστολή μηνύματος</>}
            </button>
          </div>
        </form>
      </div>

    </div>
  );
}

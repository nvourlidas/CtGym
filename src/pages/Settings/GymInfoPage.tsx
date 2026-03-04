import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import {
  Building2, Mail, Phone, MapPin, Globe, FileText,
  Loader2, CheckCircle2, AlertTriangle, RotateCcw, Save,
  Hash, X,
} from 'lucide-react';

type GymInfo = {
  id: string; tenant_id: string; name: string; email: string | null;
  phone: string | null; address: string | null; city: string | null;
  postal_code: string | null; website: string | null; description: string | null;
  logo_url: string | null; created_at: string; updated_at: string;
};

function FormField({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-text-secondary">
        {icon && <span className="opacity-60">{icon}</span>}
        {label}
      </label>
      {children}
    </div>
  );
}

function StyledInput({ value, onChange, type = 'text', placeholder, className = '' }: any) {
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      className={`w-full h-9 px-3.5 rounded-xl border border-border/15 bg-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-text-secondary ${className}`}
    />
  );
}

export default function GymInfoPage() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id as string | undefined;

  const [info, setInfo]             = useState<GymInfo | null>(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState<string | null>(null);

  const [name, setName]             = useState('');
  const [email, setEmail]           = useState('');
  const [phone, setPhone]           = useState('');
  const [address, setAddress]       = useState('');
  const [city, setCity]             = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [website, setWebsite]       = useState('');
  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl]       = useState('');

  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  async function load() {
    if (!tenantId) return;
    setLoading(true); setError(null); setSuccess(null);
    const { data, error } = await supabase.from('gym_info').select('*').eq('tenant_id', tenantId).maybeSingle();
    if (error && error.code !== 'PGRST116') {
      setError('Αποτυχία φόρτωσης στοιχείων γυμναστηρίου.');
    } else if (data) {
      const row = data as GymInfo;
      setInfo(row);
      setName(row.name ?? ''); setEmail(row.email ?? ''); setPhone(row.phone ?? '');
      setAddress(row.address ?? ''); setCity(row.city ?? ''); setPostalCode(row.postal_code ?? '');
      setWebsite(row.website ?? ''); setDescription(row.description ?? ''); setLogoUrl(row.logo_url ?? '');
    } else {
      setInfo(null);
    }
    setLoading(false);
  }

  async function onSave() {
    if (!tenantId) return;
    if (!name.trim()) { setError('Το όνομα του γυμναστηρίου είναι υποχρεωτικό.'); setSuccess(null); return; }
    setSaving(true); setError(null); setSuccess(null);
    const payload = {
      tenant_id: tenantId, name: name.trim(),
      email: email.trim() || null, phone: phone.trim() || null,
      address: address.trim() || null, city: city.trim() || null,
      postal_code: postalCode.trim() || null, website: website.trim() || null,
      description: description.trim() || null, logo_url: logoUrl.trim() || null,
    };
    const result = info?.id
      ? await supabase.from('gym_info').update(payload).eq('id', info.id).select('*').maybeSingle()
      : await supabase.from('gym_info').insert(payload).select('*').maybeSingle();
    const { data, error } = result;
    if (error) { setError(error.message ?? 'Αποτυχία αποθήκευσης.'); setSaving(false); return; }
    if (data) setInfo(data as GymInfo);
    setSaving(false);
    setSuccess('Οι πληροφορίες αποθηκεύτηκαν επιτυχώς.');
    setTimeout(() => setSuccess(null), 4000);
  }

  function onReset() {
    const row = info;
    setName(row?.name ?? ''); setEmail(row?.email ?? ''); setPhone(row?.phone ?? '');
    setAddress(row?.address ?? ''); setCity(row?.city ?? ''); setPostalCode(row?.postal_code ?? '');
    setWebsite(row?.website ?? ''); setDescription(row?.description ?? ''); setLogoUrl(row?.logo_url ?? '');
    setError(null); setSuccess(null);
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto w-full max-w-3xl space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
            <Building2 className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-black text-text-primary tracking-tight">Πληροφορίες Γυμναστηρίου</h1>
            <p className="text-xs text-text-secondary mt-px">Βασικά στοιχεία και στοιχεία επικοινωνίας.</p>
          </div>
        </div>

        {/* Feedback banners */}
        {error && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-danger/25 bg-danger/8 text-danger text-sm">
            <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>
            <button onClick={() => setError(null)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
        {success && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-success/25 bg-success/8 text-success text-sm">
            <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 shrink-0" />{success}</div>
            <button onClick={() => setSuccess(null)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-text-secondary">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Φόρτωση…</span>
          </div>
        ) : (
          <>
            {/* Logo preview */}
            {logoUrl && (
              <div className="flex items-center gap-4 p-4 rounded-2xl border border-border/10 bg-secondary-background">
                <img src={logoUrl} alt="Logo" className="h-16 w-16 rounded-xl object-contain border border-border/15 bg-secondary/10" onError={(e) => (e.currentTarget.style.display = 'none')} />
                <div>
                  <div className="text-sm font-bold text-text-primary">{name || 'Γυμναστήριο'}</div>
                  <div className="text-xs text-text-secondary mt-0.5">Προεπισκόπηση λογοτύπου</div>
                </div>
              </div>
            )}

            {/* Main card */}
            <div className="rounded-2xl border border-border/10 bg-secondary-background shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border/10">
                <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Βασικές Πληροφορίες</div>
              </div>
              <div className="p-5 space-y-4">
                <FormField label="Όνομα γυμναστηρίου *" icon={<Building2 className="h-3 w-3" />}>
                  <StyledInput value={name} onChange={(e: any) => setName(e.target.value)} placeholder="π.χ. FitLife Gym" />
                </FormField>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="Email επικοινωνίας" icon={<Mail className="h-3 w-3" />}>
                    <StyledInput type="email" value={email} onChange={(e: any) => setEmail(e.target.value)} placeholder="info@gymname.gr" />
                  </FormField>
                  <FormField label="Τηλέφωνο" icon={<Phone className="h-3 w-3" />}>
                    <StyledInput value={phone} onChange={(e: any) => setPhone(e.target.value)} placeholder="+30 210 000 0000" />
                  </FormField>
                </div>

                <FormField label="Περιγραφή" icon={<FileText className="h-3 w-3" />}>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
                    placeholder="Σύντομη περιγραφή του γυμναστηρίου…"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border/15 bg-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all resize-none placeholder:text-text-secondary"
                  />
                </FormField>
              </div>
            </div>

            {/* Location card */}
            <div className="rounded-2xl border border-border/10 bg-secondary-background shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border/10">
                <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Τοποθεσία & Διαδίκτυο</div>
              </div>
              <div className="p-5 space-y-4">
                <FormField label="Διεύθυνση" icon={<MapPin className="h-3 w-3" />}>
                  <StyledInput value={address} onChange={(e: any) => setAddress(e.target.value)} placeholder="Ονομασία οδού & αριθμός" />
                </FormField>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField label="Πόλη" icon={<MapPin className="h-3 w-3" />}>
                    <StyledInput value={city} onChange={(e: any) => setCity(e.target.value)} placeholder="Αθήνα" />
                  </FormField>
                  <FormField label="Τ.Κ." icon={<Hash className="h-3 w-3" />}>
                    <StyledInput value={postalCode} onChange={(e: any) => setPostalCode(e.target.value)} placeholder="10000" />
                  </FormField>
                  <FormField label="Ιστότοπος" icon={<Globe className="h-3 w-3" />}>
                    <StyledInput value={website} onChange={(e: any) => setWebsite(e.target.value)} placeholder="https://…" />
                  </FormField>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pb-2">
              <button type="button" onClick={onReset} disabled={saving}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />Επαναφορά
              </button>
              <button type="button" onClick={onSave} disabled={saving}
                className="group relative inline-flex items-center gap-1.5 h-9 px-5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20 hover:-translate-y-px disabled:opacity-50 disabled:translate-y-0 transition-all cursor-pointer overflow-hidden"
              >
                <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
                {saving
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin relative z-10" /><span className="relative z-10">Αποθήκευση…</span></>
                  : <><Save className="h-3.5 w-3.5 relative z-10" /><span className="relative z-10">Αποθήκευση</span></>
                }
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
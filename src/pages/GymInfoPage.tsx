import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';

type GymInfo = {
  id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  website: string | null;
  description: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
};

export default function GymInfoPage() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id as string | undefined;

  const [info, setInfo] = useState<GymInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  useEffect(() => {
    if (!tenantId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function load() {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    const { data, error } = await supabase
      .from('gym_info')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Error loading gym_info:', error);
      setError('Αποτυχία φόρτωσης στοιχείων γυμναστηρίου.');
    } else {
      if (data) {
        const row = data as GymInfo;
        setInfo(row);
        setName(row.name ?? '');
        setEmail(row.email ?? '');
        setPhone(row.phone ?? '');
        setAddress(row.address ?? '');
        setCity(row.city ?? '');
        setPostalCode(row.postal_code ?? '');
        setWebsite(row.website ?? '');
        setDescription(row.description ?? '');
        setLogoUrl(row.logo_url ?? '');
      } else {
        // no row yet -> keep empty form, but require name on save
        setInfo(null);
      }
    }

    setLoading(false);
  }

  async function onSave() {
    if (!tenantId) return;
    if (!name.trim()) {
      setError('Το όνομα του γυμναστηρίου είναι υποχρεωτικό.');
      setSuccess(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    const payload = {
      tenant_id: tenantId,
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      address: address.trim() || null,
      city: city.trim() || null,
      postal_code: postalCode.trim() || null,
      website: website.trim() || null,
      description: description.trim() || null,
      logo_url: logoUrl.trim() || null,
    };

    let result;
    if (info?.id) {
      // update
      result = await supabase
        .from('gym_info')
        .update(payload)
        .eq('id', info.id)
        .select('*')
        .maybeSingle();
    } else {
      // insert (first time for this tenant)
      result = await supabase
        .from('gym_info')
        .insert(payload)
        .select('*')
        .maybeSingle();
    }

    const { data, error } = result;
    if (error) {
      console.error('Error saving gym_info:', error);
      setError(error.message ?? 'Αποτυχία αποθήκευσης.');
      setSaving(false);
      return;
    }

    if (data) {
      const row = data as GymInfo;
      setInfo(row);
    }

    setSaving(false);
    setSuccess('Οι πληροφορίες αποθηκεύτηκαν.');
  }

  function onReset() {
    if (!info) {
      setName('');
      setEmail('');
      setPhone('');
      setAddress('');
      setCity('');
      setPostalCode('');
      setWebsite('');
      setDescription('');
      setLogoUrl('');
    } else {
      setName(info.name ?? '');
      setEmail(info.email ?? '');
      setPhone(info.phone ?? '');
      setAddress(info.address ?? '');
      setCity(info.city ?? '');
      setPostalCode(info.postal_code ?? '');
      setWebsite(info.website ?? '');
      setDescription(info.description ?? '');
      setLogoUrl(info.logo_url ?? '');
    }
    setError(null);
    setSuccess(null);
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="mb-4 text-lg font-semibold">Πληροφορίες Γυμναστηρίου</h1>

      <div className="rounded-md border border-white/10 bg-secondary-background p-4">
        {loading ? (
          <div className="py-8 text-sm opacity-70">Φόρτωση…</div>
        ) : (
          <>
            {error && (
              <div className="mb-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-3 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                {success}
              </div>
            )}

            <FormRow label="Όνομα γυμναστηρίου *">
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </FormRow>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FormRow label="Email επικοινωνίας">
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </FormRow>
              <FormRow label="Τηλέφωνο">
                <input
                  className="input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </FormRow>
            </div>

            <FormRow label="Διεύθυνση">
              <input
                className="input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </FormRow>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <FormRow label="Πόλη">
                <input
                  className="input"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </FormRow>
              <FormRow label="Τ.Κ.">
                <input
                  className="input"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                />
              </FormRow>
              <FormRow label="Ιστότοπος">
                <input
                  className="input"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://..."
                />
              </FormRow>
            </div>

            <FormRow label="Περιγραφή / σύντομο κείμενο">
              <textarea
                className="input"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </FormRow>

            <FormRow label="Logo URL">
              <input
                className="input"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://..."
              />
            </FormRow>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="btn-secondary"
                type="button"
                onClick={onReset}
                disabled={saving}
              >
                Επαναφορά
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={onSave}
                disabled={saving}
              >
                {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* small helper */
function FormRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mb-3 block">
      <div className="mb-1 text-sm opacity-80">{label}</div>
      {children}
    </label>
  );
}

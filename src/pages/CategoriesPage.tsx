import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import SubscriptionRequiredModal from '../components/SubscriptionRequiredModal';

type Category = {
  id: string;
  tenant_id: string;
  name: string;
  color: string | null;
  created_at: string;
};

export default function CategoriesPage() {
  const { profile, subscription } = useAuth();
  const tenantId = profile?.tenant_id;
  const [showSubModal, setShowSubModal] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const subscriptionInactive = !subscription?.is_active;


  useEffect(() => {
    if (!tenantId) return;
    loadCategories();
  }, [tenantId]);

  async function loadCategories() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('class_categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });

    if (error) {
      console.error(error);
      setError('Αποτυχία φόρτωσης κατηγοριών');
    } else {
      setCategories(data || []);
    }
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();

    if (subscriptionInactive) {
      setShowSubModal(true);
      return;
    }

    if (!name.trim() || !tenantId) return;

    setSaving(true);
    setError(null);

    const { data, error } = await supabase
      .from('class_categories')
      .insert({
        tenant_id: tenantId,
        name: name.trim(),
        color,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      setError(error.message);
    } else if (data) {
      setCategories((prev) => [...prev, data]);
      setName('');
    }

    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Διαγραφή αυτής της κατηγορίας; Τα τμήματα θα χάσουν απλά την κατηγορία.')) return;

    const { error } = await supabase
      .from('class_categories')
      .delete()
      .eq('id', id);

    if (error) {
      console.error(error);
      alert('Αποτυχία διαγραφής κατηγορίας');
      return;
    }

    setCategories((prev) => prev.filter((c) => c.id !== id));
  }

  const filtered = !q
    ? categories
    : categories.filter((c) =>
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      (c.id ?? '').toLowerCase().includes(q.toLowerCase()),
    );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Κατηγορίες Τμημάτων</h1>
        <p className="text-sm text-text-secondary">
          Δημιούργησε κατηγορίες (π.χ. Όμαδικο, Personal, Semi-Personal) και ανάθεσέ τες στα τμήματα.
        </p>
      </div>

      {/* Top bar: search + form */}
      <div className="rounded-md border border-white/10 bg-secondary-background p-4 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Search */}
          <input
            className="h-9 w-full max-w-xs rounded-md border border-white/10 bg-secondary-background px-3 text-sm placeholder:text-text-secondary"
            placeholder="Αναζήτηση κατηγοριών…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          {/* Create form */}
          <form
            onSubmit={handleCreate}
            className="flex flex-col sm:flex-row gap-3 items-start sm:items-center w-full sm:w-auto"
          >
            <div className="flex-1 w-full sm:w-52">
              <label className="block text-xs mb-1 text-text-secondary">Όνομα</label>
              <input
                className="h-9 w-full rounded-md border border-white/10 bg-background px-3 text-sm placeholder:text-text-secondary"
                placeholder="π.χ. Personal"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <div>
                <label className="block text-xs mb-1 text-text-secondary">Χρώμα</label>
                <input
                  type="color"
                  className="h-9 w-12 rounded border border-white/10 bg-background cursor-pointer"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="h-9 rounded-md px-3 text-sm bg-primary hover:bg-primary/90 text-white disabled:opacity-60"
            >
              {saving ? 'Αποθήκευση…' : 'Νέα Κατηγορία'}
            </button>
          </form>
        </div>

        {error && <p className="text-sm text-danger mt-1">{error}</p>}
      </div>

      {/* List */}
      <div className="rounded-md border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary-background/60">
            <tr className="text-left">
              <th className="px-3 py-2 font-semibold">Όνομα</th>
              <th className="px-3 py-2 font-semibold">Χρώμα</th>
              <th className="px-3 py-2 font-semibold">Ημ. Δημιουργίας</th>
              <th className="px-3 py-2 font-semibold text-right pr-3">Ενέργειες</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-3 py-4 opacity-60" colSpan={4}>
                  Φόρτωση…
                </td>
              </tr>
            )}

            {!loading && filtered.length === 0 && (
              <tr>
                <td className="px-3 py-4 opacity-60" colSpan={4}>
                  Δεν υπάρχουν κατηγορίες. Δημιούργησε την πρώτη παραπάνω.
                </td>
              </tr>
            )}

            {!loading &&
              filtered.map((cat) => (
                <tr
                  key={cat.id}
                  className="border-t border-white/10 hover:bg-secondary/10"
                >
                  <td className="px-3 py-2 text-text-primary font-medium">
                    {cat.name}
                  </td>
                  <td className="px-3 py-2">
                    {cat.color ? (
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-full border border-white/20"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="text-xs text-text-secondary">
                          {cat.color}
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-text-secondary">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">
                    {new Date(cat.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => handleDelete(cat.id)}
                      className="ml-2 px-2 py-1 text-xs rounded text-danger hover:bg-danger/10"
                    >
                      Διαγραφή
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <SubscriptionRequiredModal
        open={showSubModal}
        onClose={() => setShowSubModal(false)}
      />
    </div>
  );
}

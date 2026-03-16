import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { AlertTriangle, Loader2, Pencil, Tag, Trash2 } from 'lucide-react';
import type { FinanceCategoryRow } from '../types';
import ModalShell from '../components/ModalShell';
import { FormField, StyledInput, StyledSelect } from '../components/formWidgets';
import { PrimaryBtn, SecondaryBtn } from '../components/Buttons';

export default function CategoriesModal({ open, tenantId, categories, onClose, onChanged }: {
  open: boolean; tenantId: string | null; categories: FinanceCategoryRow[];
  onClose: () => void; onChanged: () => void;
}) {
  const [newName, setNewName]     = useState('');
  const [newKind, setNewKind]     = useState<'income' | 'expense'>('income');
  const [newColor, setNewColor]   = useState('');
  const [savingNew, setSavingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName]   = useState('');
  const [editKind, setEditKind]   = useState<'income' | 'expense'>('income');
  const [editColor, setEditColor] = useState('');
  const [busyId, setBusyId]       = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setNewName(''); setNewColor(''); setNewKind('income'); setEditingId(null); setError(null); }
  }, [open]);

  const handleAdd = async () => {
    if (!tenantId || !newName.trim()) { setError('Συμπλήρωσε όνομα.'); return; }
    setSavingNew(true); setError(null);
    const { error: e } = await supabase.from('finance_categories').insert({ tenant_id: tenantId, name: newName.trim(), kind: newKind, color: newColor.trim() || null, position: (categories?.length ?? 0) + 1 });
    setSavingNew(false);
    if (e) { setError(e.message); return; }
    setNewName(''); setNewColor(''); setNewKind('income'); onChanged();
  };

  const startEdit = (cat: FinanceCategoryRow) => { setEditingId(cat.id); setEditName(cat.name); setEditKind(cat.kind); setEditColor(cat.color ?? ''); setError(null); };
  const cancelEdit = () => { setEditingId(null); setEditName(''); setEditKind('income'); setEditColor(''); };

  const handleSaveEdit = async () => {
    if (!tenantId || !editingId || !editName.trim()) { setError('Συμπλήρωσε όνομα.'); return; }
    setBusyId(editingId); setError(null);
    const { error: e } = await supabase.from('finance_categories').update({ name: editName.trim(), kind: editKind, color: editColor.trim() || null }).eq('id', editingId).eq('tenant_id', tenantId);
    setBusyId(null);
    if (e) { setError(e.message); return; }
    cancelEdit(); onChanged();
  };

  const handleDelete = async (cat: FinanceCategoryRow) => {
    if (!tenantId || !confirm(`Διαγραφή κατηγορίας "${cat.name}";`)) return;
    setBusyId(cat.id); setError(null);
    const { error: e } = await supabase.from('finance_categories').delete().eq('id', cat.id).eq('tenant_id', tenantId);
    setBusyId(null);
    if (e) { setError(e.message); return; }
    if (editingId === cat.id) cancelEdit();
    onChanged();
  };

  if (!open) return null;

  return (
    <ModalShell title="Κατηγορίες Οικονομικών" icon={<Tag className="h-4 w-4 text-primary" />} onClose={onClose}>
      <p className="text-xs text-text-secondary">Οργάνωσε τις κατηγορίες για τα έσοδα και τα έξοδά σου.</p>

      <div className="rounded-xl border border-border/15 bg-secondary/5 p-4 space-y-3">
        <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Νέα Κατηγορία</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <FormField label="Όνομα">
            <StyledInput value={newName} onChange={(e: any) => setNewName(e.target.value)} placeholder="π.χ. Συνδρομές" />
          </FormField>
          <FormField label="Τύπος">
            <StyledSelect value={newKind} onChange={(e: any) => setNewKind(e.target.value)}>
              <option value="income">Έσοδο</option>
              <option value="expense">Έξοδο</option>
            </StyledSelect>
          </FormField>
          <FormField label="Χρώμα">
            <div className="flex items-center gap-2">
              <input type="color" value={newColor || '#22c55e'} onChange={(e) => setNewColor(e.target.value)} className="h-9 w-10 rounded-xl border border-border/15 bg-transparent cursor-pointer" />
              <StyledInput value={newColor} onChange={(e: any) => setNewColor(e.target.value)} placeholder="#22c55e" />
            </div>
          </FormField>
        </div>
        <div className="flex justify-end">
          <PrimaryBtn busy={savingNew} busyLabel="Προσθήκη…" label="Προσθήκη Κατηγορίας" onClick={handleAdd} />
        </div>
      </div>

      <div className="rounded-xl border border-border/10 overflow-hidden">
        <div className="max-h-72 overflow-y-auto">
          {categories.length === 0 && <div className="px-4 py-6 text-center text-xs text-text-secondary">Δεν υπάρχουν κατηγορίες ακόμα.</div>}
          {categories.map((cat) => {
            const isEditing = editingId === cat.id;
            return (
              <div key={cat.id} className="border-b border-border/5 last:border-0 px-4 py-3 hover:bg-secondary/5 transition-colors">
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <StyledInput value={editName} onChange={(e: any) => setEditName(e.target.value)} placeholder="Όνομα" />
                      <StyledSelect value={editKind} onChange={(e: any) => setEditKind(e.target.value)}>
                        <option value="income">Έσοδο</option>
                        <option value="expense">Έξοδο</option>
                      </StyledSelect>
                      <div className="flex items-center gap-2">
                        <input type="color" value={editColor || '#22c55e'} onChange={(e) => setEditColor(e.target.value)} className="h-9 w-10 rounded-xl border border-border/15 bg-transparent cursor-pointer shrink-0" />
                        <StyledInput value={editColor} onChange={(e: any) => setEditColor(e.target.value)} placeholder="#22c55e" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <SecondaryBtn label="Άκυρο" onClick={cancelEdit} disabled={busyId === cat.id} />
                      <PrimaryBtn busy={busyId === cat.id} busyLabel="Αποθήκευση…" label="Αποθήκευση" onClick={handleSaveEdit} />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {cat.color && <span className="h-3 w-3 rounded-full shrink-0 border border-border/20" style={{ backgroundColor: cat.color }} />}
                      <span className="text-sm font-medium text-text-primary truncate">{cat.name}</span>
                      <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-lg border ${cat.kind === 'income' ? 'border-success/35 bg-success/10 text-success' : 'border-danger/35 bg-danger/10 text-danger'}`}>
                        {cat.kind === 'income' ? 'Έσοδο' : 'Έξοδο'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" onClick={() => startEdit(cat)}
                        className="h-7 w-7 rounded-xl border border-border/15 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer"
                      ><Pencil className="h-3 w-3" /></button>
                      <button type="button" disabled={busyId === cat.id} onClick={() => handleDelete(cat)}
                        className="h-7 w-7 rounded-xl border border-danger/20 flex items-center justify-center text-danger hover:bg-danger/10 transition-all cursor-pointer disabled:opacity-40"
                      >{busyId === cat.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-danger/25 bg-danger/8 text-danger text-xs">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}
        </div>
      )}
    </ModalShell>
  );
}

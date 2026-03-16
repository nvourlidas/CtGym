import { Euro, CalendarDays, Layers, Check } from 'lucide-react';
import type { Category, PlanKind } from '../types';
import FormField from './FormField';
import StyledInput from './StyledInput';
import StyledSelect from './StyledSelect';

export default function PlanFormFields({
  name, setName, price, setPrice, planKind, setPlanKind,
  durationDays, setDurationDays, sessionCredits, setSessionCredits,
  description, setDescription, categoryIds, setCategoryIds, categories,
}: {
  name: string; setName: (v: string) => void;
  price: number; setPrice: (v: number) => void;
  planKind: PlanKind; setPlanKind: (v: PlanKind) => void;
  durationDays: number; setDurationDays: (v: number) => void;
  sessionCredits: number; setSessionCredits: (v: number) => void;
  description: string; setDescription: (v: string) => void;
  categoryIds: string[]; setCategoryIds: (fn: (prev: string[]) => string[]) => void;
  categories: Category[];
}) {
  const toggleCat = (id: string) => setCategoryIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  return (
    <>
      <FormField label="Ονομασία *">
        <StyledInput value={name} onChange={(e: any) => setName(e.target.value)} placeholder="π.χ. Μηνιαία Συνδρομή" />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Τιμή (€)">
          <div className="relative">
            <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
            <input type="number" step="0.01" value={price} onChange={(e: any) => setPrice(Number(e.target.value))}
              className="w-full h-9 pl-9 pr-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
            />
          </div>
        </FormField>
        <FormField label="Τύπος Πλάνου">
          <StyledSelect value={planKind} onChange={(e: any) => setPlanKind(e.target.value)}>
            <option value="duration">Διάρκεια (Μέρες)</option>
            <option value="sessions">Αριθμός συνεδριών</option>
            <option value="hybrid">Και τα δύο</option>
          </StyledSelect>
        </FormField>
      </div>

      {(planKind === 'duration' || planKind === 'hybrid') && (
        <FormField label="Διάρκεια (Μέρες)">
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
            <input type="number" min={0} value={durationDays} onChange={(e: any) => setDurationDays(Number(e.target.value))}
              className="w-full h-9 pl-9 pr-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
            />
          </div>
        </FormField>
      )}
      {(planKind === 'sessions' || planKind === 'hybrid') && (
        <FormField label="Αριθμός συνεδριών">
          <div className="relative">
            <Layers className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
            <input type="number" min={0} value={sessionCredits} onChange={(e: any) => setSessionCredits(Number(e.target.value))}
              className="w-full h-9 pl-9 pr-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
            />
          </div>
        </FormField>
      )}

      <FormField label="Κατηγορίες">
        {categories.length === 0 ? (
          <p className="text-xs text-text-secondary">Καμία κατηγορία διαθέσιμη.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const checked = categoryIds.includes(c.id);
              return (
                <button key={c.id} type="button" onClick={() => toggleCat(c.id)}
                  className={['inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border transition-all cursor-pointer', checked ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/15 text-text-secondary hover:border-primary/25 hover:text-text-primary'].join(' ')}
                >
                  {checked && <Check className="h-3 w-3 shrink-0" />}
                  {c.color && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />}
                  {c.name}
                </button>
              );
            })}
          </div>
        )}
      </FormField>

      <FormField label="Περιγραφή">
        <textarea value={description} onChange={(e: any) => setDescription(e.target.value)} rows={3}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all resize-none placeholder:text-text-secondary"
          placeholder="Προαιρετική περιγραφή πλάνου…"
        />
      </FormField>
    </>
  );
}

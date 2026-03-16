import { ArrowUp, ArrowDown, Trash2, Plus, GripVertical, ChevronDown } from 'lucide-react';
import type { QuestionRow, QType } from '../types';
import { typeNeedsOptions, TYPE_LABEL } from '../builderUtils';

export default function QuestionEditor({ index, value, canEdit, onChange, onDelete, onMoveUp, onMoveDown, disableMoveUp, disableMoveDown }: {
  index: number; value: QuestionRow; canEdit: boolean;
  onChange: (patch: Partial<QuestionRow>) => void;
  onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void;
  disableMoveUp: boolean; disableMoveDown: boolean;
}) {
  const needsOptions = typeNeedsOptions(value.type);
  const options = (value.options ?? []).length ? value.options : needsOptions ? [''] : [];

  const setOption    = (i: number, v: string) => { const next = [...options]; next[i] = v; onChange({ options: next }); };
  const addOption    = () => onChange({ options: [...options, ''] });
  const removeOption = (i: number) => onChange({ options: options.filter((_, idx) => idx !== i) });

  return (
    <div className="p-4 hover:bg-secondary/3 transition-colors">
      <div className="flex items-start gap-3">
        {/* Drag handle / index */}
        <div className="shrink-0 flex flex-col items-center gap-0.5 mt-1">
          <span className="text-[10px] font-black text-text-secondary w-6 text-center">{index + 1}</span>
          <GripVertical className="h-3.5 w-3.5 text-border/40" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Type */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Τύπος</label>
              <div className="relative">
                <select
                  value={value.type} disabled={!canEdit}
                  onChange={(e) => { const nextType = e.target.value as QType; onChange({ type: nextType, options: typeNeedsOptions(nextType) ? (value.options?.length ? value.options : ['']) : [] }); }}
                  className="w-full h-9 pl-3.5 pr-8 rounded-xl border border-border/15 bg-background text-sm text-text-primary outline-none focus:border-primary/40 appearance-none disabled:opacity-50"
                >
                  {(Object.keys(TYPE_LABEL) as QType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-text-secondary pointer-events-none" />
              </div>
            </div>

            {/* Label */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Κείμενο ερώτησης *</label>
              <input
                value={value.label} disabled={!canEdit} onChange={(e) => onChange({ label: e.target.value })}
                placeholder="π.χ. Έχεις κάποιον τραυματισμό;"
                className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-text-secondary disabled:opacity-50"
              />
            </div>
          </div>

          {/* Required toggle */}
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <div
              className={`relative w-9 h-5 rounded-full border transition-all ${value.required ? 'bg-primary border-primary/60' : 'bg-secondary/20 border-border/20'} ${!canEdit ? 'opacity-50 pointer-events-none' : ''}`}
              onClick={() => canEdit && onChange({ required: !value.required })}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${value.required ? 'left-4' : 'left-0.5'}`} />
            </div>
            <span className="text-xs text-text-secondary">Υποχρεωτική</span>
          </label>

          {/* Options */}
          {needsOptions && (
            <div className="rounded-xl border border-border/10 bg-secondary/5 p-3 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Επιλογές <span className="text-danger">*</span> (τουλάχιστον 2)</div>
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-5 shrink-0 text-right">{i + 1}.</span>
                  <input
                    value={opt} disabled={!canEdit} onChange={(e) => setOption(i, e.target.value)} placeholder={`Επιλογή ${i + 1}`}
                    className="flex-1 h-8 px-3 rounded-xl border border-border/15 bg-background text-sm text-text-primary outline-none focus:border-primary/40 transition-all placeholder:text-text-secondary disabled:opacity-50"
                  />
                  {canEdit && (
                    <button type="button" onClick={() => removeOption(i)} disabled={options.length <= 1}
                      className="h-8 w-8 rounded-xl border border-danger/20 flex items-center justify-center text-danger hover:bg-danger/10 transition-all disabled:opacity-30 cursor-pointer"
                    ><Trash2 className="h-3 w-3" /></button>
                  )}
                </div>
              ))}
              {canEdit && (
                <button type="button" onClick={addOption}
                  className="inline-flex items-center gap-1 h-7 px-3 rounded-xl border border-dashed border-border/25 text-xs font-semibold text-text-secondary hover:text-text-primary hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer"
                >
                  <Plus className="h-3 w-3" />Επιλογή
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right actions */}
        {canEdit && (
          <div className="shrink-0 flex flex-col items-center gap-1 mt-0.5">
            <button type="button" onClick={onMoveUp} disabled={disableMoveUp} title="Πάνω" aria-label="Πάνω"
              className="h-7 w-7 rounded-xl border border-border/15 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all disabled:opacity-30 cursor-pointer"
            ><ArrowUp className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={onMoveDown} disabled={disableMoveDown} title="Κάτω" aria-label="Κάτω"
              className="h-7 w-7 rounded-xl border border-border/15 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all disabled:opacity-30 cursor-pointer"
            ><ArrowDown className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => { if (!confirm('Διαγραφή ερώτησης;')) return; onDelete(); }} title="Διαγραφή" aria-label="Διαγραφή"
              className="h-7 w-7 rounded-xl border border-danger/20 flex items-center justify-center text-danger hover:bg-danger/10 transition-all cursor-pointer"
            ><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </div>
    </div>
  );
}

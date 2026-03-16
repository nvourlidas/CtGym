import { Loader2, ClipboardList, Plus } from 'lucide-react';
import type { QuestionRow } from '../types';
import QuestionEditor from './QuestionEditor';

export default function QuestionsPanel({ loading, questions, canEdit, onAdd, onUpdate, onRemove, onMove }: {
  loading: boolean; questions: QuestionRow[]; canEdit: boolean;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<QuestionRow>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}) {
  return (
    <div className="rounded-2xl border border-border/10 bg-secondary-background shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-border/10 flex items-center gap-2">
        <ClipboardList className="h-3.5 w-3.5 text-text-secondary" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Ερωτήσεις</span>
        <span className="ml-auto text-[11px] text-text-secondary">{questions.length} εγγραφές</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Φόρτωση…</span></div>
      ) : questions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-text-secondary">
          <ClipboardList className="h-8 w-8 opacity-20" />
          <span className="text-sm">Δεν υπάρχουν ερωτήσεις.</span>
          {canEdit && (
            <button type="button" onClick={onAdd}
              className="mt-2 inline-flex items-center gap-1.5 h-8 px-4 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />Προσθήκη Ερώτησης
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-border/5">
          {questions.map((q, idx) => (
            <QuestionEditor
              key={q.id}
              index={idx}
              value={q}
              canEdit={canEdit}
              onChange={(patch) => onUpdate(q.id, patch)}
              onDelete={() => onRemove(q.id)}
              onMoveUp={() => onMove(q.id, -1)}
              onMoveDown={() => onMove(q.id, +1)}
              disableMoveUp={idx === 0}
              disableMoveDown={idx === questions.length - 1}
            />
          ))}
          {canEdit && (
            <div className="px-4 py-3">
              <button type="button" onClick={onAdd}
                className="inline-flex items-center gap-1.5 h-8 px-4 rounded-xl border border-dashed border-border/25 text-sm font-semibold text-text-secondary hover:text-text-primary hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer w-full justify-center"
              >
                <Plus className="h-3.5 w-3.5" />Προσθήκη Ερώτησης
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

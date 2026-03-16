import { Loader2, AlertTriangle, StickyNote } from 'lucide-react';
import type { QStatus } from '../types';
import FieldLabel from './FieldLabel';
import StyledInput from './StyledInput';
import StyledTextarea from './StyledTextarea';
import StyledSelect from './StyledSelect';

export default function MetaCard({ loading, title, setTitle, description, setDescription, status, setStatus, canEdit, questionsCount, validationError, statusMeta }: {
  loading: boolean; title: string; setTitle: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  status: QStatus; setStatus: (v: QStatus) => void;
  canEdit: boolean; questionsCount: number;
  validationError: string | null;
  statusMeta: { label: string; cls: string };
}) {
  return (
    <div className="rounded-2xl border border-border/10 bg-secondary-background shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-border/10 flex items-center gap-2">
        <StickyNote className="h-3.5 w-3.5 text-text-secondary" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Στοιχεία</span>
        <span className={`ml-auto text-[10.5px] font-bold px-2.5 py-0.5 rounded-lg border ${statusMeta.cls}`}>{statusMeta.label}</span>
      </div>
      <div className="p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Φόρτωση…</span></div>
        ) : (
          <>
            <FieldLabel label="Τίτλος *">
              <StyledInput value={title} onChange={(e: any) => setTitle(e.target.value)} disabled={!canEdit} placeholder="π.χ. Ιστορικό Υγείας / PAR-Q" />
            </FieldLabel>

            <FieldLabel label="Περιγραφή (προαιρετικό)">
              <StyledTextarea value={description} onChange={(e: any) => setDescription(e.target.value)} disabled={!canEdit} placeholder="Τι είναι αυτό το ερωτηματολόγιο και γιατί το συμπληρώνουμε." rows={5} />
            </FieldLabel>

            <FieldLabel label="Κατάσταση">
              <StyledSelect value={status} onChange={(e: any) => setStatus(e.target.value as QStatus)} disabled={!canEdit}>
                <option value="draft">Πρόχειρο</option>
                <option value="published">Δημοσιευμένο</option>
                <option value="archived">Αρχειοθέτηση</option>
              </StyledSelect>
            </FieldLabel>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-text-secondary">Ερωτήσεις: <span className="font-bold text-text-primary">{questionsCount}</span></span>
              {validationError && canEdit && (
                <div className="flex items-center gap-1.5 text-xs text-warning">
                  <AlertTriangle className="h-3 w-3 shrink-0" />{validationError}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

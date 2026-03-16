import { Dumbbell, Tag, User, Euro } from 'lucide-react';
import type { Category, Coach } from '../types';
import FormField from './FormField';
import StyledSelect from './StyledSelect';
import CustomCheckbox from './CustomCheckbox';

type Props = {
  title: string; setTitle: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  categoryId: string; setCategoryId: (v: string) => void;
  coachId: string; setCoachId: (v: string) => void;
  dropInEnabled: boolean; setDropInEnabled: (v: boolean) => void;
  dropInPrice: number | null; setDropInPrice: (v: number | null) => void;
  memberDropInPrice: number | null; setMemberDropInPrice: (v: number | null) => void;
  categories: Category[];
  coaches: Coach[];
};

export default function ClassFormFields({
  title, setTitle, description, setDescription,
  categoryId, setCategoryId, coachId, setCoachId,
  dropInEnabled, setDropInEnabled, dropInPrice, setDropInPrice,
  memberDropInPrice, setMemberDropInPrice,
  categories, coaches,
}: Props) {
  return (
    <div className="space-y-4">
      <FormField label="Τίτλος *" icon={<Dumbbell className="h-3 w-3" />}>
        <input
          className="w-full h-9 px-3.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="π.χ. Yoga, Crossfit…"
        />
      </FormField>

      <FormField label="Περιγραφή">
        <textarea
          className="w-full px-3.5 py-2.5 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all resize-none"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Προαιρετική περιγραφή…"
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Κατηγορία" icon={<Tag className="h-3 w-3" />}>
          <StyledSelect value={categoryId} onChange={setCategoryId}>
            <option value="">Χωρίς κατηγορία</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </StyledSelect>
        </FormField>

        <FormField label="Προπονητής" icon={<User className="h-3 w-3" />}>
          <StyledSelect value={coachId} onChange={setCoachId}>
            <option value="">Χωρίς προπονητή</option>
            {coaches.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </StyledSelect>
        </FormField>
      </div>

      <FormField label="Drop-in συμμετοχή" icon={<Euro className="h-3 w-3" />}>
        <div className="space-y-3">
          <CustomCheckbox
            checked={dropInEnabled}
            onChange={setDropInEnabled}
            label="Επιτρέπεται drop-in για αυτό το τμήμα"
          />
          {dropInEnabled && (
            <div className="grid grid-cols-2 gap-3 pl-6">
              <div className="space-y-1">
                <div className="text-[11px] text-text-secondary">Τιμή ανά συμμετοχή (€)</div>
                <input
                  type="number" min={0} step={0.5}
                  className="w-full h-8 px-3 rounded-xl border border-border/15 bg-secondary-background text-sm outline-none focus:border-primary/40 transition-all"
                  value={dropInPrice ?? ''}
                  onChange={(e) => setDropInPrice(e.target.value === '' ? null : Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <div className="text-[11px] text-text-secondary">Τιμή για μέλη (€)</div>
                <input
                  type="number" min={0} step={0.5}
                  className="w-full h-8 px-3 rounded-xl border border-border/15 bg-secondary-background text-sm outline-none focus:border-primary/40 transition-all"
                  value={memberDropInPrice ?? ''}
                  onChange={(e) => setMemberDropInPrice(e.target.value === '' ? null : Number(e.target.value))}
                />
              </div>
            </div>
          )}
        </div>
      </FormField>
    </div>
  );
}

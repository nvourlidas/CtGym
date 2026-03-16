import { X, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { Feedback } from '../types';

export default function FeedbackBanner({ feedback, onDismiss }: { feedback: Feedback; onDismiss: () => void }) {
  if (!feedback) return null;
  const isOk = feedback.type === 'success';
  return (
    <div className={['flex items-start justify-between gap-3 px-4 py-3 rounded-xl border text-sm mb-4', isOk ? 'border-success/30 bg-success/8 text-success' : 'border-danger/30 bg-danger/8 text-danger'].join(' ')}>
      <div className="flex items-start gap-2">
        {isOk ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
        <span>{feedback.message}</span>
      </div>
      <button onClick={onDismiss} className="opacity-60 hover:opacity-100 shrink-0 cursor-pointer"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

import { useNavigate, useSearchParams } from 'react-router-dom';
import { XCircle, CreditCard, RefreshCcw, ArrowLeft, AlertTriangle } from 'lucide-react';

export default function PaymentFailedPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const transactionId = params.get('t');
  const statusCode    = params.get('s');

  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
          <CreditCard className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-black text-text-primary tracking-tight">Πληρωμές & Πλάνα</h1>
          <p className="text-xs text-text-secondary mt-px">Κατάσταση πληρωμής</p>
        </div>
      </div>

      {/* Failure card */}
      <div className="rounded-2xl border border-danger/25 bg-danger/5 shadow-sm p-8 flex flex-col items-center text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-danger/15 border border-danger/25 flex items-center justify-center">
          <XCircle className="h-8 w-8 text-danger" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-xl font-black text-text-primary">Η πληρωμή απέτυχε</h2>
          <p className="text-sm text-text-secondary">
            Δεν ήταν δυνατή η ολοκλήρωση της πληρωμής. Παρακαλούμε δοκίμασε ξανά ή επικοινώνησε μαζί μας αν το πρόβλημα παραμένει.
          </p>
        </div>

        {(transactionId || statusCode) && (
          <div className="w-full rounded-xl border border-border/10 bg-secondary-background p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-text-secondary">
              <AlertTriangle className="h-3 w-3" />
              Στοιχεία σφάλματος
            </div>
            {transactionId && (
              <div className="text-xs text-text-secondary font-mono break-all">
                ID: <span className="text-text-primary font-semibold">{transactionId}</span>
              </div>
            )}
            {statusCode && (
              <div className="text-xs text-text-secondary font-mono">
                Κωδικός: <span className="text-text-primary font-semibold">{statusCode}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CTAs */}
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <button
          onClick={() => navigate('/settings/billing')}
          className="inline-flex items-center gap-2 h-10 px-5 rounded-xl border border-border/15 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-secondary/30 transition-all cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Πίσω στις Πληρωμές
        </button>
        <button
          onClick={() => navigate('/settings/billing')}
          className="inline-flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-bold text-black bg-accent hover:bg-accent/90 shadow-sm shadow-accent/20 hover:-translate-y-px transition-all cursor-pointer"
        >
          <RefreshCcw className="h-4 w-4" />
          Δοκίμασε ξανά
        </button>
      </div>

    </div>
  );
}

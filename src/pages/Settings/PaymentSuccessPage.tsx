import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, CreditCard, ArrowRight, Receipt } from 'lucide-react';

export default function PaymentSuccessPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const transactionId = params.get('t');
  const orderCode     = params.get('s');

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

      {/* Success card */}
      <div className="rounded-2xl border border-success/25 bg-success/5 shadow-sm p-8 flex flex-col items-center text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-success/15 border border-success/25 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-success" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-xl font-black text-text-primary">Η πληρωμή ολοκληρώθηκε!</h2>
          <p className="text-sm text-text-secondary">
            Η συνδρομή σου ενεργοποιήθηκε με επιτυχία. Μπορείς να χρησιμοποιείς όλες τις λειτουργίες του πλάνου σου.
          </p>
        </div>

        {transactionId && (
          <div className="w-full rounded-xl border border-border/10 bg-secondary-background p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-text-secondary">
              <Receipt className="h-3 w-3" />
              Στοιχεία συναλλαγής
            </div>
            <div className="text-xs text-text-secondary font-mono break-all">
              ID: <span className="text-text-primary font-semibold">{transactionId}</span>
            </div>
            {orderCode && orderCode !== '0' && (
              <div className="text-xs text-text-secondary font-mono">
                Κωδικός: <span className="text-text-primary font-semibold">{orderCode}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="flex justify-center">
        <button
          onClick={() => navigate('/settings/billing')}
          className="inline-flex items-center gap-2 h-10 px-6 rounded-xl text-sm font-bold text-black bg-accent hover:bg-accent/90 shadow-sm shadow-accent/20 hover:-translate-y-px transition-all cursor-pointer"
        >
          Μετάβαση στις Πληρωμές
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

    </div>
  );
}

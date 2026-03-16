export default function StatCard({ label, value, icon: Icon, borderCls, textCls, sublabel }: {
  label: string; value: string; icon: any; borderCls: string; textCls: string; sublabel?: string;
}) {
  return (
    <div className={`rounded-2xl border ${borderCls} bg-secondary-background p-4`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">{label}</div>
          <div className={`mt-2 text-xl font-black ${textCls}`}>{value}</div>
          {sublabel && <div className="mt-1 text-[10.5px] text-text-secondary truncate">{sublabel}</div>}
        </div>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${borderCls.replace('border-', 'bg-').replace('/60', '/12')}`}>
          <Icon className={`h-4 w-4 ${textCls}`} />
        </div>
      </div>
    </div>
  );
}

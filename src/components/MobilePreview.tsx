type Theme = {
  primary_color: string;
  accent_color: string;
  bg_color: string;
  card_color: string;
  text_color: string;
  text_muted: string;
  success_color: string;
  error_color: string;
  app_logo_url?: string | null;
};

export function MobilePreview({ theme }: { theme: Theme }) {
  return (
    <div className="mt-2 flex justify-center">
      {/* “Device” frame */}
      <div
        className="w-[320px] h-[640px] rounded-[36px] border border-gray-700 shadow-xl overflow-hidden relative"
        style={{ backgroundColor: theme.bg_color }}
      >
        {/* top status bar */}
        <div className="px-4 pt-3 pb-1 flex justify-between items-center">
          <span
            className="text-xs font-semibold"
            style={{ color: theme.text_color }}
          >
            10:44
          </span>
          <div className="flex items-center gap-1 text-[10px]">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: theme.accent_color }}
            />
            <span
              className="w-6 h-2 rounded-sm"
              style={{ backgroundColor: theme.text_muted }}
            />
          </div>
        </div>

        {/* logo */}
        <div className="items-center flex justify-center">
          {theme.app_logo_url ? (
            <img
              src={theme.app_logo_url}
              alt="Logo preview"
              className="h-10 object-contain"
            />
          ) : (
            <div
              className="px-4 py-2 rounded-full text-xs font-semibold"
              style={{ backgroundColor: theme.card_color, color: theme.text_color }}
            >
              LOGO
            </div>
          )}
        </div>

        {/* header row */}
        <div className="px-4 flex items-end justify-between mb-1">
          <div>
            <div
              className="text-lg font-bold"
              style={{ color: theme.text_color }}
            >
              Μαθήματα
            </div>
            <div
              className="text-[11px] mt-1"
              style={{ color: theme.text_muted }}
            >
              Κατηγορίες
            </div>
          </div>
          <div
            className="text-[11px]"
            style={{ color: theme.text_muted }}
          >
            17/11 – 23/11
          </div>
        </div>

        {/* category chips */}
        <div className="px-4 flex flex-wrap gap-2 mb-2">
          {['Όλες', 'Semi-Personal', 'Group'].map((label, idx) => {
            const isActive = idx === 0;
            return (
              <div
                key={label}
                className="px-3 py-1 rounded-full border text-xs"
                style={{
                  backgroundColor: isActive ? theme.primary_color : 'transparent',
                  borderColor: isActive ? theme.primary_color : theme.text_muted,
                  color: isActive ? '#fff' : theme.text_color,
                }}
              >
                {label}
              </div>
            );
          })}
        </div>

        {/* day chips */}
        <div className="px-4 mt-1">
          <div
            className="text-[11px] mb-1"
            style={{ color: theme.text_muted }}
          >
            Ημέρα
          </div>
          <div className="flex gap-6 mb-1">
            {['Σήμερα', 'Αυτή την εβδομάδα', 'Ημερομηνία'].map((label, idx) => {
              const isActive = idx === 1;
              return (
                <div
                  key={label}
                  className="px-3 py-1 rounded-full border text-xs"
                  style={{
                    backgroundColor: isActive ? theme.primary_color : 'transparent',
                    borderColor: isActive ? theme.primary_color : theme.text_muted,
                    color: isActive ? '#fff' : theme.text_color,
                  }}
                >
                  {label}
                </div>
              );
            })}
          </div>
          <div
            className="text-[11px]"
            style={{ color: theme.text_muted }}
          >
            17/11 – 23/11
          </div>
        </div>

        {/* sessions list */}
        <div className="px-4 mt-2 space-y-3">
          {/* Drop-in example */}
          <div
            className="rounded-3xl px-4 py-3 border"
            style={{ backgroundColor: theme.card_color, borderColor: theme.text_muted }}
          >
            <div
              className="text-sm font-semibold"
              style={{ color: theme.text_color }}
            >
              Preview
            </div>
            <div
              className="text-[11px] mt-1"
              style={{ color: theme.text_muted }}
            >
              Preview Περιγραφής
            </div>
            <div
              className="text-[11px] mt-2"
              style={{ color: theme.text_muted }}
            >
              Wed 19/11 · 19:04
            </div>
            <div
              className="text-[11px] mt-1"
              style={{ color: theme.accent_color }}
            >
              Θέσεις: 2 · Διαθέσιμες: 2
            </div>
            <div className="mt-3">
              <button
                className="w-full py-2 rounded-full text-xs font-bold"
                style={{ backgroundColor: theme.accent_color, color: '#000' }}
              >
                Drop-in · 10.00€
              </button>
            </div>
          </div>

          {/* Membership example */}
          <div
            className="rounded-3xl px-4 py-3 border"
            style={{ backgroundColor: theme.card_color, borderColor: theme.text_muted }}
          >
            <div
              className="text-sm font-semibold"
              style={{ color: theme.text_color }}
            >
              Preview
            </div>
            <div
              className="text-[11px] mt-1"
              style={{ color: theme.text_muted }}
            >
              Preview Περιγραφής
            </div>
            <div
              className="text-[11px] mt-2"
              style={{ color: theme.text_muted }}
            >
              Thu 20/11 · 14:11
            </div>
            <div
              className="text-[11px] mt-1"
              style={{ color: theme.accent_color }}
            >
              Θέσεις: 4 · Διαθέσιμες: 4
            </div>
            <div className="mt-3">
              <button
                className="w-full py-2 rounded-full text-xs font-bold"
                style={{ backgroundColor: theme.primary_color, color: '#fff' }}
              >
                Κράτηση
              </button>
            </div>
          </div>
        </div>

        {/* bottom pseudo-tabbar */}
        <div
          className="absolute bottom-0 left-0 right-0 px-4 py-3 flex justify-between items-center"
          style={{ backgroundColor: theme.bg_color }}
        >
          <div className="flex flex-col items-center gap-1">
            <div
              className="w-5 h-5 rounded-md"
              style={{ borderWidth: 2, borderColor: theme.accent_color }}
            />
            <span
              className="text-[10px]"
              style={{ color: theme.accent_color }}
            >
              Τμήματα
            </span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div
              className="w-5 h-5 rounded-md"
              style={{ borderWidth: 2, borderColor: theme.text_muted }}
            />
            <span
              className="text-[10px]"
              style={{ color: theme.text_muted }}
            >
              Οι κρατήσεις μου
            </span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div
              className="w-5 h-5 rounded-full"
              style={{ borderWidth: 2, borderColor: theme.text_muted }}
            />
            <span
              className="text-[10px]"
              style={{ color: theme.text_muted }}
            >
              Προφίλ
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

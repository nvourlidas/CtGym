import { useRef, useState, useEffect } from 'react';
import {
  Search, Inbox, BellDot, SlidersHorizontal, X, Check,
  Sheet, FileText,
} from 'lucide-react';
import type { ColumnKey } from '../types';
import { ALL_COLUMNS } from '../types';
import ActionBtn from './ActionBtn';

type Props = {
  q: string;
  setQ: (v: string) => void;
  rows: { length: number };
  loading: boolean;
  selectedIds: string[];
  clearSelection: () => void;
  canSendComms: boolean;
  canExport: boolean;
  onEmailClick: () => void;
  onPushClick: () => void;
  onExcelClick: () => void;
  onPdfClick: () => void;
  visibleCols: ColumnKey[];
  toggleCol: (key: ColumnKey) => void;
  setAllCols: () => void;
  resetCols: () => void;
};

export default function MembersToolbar({
  q, setQ, rows, loading, selectedIds, clearSelection,
  canSendComms, canExport,
  onEmailClick, onPushClick, onExcelClick, onPdfClick,
  visibleCols, toggleCol, setAllCols, resetCols,
}: Props) {
  const [showCols, setShowCols] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const colsBtnRef = useRef<HTMLButtonElement | null>(null);
  const colsPanelRef = useRef<HTMLDivElement | null>(null);

  const isColVisible = (key: ColumnKey) => visibleCols.includes(key);

  useEffect(() => {
    if (!showCols) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t || colsBtnRef.current?.contains(t) || colsPanelRef.current?.contains(t)) return;
      setShowCols(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [showCols]);

  useEffect(() => {
    if (!showCols) return;
    const place = () => {
      const btn = colsBtnRef.current;
      const panel = colsPanelRef.current;
      if (!btn || !panel) return;
      const btnRect = btn.getBoundingClientRect();
      const panelWidth = panel.offsetWidth || 288;
      const panelHeight = panel.offsetHeight || 200;
      const margin = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = btnRect.left;
      if (left + panelWidth + margin > vw) left = btnRect.right - panelWidth;
      left = Math.max(margin, Math.min(left, vw - panelWidth - margin));
      const belowTop = btnRect.bottom + 8;
      const aboveTop = btnRect.top - 8 - panelHeight;
      let top = belowTop;
      if (belowTop + panelHeight + margin > vh && aboveTop >= margin) top = aboveTop;
      top = Math.max(margin, Math.min(top, vh - panelHeight - margin));
      setDropdownPos({ left, top });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [showCols]);

  return (
    <div className="space-y-2">
      {/* Row 1: search + comms + columns */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-45 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
          <input
            className="w-full h-9 pl-9 pr-3 rounded-xl border border-border/15 bg-secondary-background text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
            placeholder="Αναζήτηση μελών…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <ActionBtn icon={Inbox}   label="Αποστολή Email"        onClick={onEmailClick} locked={!canSendComms} disabled={rows.length === 0} />
        <ActionBtn icon={BellDot} label="Αποστολή Ειδοποίησης" onClick={onPushClick}  locked={!canSendComms} disabled={rows.length === 0} />

        {/* Column toggle */}
        <div className="relative">
          <button
            ref={colsBtnRef}
            type="button"
            className="h-9 px-3.5 rounded-xl border border-border/15 text-sm text-text-primary hover:bg-secondary/30 inline-flex items-center gap-2 cursor-pointer transition-all"
            onClick={() => setShowCols((s) => !s)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Στήλες</span>
          </button>

          {showCols && (
            <div
              ref={colsPanelRef}
              className="fixed z-50 w-72 rounded-xl border border-border/15 bg-secondary-background/95 backdrop-blur-xl shadow-2xl shadow-black/20 overflow-hidden"
              style={{ left: dropdownPos.left, top: dropdownPos.top }}
            >
              <div className="h-0.75 w-full bg-linear-to-r from-primary/0 via-primary to-primary/0" />
              <div className="px-4 py-3 border-b border-border/10 flex items-center justify-between">
                <span className="text-sm font-bold text-text-primary">Στήλες πίνακα</span>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={setAllCols} className="text-[11px] px-2 py-1 rounded-lg border border-border/15 hover:bg-secondary/30 text-text-secondary transition-all">όλα</button>
                  <button type="button" onClick={resetCols}  className="text-[11px] px-2 py-1 rounded-lg border border-border/15 hover:bg-secondary/30 text-text-secondary transition-all">reset</button>
                  <button type="button" onClick={() => setShowCols(false)} className="p-1 rounded-lg hover:bg-border/10 text-text-secondary transition-all"><X className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <div className="p-2 max-h-72 overflow-auto space-y-0.5 no-scrollbar">
                {ALL_COLUMNS.map((c) => (
                  <label key={c.key} className="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-secondary/25 cursor-pointer transition-all">
                    <div className={['w-4 h-4 rounded-md border flex items-center justify-center transition-all', isColVisible(c.key) ? 'bg-primary border-primary' : 'border-border/30'].join(' ')}>
                      {isColVisible(c.key) && <Check className="h-2.5 w-2.5 text-white" />}
                    </div>
                    <input type="checkbox" className="sr-only" checked={isColVisible(c.key)} onChange={() => toggleCol(c.key)} />
                    <span className="text-sm text-text-primary">{c.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: export + selection badge */}
      <div className="flex items-center gap-2">
        <ActionBtn
          icon={Sheet} label="Εξαγωγή Excel"
          onClick={onExcelClick}
          locked={!canExport} disabled={loading || rows.length === 0}
          className={canExport ? 'hover:bg-emerald-600! hover:border-emerald-600! hover:text-white!' : ''}
        />
        <ActionBtn
          icon={FileText} label="Εξαγωγή PDF"
          onClick={onPdfClick}
          locked={!canExport} disabled={loading || rows.length === 0}
          className={canExport ? 'hover:bg-red-600! hover:border-red-600! hover:text-white!' : ''}
        />
        {selectedIds.length > 0 && (
          <div className="ml-auto flex items-center gap-2 text-xs text-text-secondary bg-primary/10 border border-primary/20 rounded-xl px-3 py-2">
            <span className="font-bold text-primary">{selectedIds.length}</span>
            επιλεγμένα
            <button type="button" onClick={clearSelection} className="ml-1 text-text-secondary hover:text-text-primary transition-all">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

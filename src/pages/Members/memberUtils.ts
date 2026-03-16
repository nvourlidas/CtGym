import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import notoSansUrl from '../../assets/fonts/NotoSans-Regular.ttf?url';
import notoSansBoldUrl from '../../assets/fonts/NotoSans-Bold.ttf?url';
import type { Member, ColumnKey } from './types';
import { ALL_COLUMNS } from './types';

// ── Date helpers

export function formatDateDMY(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function dateToISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseISODateToLocal(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.slice(0, 10).split('-');
  const year = Number(y), month = Number(m), day = Number(d);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

// ── Edge function error parsing

export async function readEdgeErrorPayload(err: any): Promise<any | null> {
  const res: Response | undefined = err?.context;
  if (!res) return null;
  try { return await res.clone().json(); }
  catch {
    try { const txt = await res.clone().text(); return txt ? { error: txt } : null; }
    catch { return null; }
  }
}

// ── Export helpers

export function formatMoney(value: number) {
  return `${value.toFixed(2)} €`;
}

export function buildExportColumns(visibleCols: ColumnKey[]) {
  const base = [
    { key: 'full_name', label: 'Όνομα' },
    { key: 'phone',     label: 'Τηλέφωνο' },
  ] as const;
  const map: Record<ColumnKey, { key: string; label: string }> = {
    email:           { key: 'email',           label: 'Email' },
    birth_date:      { key: 'birth_date',      label: 'Ημ. Γέννησης' },
    address:         { key: 'address',         label: 'Διεύθυνση' },
    afm:             { key: 'afm',             label: 'ΑΦΜ' },
    total_debt:      { key: 'total_debt',      label: 'Συνολική Οφειλή' },
    max_dropin_debt: { key: 'max_dropin_debt', label: 'Max Drop-in Οφειλή' },
    notes:           { key: 'notes',           label: 'Σημειώσεις' },
    created_at:      { key: 'created_at',      label: 'Ημ. Δημιουργίας' },
  };
  return [...base, ...visibleCols.map((k) => map[k]).filter(Boolean)];
}

export function toExportObject(
  m: Member,
  membershipDebts: Record<string, number>,
  dropinDebts: Record<string, number>,
) {
  const totalDebt = (membershipDebts[m.id] ?? 0) + (dropinDebts[m.id] ?? 0);
  return {
    full_name:       m.full_name ?? '—',
    phone:           m.phone ?? '—',
    email:           m.email ?? '—',
    birth_date:      formatDateDMY(m.birth_date),
    address:         m.address ?? '—',
    afm:             m.afm ?? '—',
    total_debt:      totalDebt ? formatMoney(totalDebt) : '0',
    max_dropin_debt: m.max_dropin_debt != null ? formatMoney(Number(m.max_dropin_debt)) : '—',
    notes:           m.notes ?? '-',
    created_at:      formatDateDMY(m.created_at),
  };
}

export function exportExcel(
  exportRows: Member[],
  visibleCols: ColumnKey[],
  membershipDebts: Record<string, number>,
  dropinDebts: Record<string, number>,
) {
  const cols = buildExportColumns(visibleCols);
  const data = exportRows.map((m) => {
    const obj = toExportObject(m, membershipDebts, dropinDebts);
    const out: Record<string, any> = {};
    cols.forEach((c) => (out[c.label] = (obj as any)[c.key]));
    return out;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Members');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `members_${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

async function loadTtfAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function exportPdf(
  exportRows: Member[],
  visibleCols: ColumnKey[],
  membershipDebts: Record<string, number>,
  dropinDebts: Record<string, number>,
) {
  const cols = buildExportColumns(visibleCols);
  const doc = new jsPDF({ orientation: 'landscape' });
  const regular64 = await loadTtfAsBase64(notoSansUrl);
  doc.addFileToVFS('NotoSans-Regular.ttf', regular64);
  doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
  const bold64 = await loadTtfAsBase64(notoSansBoldUrl);
  doc.addFileToVFS('NotoSans-Bold.ttf', bold64);
  doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(14);
  doc.text(`Μέλη (${exportRows.length})`, 14, 14);
  autoTable(doc, {
    head: [cols.map((c) => c.label)],
    body: exportRows.map((m) => {
      const obj = toExportObject(m, membershipDebts, dropinDebts);
      return cols.map((c) => String((obj as any)[c.key] ?? ''));
    }),
    startY: 20,
    styles:    { font: 'NotoSans', fontStyle: 'normal', fontSize: 9, cellPadding: 2 },
    headStyles:{ font: 'NotoSans', fontStyle: 'bold' },
    theme: 'grid',
  });
  doc.save(`members_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// Re-export so consumers can use it without importing ALL_COLUMNS separately
export { ALL_COLUMNS };

import DatePicker from "react-datepicker";
import { el } from "date-fns/locale";

function isoToDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0);
}

function dateToIso(d?: Date | null): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function AppDatePicker({
  valueIso,
  onChangeIso,
  placeholder = "ΗΗ/ΜΜ/ΕΕΕΕ",
  disabled,
}: {
  valueIso: string;
  onChangeIso: (iso: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <DatePicker
      selected={isoToDate(valueIso)}
      onChange={(d) => onChangeIso(dateToIso(d))}
      dateFormat="dd/MM/yyyy"
      locale={el}
      placeholderText={placeholder}
      className="input"
      wrapperClassName="w-full"
      disabled={disabled}
      showMonthDropdown
      showYearDropdown
      dropdownMode="select"
      scrollableYearDropdown
      yearDropdownItemNumber={80}
    />
  );
}

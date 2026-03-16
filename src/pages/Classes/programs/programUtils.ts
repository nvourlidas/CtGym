// Day options: Date.getDay() => 0=Κυρ, 1=Δευ, ... 6=Σαβ
export const DAY_OPTIONS = [
  { value: 1, short: 'Δευ', full: 'Δευτέρα' },
  { value: 2, short: 'Τρι', full: 'Τρίτη' },
  { value: 3, short: 'Τετ', full: 'Τετάρτη' },
  { value: 4, short: 'Πεμ', full: 'Πέμπτη' },
  { value: 5, short: 'Παρ', full: 'Παρασκευή' },
  { value: 6, short: 'Σαβ', full: 'Σάββατο' },
  { value: 0, short: 'Κυρ', full: 'Κυριακή' },
];

// Generate 30-min time options from 06:00 to 23:00
export const TIME_OPTIONS: string[] = (() => {
  const result: string[] = [];
  for (let m = 6 * 60; m <= 23 * 60; m += 30) {
    const h  = Math.floor(m / 60).toString().padStart(2, '0');
    const mm = (m % 60).toString().padStart(2, '0');
    result.push(`${h}:${mm}`);
  }
  return result;
})();

export function jalaliDateLabel(value) {
  const date = new Date(`${String(value).split(' ')[0]}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    calendar: 'persian', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }).formatToParts(date);
  const valueOf = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${valueOf('weekday')}، ${valueOf('day')} ${valueOf('month')} ${valueOf('year')}`;
}

export function shiftWeek(start, amount) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isInteger(amount)) throw new Error('invalid-week-date');
  const date = new Date(`${start}T12:00:00`);
  if (Number.isNaN(date.getTime())) throw new Error('invalid-week-date');
  date.setDate(date.getDate() + amount * 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function isInWeek(date, start) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= start && date < shiftWeek(start, 1);
}

export function weekDateRange(start) {
  const end = new Date(`${shiftWeek(start, 1)}T12:00:00`);
  end.setDate(end.getDate() - 1);
  const format = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'long', day: 'numeric' });
  return `${format.format(new Date(`${start}T12:00:00`))} تا ${format.format(end)}`;
}

export function samadWeekTimestamp(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new Error('invalid-week-date');
  // The REST service returns ISO dates, but accepts a full local timestamp.
  // Its own website sends YYYY-MM-DD+00:00:00 (+ is decoded to a space).
  return `${isoDate} 00:00:00`;
}

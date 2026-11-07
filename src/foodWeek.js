import { rialPrice } from './prices';

export function dayHasReservation(rows, date) {
  return rows.some((row) => row.date === date && Number(row.selectedCount) > 0 && !row.sold);
}

export function menuRows(response) {
  const payload = response?.payload || response;
  if (!Array.isArray(payload?.selfWeekPrograms)) throw new Error('برنامه غذایی سماد دریافت نشد.');
  const reserves = payload.userWeekReserves || [];
  const result = [];
  const seen = new Set();
  function visit(value) {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || !value.programId || value.hideInPanel) return;
    for (const choice of value.programFoodTypes || [value]) {
      if (choice.hideInPanel) continue;
      const programId = choice.programId || value.programId;
      const key = `menu-${programId}-${choice.foodTypeId || value.foodTypeId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const reservation = reserves.find((row) => row.programId === programId && (!row.foodTypeId || row.foodTypeId === choice.foodTypeId) && Number(row.selectedCount) > 0 && !row.sold);
      result.push({ ...value, ...choice, ...reservation,
        price: rialPrice(choice.price) ?? rialPrice(value.price) ?? rialPrice(reservation?.price),
        key, programId, date: String(value.date || choice.programDate).split(' ')[0],
        name: choice.foodNames || choice.foodName || (choice.foodList || []).map((food) => food.name).join('، ') || value.foodName,
        meal: value.mealTypeName || '', reservation: reservation || null,
        reserved: Boolean(reservation), selectedCount: reservation?.selectedCount || 0,
      });
    }
  }
  visit(payload.selfWeekPrograms);
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.programId - b.programId);
}

export function mergeMenuReservations(menu, reservations) {
  const result = menu.map((food) => {
    const row = reservations.find((item) => item.programId === food.programId && (!item.foodTypeId || !food.foodTypeId || item.foodTypeId === food.foodTypeId) && !item.sold);
    return row ? { ...food, ...row, price: rialPrice(food.price) ?? rialPrice(row.price), key: food.key, reservation: row, reserved: true } :
      { ...food, reserved: false, reservation: null, selectedCount: 0 };
  });
  for (const row of reservations) {
    if (row.sold || result.some((food) => food.reservation?.key === row.key)) continue;
    result.push({ ...row, key: `outside-${row.key}`, reservation: row, reserved: true, reportOnly: true });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}


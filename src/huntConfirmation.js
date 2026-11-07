// Read-only confirmation; this never repeats a cart/save request.
export function confirmedHuntFood(foods, reports) {
  return foods.find(food => reports.some(row => !row.sold && Number(row.programId) === Number(food.programId) &&
    row.date === food.date && Number(row.selectedCount) > 0));
}

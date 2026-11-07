export function walletBalance(snapshot) {
  const balance = snapshot?.balance;
  const prices = (snapshot?.foods || []).map(food => food.priceRials).filter(price => typeof price === 'number' && Number.isFinite(price) && price > 0);
  const maximum = prices.length ? Math.max(...prices) : null;
  const known = typeof balance === 'number' && Number.isFinite(balance);
  return { balanceRials: known ? balance : null, maxMealRials: maximum, low: known && maximum !== null && balance < maximum };
}

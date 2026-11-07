export function rialPrice(value) {
  if (value == null || value === '') return null;
  const normalized = typeof value === 'string' ? value
    .replace(/[۰-۹]/g, (ch) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(ch)))
    .replace(/[٠-٩]/g, (ch) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(ch)))
    .replace(/[,٬\s]/g, '') : value;
  if (typeof normalized !== 'number' && (typeof normalized !== 'string' || !/^\d+(?:\.\d+)?$/.test(normalized))) return null;
  const price = Number(normalized);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

export function tomanPrice(value) {
  const price = rialPrice(value);
  return price === null ? 'قیمت نامشخص' : `${(price / 10).toLocaleString('fa-IR')} تومان`;
}

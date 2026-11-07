export const SELVES = [
  { id: 1, name: 'سلف مرکزی' },
  { id: 2, name: 'سلف تربیت بدنی' },
  { id: 3, name: 'سلف علوم پایه' },
  { id: 4, name: 'سلف صومعه‌سرا' },
  { id: 5, name: 'سلف واجارگاه' },
];

export function selfName(id) {
  const found = SELVES.find((item) => item.id === Number(id));
  return found ? found.name : 'سلف';
}

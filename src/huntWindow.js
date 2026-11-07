export function isHuntExpired(date, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return true;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
  const value = (type) => parts.find((item) => item.type === type).value;
  const today = `${value('year')}-${value('month')}-${value('day')}`;
  return date < today || (date === today && Number(value('hour')) >= 15);
}

export function canHuntFood(food, reservations = [], now = Date.now()) {
  return Boolean(food && !food.reserved && !food.reportOnly && !food.consumed && food.actions?.buy === false &&
    !isHuntExpired(food.date, now) && !reservations.some(item => item.date === food.date && item.reserved));
}

// Keep injected browser source literal for Hermes release builds.
export const HUNT_WINDOW_SCRIPT = String.raw`function deganHuntExpired(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return true;
  var parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  function value(type){return parts.find(function(item){return item.type===type;}).value;}
  var today=value('year')+'-'+value('month')+'-'+value('day');
  return date<today||(date===today&&Number(value('hour'))>=15);
}`;

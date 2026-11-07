// Browser source stays literal so Hermes never needs Function.toString(). Both
// the DOM bridge and arrow driver use the dates on the actual food checkboxes.
export const SITE_WEEK_SCRIPT = String.raw`(function(){
  window.__deganReadWeek=function(){
    function saturday(value){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return '';
      var date=new Date(value+'T12:00:00Z');if(isNaN(date.getTime()))return '';
      date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+1)%7));return date.toISOString().slice(0,10);
    }
    var input=document.getElementById('weekStartDateTimeAjx');
    var stamp=input&&input.value?new Date(Number(input.value)):null;
    var parts=stamp&&!isNaN(stamp.getTime())?new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(stamp):[];
    function part(type){var item=parts.find(function(item){return item.type===type;});return item?item.value:'';}
    var headerWeek=parts.length?saturday(part('year')+'-'+part('month')+'-'+part('day')):'';
    var boxes=Array.from(document.querySelectorAll('input[type="checkbox"][programDate]'));
    var dates=boxes.map(function(box){return box.getAttribute('programDate')||'';}).filter(function(date){return /^\d{4}-\d{2}-\d{2}$/.test(date);});
    var weeks=Array.from(new Set(dates.map(saturday).filter(Boolean)));
    var labels=document.querySelectorAll('label[for^="userWeekReserves.selected"]');
    var ready=(weeks.length===1&&dates.length===boxes.length)||(boxes.length===0&&labels.length===0&&Boolean(headerWeek));
    var week=weeks.length===1?weeks[0]:boxes.length===0&&labels.length===0?headerWeek:'';
    var move=window.__deganWeekClicked;
    if(move&&ready&&week&&week!==move.from){
      var changed=dates.join('|')!==move.dates;
      if(dates.length&&changed){
        window.__deganWeekClicked=null;
        if(window.__deganWeekNavigation)window.__deganWeekNavigation.done=true;
      }else if(!dates.length&&headerWeek!==move.from){
        // Empty AJAX tables can be transitional. Require a settled empty read.
        if(!move.emptyAt)move.emptyAt=Date.now();
        if(Date.now()-move.emptyAt>=400){window.__deganWeekClicked=null;if(window.__deganWeekNavigation)window.__deganWeekNavigation.done=true;}
      }
    }
    return {weekStart:week,headerWeek:headerWeek,tableWeek:weeks.length===1?weeks[0]:'',weekReady:ready,navigating:Boolean(window.__deganWeekClicked),dates:dates.join('|')};
  };
})();`;

export function bookingWeeks(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone:'Asia/Tehran', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date(now));
  const part = type => parts.find(item => item.type === type).value;
  const date = new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((day + 1) % 7));
  const current=date.toISOString().slice(0,10);
  date.setUTCDate(date.getUTCDate()+7);
  return {current,next:date.toISOString().slice(0,10),preferNext:[4,5].includes(day)};
}

export function clampBookingWeek(value, now = Date.now()) {
  const {current,next}=bookingWeeks(now);
  return value>=next?next:current;
}

export function initialBookingWeek(now = Date.now()) {
  const weeks=bookingWeeks(now);
  return weeks.preferNext?weeks.next:weeks.current;
}

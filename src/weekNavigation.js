import { SITE_WEEK_SCRIPT } from './siteWeek';
// The legacy arrows submit a whole form. Never submit another arrow in the same
// document, even if reinjected while its response is still on the way.
export function weekNavigationScript(start, {preferCurrent=false}={}) {
  return SITE_WEEK_SCRIPT + `
    (function () {
      var target = ${JSON.stringify(start)};
      function post(value) { value.targetWeek=target; window.ReactNativeWebView.postMessage(JSON.stringify(value)); }
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(target)) { post({type:'week-error', message:'تاریخ هفته معتبر نیست.'}); return; }
      if (window.__deganWeekNavigation && !window.__deganWeekNavigation.done) return;
      if (window.__deganWeekTimer) clearTimeout(window.__deganWeekTimer);
      var state = {target:target,done:false,cancelled:false};
      window.__deganWeekNavigation=state;
      var began = Date.now();
      function tick() {
        if(state.cancelled || window.__deganWeekNavigation!==state)return;
        window.__deganWeekTimer = null;
        if (document.getElementById('login_btn_submit')) { state.done=true;post({type:'login-page'}); return; }
        var actual=window.__deganReadWeek();
        var week=actual.weekStart;
        if (actual.weekReady && week === target && !actual.navigating) { state.done=true;post({type:'week-ready',weekStart:week}); return; }
        if (Date.now()-began > 15000) { state.done=true;post({type:'week-error',message:'تغییر هفته انجام نشد. صفحه سایت را بررسی کنید.'}); return; }
        if (actual.weekReady && week && !actual.navigating) {
          var boxes = document.querySelectorAll('input[type="checkbox"][programDate]');
          for (var i=0;i<boxes.length;i++) if (boxes[i].checked !== boxes[i].defaultChecked) { state.done=true;post({type:'week-error',message:'ابتدا تغییرات ثبت‌نشده سایت را بررسی کنید.'}); return; }
          var button = null;
          if(${JSON.stringify(preferCurrent)}){
            var controls=document.querySelectorAll('a,button,input[type="button"],input[type="submit"],input[type="image"]');
            for(var c=0;c<controls.length;c++){
              var control=controls[c];
              var label=[control.textContent,control.value,control.getAttribute&&control.getAttribute('title'),control.getAttribute&&control.getAttribute('alt')].filter(Boolean).join(' ').replace(/[\u200c\u200d]/g,' ').replace(/\\s+/g,' ');
              var style=window.getComputedStyle(control);
              if(!control.disabled&&style.display!=='none'&&style.visibility!=='hidden'&&/هفته\\s*(?:جاری|فعلی)|این\\s*هفته/.test(label)){button=control;break;}
            }
          }
          if(!button)button = document.getElementById(week < target ? 'nextWeekBtn' : 'beforeWeekImgBtn');
          if (!button || button.disabled || window.getComputedStyle(button).display === 'none' || window.getComputedStyle(button).visibility === 'hidden') { state.done=true;post({type:'week-error',message:'دکمه تغییر هفته در سایت فعال نیست.'}); return; }
          window.__deganWeekClicked = {from:week,target:target,dates:actual.dates};
          button.click();
        }
        window.__deganWeekTimer = setTimeout(tick, 200);
      }
      tick();
    })(); true;
  `;
}

export const stopWeekNavigationScript = 'if(window.__deganWeekNavigation){window.__deganWeekNavigation.cancelled=true;window.__deganWeekNavigation.done=true;}if(window.__deganWeekTimer)clearTimeout(window.__deganWeekTimer);window.__deganWeekTimer=null;true;';

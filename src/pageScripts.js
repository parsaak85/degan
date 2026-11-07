import { legacyPanelUrl } from './portal';
import { HUNT_WINDOW_SCRIPT } from './huntWindow';

export const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function panelUrl(selfId) {
  return legacyPanelUrl(selfId);
}

export function openReservationPanelScript(selfId) {
  const path = new URL(legacyPanelUrl(selfId)).pathname + new URL(legacyPanelUrl(selfId)).search;
  return `(function(){if(location.hostname!=='food.guilan.ac.ir'||!/^https?:$/.test(location.protocol))return;
    location.replace(location.origin+${JSON.stringify(path)});
  })();true;`;
}

export function beforeLoadScript() {
  return `
    (function () {
      if (location.hostname !== 'food.guilan.ac.ir') return;
      if (window.__deganOldPreference) return;
      window.__deganOldPreference = true;
      try { localStorage.setItem('redirect-confirm','0'); localStorage.setItem('redirect-confirm-expire',String(Math.ceil(Date.now()/1000)+604800)); } catch(e) {}
      function keepOld() { var button=document.getElementById('btn-redirect-cancel'); if(button)button.click(); }
      document.addEventListener('click',function(event){
        var link=event.target&&event.target.closest&&event.target.closest('a,button,input[type="button"],input[type="submit"]');
        if(link&&((link.textContent||link.value||'')+' '+(link.title||'')).replace(/[\u200c\u200d]/g,' ').indexOf('افزایش اعتبار')!==-1){
          // Observe the real click, but let its own handler/navigation run.
          window.__deganWalletEnabled=true;
          try{sessionStorage.setItem('degan-wallet-active','1');}catch(e){}
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'wallet-opened'}));
        }
      },true);
      if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',keepOld,{once:true});else keepOld();
    })(); true;
  `;
}
export function loginScript(username, password) {
  const user = JSON.stringify(String(username ?? ''));
  const pass = JSON.stringify(String(password ?? ''));
  return `
    (function () {
      if (location.hostname !== 'food.guilan.ac.ir' || !/^https?:$/.test(location.protocol)) return;
      if (window.__deganLoginSent) return;
      window.__deganLoginSent = true;
      try {
        var cancel = document.getElementById('btn-redirect-cancel');
        if (cancel) cancel.click();
      } catch (e) {}
      var user = document.getElementById('username');
      var pass = document.getElementById('password');
      var btn = document.getElementById('login_btn_submit');
      if (!user || !pass || !btn) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'login-missing' }));
        return;
      }
      var proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (proto && proto.set) {
        proto.set.call(user, ${user});
        proto.set.call(pass, ${pass});
      } else {
        user.value = ${user};
        pass.value = ${pass};
      }
      user.dispatchEvent(new Event('input', { bubbles: true }));
      pass.dispatchEvent(new Event('input', { bubbles: true }));
      user.dispatchEvent(new Event('change', { bubbles: true }));
      pass.dispatchEvent(new Event('change', { bubbles: true }));
      if (btn.disabled) { window.ReactNativeWebView.postMessage(JSON.stringify({type:'login-missing'})); return; }
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'login-submit' }));
      btn.click();
    })();
    true;
  `;
}

export function readPageScript() {
  return `
    (function () {
      function post(payload) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
      var loginBtn = document.getElementById('login_btn_submit');
      if (loginBtn) {
        var errText = '';
        var nodes = document.querySelectorAll('.login-messages, .login_message, div[style*="color: red"], .error');
        for (var i = 0; i < nodes.length; i++) {
          var text = (nodes[i].textContent || '').replace(/\\s+/g, ' ').trim();
          if (text) errText = text;
        }
        post({ type: 'login-page', error: errText });
        return;
      }
      function dayIn(text) {
        var value = String(text || '').replace(/[\u200c\u200d\u0640]/g, '').replace(/\\s+/g, ' ');
        var match = value.match(/سه\\s*شنبه|پنج\\s*شنبه|چهارشنبه|یکشنبه|دوشنبه|جمعه|شنبه/);
        if (!match) return '';
        return match[0].replace(/\\s/g, '') === 'سهشنبه' ? 'سه‌شنبه' : match[0].replace(/\\s/g, '');
      }
      function ownText(element) {
        var result = '';
        for (var child = element.firstChild; child; child = child.nextSibling) {
          if (child.nodeType === 3) result += child.textContent || '';
        }
        return result.trim();
      }
      function dayOf(label) {
        // The portal uses both table and card layouts. A day can be in a
        // heading, an earlier cell, or a wrapper around the food label.
        for (var node = label; node && node !== document.body; node = node.parentElement) {
          var inlineDay = dayIn(ownText(node));
          if (inlineDay) return inlineDay;
          var sibling = node.previousElementSibling;
          while (sibling) {
            var siblingDay = dayIn(sibling.innerText || sibling.textContent);
            if (siblingDay) return siblingDay;
            sibling = sibling.previousElementSibling;
          }
        }
        return '';
      }
      function digits(value) {
        var map = {'۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9','٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'};
        return String(value || '').replace(/[۰-۹٠-٩]/g, function (ch) { return map[ch] || ch; }).replace(/[^0-9]/g, '');
      }
      var balance = null;
      var pageText = (document.body && document.body.innerText ? document.body.innerText : '').replace(/\\s+/g, ' ');
      var balanceMatch = pageText.match(/موجودی[^0-9۰-۹]{0,16}([0-9۰-۹][0-9۰-۹,٬.\\s]{2,})/);
      if (balanceMatch) {
        var parsed = parseInt(digits(balanceMatch[1]), 10);
        if (isFinite(parsed)) balance = parsed;
      }
      var creditUrl = '';
      var links = document.querySelectorAll('a');
      for (var c = 0; c < links.length; c++) {
        if ((links[c].textContent || '').indexOf('افزایش اعتبار') !== -1 && links[c].href) {
          creditUrl = links[c].href;
          break;
        }
      }
      var labels = document.querySelectorAll('label[for^="userWeekReserves.selected"]');
      if (!labels.length && !document.getElementById('weekStartDateTimeAjx')) { post({type:'legacy-page'}); return; }
      var foods = [];
      var seen = {};
      for (var j = 0; j < labels.length; j++) {
        var label = labels[j];
        var index = parseInt((label.getAttribute('for') || '').replace('userWeekReserves.selected', ''), 10);
        if (!isFinite(index) || seen[index]) continue;
        seen[index] = true;
        var raw = (label.textContent || '').replace(/\\s+/g, ' ').trim();
        var parts = raw.split('|').map(function (part) { return part.trim(); }).filter(Boolean);
        var input = document.getElementById(label.getAttribute('for'));
        var program = document.querySelector('[name="userWeekReserves[' + index + '].programId"]');
        var priceMatch = input && (input.getAttribute('onclick') || '').match(/enableDisableNumber\\(this,\\s*'[^']*',\\s*'([0-9]+)'/);
        foods.push({
          priceRials: priceMatch ? Number(priceMatch[1]) : null,
          index: index,
          programId: program ? Number(program.value) : null,
          date: input ? input.getAttribute('programDate') || '' : '',
          reserved: Boolean(input && input.defaultChecked),
          day: dayOf(label),
          name: parts.length > 1 ? parts[1] : (raw || ('غذا ' + index)),
          detail: parts.filter(function (_, n) { return n !== 1; }).join(' · ')
        });
      }
      var weekInput = document.getElementById('weekStartDateTimeAjx');
      var weekDate = weekInput ? new Date(Number(weekInput.value)) : null;
      var week = weekDate && !isNaN(weekDate.getTime()) ? weekDate.getFullYear() + '-' + String(weekDate.getMonth() + 1).padStart(2, '0') + '-' + String(weekDate.getDate()).padStart(2, '0') : '';
      post({ type: 'panel', foods: foods, balance: balance, creditUrl: creditUrl, weekStart: week });
    })();
    true;
  `;
}

export function huntScript(indices, targetDate = '', targetProgramId = null, targets = null) {
  const wanted = JSON.stringify(
    (Array.isArray(indices) ? indices : [])
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n)),
  );

  return `
    (function () {
      function post(payload) {
        try { window.ReactNativeWebView.postMessage(JSON.stringify(payload)); } catch (e) {}
      }
      ${HUNT_WINDOW_SCRIPT}
      var huntDate=${JSON.stringify(targetDate)};
      if(huntDate&&deganHuntExpired(huntDate)){post({type:'hunt-expired'});return;}
      if (document.getElementById('login_btn_submit')) {
        post({ type: 'session-lost' });
        return;
      }

      if (window.__deganHuntRunning) return;
      window.__deganHuntRunning = true;
      window.__deganHuntCancelled = false;
      window.__deganOriginalAlert = window.alert;
      window.__deganOriginalConfirm = window.confirm;
      window.alert = function () { return true; };
      window.confirm = function () { return true; };
      var pageText = (document.body && document.body.innerText) || '';
      var rejected = pageText.indexOf('هیچ موردی برای تغییر وجود ندارد') !== -1;
      var pending = null;
      try { pending = sessionStorage.getItem('degan-pending'); } catch (e) {}
      if (pending && rejected) {
        try { sessionStorage.removeItem('degan-pending'); } catch (e) {}
        post({ type: 'miss' });
        return;
      }
      if (pending && !rejected) {
        try { sessionStorage.removeItem('degan-pending'); } catch (e) {}
        post({ type: 'bought', index: Number(pending), reserved: true });
        return;
      }
      var targetDate = ${JSON.stringify(targetDate)};
      if (targetDate) {
        var boxes = document.querySelectorAll('input[type="checkbox"][programDate]');
        for (var b = 0; b < boxes.length; b++) {
          if (boxes[b].getAttribute('programDate') === targetDate && boxes[b].defaultChecked) {
            post({ type: 'day-reserved' });
            return;
          }
        }
      }
      function findCart(index) {
        function visible(node){
          if(!node||node.disabled)return false;
          for(var element=node;element&&element!==document.body;element=element.parentElement){
            var style=window.getComputedStyle?window.getComputedStyle(element):null;
            if(style&&(style.display==='none'||style.visibility==='hidden'))return false;
          }
          return true;
        }
        var span = document.getElementById('buyFreeFoodIconSpanuserWeekReserves.selected' + index);
        if (span && visible(span)) {
          var inside = span.querySelector('img, input[type="image"]');
          if (visible(inside)) return inside;
        }
        var box = document.getElementById('userWeekReserves.selected' + index);
        var node = box || span;
        var cell = null;
        while (node) {
          if (node.tagName === 'TD') { cell = node; break; }
          node = node.parentNode;
        }
        if (!cell) return null;
        var pics = cell.querySelectorAll('img, input[type="image"]');
        for (var n = 0; n < pics.length; n++) {
          var src = ((pics[n].getAttribute('src') || '') + (pics[n].src || '')).toLowerCase();
          if (visible(pics[n]) && (src.indexOf('buy') !== -1 || src.indexOf('cart') !== -1 || src.indexOf('basket') !== -1 || src.indexOf('shop') !== -1)) {
            return pics[n];
          }
        }
        return null;
      }
      var wanted = ${wanted};
      var targets=${JSON.stringify(targets)};
      for (var i = 0; i < wanted.length; i++) {
        var index = wanted[i];
        var requested=targets?targets.find(function(food){return food.index===index;}):null;
        var dateForFood=requested?requested.date:targetDate;
        var programForFood=requested?Number(requested.programId):${JSON.stringify(targetProgramId)};
        if(dateForFood&&deganHuntExpired(dateForFood))continue;
        if (dateForFood) {
          var candidate = document.getElementById('userWeekReserves.selected' + index);
          var program = document.querySelector('[name="userWeekReserves[' + index + '].programId"]');
          if (!candidate || candidate.getAttribute('programDate') !== dateForFood ||
              (programForFood !== null && (!program || Number(program.value) !== programForFood))) {
            post({ type: 'target-changed' });
            return;
          }
          if(targets&&candidate.disabled===false)continue;
          var dayTaken=false;
          var dayBoxes=document.querySelectorAll('input[type="checkbox"][programDate]');
          for(var d=0;d<dayBoxes.length;d++)if(dayBoxes[d].getAttribute('programDate')===dateForFood&&dayBoxes[d].defaultChecked)dayTaken=true;
          if(dayTaken)continue;
        }
        var cart = findCart(index);
        if (!cart) continue;
        try { cart.click(); } catch (e) {}
        window.__deganHuntTimeout = setTimeout(function () {
          if (window.__deganHuntCancelled) return;
          if(dateForFood&&deganHuntExpired(dateForFood)){post({type:'hunt-expired'});return;}
          var btn = document.getElementById('doReservBtn');
          if (!btn) {
            post({ type: 'miss' });
            return;
          }
          try { sessionStorage.setItem('degan-pending', String(index)); } catch (e) {}
          post({ type: 'hunt-submitted', index: index });
          try { btn.click(); } catch (e) {}
          var tries = 0;
          var timer = setInterval(function () {
            if (window.__deganHuntCancelled) { clearInterval(timer); return; }
            tries += 1;
            var text = (document.body && document.body.innerText) || '';
            if (text.indexOf('هیچ موردی برای تغییر وجود ندارد') !== -1) {
              clearInterval(timer);
              try { sessionStorage.removeItem('degan-pending'); } catch (e) {}
              post({ type: 'miss' });
              return;
            }
            if (tries >= 8) {
              clearInterval(timer);
              try { sessionStorage.removeItem('degan-pending'); } catch (e) {}
              post({ type: 'bought', index: index, reserved: true });
            }
          }, 200);
          window.__deganHuntInterval = timer;
        }, 200);
        return;
      }
      post({ type: 'miss' });
    })();
    true;
  `;
}

export function stopHuntScript() {
  return `window.__deganHuntCancelled=true;window.__deganHuntRunning=false;
    if(window.__deganHuntTimeout)clearTimeout(window.__deganHuntTimeout);
    if(window.__deganHuntInterval)clearInterval(window.__deganHuntInterval);
    if(window.__deganOriginalAlert)window.alert=window.__deganOriginalAlert;
    if(window.__deganOriginalConfirm)window.confirm=window.__deganOriginalConfirm;
    true;`;
}


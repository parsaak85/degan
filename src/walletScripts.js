// Runs only on the university's amount/confirmation pages. The bank gets the
// exact original form in the default browser, including POST-only gateway tokens.
export const WALLET_BRIDGE = String.raw`(function(){
  if(location.hostname!=='food.guilan.ac.ir')return;
  if(window.__deganWallet)return;
  var sent=false;
  function outside(url){try{var u=new URL(url,location.href);return /^https?:$/.test(u.protocol)&&u.hostname!=='food.guilan.ac.ir';}catch(e){return false;}}
  function post(value){if(sent)return;sent=true;window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({scope:'degan-wallet'},value)));}
  function raw(value){window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({scope:'degan-wallet'},value)));}
  function capture(form,submitter){
    if(window.__deganWalletEnabled===false)return false;
    try{var own=new URL(form.action||location.href,location.href);
      if(own.hostname==='food.guilan.ac.ir'&&own.pathname==='/nurture/user/credit/charge/charge.rose'){
        // The site's amount POST only redirects here. Hand off BEFORE that POST:
        // Android WebView can hit the WAF before its redirect is observable.
        var amount='',consumer='';
        new FormData(form).forEach(function(value,name){if(name==='customAmount')amount=String(value);if(name==='consumer')consumer=String(value);});
        amount=amount.trim().replace(/[۰-۹]/g,function(ch){return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(ch));}).replace(/[٠-٩]/g,function(ch){return String('٠١٢٣٤٥٦٧٨٩'.indexOf(ch));});
        if(!/^[0-9]+$/.test(amount)||!Number.isSafeInteger(Number(amount))||Number(amount)<=0){raw({type:'amount-error',message:'لطفاً مبلغ معتبر را در صفحه دانشگاه انتخاب یا وارد کنید.'});return true;}
        if(consumer&&consumer!=='CreditCharge'){raw({type:'amount-error',message:'نوع افزایش اعتبار دانشگاه شناسایی نشد.'});return true;}
        var checkout=new URL('/modules/epayment/processing/checkout.rose',location.href);
        checkout.searchParams.set('actionName','requestPaymentForm');checkout.searchParams.set('consumer','CreditCharge');checkout.searchParams.set('selectedAmount',amount);
        post({type:'checkout',url:checkout.href});return true;
      }
    }catch(e){raw({type:'amount-error',message:'مبلغ انتخابی از فرم دانشگاه دریافت نشد. دوباره تلاش کنید.'});return true;}
    var action=form.action||location.href;if(!outside(action))return false;
    var fields=[];new FormData(form).forEach(function(value,name){if(typeof value==='string')fields.push({name:name,value:value});});
    if(submitter&&submitter.name)fields.push({name:submitter.name,value:submitter.value||''});
    if((form.method||'get').toLowerCase()==='post')post({type:'post',action:action,fields:fields});
    else {var url=new URL(action,location.href);fields.forEach(function(item){url.searchParams.append(item.name,item.value);});post({type:'get',url:url.href});}
    return true;
  }
  function destination(url){
    var u=new URL(url,location.href);
    var forms=document.querySelectorAll('form');
    for(var i=0;i<forms.length;i++){var action=new URL(forms[i].action||location.href,location.href);
      if(action.origin===u.origin&&action.pathname===u.pathname&&(forms[i].method||'get').toLowerCase()==='post'){capture(forms[i]);return;}}
    post({type:'get',url:u.href});
  }
  window.__deganWallet={destination:destination,retry:function(){sent=false;}};
  document.addEventListener('submit',function(event){if(capture(event.target,event.submitter)){event.preventDefault();event.stopImmediatePropagation();}},true);
  var original=HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit=function(){if(!capture(this))return original.apply(this,arguments);};
})();true;`;

export function walletDestinationScript(url) {
  return enableWebsiteWalletScript + WALLET_BRIDGE + '\nif(window.__deganWallet)window.__deganWallet.destination(' + JSON.stringify(url) + ');true;';
}

export const enableWebsiteWalletScript="window.__deganWalletEnabled=true;try{sessionStorage.setItem('degan-wallet-active','1');}catch(e){};";
export const disableWebsiteWalletScript="window.__deganWalletEnabled=false;try{sessionStorage.removeItem('degan-wallet-active');}catch(e){};true;";
export const retryWalletHandoffScript="if(window.__deganWallet)window.__deganWallet.retry();true;";
export function managedWalletBridgeScript(){
  return "window.__deganWalletEnabled=false;try{window.__deganWalletEnabled=sessionStorage.getItem('degan-wallet-active')==='1';}catch(e){};"+WALLET_BRIDGE;
}


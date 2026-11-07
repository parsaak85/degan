// Samad's public /loginCas route installs the existing OAuth pair and selects
// Guilan (GLN in its official university directory), then returns to Samad Home.
// Its current implementation has no wallet-return parameter. The user agreed
// to tap Wallet after automatic sign-in. Never log or persist this token URL.
export function samadBrowserLoginUrl(session) {
  if(typeof session?.accessToken!=='string'||!session.accessToken.trim()||
    typeof session?.refreshToken!=='string'||!session.refreshToken.trim()){
    throw new Error('توکن ورود خودکار سماد کامل نیست.');
  }
  return 'https://samad.app/loginCas/'+[
    'access_token='+session.accessToken,'refresh_token='+session.refreshToken,'uni_code=GLN',
  ].map(encodeURIComponent).join('/');
}

export async function openWalletBrowser({client,checkConnection,openURL,beforeOpen=()=>{},isActive=()=>true}) {
  await checkConnection();
  if(!isActive())return false;
  const session=await client.browserSession();
  if(!isActive())return false;
  const url=samadBrowserLoginUrl(session);
  beforeOpen();
  await openURL(url);
  return true;
}

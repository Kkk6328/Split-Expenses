if(window.APP_CONFIG.lineApiBase){
 const cfg=window.APP_CONFIG;
 let user=null,needsRenewal=false;
 const initialize=()=>window.lineReady||(window.lineReady=liff.init({liffId:cfg.liffId}));
 const homeScreen=window.navigator?.standalone===true||window.matchMedia?.('(display-mode: standalone)').matches;
 function updateOpenInLine(){
  const hint=document.getElementById('openInLineHint');
  hint.hidden=!homeScreen||!!user;
  if(hint.hidden)return;
  const url=new URL('https://liff.line.me/'+cfg.liffId+'/');
  if(location.hash.startsWith('#join='))url.hash=location.hash;
  document.getElementById('openInLine').href=url.href;
 }
 const signal=detail=>{
  updateOpenInLine();
  window.dispatchEvent(new CustomEvent('warm-auth',{detail}));
 };
 function expired(){
  user=null;needsRenewal=true;signal(null);
  document.getElementById('status').textContent='請重新登入';
  document.getElementById('login').textContent='重新登入 LINE';
  return Object.assign(Error('LINE 登入需要更新，請按「重新登入 LINE」。'),{code:'line-auth',status:401});
 }
 function token(){
  const raw=liff.getIDToken();
  const decoded=liff.getDecodedIDToken?.();
  if(!raw||(decoded?.exp&&decoded.exp*1000<=Date.now()+15000))throw expired();
  return raw;
 }
 async function request(action,data={}){
  const idToken=token();
  const r=await fetch(cfg.lineApiBase,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+idToken},body:JSON.stringify({action,...data})});
  if(r.status===401)throw expired();
  let result;try{result=await r.json()}catch{throw Error('伺服器回應異常，請稍後再試')}
  if(!r.ok)throw Object.assign(Error(result.error||'雲端操作失敗'),{status:r.status});
  return result;
 }
 async function announce(){
  await request('list');
  const p=await liff.getProfile();
  user={uid:p.userId,displayName:p.displayName,pictureUrl:p.pictureUrl};needsRenewal=false;
  signal({uid:user.uid,name:user.displayName});
 }
 async function reconnect(){
  await initialize();
  user=null;signal(null);
  if(liff.isInClient()){
   // Reopen the LIFF entry point to obtain a fresh LINE session.
   const url=new URL('https://liff.line.me/'+cfg.liffId);
   url.searchParams.set('renew',String(Date.now()));
   if(location.hash.startsWith('#join='))try{sessionStorage.setItem('split-pending-invite',location.hash)}catch{}
   location.replace(url.href);
  }else{
   if(liff.isLoggedIn())liff.logout();
   const url=new URL(location.href);
   ['code','state','liffClientId','liffRedirectUri'].forEach(k=>url.searchParams.delete(k));
   liff.login({redirectUri:url.href});
  }
 }
 window.WarmCloud={
  user:()=>user,
  login:async()=>{await initialize();if(needsRenewal)return reconnect();if(!liff.isLoggedIn()){if(liff.isInClient())return reconnect();liff.login({redirectUri:location.href});return}await announce()},
  reconnect,
  logout:async()=>{user=null;signal(null);if(!liff.isInClient()){liff.logout();location.reload()}else{document.getElementById('status').textContent='已登出此頁面'}},
  api:request
 };
 document.getElementById('cloudLogin').hidden=true;
 updateOpenInLine();
 window.addEventListener('load',async()=>{
  try{
   await initialize();
   if(!location.hash)try{const pending=sessionStorage.getItem('split-pending-invite');if(pending?.startsWith('#join=')){history.replaceState(null,'',location.pathname+location.search+pending);sessionStorage.removeItem('split-pending-invite')}}catch{}
   updateOpenInLine();
   if(liff.isLoggedIn())await announce();
  }catch(e){
   if(e.code==='line-auth')return;
   user=null;signal(null);
   document.getElementById('status').textContent='尚未連線';
   if(typeof toast==='function')toast(e.message||'LINE 連線失敗，請稍後重試');
  }
 });
}

if(window.APP_CONFIG.lineApiBase){
 const cfg=window.APP_CONFIG;
 let user=null,needsRenewal=false;
 const initialize=()=>window.lineReady||(window.lineReady=liff.init({liffId:cfg.liffId}));
 const homeScreen=window.navigator?.standalone===true||window.matchMedia?.('(display-mode: standalone)').matches;
 const entry=new URL(location.href);
 const homeLogin=entry.searchParams.get('homeLogin'),homeKey=entry.searchParams.get('homeKey');
 const installed=homeScreen&&!homeLogin;
 let loginWindow,homeKeys,homeSession,finishingHomeLogin;
 function prepareHomeLogin(){
  homeLoginTransfer.prepare().then(keys=>{homeKeys=keys}).catch(()=>{});
 }
 function openHomeScreenLogin(renew=false){
  if(loginWindow&&!loginWindow.closed&&homeLoginTransfer.pending()){loginWindow.focus();return}
  if(!homeKeys){prepareHomeLogin();throw Error('登入接續正在準備，請稍後再按一次「LINE 登入」。')}
  const url=new URL(location.href);
  url.search=renew?'?homeLogin=renew':'?homeLogin=start';
  url.searchParams.set('homeKey',homeKeys.publicKey);
  url.searchParams.set('homeRelay',homeKeys.relay);
  url.hash='';
  homeLoginTransfer.start(homeKeys);
  updateOpenInLine();
  loginWindow=window.open(url.href,'_blank','popup');
  if(!loginWindow)throw Error('無法開啟 LINE 登入視窗，請允許彈出視窗後再試。');
  homeKeys=null;
  prepareHomeLogin();
  updateOpenInLine();
 }
 window.addEventListener('message',event=>{
  if(loginWindow&&event.source===loginWindow&&event.origin===entry.origin&&event.data?.type==='split-home-login'&&typeof event.data.code==='string'){
   finishHomeLogin(event.data.code).catch(()=>{});
  }
 });
 function finishHomeLogin(code){
  if(finishingHomeLogin)return finishingHomeLogin;
  finishingHomeLogin=(async()=>{
   const raw=await homeLoginTransfer.unseal(code);
   await announceHomeSession(raw);
   loginWindow?.close();
   loginWindow=null;
  })().finally(()=>{finishingHomeLogin=null});
  return finishingHomeLogin;
 }
 let checkingRelay=false;
 async function fetchWithDeadline(options){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  try{return await fetch(cfg.lineApiBase,{...options,signal:controller.signal})}
  finally{clearTimeout(timer)}
 }
 async function resumeHomeLogin(){
  const secret=homeLoginTransfer.relaySecret();
  if(!installed||user||document.hidden||checkingRelay||!secret)return;
  document.getElementById('status').textContent='正在接續 LINE 登入…';
  checkingRelay=true;
  try{
   const response=await fetchWithDeadline({method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'readHomeLoginRelay',secret})});
   if(!response.ok)return;
   const {code}=await response.json();
   if(code&&secret===homeLoginTransfer.relaySecret()&&!user)await finishHomeLogin(code);
  }catch{
   // A later foreground check can retry after a connection failure.
  }finally{checkingRelay=false}
 }
 function updateOpenInLine(){
  const hint=document.getElementById('openInLineHint');
  document.getElementById('resumeHomeLogin').hidden=!installed||!!user||!homeLoginTransfer.pending();
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
  if(installed)homeLoginTransfer.forget();
  homeSession=null;
  user=null;needsRenewal=true;signal(null);
  document.getElementById('status').textContent='請重新登入';
  document.getElementById('login').textContent='重新登入 LINE';
  return Object.assign(Error('LINE 登入需要更新，請按「重新登入 LINE」。'),{code:'line-auth',status:401});
 }
 function token(){
  if(homeSession){
   if(homeSession.exp&&homeSession.exp*1000<=Date.now()+15000)throw expired();
   return homeSession.raw;
  }
  const raw=liff.getIDToken();
  const decoded=liff.getDecodedIDToken?.();
  if(!raw||(decoded?.exp&&decoded.exp*1000<=Date.now()+15000))throw expired();
  return raw;
 }
 async function request(action,data={},idToken=token()){
  const r=await fetch(cfg.lineApiBase,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+idToken},body:JSON.stringify({action,...data})});
  if(r.status===401)throw expired();
  let result;try{result=await r.json()}catch{throw Error('伺服器回應異常，請稍後再試')}
  if(!r.ok)throw Object.assign(Error(result.error||'雲端操作失敗'),{status:r.status});
  return result;
 }
 async function announceHomeSession(raw){
  let profile;
  if(raw.startsWith('SH1.')){
   ({profile}=await request('getHomeSession',{},raw));
  }else{
   const claims=homeLoginTransfer.claims(raw);
   if(claims.exp*1000<=Date.now()+15000)throw expired();
   const result=await request('startHomeSession',{},raw);
   raw=result.session;
   profile=result.profile;
  }
  homeLoginTransfer.remember(raw);
  homeSession={raw};
  user={uid:profile.sub,displayName:profile.name||'已登入',pictureUrl:profile.picture||''};
  needsRenewal=false;
  signal({uid:user.uid,name:user.displayName});
 }
 async function announce(){
  await request('list');
  const p=await liff.getProfile();
  user={uid:p.userId,displayName:p.displayName,pictureUrl:p.pictureUrl};needsRenewal=false;
  signal({uid:user.uid,name:user.displayName});
 }
 async function reconnect(){
  if(installed)return openHomeScreenLogin(true);
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
  login:async()=>{
   if(installed&&!user)return openHomeScreenLogin(needsRenewal);
   await initialize();
   if(needsRenewal)return reconnect();
   if(!liff.isLoggedIn()){if(liff.isInClient())return reconnect();liff.login({redirectUri:location.href});return}
   await announce();
  },
  reconnect,
  logout:async()=>{
   if(homeSession?.raw.startsWith('SH1.'))await request('endHomeSession');
   if(installed)homeLoginTransfer.forget();
   homeSession=null;user=null;signal(null);
   if(installed){location.reload();return}
   if(!liff.isInClient()){if(liff.isLoggedIn())liff.logout();location.reload()}
   else document.getElementById('status').textContent='已登出此頁面';
  },
  api:request
 };
 document.getElementById('cloudLogin').hidden=true;
 if(installed)prepareHomeLogin();
 document.getElementById('resumeHomeLogin').onclick=()=>modal('完成主畫面登入',
  '<p>貼上剛在 Safari 複製的登入接續碼。</p><label for="homeLoginCode">登入接續碼</label><textarea id="homeLoginCode" name="homeLoginCode" class="itinerary-note" rows="2" required></textarea>',
  '完成登入',form=>finishHomeLogin(form.get('homeLoginCode')));
 updateOpenInLine();
 if(installed){
  setInterval(resumeHomeLogin,3000);
  window.addEventListener('focus',resumeHomeLogin);
  window.addEventListener('pageshow',()=>{if(!user)resumeHomeLogin()});

  window.addEventListener('focus',updateOpenInLine);
  window.addEventListener('pageshow',updateOpenInLine);
  document.addEventListener('visibilitychange',()=>{
   if(!document.hidden){updateOpenInLine();resumeHomeLogin()}
  });
 }
 window.addEventListener('load',async()=>{
  try{
   if(!location.hash)try{const pending=sessionStorage.getItem('split-pending-invite');if(pending?.startsWith('#join=')){history.replaceState(null,'',location.pathname+location.search+pending);sessionStorage.removeItem('split-pending-invite')}}catch{}
   updateOpenInLine();
   const saved=installed?homeLoginTransfer.read():null;
   if(saved){await announceHomeSession(saved);return}
   await initialize();
   if((homeLogin==='start'||homeLogin==='renew')&&!liff.isInClient()){
    if(homeLogin==='renew'&&liff.isLoggedIn())liff.logout();
    if(!liff.isLoggedIn()){
     const url=new URL(location.href);
     url.searchParams.set('homeLogin','return');
     liff.login({redirectUri:url.href});
     return;
    }
   }
   if(liff.isLoggedIn()){
    await announce();
    if(homeLogin&&homeKey){
     const code=await homeLoginTransfer.seal(homeKey,token());
     const relay=entry.searchParams.get('homeRelay');
     if(relay){
      try{
       await request('publishHomeLoginRelay',{relay,code});
       modal('LINE 授權完成','<p>請回到剛才開啟的「分帳」。回去後會自動登入。</p>','完成',async()=>{});
       return;
      }catch(e){if(e.code==='line-auth')throw e}
     }
     window.opener?.postMessage({type:'split-home-login',code},entry.origin);
     modal('接續主畫面登入',
      '<p>LINE 授權已完成。複製接續碼後，回 iPhone 主畫面點「分帳」，再點「完成主畫面登入」。</p>'+
      `<label for="homeLoginCopy">登入接續碼</label><textarea id="homeLoginCopy" class="itinerary-note" rows="2" readonly>${code}</textarea>`,
      '複製接續碼',async()=>{
       await navigator.clipboard.writeText(code);
       toast('已複製，請回主畫面的分帳完成登入');
      });
    }
   }
  }catch(e){
   if(e.code==='line-auth')return;
   user=null;signal(null);
   document.getElementById('status').textContent='尚未連線';
   if(typeof toast==='function')toast(e.message||'LINE 連線失敗，請稍後重試');
  }
 });
}

// Activated only after a user-owned LINE verification endpoint has been deployed.
if(window.APP_CONFIG.lineApiBase){
 const cfg=window.APP_CONFIG;let user=null;
 window.WarmCloud={user:()=>user,login:async()=>{await liff.init({liffId:cfg.liffId});if(!liff.isLoggedIn()){liff.login({redirectUri:location.href});return}const p=await liff.getProfile();user={uid:p.userId,displayName:p.displayName};window.dispatchEvent(new CustomEvent('warm-auth',{detail:{uid:user.uid,name:user.displayName}}))},logout:async()=>{user=null;liff.logout();window.dispatchEvent(new CustomEvent('warm-auth',{detail:null}))},api:async(action,data={})=>{const idToken=liff.getIDToken();if(!idToken)throw Error('請先登入 LINE');const r=await fetch(cfg.lineApiBase,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+idToken},body:JSON.stringify({action,...data})});const result=await r.json();if(!r.ok)throw Error(result.error||'雲端操作失敗');return result}};
 document.getElementById('cloudLogin').hidden=true;
 window.addEventListener('load',async()=>{try{await liff.init({liffId:cfg.liffId});if(liff.isLoggedIn())await window.WarmCloud.login()}catch(e){document.getElementById('status').textContent='LINE 連線失敗'}});
}

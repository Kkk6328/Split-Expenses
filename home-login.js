'use strict';
const homeLoginTransfer=(()=>{
 const pendingKey='split-home-login-pending-v1',sessionKey='split-home-line-session-v1';
 const curve={name:'ECDH',namedCurve:'P-256'};
 const encoder=new TextEncoder(),decoder=new TextDecoder();
 const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
 function decode(text){
  if(!/^[A-Za-z0-9_-]+$/.test(text))throw Error('登入接續碼格式錯誤');
  return Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),char=>char.charCodeAt(0));
 }
 function pending(){
  try{
   const saved=JSON.parse(localStorage.getItem(pendingKey)||'null');
   if(saved?.expires>Date.now())return saved;
   if(saved)localStorage.removeItem(pendingKey);
  }catch{}
  return null;
 }
 async function prepare(){
  const pair=await crypto.subtle.generateKey(curve,true,['deriveBits']);
  const privateKey=await crypto.subtle.exportKey('jwk',pair.privateKey);
  const publicKey=encode(await crypto.subtle.exportKey('raw',pair.publicKey));
  const secret=Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('');
  const digest=await crypto.subtle.digest('SHA-256',encoder.encode(secret));
  const relay=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  return {privateKey,publicKey,secret,relay};
 }
 async function keyFor(privateKey,publicKey,iv){
  const publicBytes=decode(publicKey);
  if(publicBytes.length!==65||iv.length!==12)throw Error('登入接續碼格式錯誤');
  const publicCryptoKey=await crypto.subtle.importKey('raw',publicBytes,curve,false,[]);
  const shared=await crypto.subtle.deriveBits({name:'ECDH',public:publicCryptoKey},privateKey,256);
  const material=await crypto.subtle.importKey('raw',shared,'HKDF',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:iv,info:encoder.encode('Split Expenses home login v1')},
   material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 }
 async function seal(publicKey,token){
  const sender=await crypto.subtle.generateKey(curve,true,['deriveBits']);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await keyFor(sender.privateKey,publicKey,iv);
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(token));
  return ['SL1',encode(await crypto.subtle.exportKey('raw',sender.publicKey)),encode(iv),encode(encrypted)].join('.');
 }
 async function unseal(code){
  const saved=pending();
  if(!saved)throw Error('登入接續已逾時，請回主畫面重新按「LINE 登入」。');
  try{
   if(typeof code!=='string'||code.length>14500)throw Error('Invalid code');
   const [version,publicKey,nonce,encrypted,extra]=code.trim().split('.');
   if(version!=='SL1'||!encrypted||extra!==undefined||encrypted.length>14000)throw Error('Invalid code');
   const iv=decode(nonce);
   const privateKey=await crypto.subtle.importKey('jwk',saved.privateKey,curve,false,['deriveBits']);
   const key=await keyFor(privateKey,publicKey,iv);
   return decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv},key,decode(encrypted)));
  }catch{throw Error('登入接續碼無法使用，請確認是這次登入所複製的完整接續碼。')}
 }
 function claims(token){
  const parts=token.split('.');
  if(parts.length!==3)throw Error('LINE 登入資料無效');
  const data=JSON.parse(decoder.decode(decode(parts[1])));
  if(typeof data.sub!=='string'||!data.sub||!Number.isFinite(data.exp))throw Error('LINE 登入資料無效');
  return data;
 }
 return {
  prepare,seal,unseal,claims,pending:()=>!!pending(),
  relaySecret:()=>pending()?.secret,
  start({privateKey,secret}){localStorage.setItem(pendingKey,JSON.stringify({privateKey,secret,expires:Date.now()+10*60*1000}))},
  read:()=>localStorage.getItem(sessionKey),
  remember(token){localStorage.setItem(sessionKey,token);localStorage.removeItem(pendingKey)},
  forget(){localStorage.removeItem(sessionKey)}
 };
})();

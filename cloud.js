import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js';
import {getFirestore,doc,setDoc,getDoc,getDocs,collection,query,where,limit,runTransaction,updateDoc,arrayUnion,Timestamp} from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js';
const cfg=window.APP_CONFIG;
if(cfg.firebase?.projectId){
 const app=initializeApp(cfg.firebase),auth=getAuth(app),db=getFirestore(app);
 const clean=g=>{const {access,owner,joinToken,...data}=g;return data};
 const payload=g=>{const d=clean(g);return JSON.parse(JSON.stringify(d))};
 window.WarmCloud={
  user:()=>auth.currentUser,
  login:async()=>{if(window.liff?.isInClient?.()){const u=new URL(location.href);u.searchParams.set('openExternalBrowser','1');liff.openWindow({url:u.href,external:true});throw Error('請在外部瀏覽器登入 Google，完成後可繼續共用記帳。')}return signInWithPopup(auth,new GoogleAuthProvider())},
  logout:()=>signOut(auth),
  async api(action,b={}){const user=auth.currentUser;if(!user)throw Error('請先登入 Google 以使用免費共用帳本');
   const uid=user.uid;
   if(action==='list'){const s=await getDocs(query(collection(db,'groups'),where('access','array-contains',uid),limit(100)));return {groups:s.docs.map(d=>clean(d.data()))}}
   if(action==='create'){const g={...payload(b.group),cloud:true,version:1};const ref=doc(db,'groups',g.id);await runTransaction(db,async tx=>{if((await tx.get(ref)).exists())throw Error('這本帳本已存在');tx.set(ref,{...g,owner:uid,access:[uid]})});return {group:g}}
   if(action==='save'){const ref=doc(db,'groups',b.group.id);const g=await runTransaction(db,async tx=>{const s=await tx.get(ref);if(!s.exists())throw Error('帳本不存在');const old=s.data();if(old.version!==b.version)throw Error('朋友剛更新了帳本，請按重新同步後再試');const g={...payload(b.group),version:old.version+1,cloud:true};tx.set(ref,{...g,access:old.access,owner:old.owner,...(old.joinToken?{joinToken:old.joinToken}:{})});return g});return {group:g}}
   if(action==='invite'){const ref=doc(db,'groups',b.groupId),s=await getDoc(ref);if(!s.exists()||s.data().owner!==uid)throw Error('只有帳本建立者可以產生邀請');const invite=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');await setDoc(doc(db,'invites',invite),{groupId:b.groupId,owner:uid,expires:Timestamp.fromMillis(Date.now()+7*86400000)});return {invite}}
   if(action==='join'){if(!/^[a-f0-9]{64}$/.test(b.invite))throw Error('邀請連結無效');const s=await getDoc(doc(db,'invites',b.invite));if(!s.exists()||s.data().expires.toMillis()<Date.now())throw Error('邀請已過期');const ref=doc(db,'groups',s.data().groupId);await updateDoc(ref,{access:arrayUnion(uid),joinToken:b.invite});const g=await getDoc(ref);return {group:clean(g.data())}}
   throw Error('未知操作');
  }
 };
 onAuthStateChanged(auth,user=>window.dispatchEvent(new CustomEvent('warm-auth',{detail:user?{name:user.displayName||'夥伴',uid:user.uid}:null})));
 window.dispatchEvent(new Event('warm-cloud-ready'));
}

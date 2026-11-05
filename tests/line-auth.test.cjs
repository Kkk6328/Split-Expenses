const {readFileSync}=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=readFileSync(__dirname+'/../line-cloud.js','utf8');
function setup({expired=false,status=200,inClient=false}={}){
 const events=[],nodes={},calls=[],listeners={};let nowStatus=status;
 const loc={href:'https://kkk6328.github.io/Split-Expenses/#join=abc',hash:'#join=abc',replace:url=>calls.push(['replace',url]),reload:()=>calls.push(['reload'])};
 const context={window:{APP_CONFIG:{lineApiBase:'https://backend.test',liffId:'test-id'},dispatchEvent:e=>events.push(e),addEventListener:(n,f)=>listeners[n]=f},document:{getElementById:id=>nodes[id]||(nodes[id]={})},CustomEvent:class{constructor(type,options){this.type=type;Object.assign(this,options)}},liff:{init:async()=>{},getIDToken:()=> 'opaque-token',getDecodedIDToken:()=>({exp:Date.now()/1000+(expired?-1:3600)}),getProfile:async()=>({userId:'A',displayName:'Alice'}),isLoggedIn:()=>true,isInClient:()=>inClient,logout:()=>calls.push(['logout']),login:x=>calls.push(['login',x])},location:loc,sessionStorage:{setItem:(k,v)=>calls.push(['session',k,v])},URL,Date,fetch:async(url,req)=>{calls.push(['fetch',JSON.parse(req.body).action]);return{status:nowStatus,ok:nowStatus===200,json:async()=>nowStatus===200?{groups:[]}:{error:'rejected'}}}};
 vm.createContext(context);vm.runInContext(source,context);return{...context,events,nodes,calls,listeners,setStatus:x=>nowStatus=x};
}
(async()=>{
 let s=setup();await s.listeners.load();assert.equal(s.window.WarmCloud.user().uid,'A');
 s.setStatus(401);await assert.rejects(s.window.WarmCloud.api('create',{group:{}}),e=>e.code==='line-auth');assert.equal(s.window.WarmCloud.user(),null);assert.equal(s.calls.filter(x=>x[0]==='fetch'&&x[1]==='create').length,1);assert.equal(s.nodes.login.textContent,'重新登入 LINE');await s.window.WarmCloud.login();assert.equal(s.calls.filter(x=>x[0]==='logout').length,1);assert.equal(s.calls.filter(x=>x[0]==='login').length,1);
 s=setup({expired:true});await s.listeners.load();assert.equal(s.window.WarmCloud.user(),null);assert.equal(s.calls.filter(x=>x[0]==='fetch').length,0);
 s=setup({status:500});await s.listeners.load();assert.equal(s.window.WarmCloud.user(),null);assert(!s.events.some(e=>e.detail?.uid));
 s=setup({inClient:true});await s.listeners.load();await s.window.WarmCloud.reconnect();assert.equal(s.calls.filter(x=>x[0]==='login'||x[0]==='logout').length,0);assert(s.calls.some(x=>x[0]==='replace'&&x[1].startsWith('https://liff.line.me/test-id?renew=')));assert(s.calls.some(x=>x[0]==='session'&&x[2]==='#join=abc'));
 console.log('PASS: verify before sign-in UI, expired token precheck, 401 clears auth, no write replay, external re-login, LIFF reopen and invitation preservation');
})().catch(e=>{console.error(e);process.exitCode=1});

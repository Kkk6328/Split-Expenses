const fail=(s,n=400)=>{throw Object.assign(Error(s),{status:n})};
const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(x);
export function validate(g){if(!g||!validId(g.id)||typeof g.name!=='string'||!g.name.trim()||g.name.length>60||!Array.isArray(g.members)||!g.members.length||g.members.length>30||!Array.isArray(g.expenses)||g.expenses.length>1000||!Array.isArray(g.settlements)||g.settlements.length>1000)fail('帳本格式錯誤');const ids=g.members.map(m=>m.id);if(new Set(ids).size!==ids.length||g.members.some(m=>!validId(m.id)||typeof m.name!=='string'||!m.name||m.name.length>40))fail('成員格式錯誤');for(const e of g.expenses){if(!validId(e.id)||typeof e.title!=='string'||!e.title||e.title.length>80||!Number.isFinite(e.amount)||e.amount<=0||!Number.isFinite(e.rate)||e.rate<=0||!Number.isSafeInteger(e.baseCents)||e.baseCents<1||e.baseCents!==Math.round(e.amount*e.rate*100)||!ids.includes(e.payer)||!Array.isArray(e.split)||!e.split.length||new Set(e.split).size!==e.split.length||e.split.some(id=>!ids.includes(id)))fail('費用格式錯誤')}for(const s of g.settlements)if(!validId(s.id)||!ids.includes(s.from)||!ids.includes(s.to)||s.from===s.to||!Number.isSafeInteger(s.amount)||s.amount<=0)fail('還款格式錯誤');if(JSON.stringify(g).length>500000)fail('帳本容量已滿')}
function applyLineProfile(member, verified) {
 const displayName=typeof verified.name==='string'?verified.name.trim().slice(0,40):'';
 if(!displayName)return;
 member.lineName=displayName;
 const picture=typeof verified.picture==='string'?verified.picture:'';
 if(picture.length<=2048&&/^https:\/\/profile\.line-scdn\.net\/[a-zA-Z0-9_/?&=.%+~-]+$/.test(picture))member.linePicture=picture;
 else delete member.linePicture;
}
async function itinerary(db, bookId, user, body){
 // Keep notes outside the shared book payload. D1 returns private notes only to their author.
 await db.prepare(`CREATE TABLE IF NOT EXISTS book_itinerary (
  book_id TEXT NOT NULL, id TEXT NOT NULL, author TEXT NOT NULL,
  date TEXT NOT NULL, time TEXT NOT NULL, place TEXT NOT NULL,
  note TEXT NOT NULL, private_note INTEGER NOT NULL, revision TEXT NOT NULL,
  PRIMARY KEY (book_id, id)
 )`).run();
 if(body.action==='listItinerary'){
  const {results}=await db.prepare(`SELECT id, date, time, place,
   CASE WHEN private_note=0 OR author=?1 THEN note ELSE '' END AS note,
   CASE WHEN author=?1 THEN private_note ELSE 0 END AS privateNote,
   author=?1 AS canEdit, CASE WHEN author=?1 THEN revision ELSE '' END AS revision
   FROM book_itinerary WHERE book_id=?2
   ORDER BY date, time='', time, id`).bind(user,bookId).all();
  return {items:results.map(item=>({...item,privateNote:!!item.privateNote,canEdit:!!item.canEdit}))};
 }

 const {id,revision}=body;
 if(!validId(id)||typeof revision!=='string'||(revision!==''&&!validId(revision)))fail('行程編號無效');
 if(body.action==='deleteItinerary'){
  const result=await db.prepare(`DELETE FROM book_itinerary
   WHERE book_id=? AND id=? AND author=? AND revision=?`).bind(bookId,id,user,revision).run();
  if(!result.meta.changes)fail('行程已變更或無權限，請重新載入',409);
  return {ok:true};
 }

 const {date,time,privateNote}=body;
 const place=typeof body.place==='string'?body.place.trim():'';
 const note=typeof body.note==='string'?body.note.trim():null;
 const parsed=typeof date==='string'?new Date(date+'T00:00:00Z'):null;
 if(!parsed||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(+parsed)||parsed.toISOString().slice(0,10)!==date
  ||typeof time!=='string'||(time!==''&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
  ||!place||place.length>120||note===null||note.length>1000||typeof privateNote!=='boolean')fail('請確認行程的日期、時間、地點與備註');
 const nextRevision=crypto.randomUUID();
 const values=[date,time,place,note,Number(privateNote),nextRevision];
 if(!revision){
  const result=await db.prepare(`INSERT OR IGNORE INTO book_itinerary
   (book_id,id,author,date,time,place,note,private_note,revision) VALUES(?,?,?,?,?,?,?,?,?)`)
   .bind(bookId,id,user,...values).run();
  if(result.meta.changes)return {ok:true};
  const prior=await db.prepare(`SELECT 1 AS same FROM book_itinerary WHERE book_id=? AND id=? AND author=?
   AND date=? AND time=? AND place=? AND note=? AND private_note=?`).bind(bookId,id,user,...values.slice(0,5)).first();
  if(prior)return {ok:true};
 }else{
  const result=await db.prepare(`UPDATE book_itinerary SET date=?,time=?,place=?,note=?,private_note=?,revision=?
   WHERE book_id=? AND id=? AND author=? AND revision=?`).bind(...values,bookId,id,user,revision).run();
  if(result.meta.changes)return {ok:true};
 }
 fail('行程已變更或無權限，請重新載入',409);
}
function payload(g){const {canDelete,owner,access,joinToken,...rest}=g;return rest}
export default {async fetch(req,env){const headers={'Access-Control-Allow-Origin':env.APP_ORIGIN,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Content-Type':'application/json','Cache-Control':'no-store'};const reply=(o,status=200)=>new Response(JSON.stringify(o),{status,headers});if(req.method==='OPTIONS')return new Response(null,{status:204,headers});if(req.method!=='POST')return reply({error:'Method not allowed'},405);try{if(req.headers.get('Origin')&&req.headers.get('Origin')!==env.APP_ORIGIN)fail('來源不允許',403);const raw=await req.text();if(raw.length>750000)fail('資料過大',413);const b=JSON.parse(raw);const token=req.headers.get('Authorization')?.replace(/^Bearer /,'');if(!token||token.length>10000)fail('請登入 LINE',401);const verification=await fetch('https://api.line.me/oauth2/v2.1/verify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id_token:token,client_id:env.LINE_CHANNEL_ID})});const v=await verification.json();if(!verification.ok||!v.sub)fail('LINE 登入已過期，請重新登入',401);const user=v.sub,db=env.DB;const output=r=>({...JSON.parse(r.data),version:r.version,cloud:true,canDelete:r.owner===user});const load=async id=>{if(!validId(id))fail('帳本編號無效');const r=await db.prepare('SELECT b.* FROM books b JOIN memberships m ON m.book_id=b.id WHERE b.id=? AND m.user_id=?').bind(id,user).first();if(!r)fail('無權存取帳本',403);return r};
if(['listItinerary','saveItinerary','deleteItinerary'].includes(b.action)){
 const book=await load(b.groupId);
 if(JSON.parse(book.data).deletedAt)fail('帳本已刪除',403);
 return reply(await itinerary(db,book.id,user,b));
}
if(b.action==='capabilities')return reply({membershipVersion:3,mediaVersion:1,paymentVersion:2});
if(['getExpenseImages','saveExpenseImages','getPayment','savePayment'].includes(b.action)){
 const r=await load(b.groupId),g=JSON.parse(r.data);if(g.deletedAt)fail('帳本已刪除',403);
 const payment=b.action.endsWith('Payment'),writing=b.action.startsWith('save');
 const target=payment?g.members.find(m=>m.id===b.memberId):g.expenses.find(e=>e.id===b.expenseId);
 if(!target)fail(payment?'成員不存在':'費用不存在',404);
 if(payment&&writing&&target.id!==user&&target.lineUserId!==user)fail('只能設定自己的收款資訊',403);
 const imageOK=x=>typeof x==='string'&&x.length<=220000&&/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(x);
 let data;
 if(writing){
  if(payment){
 if(!Array.isArray(b.accounts)||b.accounts.length>10)fail('最多可設定 10 組銀行帳號');
 const accounts=b.accounts.map(x=>{if(!x||typeof x.bankCode!=='string'||!/^\d{3}$/.test(x.bankCode)||typeof x.account!=='string'||!/^\d{5,20}$/.test(x.account)||typeof x.name!=='string'||x.name.length>40)fail('銀行碼須為 3 碼，帳號須為 5～20 位數字');return {name:x.name.trim(),bankCode:x.bankCode,account:x.account}});
 if(new Set(accounts.map(x=>x.bankCode+':'+x.account)).size!==accounts.length)fail('請勿重複新增相同帳號');
 data={accounts};
 }else{if(!Array.isArray(b.images)||b.images.length>3||b.images.some(x=>!imageOK(x)))fail('最多 3 張圖片，每張須為壓縮後的 JPEG');data={images:b.images};}
 }
 await db.prepare('CREATE TABLE IF NOT EXISTS book_media(book_id TEXT NOT NULL,kind TEXT NOT NULL,target_id TEXT NOT NULL,data TEXT NOT NULL,revision TEXT NOT NULL,PRIMARY KEY(book_id,kind,target_id))').run();
 const kind=payment?'payment':'expense',id=target.id;
 const old=await db.prepare('SELECT data,revision FROM book_media WHERE book_id=? AND kind=? AND target_id=?').bind(r.id,kind,id).first();
 if(!writing)return reply({...old?JSON.parse(old.data):payment?{link:'',qr:''}:{images:[]},revision:old?.revision||''});
 if((old?.revision||'')!==b.revision)fail('圖片或收款資訊已更新，請關閉後重新開啟',409);
 const revision=crypto.randomUUID();let result;
 if(old)result=await db.prepare('UPDATE book_media SET data=?,revision=? WHERE book_id=? AND kind=? AND target_id=? AND revision=?').bind(JSON.stringify(data),revision,r.id,kind,id,b.revision).run();
 else result=await db.prepare('INSERT OR IGNORE INTO book_media(book_id,kind,target_id,data,revision) VALUES(?,?,?,?,?)').bind(r.id,kind,id,JSON.stringify(data),revision).run();
 if(!result.meta.changes)fail('資料已更新，請重新開啟',409);
 return reply({ok:true,revision});
}
if(b.action==='list'){const r=await db.prepare('SELECT b.* FROM books b JOIN memberships m ON m.book_id=b.id WHERE m.user_id=? LIMIT 100').bind(user).all();return reply({groups:r.results.map(output)})}
if(b.action==='create'){const incoming=payload(b.group);incoming.members=incoming.members?.map(m=>({id:m.id,name:m.name}));const self={id:user,name:String(v.name||'LINE 成員').slice(0,40)};if(!incoming.expenses?.length&&!incoming.settlements?.length)incoming.members=[self];else if(!incoming.members?.some(m=>m.id===user))incoming.members=[...(incoming.members||[]),self];applyLineProfile(incoming.members.find(m=>m.id===user),v);validate(incoming);const g={...incoming,cloud:true,version:1};await db.batch([db.prepare('INSERT INTO books(id,owner,version,data) VALUES(?,?,1,?)').bind(g.id,user,JSON.stringify(g)),db.prepare('INSERT INTO memberships(book_id,user_id) VALUES(?,?)').bind(g.id,user)]);return reply({group:{...g,canDelete:true}})}
if(b.action==='save'){validate(b.group);const old=await load(b.group.id),prior=JSON.parse(old.data);if(JSON.stringify(prior.members)!==JSON.stringify(b.group.members))fail('成員只能透過 LINE 邀請加入，請先同步帳本',403);if((prior.deletedAt||null)!==(b.group.deletedAt||null)&&old.owner!==user)fail('只有建立者可以刪除或還原',403);const g={...payload(b.group),cloud:true,version:old.version+1};const r=await db.prepare('UPDATE books SET version=version+1,data=? WHERE id=? AND version=?').bind(JSON.stringify(g),g.id,b.version).run();if(!r.meta.changes)fail('帳本已更新，請同步後再試',409);return reply({group:{...g,canDelete:old.owner===user}})}
if(b.action==='invite'){const r=await load(b.groupId);if(r.owner!==user||JSON.parse(r.data).deletedAt)fail('僅建立者可邀請成員',403);const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');await db.prepare('INSERT INTO invites(token,book_id) VALUES(?,?)').bind(token,r.id).run();return reply({invite:token})}
if(b.action==='revokeInvites'){const r=await load(b.groupId);if(r.owner!==user)fail('僅建立者可停用邀請',403);await db.prepare('UPDATE invites SET revoked=1 WHERE book_id=?').bind(r.id).run();return reply({ok:true})}
if(b.action==='addMember'){const r=await load(b.groupId);if(r.owner!==user)fail('只有建立者可以預設成員',403);const g=JSON.parse(r.data);if(g.deletedAt)fail('帳本已刪除');const name=typeof b.name==='string'?b.name.trim():'';if(!name||name.length>40||g.members.some(m=>m.name===name))fail('請輸入不重複的成員暱稱');g.members.push({id:crypto.randomUUID(),name});validate(g);const changed=await db.prepare('UPDATE books SET version=version+1,data=? WHERE id=? AND version=?').bind(JSON.stringify(g),r.id,r.version).run();if(!changed.meta.changes)fail('帳本已更新，請同步後重試',409);return reply({group:output(await load(r.id))})}
if(b.action==='join'||b.action==='previewInvite'){
 if(typeof b.invite!=='string'||!/^[a-f0-9]{64}$/.test(b.invite))fail('邀請無效');
 for(let attempt=0;attempt<5;attempt++){
 const r=await db.prepare('SELECT b.* FROM books b JOIN invites i ON i.book_id=b.id WHERE i.token=? AND i.revoked=0').bind(b.invite).first();
 if(!r||JSON.parse(r.data).deletedAt)fail('邀請已停用或帳本已刪除',403);
 const g=JSON.parse(r.data),existing=await db.prepare('SELECT 1 AS found FROM memberships WHERE book_id=? AND user_id=?').bind(r.id,user).first();
 const mine=g.members.find(m=>m.id===user||m.lineUserId===user);
 if(b.action==='previewInvite')return reply({name:g.name,alreadyJoined:!!existing,roles:g.members.filter(m=>!m.lineUserId&&!/^U[0-9a-f]{32}$/.test(m.id)&&m.id!==r.owner).map(m=>({id:m.id,name:m.name}))});
 if(existing&&mine){
  const before=JSON.stringify(mine);
  applyLineProfile(mine,v);
  if(JSON.stringify(mine)===before)return reply({group:output(r)});
 }else{
 if(b.memberId){const role=g.members.find(m=>m.id===b.memberId);if(!role||role.lineUserId||/^U[0-9a-f]{32}$/.test(role.id)||role.id===r.owner)fail('此角色已被認領，請重新開啟邀請',409);role.lineUserId=user}
 else if(g.members.some(m=>!m.lineUserId&&!/^U[0-9a-f]{32}$/.test(m.id)&&m.id!==r.owner))fail('請先選擇自己的角色');
 if(!g.members.some(m=>m.id===user||m.lineUserId===user)){if(g.members.length>=30)fail('帳本成員已達上限');g.members.push({id:user,name:String(v.name||'LINE 成員').slice(0,40)})}
 applyLineProfile(g.members.find(m=>m.id===user||m.lineUserId===user),v);
 }
 g.version=r.version+1;validate(g);
 const result=await db.batch([
 db.prepare('UPDATE books SET version=version+1,data=? WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM invites WHERE token=? AND book_id=? AND revoked=0)').bind(JSON.stringify(g),r.id,r.version,b.invite,r.id),
 db.prepare("INSERT OR IGNORE INTO memberships(book_id,user_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM books b,json_each(b.data,'$.members') m WHERE b.id=? AND (json_extract(m.value,'$.id')=? OR json_extract(m.value,'$.lineUserId')=?)) AND EXISTS(SELECT 1 FROM invites WHERE token=? AND book_id=? AND revoked=0)").bind(r.id,user,r.id,user,user,b.invite,r.id)
 ]);
 if(result[0].meta.changes){return reply({group:output(await load(r.id))})}
 }
 fail('帳本正在更新，請稍後再加入',409)
}fail('未知操作')
}catch(e){return reply({error:e.status?e.message:'操作失敗，請稍後再試'},e.status||500)}}};


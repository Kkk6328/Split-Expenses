import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import worker from '../line-backend/worker.js';

test('itinerary uses book membership, protects private notes and checks author revisions', async t => {
 const sqlite=new DatabaseSync(':memory:');
 t.after(()=>sqlite.close());
 sqlite.exec(await readFile(new URL('../line-backend/schema.sql',import.meta.url),'utf8'));
 sqlite.exec(`INSERT INTO books VALUES ('trip','owner',1,'{}'),('deleted','owner',1,'{"deletedAt":123}');
  INSERT INTO memberships VALUES ('trip','owner'),('trip','friend'),('deleted','owner');`);
 const env={APP_ORIGIN:'https://example.test',LINE_CHANNEL_ID:'channel',DB:{
  prepare(sql){
   const stmt=sqlite.prepare(sql);
   return {bind(...values){return bind(values)},...bind([])};
   function bind(values){
    const params=sql.includes('?1')?[Object.fromEntries(values.map((value,index)=>['?'+(index+1),value]))]:values;
    return {
     first:()=>stmt.get(...params),
     all:()=>({results:stmt.all(...params)}),
     run:()=>({meta:{changes:stmt.run(...params).changes}})
    };
   }
  }
 }};
 t.mock.method(globalThis,'fetch',async (url,init)=>{
  assert.equal(url,'https://api.line.me/oauth2/v2.1/verify');
  return Response.json({sub:init.body.get('id_token')});
 });
 async function api(user,action,fields={},status=200){
  const req=new Request(env.APP_ORIGIN,{method:'POST',headers:{Authorization:'Bearer '+user},
   body:JSON.stringify({action,groupId:'trip',...fields})});
  const response=await worker.fetch(req,env);
  const payload=await response.json();
  assert.equal(response.status,status,JSON.stringify(payload));
  return payload;
 }
 const record={id:'stop',revision:'',date:'2026-12-02',time:'16:00',place:'廣藏市場',
  note:'只有作者知道',privateNote:true};
 await api('owner','saveItinerary',{...record,date:'2026-02-30'},400);
 await api('owner','saveItinerary',record);
 await api('owner','saveItinerary',record);
 const {items:[own]}=await api('owner','listItinerary');
 assert.equal(own.personalNote,record.note);
 assert.equal(own.sharedNote,'');
 assert.equal(own.privateNote,true);
 assert.equal(own.canEdit,true);
 const {items}=await api('friend','listItinerary');
 assert.deepEqual(items,[{id:'stop',date:record.date,time:record.time,place:record.place,
  sharedNote:'',personalNote:'',note:'',privateNote:false,canEdit:false,revision:''}]);
 await api('outsider','listItinerary',{},403);
 await api('owner','listItinerary',{groupId:'deleted'},403);
 await api('friend','saveItinerary',{...record,revision:own.revision},409);
 await api('friend','deleteItinerary',{id:record.id,revision:own.revision},409);
 await api('owner','saveItinerary',{...record,revision:own.revision,privateNote:false});
 const {items:[shared]}=await api('friend','listItinerary');
 assert.equal(shared.sharedNote,record.note);
 assert.equal(shared.personalNote,'');
 const {items:[legacy]}=await api('owner','listItinerary');
 const {note,privateNote,...stop}=record;
 const dual={...stop,revision:legacy.revision,sharedNote:'大家都看得到',personalNote:'只給自己'};
 await api('owner','saveItinerary',{...dual,personalNote:'字'.repeat(1001)},400);
 await api('owner','saveItinerary',dual);
 const {items:[updated],notesVersion}=await api('owner','listItinerary');
 assert.equal(notesVersion,2);
 assert.equal(updated.sharedNote,dual.sharedNote);
 assert.equal(updated.personalNote,dual.personalNote);
 const {items:[publicView]}=await api('friend','listItinerary');
 assert.equal(publicView.sharedNote,dual.sharedNote);
 assert.equal(publicView.personalNote,'');
 assert.equal(JSON.stringify(publicView).includes(dual.personalNote),false);
 await api('friend','saveItinerary',{...dual,revision:updated.revision},409);
 await api('owner','saveItinerary',{...record,revision:updated.revision},409);
 await api('owner','deleteItinerary',{id:record.id,revision:legacy.revision},409);
 await api('owner','saveItinerary',{...dual,revision:updated.revision,sharedNote:''});
 const {items:[privateOnly]}=await api('owner','listItinerary');
 assert.equal(privateOnly.sharedNote,'');
 assert.equal(privateOnly.personalNote,dual.personalNote);
 await api('owner','deleteItinerary',{id:record.id,revision:privateOnly.revision});
 assert.deepEqual(await api('friend','listItinerary'),{items:[],notesVersion:2});
});

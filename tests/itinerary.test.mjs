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
 assert.equal(own.note,record.note);
 assert.equal(own.privateNote,true);
 assert.equal(own.canEdit,true);
 const {items}=await api('friend','listItinerary');
 assert.deepEqual(items,[{id:'stop',date:record.date,time:record.time,place:record.place,
  note:'',privateNote:false,canEdit:false,revision:''}]);
 await api('outsider','listItinerary',{},403);
 await api('owner','listItinerary',{groupId:'deleted'},403);
 await api('friend','saveItinerary',{...record,revision:own.revision},409);
 await api('friend','deleteItinerary',{id:record.id,revision:own.revision},409);
 await api('owner','saveItinerary',{...record,revision:own.revision,privateNote:false});
 const {items:[shared]}=await api('friend','listItinerary');
 assert.equal(shared.note,record.note);
 await api('owner','deleteItinerary',{id:record.id,revision:own.revision},409);
 const {items:[updated]}=await api('owner','listItinerary');
 await api('owner','deleteItinerary',{id:record.id,revision:updated.revision});
 assert.deepEqual(await api('friend','listItinerary'),{items:[]});
});

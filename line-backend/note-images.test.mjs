import worker from './worker.js';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
const file=mkdtempSync(tmpdir()+'/split-test-')+'/db.sqlite';
const python="import sqlite3,json,sys\nc=sqlite3.connect(sys.argv[1]);c.row_factory=sqlite3.Row\nout=[]\nfor q in json.load(sys.stdin):\n r=c.execute(q['sql'],q.get('args',[]));out.append({'results':[dict(x) for x in r.fetchall()],'meta':{'changes':max(r.rowcount,0)}})\nc.commit();print(json.dumps(out))";
function query(qs){const p=spawnSync('python',['-c',python,file],{input:JSON.stringify(qs),encoding:'utf8'});if(p.status)throw Error(p.stderr);return JSON.parse(p.stdout)}
query([{sql:'CREATE TABLE books(id TEXT PRIMARY KEY, owner TEXT, version INTEGER, data TEXT)'},{sql:'CREATE TABLE memberships(book_id TEXT,user_id TEXT,PRIMARY KEY(book_id,user_id))'},{sql:'CREATE TABLE invites(token TEXT PRIMARY KEY,book_id TEXT,revoked INTEGER DEFAULT 0)'}]);
const db={prepare(sql){return{sql,args:[],bind(...args){this.args=args;return this},async first(){return query([this])[0].results[0]||null},async all(){return query([this])[0]},async run(){return query([this])[0]}}},async batch(qs){return query(qs)}};
globalThis.fetch=async (_url,req)=>{const token=new URLSearchParams(req.body).get('id_token');return new Response(JSON.stringify(token==='bad'?{}:{sub:token,name:'Name '+token}),{status:token==='bad'?401:200})};
async function api(user,action,data={}){const r=await worker.fetch(new Request('https://test/',{method:'POST',headers:{Authorization:'Bearer '+user,Origin:'https://site.test'},body:JSON.stringify({action,...data})}),{APP_ORIGIN:'https://site.test',LINE_CHANNEL_ID:'test',DB:db});return{status:r.status,...await r.json()}}
const base=id=>({id,name:id,members:[{id:'fake',name:'Fake'}],expenses:[],settlements:[],created:'2026-11-05'});

const image='data:image/jpeg;base64,/9j/'+'A'.repeat(51996);
const note=i=>({id:'note'+i,title:'商品 '+i,category:'購物',images:[image]});
const initial={...base('A'),bookNotes:Array.from({length:9},(_,i)=>note(i))};
const created=(await api('Alice','create',{group:initial})).group;
assert.equal(created.bookNotes.length,9);
const incoming={...created,bookNotes:[...created.bookNotes,note(9)]};
assert.equal((await api('Alice','save',{group:incoming,version:created.version})).status,400);
const saved=await api('Alice','save',{group:incoming,version:created.version,separateNoteImages:true});
assert.equal(saved.status,200,saved.error);
assert.equal(saved.group.bookNotes.length,10);
assert(saved.group.bookNotes.every(n=>n.imageCount===1&&!n.images));
assert.equal((await api('Carol','getNoteImages',{groupId:'A',noteId:'note0'})).status,403);
const member=(await api('Alice','addMember',{groupId:'A',name:'小安'})).group.members.find(m=>m.name==='小安');
const invite=(await api('Alice','invite',{groupId:'A'})).invite;
const joined=await api('Bob','join',{invite,memberId:member.id});
assert.equal(joined.status,200,joined.error);
const args={groupId:'A',noteId:'note0'};
assert.deepEqual((await api('Bob','getNoteImages',args)).images,[image]);
const book=(await api('Alice','list')).groups[0];
const edited={...book,bookNotes:book.bookNotes.map(n=>n.id==='note0'?{...n,images:[]}:n)};
assert.equal((await api('Alice','save',{group:edited,version:book.version,separateNoteImages:true})).status,200);
assert.equal((await api('Alice','save',{group:book,version:book.version,separateNoteImages:true})).status,409);
assert.deepEqual((await api('Bob','getNoteImages',args)).images,[]);
assert.equal((await api('Bob','getNoteImages',{...args,noteId:'note1'})).images.length,1);

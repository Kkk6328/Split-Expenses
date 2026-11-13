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

await api('Alice','create',{group:base('A')});
const started=await api('Alice','startHomeSession');
assert.equal(started.status,200);
assert.match(started.session,/^SH1\.[0-9a-f]{64}$/);
assert.equal((await api(started.session,'list')).groups[0].id,'A');
assert.equal((await api(started.session,'startHomeSession')).status,400);
const rows=query([{sql:'SELECT hash,created,expires FROM home_sessions'}])[0].results;
assert.notEqual(rows[0].hash,started.session);
const now=Date.now;
try{
 Date.now=()=>rows[0].created+25*86400000;
 assert.equal((await api(started.session,'getHomeSession')).profile.sub,'Alice');
 Date.now=()=>rows[0].created+35*86400000;
 assert.equal((await api(started.session,'list')).status,200);
}finally{Date.now=now}
assert.equal((await api(started.session,'endHomeSession')).status,200);
assert.equal((await api(started.session,'list')).status,401);

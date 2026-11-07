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


const a=(await api('Alice','create',{group:base('A')})).group;
const accounts=[{name:'第一組',bankCode:'013',account:'00123456789'},{name:'第二組',bankCode:'004',account:'00012345'}];
assert.equal((await api('Alice','savePayment',{groupId:'A',memberId:'Alice',accounts,revision:''})).status,200);
const p=await api('Alice','getPayment',{groupId:'A',memberId:'Alice'});assert.deepEqual(p.accounts,accounts);
assert.equal((await api('Bob','getPayment',{groupId:'A',memberId:'Alice'})).status,403);
assert.equal((await api('Alice','savePayment',{groupId:'A',memberId:'Alice',accounts:[accounts[0],accounts[0]],revision:p.revision})).status,400);
assert.equal((await api('Alice','savePayment',{groupId:'A',memberId:'Alice',accounts:[{...accounts[0],bankCode:'13'}],revision:p.revision})).status,400);
assert.equal((await api('Alice','savePayment',{groupId:'A',memberId:'Alice',accounts:[],revision:''})).status,409);
assert.equal((await api('Alice','savePayment',{groupId:'A',memberId:'Alice',accounts:[],revision:p.revision})).status,200);
console.log('PASS: multiple accounts, leading zeros, access control, duplicate/invalid account rejection, revision conflict and removal');

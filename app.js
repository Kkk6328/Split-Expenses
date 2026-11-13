'use strict';
function expenseDays(expenses){const days=new Map();for(const e of [...expenses].sort((a,b)=>b.date.localeCompare(a.date)||b.created-a.created)){if(!days.has(e.date))days.set(e.date,{date:e.date,expenses:[],total:0});const day=days.get(e.date);day.expenses.push(e);day.total+=e.baseCents}return [...days.values()]}
const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),uid=()=>crypto.randomUUID(),money=n=>new Intl.NumberFormat('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100);
const storageKey=window.APP_CONFIG?.lineApiBase?'split-line-v1':'warm-split-v1';let state;try{state=JSON.parse(localStorage.getItem(storageKey));if(!state&&window.APP_CONFIG?.lineApiBase){const old=JSON.parse(localStorage.getItem('warm-split-v1')||'null');if(old)state={groups:old.groups.filter(g=>!g.cloud),current:null}}}catch{}state=state||{groups:[],current:null};let tab='expenses',profile=null,ready=false,openedBook='',itineraryView=null,itineraryDay='';
const cfg=window.APP_CONFIG||{},activeGroups=()=>state.groups.filter(g=>!g.deletedAt&&(!cfg.lineApiBase||(cloud()&&g.cloud))),group=()=>activeGroups().find(g=>g.id===state.current),cloud=()=>!!window.WarmCloud?.user(),today=()=>new Date().toLocaleDateString('en-CA');
function toast(s){$('toast').textContent=s;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',4000)}
function persist(){
 // LINE books are loaded from the server on sign-in. Keep local books in the cache.
 const cached=cfg.lineApiBase?{...state,groups:state.groups.filter(g=>!g.cloud)}:state;
 localStorage.setItem(storageKey,JSON.stringify(cached));
}
function showAuthRecovery(message){const box=$('formError');box.textContent=message;const button=document.createElement('button');button.type='button';button.className='quiet';button.textContent='重新登入 LINE';button.onclick=()=>window.WarmCloud.reconnect().catch(e=>{box.textContent=e.message});box.append(document.createElement('br'),button)}
async function api(action,data={}){if(!window.WarmCloud)throw Error('雲端模組尚未載入，請稍後再試');try{return await window.WarmCloud.api(action,data)}catch(e){if(e.code==='resource-exhausted')throw Error('今日免費額度已用完，請稍後再試；不會自動收費');if(e.code==='permission-denied')throw Error('沒有權限，或 Firebase 共用規則尚未發布');throw e}}
async function save(g,options={}){if(g.cloud){if(!cloud())throw Error(cfg.lineApiBase?'請先登入 LINE 再更新共用帳本':'請先登入 Google 再更新共用帳本');const r=await api('save',{group:g,version:g.version,...options});Object.assign(g,r.group)}persist();render()}
function modal(title,html,submit,callback,onSaved){
 const dialog=$('modal'),form=$('form'),button=$('submit');
 $('dialogTitle').textContent=title;
 $('fields').innerHTML=html;
 button.textContent=submit;
 $('formError').textContent='';
 const submitForm=async event=>{
  event.preventDefault();
  if(button.disabled)return;
  button.disabled=true;
  const isCurrent=()=>dialog.open&&form.onsubmit===submitForm;
  try{
   await callback(new FormData(form));
   if(isCurrent()){
    if(onSaved)onSaved();
    else dialog.close();
   }
  }catch(error){
   if(isCurrent()){
    if(error.code==='line-auth')showAuthRecovery(error.message);
    else $('formError').textContent=error.message;
   }
  }finally{
   button.disabled=false;
  }
 };
 form.onsubmit=submitForm;
 dialog.showModal();
}
const field=(name,label,value='',type='text',extra='')=>`<label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}>`;
function newGroup(){let draft=null;try{draft=JSON.parse(sessionStorage.getItem('split-create-draft'))}catch{}const owner=window.WarmCloud?.user()?.uid;if(cfg.lineApiBase&&!cloud()){window.WarmCloud?.login().catch(e=>toast(e.message));return}modal('建立帳本',field('name','帳本名稱',draft&&draft.owner===owner?draft.name:'','text','required maxlength="60" placeholder="例如：首爾旅行"')+(cfg.lineApiBase?'<p class="hint">建立後自動加入你的 LINE 帳號，其他成員須透過此帳本的邀請連結加入。</p>':field('members','成員暱稱（用逗號分開）',profile?.displayName||'我','text','required maxlength="300" placeholder="喬喬、小安"'))+'<p class="hint">結算幣別：TWD 新台幣。每筆外幣費用都可以輸入自己的匯率。</p>','建立帳本',async f=>{if(cfg.lineApiBase&&!cloud())throw Object.assign(Error('請重新登入 LINE，再建立帳本。'),{code:'line-auth'});const names=cfg.lineApiBase?[(window.WarmCloud.user().displayName||'LINE 成員').slice(0,40)]:[...new Set(f.get('members').split(/[,，、]/).map(s=>s.trim()).filter(Boolean))];if(!names.length||names.length>30||names.some(n=>n.length>40))throw Error('請輸入 1～30 位成員');let g={id:uid(),name:f.get('name').trim(),members:names.map(name=>({id:cfg.lineApiBase?window.WarmCloud.user().uid:uid(),name})),expenses:[],settlements:[],created:today(),cloud:false};if(!g.name)throw Error('請填寫帳本名稱');if(cloud()){const r=await api('create',{group:g});g=r.group}state.groups.push(g);state.current=g.id;persist();render();toast('帳本已建立');try{sessionStorage.removeItem('split-create-draft')}catch{}});$('f-name').oninput=()=>{try{sessionStorage.setItem('split-create-draft',JSON.stringify({owner,name:$('f-name').value}))}catch{}}}
function allocations(e){const total=e.baseCents,n=e.split.length,q=Math.floor(total/n),r=total%n;return e.split.map((id,i)=>({id,amount:q+(i<r?1:0)}))}

function signedInMember(book){
 const userId=window.WarmCloud?.user()?.uid;
 return userId?book.members.find(member=>member.id===userId||member.lineUserId===userId):undefined;
}
function personalExpenseTotal(book,memberId){
 return book.expenses.reduce((sum,expense)=>sum+(allocations(expense).find(share=>share.id===memberId)?.amount??0),0);
}

function balanceItems(book){
 const items=new Map(book.members.map(member=>[member.id,[]]));
 const titles=new Map(book.expenses.map(expense=>[expense.id,expense.title]));
 for(const expense of book.expenses){
  const shares=allocations(expense);
  const own=shares.find(share=>share.id===expense.payer)?.amount||0;
  items.get(expense.payer).push({kind:'expense',expenseId:expense.id,title:expense.title,date:expense.date,description:'代墊總額扣除自己的分攤',amount:expense.baseCents-own});
  for(const share of shares){
   if(share.id!==expense.payer)items.get(share.id).push({kind:'expense',expenseId:expense.id,title:expense.title,date:expense.date,description:'分攤費用',amount:-share.amount});
  }
 }

 for(const payment of book.settlements){
  const parts=[...paymentApplications(payment)];
  const unassigned=unassignedPayment(payment);
  if(unassigned>0)parts.push({amount:unassigned});
  for(const part of parts){
   const title=titles.get(part.expenseId);
   const suffix=title?' · '+title:'';
   items.get(payment.from).push({kind:'payment',expenseId:part.expenseId,title:'已還款'+suffix,date:payment.date,description:'付給 '+name(book,payment.to),amount:part.amount});
   items.get(payment.to).push({kind:'payment',expenseId:part.expenseId,title:'已收款'+suffix,date:payment.date,description:'收到 '+name(book,payment.from)+' 的還款',amount:-part.amount});
  }
 }
 return items;
}
function balances(book){
 return Object.fromEntries(Array.from(balanceItems(book),([id,items])=>[id,items.reduce((total,item)=>total+item.amount,0)]));
}
function signedBalance(amount){
 return (amount>0?'+':amount<0?'−':'')+'NT$'+briefMoney(Math.abs(amount));
}
function balanceRows(book,totals){
 return book.members.map(member=>{
  const total=totals[member.id];
  const label=total<0?'應付':total>0?'應收':'已平衡';
  const type=total<0?'balance-owed':total>0?'balance-due':'balance-even';
  const displayName=esc(member.lineName||member.name);
  return `<div class="balance-row ${type}">
   <span class="balance-person"><span class="balance-name">${displayName}</span><span class="avatar" aria-hidden="true">${memberAvatar(member)}</span></span>
   <button type="button" class="balance-amount" data-balance-member="${esc(member.id)}" aria-label="${displayName} ${label}，查看計算明細">${signedBalance(total)}${total===0?'<span aria-hidden="true"> ✓</span>':''}</button>
  </div>`;
 }).join('');
}

function balanceDetailSection(title,items,emptyMessage='目前沒有紀錄'){
 const byDate=new Map();
 let total=0;
 for(const item of items){
  const date=item.date||'';
  if(!byDate.has(date))byDate.set(date,{items:[],total:0});
  const day=byDate.get(date);
  day.items.push(item);
  day.total+=item.amount;
  total+=item.amount;
 }
 const dates=[...byDate].sort(([a],[b])=>b.localeCompare(a)).map(([date,day])=>`
  <details class="repayment-group">
   <summary><span class="repayment-label">${esc(date||'未記錄日期')}</span><small>${day.items.length} 筆 · ${signedBalance(day.total)}</small></summary>
   ${day.items.map(item=>`<div class="person balance-detail-row"><span class="detail">${esc(item.title)}<small>${esc(item.description)}</small></span><strong>${signedBalance(item.amount)}</strong></div>`).join('')}
  </details>`).join('');
 return `<section class="repayment-history balance-date-section">
  <h3 class="repayment-section-title"><span class="repayment-label">${title}</span><small>${signedBalance(total)}</small></h3>
  <div class="repayment-groups">${dates||'<p class="hint">'+emptyMessage+'</p>'}</div>
 </section>`;
}

function outstandingBalanceItems(items){
 const remaining=items.map(item=>({...item}));
 const expenses=new Map(remaining.filter(item=>item.kind==='expense').map(item=>[item.expenseId,item]));
 const offset=(debit,credit)=>{
  const amount=Math.min(-debit.amount,credit.amount);
  debit.amount+=amount;
  credit.amount-=amount;
 };
 // Apply payments to their recorded expense before netting the rest.
 for(const payment of remaining){
  if(payment.kind!=='payment'||!payment.expenseId)continue;
  const expense=expenses.get(payment.expenseId);
  if(!expense||expense.amount*payment.amount>=0)continue;
  if(expense.amount<0)offset(expense,payment);
  else offset(payment,expense);
 }
 const ordered=[...remaining].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
 const debits=ordered.filter(item=>item.amount<0);
 const credits=ordered.filter(item=>item.amount>0);
 let debit=0,credit=0;
 while(debit<debits.length&&credit<credits.length){
  offset(debits[debit],credits[credit]);
  if(debits[debit].amount===0)debit++;
  if(credits[credit].amount===0)credit++;
 }
 return remaining.flatMap((item,index)=>{
  if(item.amount===0)return [];
  if(item.kind==='payment')return [{...item,title:'還款差額 · '+item.title}];
  if(item.amount!==items[index].amount)return [{...item,description:item.description+' · 剩餘金額'}];
  return [item];
 });
}

function showBalanceDetails(memberId){
 const book=group();
 const member=book?.members.find(item=>item.id===memberId);
 if(!member)return;
 const items=balanceItems(book).get(memberId);
 const expenses=items.filter(item=>item.kind==='expense');
 const pending=outstandingBalanceItems(items);
 const payments=items.filter(item=>item.kind==='payment');
 const owes=expenses.some(item=>item.amount<0);
 const receives=expenses.some(item=>item.amount>0);
 const paid=payments.some(item=>item.amount>0);
 const received=payments.some(item=>item.amount<0);
 const expenseTitle=pending.length?(pending[0].amount<0?'應付':'應收'):receives&&!owes?'應收':'應付';
 const paymentTitle=received?(paid?'已付／已收':'已收'):paid||!receives?'已付':'已收';

 const sections=[
  {key:'expenses',title:expenseTitle,items:pending,emptyMessage:expenseTitle==='應收'?'沒有待收款項':'沒有待付款項'},
  {key:'payments',title:paymentTitle,items:payments},
  {key:'net',title:'總額',items}
 ];
 const tabs=sections.map(({key,title},index)=>`<button type="button" role="tab" id="balance-tab-${key}" aria-controls="balance-panel-${key}" aria-selected="${index===0}" tabindex="${index===0?0:-1}">${title}</button>`).join('');
 const panels=sections.map(({key,title,items,emptyMessage},index)=>`<div role="tabpanel" id="balance-panel-${key}" aria-labelledby="balance-tab-${key}"${index===0?'':' hidden'}>${balanceDetailSection(title,items,emptyMessage)}</div>`).join('');
 modal((member.lineName||member.name)+' · 餘額明細',
  `<div class="balance-detail-tabs" role="tablist" aria-label="餘額明細分類">${tabs}</div><div class="balance-detail-list">${panels}</div>`,
  '關閉',async()=>{});

 const buttons=Array.from($('fields').querySelectorAll('.balance-detail-tabs [role="tab"]'));
 const selectTab=index=>{
  buttons.forEach((button,i)=>{
   const selected=i===index;
   button.setAttribute('aria-selected',String(selected));
   button.tabIndex=selected?0:-1;
   $(button.getAttribute('aria-controls')).hidden=!selected;
  });
 };
 buttons.forEach((button,index)=>{
  button.onclick=()=>selectTab(index);
  button.onkeydown=event=>{
   const last=buttons.length-1;
   const positions={ArrowLeft:index===0?last:index-1,ArrowRight:index===last?0:index+1,Home:0,End:last};
   if(!Object.hasOwn(positions,event.key))return;
   event.preventDefault();
   const next=positions[event.key];
   selectTab(next);
   buttons[next].focus();
  };
 });
}

function plan(g){const b=balances(g),deb=g.members.filter(m=>b[m.id]<0).map(m=>({...m,left:-b[m.id]})),cre=g.members.filter(m=>b[m.id]>0).map(m=>({...m,left:b[m.id]}));let out=[],i=0,j=0;while(i<deb.length&&j<cre.length){const amount=Math.min(deb[i].left,cre[j].left);out.push({from:deb[i].id,to:cre[j].id,amount});deb[i].left-=amount;cre[j].left-=amount;if(!deb[i].left)i++;if(!cre[j].left)j++}return out}
const name=(g,id)=>g.members.find(m=>m.id===id)?.name||'未知成員';
let itineraryTransportMode='transit';
const travelPhraseGroups=[
 {id:'taxi',title:'搭車',icon:'🚕',items:[
  {zh:'請給我收據。',ko:'영수증 주세요.'},
  {zh:'我是台灣人。',ko:'저는 대만 사람이에요.'},
  {zh:'請帶我們到這個地址。',ko:'이 주소로 가 주세요.'},
  {zh:'請在這裡停車。',ko:'여기서 세워 주세요.'},
  {zh:'可以刷卡嗎？',ko:'카드 결제 되나요?'},
  {zh:'可以幫我們打開後車廂嗎？',ko:'트렁크 좀 열어 주시겠어요?'}
 ]},
 {id:'dining',title:'吃飯',icon:'🍽️',items:[
  {zh:'我們有五個大人、一個小孩。',ko:'저희는 어른 다섯 명과 아이 한 명이에요.'},
  {zh:'我們不吃牛肉。',ko:'저희는 소고기를 먹지 않아요.'},
  {zh:'這道菜有牛肉或牛肉高湯嗎？',ko:'이 음식에 소고기나 소고기 육수가 들어가나요?'},
  {zh:'請不要加辣。',ko:'맵지 않게 해 주세요.'},
  {zh:'請給我們水。',ko:'물 좀 주세요.'},
  {zh:'請問洗手間在哪裡？',ko:'화장실이 어디에 있나요?'},
  {zh:'我們要結帳。',ko:'계산해 주세요.'}
 ]},
 {id:'shopping',title:'買東西',icon:'🛍️',items:[
  {zh:'請問這個多少錢？',ko:'이거 얼마예요?'},
  {zh:'請問這在哪裡？',ko:'이거 어디에 있어요?'},
  {zh:'請問其他間店有貨嗎？',ko:'다른 매장에는 재고가 있나요?'},
  {zh:'請問有別的款式嗎？',ko:'다른 디자인도 있나요?'},
  {zh:'請問可以算便宜一點嗎？',ko:'조금 깎아 주실 수 있나요?'},
  {zh:'請問有其他尺寸嗎？',ko:'다른 사이즈도 있나요?'},
  {zh:'請問可以試穿嗎？',ko:'입어 봐도 될까요?'},
  {zh:'請問可以退稅嗎？',ko:'택스 리펀드 되나요?'},
  {zh:'請給我一個袋子。',ko:'봉투 하나 주세요.'}
 ]}
];
let travelPhraseCategory='taxi';
let travelSpeechButton=null,travelSpeechEpoch=0;
function stopTravelSpeech(){
 travelSpeechEpoch++;
 if(window.speechSynthesis)window.speechSynthesis.cancel();
 if(travelSpeechButton){travelSpeechButton.textContent='▶ 播放韓文';travelSpeechButton.setAttribute('aria-pressed','false');travelSpeechButton=null;}
}
function playTravelPhrase(phrase,button){
 if(travelSpeechButton===button){stopTravelSpeech();return;}
 stopTravelSpeech();
 if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){toast('此瀏覽器不支援語音播放，請使用放大文字。');return;}
 const epoch=travelSpeechEpoch;
 const utterance=new SpeechSynthesisUtterance(phrase.ko);
 utterance.lang='ko-KR';utterance.rate=0.85;
 const voice=window.speechSynthesis.getVoices().find(item=>/^ko([-_]|$)/i.test(item.lang));
 if(voice)utterance.voice=voice;
 travelSpeechButton=button;button.textContent='■ 停止播放';button.setAttribute('aria-pressed','true');
 const reset=()=>{if(travelSpeechEpoch===epoch&&travelSpeechButton===button){button.textContent='▶ 播放韓文';button.setAttribute('aria-pressed','false');travelSpeechButton=null;}};
 utterance.onend=reset;
 utterance.onerror=event=>{reset();if(!['canceled','interrupted'].includes(event.error))toast('無法播放韓文，請確認裝置已安裝韓文語音，或使用放大文字。');};
 try{window.speechSynthesis.speak(utterance);}catch{reset();toast('無法播放韓文，請使用放大文字。');}
}
function customTravelPhrases(g){
 let items=g?.travelPhrases;
 if(g?.cloud&&!cfg.lineApiBase){try{items=JSON.parse(localStorage.getItem(preferenceKey('phrases',g.id))||'[]')}catch{items=[]}}
 return Array.isArray(items)?items.filter(item=>item&&typeof item.zh==='string'&&typeof item.ko==='string'&&travelPhraseGroups.some(c=>c.id===item.category)):[];
}
function addTravelPhrase(){
 const opened=group();if(!opened)return;
 stopTravelSpeech();
 const legacy=opened.cloud&&!cfg.lineApiBase;
 modal('新增常用語',`<label>分類<select name="category">${travelPhraseGroups.map(c=>`<option value="${c.id}"${c.id===travelPhraseCategory?' selected':''}>${c.title}</option>`).join('')}</select></label><label>中文<textarea name="zh" required maxlength="160" placeholder="輸入中文句子"></textarea></label><label>韓文<textarea name="ko" lang="ko" required maxlength="300" placeholder="輸入對應的韓文句子"></textarea></label><p class="hint">請分別填寫中文與韓文，不會自動翻譯。${opened.cloud&&!legacy?'會儲存至此共用帳本，其他成員同步後可看到。':'只儲存在此瀏覽器；清除瀏覽資料後可能遺失。'}</p>`,'儲存常用語',async form=>{
  const current=group();if(current?.id!==opened.id)throw Error('帳本已切換，請重新新增');
  const category=form.get('category'),zh=form.get('zh').trim(),ko=form.get('ko').trim();
  if(!zh||!ko||zh.length>160||ko.length>300||!travelPhraseGroups.some(c=>c.id===category))throw Error('請填寫有效的分類、中文與韓文');
  const items=customTravelPhrases(current);
  if(items.length>=100)throw Error('每本帳本最多新增 100 句常用語');
  if(items.some(item=>item.category===category&&item.zh===zh&&item.ko===ko))throw Error('這句常用語已經存在');
  const nextItems=[...items,{id:uid(),category,zh,ko}];
  if(legacy){localStorage.setItem(preferenceKey('phrases',current.id),JSON.stringify(nextItems));}
  else await commit({...structuredClone(current),travelPhrases:nextItems});
  travelPhraseCategory=category;render();toast('常用語已儲存');
 });
}
function showTravelPhrase(phrase,opener){
 stopTravelSpeech();
 const previous=document.getElementById('travelPhraseDialog');
 if(previous)previous.remove();
 const dialog=document.createElement('dialog');
 dialog.id='travelPhraseDialog';dialog.className='travel-phrase-dialog';
 dialog.setAttribute('aria-labelledby','travelPhraseTitle');
 dialog.innerHTML=`<div class="dialog-head"><h2 id="travelPhraseTitle">給對方看</h2><button type="button" class="quiet" aria-label="關閉常用語">✕</button></div><p class="travel-phrase-large" lang="ko">${esc(phrase.ko)}</p><p class="travel-phrase-translation">${esc(phrase.zh)}</p><button type="button" class="phrase-speak" aria-pressed="false">▶ 播放韓文</button>`;
 document.body.append(dialog);
 dialog.querySelector('.dialog-head button').onclick=()=>dialog.close();
 dialog.querySelector('.phrase-speak').onclick=event=>playTravelPhrase(phrase,event.currentTarget);
 dialog.addEventListener('close',()=>{stopTravelSpeech();dialog.remove();if(opener?.isConnected)opener.focus()},{once:true});
 dialog.showModal();
}
function renderTravelPhrases(container){
 stopTravelSpeech();
 const selected=travelPhraseGroups.find(category=>category.id===travelPhraseCategory)||travelPhraseGroups[0];
 const g=group(),items=[...selected.items,...customTravelPhrases(g).filter(item=>item.category===selected.id)];
 container.innerHTML=`<section class="travel-phrases" aria-label="韓國旅遊常用語"><div class="travel-phrase-tools"><div class="travel-phrase-categories" aria-label="常用語分類">${travelPhraseGroups.map(category=>`<button type="button" class="quiet" data-phrase-category="${category.id}" aria-pressed="${category.id===selected.id}">${category.icon} ${category.title}</button>`).join('')}</div><button type="button" id="addTravelPhrase">＋ 新增常用語</button></div><p class="hint">韓文語音由裝置提供，部分裝置需先下載韓文語音或連網。</p><h3>${selected.icon} ${selected.title}</h3><div class="travel-phrase-list">${items.map((phrase,index)=>`<article class="travel-phrase-card"><button type="button" class="travel-phrase-show" data-phrase-index="${index}" aria-label="放大：${esc(phrase.zh)}"><span class="travel-phrase-zh">${esc(phrase.zh)}</span><span class="travel-phrase-ko" lang="ko">${esc(phrase.ko)}</span><span class="travel-phrase-hint">${phrase.id?'自訂 · ':''}點一下，放大給對方看 ↗</span></button><button type="button" class="quiet phrase-speak" data-phrase-speak="${index}" aria-label="播放韓文：${esc(phrase.zh)}" aria-pressed="false">▶ 播放韓文</button></article>`).join('')}</div></section>`;
 container.querySelector('#addTravelPhrase').onclick=addTravelPhrase;
 container.querySelectorAll('[data-phrase-category]').forEach(button=>button.onclick=()=>{travelPhraseCategory=button.dataset.phraseCategory;renderTravelPhrases(container);container.querySelector(`[data-phrase-category="${travelPhraseCategory}"]`).focus()});
 container.querySelectorAll('[data-phrase-index]').forEach(button=>button.onclick=()=>showTravelPhrase(items[Number(button.dataset.phraseIndex)],button));
 container.querySelectorAll('[data-phrase-speak]').forEach(button=>button.onclick=()=>playTravelPhrase(items[Number(button.dataset.phraseSpeak)],button));
}
window.addEventListener('pagehide',stopTravelSpeech);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopTravelSpeech()});

const bookTabs={phrases:'常用語',notes:'記事',itinerary:'行程',balances:'分帳結算',expenses:'花費明細',members:'成員'};
function preferenceKey(kind,id=''){
 const account=window.WarmCloud?.user()?.uid||'local';
 return `${storageKey}:${kind}:${account}:${id}`;
}
function readPreference(kind,id){
 try{return localStorage.getItem(preferenceKey(kind,id))}catch{return null}
}
function pinnedTab(g){
 const value=readPreference('tab',g.id);
 return Object.hasOwn(bookTabs,value)&&(value!=='itinerary'||cfg.lineApiBase)?value:null;
}
function togglePinnedTab(){
 const g=group();
 if(!g)return;
 const pinned=pinnedTab(g)===tab;
 try{
  const key=preferenceKey('tab',g.id);
  if(pinned)localStorage.removeItem(key);
  else localStorage.setItem(key,tab);
 }catch{toast('無法儲存預設頁面');return}
 render();
 toast(pinned?'已取消置頂':`下次開啟此帳本會先顯示「${bookTabs[tab]}」`);
}
const koreanSubwayStations={
 '東大門歷史文化公園站':'동대문역사문화공원역','明洞站':'명동역','乙支路入口站':'을지로입구역',
 '新堂站':'신당역','新設洞站':'신설동역','東大門站':'동대문역','鐘路三街站':'종로3가역',
 '安國站':'안국역','鐘路五街站':'종로5가역','東大入口站':'동대입구역','市廳站':'시청역',
 '首爾站':'서울역','龍山站':'용산역','新龍山站':'신용산역','蠶室站':'잠실역','聖水站':'성수역'
};
function koreanSubwayRoute(method){
 if(!/\d+\s*號線/.test(method))return '';
 const stops=method.replace(/^從.*?出發[：:]\s*/,'').replace(/（[^）]*）/g,'').split('→').map(part=>{
  const stop=part.trim().match(/^(.+?站)\s*(?:(轉\s*)?(\d+)\s*號線)?$/);
  if(!stop||!Object.hasOwn(koreanSubwayStations,stop[1]))return '';
  const [,station,transfer,line]=stop;
  return koreanSubwayStations[station]+(line?` ${line}호선${transfer?' 환승':''}`:'');
 });
 return stops.length>1&&stops.every(Boolean)?stops.join(' → '):'';
}
const transportModes=[['transit','地鐵／步行'],['car','搭車']];
const isCarTransport=option=>/計程車|計程|開車|自駕|機場接送|包車|搭車|taxi|uber/i.test(option?.method||'');
// Totals use one default option per leg; alternative fares are never added together.
function itineraryModeOption(item,mode){
 const options=item.transport||[];
 if(options.length>=2){
  const [a,b]=options;
  return isCarTransport(a)&&!isCarTransport(b)?(mode==='car'?a:b):(mode==='car'?b:a);
 }
 return options.find(option=>isCarTransport(option)===(mode==='car'));
}
function itineraryMinutes(value){
 const text=String(value||'').replace(/\d{1,2}:\d{2}/g,'');
 const waiting=text.match(/含候車[^\d]*(\d+)\s*分/);
 if(waiting)return Number(waiting[1]);
 const match=text.match(/(?:(\d+(?:\.\d+)?)\s*(?:小時|時)\s*)?(\d+(?:\.\d+)?)(?:\s*[–—~～-]\s*(\d+))?\s*分(?:鐘)?/);
 if(match)return Number(match[1]||0)*60+Number(match[3]||match[2]);
 const hours=text.match(/(\d+(?:\.\d+)?)\s*(?:小時|時)/);
 return hours?Math.round(Number(hours[1])*60):null;
}
function itineraryWon(value){
 const text=String(value||'');
 if(/依.*訂單|待確認|未定/.test(text))return null;
 const match=text.match(/₩\s*([\d,]+)/);
 if(!match)return /免費/.test(text)?0:null;
 const toll=text.match(/[＋+]\s*(?:通行費|過路費)\s*₩?\s*([\d,]+)/);
 return Number(match[1].replace(/,/g,''))+(toll?Number(toll[1].replace(/,/g,'')):0);
}
function itineraryTransportTotal(dayEntries,mode){
 let minutes=0,cost=0,missing=0,count=0,approx=false;
 for(const entries of dayEntries){
  const stops=entries.filter(item=>!/彈性備選|有空再去/.test(item.place||''));
  stops.forEach((item,index)=>{
   const option=itineraryModeOption(item,mode);
   if(/航班|機票/.test((item.place||'')+' '+(option?.method||'')+' '+(option?.duration||'')))return;
   if(!index&&!option)return;
   count++;
   if(!option){missing++;return;}
   const m=itineraryMinutes(option.duration),c=itineraryWon(option.cost);
   if(m===null||c===null){missing++;return;}
   minutes+=m;cost+=c;
   if(/估|即時|深夜|未含|比較|約|[–~～]/.test(option.duration+' '+option.cost+' '+option.method))approx=true;
  });
 }
 return {minutes,cost,missing,count,approx};
}
function itineraryTotalLabel(total,mode){
 if(!total.count)return '無交通資料';
 const h=Math.floor(total.minutes/60),m=total.minutes%60;
 const time=(h?`${h}小時`:'')+(m||!h?`${m}分`:'');
 return `${total.missing?'已知小計':'共'}${time} - ₩${total.cost.toLocaleString('en-US')}／${mode==='car'?'車':'人'}${total.missing?`（${total.missing}段待補）`:''}${total.approx?'*':''}`;
}
function itineraryPlaceNames(place){
 const match=place.match(/^(.+?)\s*[（(]([^（）()]*[가-힣][^（）()]*)[）)]\s*$/u);
 return match?[match[1],match[2]]:[place,''];
}
function safeMapUrl(value){
 try{
  const url=new URL(value);
  return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';
 }catch{return ''}
}
function readMapUrl(form){
 const value=form.get('mapUrl').trim();
 const url=safeMapUrl(value);
 if(value&&!url)throw Error('請貼上以 https:// 開頭的地圖連結。');
 return url;
}
function mapUrlField(value=''){
 return field('mapUrl','地址連結（選填）',value,'url','maxlength="2048" placeholder="例如：https://naver.me/…"');
}
function mapAddressMarkup(address,url,place,action=''){
 const [name,localName]=itineraryPlaceNames(place);
 const search=[address,localName,name].find(text=>/[가-힣]/u.test(text||''));
 const custom=safeMapUrl(url);
 const href=custom||(search?`https://map.naver.com/p/search/${encodeURIComponent(search.trim())}`:'');
 return (address?`<span class="itinerary-place-detail"><small>地址</small>${esc(address)}</span>`:'')+
  (href||action?`<div class="itinerary-map-actions">${href?`<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${custom?'開啟地圖 ↗':'NAVER 地圖搜尋 ↗'}</a>`:''}${action}</div>`:'');
}
const itineraryMapKey=item=>JSON.stringify([item.place.trim(),(item.address||'').trim()]);
function editItineraryMap(g,item){
 const key=itineraryMapKey(item);
 const previous=g.itineraryMapLinks?.[key]||'';
 modal('設定地址連結',
  `<p class="hint">${esc(item.place)}${item.address?` · ${esc(item.address)}`:''}</p>`+
  mapUrlField(previous)+'<p class="hint">有韓文地址或店名時，留空會使用 NAVER 地圖搜尋。相同地點和地址會共用連結。</p>',
  '儲存連結',async form=>{
   const url=readMapUrl(form);
   if(url===previous)return;
   const current=group();
   if(current?.id!==g.id||(current.itineraryMapLinks?.[key]||'')!==previous)throw Error('地址連結已更新，請重新開啟編輯');
   const itineraryMapLinks={...current.itineraryMapLinks};
   if(url)itineraryMapLinks[key]=url;
   else delete itineraryMapLinks[key];
   await commit({...structuredClone(current),itineraryMapLinks});
  });
}
function itineraryLegMarkup(previous,item,routeChanged){
 const options=item.transport||[];
 if(!previous&&!options.length)return '';
 const selected=itineraryModeOption(item,itineraryTransportMode);
 const matches=selected?[selected]:[];
 const placeName=stop=>esc(itineraryPlaceNames(stop.place)[0]);
 const endpoints=`${previous?`${placeName(previous)} → `:'前往 '}${placeName(item)}`;
 const routes=matches.map(option=>{
  const {method,duration,cost}=option;
  const korean=koreanSubwayRoute(method);
  const mode=isCarTransport(option)?'搭車':/地鐵|\d+\s*號線/.test(method)?'地鐵':/步行|走路/.test(method)?'步行':'';
  return `<details class="itinerary-leg-details">
   <summary><span class="itinerary-leg-facts">${mode?`<span>${mode}</span>`:''}<strong class="${duration?'':'itinerary-leg-unset'}">${esc(duration||'未填交通時間')}</strong>${cost?`<span>${esc(cost)}</span>`:''}</span><span class="itinerary-leg-toggle">路線</span></summary>
   <div class="itinerary-leg-body"><div class="itinerary-leg-places">${endpoints}</div>
    ${method?`<div class="itinerary-leg-method">${esc(method)}</div>`:''}${korean?`<div class="itinerary-transit-korean" lang="ko">${esc(korean)}</div>`:''}
   </div>
  </details>`;
 }).join('');
 return `<div class="itinerary-leg">
  <span class="itinerary-leg-arrow" aria-hidden="true">↓</span>
  <div class="itinerary-leg-content">
   ${routeChanged&&routes?'<div class="itinerary-leg-unset">前一站已調整，請確認下方交通資料</div>':''}
   ${routes||'<div class="itinerary-leg-unset">未填交通時間</div>'}
  </div></div>`;
}
function orderedItineraryDay(entries,order){
 if(!Array.isArray(order))return entries;
 const remaining=new Map(entries.map(item=>[item.id,item]));
 const ordered=[];
 for(const id of order){
  if(!remaining.has(id))continue;
  ordered.push(remaining.get(id));
  remaining.delete(id);
 }
 return [...ordered,...remaining.values()];
}
function editItineraryDayLabel(g,date){
 const previousLabel=g.itineraryLabels?.[date]||'';
 modal('編輯行程標示',
  field('dayLabel','行程標示',previousLabel,'text','maxlength="60" placeholder="例如：明洞 → 東大門"')+
  '<p class="hint">帳本成員都看得到。留空後儲存即可清除。</p>',
  '儲存',async form=>{
   const label=form.get('dayLabel').trim();
   if(label===previousLabel)return;
   const current=group();
   if(current?.id!==g.id||(current.itineraryLabels?.[date]||'')!==previousLabel)throw Error('行程標示已更新，請重新開啟編輯');
   const itineraryLabels={...current.itineraryLabels};
   if(label)itineraryLabels[date]=label;
   else delete itineraryLabels[date];
   await commit({...structuredClone(current),itineraryLabels});
  });
}
function showItineraryRecommendations(g,item){
 const recommendations=g.itineraryRecommendations?.[item.id]||[];
 const detail=(label,value)=>value?`<span class="itinerary-place-detail"><small>${label}</small>${esc(value)}</span>`:'';
 const list=recommendations.map(entry=>`<li>
  <div class="itinerary-recommendation-heading"><strong>${esc(entry.name)}</strong>
  <button type="button" class="quiet" data-edit-recommendation="${esc(entry.id)}" aria-label="編輯推薦 ${esc(entry.name)}">編輯</button></div>
  ${detail('亮點／必買／必點',entry.highlights)}
  ${mapAddressMarkup(entry.address,entry.mapUrl,entry.name)}
  ${detail('營業時間',entry.hours)}
  ${detail('備註',entry.note)}
 </li>`).join('');
 modal('行程推薦',
  `<p class="itinerary-recommendation-stop">${esc(item.place)}</p>`+
  (list?`<ul class="itinerary-recommendation-list">${list}</ul>`:'<p class="hint">還沒有推薦。可以記下附近想逛的店、必買或必點的品項。</p>'),
  '＋ 新增推薦',()=>{},()=>editItineraryRecommendation(g,item));
 $('fields').querySelectorAll('[data-edit-recommendation]').forEach(button=>{
  button.onclick=()=>editItineraryRecommendation(g,item,recommendations.find(entry=>entry.id===button.dataset.editRecommendation));
 });
 $('modal').scrollTop=0;
}
async function saveItineraryRecommendation(g,item,previous,next){
 const current=group();
 if(current?.id!==g.id)throw Error('帳本已切換，請重新開啟行程推薦');
 const itineraryRecommendations={...current.itineraryRecommendations};
 const entries=itineraryRecommendations[item.id]||[];
 if(previous){
  const latest=entries.find(entry=>entry.id===previous.id);
  if(JSON.stringify(latest)!==JSON.stringify(previous))throw Error('這筆推薦已更新，請返回推薦清單再試');
 }
 const updated=previous
  ? entries.flatMap(entry=>entry.id===previous.id?(next?[next]:[]):[entry])
  : [...entries,next];
 if(updated.length)itineraryRecommendations[item.id]=updated;
 else delete itineraryRecommendations[item.id];
 await commit({...structuredClone(current),itineraryRecommendations});
}
function editItineraryRecommendation(g,item,entry){
 const back=()=>{
  const current=group();
  if(current?.id===g.id)showItineraryRecommendations(current,item);
  else $('modal').close();
 };
 const name=field('recommendationName','店名／地點名稱',entry?.name||'','text','required maxlength="120"');
 const highlights=field('recommendationHighlights','亮點／必買／必點（選填）',entry?.highlights||'','text','maxlength="240" placeholder="例如：限定商品、招牌餐點或附近景點"');
 const address=field('recommendationAddress','地址（選填）',entry?.address||'','text','maxlength="240"');
 const hours=field('recommendationHours','營業時間（選填）',entry?.hours||'','text','maxlength="240"');
 modal(entry?'編輯推薦':'新增推薦',name+highlights+address+mapUrlField(entry?.mapUrl)+hours+
  `<label for="recommendationNote">備註（選填）</label>
   <textarea id="recommendationNote" name="recommendationNote" class="itinerary-note itinerary-note-fit" rows="2" maxlength="1000">${esc(entry?.note||'')}</textarea>
   <p class="hint">帳本成員都看得到。</p>
   <div class="itinerary-transfer-actions">
    <button type="button" class="quiet" id="backToRecommendations">返回推薦清單</button>
    ${entry?'<button type="button" class="quiet danger" id="removeRecommendation">刪除推薦</button>':''}
   </div>`,
  '儲存推薦',async form=>{
   const name=form.get('recommendationName').trim();
   if(!name)throw Error('請填寫店名或地點名稱');
   await saveItineraryRecommendation(g,item,entry,{
    id:entry?.id||uid(),name,highlights:form.get('recommendationHighlights').trim(),
    address:form.get('recommendationAddress').trim(),mapUrl:readMapUrl(form),hours:form.get('recommendationHours').trim(),
    note:form.get('recommendationNote').trim()
   });
  },back);
 $('backToRecommendations').onclick=()=>{if(!$('submit').disabled)back()};
 if(entry)$('removeRecommendation').onclick=()=>{
  if($('submit').disabled)return;
  modal('刪除推薦',`<p>確定移除「${esc(entry.name)}」？</p>
   <button type="button" class="quiet" id="cancelRemoveRecommendation">返回</button>`,
   '確認刪除',()=>saveItineraryRecommendation(g,item,entry,null),back);
  $('cancelRemoveRecommendation').onclick=()=>{if(!$('submit').disabled)editItineraryRecommendation(g,item,entry)};
 };
 $('f-recommendationName').focus();
}
function reorderItineraryDay(g,date,entries){
 const ordered=[...entries];
 modal(`調整 ${date.slice(5).replace('-','/')} 行程順序`,
  '<p class="hint">用上移、下移調整站點。原本的開始和結束時間會保留。</p><ol id="itineraryOrderList" class="itinerary-order-list"></ol>',
  '儲存順序',async()=>{
   if(ordered.every((item,index)=>item===entries[index]))return;
   const current=group();
   if(current?.id!==g.id||current.version!==g.version)throw Error('帳本已更新，請重新開啟排序');
   await commit({...structuredClone(current),itineraryOrder:{...current.itineraryOrder,[date]:ordered.map(item=>item.id)}});
   toast('行程順序已儲存');
  });
 const list=$('itineraryOrderList');
 const draw=()=>{
  list.innerHTML=ordered.map((item,index)=>`<li><span>${item.time?`<small>${esc(item.time)}</small> `:''}${esc(item.place)}</span>
   <button type="button" class="quiet" data-index="${index}" data-step="-1" aria-label="上移 ${esc(item.place)}"${index===0?' disabled':''}>↑</button>
   <button type="button" class="quiet" data-index="${index}" data-step="1" aria-label="下移 ${esc(item.place)}"${index===ordered.length-1?' disabled':''}>↓</button></li>`).join('');
 };
 list.onclick=event=>{
  const button=event.target.closest('button[data-step]');
  if(!button||button.disabled)return;
  const index=Number(button.dataset.index),step=Number(button.dataset.step),next=index+step;
  [ordered[index],ordered[next]]=[ordered[next],ordered[index]];
  draw();
  (list.querySelector(`[data-index="${next}"][data-step="${step}"]:enabled`)||list.querySelector(`[data-index="${next}"]:enabled`))?.focus();
 };
 draw();
}
function loadItinerary(view){
 return api('listItinerary',{groupId:view.book}).then(({items,notesVersion,timeRangeVersion,placeDetailsVersion,transportVersion})=>{
  view.notesReady=notesVersion===2;
  view.timeRangeReady=timeRangeVersion===1;
  view.placeDetailsReady=placeDetailsVersion===1;
  view.transportReady=transportVersion===1;
  view.items=view.notesReady?items:items.map(item=>({...item,
   sharedNote:item.privateNote?'':item.note,personalNote:item.privateNote?item.note:''
  }));
  return view;
 });
}
function renderItinerary(g,c){
 const account=window.WarmCloud?.user()?.uid;
 if(itineraryView?.book!==g.id||itineraryView.account!==account){
  const view={book:g.id,account,items:null};
  itineraryView=view;
  loadItinerary(view).catch(error=>{
   view.error=error.message==='未知操作'?'行程功能等待後端更新。':error.message;
  }).finally(()=>{if(itineraryView===view&&tab==='itinerary'&&group()?.id===g.id)render()});
 }
 const {items,error,notesReady}=itineraryView;
 $('addItinerary').disabled=!notesReady;
 if(error){
  c.innerHTML=`<p class="hint" role="alert">${esc(error)}</p><button type="button" id="retryItinerary" class="quiet">重新載入</button>`;
  $('retryItinerary').onclick=()=>{itineraryView=null;render()};
  return;
 }
 if(!items){
  c.innerHTML='<p class="hint" role="status">載入行程中…</p>';
  return;
 }
 const notice=notesReady?'':'<p class="hint" role="status">新版備註等待後端更新，現有行程可以查看。</p>';
 if(!items.length){
  c.innerHTML=notice+(notesReady?'<div class="empty"><div class="empty-symbol" aria-hidden="true">📍</div><p>還沒有行程，點「新增行程」記下第一站。</p></div>':'');
  return;
 }
 const days=new Map();
 for(const item of items){
  if(!days.has(item.date))days.set(item.date,[]);
  days.get(item.date).push(item);
 }
 const dates=[...days.keys()];
 if(itineraryDay&&!days.has(itineraryDay))itineraryDay='';
 const dayNumber=date=>1+Math.round((Date.parse(date)-Date.parse(dates[0]))/86400000);
 const shortDate=date=>date.slice(5).replace('-','/');
 const options=['',...dates].map(date=>`<button type="button" class="quiet" data-itinerary-day="${esc(date)}"
  aria-pressed="${date===itineraryDay}">${date?`第 ${dayNumber(date)} 天 <small>${esc(shortDate(date))}</small>`:'總覽'}</button>`);
 const visibleDays=itineraryDay?[[itineraryDay,days.get(itineraryDay)]]:[...days];
 const transportPicker=items.some(item=>item.transport?.length)?`<div class="itinerary-transport-modes" role="group" aria-label="交通方式">
  ${transportModes.map(([mode,label])=>`<button type="button" class="quiet" data-transport-mode="${mode}" aria-pressed="${mode===itineraryTransportMode}">${label} <span>${esc(itineraryTotalLabel(itineraryTransportTotal(visibleDays.map(([date,entries])=>orderedItineraryDay(entries,g.itineraryOrder?.[date])),mode),mode))}</span></button>`).join('')}
 </div><p class="hint">交通合計不含景點停留；每段採一個預設方案。地鐵按成人每人、搭車按每車計價；備選不計入。*估價或加成未含，依各段說明。</p>`:'';
 c.innerHTML=notice+`<div class="itinerary-days" role="group" aria-label="行程日期">${options.join('')}</div>`+transportPicker+
  visibleDays.map(([date,entries])=>{
   const ordered=orderedItineraryDay(entries,g.itineraryOrder?.[date]);
   const originalPrevious=new Map(entries.map((item,index)=>[item.id,entries[index-1]?.id]));
   const label=g.itineraryLabels?.[date]||'';
   return `<section class="itinerary-day"><div class="itinerary-day-header"><div class="itinerary-day-title">
    <h3>第 ${dayNumber(date)} 天 <span>${esc(date)}</span></h3>
    <button type="button" class="quiet itinerary-day-label" data-itinerary-label="${esc(date)}"
     aria-label="${label?`編輯行程標示：${esc(label)}`:'新增行程標示'}（第 ${dayNumber(date)} 天）">${label?esc(label):'＋ 行程標示'}</button></div>
    ${notesReady&&entries.length>1?`<button type="button" class="quiet" data-itinerary-order="${esc(date)}" aria-label="調整第 ${dayNumber(date)} 天的順序">調整順序</button>`:''}</div>
   ${ordered.map((item,index)=>{
    const editable=notesReady&&(item.canEdit||item.sharedRevision);
    const count=g.itineraryRecommendations?.[item.id]?.length||0;
    const previous=ordered[index-1];
    const [place,localName]=itineraryPlaceNames(item.place);
    const hasNotes=item.sharedNote||item.personalNote;
    const mapButton=editable?`<button type="button" class="quiet" data-itinerary-map="${esc(item.id)}" aria-label="設定 ${esc(place)} 的地址連結">設定連結</button>`:'';
    const mapAddress=mapAddressMarkup(item.address,g.itineraryMapLinks?.[itineraryMapKey(item)],item.place,mapButton);
    return `${itineraryLegMarkup(previous,item,previous?.id!==originalPrevious.get(item.id))}<article class="itinerary-item${item.endTime?' has-time-range':''}">
     <span class="itinerary-clock">${item.time?`<time datetime="${esc(item.date+'T'+item.time)}">${esc(item.time)}</time>`:'未定時間'}${item.endTime?`–<time datetime="${esc(item.date+'T'+item.endTime)}">${esc(item.endTime)}</time>`:''}</span>
     <strong class="itinerary-item-name">${esc(place)}</strong>
     <div class="itinerary-item-actions">
      <button type="button" class="quiet itinerary-recommendation-button" data-itinerary-recommendations="${esc(item.id)}" aria-label="${esc(item.place)}的行程推薦${count?`（${count} 筆）`:''}">推薦${count?` ${count}`:''}</button>
      ${editable?`<button type="button" class="itinerary-edit" data-itinerary="${esc(item.id)}" aria-label="編輯 ${esc(item.place)}">編輯 ›</button>`:''}
     </div>
     ${localName||mapAddress||item.openingHours||hasNotes?`<details class="itinerary-item-details">
      <summary>${hasNotes?'地點詳情與備註':'地點詳情'}</summary>
      ${localName?`<span class="itinerary-place-detail" lang="ko">${esc(localName)}</span>`:''}
      ${mapAddress}
      ${item.openingHours?`<span class="itinerary-place-detail"><small>營業時間</small>${esc(item.openingHours)}</span>`:''}
      ${item.sharedNote?`<span class="itinerary-item-note"><small>所有成員可見</small>${esc(item.sharedNote)}</span>`:''}
      ${item.personalNote?`<span class="itinerary-item-note"><small>🔒 僅自己可見</small>${esc(item.personalNote)}</span>`:''}
     </details>`:''}
    </article>`;
   }).join('')}</section>`;
  }).join('');
 c.querySelectorAll('[data-itinerary-day]').forEach(button=>{
  button.onclick=()=>{
   itineraryDay=button.dataset.itineraryDay;
   const offset=button.parentElement.scrollLeft;
   renderItinerary(g,c);
   const selected=c.querySelector('[data-itinerary-day][aria-pressed="true"]');
   selected.parentElement.scrollLeft=offset;
   selected.focus({preventScroll:true});
  };
 });
 c.querySelectorAll('[data-transport-mode]').forEach(button=>{
  button.onclick=()=>{
   if(itineraryTransportMode===button.dataset.transportMode)return;
   itineraryTransportMode=button.dataset.transportMode;
   const dayOffset=c.querySelector('.itinerary-days').scrollLeft;
   renderItinerary(g,c);
   c.querySelector('.itinerary-days').scrollLeft=dayOffset;
   c.querySelector('[data-transport-mode][aria-pressed="true"]').focus({preventScroll:true});
  };
 });
 c.querySelectorAll('[data-itinerary]').forEach(button=>{
  button.onclick=()=>editItinerary(g,items.find(item=>item.id===button.dataset.itinerary),button);
 });
 c.querySelectorAll('[data-itinerary-recommendations]').forEach(button=>{
  button.onclick=()=>showItineraryRecommendations(g,items.find(item=>item.id===button.dataset.itineraryRecommendations));
 });
 c.querySelectorAll('[data-itinerary-map]').forEach(button=>{
  button.onclick=()=>editItineraryMap(g,items.find(item=>item.id===button.dataset.itineraryMap));
 });
 c.querySelectorAll('[data-itinerary-label]').forEach(button=>{
  button.onclick=()=>editItineraryDayLabel(g,button.dataset.itineraryLabel);
 });
 c.querySelectorAll('[data-itinerary-order]').forEach(button=>{
  button.onclick=()=>{
   const date=button.dataset.itineraryOrder;
   reorderItineraryDay(g,date,orderedItineraryDay(days.get(date),g.itineraryOrder?.[date]));
  };
 });
}
function editItinerary(g,item,trigger){
 if(!g||!itineraryView?.notesReady)return;
 const id=item?.id||uid();
 const canEditPersonalNote=!item||item.canEdit;
 const openedView=itineraryView;
 const originalTop=trigger?.closest('.itinerary-item').getBoundingClientRect().top;
 const content=$('content');
 const dayOffset=content.querySelector('.itinerary-days')?.scrollLeft;
 const {timeRangeReady,placeDetailsReady,transportReady}=itineraryView;
 const start=field('time','開始時間（選填）',item?.time||'','time');
 const timing=timeRangeReady?`<div class="itinerary-time-fields"><div>${start}</div><div>${
  field('endTime','結束時間（選填）',item?.endTime||'','time')
 }</div></div>`:start+'<p class="hint">更新後端後即可設定結束時間。</p>';
 const placeDetails=placeDetailsReady?
  field('address','地址（選填）',item?.address||'','text','maxlength="240" placeholder="例如：서울 종로구 율곡로1길 7"')+
  `<label for="itineraryOpeningHours">營業時間（選填）</label>
  <textarea class="itinerary-note" id="itineraryOpeningHours" name="openingHours" rows="2" maxlength="400" placeholder="例如：週一至週六 11:30–15:00、17:30–21:00">${esc(item?.openingHours||'')}</textarea>`:
  '<p class="hint">更新後端後即可填寫地址與營業時間。</p>';
 const [first,second]=item?.transport||[];
 const [transit,car]=isCarTransport(first)&&!isCarTransport(second)?[second,first]:[first,second];
 const activeMode=transit&&car?itineraryTransportMode:car?'car':'transit';
 const transportFields=([mode],index)=>{
  const option=mode==='car'?car:transit;
  const placeholder=mode==='car'?'例如：計程車':'例如：地鐵 4 號線 → 明洞站';
  return `<div id="itinerary-transport-${mode}"${mode===activeMode?'':' hidden'}>
   <div class="itinerary-time-fields"><div>${field('transportDuration'+index,'交通時間',option?.duration||'','text','maxlength="80" placeholder="例如：19 分鐘"')}</div>
   <div>${field('transportCost'+index,'交通金額',option?.cost||'','text','maxlength="100" placeholder="例如：₩1,550／人"')}</div></div>
   <label for="f-transportMethod${index}">交通備註</label>
   <textarea class="itinerary-note itinerary-note-fit" id="f-transportMethod${index}" name="transportMethod${index}" rows="1" maxlength="240" placeholder="${placeholder}">${esc(option?.method||'')}</textarea>
  </div>`;
 };
 const transportDetails=transportReady?`<fieldset class="itinerary-transport-editor"><legend>前往這一站的交通（選填）</legend>
  <div class="itinerary-transport-editor-header">
   <span>交通方式</span>
   <div class="itinerary-transport-modes" role="group" aria-label="切換交通方案">
    ${transportModes.map(([mode,label])=>`<button type="button" class="quiet" aria-controls="itinerary-transport-${mode}" aria-pressed="${mode===activeMode}">${label}</button>`).join('')}
   </div>
  </div>${transportModes.map(transportFields).join('')}</fieldset>`:
  '<p class="hint">更新後端後即可填寫交通方式、時間與金額。</p>';
 const transferActions=item?`<div class="itinerary-transfer-actions">
  <button type="button" class="quiet" data-itinerary-transfer="move" aria-pressed="false">移到其他天</button>
  <button type="button" class="quiet" data-itinerary-transfer="copy" aria-pressed="false">複製到其他天</button>
 </div><p class="hint" id="itineraryTransferHint" hidden>選擇新日期，時間、地點、交通與備註會一起帶過去。請依新順序確認交通。</p>`:'';
 const form=field('date','日期',item?.date||itineraryDay||today(),'date','required')+transferActions+
  timing+
  field('place','地點名稱',item?.place||'','text','required maxlength="120" placeholder="例如：廣藏市場"')+
  placeDetails+transportDetails+
  `<label for="itinerarySharedNote">備註（所有成員可見）</label>
  <textarea class="itinerary-note itinerary-note-fit" id="itinerarySharedNote" name="sharedNote" rows="1" maxlength="1000">${esc(item?.sharedNote||'')}</textarea>`+
  (canEditPersonalNote?`
  <label for="itineraryPersonalNote">🔒 備註（僅自己可見）</label>
  <textarea class="itinerary-note itinerary-note-fit" id="itineraryPersonalNote" name="personalNote" rows="1" maxlength="1000">${esc(item?.personalNote||'')}</textarea>`:'')+
  '<p class="hint">地點資訊與共用備註會顯示給此帳本的成員。</p>'+
  (item?.canEdit?'<button type="button" id="deleteItinerary" class="quiet danger">刪除行程</button>':'');
 let transferMode='',copyId,saved;
 modal(item?'編輯行程':'新增行程',form,'儲存行程',async f=>{
  const place=f.get('place').trim();
  if(!place)throw Error('請填寫地點');
  const date=f.get('date'),time=f.get('time'),endTime=f.get('endTime');
  if(transferMode&&date===item.date)throw Error('請選擇和原行程不同的日期');
  if(endTime&&(!time||endTime<=time))throw Error('結束時間須晚於同一天的開始時間');
  const transport=transportReady?[0,1].map(index=>({
   method:f.get('transportMethod'+index).trim(),duration:f.get('transportDuration'+index).trim(),
   cost:f.get('transportCost'+index).trim()
  })):undefined;
  // The server omits empty options, so a lone car option needs an identifiable method.
  if(transport&&!Object.values(transport[0]).some(Boolean)&&Object.values(transport[1]).some(Boolean)&&!isCarTransport(transport[1])){
   const option=transport[1];
   option.method=option.method?`搭車：${option.method}`:'搭車';
   if(option.method.length>240)throw Error('搭車的交通備註請縮短至 237 字以內');
  }
  const copying=transferMode==='copy';
  const savedId=copying?(copyId||=uid()):id;
  const sharedOnly=!canEditPersonalNote&&!copying;
  await api('saveItinerary',{groupId:g.id,id:savedId,revision:copying?'':item?.revision||item?.sharedRevision||'',date,time,place,
   ...(transportReady?{transport}:{}),
   ...(timeRangeReady?{endTime}:{}),
   ...(placeDetailsReady?{address:f.get('address').trim(),openingHours:f.get('openingHours').trim()}:{}),
   sharedNote:f.get('sharedNote').trim(),...(sharedOnly?{sharedOnly:true}:{personalNote:(f.get('personalNote')||'').trim()})});
  const message=copying?'行程已複製':transferMode==='move'?'行程已移動':'行程已儲存';
  try{
   const view=await loadItinerary({book:g.id,account:openedView.account});
   saved={view,id:savedId,date,stay:!copying&&item?.date===date};
   toast(message);
  }catch{
   toast(message+'，請同步帳本查看最新內容');
  }
 },()=>{
  $('modal').close();
  const current=group();
  if(!saved||tab!=='itinerary'||current?.id!==g.id||itineraryView!==openedView)return;
  itineraryView=saved.view;
  if(!saved.stay)itineraryDay=saved.date;
  renderItinerary(current,content);
  const days=content.querySelector('.itinerary-days');
  if(saved.stay&&days&&dayOffset!==undefined)days.scrollLeft=dayOffset;
  const editButton=[...content.querySelectorAll('[data-itinerary]')].find(button=>button.dataset.itinerary===saved.id);
  if(!editButton)return;
  const card=editButton.closest('.itinerary-item');
  requestAnimationFrame(()=>{
   if(!card.isConnected||$('modal').open)return;
   editButton.focus({preventScroll:true});
   if(saved.stay&&originalTop!==undefined){
    const header=document.querySelector('header');
    const top=header&&getComputedStyle(header).position==='sticky'?header.getBoundingClientRect().bottom:0;
    window.scrollBy(0,card.getBoundingClientRect().top-Math.max(originalTop,top+8));
   }else{
    card.scrollIntoView({block:'center'});
   }
  });
 });
 const fields=$('fields');
 const transferButtons=fields.querySelectorAll('[data-itinerary-transfer]');
 transferButtons.forEach(button=>{
  button.onclick=()=>{
   if($('submit').disabled)return;
   const mode=button.dataset.itineraryTransfer;
   transferMode=transferMode===mode?'':mode;
   transferButtons.forEach(option=>option.setAttribute('aria-pressed',String(option.dataset.itineraryTransfer===transferMode)));
   $('itineraryTransferHint').hidden=!transferMode;
   $('submit').textContent=transferMode==='copy'?'複製行程':transferMode==='move'?'移動行程':'儲存行程';
   $('formError').textContent='';
   if(transferMode){
    const dateField=$('f-date');
    dateField.focus();
    try{dateField.showPicker?.()}catch{}
   }
  };
 });
 const fitNotes=()=>{
  if(CSS.supports('field-sizing','content'))return;
  fields.querySelectorAll('.itinerary-note-fit').forEach(note=>{
   if(!note.offsetWidth)return;
   note.style.height='auto';
   note.style.height=`${note.scrollHeight+note.offsetHeight-note.clientHeight}px`;
  });
 };
 fields.querySelectorAll('.itinerary-note-fit').forEach(note=>note.oninput=fitNotes);
 fitNotes();
 if(transportReady){
  const editor=fields.querySelector('.itinerary-transport-editor');
  const buttons=[...editor.querySelectorAll('button[aria-controls]')];
  buttons.forEach(button=>{
   button.onclick=()=>{
    buttons.forEach(option=>{
     const selected=option===button;
     option.setAttribute('aria-pressed',String(selected));
     $(option.getAttribute('aria-controls')).hidden=!selected;
    });
    fitNotes();
   };
  });
 }
 if(item?.canEdit)$('deleteItinerary').onclick=()=>{
  modal('刪除行程',`<p>確定刪除「${esc(item.place)}」？</p>`,'確認刪除',async()=>{
   await api('deleteItinerary',{groupId:g.id,id,revision:item.revision});
   if(group()?.id===g.id&&tab==='itinerary'){
    itineraryView=null;
    render();
   }
   toast('行程已刪除');
  });
 };
}
function noteImages(note){
 if(!Array.isArray(note?.images))return [];
 return note.images.filter(src=>typeof src==='string'&&/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(src));
}
async function loadNotePhotos(g,note){
 if(!note.imageCount)return noteImages(note);
 const result=await api('getNoteImages',{groupId:g.id,noteId:note.id});
 return noteImages(result);
}
let bookNoteCategory='';
let notePhotoObserver;
const purchaseCelebrations=[
 '恭喜找到了🎉 記得是免稅不是免費💸',
 '來都來了 就買吧',
 '回去別搭地鐵了 坐車吧',
 '還是得買買買啊，拒絕內耗，快樂的源泉',
 '不買的話 台灣是不是就沒那麼便宜了？',
 '不買好像就虧了一個億',
 '賺多少錢沒辦法決定妳的快樂 但花錢可以',
 '鈔票放著會變多嗎？ 那妳還不花',
 '小孩才做選擇 我全都要',
 '買買買買買買買買',
 '不對自己好 誰會對妳好',
 '錢錢沒有不見 只是妳需要那個酷東西',
 '沒關係～餓幾餐而已 就買吧',
 '錢就是可以買到快樂🎊',
 '買的不是東西，是一趟不留遺憾的旅程 ✨',
 '猶豫一分鐘，快樂就少了六十秒',
 '這不是亂買，是認真支持韓國經濟 🇰🇷',
 '行李箱還有空位，它在暗示妳什麼 🧳',
 '這個價格錯過了，回飯店會睡不著吧？',
 '妳不是花錢，妳是在替回憶找紀念品 📸',
 '錢包瘦一點，行李箱胖一點，剛剛好',
 '恭喜解鎖新戰利品！下一個目標在哪裡 🔍'
];
let lastPurchaseCelebration=-1;
const pendingNotePurchases=new Set();
function showPurchaseCelebration(noteId,title){
 let index=Math.floor(Math.random()*purchaseCelebrations.length);
 if(index===lastPurchaseCelebration)index=(index+1)%purchaseCelebrations.length;
 lastPurchaseCelebration=index;
 const dialog=document.createElement('dialog');
 dialog.className='purchase-celebration';dialog.id='purchaseCelebration';
 dialog.setAttribute('aria-labelledby','purchaseCelebrationTitle');
 dialog.innerHTML=`<div class="dialog-head"><h2 id="purchaseCelebrationTitle">已買到 🎉</h2><button type="button" class="quiet" aria-label="關閉購物語錄">✕</button></div><p class="purchase-item-name">${esc(title)}</p><p class="purchase-quote">${esc(purchaseCelebrations[index])}</p><button type="button" class="purchase-done">開心收下！</button>`;
 document.body.append(dialog);
 dialog.querySelectorAll('button').forEach(button=>button.onclick=()=>dialog.close());
 dialog.addEventListener('close',()=>{dialog.remove();const checkbox=[...document.querySelectorAll('[data-note-purchased]')].find(input=>input.dataset.notePurchased===noteId);checkbox?.focus({preventScroll:true});},{once:true});
 dialog.showModal();
}
async function toggleNotePurchased(g,note,input){
 const key=g.id+':'+note.id;
 if(pendingNotePurchases.has(key))return;
 const purchased=input.checked,category=bookNoteCategory;
 pendingNotePurchases.add(key);input.disabled=true;
 try{
  const next={...note,purchased};
  await saveBookNote(g,note,next);
  if(group()?.id===g.id&&tab==='notes'&&bookNoteCategory===category){
   if(purchased&&!document.querySelector('dialog[open]'))showPurchaseCelebration(note.id,note.title);
   else if(!purchased)toast('已取消勾選，恢復為尚未買到');
  }
 }catch(error){input.checked=note.purchased===true;toast(error.message||'儲存失敗，請再試一次');}
 finally{
  pendingNotePurchases.delete(key);input.disabled=false;
  if(group()?.id===g.id)document.querySelectorAll('[data-note-purchased]').forEach(checkbox=>{if(checkbox.dataset.notePurchased===note.id)checkbox.disabled=false});
 }
}
function renderBookNotes(g,c){
 notePhotoObserver?.disconnect();
 const notesByCategory=new Map();
 for(const note of g.bookNotes||[]){
  if(!notesByCategory.has(note.category))notesByCategory.set(note.category,[]);
  notesByCategory.get(note.category).push(note);
 }
 if(!notesByCategory.has(bookNoteCategory))bookNoteCategory='';
 const categories=[...notesByCategory.keys()];
 const categoryOffset=c.querySelector('.book-note-categories')?.scrollLeft||0;
 const picker=categories.length?`<div class="book-note-categories" role="group" aria-label="記事分類">
  ${['',...categories].map(category=>`<button type="button" class="quiet" data-book-note-category="${esc(category)}" aria-pressed="${category===bookNoteCategory}">${esc(category||'全部')}</button>`).join('')}
 </div>`:'';
 const visibleNotes=bookNoteCategory?[[bookNoteCategory,notesByCategory.get(bookNoteCategory)]]:[...notesByCategory];
 c.innerHTML=picker+(visibleNotes.map(([category,notes])=>`<section class="book-notes-category">
  ${bookNoteCategory?'':`<h3>${esc(category)}</h3>`}
  ${notes.map(note=>`<article class="book-note${note.purchased===true?' is-purchased':''}">
   <div class="book-note-heading"><div class="book-note-title"><label class="note-purchased-toggle"><input type="checkbox" data-note-purchased="${esc(note.id)}" ${note.purchased===true?'checked':''} ${pendingNotePurchases.has(g.id+':'+note.id)?'disabled':''} aria-label="${note.purchased===true?'取消已買到':'標記已買到'}：${esc(note.title)}"><span>${note.purchased===true?'已買到 ✓':'買到了打勾'}</span></label><h4>${esc(note.title)}</h4></div>
    <button type="button" class="quiet" data-edit-book-note="${esc(note.id)}" aria-label="編輯記事 ${esc(note.title)}">編輯</button></div>
   ${note.address||note.mapUrl?mapAddressMarkup(note.address,note.mapUrl,note.title):''}
   ${note.text?`<p>${esc(note.text)}</p>`:''}
   ${note.purchaseNote?`<div class="book-note-purchase"><strong>購買備註</strong><p>${esc(note.purchaseNote)}</p></div>`:''}
   <details class="book-note-korean">
    <summary>給店員看韓文</summary>
    <p lang="ko">이거 어디 있어요?</p>
    <p>請問這個在哪裡？</p>
   </details>
   <div class="book-note-photos">${note.imageCount?'<button type="button" class="quiet" data-load-note-photos="'+esc(note.id)+'">查看 '+note.imageCount+' 張圖片</button>':''}${noteImages(note).map((src,index)=>`<button type="button" class="expense-photo-thumb" data-book-note-photo="${esc(note.id)}" data-photo-index="${index}" aria-label="放大 ${esc(note.title)} 的圖片 ${index+1}"><img loading="lazy" src="${esc(src)}" alt=""></button>`).join('')}</div>
  </article>`).join('')}
 </section>`).join('')||'<div class="empty"><p>還沒有記事。可以把商品照片、想買的規格和分店找貨進度放在同一篇。</p></div>');
 const categoryBar=c.querySelector('.book-note-categories');
 if(categoryBar){
  categoryBar.scrollLeft=categoryOffset;
  categoryBar.querySelectorAll('[data-book-note-category]').forEach(button=>{
   button.onclick=()=>{
    if(bookNoteCategory===button.dataset.bookNoteCategory)return;
    bookNoteCategory=button.dataset.bookNoteCategory;
    renderBookNotes(g,c);
    c.querySelector('.book-note-categories [aria-pressed="true"]').focus({preventScroll:true});
   };
  });
 }
 c.querySelectorAll('[data-note-purchased]').forEach(input=>{input.onchange=()=>{const note=g.bookNotes.find(item=>item.id===input.dataset.notePurchased);if(note)toggleNotePurchased(g,note,input);};});
 c.querySelectorAll('[data-edit-book-note]').forEach(button=>{
  button.onclick=async()=>{
   button.disabled=true;
   try{
    const note=g.bookNotes.find(note=>note.id===button.dataset.editBookNote);
    const images=await loadNotePhotos(g,note);
    if(button.isConnected)editBookNote(g,note,images);
   }catch(e){toast(e.message)}
   finally{button.disabled=false}
  };
 });
 const photoObserver=notePhotoObserver=typeof IntersectionObserver==='function'?new IntersectionObserver((entries,observer)=>{
  for(const entry of entries){
   if(!entry.isIntersecting)continue;
   observer.unobserve(entry.target);
   if(entry.target.isConnected)entry.target.click();
  }
 },{rootMargin:'160px'}):null;
 c.querySelectorAll('[data-load-note-photos]').forEach(button=>{
  button.onclick=async()=>{
   photoObserver?.unobserve(button);
   button.disabled=true;
   button.textContent='圖片載入中…';
   try{
    const note=g.bookNotes.find(note=>note.id===button.dataset.loadNotePhotos);
    const images=await loadNotePhotos(g,note);
    if(!button.isConnected)return;
    const previews=images.map((src,index)=>{
     const preview=document.createElement('button'),image=document.createElement('img');
     preview.type='button';
     preview.className='expense-photo-thumb';
     preview.setAttribute('aria-label','放大圖片 '+(index+1));
     image.src=src;
     image.alt='';
     preview.append(image);
     preview.onclick=()=>viewPhoto(src,'note-'+(index+1)+'.jpg',true,{images,index});
     return preview;
    });
    button.replaceWith(...previews);
   }catch(e){if(button.isConnected){button.textContent='圖片載入失敗，點此重試';button.disabled=false}}
  };
  if(photoObserver)photoObserver.observe(button);
  else button.click();
 });
 c.querySelectorAll('[data-book-note-photo]').forEach(button=>{
  button.onclick=()=>{
   const note=g.bookNotes.find(note=>note.id===button.dataset.bookNotePhoto);
   const index=Number(button.dataset.photoIndex);
   const images=noteImages(note);
   viewPhoto(images[index],`note-${index+1}.jpg`,true,{images,index});
  };
 });
}
async function saveBookNote(g,previous,nextNote){
 const current=group();
 if(current?.id!==g.id)throw Error('帳本已切換，請重新開啟記事');
 const notes=current.bookNotes||[];
 const latest=notes.find(note=>note.id===(previous||nextNote).id);
 if(JSON.stringify(latest)===JSON.stringify(nextNote||undefined))return;
 if(JSON.stringify(latest)!==JSON.stringify(previous)){
  throw Error('這篇記事已更新，請重新開啟後再試');
 }
 const bookNotes=previous?notes.flatMap(note=>note.id===previous.id?(nextNote?[nextNote]:[]):[note]):[...notes,nextNote];
 const next={...structuredClone(current),bookNotes};
 const separateNoteImages=Boolean(g.cloud&&cfg.lineApiBase&&(await api('capabilities')).noteImageVersion>=1);
 if(!separateNoteImages&&nextNote&&JSON.stringify(next).length>500000)throw Error('帳本容量已滿，請減少圖片後再儲存');
 const selected=bookNoteCategory;
 await commit(next,{separateNoteImages});
 const updated=group();
 if(selected&&nextNote&&nextNote.category!==bookNoteCategory&&tab==='notes'&&updated?.id===g.id){
  bookNoteCategory=nextNote.category;
  renderBookNotes(updated,$('content'));
 }
}
function editBookNote(g,note,images=noteImages(note)){
 const notes=g.bookNotes||[];
 const categories=[...new Set(notes.map(entry=>entry.category))];
 const selected=note?.category||notes.at(-1)?.category||'';
 const id=note?.id||uid();
 let readImages;
 modal(note?'編輯記事':'新增記事',
  `<label for="f-noteCategory">分類</label>
   <select id="f-noteCategory" name="noteCategory">
    ${categories.map(category=>`<option value="${esc(category)}"${category===selected?' selected':''}>${esc(category)}</option>`).join('')}
    <option value="">＋ 新增分類</option>
   </select>
   <div id="noteCategoryNew"${selected?' hidden':''}>${
    field('noteCategoryName','新分類名稱','','text','required maxlength="40" placeholder="例如：購物清單"'+(selected?' disabled':''))
   }</div>`+
  field('noteTitle','標題',note?.title||'','text','required maxlength="120" placeholder="例如：Olive Young 找貨清單"')+
  field('noteAddress','地址（選填）',note?.address||'','text','maxlength="240" placeholder="例如：서울 종로구 율곡로1길 7"')+
  mapUrlField(note?.mapUrl)+
  `<label for="bookNoteText">文字</label>
   <textarea class="itinerary-note" id="bookNoteText" name="noteText" rows="5" maxlength="6000" placeholder="記下商品名稱、色號、去過的分店和找貨進度">${esc(note?.text||'')}</textarea>
   <label for="bookNotePurchase">購買備註（選填）</label>
   <textarea class="itinerary-note itinerary-note-fit" id="bookNotePurchase" name="purchaseNote" rows="2" maxlength="2000" placeholder="例如：買 2 盒、要 02 色，缺貨可換 03 色">${esc(note?.purchaseNote||'')}</textarea>
   <div id="photoEditor"></div>
   ${g.cloud?'<p class="hint">記事與圖片會同步給此帳本的成員。</p>':''}
   ${note?'<button type="button" id="removeBookNote" class="quiet danger">刪除記事</button>':''}`,
  '儲存記事',async form=>{
   const category=(form.get('noteCategory')||form.get('noteCategoryName')||'').trim();
   const title=form.get('noteTitle').trim();
   if(!category||!title)throw Error('請填寫分類和標題');
   const address=form.get('noteAddress').trim(),mapUrl=readMapUrl(form);
   const purchaseNote=form.get('purchaseNote').trim();
   await saveBookNote(g,note,{id,category,title,text:form.get('noteText').trim(),images:[...await readImages()],
    ...(note?.purchased===true?{purchased:true}:{}),
    ...(purchaseNote?{purchaseNote}:{}),...(address?{address}:{}),...(mapUrl?{mapUrl}:{})});
  });
 const categoryPicker=$('f-noteCategory'),categoryName=$('f-noteCategoryName');
 categoryPicker.onchange=()=>{
  const creating=!categoryPicker.value;
  $('noteCategoryNew').hidden=categoryName.disabled=!creating;
  if(creating)categoryName.focus();
 };
 const photoLimit=g.cloud&&cfg.lineApiBase
  ? api('capabilities').then(cap=>cap.notePhotoVersion===1?240000:54000,()=>54000)
  : 54000;
 readImages=imageEditor(images,3,{maxLength:photoLimit,caption:'記事圖片',filenamePrefix:'note'});
 if(note)$('removeBookNote').onclick=()=>{
  if($('submit').disabled)return;
  modal('刪除記事',`<p>確定移除「${esc(note.title)}」和附在這篇記事的圖片？</p>
   <button type="button" class="quiet" id="cancelRemoveBookNote">取消</button>`,
   '確認刪除',()=>saveBookNote(g,note,null));
  $('cancelRemoveBookNote').onclick=()=>{if(!$('submit').disabled)editBookNote(g,note,images)};
 };
}
function render(){const g=group();
 const bookKey=g?preferenceKey('book',g.id):'';
 if(openedBook!==bookKey){
  openedBook=bookKey;
  tab=g?pinnedTab(g)||'expenses':'expenses';
  itineraryView=null;
  itineraryDay='';
  bookNoteCategory='';
  if(g)try{localStorage.setItem(preferenceKey('current'),g.id)}catch{}
 }
 if(tab!=='itinerary')itineraryView=null;
if(tab!=='notes')notePhotoObserver?.disconnect();
if(tab!=='phrases')stopTravelSpeech();
document.body.classList.toggle('has-books',!!g);const picker=$('bookPicker');if(picker){picker.innerHTML=activeGroups().map(x=>`<option value="${esc(x.id)}" ${x.id===g?.id?'selected':''}>${esc(x.name)}</option>`).join('');picker.onchange=()=>{state.current=picker.value;persist();render()};$('mobileNew').onclick=newGroup;}if(cfg.lineApiBase&&$('emptyTitle')){$('emptyTitle').textContent=cloud()?'尚未建立帳本':'登入後查看帳本';$('emptyCreate').textContent=cloud()?'建立帳本':'LINE 登入'}$('groupCount').textContent=activeGroups().length;$('groups').innerHTML=activeGroups().map(x=>`<button class="group ${x.id===g?.id?'selected':''}" data-group="${x.id}">▤ ${esc(x.name)}<small>${x.members.length} 位成員 · ${x.expenses.length} 筆費用${x.cloud?' · 共用':''}</small></button>`).join('');$('groups').querySelectorAll('button').forEach(b=>b.onclick=()=>{state.current=b.dataset.group;persist();render()});$('empty').hidden=!!g;$('book').hidden=!g;if(!g)return;$('deleteBook').hidden=g.cloud&&g.canDelete!==true;$('revokeInvites').hidden=!g.cloud||g.canDelete!==true;$('invite').hidden=g.cloud&&g.canDelete!==true;$('bookTitle').textContent=g.name;$('bookMeta').textContent=`建立日期 ${g.created}`;
 const member=signedInMember(g);
 const personalTotal=$('personalTotal');
 personalTotal.textContent=member?'NT$ '+briefMoney(personalExpenseTotal(g,member.id)):'—';
 personalTotal.title=member?'你的分攤金額合計':'登入並配對帳本成員後即可查看';
 $('memberCount').textContent=g.members.length+' 人';$('expenseCount').textContent=g.expenses.length+' 筆';document.querySelectorAll('[data-tab]').forEach(b=>{
  const active=b.dataset.tab===tab;
  b.classList.toggle('active',active);
  b.classList.toggle('pinned',b.dataset.tab===pinnedTab(g));
  b.setAttribute('aria-pressed',String(active));
 });
 const pin=$('pinTab'),pinned=pinnedTab(g)===tab;
 pin.setAttribute('aria-pressed',String(pinned));
 pin.setAttribute('aria-label',pinned?`取消置頂：${bookTabs[tab]}`:`設為預設頁面：${bookTabs[tab]}`);
 pin.title=pinned?'取消置頂':'設為預設頁面';
 $('addExpense').hidden=tab!=='expenses';
 $('expenseFooter').hidden=tab!=='expenses';
 $('addItinerary').hidden=tab!=='itinerary';
 $('addBookNote').hidden=tab!=='notes';
 $('addBookNote').onclick=()=>editBookNote(g);
 $('viewHint').textContent={phrases:'中韓對照 · 點句子放大給對方看',notes:'依分類查看文字與圖片',itinerary:'依日期查看行程',expenses:'費用紀錄與換算明細',
  balances:'成員餘額 · 點金額查看計算明細',members:'管理帳本的分攤成員'}[tab];
 const c=$('content');
 if(tab==='phrases'){renderTravelPhrases(c);return}
 if(tab==='notes'){renderBookNotes(g,c);return}
 if(tab==='itinerary'){renderItinerary(g,c);return}
 if(tab==='expenses'){c.innerHTML=g.expenses.length?expenseDays(g.expenses).map(day=>`<section class="expense-day"><div class="day-heading"><h3>${esc(day.date)}</h3><span>${day.expenses.length} 筆 · NT$ ${money(day.total)}</span></div>${day.expenses.map(e=>`<button type="button" class="expense expense-summary shared-expense" data-expense="${esc(e.id)}" aria-label="查看費用：${esc(e.title)}"><span class="icon">${esc(e.category==='🧋'?'🥤':e.category)}</span><span class="detail"><strong>${esc(e.title)}</strong><small>${esc(name(g,e.payer))} 先付</small><span class="paid-total">NT$ ${briefMoney(e.baseCents)}</span></span><span class="amount"><small>${e.split.length} 人 · 各付</small>${e.baseCents%e.split.length?'約 ':''}NT$ ${briefMoney(Math.round(e.baseCents/e.split.length))}</span></button>`).join('')}</section>`).join(''):'<div class="empty"><div class="empty-symbol">▤</div><p>尚無費用，請點「記一筆」新增。</p></div>';c.querySelectorAll('[data-expense]').forEach(b=>b.onclick=()=>showExpense(b.dataset.expense))}else if(tab==='members'){c.innerHTML=g.members.map(m=>`<div class="person"><span class="avatar" aria-hidden="true">${memberAvatar(m)}</span><span class="detail">${esc(m.lineName||m.name)}${m.lineName&&m.lineName!==m.name?`<small>帳本暱稱：${esc(m.name)}</small>`:''}${cfg.lineApiBase&&(m.id===window.WarmCloud?.user()?.uid||m.lineUserId===window.WarmCloud?.user()?.uid)?'<small>你</small>':cfg.lineApiBase?`<small>${m.lineUserId||/^U[0-9a-f]{32}$/.test(m.id)?'已加入':'待配對'}</small>`:''}</span></div>`).join('')+(cfg.lineApiBase?`<p class="hint">只有加入此帳本的成員可以查看與記帳。${g.canDelete?'使用上方「邀請成員」分享加入連結。':'由帳本建立者邀請新成員。'}</p>`:'<button id="addMember" class="quiet" style="margin-top:20px">＋ 加入成員</button>');if(cfg.lineApiBase){const pay=document.createElement('button');pay.textContent='設定我的收款資訊';pay.className='quiet';pay.onclick=()=>openPayment(g.id, g.members.find(m=>m.id===window.WarmCloud?.user()?.uid||m.lineUserId===window.WarmCloud?.user()?.uid)?.id);c.append(pay)}if(cfg.lineApiBase&&g.canDelete){const add=document.createElement('button');add.textContent='＋ 預設成員';add.className='quiet';add.onclick=()=>modal('預設成員',field('name','成員暱稱','','text','required maxlength="40"')+'<p class="hint">可先替此成員記帳，朋友登入 LINE 後再認領。</p>','新增成員',async f=>{await requireMemberVersion();const r=await api('addMember',{groupId:g.id,name:f.get('name')});state.groups[state.groups.findIndex(x=>x.id===g.id)]=r.group;persist();render()});c.append(add)}if(!cfg.lineApiBase){$('addMember').onclick=()=>modal('新增成員',field('name','成員暱稱','','text','required maxlength="40"'),'加入',async f=>{const n=f.get('name').trim();if(!n||g.members.some(m=>m.name===n))throw Error('請輸入不同的暱稱');const next=structuredClone(g);next.members.push({id:uid(),name:n});await commit(next)})}}else{const b=balances(g),p=plan(g);c.innerHTML=mySettlement(g,p)+'<div class="balance-board">'+balanceRows(g,b)+'</div>'+suggestedTransfers(g,p,c)+repaymentHistory(g,c);c.querySelectorAll('[data-balance-member]').forEach(button=>{button.onclick=()=>showBalanceDetails(button.dataset.balanceMember)});
 c.querySelectorAll('[data-settle]').forEach(button=>{
  button.onclick=()=>{
   const transfer=p[Number(button.dataset.settle)];
   if(transfer)openRepaymentEditor(g,{...transfer,id:uid(),date:today()});
  };
 });
 c.querySelectorAll('[data-edit-payment]').forEach(button=>{
  button.onclick=()=>{
   const payment=g.settlements.find(item=>item.id===button.dataset.editPayment);
   if(payment)openRepaymentEditor(g,payment,{existing:true});
  };
 });
 c.querySelectorAll('[data-undo]').forEach(button=>{button.onclick=()=>undoRepayment(g,button.dataset.undo)});
}}



function repaymentSection(title,kind,book,container,groups,count,empty=''){
 const previous=container.querySelector(`[data-settlement-section="${kind}"]`);
 const openGroups=new Set(previous?.dataset.bookId===book.id
  ? Array.from(previous.querySelectorAll('details[open]'),item=>item.dataset.repaymentGroup)
  : []);
 const sections=Array.from(groups,([key,entry])=>`
  <details class="repayment-group" data-repayment-group="${esc(key)}"${openGroups.has(key)?' open':''}>
   <summary><span class="repayment-label">${esc(entry.title)}</span><small>${entry.rows.length} 筆 · NT$ ${money(entry.total)}</small></summary>
   ${entry.rows.join('')}
  </details>`).join('');
 return `<section class="repayment-history" data-settlement-section="${kind}" data-book-id="${esc(book.id)}">
  <h3 class="repayment-section-title"><span class="repayment-label">${title}</span><small>${count} 筆</small></h3>
  <div class="repayment-groups">${sections||empty}</div>
 </section>`;
}

function suggestedTransfers(g,transfers,container){
 const groups=new Map();
 transfers.forEach((s,i)=>{
  if(!groups.has(s.from))groups.set(s.from,{title:name(g,s.from),rows:[],total:0});
  const entry=groups.get(s.from);
  entry.total+=s.amount;
  entry.rows.push(`<div class="transfer"><span class="detail">${esc(name(g,s.from))} → ${esc(name(g,s.to))}<small>NT$ ${money(s.amount)}</small></span><div class="expense-actions"><button class="quiet" data-payment="${s.to}">轉帳資訊</button><button class="quiet" data-settle="${i}">記錄已付款</button></div></div>`);
 });
 return repaymentSection('建議轉帳方式','suggestions',g,container,groups,transfers.length,'<p class="hint">目前沒有待結清款項</p>');
}

function mySettlement(book,transfers){
 const member=signedInMember(book);
 if(!member)return '';
 const outgoing=transfers.filter(item=>item.from===member.id);
 const incoming=transfers.filter(item=>item.to===member.id);
 const total=items=>items.reduce((sum,item)=>sum+item.amount,0);
 const rows=(items,out)=>items.map(item=>{
  const other=out?item.to:item.from;
  return `<div class="transfer my-transfer"><span class="detail">${out?'付給':'由'} ${esc(name(book,other))}${out?'':'付款'}<small>NT$ ${money(item.amount)}</small></span>${out?`<button type="button" class="quiet" data-payment="${esc(other)}">轉帳資訊</button>`:''}</div>`;
 }).join('');
 return `<section class="my-settlement">
  <h3>我的結算</h3>
  <div class="my-settlement-totals"><div><small>待付</small><strong>NT$ ${money(total(outgoing))}</strong></div><div><small>待收</small><strong>NT$ ${money(total(incoming))}</strong></div></div>
  ${rows(outgoing,true)+rows(incoming,false)||'<p class="hint">目前已結清</p>'}
  <button type="button" class="quiet" data-balance-member="${esc(member.id)}">查看我的餘額明細</button>
 </section>`;
}

function repaymentHistory(book,container){
 if(!book.settlements.length)return '';
 const titles=new Map(book.expenses.map(expense=>[expense.id,expense.title]));
 const groups=new Map();
 for(const payment of book.settlements){
  const parts=paymentApplications(payment);
  const unassigned=unassignedPayment(payment);
  const single=parts.length===1&&unassigned===0;
  const key=single?'expense:'+parts[0].expenseId:parts.length?'multi':'general';
  const title=single?titles.get(parts[0].expenseId)||'指定費用':parts.length?'跨費用還款':'整本帳本還款';
  if(!groups.has(key))groups.set(key,{title,rows:[],total:0});
  const entry=groups.get(key);
  const applications=parts.map(part=>`<small>${esc(titles.get(part.expenseId)||'指定費用')} · NT$ ${money(part.amount)}</small>`).join('');
  const remainder=parts.length&&unassigned>0?`<small>尚未分配 · NT$ ${money(unassigned)}</small>`:'';
  entry.rows.push(`<div class="transfer"><span class="detail">${esc(name(book,payment.from))} → ${esc(name(book,payment.to))}<small>${esc(payment.date||'未記錄日期')} · NT$ ${money(payment.amount)}</small>${single?'':applications+remainder}</span><div class="expense-actions"><button type="button" class="quiet" data-edit-payment="${esc(payment.id)}">更正</button><button type="button" class="quiet" data-undo="${esc(payment.id)}">撤銷</button></div></div>`);
  entry.total+=payment.amount;
 }
 return repaymentSection('已記錄還款','repayments',book,container,groups,book.settlements.length);
}

async function commit(next,options){await save(next,options);state.groups[state.groups.findIndex(g=>g.id===next.id)]=next;persist();render()}
async function editExpense(id){const g=group(),e=g.expenses.find(e=>e.id===id);const draftId=e?.id||uid();let images=[],imageRevision='',photoAvailable=true,readImages=null,expenseSaved=false;if(e&&cfg.lineApiBase){try{await requireMedia();const data=await api('getExpenseImages',{groupId:g.id,expenseId:e.id});images=data.images;imageRevision=data.revision}catch(error){photoAvailable=false;toast('圖片暫時無法載入，可先編輯費用：'+error.message)}}if(group()?.id!==g.id)return;const initialImages=JSON.stringify(images);const opt=(v,label)=>`<option value="${v}" ${e?.currency===v?'selected':''}>${label}</option>`;modal(e?'編輯這筆費用':'新增費用',field('title','花費名稱',e?.title||'','text','required maxlength="80" placeholder="例如：安國的午餐"')+'<div class="row"><div>'+field('amount','原幣金額',e?.amount||'','number','required min="0.01" max="1000000000" step="0.01"')+'</div><div><label for="currency">幣別</label><select id="currency" name="currency">'+[['TWD','TWD 新台幣'],['KRW','KRW 韓元'],['JPY','JPY 日圓'],['USD','USD 美元'],['EUR','EUR 歐元'],['CNY','CNY 人民幣'],['HKD','HKD 港幣'],['THB','THB 泰銖']].map(a=>opt(...a)).join('')+'</select></div></div>'+field('rate','當時匯率：1 單位外幣 = 多少 TWD',e?.rate||1,'number','required min="0.000001" max="1000000" step="any"')+'<p class="hint" id="conversion"></p><div class="row date-category-row"><div>'+field('date','消費日期',e?.date||today(),'date','required')+'</div><div><label for="category">分類</label><select id="category" name="category">'+[["🍴","餐飲"],["🍳","早餐"],["🍜","麵食"],["🍚","正餐"],["🍖","烤肉"],["🍣","日式料理"],["🍕","速食"],["☕","咖啡"],["🥤","飲料"],["🍰","甜點"],["🍦","冰品"],["🍺","酒水"],["🏠","住宿"],["🏨","飯店"],["🚕","計程車"],["🚇","地鐵"],["🚌","公車"],["🚆","火車"],["✈️","機票"],["🚗","租車"],["⛽","加油"],["🅿️","停車"],["🛍","購物"],["🛒","超市"],["👕","衣服"],["👟","鞋子"],["💄","美妝"],["🎁","伴手禮"],["🎟","門票"],["🎢","遊樂園"],["🎬","電影"],["🎤","唱歌"],["🎮","遊戲"],["🏛️","展覽"],["💆","按摩"],["💊","藥品"],["🏥","醫療"],["📱","網路／SIM 卡"],["🧺","洗衣"],["🧾","其他"]].map(([v,label])=>`<option value="${v}" ${(e?.category==='🧋'?'🥤':e?.category)===v?'selected':''}>${v} ${label}</option>`).join('')+'</select></div></div><label for="payer">誰先付款？</label><select id="payer" name="payer">'+g.members.map(m=>`<option value="${m.id}" ${e?.payer===m.id?'selected':''}>${esc(m.name)}</option>`).join('')+'</select><label>分給誰？（平均分攤）</label>'+g.members.map(m=>`<label class="check"><input type="checkbox" name="split" value="${m.id}" ${!e||e.split.includes(m.id)?'checked':''}>${esc(m.name)}</label>`).join('')+'<h3 class="expense-photo-heading">收據／照片（選填）</h3>'+(photoAvailable?'<div id="photoEditor"></div>':'<p class="hint">圖片暫時無法載入，原有圖片會保留。請稍後重試。</p>')+(e?'<p><button type="button" id="removeExpense" class="quiet">刪除這筆費用</button></p>':''),'儲存這筆費用',async f=>{const currency=f.get('currency'),amount=Number(f.get('amount')),rate=currency==='TWD'?1:Number(f.get('rate')),split=f.getAll('split'),baseCents=Math.round(amount*rate*100);if(!split.length)throw Error('請至少選擇一位分攤成員');if(!Number.isSafeInteger(baseCents)||baseCents<1||!Number.isFinite(rate)||rate<=0)throw Error('請確認金額與匯率');const title=f.get('title').trim();if(!title)throw Error('請填寫花費名稱');const expense={id:draftId,title,amount,currency,rate,baseCents,split,payer:f.get('payer'),date:f.get('date'),category:f.get('category'),created:e?.created||Date.now()};const selectedImages=readImages?await readImages():images,imagesChanged=photoAvailable&&JSON.stringify(selectedImages)!==initialImages;if(imagesChanged)await requireMedia();const latest=state.groups.find(x=>x.id===g.id);if(!latest||latest.deletedAt)throw Error('帳本已變更，請重新開啟');const next=structuredClone(latest),index=next.expenses.findIndex(x=>x.id===draftId);if(e&&index<0)throw Error('這筆費用已被刪除，請重新同步');if(index>=0){
 const prior=next.expenses[index];
 if(next.settlements.some(s=>paymentApplications(s).some(part=>part.expenseId===draftId))){
  const priorShares=new Map(allocations(prior).map(a=>[a.id,a.amount]));
  const nextShares=allocations(expense);
  if(prior.payer!==expense.payer||nextShares.length!==priorShares.size||nextShares.some(a=>priorShares.get(a.id)!==a.amount))throw Error('請先到分帳結算撤銷這筆費用的付款紀錄，再修改分攤金額或付款人。');
 }
 next.expenses[index]=expense;
}else next.expenses.push(expense);await commit(next);expenseSaved=true;if(imagesChanged){try{const result=await api('saveExpenseImages',{groupId:g.id,expenseId:draftId,images:selectedImages,revision:imageRevision});imageRevision=result.revision}catch(error){throw Error('費用已儲存，圖片尚未儲存。請再按儲存重試；不會重複新增費用。'+error.message)}}toast('費用'+(imagesChanged?'與圖片':'')+'已儲存')});if(photoAvailable)readImages=imageEditor(images,3);const update=()=>{const twd=$('currency').value==='TWD';$('f-rate').readOnly=twd;if(twd)$('f-rate').value=1;$('conversion').textContent=`換算約 NT$ ${money(Math.round(Number($('f-amount').value)*Number($('f-rate').value)*100))}，此匯率只套用到本筆費用。`};['currency','f-amount','f-rate'].forEach(id=>$(id).oninput=update);update();if(e)$('removeExpense').onclick=()=>{modal('刪除費用',`<p>確定刪除「${esc(e.title)}」？</p>`,'確定刪除',async()=>{const latest=group();if(latest?.id!==g.id)throw Error('帳本已更新，請重新開啟');if(latest.settlements.some(s=>paymentApplications(s).some(part=>part.expenseId===e.id)))throw Error('請先到分帳結算撤銷這筆費用的付款紀錄，再刪除費用。');const next=structuredClone(latest);next.expenses=next.expenses.filter(x=>x.id!==e.id);await commit(next)})}}
async function requireMemberVersion(){try{const cap=await api('capabilities');if(cap.membershipVersion<3)throw Error('version')}catch(e){if(e.code==='line-auth'||e.status===401)throw e;if(e.status===400||e.message==='version'||e.message==='未知操作')throw Error('邀請功能尚未啟用，請先完成後端更新。現有帳本仍可記帳。');throw e}}
async function invite(){const g=group();if(!g.cloud){if(!cloud()){toast(cfg.lineApiBase?'請先點右上角 LINE 登入':'請先點右上角 Google 共用登入，即可免費共用帳本');return}modal('啟用多人共用','<p>將這本帳本上傳至雲端，之後可透過邀請連結加入。</p>','啟用共用',async()=>{const r=await api('create',{group:g});state.groups[state.groups.findIndex(x=>x.id===g.id)]=r.group;persist();render();toast('已啟用共用，請再點邀請成員')});return}try{if(cfg.lineApiBase)await requireMemberVersion();const {invite}=await api('invite',{groupId:g.id});const url=new URL(location.href);url.search='';url.hash='join='+invite;const text=`邀請你加入「${g.name}」帳本\n${url.href}`;if(ready&&liff.isApiAvailable('shareTargetPicker')){await liff.shareTargetPicker([{type:'text',text}])}else{try{await navigator.clipboard.writeText(text);toast('邀請連結已複製，可貼到 LINE 給成員')}catch{modal('分享邀請連結',`<p>將以下連結傳給要加入此帳本的朋友。</p><label for="inviteLink">邀請連結</label><input id="inviteLink" readonly value="${esc(url.href)}"><p class="hint">長按連結即可複製。只有加入此帳本的人才能查看內容。</p>`,'完成',async()=>{})}}}catch(e){toast(e.message)}}
function exportCSV(){const g=group();const rows=[['日期','項目','幣別','原幣金額','匯率（TWD/原幣）','台幣金額','付款人','分攤成員'],...g.expenses.map(e=>[e.date,e.title,e.currency,e.amount,e.rate,(e.baseCents/100).toFixed(2),name(g,e.payer),e.split.map(id=>name(g,id)).join('、')])];const safe=s=>/^[=+@\-\t\r]/.test(String(s))?"'"+s:String(s);const blob=new Blob(['\ufeff'+rows.map(r=>r.map(s=>'"'+safe(s).replace(/"/g,'""')+'"').join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=g.name.replace(/[\\/:*?"<>|]/g,'_')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
async function initLINE(){if(!cfg.liffId)return;try{await (window.lineReady||(window.lineReady=liff.init({liffId:cfg.liffId})));ready=true;if(liff.isLoggedIn()){profile=await liff.getProfile();if(!cfg.lineApiBase)$('login').textContent=profile.displayName}}catch(e){toast('LINE 連線失敗：'+e.message)}}
async function syncCloud(){if(!cloud())return;const syncingUser=window.WarmCloud.user().uid;const {groups}=await api('list');if(window.WarmCloud.user()?.uid!==syncingUser)return;state.groups=[...state.groups.filter(g=>!g.cloud),...groups];if(!group()){
 const remembered=readPreference('current');
 state.current=(activeGroups().find(g=>g.id===remembered)||activeGroups()[0])?.id;
}persist();render()}
async function joinInvitation(){if(!location.hash.startsWith('#join='))return;if(!cloud()){toast('收到邀請，請先登入再選擇自己的角色');return}const token=location.hash.slice(6);try{let roles=[],title='加入朋友的帳本';if(cfg.lineApiBase){await requireMemberVersion();const p=await api('previewInvite',{invite:token});roles=p.roles;title=p.name; if(p.alreadyJoined)roles=[]}modal('加入：'+title,(roles.length?'<p>請選擇你自己，原有的費用與餘額會保留。</p>'+roles.map(m=>`<label class="check"><input type="radio" name="memberId" required value="${esc(m.id)}">${esc(m.name)}</label>`).join(''):'<p>以目前登入的帳號加入此帳本。</p>')+(cfg.lineApiBase?'<p class="hint">LINE 名稱與頭像會顯示給此帳本的成員。</p>':''),'確認加入',async f=>{const {group:g}=await api('join',{invite:token,memberId:f.get('memberId')||undefined});state.groups=state.groups.filter(x=>x.id!==g.id);state.groups.push(g);state.current=g.id;persist();history.replaceState(null,'',location.pathname);render()})}catch(e){toast(e.message)}}
function selectAfterDelete(){if(!group())state.current=activeGroups()[0]?.id;persist();render()}
function deleteBook(){const g=group();if(!g)return;modal('刪除帳本',`<p>將「${esc(g.name)}」移至已刪除帳本？</p><p class="hint">${g.cloud?'這會影響所有共用成員，僅建立者可以刪除及還原。':'此帳本將從目前清單移除。'}費用與還款紀錄會保留，可從「已刪除帳本」還原。</p>`,'移至已刪除帳本',async()=>{const next=structuredClone(g);next.deletedAt=Date.now();await commit(next);selectAfterDelete();toast('帳本已刪除，可從已刪除帳本還原')})}
function showTrash(){const deleted=state.groups.filter(g=>g.deletedAt&&(!cfg.lineApiBase||(cloud()&&g.cloud)));modal('已刪除帳本',deleted.length?deleted.map(g=>`<div class="person"><span class="detail">${esc(g.name)}<small>${g.expenses.length} 筆費用</small></span>${!g.cloud||g.canDelete?`<button type="button" class="quiet" data-restore="${g.id}">還原</button>`:'<small>由建立者還原</small>'}</div>`).join(''):'<p class="hint">目前沒有已刪除的帳本。</p>','關閉',async()=>{});$('fields').querySelectorAll('[data-restore]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const g=state.groups.find(g=>g.id===b.dataset.restore);const next=structuredClone(g);next.deletedAt=null;await commit(next);state.current=g.id;persist();render();$('modal').close();toast('帳本已還原')}catch(e){$('formError').textContent=e.message;b.disabled=false}})}
$('revokeInvites').onclick=()=>{const g=group();modal('停用既有邀請','<p>停用後，之前產生的邀請連結都無法再加入帳本。已加入的成員不受影響，之後可產生新邀請。</p>','停用邀請',async()=>{await api('revokeInvites',{groupId:g.id});toast('既有邀請已停用')})};$('deleteBook').onclick=deleteBook;$('trash').onclick=showTrash;
window.addEventListener('warm-auth',async e=>{const u=e.detail;if(cfg.lineApiBase)$('cloudLogin').hidden=true;$('cloudLogin').textContent=u?'Google：'+u.name:'Google 共用登入';$('status').textContent=u?'已連線':cfg.lineApiBase?'尚未登入':'本機帳本';if(cfg.lineApiBase)$('login').textContent=u?'LINE：'+u.name:'LINE 登入';if(cfg.lineApiBase){state.groups=state.groups.filter(g=>!g.cloud);state.current=null;render()}if(!u){state.groups=state.groups.filter(g=>!g.cloud);if(!group())state.current=activeGroups()[0]?.id;persist();render();return}try{await syncCloud();$('storageNote').textContent=cfg.lineApiBase?'LINE 登入即可共用帳本。點「同步」取得成員最新紀錄。':'舊版帳本：請從「舊帳本移轉」匯出，原資料仍保留。';joinInvitation()}catch(e){toast(e.message)}});
$('cloudLogin').onclick=async()=>{if(!window.WarmCloud){toast('雲端模組載入中，請稍後再試');return}if(cloud()){modal('Google 共用帳戶','<p>目前已登入，可以共用帳本。登出只會移除此瀏覽器的共用帳本快取，雲端資料仍保留。</p>','登出 Google',async()=>{await window.WarmCloud.logout()});return}try{await window.WarmCloud.login()}catch(e){toast(e.message)}};
$('refresh').onclick=async()=>{if(!cloud()){toast(cfg.lineApiBase?'請先登入 LINE':'請先登入 Google');return}try{itineraryView=null;await syncCloud();toast('已同步最新帳本')}catch(e){toast(e.message)}};

$('login').onclick=()=>{if(!cfg.liffId){toast('LINE 尚未設定，請先完成你的 LIFF 應用程式設定');return}if(!ready&&!cfg.lineApiBase){toast('LINE 初始化尚未成功，請重新整理後再試');return}if(cfg.lineApiBase){if(cloud()){modal('LINE 帳戶','<p>目前使用 LINE 帳號登入。每本帳本各自管理成員，你只會看到已加入的帳本。</p>',liff.isInClient()?'知道了':'登出 LINE',async()=>{if(!liff.isInClient())await window.WarmCloud.logout()});return}window.WarmCloud.login().catch(e=>toast(e.message));return}if(!liff.isLoggedIn())liff.login({redirectUri:location.href});else toast('你已登入 LINE')};$('settings').onclick=()=>modal('使用說明','<p>每本帳本分開管理成員。只有加入該帳本的人可以查看與記帳，建立者可邀請成員、停用邀請及刪除帳本。</p><p>外幣費用可逐筆設定匯率，結算以新台幣顯示。還款按鈕只記錄已付款，不會實際轉帳。</p><p class="hint">邀請連結不自動到期，請只傳給信任的人。可從帳本右上角「•••」同步資料、匯出或管理帳本。</p>','知道了',async()=>{});$('newGroup').onclick=$('emptyCreate').onclick=newGroup;$('close').onclick=()=>$('modal').close();$('addExpense').onclick=()=>editExpense();$('addItinerary').onclick=()=>editItinerary(group());$('pinTab').onclick=togglePinnedTab;$('invite').onclick=invite;$('export').onclick=exportCSV;document.querySelector('[data-tab="itinerary"]').hidden=!cfg.lineApiBase;document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render()});if(cfg.lineApiBase){state.groups=state.groups.filter(g=>!g.cloud);state.current=null}render();initLINE();if(location.hash.startsWith('#join='))setTimeout(joinInvitation,1000);

document.addEventListener('click',e=>{document.querySelectorAll('.book-menu[open]').forEach(menu=>{if(!menu.contains(e.target)||e.target.closest('button'))menu.open=false})});


function expensePosition(g,e,user){const me=g.members.find(m=>m.id===user||m.lineUserId===user);if(!me)return {label:'總額',amount:e.baseCents,kind:'total'};const own=allocations(e).find(a=>a.id===me.id)?.amount||0;if(e.payer===me.id){const amount=e.baseCents-own;return {label:amount?'應收':'自行負擔',amount:amount||own,kind:amount?'receivable':'self'}}return own?{label:'應付',amount:own,kind:'payable'}:{label:'未參與',amount:0,kind:'none'}}


function paymentApplications(payment){
 return Array.isArray(payment.applications)
  ? payment.applications
  : payment.expenseId?[{expenseId:payment.expenseId,amount:payment.amount}]:[];
}
function unassignedPayment(payment){
 return payment.amount-paymentApplications(payment).reduce((sum,part)=>sum+part.amount,0);
}
function recordedSharePayment(book,expense,memberId,excludeId){
 return book.settlements.reduce((sum,payment)=>{
  if(payment.id===excludeId||payment.from!==memberId||payment.to!==expense.payer)return sum;
  return sum+paymentApplications(payment).reduce((total,part)=>total+(part.expenseId===expense.id?part.amount:0),0);
 },0);
}
function availableRepaymentExpenses(book,payment){
 return book.expenses.filter(expense=>expense.payer===payment.to).map(expense=>{
  const share=allocations(expense).find(item=>item.id===payment.from);
  return {expense,limit:(share?.amount||0)-recordedSharePayment(book,expense,payment.from,payment.id)};
 }).filter(item=>item.limit>0).sort((a,b)=>String(a.expense.date||'').localeCompare(String(b.expense.date||'')));
}
function availableExistingPayments(book,expense,memberId){
 return book.settlements.filter(payment=>payment.from===memberId&&payment.to===expense.payer&&unassignedPayment(payment)>0);
}
function paymentCents(value){
 const input=String(value??'').trim();
 if(!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(input))throw Error('請輸入有效金額，最多兩位小數。');
 const [whole,fraction='']=input.split('.');
 const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(cents))throw Error('金額過大。');
 return cents;
}
function repaymentChanges(book,payment,amount,date,requested){
 if(!Number.isSafeInteger(amount)||amount<=0)throw Error('還款金額必須大於零。');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('請選擇付款日期。');
 const limits=new Map(availableRepaymentExpenses(book,payment).map(({expense,limit})=>[expense.id,limit]));
 const seen=new Set();
 let allocated=0;
 for(const part of requested){
  if(seen.has(part.expenseId)||!Number.isSafeInteger(part.amount)||part.amount<=0||part.amount>(limits.get(part.expenseId)||0))
   throw Error('分配金額超過費用剩餘分攤，請重新確認。');
  seen.add(part.expenseId);
  allocated+=part.amount;
  if(allocated>amount)throw Error('分配金額合計不可超過這筆還款。');
 }
 return {id:payment.id,from:payment.from,to:payment.to,amount,date,applications:requested};
}

function expenseShareRow(book,expense,share){
 const isPayer=share.id===expense.payer;
 const paid=Math.min(share.amount,recordedSharePayment(book,expense,share.id));
 const remaining=share.amount-paid;
 const complete=isPayer||remaining<=0;
 const status=isPayer?'已代墊':share.amount===0?'免付':complete?'已支付':paid?'部分已支付':'未記錄付款';
 const label=availableExistingPayments(book,expense,share.id).length?'關聯既有還款':'記錄付款';
 const action=complete?'':`<button type="button" class="quiet share-pay-action" data-pay-share="${esc(share.id)}">${label}</button>`;
 const partial=!complete&&paid?`<small>已付 NT$ ${money(paid)} · 剩 NT$ ${money(remaining)}</small>`:'';
 return `<div class="person expense-share"><span class="detail">${esc(name(book,share.id))}<small class="share-status ${complete?'share-complete':''}">${status}</small>${partial}</span><div class="share-amount"><span>NT$ ${money(share.amount)}</span>${action}</div></div>`;
}


function openRepaymentEditor(book,payment,{existing=false,expenseId='',returnExpenseId=''}={}){
 const choices=availableRepaymentExpenses(book,payment);
 const direct=!!expenseId&&!existing;
 const assigned=new Map(paymentApplications(payment).map(part=>[part.expenseId,part.amount]));
 if(existing&&returnExpenseId){
  const limit=choices.find(item=>item.expense.id===returnExpenseId)?.limit||0;
  const already=assigned.get(returnExpenseId)||0;
  const extra=Math.min(limit-already,unassignedPayment(payment));
  if(extra>0)assigned.set(returnExpenseId,already+extra);
 }
 const rows=direct?'':choices.map(({expense,limit})=>`<label class="payment-allocation"><span>${esc(expense.title)}<small>${esc(expense.date||'')} · 可抵 NT$ ${money(limit)}</small></span><input type="number" name="apply-${esc(expense.id)}" aria-label="${esc(expense.title)} 抵扣金額" inputmode="decimal" min="0" step="0.01" value="${assigned.has(expense.id)?assigned.get(expense.id)/100:''}" placeholder="0"></label>`).join('');
 const moneyField=field('repaymentAmount','實際付款金額（NT$）',payment.amount/100,'number','required min="0.01" step="0.01" inputmode="decimal"');
 const dateField=field('repaymentDate','付款日期',payment.date||today(),'date','required');
 const allocationFields=direct
  ?'<p class="hint">此金額會直接抵扣這筆費用，可分次記錄。</p>'
  :`<h3 class="settle-heading">抵扣費用</h3>${rows||'<p class="hint">目前沒有可關聯的費用。這筆款項會列入整本帳本還款。</p>'}${rows?'<button id="autoApplyPayment" type="button" class="quiet">按日期分配</button><p class="hint">可把一筆還款分到多筆費用。剩餘金額會保留為整本帳本還款。</p>':''}`;
 modal(existing?'更正還款紀錄':'記錄付款',
  `<p>${esc(name(book,payment.from))} → ${esc(name(book,payment.to))}</p>${moneyField}${dateField}${allocationFields}`,
  existing?'儲存更正':'確認已付款',async form=>{
   const latest=group();
   if(latest?.id!==book.id)throw Error('帳本已切換，請重新開啟。');
   const index=latest.settlements.findIndex(item=>item.id===payment.id);
   if(existing&&(index<0||JSON.stringify(latest.settlements[index])!==JSON.stringify(payment)))throw Error('還款紀錄已更新，請重新開啟。');
   if(!existing&&index>=0)throw Error('這筆付款已記錄，請重新開啟明細。');
   const amount=paymentCents(form.get('repaymentAmount'));
   if(!existing&&!direct){
    const suggested=plan(latest).find(item=>item.from===payment.from&&item.to===payment.to);
    if(amount>(suggested?.amount||0))throw Error('金額超過目前建議轉帳金額，請重新確認。');
   }
   if(direct){
    const target=latest.expenses.find(item=>item.id===expenseId);
    if(!target||target.payer!==payment.to)throw Error('費用已更新，請重新開啟。');
    if(availableExistingPayments(latest,target,payment.from).length)throw Error('已有可抵扣的還款，請先在費用明細關聯既有還款。');
   }
   const applications=direct?[{expenseId,amount}]:choices.flatMap(({expense})=>{
    const value=form.get('apply-'+expense.id);
    const cents=value?paymentCents(value):0;
    return cents?[{expenseId:expense.id,amount:cents}]:[];
   });
   const updated=repaymentChanges(latest,payment,amount,form.get('repaymentDate'),applications);
   const next=structuredClone(latest);
   if(existing)next.settlements[index]=updated;
   else next.settlements.push(updated);
   await commit(next);
   toast(existing?'還款紀錄已更新':'付款已記錄');
  },returnExpenseId?()=>showExpense(returnExpenseId):undefined);
 const auto=$('autoApplyPayment');
 if(auto)auto.onclick=()=>{
  try{
   let left=paymentCents($('f-repaymentAmount').value);
   for(const {expense,limit} of choices){
    const amount=Math.min(left,limit);
    $('form').elements.namedItem('apply-'+expense.id).value=amount?amount/100:'';
    left-=amount;
   }
   $('formError').textContent='';
  }catch(error){$('formError').textContent=error.message}
 };
}

function confirmSharePayment(book,expense,memberId){
 const share=allocations(expense).find(item=>item.id===memberId);
 const remaining=(share?.amount||0)-recordedSharePayment(book,expense,memberId);
 if(memberId===expense.payer||remaining<=0)return;
 const candidates=availableExistingPayments(book,expense,memberId);
 if(!candidates.length){
  openRepaymentEditor(book,{id:uid(),from:memberId,to:expense.payer,amount:remaining,date:today()},{expenseId:expense.id,returnExpenseId:expense.id});
  return;
 }
 const rows=candidates.map(payment=>`<button type="button" class="quiet repayment-link-choice" data-link-payment="${esc(payment.id)}">${esc(payment.date||'未記錄日期')} · 可抵 NT$ ${money(unassignedPayment(payment))}</button>`).join('');
 modal('關聯既有還款',`<p>${esc(name(book,memberId))} → ${esc(name(book,expense.payer))}</p><p class="hint">選擇已記錄的還款來抵扣「${esc(expense.title)}」。儲存後會更新這筆還款的費用分配。</p>${rows}`,'返回費用',async()=>{},()=>showExpense(expense.id));
 $('fields').querySelectorAll('[data-link-payment]').forEach(button=>{
  button.onclick=()=>{
   const payment=candidates.find(item=>item.id===button.dataset.linkPayment);
   if(payment)openRepaymentEditor(book,payment,{existing:true,returnExpenseId:expense.id});
  };
 });
}

function undoRepayment(book,paymentId){
 const payment=book.settlements.find(item=>item.id===paymentId);
 if(!payment)return;
 const affected=paymentApplications(payment).map(part=>`<li>${esc(book.expenses.find(expense=>expense.id===part.expenseId)?.title||'指定費用')} · NT$ ${money(part.amount)}</li>`).join('');
 modal('撤銷還款紀錄',
  `<p>${esc(name(book,payment.from))} → ${esc(name(book,payment.to))} <strong>NT$ ${money(payment.amount)}</strong></p><p class="hint">撤銷後會重新計算兩人的餘額。${affected?'以下費用也會重新計算已付金額。':''}</p>${affected?'<ul>'+affected+'</ul>':''}`,
  '撤銷紀錄',async()=>{
   const latest=group();
   const current=latest?.settlements.find(item=>item.id===paymentId);
   if(latest?.id!==book.id||JSON.stringify(current)!==JSON.stringify(payment))throw Error('還款紀錄已更新，請重新開啟。');
   const next=structuredClone(latest);
   next.settlements=next.settlements.filter(item=>item.id!==paymentId);
   await commit(next);
  });
}
function showExpense(id){const g=group(),e=g?.expenses.find(x=>x.id===id);if(!e)return;modal(e.title,`<div class="expense-info"><p>消費日期：${esc(e.date)}</p><p>付款人：${esc(name(g,e.payer))}</p><p>原幣金額：${esc(e.currency)} ${esc(e.amount)}</p><p>匯率：<span class="exchange-ratio">1 ${esc(e.currency)} = ${esc(e.rate)} TWD</span></p><p><strong>總額：NT$ ${money(e.baseCents)}</strong></p><h3>收據／照片</h3><div id="expensePhotoPreview" class="expense-photo-preview"><p class="hint">圖片載入中…</p></div><h3>分攤明細</h3><p class="hint">可分次記錄付款，或關聯同一付款人已記錄的還款。</p>${allocations(e).map(a=>expenseShareRow(g,e,a)).join('')}<div class="expense-detail-actions single-action"><button type="button" class="quiet" id="detailEdit">編輯費用</button></div></div>`,'關閉',async()=>{});loadExpensePhotos(g.id,id,$('expensePhotoPreview'));$('detailEdit').onclick=()=>editExpense(id);$('fields').querySelectorAll('[data-pay-share]').forEach(button=>{button.onclick=()=>confirmSharePayment(g,e,button.dataset.payShare)})}

function briefMoney(cents){return new Intl.NumberFormat('zh-TW',{minimumFractionDigits:0,maximumFractionDigits:2}).format(cents/100)}

function memberAvatar(member){
 const initials=esc(Array.from(member.lineName||member.name)[0]||'人');
 const currentUser=cfg.lineApiBase?window.WarmCloud?.user():null;
 const isCurrentMember=currentUser&&(member.id===currentUser.uid||member.lineUserId===currentUser.uid);
 const picture=(isCurrentMember&&currentUser.pictureUrl)||member.linePicture;
 const valid=typeof picture==='string'&&/^https:\/\/profile\.line-scdn\.net\/[a-zA-Z0-9_/?&=.%+~-]+$/.test(picture);
 return initials+(valid?`<img src="${esc(picture)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">`:'');
}

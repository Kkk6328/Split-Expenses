'use strict';
async function requireMedia(){const c=await api('capabilities');if(c.mediaVersion!==1)throw Error('圖片與收款功能尚未啟用，請先更新 Cloudflare Worker。')}
async function compressPhoto(file){
 if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error('請選擇 JPG、PNG 或 WebP 圖片；HEIC 請先轉成 JPG。');
 if(file.size>20000000)throw Error('原始圖片請小於 20 MB');
 const url=URL.createObjectURL(file),img=new Image();
 try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('無法讀取圖片，請改用 JPG 或 PNG'));img.src=url});
  let size=1600;
  for(let step=0;step<5;step++){const scale=Math.min(1,size/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/jpeg',0.85);if(data.length<=220000)return data;size=Math.round(size*.75)}
  throw Error('圖片壓縮後仍過大，請裁切後再試');
 }finally{URL.revokeObjectURL(url)}
}

function photoButton(label,action){const b=document.createElement('button');b.type='button';b.className='quiet';b.textContent=label;b.onclick=action;return b}
function downloadPhoto(src,filename){const bytes=Uint8Array.from(atob(src.split(',')[1]),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:'image/jpeg'}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
function photoPNG(src){return new Promise((resolve,reject)=>{const img=new Image();img.onerror=()=>reject(Error('圖片讀取失敗'));img.onload=()=>{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d').drawImage(img,0,0);c.toBlob(b=>b?resolve(b):reject(Error('圖片轉換失敗')),'image/png')};img.src=src})}
async function copyPhoto(src,status){if(!navigator.clipboard?.write||!window.ClipboardItem){status.textContent='此瀏覽器不支援複製圖片，請下載或放大後長按圖片。';return}try{await navigator.clipboard.write([new ClipboardItem({'image/png':photoPNG(src)})]);status.textContent='已複製圖片，可貼到其他支援圖片的應用程式。'}catch{status.textContent='無法複製圖片，請下載或放大後長按圖片。'}}
function viewPhoto(src,filename){const d=document.createElement('dialog');d.className='photo-viewer';d.setAttribute('aria-label','查看圖片');const head=document.createElement('div');head.className='photo-viewer-head';const title=document.createElement('strong');title.textContent='查看圖片';head.append(title,photoButton('關閉',()=>d.close()));const area=document.createElement('div');area.className='photo-viewer-area';const img=document.createElement('img');img.src=src;img.alt='附件圖片，點擊可切換原始大小';img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-pressed','false');const zoom=()=>{const full=img.classList.toggle('original');img.setAttribute('aria-pressed',String(full))};img.onclick=zoom;img.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();zoom()}};area.append(img);const status=document.createElement('p');status.className='hint';status.setAttribute('role','status');status.textContent='點圖片切換原始大小；手機可長按圖片。';const actions=document.createElement('div');actions.className='photo-actions';actions.append(photoButton('複製圖片',()=>copyPhoto(src,status)),photoButton('下載圖片',()=>downloadPhoto(src,filename)));d.append(head,area,actions,status);d.addEventListener('close',()=>d.remove(),{once:true});document.body.append(d);d.showModal()}

function imageEditor(initial,max){
 let images=[...initial],pending=Promise.resolve(),busy=false,uploadError=null;
 const host=$('photoEditor');
 host.innerHTML='<div class="photo-grid"></div><input id="photoInput" hidden type="file" accept="image/jpeg,image/png,image/webp" '+(max>1?'multiple':'')+'><button type="button" class="photo-add quiet">＋ 新增圖片</button><p class="hint photo-status" role="status"></p>';
 const grid=host.querySelector('.photo-grid'),input=host.querySelector('input'),status=host.querySelector('.photo-status'),add=host.querySelector('.photo-add');add.onclick=()=>input.click();
 function draw(){grid.replaceChildren();images.forEach((src,i)=>{const filename=max===1?'payment-qr.jpg':'receipt-'+(i+1)+'.jpg',card=document.createElement('div');card.className='photo-card';const img=document.createElement('img');img.src=src;img.alt=max===1?'收款 QR Code':'費用附件 '+(i+1);const preview=photoButton('',()=>viewPhoto(src,filename));preview.className='photo-preview';preview.setAttribute('aria-label','查看圖片 '+(i+1));preview.append(img);const actions=document.createElement('div');actions.className='photo-actions';const remove=photoButton('移除',()=>{images.splice(i,1);draw()});remove.classList.add('photo-remove');remove.disabled=busy;actions.append(photoButton('查看',()=>viewPhoto(src,filename)),photoButton('複製',()=>copyPhoto(src,status)),photoButton('下載',()=>downloadPhoto(src,filename)),remove);card.append(preview,actions);grid.append(card)});input.disabled=add.disabled=busy||images.length>=max;add.textContent=busy?'圖片處理中…':images.length>=max?'已達圖片上限':'＋ 新增圖片';status.textContent=busy?'正在壓縮圖片…':`${images.length} / ${max} 張 · 支援 JPG、PNG、WebP`;}
 input.onchange=()=>{const files=[...input.files];input.value='';if(images.length+files.length>max){$('formError').textContent=`最多 ${max} 張，請先移除舊圖片`;return}uploadError=null;busy=true;draw();pending=(async()=>{try{const next=[];for(const f of files)next.push(await compressPhoto(f));images.push(...next);$('formError').textContent=''}catch(e){uploadError=e;$('formError').textContent=e.message}finally{busy=false;draw()}})();};draw();
 return async()=>{await pending;if(uploadError)throw uploadError;return images};
}
async function openExpenseImages(bookId,expenseId){
 try{await requireMedia();const g=group();if(!g||g.id!==bookId)return;const expense=g.expenses.find(e=>e.id===expenseId);if(!expense)return;
 const data=await api('getExpenseImages',{groupId:bookId,expenseId});if(group()?.id!==bookId)return;
 let read;modal('圖片：'+expense.title,'<p class="hint">收據、發票或消費照片，最多 3 張。只有此帳本成員可以查看。新增與移除後請按儲存。</p><div id="photoEditor"></div>','儲存圖片',async()=>{const images=await read();await api('saveExpenseImages',{groupId:bookId,expenseId,images,revision:data.revision});toast('圖片已儲存')});read=imageEditor(data.images,3);
 }catch(e){toast(e.message)}
}

async function copyBank(value,status){try{await navigator.clipboard.writeText(value);status.textContent='已複製：'+value}catch{status.textContent='無法自動複製，請長按上方欄位複製。'}}
async function openPayment(bookId,memberId){
 try{const cap=await api('capabilities');if(cap.paymentVersion!==2)throw Error('多組銀行帳號功能尚未啟用，請先更新 Cloudflare Worker。');
 const g=group();if(!g||g.id!==bookId)return;const m=g.members.find(m=>m.id===memberId);if(!m)throw Error('請先配對自己的成員身分');
 const data=await api('getPayment',{groupId:bookId,memberId});if(group()?.id!==bookId)return;
 const user=window.WarmCloud?.user()?.uid,own=m.id===user||m.lineUserId===user;
 let accounts=(data.accounts||[]).map(x=>({...x}));
 modal(own?'我的收款帳號':m.name+' 的收款帳號','<p class="hint">'+(own?'可設定多組銀行帳號，僅限此帳本成員查看。銀行碼與帳號的開頭 0 會保留。':'選擇收款帳號，複製銀行碼與帳號後至銀行 App 轉帳。請核對收款人。')+'</p><div id="bankAccounts"></div>'+(own?'<button type="button" id="addBank" class="quiet bank-add">＋ 新增銀行帳號</button>':'')+'<p class="hint" id="bankStatus" role="status"></p>',own?'儲存收款帳號':'關閉',async()=>{if(!own)return;collect();for(const x of accounts)if(!/^\\d{3}$/.test(x.bankCode)||!/^\\d{5,20}$/.test(x.account))throw Error('銀行碼須為 3 碼，帳號須為 5～20 位數字');await api('savePayment',{groupId:bookId,memberId,accounts,revision:data.revision});toast('收款帳號已儲存')});
 function collect(){if(own)accounts=[...$('bankAccounts').children].filter(x=>x.classList.contains('bank-card')).map(card=>({name:card.querySelector('[data-bank-name]').value.trim(),bankCode:card.querySelector('[data-bank-code]').value.trim(),account:card.querySelector('[data-bank-account]').value.replace(/[ -]/g,'')}))}
 function draw(){const host=$('bankAccounts');host.replaceChildren();if(!accounts.length&&!own){host.textContent='此成員尚未設定銀行帳號。';return}
 accounts.forEach((x,i)=>{const card=document.createElement('section');card.className='bank-card';
 card.innerHTML=(own?'<label>銀行名稱／備註（選填）<input data-bank-name maxlength="40" value="'+esc(x.name)+'" placeholder="例如：國泰世華"></label>':'<h3>'+esc(x.name||'收款帳號 '+(i+1))+'</h3>')+'<label>銀行代碼<div class="bank-copy-row"><input data-bank-code type="text" inputmode="numeric" maxlength="3" '+(own?'required pattern="[0-9]{3}"':'readonly')+' value="'+esc(x.bankCode)+'"><button type="button" class="quiet" data-copy-code>複製</button></div></label><label>銀行帳號<div class="bank-copy-row"><input data-bank-account type="text" inputmode="numeric" maxlength="24" '+(own?'required':'readonly')+' value="'+esc(x.account)+'"><button type="button" class="quiet" data-copy-account>複製</button></div></label>';
 card.querySelector('[data-copy-code]').onclick=()=>copyBank(card.querySelector('[data-bank-code]').value.trim(),$('bankStatus'));
 card.querySelector('[data-copy-account]').onclick=()=>copyBank(card.querySelector('[data-bank-account]').value.replace(/[ -]/g,''),$('bankStatus'));
 if(own){const remove=photoButton('移除此帳號',()=>{collect();accounts.splice(i,1);draw()});remove.classList.add('photo-remove');card.append(remove)}host.append(card)});
 if(own)$('addBank').disabled=accounts.length>=10;
 }
 if(own)$('addBank').onclick=()=>{collect();if(accounts.length<10){accounts.push({name:'',bankCode:'',account:''});draw();$('bankAccounts').lastElementChild.querySelector('input').focus()}};
 if(own&&!accounts.length)accounts.push({name:'',bankCode:'',account:''});draw();
 }catch(e){toast(e.message)}
}
document.addEventListener('click',e=>{const images=e.target.closest('[data-images]'),payment=e.target.closest('[data-payment]');if(images&&group())openExpenseImages(group().id,images.dataset.images);if(payment&&group())openPayment(group().id,payment.dataset.payment)});

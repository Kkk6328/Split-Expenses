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
function imageEditor(initial,max){
 let images=[...initial],pending=Promise.resolve(),busy=false,uploadError=null;
 const host=$('photoEditor');
 host.innerHTML='<div class="photo-grid"></div><label for="photoInput">選擇圖片（可使用手機相機或相簿）</label><input id="photoInput" type="file" accept="image/jpeg,image/png,image/webp" '+(max>1?'multiple':'')+'><p class="hint photo-status" role="status"></p>';
 const grid=host.querySelector('.photo-grid'),input=host.querySelector('input'),status=host.querySelector('.photo-status');
 function draw(){grid.replaceChildren();images.forEach((src,i)=>{const card=document.createElement('div');card.className='photo-card';const img=document.createElement('img');img.src=src;img.alt=max===1?'收款 QR Code':'費用附件 '+(i+1);const link=document.createElement('a');link.href=src;link.download=max===1?'payment-qr.jpg':'receipt-'+(i+1)+'.jpg';link.title='下載圖片';link.append(img);const remove=document.createElement('button');remove.type='button';remove.className='quiet';remove.textContent='移除';remove.disabled=busy;remove.onclick=()=>{images.splice(i,1);draw()};card.append(link,remove);grid.append(card)});input.disabled=busy||images.length>=max;status.textContent=busy?'圖片處理中…':`${images.length} / ${max} 張 · 點圖片可下載`;}
 input.onchange=()=>{const files=[...input.files];input.value='';if(images.length+files.length>max){$('formError').textContent=`最多 ${max} 張，請先移除舊圖片`;return}uploadError=null;busy=true;draw();pending=(async()=>{try{const next=[];for(const f of files)next.push(await compressPhoto(f));images.push(...next);$('formError').textContent=''}catch(e){uploadError=e;$('formError').textContent=e.message}finally{busy=false;draw()}})();};draw();
 return async()=>{await pending;if(uploadError)throw uploadError;return images};
}
async function openExpenseImages(bookId,expenseId){
 try{await requireMedia();const g=group();if(!g||g.id!==bookId)return;const expense=g.expenses.find(e=>e.id===expenseId);if(!expense)return;
 const data=await api('getExpenseImages',{groupId:bookId,expenseId});if(group()?.id!==bookId)return;
 let read;modal('圖片：'+expense.title,'<p class="hint">收據、發票或消費照片，最多 3 張。只有此帳本成員可以查看。新增與移除後請按儲存。</p><div id="photoEditor"></div>','儲存圖片',async()=>{const images=await read();await api('saveExpenseImages',{groupId:bookId,expenseId,images,revision:data.revision});toast('圖片已儲存')});read=imageEditor(data.images,3);
 }catch(e){toast(e.message)}
}
async function openPayment(bookId,memberId){
 try{await requireMedia();const g=group();if(!g||g.id!==bookId)return;const m=g.members.find(m=>m.id===memberId);if(!m)throw Error('請先配對自己的成員身分');
 const data=await api('getPayment',{groupId:bookId,memberId});if(group()?.id!==bookId)return;const user=window.WarmCloud?.user()?.uid,own=m.id===user||m.lineUserId===user;
 if(own){let read;modal('我的收款資訊',field('paymentLink','收款／轉帳連結（選填）',data.link,'url','maxlength="2000" placeholder="https://…"')+'<p class="hint">貼上銀行或支付服務提供的收款連結，或上傳該服務的收款 QR Code。此設定只用於目前帳本。</p><div id="photoEditor"></div>','儲存收款資訊',async f=>{const link=f.get('paymentLink').trim();if(link){let u;try{u=new URL(link)}catch{throw Error('請輸入完整的 HTTPS 收款連結')}if(u.protocol!=='https:'||u.username||u.password)throw Error('請使用 HTTPS 收款連結')}const images=await read();await api('savePayment',{groupId:bookId,memberId,link,qr:images[0]||'',revision:data.revision});toast('收款資訊已儲存')});read=imageEditor(data.qr?[data.qr]:[],1);
 }else{modal(m.name+' 的轉帳資訊','<div id="paymentView"></div><p class="hint">轉帳前請核對收款人及金額。完成轉帳後，再回到結算頁記錄已付款。</p>','關閉',async()=>{});const view=$('paymentView');if(!data.link&&!data.qr){view.textContent='此成員尚未設定收款資訊，請聯絡本人提供。'}if(data.link){const a=document.createElement('a');a.className='payment-link';a.href=data.link;a.target='_blank';a.rel='noopener noreferrer';a.textContent='開啟收款連結 ↗';view.append(a);const domain=document.createElement('p');domain.className='hint';domain.textContent=new URL(data.link).hostname;view.append(domain)}if(data.qr){const img=document.createElement('img');img.src=data.qr;img.className='payment-qr';img.alt=m.name+' 的收款 QR Code';const a=document.createElement('a');a.href=data.qr;a.download='payment-qr.jpg';a.append(img);view.append(a);const hint=document.createElement('p');hint.className='hint';hint.textContent='點 QR Code 可下載，再使用銀行或支付 App 掃描／從相簿讀取。';view.append(hint)}}
 }catch(e){toast(e.message)}
}
document.addEventListener('click',e=>{const images=e.target.closest('[data-images]'),payment=e.target.closest('[data-payment]');if(images&&group())openExpenseImages(group().id,images.dataset.images);if(payment&&group())openPayment(group().id,payment.dataset.payment)});

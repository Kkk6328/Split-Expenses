(() => {
 if (!(navigator.standalone || matchMedia('(display-mode: standalone)').matches)) return;

 const version = page => Array.from(page.querySelectorAll('script[src],link[rel="stylesheet"]'),
  element => element.getAttribute('src') || element.getAttribute('href')).join('|');
 const current = version(document);
 const initial = new URL(location.href);
 const justUpdated = initial.searchParams.has('_update');
 if (justUpdated) {
  initial.searchParams.delete('_update');
  history.replaceState(history.state, '', initial.href);
 }
 let lastCheck = 0;
 let checking = false;

 async function check() {
  if (document.hidden || checking || Date.now() - lastCheck < 15000 ||
      document.getElementById('standaloneUpdate')) return;
  lastCheck = Date.now();
  checking = true;
  try {
   const url = new URL('./', location.href);
   url.searchParams.set('_update', String(lastCheck));
   const response = await fetch(url, {cache:'no-store'});
   if (!response.ok) return;
   const page = new DOMParser().parseFromString(await response.text(), 'text/html');
   if (!page.querySelector('script[src^="standalone-update.js"]') || version(page) === current) return;

   const next = new URL(location.href);
   if (!document.querySelector('dialog[open]') &&
       !homeLoginTransfer.pending() &&
       !justUpdated) {
    next.searchParams.set('_update', String(Date.now()));
    location.replace(next.href);
    return;
   }
   const button = document.createElement('button');
   button.id = 'standaloneUpdate';
   button.type = 'button';
   button.textContent = '載入新版';
   button.onclick = () => {
    if (document.querySelector('dialog[open]')) {
     toast('請先關閉目前的視窗，再載入新版。');
     return;
    }
    const next = new URL(location.href);
    next.searchParams.set('_update', String(Date.now()));
    location.replace(next.href);
   };
   document.querySelector('main').prepend(button);
  } catch {
   // Retry when the app returns to the foreground.
  } finally {
   checking = false;
  }
 }

 window.addEventListener('pageshow', check);
 window.addEventListener('focus', check);
 document.addEventListener('visibilitychange', check);
})();

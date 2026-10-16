const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
(async()=>{
 const dir = process.argv[2];
 const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}).catch(()=>chromium.launch());
 const p = await b.newPage();
 const body = fs.readFileSync(dir+'/page_static.html','utf8');
 await p.setContent('<div id="magna-lp">'+body+'</div>');
 const res = await p.evaluate(()=>{
  const root = document.getElementById('magna-lp');
  const INLINE = new Set(['BR','B','STRONG','EM','I','A','SPAN','SMALL','U','MARK']);
  const isLeaf = el => { for (const d of el.querySelectorAll('*')) if(!INLINE.has(d.tagName)) return false; return true; };
  const hasText = el => /\S/.test(el.textContent);
  const secOf = el => {
    for (let e=el; e && e!==root; e=e.parentElement){
      if (e.dataset.sec) return e.dataset.sec;
      if (e.dataset.hd==='bar'||e.dataset.hd==='drawer') return 'header';
      if (e.dataset.if) return 'modal_'+e.dataset.if;
      if (e.dataset.r==='spbar') return 'spbar';
      if (e.dataset.intro==='veil') return 'intro';
      if (e.hasAttribute('data-foot')) return 'footer';
      if (e.id && /^(faq|apply|safe|cases|play|trust|why|scene|area|free-reason|stats)$/.test(e.id)) return e.id.replace('-','_');
    }
    return 'misc';
  };
  const cnt = {}, T = [], order=[];
  const assign = el => {
    const s = secOf(el); cnt[s]=(cnt[s]||0)+1;
    const k = s+'_'+String(cnt[s]).padStart(2,'0');
    el.setAttribute('data-t',k); T.push([k, el.innerHTML.trim().replace(/\s*\n\s*/g,' ')]); el.innerHTML='';
  };
  const walk = el => {
    if (['SCRIPT','STYLE','SVG','svg','PATH'].includes(el.tagName) || el.tagName==='svg') return;
    if (el.hasAttribute('data-mark')||el.hasAttribute('data-faq-arrow')) return;
    if (el.tagName!=='A' || true) {
      if (isLeaf(el) && hasText(el) && !el.querySelector('[data-mark]') ) { assign(el); return; }
    }
    // mark-containing leaf: key text but keep mark
    if (isLeaf(el) && hasText(el) && el.querySelector('[data-mark]')) {
      const m = el.querySelector('[data-mark]'); const t = [...el.childNodes].filter(n=>n.nodeType===3 && /\S/.test(n.textContent));
      t.forEach(n=>{ const s=document.createElement('span'); n.replaceWith(s); s.textContent=n.textContent; assign2(s); }); return;
    }
    for (const c of [...el.childNodes]) {
      if (c.nodeType===3 && /\S/.test(c.textContent) && !['SCRIPT','STYLE'].includes(el.tagName)) { const s=document.createElement('span'); c.replaceWith(s); s.textContent=c.textContent; assign(s); }
      else if (c.nodeType===1) walk(c);
    }
  };
  const assign2 = assign;
  [...root.children].forEach(walk);
  return {T, html: root.innerHTML};
 });
 fs.writeFileSync(dir+'/page_keyed.html', res.html);
 fs.writeFileSync(dir+'/texts.json', JSON.stringify(res.T,null,1));
 console.log(res.T.length);
 await b.close();
})();

const { chromium } = require('/opt/node-tools/node_modules/playwright'); const fs=require('fs');
(async()=>{ const dir=process.argv[2]; const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}); const p=await b.newPage();
 await p.setContent('<div id="root">'+fs.readFileSync(dir+'/full_static.html','utf8')+'</div>');
 const res=await p.evaluate(()=>{
  const root=document.getElementById('root');
  const INLINE=new Set(['BR','B','STRONG','EM','I','A','SPAN','SMALL','U','MARK']);
  const isLeaf=el=>{ for(const d of el.querySelectorAll('*')) if(!INLINE.has(d.tagName)||d.tagName==='A') return false; return true; };
  const hasText=el=>/\S/.test(el.textContent);
  const cnt={}, T=[];
  const assign=el=>{ const part=el.closest('[data-part]').dataset.part; cnt[part]=(cnt[part]||0)+1; const k=part+'_'+String(cnt[part]).padStart(2,'0');
    el.setAttribute('data-t',k); T.push([k, el.innerHTML.trim().replace(/\s*\n\s*/g,' ')]); el.innerHTML=''; };
  const walk=el=>{
    if(['SCRIPT','STYLE'].includes(el.tagName)||el.tagName.toLowerCase()==='svg') return;
    if(el.hasAttribute('data-pos')) return;
    if(isLeaf(el)&&hasText(el)){ assign(el); return; }
    for(const c of [...el.childNodes]){
      if(c.nodeType===3&&/\S/.test(c.textContent)){ const s=document.createElement('span'); c.replaceWith(s); s.textContent=c.textContent; assign(s); }
      else if(c.nodeType===1) walk(c);
    }
  };
  [...root.querySelectorAll('[data-part]')].forEach(w=>[...w.children].forEach(walk));
  const parts={}; root.querySelectorAll('[data-part]').forEach(w=>parts[w.dataset.part]=w.innerHTML);
  return {T,parts};});
 fs.writeFileSync(dir+'/texts.json',JSON.stringify(res.T,null,1));
 for(const [k,v] of Object.entries(res.parts)) fs.writeFileSync(dir+'/part_'+k+'.html',v);
 console.log(res.T.length, Object.keys(res.parts).join(','));
 await b.close(); })();

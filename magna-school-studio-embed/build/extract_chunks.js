const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs=require('fs');
(async()=>{ const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}); const p=await b.newPage({viewport:{width:1280,height:900}});
 await p.setContent('<div id="magna-lp">'+fs.readFileSync('page_keyed.html','utf8')+'</div>');
 const out=await p.evaluate(()=>{
  const root=document.getElementById('magna-lp'); const W=root.children[0]; const wc=[...W.children]; const sc=[...root.children].slice(1);
  const byId=id=>root.querySelector('[id="'+id+'"]');
  const bar=wc[0], fv=wc[2], stats=wc[3], media=wc[4], why=wc[5], scene=wc[6], cases=wc[7], area=wc[8], apply=wc[9];
  const fr=apply.querySelector('#free-reason'); const frHTML=fr.outerHTML; fr.remove();
  const safe=sc[0], trial=sc[1], trust=sc[2], play=sc[3], faq=sc[4], kim=sc[5], tak=sc[6], foot=sc[7], consult=sc[8], spbar=sc[9], intro=sc[10];
  const o=e=>e.outerHTML;
  const frWrap='<div data-sec="apply" style="background:#fff;padding:0 32px">'+frHTML+'</div>';
  return {
   check:{wcN:wc.length, sc:sc.map(e=>(e.id||e.dataset.r||e.dataset.if||e.tagName)+':'+e.textContent.trim().slice(0,20))},
   header:o(bar), fv:o(fv)+o(stats)+o(media), why:o(why)+o(scene), cases:o(cases)+o(area)+o(apply), free:frWrap,
   safe:o(safe)+o(trial)+o(trust)+o(play)+o(faq)+o(kim)+o(tak), safeA:o(safe)+o(trial)+o(trust)+o(play)+o(kim)+o(tak), faqB:o(faq), foot:o(foot), consult:o(consult), intro:o(intro), spbar:o(spbar), drawer:o(wc[1])
  };});
 console.log(JSON.stringify(out.check));
 for (const k of Object.keys(out)) if(k!=='check') fs.writeFileSync('chunk_'+k+'.html', out[k]);
 await b.close(); })();

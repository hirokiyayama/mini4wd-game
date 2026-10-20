(function(){
  var root = document.querySelector('.mg-root[data-mg="'+MG_NAME+'"]'); if(!root) return;
  function u(p){ return /^(https?:)?\/\//.test(p) || p.charAt(0)==='/' || p.indexOf('data:')===0 ? p : ASSET_BASE + p; }
  function $all(s){ return Array.prototype.slice.call(root.querySelectorAll(s)); }
  var framed=false; try{ framed = window.self !== window.top; }catch(e){ framed = true; }
  if(framed){ try{ document.body.style.margin='0'; if(typeof FILL_COLOR!=='undefined') document.documentElement.style.background = FILL_COLOR; }catch(e){} }
  /* ---- 設定の反映 ---- */
  $all('[data-t]').forEach(function(e){ var k=e.getAttribute('data-t'); if(k in TEXT) e.innerHTML = TEXT[k]; });
  $all('[data-img]').forEach(function(e){ var k=e.getAttribute('data-img'); if(IMAGES[k]) e.src = u(IMAGES[k]); if(ALT[k]) e.alt = ALT[k]; });
  $all('[data-link]').forEach(function(e){ var k=e.getAttribute('data-link'); if(LINKS[k]) e.href = u(LINKS[k]); });
  if(typeof SHOW_INTRO!=='undefined' && !SHOW_INTRO) root.classList.add('mg-nointro');
  /* ---- 他のブロックへのリンク（STUDIOページ内の別Embedへ移動） ---- */
  var hasConsult = !!root.querySelector('[data-if="consultOpen"]');
  var page = PAGE_URL || ''; if(!page){ try{ page = document.referrer || ''; }catch(e){} if(!page){ try{ page = location.ancestorOrigins[0] + '/'; }catch(e){} } }
  page = page.replace(/#.*$/, '');
  function toPage(a, id){ var t = (ANCHORS && ANCHORS[id]) || id; a.setAttribute('href', page ? page + '#' + t : '#' + t); a.setAttribute('target','_top'); a.setAttribute('rel','noopener'); a.removeAttribute('data-act'); }
  $all('a[href^="#"]').forEach(function(a){
    var id = a.getAttribute('href').slice(1);
    if(id==='contact' || a.getAttribute('data-act')==='openConsult'){ if(hasConsult) return; toPage(a,'consult'); return; }
    if(id) toPage(a, id);
  });
  /* ---- 開閉UI ---- */
  function setIf(name, on){
    $all('[data-if="'+name+'"]').forEach(function(e){ e.classList.toggle('mg-off', !on); });
    var mk = {case1Open:'case1', case2Open:'case2', safeDevice:'safe'}[name];
    if(mk) $all('[data-mark="'+mk+'"]').forEach(function(e){ e.textContent = on ? '▲' : '▼'; });
    if(name==='safeDevice') $all('[data-style-open]').forEach(function(b){ b.setAttribute('style', b.getAttribute(on?'data-style-open':'data-style-closed')); b.setAttribute('aria-expanded', on); });
  }
  function isOn(name){ var e=root.querySelector('[data-if="'+name+'"]'); return !!e && !e.classList.contains('mg-off'); }
  var slide = 0, timer;
  function showSlide(i){
    slide = i;
    $all('[data-slide]').forEach(function(img){ img.style.opacity = (+img.getAttribute('data-slide')===i) ? 1 : 0; });
    $all('[data-dot]').forEach(function(d){ d.style.background = (+d.getAttribute('data-dot')===i) ? 'var(--magna-mint-deep)' : '#fff'; });
  }
  function startTimer(){ clearInterval(timer); timer = setInterval(function(){ showSlide((slide+1)%2); }, 5000); }
  if(root.querySelector('[data-slide]')) startTimer();
  /* モーダルは「押した位置の近く」に表示（iframe内でfixedが画面外になるのを避ける） */
  function place(name, ev){
    var wrap = root.querySelector('[data-if="'+name+'"] > div'); if(!wrap) return;
    var rr = root.getBoundingClientRect(), rootTop = rr.top + (window.pageYOffset||0);
    var y = (ev && ev.clientY != null) ? ev.clientY + (window.pageYOffset||0) : (window.pageYOffset||0) + 200;
    var vh = Math.min(window.innerHeight || 800, 900), maxH = Math.min(vh * 0.86, 640);
    var inner = wrap.firstElementChild; if(inner) inner.style.maxHeight = maxH + 'px';
    var top = Math.max(0, Math.min(y - rootTop - 180, root.offsetHeight - maxH - 40));
    wrap.style.position='absolute'; wrap.style.inset='auto'; wrap.style.left='0'; wrap.style.right='0'; wrap.style.top='0';
    wrap.style.height = root.offsetHeight + 'px'; wrap.style.alignItems='flex-start'; wrap.style.setProperty('padding-top', (top + 20) + 'px', 'important');
  }
  /* 開閉コンテンツは「重ねて表示」（ブロックの高さが変わらず、はみ出さない） */
  ['case1Open','case2Open','safeDevice'].forEach(function(n){
    $all('[data-if="'+n+'"]').forEach(function(e){ e.classList.add('mg-pop'); e.parentElement.classList.add('mg-popwrap'); });
  });
  function closePops(except){
    ['case1Open','case2Open','safeDevice'].forEach(function(n){
      var e = root.querySelector('[data-if="'+n+'"]');
      if(e && !e.classList.contains('mg-off') && !(except && e.parentElement===except)) setIf(n,false);
    });
  }
  /* FAQを開くとその下が押し下げられる。ブロックの高さは変えられないため、末尾の余白が縮んで全体の高さを一定に保つ */
  var fill = null, TOTAL = 0;
  if(root.querySelector('[data-faq]')){
    var fe=null; try{ fe = window.frameElement; }catch(e){}
    if(framed && !fe){ fill = document.createElement('div'); fill.setAttribute('aria-hidden','true'); fill.style.cssText='background:'+(typeof FILL_COLOR!=='undefined'?FILL_COLOR:'#FFFDF5')+';height:0'; root.appendChild(fill); }
  }
  function contentH(){ return root.offsetHeight - (fill ? fill.offsetHeight : 0); }
  function reflow(){ if(fill) fill.style.height = Math.max(0, TOTAL - contentH()) + 'px'; }
  function measureReserve(){
    if(!fill) return;
    var wasOpen = $all('[data-faq-a]').filter(function(a){ return !a.classList.contains('mg-off'); });
    $all('[data-faq-a]').forEach(function(a){ a.classList.add('mg-off'); });
    fill.style.height='0px'; var base = contentH(), max = 0;
    $all('[data-faq-a]').forEach(function(a){ a.classList.remove('mg-off'); max = Math.max(max, contentH()-base); a.classList.add('mg-off'); });
    wasOpen.forEach(function(a){ a.classList.remove('mg-off'); });
    TOTAL = base + max; reflow();
  }
  var A = {
    openConsult: function(ev){ setIf('consultOpen', true); place('consultOpen', ev); },
    closeConsult: function(){ setIf('consultOpen', false); },
    toggleCase1: function(){ setIf('case1Open', !isOn('case1Open')); },
    toggleCase2: function(){ setIf('case2Open', !isOn('case2Open')); },
    toggleSafeDevice: function(){ setIf('safeDevice', !isOn('safeDevice')); },
    goKimura: function(ev){ setIf('showProfKimura', true); setIf('showProfTakayama', false); place('showProfKimura', ev); },
    goTakayama: function(ev){ setIf('showProfTakayama', true); setIf('showProfKimura', false); place('showProfTakayama', ev); },
    closeProfModal: function(){ setIf('showProfKimura', false); setIf('showProfTakayama', false); }
  };
  function downloadDoc(url, name){
    function viaLink(){ var a=document.createElement('a'); a.href=url; a.download=name; a.rel='noopener'; document.body.appendChild(a); a.click(); a.remove(); }
    fetch(url).then(function(r){ if(!r.ok) throw new Error(r.status); return r.blob(); }).then(function(b){
      var bu = URL.createObjectURL(new Blob([b], {type:'application/pdf'})), a=document.createElement('a');
      a.href=bu; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(bu); }, 60000);
    }).catch(viaLink);
  }
  root.addEventListener('click', function(ev){
    var within = ev.target.closest ? ev.target.closest('.mg-popwrap') : null;
    closePops(within);
    var t = ev.target.closest ? ev.target.closest('[data-act]') : null;
    if(t && root.contains(t)){
      var act = t.getAttribute('data-act');
      if(/position:\s*fixed/.test(t.getAttribute('style')||'') && ev.target !== t) return; /* 背景クリックのみ閉じる */
      if(act==='faq'){ var box=t.closest('[data-faq]'), a=box.querySelector('[data-faq-a]'), on=a.classList.contains('mg-off');
        if(on) $all('[data-faq]').forEach(function(o){ if(o!==box){ var oa=o.querySelector('[data-faq-a]'); if(!oa.classList.contains('mg-off')){ oa.classList.add('mg-off'); o.querySelector('[data-act="faq"]').setAttribute('aria-expanded','false'); o.querySelector('[data-faq-arrow]').style.transform='none'; } } });
        a.classList.toggle('mg-off', !on); t.setAttribute('aria-expanded', on); box.querySelector('[data-faq-arrow]').style.transform = on ? 'rotate(180deg)' : 'none'; reflow(); return; }
      if(act==='slide'){ showSlide(+t.getAttribute('data-dot')); startTimer(); return; }
      if(A[act]){ if(t.tagName==='A') ev.preventDefault(); A[act](ev); }
    }
    var d = ev.target.closest ? ev.target.closest('a[data-doc], a[data-dl]') : null;
    if(d){ ev.preventDefault(); downloadDoc(d.href, d.hasAttribute('data-doc') ? (LINKS.doc_name || d.getAttribute('download') || 'document.pdf') : (d.getAttribute('download') || 'document.pdf')); }
  });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape'){ A.closeConsult(); A.closeProfModal(); closePops(null); } });
  measureReserve(); window.addEventListener('load', measureReserve);
  (function(){ var t; window.addEventListener('resize', function(){ clearTimeout(t); t=setTimeout(measureReserve, 200); }); })();
  /* ---- 枠を直接伸ばせる環境では、中身の高さに合わせて枠を伸縮 ---- */
  if(framed){
    var h0=0;
    function fit(){ var h = Math.ceil(root.getBoundingClientRect().height); if(h===h0) return; h0=h;
      try{ if(window.frameElement) window.frameElement.style.height = h + 'px'; }catch(e){}
      try{ window.parent.postMessage({type:'magna-embed-height', name:MG_NAME, height:h}, '*'); }catch(e){} }
    fit(); if(window.ResizeObserver) new ResizeObserver(fit).observe(root); window.addEventListener('load', fit);
  }
  /* ---- スクロール演出（ふわっと表示） ---- */
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if(!window.IntersectionObserver) return;
  var items = [], seen = [];
  $all('[data-sec] > div > *, [data-sec] > div').filter(function(el){ return el.offsetHeight>40 && el.offsetHeight<2400; }).forEach(function(el){
    if(seen.indexOf(el)>-1 || el.closest('[data-reveal]')) return; seen.push(el);
    el.setAttribute('data-reveal',''); el.style.opacity='0'; el.style.transform='translateY(26px)';
    el.style.transition='opacity .7s cubic-bezier(.22,.7,.3,1), transform .7s cubic-bezier(.22,.7,.3,1)'; items.push(el);
  });
  var io = new IntersectionObserver(function(entries){ entries.forEach(function(e){
    if(!e.isIntersecting) return; var el=e.target, i=Array.prototype.indexOf.call(el.parentNode.children, el);
    el.style.transitionDelay = Math.min(i,4)*70+'ms'; el.style.opacity='1'; el.style.transform='none'; io.unobserve(el);
  }); }, {rootMargin:'0px 0px -12% 0px', threshold:0.08});
  items.forEach(function(el){ io.observe(el); });
  /* 念のため：一定時間後に未表示のものを強制表示 */
  setTimeout(function(){ items.forEach(function(el){ if(el.style.opacity==='0'){ el.style.opacity='1'; el.style.transform='none'; } }); }, 6000);
})();

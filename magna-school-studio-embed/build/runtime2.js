(function(){
  var root = document.getElementById('magna-lp'); if(!root) return;
  function u(p){ return /^(https?:)?\/\//.test(p) || p.charAt(0)==='/' || p.indexOf('data:')===0 ? p : ASSET_BASE + p; }
  function $all(s){ return Array.prototype.slice.call(root.querySelectorAll(s)); }
  /* ---- 設定の反映 ---- */
  $all('[data-t]').forEach(function(e){ var k=e.getAttribute('data-t'); if(k in TEXT) e.innerHTML = TEXT[k]; });
  $all('[data-img]').forEach(function(e){ var k=e.getAttribute('data-img'); if(IMAGES[k]) e.src = u(IMAGES[k]); if(ALT[k]) e.alt = ALT[k]; });
  $all('[data-link]').forEach(function(e){ var k=e.getAttribute('data-link'); if(LINKS[k]) e.href = (k==='doc_pdf' ? u(LINKS[k]) : LINKS[k]); });
  if(!SHOW_INTRO) root.classList.add('mg-nointro');
  /* ---- 開閉UI ---- */
  function setIf(name, on){
    $all('[data-if="'+name+'"]').forEach(function(e){ e.classList.toggle('mg-off', !on); });
    var mk = {case1Open:'case1', case2Open:'case2', safeDevice:'safe'}[name];
    if(mk) $all('[data-mark="'+mk+'"]').forEach(function(e){ e.textContent = on ? '▲' : '▼'; });
    if(name==='safeDevice') $all('[data-style-open]').forEach(function(b){ b.setAttribute('style', b.getAttribute(on?'data-style-open':'data-style-closed')); b.setAttribute('aria-expanded', on); });
    if(name==='menuOpen') $all('[data-act="toggleMenu"]').forEach(function(b){ b.setAttribute('aria-expanded', on); });
  }
  function isOn(name){ var e=root.querySelector('[data-if="'+name+'"]'); return !!e && !e.classList.contains('mg-off'); }
  var slide = 0, timer;
  function showSlide(i){
    slide = i;
    $all('[data-slide]').forEach(function(img){ img.style.opacity = (+img.getAttribute('data-slide')===i) ? 1 : 0; });
    $all('[data-dot]').forEach(function(d){ d.style.background = (+d.getAttribute('data-dot')===i) ? 'var(--magna-mint-deep)' : '#fff'; });
  }
  function startTimer(){ clearInterval(timer); timer = setInterval(function(){ showSlide((slide+1)%2); }, 5000); }
  startTimer();
  /* モーダルは「押した位置の近く」に表示（iframe埋め込みでも画面外に出ないよう fixed を使わない） */
  function place(name, ev){
    var wrap = root.querySelector('[data-if="'+name+'"] > div'); if(!wrap) return;
    var dlg = wrap.querySelector('[role="dialog"], div') || wrap;
    var rr = root.getBoundingClientRect(), rootTop = rr.top + (window.pageYOffset||0);
    var y = (ev && ev.clientY != null) ? ev.clientY + (window.pageYOffset||0) : (window.pageYOffset||0) + 200;
    var vh = Math.min(window.innerHeight || 800, 900);
    var maxH = Math.min(vh * 0.86, 640);
    var inner = wrap.firstElementChild && wrap.firstElementChild.tagName==='DIV' ? wrap.firstElementChild : null;
    if(wrap.getAttribute('role')==='dialog' && wrap.firstElementChild) inner = wrap.firstElementChild;
    if(inner) inner.style.maxHeight = maxH + 'px';
    var top = Math.max(0, Math.min(y - rootTop - 180, root.offsetHeight - maxH - 40));
    wrap.style.position='absolute'; wrap.style.inset='auto'; wrap.style.left='0'; wrap.style.right='0'; wrap.style.top='0';
    wrap.style.height = root.offsetHeight + 'px'; wrap.style.alignItems='flex-start'; wrap.style.setProperty('padding-top', (top + 20) + 'px', 'important');
  }
  /* ---- 開閉コンテンツは「重ねて表示」（ページの高さが変わらず、埋め込み枠から下がはみ出さない） ---- */
  ['case1Open','case2Open','safeDevice'].forEach(function(n){
    $all('[data-if="'+n+'"]').forEach(function(e){ e.classList.add('mg-pop'); e.parentElement.classList.add('mg-popwrap'); });
  });
  function closePops(except){
    ['case1Open','case2Open','safeDevice'].forEach(function(n){
      var e = root.querySelector('[data-if="'+n+'"]');
      if(e && !e.classList.contains('mg-off') && !(except && e.parentElement===except)) setIf(n,false);
    });
  }
  /* ---- FAQを開くとその下が押し下げられる。埋め込み枠の高さは変えられないため、末尾の余白が縮んで全体の高さを一定に保つ ---- */
  var fill = null, TOTAL = 0, canGrow = false;
  (function(){
    var framed=false; try{ framed = window.self !== window.top; }catch(e){ framed = true; }
    var fe=null; try{ fe = window.frameElement; }catch(e){}
    canGrow = !!fe;                        /* 枠を直接伸ばせる環境 */
    if(!framed || canGrow) return;         /* ページ内に直接描画（自動で伸びる）/ 枠を伸ばせる場合は余白不要 */
    fill = document.createElement('div'); fill.setAttribute('aria-hidden','true'); fill.style.cssText='background:#081b1e;height:0';
    root.appendChild(fill);
  })();
  function contentH(){ return root.offsetHeight - (fill ? fill.offsetHeight : 0); }
  function measureReserve(){
    if(!fill) return;
    var wasOpen = $all('[data-faq-a]').filter(function(a){ return !a.classList.contains('mg-off'); });
    $all('[data-faq-a]').forEach(function(a){ a.classList.add('mg-off'); });
    fill.style.height='0px'; var base = contentH(), max = 0;
    $all('[data-faq-a]').forEach(function(a){ a.classList.remove('mg-off'); max = Math.max(max, contentH()-base); a.classList.add('mg-off'); });
    wasOpen.forEach(function(a){ a.classList.remove('mg-off'); });
    TOTAL = base + max; reflow();
  }
  function reflow(){ if(fill) fill.style.height = Math.max(0, TOTAL - contentH()) + 'px'; }
  var A = {
    toggleMenu: function(){ setIf('menuOpen', !isOn('menuOpen')); },
    closeMenu: function(){ setIf('menuOpen', false); },
    openConsult: function(ev){ setIf('consultOpen', true); setIf('menuOpen', false); place('consultOpen', ev); },
    closeConsult: function(){ setIf('consultOpen', false); },
    toggleCase1: function(){ setIf('case1Open', !isOn('case1Open')); },
    toggleCase2: function(){ setIf('case2Open', !isOn('case2Open')); },
    toggleSafeDevice: function(){ setIf('safeDevice', !isOn('safeDevice')); },
    goKimura: function(ev){ setIf('showProfKimura', true); setIf('showProfTakayama', false); place('showProfKimura', ev); },
    goTakayama: function(ev){ setIf('showProfTakayama', true); setIf('showProfKimura', false); place('showProfTakayama', ev); },
    closeProfModal: function(){ setIf('showProfKimura', false); setIf('showProfTakayama', false); }
  };
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
    var d = ev.target.closest ? ev.target.closest('a[data-doc]') : null;
    if(d){ ev.preventDefault(); downloadDoc(d.href, LINKS.doc_name || d.getAttribute('download') || 'document.pdf'); return; }
    var l = ev.target.closest ? ev.target.closest('a[href^="#"]') : null;
    if(l && l.getAttribute('href').length>1){
      var id = l.getAttribute('href').slice(1);
      if(id==='contact') return;
      var el = root.querySelector('[id="'+id+'"]');
      if(el){ ev.preventDefault(); setIf('menuOpen', false); requestAnimationFrame(function(){ requestAnimationFrame(function(){ goTo(el, id); }); }); }
    }
  });
  /* ページ内リンク：iframe埋め込みでも親ページ側がスクロールするようにする */
  function goTo(el, id){
    var framed = false; try{ framed = window.self !== window.top; }catch(e){ framed = true; }
    if(framed){
      if(!el.hasAttribute('tabindex')) el.setAttribute('tabindex','-1');
      el.style.outline = 'none';
      try{ el.focus({preventScroll:true}); }catch(e){}
      el.scrollIntoView({block:'start', behavior:'auto'});
    } else {
      var top = el.getBoundingClientRect().top + (window.pageYOffset||0) - 90;
      window.scrollTo({top: Math.max(0, top), behavior:'smooth'});
    }
  }
  /* 資料PDFを「そのままダウンロード」 */
  function downloadDoc(url, name){
    function viaLink(){ var a=document.createElement('a'); a.href=url; a.download=name; a.rel='noopener'; document.body.appendChild(a); a.click(); a.remove(); }
    fetch(url).then(function(r){ if(!r.ok) throw new Error(r.status); return r.blob(); }).then(function(b){
      var bu = URL.createObjectURL(new Blob([b], {type:'application/pdf'})), a=document.createElement('a');
      a.href=bu; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(bu); }, 60000);
    }).catch(viaLink);
  }
  document.addEventListener('keydown', function(e){ if(e.key==='Escape'){ A.closeConsult(); A.closeProfModal(); closePops(null); } });
  /* ---- iframe埋め込み時：中身の高さに合わせて枠を伸縮（FAQ等を開いても下まで見られるように） ---- */
  (function(){
    var framed=false; try{ framed = window.self !== window.top; }catch(e){ framed = true; }
    if(!framed) return;
    document.documentElement.style.background = '#081b1e'; document.body.style.margin='0';
    function fit(){
      var h = Math.ceil(root.getBoundingClientRect().height);
      try{ if(window.frameElement) window.frameElement.style.height = h + 'px'; }catch(e){}
      try{ window.parent.postMessage({type:'magna-embed-height', height:h}, '*'); }catch(e){}
    }
    fit(); if(window.ResizeObserver) new ResizeObserver(fit).observe(root); window.addEventListener('load', fit);
  })();

  measureReserve(); window.addEventListener('load', measureReserve);
  (function(){ var t; window.addEventListener('resize', function(){ clearTimeout(t); t=setTimeout(measureReserve, 200); }); })();
  /* ---- iframe埋め込み時：ヘッダー／下部バーを「見えている画面」に追従させる ----
     iframeが縦に長いと position:sticky/fixed が効かないため、親画面に見えている範囲を測って動かします。
     ・親ページに直接アクセスできる場合：親のスクロールに同期（最もなめらか）
     ・できない場合：IntersectionObserverで測り、動きを先読み補正してなめらかに表示 */
  (function(){
    var framed=false; try{ framed = window.self !== window.top; }catch(e){ framed = true; }
    if(!framed) return;
    var hd = root.querySelector('[data-hd="bar"]'), sp = root.querySelector('[data-r="spbar"]');
    if(sp){ sp.style.position='absolute'; sp.style.setProperty('bottom','auto','important'); sp.style.left='0'; sp.style.right='0'; }
    if(hd){ hd.style.willChange='transform'; }
    function place(top, bot){
      var H = root.offsetHeight;
      if(hd){ var hh=hd.offsetHeight, y=Math.max(0, Math.min(top, H-hh)); hd.style.transform='translate3d(0,'+y.toFixed(1)+'px,0)'; }
      if(sp && sp.offsetHeight){ var y2=Math.max(0, Math.min(bot, H)-sp.offsetHeight); sp.style.setProperty('top', y2.toFixed(1)+'px', 'important'); }
    }
    function measured(top, bot){ place(top + 2, bot); }
    var fe=null; try{ fe = window.frameElement; }catch(e){}
    var pw=null; try{ if(fe) pw = window.parent; }catch(e){}
    if(fe && pw){
      /* 親ページに触れる場合：親のスクロールに同期 */
      var pend=false;
      function sync(){ pend=false;
        var r=fe.getBoundingClientRect(), vh=pw.innerHeight||800, rt=root.getBoundingClientRect().top + (window.pageYOffset||0);
        var top=Math.max(0,-r.top), bot=Math.min(vh-r.top, r.height);
        place(top-rt, bot-rt); }
      function req(){ if(!pend){ pend=true; requestAnimationFrame(sync); } }
      try{ pw.addEventListener('scroll', req, {passive:true}); pw.addEventListener('resize', req); }catch(e){}
      window.addEventListener('scroll', req, {passive:true}); sync(); return;
    }
    if(!window.IntersectionObserver) return;
    var cs=document.createElement('div'); cs.setAttribute('aria-hidden','true');
    cs.style.cssText='position:absolute;left:0;top:0;width:2px;height:100%;pointer-events:none;opacity:0;z-index:-1'; root.appendChild(cs);
    var STEP=8, vis={}, io=null;
    function recompute(){
      var min=1e9, max=-1; for(var k in vis){ k=+k; if(k<min) min=k; if(k>max) max=k; }
      if(max<0) return; measured(min*STEP, (max+1)*STEP);
    }
    function build(){
      if(io) io.disconnect(); cs.innerHTML=''; vis={};
      var H=root.offsetHeight; STEP=Math.max(8, Math.ceil(H/1600)); var n=Math.ceil(H/STEP);
      io = new IntersectionObserver(function(entries){ entries.forEach(function(e){ var i=+e.target.getAttribute('data-i'); if(e.isIntersecting) vis[i]=1; else delete vis[i]; }); recompute(); });
      var frag=document.createDocumentFragment();
      for(var i=0;i<n;i++){ var d=document.createElement('div'); d.setAttribute('data-i',i); d.style.cssText='position:absolute;left:0;width:2px;height:'+STEP+'px;top:'+(i*STEP)+'px'; frag.appendChild(d); }
      cs.appendChild(frag); cs.childNodes.forEach(function(d){ io.observe(d); });
    }
    build(); var lastH=root.offsetHeight;
    if(window.ResizeObserver) new ResizeObserver(function(){ var h=root.offsetHeight; if(Math.abs(h-lastH)>2){ lastH=h; build(); } }).observe(root);
    window.addEventListener('load', function(){ lastH=root.offsetHeight; build(); });
  })();
  /* ---- スクロール演出（ふわっと表示＋写真の視差） ---- */
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
  var sp = window.matchMedia && window.matchMedia('(max-width:760px)').matches;
  var px = sp ? [] : $all('img').filter(function(img){ return img.getBoundingClientRect().height>180 && !img.hasAttribute('data-slide'); });
  px.forEach(function(img){ img.style.willChange='transform'; });
  var tick=false;
  function onScroll(){ if(tick) return; tick=true; requestAnimationFrame(function(){
    var vh=window.innerHeight; px.forEach(function(img){ var r=img.getBoundingClientRect(); if(r.bottom<-200||r.top>vh+200) return;
      img.style.transform='translate3d(0,'+(((r.top+r.height/2-vh/2)/vh)*-14).toFixed(2)+'px,0) scale(1.02)'; }); tick=false; }); }
  window.addEventListener('scroll', onScroll, {passive:true}); onScroll();
})();

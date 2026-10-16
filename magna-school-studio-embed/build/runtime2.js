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
  var A = {
    toggleMenu: function(){ setIf('menuOpen', !isOn('menuOpen')); },
    closeMenu: function(){ setIf('menuOpen', false); },
    openConsult: function(){ setIf('consultOpen', true); setIf('menuOpen', false); },
    closeConsult: function(){ setIf('consultOpen', false); },
    toggleCase1: function(){ setIf('case1Open', !isOn('case1Open')); },
    toggleCase2: function(){ setIf('case2Open', !isOn('case2Open')); },
    toggleSafeDevice: function(){ setIf('safeDevice', !isOn('safeDevice')); },
    goKimura: function(){ setIf('showProfKimura', true); setIf('showProfTakayama', false); },
    goTakayama: function(){ setIf('showProfTakayama', true); setIf('showProfKimura', false); },
    closeProfModal: function(){ setIf('showProfKimura', false); setIf('showProfTakayama', false); }
  };
  root.addEventListener('click', function(ev){
    var t = ev.target.closest ? ev.target.closest('[data-act]') : null;
    if(t && root.contains(t)){
      var act = t.getAttribute('data-act');
      if(/position:\s*fixed/.test(t.getAttribute('style')||'') && ev.target !== t) return; /* 背景クリックのみ閉じる */
      if(act==='faq'){ var box=t.closest('[data-faq]'), a=box.querySelector('[data-faq-a]'), on=a.classList.contains('mg-off');
        a.classList.toggle('mg-off', !on); t.setAttribute('aria-expanded', on); box.querySelector('[data-faq-arrow]').style.transform = on ? 'rotate(180deg)' : 'none'; return; }
      if(act==='slide'){ showSlide(+t.getAttribute('data-dot')); startTimer(); return; }
      if(A[act]){ if(t.tagName==='A') ev.preventDefault(); A[act](); }
    }
    var l = ev.target.closest ? ev.target.closest('a[href^="#"]') : null;
    if(l && l.getAttribute('href').length>1){
      var id = l.getAttribute('href').slice(1), el = root.querySelector('[id="'+id+'"]') || document.getElementById(id);
      if(el){ ev.preventDefault(); el.scrollIntoView({behavior:'smooth', block:'start'}); }
    }
  });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape'){ A.closeConsult(); A.closeProfModal(); } });
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

(function(){
  var root = document.querySelector('.mg-root[data-mg="'+MG_NAME+'"]'); if(!root) return;
  function u(p){ return /^(https?:)?\/\//.test(p) || p.charAt(0)==='/' || p.indexOf('data:')===0 ? p : ASSET_BASE + p; }
  function $all(s){ return Array.prototype.slice.call(root.querySelectorAll(s)); }
  var framed=false; try{ framed = window.self !== window.top; }catch(e){ framed = true; }
  if(framed){ try{ document.body.style.margin='0'; document.documentElement.style.webkitTextSizeAdjust='100%'; document.documentElement.style.textSizeAdjust='100%'; if(typeof FILL_COLOR!=='undefined') document.documentElement.style.background = FILL_COLOR; }catch(e){} }
  /* ---- 文字・画像・リンクの反映 ---- */
  $all('[data-t]').forEach(function(e){ var k=e.getAttribute('data-t'); if(k in TEXT) e.innerHTML = TEXT[k]; });
  $all('[data-img]').forEach(function(e){ var k=e.getAttribute('data-img'); if(IMAGES[k]) e.src = u(IMAGES[k]); if(ALT[k]) e.alt = ALT[k]; });
  /* ---- 募集職種（POSITIONS から自動生成） ---- */
  var list = (typeof POSITIONS!=='undefined' ? POSITIONS : []);
  function pad2(n){ return (n<10?'0':'')+n; }
  function heroHTML(){
    if(!list.length) return '<a class="mf-job-q" data-link="apply_url" href="#" style="flex: 999 1 560px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px clamp(20px, 2.5vw, 28px); background: #fff; color: #1C201C; text-decoration: none;"><span style="display: flex; flex-direction: column; gap: 4px;"><span style="font-size: 17px; font-weight: 900; color: #004445;">現在、公開中の募集はありません</span><span style="font-size: 14px; color: #4A524C;">ご興味のある方は、まずはお気軽にご連絡ください。</span></span><span aria-hidden="true" style="flex: none; color: #004445;">↗</span></a>';
    var max = (typeof HERO_MAX!=='undefined'?HERO_MAX:3), shown = list.length>max ? list.slice(0,max-1) : list, more = list.length - shown.length;
    var h = '<div style="flex: 999 1 560px; min-width: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 1px; background: #E2E2E2;">';
    shown.forEach(function(p){ h += '<a class="mf-job-q" href="#positions" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px clamp(18px, 2vw, 24px); background: #fff; color: #1C201C; text-decoration: none; min-height: 72px; box-sizing: border-box;"><span style="display: flex; flex-direction: column; gap: 4px; min-width: 0;"><span style="font-size: 18px; font-weight: 900; color: #004445; line-height: 1.4; word-break: keep-all;">'+p.title+'</span><span style="font-size: 13px; font-weight: 700; color: #4A524C; line-height: 1.5;"><span class="nw">'+p.tagA+'</span> ／ <span class="nw">'+p.tagB+'</span></span></span><span aria-hidden="true" style="flex: none; color: #004445;">→</span></a>'; });
    if(more>0) h += '<a class="mf-job-q" href="#positions" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px clamp(18px, 2vw, 24px); background: #fff; color: #004445; text-decoration: none; font-size: 15px; font-weight: 900; min-height: 72px; box-sizing: border-box;">ほか'+more+'件を見る <span aria-hidden="true">→</span></a>';
    return h + '</div>';
  }
  function listHTML(){
    if(!list.length) return '<div style="padding: 28px clamp(20px, 2.5vw, 30px); background: #fff; display: flex; flex-direction: column; gap: 8px;"><p style="margin: 0; font-size: 20px; font-weight: 900;">現在、公開中の募集はありません。</p><p style="margin: 0; font-size: 15px; line-height: 1.8; color: #4A524C;">新しい募集はこのページでお知らせします。ご興味のある方は、下のフォームからお気軽にご連絡ください。</p></div>';
    var h = '<div style="display: flex; flex-direction: column; gap: 20px;">';
    list.forEach(function(p,i){ h += '<article style="display: flex; flex-wrap: wrap; background: #fff; color: #1C201C; box-shadow: 0 12px 32px rgba(0,68,69,0.10);"><div style="flex: 1 1 300px; min-width: 0; min-height: 220px; position: relative; overflow: hidden;"><img src="'+u(p.img)+'" alt="'+(p.alt||'')+'" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block;"><span style="position: absolute; top: 16px; left: 16px; padding: 6px 12px; background: #004445; color: #fff; font-family: Poppins, sans-serif; font-size: 12px; font-weight: 600; letter-spacing: 0.12em;">POSITION '+pad2(i+1)+'</span></div><div style="flex: 999 1 460px; min-width: 0; padding: clamp(24px, 3vw, 40px); display: flex; flex-direction: column; gap: 18px; box-sizing: border-box;"><div style="display: flex; flex-direction: column; gap: 10px;"><h3 style="margin: 0; font-size: clamp(24px, 2.6vw, 34px); font-weight: 900; line-height: 1.35; color: #004445; word-break: keep-all;">'+p.title+'</h3><p style="margin: 0; display: flex; flex-wrap: wrap; gap: 8px; font-size: 13px; font-weight: 700; color: #004445;"><span style="padding: 6px 12px; border-radius: 64px; background: #E4F2EA;">'+p.tagA+'</span><span style="padding: 6px 12px; border-radius: 64px; background: #E4F2EA;">'+p.tagB+'</span></p></div><p style="margin: 0; font-size: 16px; line-height: 1.9;">'+p.summary+'</p><div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; margin-top: auto;"><a class="mf-pill" href="'+p.url+'" style="display: inline-flex; align-items: center; justify-content: space-between; gap: 32px; min-height: 54px; box-sizing: border-box; padding: 0 26px; border-radius: 64px; background: #004445; color: #fff; text-decoration: none; font-size: 16px; font-weight: 900; border: 1px solid #004445;">'+(typeof APPLY_LABEL!=='undefined'?APPLY_LABEL:'この職種に応募する')+' <span aria-hidden="true">↗</span></a><span style="font-size: 13px; color: #4A524C;">'+(typeof APPLY_NOTE!=='undefined'?APPLY_NOTE:'まずはカジュアルな面談から')+'</span></div></div></article>'; });
    return h + '</div>';
  }
  $all('[data-pos="hero"]').forEach(function(e){ e.innerHTML = heroHTML(); });
  $all('[data-pos="list"]').forEach(function(e){ e.innerHTML = listHTML(); });
  $all('[data-pos-count]').forEach(function(e){ e.textContent = list.length; });
  $all('[data-link]').forEach(function(e){ var k=e.getAttribute('data-link'); if(LINKS[k]) e.href = u(LINKS[k]); });
  /* ---- 他のブロックへのリンク（STUDIOページ内の別Embedへ移動） ---- */
  /* 移動先のページURL：PAGE_URL が空欄なら、いま表示しているサイトのドメイン（プレビューでも本番でも自動）＋ PAGE_PATH を使う */
  var page = PAGE_URL || '';
  if(!page){
    var ref = ''; try{ ref = document.referrer || ''; }catch(e){}
    var ru = null; try{ ru = new URL(ref); }catch(e){}
    if(ru && ru.pathname.length > 1){ page = ru.origin + ru.pathname + ru.search; }
    else { var og = ''; try{ og = location.ancestorOrigins[0] || ''; }catch(e){} if(!og && ru) og = ru.origin; if(og) page = og + (typeof PAGE_PATH!=='undefined' ? PAGE_PATH : '/'); }
  }
  page = page.replace(/#.*$/, '');
  $all('a[href^="#"]').forEach(function(a){
    var id = a.getAttribute('href').slice(1); if(!id) return;
    var t = (ANCHORS && ANCHORS[id]) || id;
    a.setAttribute('href', page ? page + '#' + t : '#' + t); a.setAttribute('target','_top'); a.setAttribute('rel','noopener');
  });
  /* ---- 外部サイトへのリンク（target指定がないものは EXTERNAL_TARGET で開く） ---- */
  $all('a[href^="http"]').forEach(function(a){
    if(a.hasAttribute('target')) return;
    a.setAttribute('target', (typeof EXTERNAL_TARGET!=='undefined' && EXTERNAL_TARGET) || '_top'); a.setAttribute('rel','noopener');
  });
  /* ---- ヘッダー固定用の先頭余白（メニューで飛んだとき、固定ヘッダーに見出しが隠れないように） ---- */
  (function(){
    var sp = root.querySelector('[data-topspace]'); if(!sp || typeof TOP_SPACE==='undefined') return;
    var first = sp.nextElementSibling;
    function apply(){
      var w = window.innerWidth || 1200, h = (w<=760 ? TOP_SPACE.phone : w<=1000 ? TOP_SPACE.tablet : TOP_SPACE.pc);
      sp.style.height = h + 'px';
      if(first){ first.style.removeProperty('padding-top'); var pad = parseFloat(getComputedStyle(first).paddingTop) || 0; first.style.setProperty('padding-top', Math.max(0, pad - h) + 'px', 'important'); }
    }
    apply(); window.addEventListener('resize', apply);
  })();
})();

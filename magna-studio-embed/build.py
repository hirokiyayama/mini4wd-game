import re, json, sys, os
SITE, OUT = sys.argv[1], sys.argv[2]
rd = lambda p: open(os.path.join(SITE, p), encoding='utf-8').read()
html = rd('index.html')
style = re.search(r'<style>(.*?)</style>', html, re.S).group(1)
css = re.sub(r'@import url\([^)]*\);', '', rd('lp-styles.css')) + '\n' + rd('lp-mobile.css') + '\n' + style
css = css.replace('url("assets/report/opt/n-hall-blue.jpg")', 'var(--hero-bg)')
css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
css = re.sub(r'\n\s*\n+', '\n', css)
body = re.search(r'<div class="portal">.*</div>\s*(?=<script)', html, re.S).group(0)

# ---- legends -> generated from config
lm = re.search(r'<div class="legends-track">\n(.*?)\n      </div>', body, re.S)
rows = re.findall(r'<div class="legend([^"]*)"><span class="bubble( blue)?">(.*?)</span><img src="assets/legends/([^"?]+)', lm.group(1))
seen, legends = set(), []
for cls, blue, text, f in rows:
    if f in seen: break
    seen.add(f); legends.append(dict(text=text, img='legends/'+f, color='blue' if blue else 'red', size=cls.strip().replace('lg-lg','large').replace('lg-sm','small') or 'normal'))
body = body.replace(lm.group(0), '<div class="legends-track" data-legends></div>')

# ---- images
IMG = {}
def img_key(path):
    k = re.sub(r'[^a-z0-9]+', '_', os.path.splitext(os.path.basename(path.split('?')[0]))[0].lower())
    IMG[k] = path.split('?')[0]; return k
def sub_src(m):
    return '%sdata-img="%s"' % (m.group(1), img_key(m.group(2)))
body = re.sub(r'(<img [^>]*?)src="(assets/[^"]+)"', sub_src, body)
body = body.replace('<video class="ph-video" autoplay muted loop playsinline preload="auto" poster="assets/report/opt/n-hall-blue.jpg">\n      <source src="assets/lp-hero-video.mp4" type="video/mp4">\n    </video>',
  '<video class="ph-video" data-video="hero_video" data-poster="hero_bg" autoplay muted loop playsinline preload="auto"></video>')
body = body.replace('<video src="assets/game-battle.mp4" autoplay muted loop playsinline preload="metadata" poster="assets/game-battle.png"', '<video data-video="battle_video" data-poster="battle_poster" autoplay muted loop playsinline preload="metadata"')
VID = {'hero_video':'lp-hero-video.mp4','battle_video':'game-battle.mp4'}
IMG['hero_bg']='report/opt/n-hall-blue.jpg'; IMG['battle_poster']='game-battle.png'
# strip "assets/" prefix
IMG = {k:v.replace('assets/','') for k,v in IMG.items()}

# ---- texts
T = {}
def add(key, orig):
    assert orig in body, (key, orig)
    T[key] = orig
    return key
specs = []  # (key, original inner html, attr-host regex handled by direct replace)
def mark(key, inner, open_tag_pattern):
    global body
    pat = '(' + open_tag_pattern + r')' + re.escape(inner) + r'(?=<)'
    n = len(re.findall(pat, body))
    assert n >= 1, (key, inner)
    body = re.sub(pat, lambda m: m.group(1).rstrip('>') [:-0 or None] + (' data-t="%s">' % key), body, count=1)
    T[key] = inner
# generic approach: replace exact ">inner<" with attribute injection on the nearest opening tag
def mk(key, inner):
    global body
    idx = body.find('>' + inner + '<')
    assert idx >= 0, (key, inner)
    start = body.rfind('<', 0, idx)
    tag = body[start:idx]
    body = body[:start] + tag + ' data-t="%s">' % key + body[idx+1+len(inner):]
    body = body[:start+len(tag)+len(' data-t="%s">'%key)] + body[start+len(tag)+len(' data-t="%s">'%key):]
    T[key] = inner
TXT = [
 ('hero_cta','大会に挑戦する <i>▶</i>'),
 ('about_sub1','やることはシンプル。<br>でも、勝負は本気だ！'),
 ('about_sub2','「この単語、知ってる！」<br class="sp-br">だけじゃ足りない。<br>誰より速く答えて、誰より勝つ。<br>それが、マグナ英語バトル。'),
 ('about_bub1','英単語を<br class="sp-br">覚える！'),('about_bub2','問題に<br class="sp-br">答える！'),('about_bub3','ライバルと戦う！'),
 ('summer_status','激闘、終了'),('summer_title','激闘、終了。'),
 ('summer_text','約4,000人が挑戦。<br>静岡市の頂点を決める熱戦が<br>繰り広げられた。'),
 ('summer_btn','夏大会の結果を見る ▶'),
 ('winter_soon_sub','キミの出番は、ここからだ'),('winter_title','冬の王者を決める。'),
 ('winter_text','夏のチャンピオンは、もう決まった。<br>次に挑戦するのは、キミだ。<br>もっと覚えろ。もっと速くなれ。<br>そして、頂点を奪え。'),
 ('step1_title','覚える。'),
]
# fix: h3 contains img after text, handle steps separately
for k,v in TXT:
    if k in ('hero_cta',): 
        mk(k,v)
    elif k=='step1_title': pass
    else: mk(k,v)
# hero main title (has span before text)
body = body.replace('<span class="fx fx-aura" aria-hidden="true"></span>キミが<br>最強になれ</p>', '<span class="fx fx-aura" aria-hidden="true"></span><span data-t="hero_main">キミが<br>最強になれ</span></p>'); T['hero_main']='キミが<br>最強になれ'
body = body.replace('<span class="at-s">英単語で、</span><span class="at-l">ガチバトル</span>','<span class="at-s" data-t="about_title_s">英単語で、</span><span class="at-l" data-t="about_title_l">ガチバトル</span>'); T['about_title_s']='英単語で、'; T['about_title_l']='ガチバトル'
body = body.replace('<span class="ev-s">次のチャンピオンは</span><span class="ev-l">キミだ</span>','<span class="ev-s" data-t="events_title_s">次のチャンピオンは</span><span class="ev-l" data-t="events_title_l">キミだ</span>'); T['events_title_s']='次のチャンピオンは'; T['events_title_l']='キミだ'
for i,(a,t) in enumerate([('覚える。','アプリで英単語を叩き込め。<br>毎日やれば、知らなかった単語が<br>武器になる。<br>強くなるのは、練習したヤツだ。'),('勝つ。','オンライン予選でライバルと激突。<br>勝って、勝って、勝ち上がれ。<br>決勝への切符をつかめ。'),('つかむ。','決勝は大舞台。<br>目の前にいるのは、<br>勝ち残った強者たち。<br>最後まで勝ち抜いて、王者になれ。')],1):
    body = body.replace('<h3 class="step-h">%s<img'%a, '<h3 class="step-h"><span data-t="step%d_title">%s</span><img'%(i,a)); T['step%d_title'%i]=a
    mk('step%d_text'%i, t)
body = body.replace('<p class="prize-lead fx-host"><span class="fx fx-aura" aria-hidden="true"></span>勝者だけが<br class="sp-br">手にできる</p>','<p class="prize-lead fx-host"><span class="fx fx-aura" aria-hidden="true"></span><span data-t="prize_lead">勝者だけが<br class="sp-br">手にできる</span></p>'); T['prize_lead']='勝者だけが<br class="sp-br">手にできる'
mk('prize1_text','優勝者にはチャンピオントロフィー。'); mk('prize2_text','さらに、勝者には特別なプレゼント。')
mk('prize_kick_b','<em>「自分が一番強かった」</em><br>と証明できる。')
body = body.replace('そして何より、<b data-t','そして何より、<b data-t')
mk('past_text','約4,000人が挑戦。<br>その中から頂点に立ったのは――'); mk('past_go','チャンピオンを見る ▶')
body = body.replace('<h2 class="fx-host"><span class="fx fx-ring" aria-hidden="true"><i></i><i></i><i></i></span>ここから<br>伝説が始まる</h2>','<h2 class="fx-host"><span class="fx fx-ring" aria-hidden="true"><i></i><i></i><i></i></span><span data-t="history_title">ここから<br>伝説が始まる</span></h2>'); T['history_title']='ここから<br>伝説が始まる'
body = body.replace('<span class="fx fx-flame" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>夏の王者は決まった<br>じゃあ、冬は誰が勝つ？</h2>','<span class="fx fx-flame" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span data-t="cta_title">夏の王者は決まった<br>じゃあ、冬は誰が勝つ？</span></h2>'); T['cta_title']='夏の王者は決まった<br>じゃあ、冬は誰が勝つ？'
mk('cta_order','今からでも遅くない。<b>英単語を覚えろ。<br>何度も戦え。速く答えろ。</b>そして、優勝を奪いにいこう。')
mk('cta_final','キミが最強になれ！')
mk('foot_org','ミントフラッグ株式会社・eスポーツ事務局')
mk('foot_privacy','プライバシーポリシー'); mk('foot_site','ミントフラッグ株式会社 公式サイト')
mk('foot_copy','© Mint Flag, Inc. マグナ eスポーツ大会'); mk('school_promo','おいでよ！マグナの英語スクールへ')
# prize_kick: wrap
T['prize_kick_b']=T['prize_kick_b']
# alt texts
ALT = {'logo_tournament':'マグナ eスポーツ 英単語バトル大会','n_hall_players':'2026夏大会の会場で対戦する選手たち','n_award_champion':'2026夏大会の表彰式','magna_logo':'マグナ English School'}
for k,a in ALT.items():
    body = re.sub(r'(data-img="%s")(\s+loading="lazy")?\s+alt="[^"]*"'%k, r'\1\2 alt="%s"'%a, body) if False else body
# links
LINKS = {'hero_cta':('#events',),}
body = body.replace('href="/esports-shizuoka2026summer/"','data-link="summer_url" href="#"')
body = body.replace('href="https://mintflag.com/privacy_policy"','data-link="privacy_url" href="#"').replace('href="https://mintflag.com/"','data-link="company_url" href="#"').replace('href="https://magna-eikaiwa.mintflag.com/"','data-link="school_url" href="#"')
L = {'summer_url':'https://example.com/esports-shizuoka2026summer/','privacy_url':'https://mintflag.com/privacy_policy','company_url':'https://mintflag.com/','school_url':'https://magna-eikaiwa.mintflag.com/'}
ruby = rd('ruby-furigana.js')

def js(o): return json.dumps(o, ensure_ascii=False, indent=2)
cfg = '''/* ================================================================
   ★ ここだけ編集すればOK ★  文字・画像・リンクの設定エリア
   ----------------------------------------------------------------
   ・TEXT   : 画面の文字。改行は <br> 、太字は <b>…</b> が使えます
   ・IMAGES : 画像のURL。ファイル名だけなら ASSET_BASE が前に付きます
              （https:// から始まるURLを書けば、そのURLを直接使います）
   ・VIDEOS : 背景動画のURL（同上）
   ・LEGENDS: 流れる偉人キャラ（text=吹き出し, img=画像, color=red/blue, size=normal/large/small）
   ・LINKS  : ボタン／フッターのリンク先
   ================================================================ */
var ASSET_BASE = "__ASSET_BASE__";   // ★ 画像・動画を置いたフォルダのURL（末尾は / ）
var USE_RUBY = true;                 // ふりがな自動付与：true=あり / false=なし
var TEXT = %s;
var IMAGES = %s;
var VIDEOS = %s;
var LEGENDS = %s;
var LINKS = %s;
/* ============ ↑ 設定エリアここまで（以下は触らなくてOK） ============ */
''' % (js(T), js(IMG), js(VID), js(legends), js(L))
render = r'''
(function(){
  function u(p){ return /^(https?:)?\/\//.test(p) || p.charAt(0)==='/' || p.indexOf('data:')===0 ? p : ASSET_BASE + p; }
  var root = document.documentElement; root.style.setProperty('--hero-bg', 'url("' + u(IMAGES.hero_bg) + '")');
  document.querySelectorAll('[data-t]').forEach(function(e){ var k=e.getAttribute('data-t'); if(k in TEXT) e.innerHTML = TEXT[k]; });
  document.querySelectorAll('[data-img]').forEach(function(e){ var k=e.getAttribute('data-img'); if(IMAGES[k]) e.src = u(IMAGES[k]); });
  document.querySelectorAll('[data-link]').forEach(function(e){ var k=e.getAttribute('data-link'); if(LINKS[k]) e.href = LINKS[k]; });
  document.querySelectorAll('video[data-video]').forEach(function(v){
    var p = IMAGES[v.getAttribute('data-poster')]; if(p) v.poster = u(p);
    v.src = u(VIDEOS[v.getAttribute('data-video')]); v.muted = true;
    var pl = v.play && v.play(); if(pl && pl.catch) pl.catch(function(){});
  });
  var tr = document.querySelector('[data-legends]');
  if(tr){ var h=''; for(var r=0;r<2;r++) LEGENDS.forEach(function(l){
    var c='legend'+(l.size==='large'?' lg-lg':l.size==='small'?' lg-sm':'');
    h+='<div class="'+c+'"><span class="bubble'+(l.color==='blue'?' blue':'')+'">'+l.text+'</span><img src="'+u(l.img)+'" alt=""></div>'; });
    tr.innerHTML = h; }
  window.__USE_RUBY = USE_RUBY;
})();
'''
ruby_guard = ruby.replace('function run() {', 'function run() {\n    if (window.__USE_RUBY === false) return;',1)
assert 'USE_RUBY' in ruby_guard or '__USE_RUBY' in ruby_guard
out = '''<!-- ===== マグナ eスポーツ大会 LP / STUDIO Embed 用（1ファイル完結）===== -->
<!-- STUDIO：Embedブロックの「コード」欄に、このファイルの中身をそのまま貼り付け -->
<style>
html,body{margin:0;padding:0;background:#120814;}
%s
</style>
<div class="portal">
%s
</div>
<script>
%s
%s
</script>
<script>
%s
</script>
''' % (css, body.replace('<div class="portal">','',1).rsplit('</div>',1)[0], cfg, render, ruby_guard)
open(OUT,'w',encoding='utf-8').write(out)
print(len(out), len(T), len(IMG), len(legends))

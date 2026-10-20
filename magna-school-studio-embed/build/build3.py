import json, re, sys, os
B, OUT, BASE = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
rd = lambda p: open(os.path.join(B, p), encoding='utf-8').read()
T = json.load(open(B+'/texts.json')); M = json.load(open(B+'/meta.json'))
TEXTS = dict(T)
css = rd('style.css').replace('#magna-lp', '.mg-root')
css = css.replace('.mg-root{margin:0;padding-bottom:64px;background:#fff}', '.mg-root{margin:0;background:#fff}')
css = css.replace('.mg-root{scroll-behavior:smooth}', '')
extra = '''
.mg-root [data-if]{display:contents}
.mg-root .mg-off{display:none !important}
.mg-root.mg-nointro [data-intro="veil"]{display:none !important}
.mg-root.mg-nointro [data-sec="fv"]{animation:none !important;opacity:1 !important}
.mg-root img{vertical-align:middle}
.mg-root [data-if].mg-pop{display:block}
.mg-root [data-if].mg-off{display:none !important}
.mg-root .mg-popwrap{position:relative}
.mg-root .mg-pop{position:absolute;left:0;right:0;top:calc(100% + 8px);z-index:40;filter:drop-shadow(0 14px 28px rgba(16,24,40,.22))}
.mg-root [data-faq-a].mg-off{display:none !important}
'''
header_css = '''
.mg-root[data-mg="header"] [data-hd="bar"]{position:relative !important;flex-wrap:wrap !important;row-gap:6px !important}
.mg-root[data-mg="header"] [data-hd="burger"]{display:none !important}
@media (max-width:1280px){
.mg-root[data-mg="header"] [data-hd="nav"]{display:grid !important;grid-template-columns:repeat(4,auto) !important;order:3 !important;flex:1 1 100% !important;gap:4px 22px !important;justify-content:center !important;font-size:13px !important;white-space:nowrap !important}
}
@media (max-width:760px){
.mg-root[data-mg="header"] [data-hd="nav"]{grid-template-columns:repeat(4,1fr) !important;gap:4px !important;font-size:12px !important;white-space:normal !important;text-align:center !important;line-height:1.35 !important}
.mg-root[data-mg="header"] [data-hd="nav"] a{white-space:normal !important}
}
'''
SEC = {'header':'ヘッダー／メニュー','intro':'オープニング','fv':'ファーストビュー','stats':'導入実績','media':'メディア掲載','ba':'導入前後','why':'アプリでできること','scene':'活用シーン','cases':'先生方の声','area':'対応エリア','apply':'安心・安全／なぜ無料','free_reason':'なぜ、マグナはずっと無料なの？','safe':'導入準備','trust':'専門家・大学との連携','play':'学校劇','faq':'よくある質問','footer':'フッター','spbar':'スマホ固定バー','misc':'サポート','modal_consultOpen':'相談窓口の選択画面','modal_showProfKimura':'木村教授コメント','modal_showProfTakayama':'高山教授コメント','modal_case1Open':'先生の声（青森）','modal_case2Open':'先生の声（静岡）','modal_safeDevice':'対応端末・ログイン方法'}
def js(o): return json.dumps(o, ensure_ascii=False)
chunk = lambda n: open(os.path.join(B, 'chunk_%s.html' % n), encoding='utf-8').read()
ROOT_STYLE = 'font-family: var(--font-base); color: var(--ink); background: #fff; width: 100%; box-sizing: border-box; position: relative'
FAQBG = '#FFFDF5'
ENDBG = {'header':'#ffffff','fv':'#F7FAF9','why':'#F7FAF9','cases':'#ffffff','free':'#ffffff','safe':'#FFFDF5','footer':'#081b1e','safeA':'#17345C','faqB':'#FFFDF5'}
HEIGHTS = {  # (PC 1281px以上, タブレット〜1280px, スマホ〜430px)
 'header':(80,105,100),'fv':(2000,2650,2700),'why':(1750,3350,2500),'cases':(2250,2550,3450),'free':(900,1100,1400),
 'safe':(4700,5500,6700),'footer':(260,300,550),'safeA':(2800,3700,4100),'faqB':(1800,1750,2500)}
SPEC = [
 # file, name(MG), title, body chunks, extra css, intro?, consult modal?, anchors?, fill
 ('01-header', 'header', 'メニューヘッダー', ['header'], header_css, False, False),
 ('02-first-view', 'fv', 'ファーストビュー〜マグナでできること（手前）', ['fv'], '', True, True),
 ('03-why-to-voice', 'why', 'マグナでできること〜先生方の声（手前）', ['why'], '', False, False),
 ('04-voice-to-free', 'cases', '先生方の声〜なぜ、マグナはずっと無料なの？（手前）', ['cases'], '', False, False),
 ('05-free-to-easy', 'free', 'なぜ、マグナはずっと無料なの？〜導入はカンタン（手前）', ['free'], '', False, False),
 ('06-easy-to-faq', 'safe', '導入はカンタン〜よくあるご質問', ['safe'], '', False, True),
 ('07-footer', 'footer', 'フッターメニュー', ['foot'], '', False, False),
 ('alt-06a-easy-to-play', 'safeA', '導入はカンタン〜英語を学べる学校劇（FAQを別ブロックにする場合）', ['safeA'], '', False, True),
 ('alt-06b-faq', 'faqB', 'よくあるご質問（FAQを別ブロックにする場合）', ['faqB'], '', False, False),
]
ANCH = '{\n  "free-reason": "free-reason",   /* ずっと無料の理由 → STUDIOで「なぜ、マグナはずっと無料なの？」ブロックに付けるID */\n  "why": "why",   /* アプリでできること → 「マグナでできること」ブロックのID */\n  "safe": "safe",   /* 導入準備 → 「導入はカンタン」ブロックのID */\n  "faq": "faq",   /* よくある質問 → 「よくあるご質問」ブロックのID（06を1つで貼る場合は06のID） */\n  "consult": "fv"   /* 気軽に相談する → 「ファーストビュー」ブロックのID */\n}'
rt = open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'runtime3.js'), encoding='utf-8').read()
sizes = {}
for fname, mg, title, parts, xcss, intro, consult in SPEC:
    body = ''.join(chunk(p) for p in parts)
    if mg == 'safeA': body = body  # includes prof modals
    if intro: body = chunk('intro') + body
    if consult: body += chunk('consult')
    keys = re.findall(r'data-t="([^"]+)"', body)
    imgs = re.findall(r'data-img="([^"]+)"', body)
    # keys inside TEXT strings (links, imgs in html text)
    texts = {k: TEXTS[k] for k in dict.fromkeys(keys) if k in TEXTS}
    inner = ' '.join(texts.values())
    links = set(re.findall(r'data-link="([^"]+)"', body + ' ' + inner.replace('\\"', '"')))
    LINKS_ALL = {
      'doc_name': 'マグナ学校版_ご案内資料.pdf', 'doc_pdf': 'magna-school-document.pdf',
      'guide_existing': 'guide-existing-schools.pdf', 'guide_new': 'guide-new-schools.pdf',
      'store_google': 'https://play.google.com/store/apps/details?id=com.mintflag.magnaForSchool',
      'store_apple': 'https://apps.apple.com/jp/app/%E5%AD%A6%E6%A0%A1%E7%89%88-%E3%83%9E%E3%82%B0%E3%83%8A%E3%81%A8%E3%81%B5%E3%81%97%E3%81%8E%E3%81%AE%E5%B0%91%E5%A5%B3-for-school/id6759899720',
      'form_school': 'https://docs.google.com/forms/d/e/1FAIpQLSdFfzpaijpvhUgsRaNtiYo9XPpMWGZ09SsCN9AwZx2W9OxSOQ/viewform',
      'form_board': 'https://docs.google.com/forms/d/e/1FAIpQLSfRhNoXYtUL1V7co8C8DN9M7pc2RSxE4zIixdAG8EaZZRSk3Q/viewform'}
    if 'data-doc' in body: links.add('doc_name')
    LINKS = {k: v for k, v in LINKS_ALL.items() if k in links}
    IM = {k: M['IMG'][k] for k in dict.fromkeys(imgs) if k in M['IMG']}
    AL = {k: M['ALT'][k] for k in IM if k in M['ALT']}
    lines, last = [], None
    for k in texts:
        s = k.rsplit('_', 1)[0]
        if s != last: lines.append('\n  /* ── %s (%s) ── */' % (SEC.get(s, s), s)); last = s
        lines.append('  %s: %s,' % (json.dumps(k), json.dumps(texts[k], ensure_ascii=False)))
    text_js = '{' + '\n'.join(lines) + '\n}'
    obj = lambda d: '{\n' + ',\n'.join('  %s: %s' % (json.dumps(k), js(v)) for k, v in d.items()) + '\n}'
    fillcolor = FAQBG
    cfg = '''/* ================================================================
   ★ ここだけ編集すればOK ★  文字・画像・リンクの設定エリア（%s）
   ・TEXT   : 画面の文字（キーは「セクション名_番号」）。改行は <br> 、リンクや装飾のHTMLもそのまま書けます
   ・IMAGES : 画像ファイル名 or URL（https:// から始まるURLならそのURLを使用。ファイル名だけなら ASSET_BASE が前に付きます）
   ・ALT    : 画像の代替テキスト（IMAGES と同じキー）
   ・LINKS  : PDF・フォームなどのリンク先
   ・PAGE_URL / ANCHORS : メニューなど「他のブロック」へ移動するときの、STUDIOページのURLと移動先ID
   ================================================================ */
var MG_NAME = "%s";
var ASSET_BASE = "%s";   /* ★ 画像・PDFを置いたフォルダのURL（末尾は / ） */
var PAGE_URL = "https://mintflag.com/education";   /* ★ 公開したSTUDIOページのURL（例: https://xxxx.studio.site/）。空欄の場合は自動で取得を試みます */
var ANCHORS = %s;
%s%s%svar TEXT = %s;
var IMAGES = %s;
var ALT = %s;
var LINKS = %s;
/* ============ ↑ 設定エリアここまで（以下は触らなくてOK） ============ */
''' % (title, mg, BASE, ANCH, 'var SHOW_INTRO = true;   /* ページ表示時のオープニング演出：true=あり / false=なし */\n' if intro else '',
       'var FILL_COLOR = "%s";   /* ブロックの高さが余ったとき（FAQを開いて縮む余白を含む）の下側の色 */\n' % ENDBG[mg], '', text_js, obj(IM), obj(AL), obj(LINKS))
    out = '''<!-- ===== マグナとふしぎの少女 For School LP ／ STUDIO Embed（分割版）: %s ===== -->
<!-- STUDIO：このブロックを「Embed」で配置し、コード欄にこのファイルの中身をそのまま貼り付け。幅は100%% -->
<!-- ★高さ（ブレイクポイント別）：PC(1281px以上) %dpx ／ タブレット〜1280px %dpx ／ スマホ〜430px %dpx 以上 -->
<style>
@import url('https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;500;700;800;900&family=Baloo+2:wght@600;700;800&display=swap');
%s
%s
%s
</style>
<div class="mg-root" data-mg="%s" style="%s">
%s
</div>
<script>
%s
%s
</script>
''' % (title, HEIGHTS[mg][0], HEIGHTS[mg][1], HEIGHTS[mg][2], css, extra, xcss, mg, ROOT_STYLE, body, cfg, rt)
    open(os.path.join(OUT, fname + '.txt'), 'w', encoding='utf-8').write(out)
    print(fname, len(out), 'texts', len(texts), 'imgs', len(IM), 'links', list(LINKS))

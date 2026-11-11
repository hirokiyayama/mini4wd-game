import json, re, sys, os
B, OUT, BASE = sys.argv[1], sys.argv[2], sys.argv[3]
MODE = sys.argv[4] if len(sys.argv) > 4 else 'main'
HJ = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'heights.json')
HEIGHTS = json.load(open(HJ)) if os.path.exists(HJ) else {}
os.makedirs(OUT, exist_ok=True)
T = dict(json.load(open(B+'/texts.json'))); M = json.load(open(B+'/meta.json'))
css = open(B+'/style.css', encoding='utf-8').read()
part = lambda n: open(os.path.join(B, 'part_%s.html' % n), encoding='utf-8').read()
FONT = "@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Zen+Kaku+Gothic+New:wght@500;700;900&display=swap');"
extra = '''
html,body{margin:0;padding:0}
.mg-root [data-pos]{display:contents}
.mg-root img{vertical-align:middle}
.mg-root{-webkit-text-size-adjust:100%;text-size-adjust:100%}
'''
header_css = '''
.mg-root[data-mg="header"]{background:transparent !important}
.mg-root[data-mg="header"] header{position:relative !important}
'''
SEC = {'header':'ヘッダー／メニュー','hero':'ファーストビュー','message':'代表メッセージ','mission':'MISSION','concept':'FUN LEARNING','wanted':'WANTED（求める人物像）','workstyle':'WORK STYLE','service':'SERVICE','voices':'MEMBER VOICES','positions':'OPEN POSITIONS','cta':'CTA','band':'MORE HAPPINESS','flinks':'フッター上のリンク帯','footer':'フッター'}
BG = {'hero':'#F4F4F4','message':'#F4F4F4','mission':'#F4F4F4','concept':'#E4F2EA','wanted':'#F4F4F4','workstyle':'#ffffff','service':'#F4F4F4','voices':'#F4F4F4','positions':'#E4F2EA','cta':'#F4F4F4','band':'#F4F4F4','flinks':'#0B4547','footer':'#021C1E'}
ENDBG = {'header':'transparent'}
ANCH = '{\n  "mission": "mission",   /* MISSION → STUDIOで「MISSION」を含むブロックに付けるID */\n  "concept": "concept",   /* FUN LEARNING → 「FUN LEARNING」ブロックのID */\n  "workstyle": "workstyle",   /* WORK STYLE → 「WORK STYLE」を含むブロックのID */\n  "voices": "voices",   /* MEMBER → 「MEMBER VOICES」を含むブロックのID */\n  "positions": "positions"   /* 募集職種 → 「OPEN POSITIONS」ブロックのID */\n}'
POSITIONS = [
 {"title":"コーチ","tagA":"フルリモート","tagB":"副業OK","url":"https://docs.google.com/forms/d/e/1FAIpQLScO0S8gX86mgkHvvfQHZnrqStouttKET9ceHX84v4XjaEa3FQ/viewform","img":"bbab787b4f2f1d1a08d7c25405751070.jpg","alt":"","summary":"AI英会話アプリとオンラインのコーチングを組み合わせ、子どもたち一人ひとりの「できた！」に伴走します。"},
 {"title":"バイリンガルティーチャー","tagA":"英語堪能者","tagB":"子ども好き歓迎","url":"https://docs.google.com/forms/d/e/1FAIpQLScO0S8gX86mgkHvvfQHZnrqStouttKET9ceHX84v4XjaEa3FQ/viewform","img":"81a70e895f4be0c18a6a86a24c0b398e.jpg","alt":"","summary":"オンラインのグループレッスンで、ゲームやアクティビティを通して英語の楽しさを子どもたちに届けます。"},
 {"title":"体験会スタッフ","tagA":"営業・接客経験者歓迎","tagB":"子ども好き歓迎","url":"https://docs.google.com/forms/d/e/1FAIpQLScO0S8gX86mgkHvvfQHZnrqStouttKET9ceHX84v4XjaEa3FQ/viewform","img":"3754cf3d3a1abfe5e2fc0080971874cb.jpg","alt":"","summary":"体験会で子どもと保護者を笑顔で迎え、Fun Learningの魅力を直接伝えます。"}]
rt = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'runtime_rec.js'), encoding='utf-8').read()
def js(o): return json.dumps(o, ensure_ascii=False)
SPEC = [  # file, mg, title, parts, anchored(topspace)
 ('01-header', 'header', 'ヘッダーメニュー', ['header'], False),
 ('02-first-view', 'hero', 'ファーストビュー〜代表メッセージ（手前）', ['hero'], True),
 ('03-message-to-fun-learning', 'message', '代表メッセージ〜FUN LEARNING（手前）', ['message', 'mission'], True),
 ('04-fun-learning-to-wanted', 'concept', 'FUN LEARNING〜WANTED（手前）', ['concept'], True),
 ('05-wanted-to-open-positions', 'wanted', 'WANTED〜OPEN POSITIONS（手前）', ['wanted', 'workstyle', 'service', 'voices'], True),
 ('06-open-positions-to-footer', 'positions', 'OPEN POSITIONS〜フッター（手前）', ['positions', 'cta'], True),
 ('07-footer', 'footer', 'フッターメニュー', ['band', 'flinks', 'footer'], False),
 ('alt-03a-message', 'messageA', '代表メッセージ（MISSIONを別ブロックにする場合）', ['message'], True),
 ('alt-03b-mission', 'missionB', 'MISSION（MISSIONを別ブロックにする場合）', ['mission'], True),
 ('alt-05a-wanted', 'wantedA', 'WANTED（WORK STYLE・MEMBERを別ブロックにする場合）', ['wanted'], True),
 ('alt-05b-workstyle-service', 'workstyleB', 'WORK STYLE〜SERVICE（別ブロックにする場合）', ['workstyle', 'service'], True),
 ('alt-05c-voices', 'voicesC', 'MEMBER VOICES（別ブロックにする場合）', ['voices'], True),
]
FINE = [  # 見出しごとに正確に移動できる分け方（file, mg, title, parts, anchored, 高さ計測キー）
 ('01-header', 'header', 'ヘッダーメニュー', ['header'], False, '01-header'),
 ('02-first-view', 'hero', 'ファーストビュー', ['hero'], True, '02-first-view'),
 ('03-message', 'messageA', '代表メッセージ', ['message'], True, 'alt-03a-message'),
 ('04-mission', 'missionB', 'MISSION', ['mission'], True, 'alt-03b-mission'),
 ('05-fun-learning', 'concept', 'FUN LEARNING', ['concept'], True, '04-fun-learning-to-wanted'),
 ('06-wanted', 'wantedA', 'WANTED', ['wanted'], True, 'alt-05a-wanted'),
 ('07-work-style-service', 'workstyleB', 'WORK STYLE〜SERVICE', ['workstyle', 'service'], True, 'alt-05b-workstyle-service'),
 ('08-member-voices', 'voicesC', 'MEMBER VOICES', ['voices'], True, 'alt-05c-voices'),
 ('09-open-positions-cta', 'positions', 'OPEN POSITIONS〜CTA', ['positions', 'cta'], True, '06-open-positions-to-footer'),
 ('10-footer', 'footer', 'フッターメニュー', ['band', 'flinks', 'footer'], False, '07-footer'),
]
V3 = [
 ('01-header', 'header', 'ヘッダーメニュー', ['header'], False, '01-header'),
 ('02-first-view', 'hero', 'ファーストビュー〜代表メッセージ（手前）', ['hero'], True, '02-first-view'),
 ('03-message-to-mission', 'messageA', '代表メッセージ〜MISSION（手前）', ['message'], True, 'alt-03a-message'),
 ('04-mission-to-fun-learning', 'missionB', 'MISSION〜FUN LEARNING（手前）', ['mission'], True, 'alt-03b-mission'),
 ('05-fun-learning-to-work-style', 'conceptW', 'FUN LEARNING〜WORK STYLE（手前）', ['concept', 'wanted'], True, 'v3-05'),
 ('06-work-style-to-member', 'workstyleB', 'WORK STYLE〜MEMBER（手前）', ['workstyle', 'service'], True, 'alt-05b-workstyle-service'),
 ('07-member-to-footer', 'voicesF', 'MEMBER〜フッター（手前）', ['voices', 'positions', 'cta'], True, 'v3-07'),
 ('08-footer', 'footer', 'フッターメニュー', ['band', 'flinks', 'footer'], False, '07-footer'),
 ('alt-07a-member', 'voicesC', 'MEMBER（OPEN POSITIONSを別ブロックにする場合）', ['voices'], True, 'alt-05c-voices'),
 ('alt-07b-open-positions-to-footer', 'positions', 'OPEN POSITIONS〜CTA（別ブロックにする場合）', ['positions', 'cta'], True, '06-open-positions-to-footer'),
]
V4 = [
 ('01-header', 'header', 'ヘッダーメニュー', ['header'], False, '01-header'),
 ('02-first-view', 'hero', 'ファーストビュー〜代表メッセージ（手前）', ['hero'], True, '02-first-view'),
 ('03-message-to-mission', 'messageA', '代表メッセージ〜MISSION（手前）', ['message'], True, 'alt-03a-message'),
 ('04-mission-to-fun-learning', 'missionB', 'MISSION〜FUN LEARNING（手前）', ['mission'], True, 'alt-03b-mission'),
 ('05-fun-learning-to-work-style', 'conceptW', 'FUN LEARNING〜WORK STYLE（手前）', ['concept', 'wanted'], True, 'v3-05'),
 ('06-work-style-to-member', 'workstyleB', 'WORK STYLE〜MEMBER（手前）', ['workstyle', 'service'], True, 'alt-05b-workstyle-service'),
 ('07-member-to-open-positions', 'voicesC', 'MEMBER〜OPEN POSITIONS（手前）', ['voices'], True, 'alt-05c-voices'),
 ('08-open-positions-to-footer', 'positions', 'OPEN POSITIONS〜フッター（手前）', ['positions', 'cta'], True, '06-open-positions-to-footer'),
 ('09-footer', 'footer', 'フッターメニュー', ['band', 'flinks', 'footer'], False, '07-footer'),
]
if MODE == 'v4': SPEC = V4
elif MODE == 'v3': SPEC = V3
elif MODE == 'fine': SPEC = FINE
else: SPEC = [x + (x[0],) for x in SPEC]
for fname, mg, title, parts, anch, hkey in SPEC:
    body = ''.join(part(p) for p in parts)
    first, last = parts[0], parts[-1]
    if anch: body = '<div data-topspace aria-hidden="true" style="height:76px;background:%s"></div>' % BG[first] + body
    keys = re.findall(r'data-t="([^"]+)"', body); imgs = re.findall(r'data-img="([^"]+)"', body); links = re.findall(r'data-link="([^"]+)"', body)
    texts = {k: T[k] for k in dict.fromkeys(keys) if k in T}
    IM = {k: M['IMG'][k] for k in dict.fromkeys(imgs)}; AL = {k: M['ALT'][k] for k in IM if k in M['ALT']}
    LK = {k: M['LINKS'][k] for k in dict.fromkeys(links) if k in M['LINKS']}
    lines, lastsec = [], None
    for k in texts:
        s = k.rsplit('_', 1)[0]
        if s != lastsec: lines.append('\n  /* ── %s (%s) ── */' % (SEC.get(s, s), s)); lastsec = s
        lines.append('  %s: %s,' % (json.dumps(k), js(texts[k])))
    text_js = '{' + '\n'.join(lines) + '\n}'
    obj = lambda d: '{\n' + ',\n'.join('  %s: %s' % (json.dumps(k), js(v)) for k, v in d.items()) + '\n}'
    endc = ENDBG.get(mg) or BG.get(last, '#F4F4F4')
    uses_pos = 'data-pos' in body
    cfg = '''/* ================================================================
   ★ ここだけ編集すればOK ★  文字・画像・リンクの設定エリア（%s）
   ・TEXT      : 画面の文字（キーは「セクション名_番号」）。改行は <br> 、装飾のHTMLもそのまま書けます
   ・IMAGES    : 画像ファイル名 or URL（https:// から始まるURLならそのURLを使用。ファイル名だけなら ASSET_BASE が前に付きます）
   ・ALT       : 画像の代替テキスト（IMAGES と同じキー）
   ・LINKS     : ボタン・メニューのリンク先
%s   ・PAGE_URL / ANCHORS : 他のブロックへ移動するときの、STUDIOページのURLと移動先ID
   ================================================================ */
var MG_NAME = "%s";
var ASSET_BASE = "%s";   /* ★ 画像を置いたフォルダのURL（末尾は / ） */
var PAGE_URL = "";   /* 空欄＝自動（いま表示しているドメイン＋PAGE_PATH。プレビューでも本番でも動きます）。固定したい場合だけ https://… を入力 */
var PROD_HOST = "mintflag.com";   /* 本番サイトのドメイン */
var PAGE_PATH = "/recruit";   /* 本番ページのパス（公開URLが https://mintflag.com/recruit なら /recruit） */
var PREVIEW_PATH = "/";   /* ★ プレビュー（本番ドメイン以外）で開いているときのパス。プレビューのアドレス欄が https://〇〇/xxxx なら /xxxx を入力 */
var ANCHORS = %s;
var EXTERNAL_TARGET = "_top";   /* 外部サイトへのリンクの開き方："_top"=同じタブ / "_blank"=新しいタブ */
%s%svar TEXT = %s;
var IMAGES = %s;
var ALT = %s;
var LINKS = %s;
%s/* ============ ↑ 設定エリアここまで（以下は触らなくてOK） ============ */
''' % (title, '   ・POSITIONS : 募集職種のリスト（ここを増減すると、ファーストビューの早見と一覧の両方に反映されます）\n' if uses_pos else '', mg, BASE, ANCH,
       ('var TOP_SPACE = { pc: 76, tablet: 76, phone: 76 };   /* ★ ヘッダーを固定にしている場合：ブロック先頭の余白(px)＝ヘッダーの高さ。メニューで飛んだとき見出しが隠れないため */\n' if anch else ''),
       'var FILL_COLOR = "%s";   /* ブロックの高さが余ったときの下側の色 */\n' % endc, text_js, obj(IM), obj(AL), obj(LK),
       ('var POSITIONS = [\n' + ',\n'.join('  ' + js(p) for p in POSITIONS) + '\n];   /* ★ 募集職種：title=職種名, tagA/tagB=タグ, url=応募先, img=画像, summary=説明文（HTML可） */\nvar HERO_MAX = 3;   /* ファーストビューの早見に出す最大件数 */\nvar APPLY_LABEL = "この職種に応募する";\nvar APPLY_NOTE = "まずはカジュアルな面談から";\n' if uses_pos else ''))
    h = HEIGHTS.get(hkey) or HEIGHTS.get(mg) or [0, 0, 0]
    hdr = '<!-- ★高さ（ブレイクポイント別）：PC(1281px以上) %dpx ／ タブレット768〜1280px %dpx ／ スマホ〜430px %dpx 以上 -->\n' % tuple(h) if any(h) else ''
    out = '''<!-- ===== ミントフラッグ 採用LP（PC） ／ STUDIO Embed（分割版）: %s ===== -->
<!-- STUDIO：このブロックを「Embed」で配置し、コード欄にこのファイルの中身をそのまま貼り付け。幅は100%% -->
%s<style>
%s
%s
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
''' % (title, hdr, FONT, css, extra, header_css if mg == 'header' else '', '', mg, M['root_style'], body, cfg, rt)
    open(os.path.join(OUT, fname + '.txt'), 'w', encoding='utf-8').write(out)
    print(fname, len(out), 'texts', len(texts), 'imgs', len(IM), 'links', len(LK))

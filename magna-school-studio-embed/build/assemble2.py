import json, sys, re
B, OUT, BASE = sys.argv[1], sys.argv[2], sys.argv[3]
T = json.load(open(B+'/texts.json')); M = json.load(open(B+'/meta.json'))
html = open(B+'/page_keyed.html', encoding='utf-8').read()
css = open(B+'/style.css', encoding='utf-8').read()
extra = '''
#magna-lp [data-if]{display:contents}
#magna-lp .mg-off{display:none !important}
#magna-lp.mg-nointro [data-intro="veil"]{display:none !important}
#magna-lp.mg-nointro [data-sec="fv"]{animation:none !important;opacity:1 !important}
#magna-lp img{vertical-align:middle}
#magna-lp [id]{scroll-margin-top:90px}
#magna-lp .mg-popwrap{position:relative}
#magna-lp [data-if].mg-pop{display:block}
#magna-lp [data-if].mg-off{display:none !important}
#magna-lp .mg-pop{position:absolute;left:0;right:0;top:calc(100% + 8px);z-index:40;filter:drop-shadow(0 14px 28px rgba(16,24,40,.22))}
#magna-lp [data-faq-a].mg-off{display:none !important}
'''
SEC = {'header':'ヘッダー／メニュー','intro':'オープニング','fv':'ファーストビュー','stats':'導入実績','media':'メディア掲載','ba':'導入前後','why':'アプリでできること','scene':'活用シーン','cases':'導入事例','area':'対応エリア','apply':'導入の流れ','free_reason':'ずっと無料の理由','safe':'導入準備','trust':'信頼・監修','play':'遊びながら学ぶ','faq':'よくある質問','footer':'フッター','spbar':'スマホ固定バー','misc':'その他'}
lines, last = [], None
for k, v in T:
    s = k.rsplit('_', 1)[0]
    if s != last:
        lines.append('\n  /* ── %s (%s) ── */' % (SEC.get(s, s), s)); last = s
    lines.append('  %s: %s,' % (json.dumps(k), json.dumps(v, ensure_ascii=False)))
text_js = '{' + '\n'.join(lines) + '\n}'
imgs = '{\n' + ',\n'.join('  %s: %s' % (json.dumps(k), json.dumps(v)) for k, v in M['IMG'].items()) + '\n}'
alts = '{\n' + ',\n'.join('  %s: %s' % (json.dumps(k), json.dumps(v, ensure_ascii=False)) for k, v in M['ALT'].items()) + '\n}'
links = '''{
  doc_name: "マグナ学校版_ご案内資料.pdf",   /* ダウンロード時のファイル名 */
  guide_existing: "guide-existing-schools.pdf",   /* 対応ガイド（既存導入校向けPDF） */
  guide_new: "guide-new-schools.pdf",   /* 対応ガイド（新規導入校向けPDF） */
  doc_pdf: "magna-school-document.pdf",   /* 資料ダウンロードのPDF（ファイル名 or URL） */
  store_google: "https://play.google.com/store/apps/details?id=com.mintflag.magnaForSchool",   /* Google Play（For School版） */
  store_apple: "https://apps.apple.com/jp/app/%E5%AD%A6%E6%A0%A1%E7%89%88-%E3%83%9E%E3%82%B0%E3%83%8A%E3%81%A8%E3%81%B5%E3%81%97%E3%81%8E%E3%81%AE%E5%B0%91%E5%A5%B3-for-school/id6759899720",   /* App Store（For School版） */
  form_school: "https://docs.google.com/forms/d/e/1FAIpQLSdFfzpaijpvhUgsRaNtiYo9XPpMWGZ09SsCN9AwZx2W9OxSOQ/viewform",   /* 学校担当者様フォーム */
  form_board: "https://docs.google.com/forms/d/e/1FAIpQLSfRhNoXYtUL1V7co8C8DN9M7pc2RSxE4zIixdAG8EaZZRSk3Q/viewform"      /* 教育委員会担当者様フォーム */
}'''
cfg = '''/* ================================================================
   ★ ここだけ編集すればOK ★  文字・画像・リンクの設定エリア
   ----------------------------------------------------------------
   ・TEXT   : 画面の文字（キー名は「セクション名_番号」）。
              改行は <br> 、リンクや装飾のHTMLもそのまま書けます
   ・IMAGES : 画像ファイル名 or URL（https:// から始まるURLならそのURLを使用）
              ファイル名だけなら ASSET_BASE が前に付きます
   ・ALT    : 画像の代替テキスト（IMAGES と同じキー）
   ・LINKS  : PDF・フォームなどのリンク先
   ================================================================ */
var ASSET_BASE = "%s";   /* ★ 画像を置いたフォルダのURL（末尾は / ） */
var SCROLL_DEBUG = false;   /* メニュー移動の動作確認用：true にすると画面にどの方法で移動できたか表示します */
var SHOW_INTRO = true;   /* ページ表示時のオープニング演出：true=あり / false=なし */
var TEXT = %s;
var IMAGES = %s;
var ALT = %s;
var LINKS = %s;
/* ============ ↑ 設定エリアここまで（以下は触らなくてOK） ============ */
''' % (BASE, text_js, imgs, alts, links)
rt = open(B+'/../build/runtime2.js', encoding='utf-8').read()
out = '''<!-- ===== マグナとふしぎの少女 For School LP / STUDIO Embed 用（1ファイル完結）===== -->
<!-- STUDIO：Embedブロックの「コード」欄に、このファイルの中身をそのまま貼り付け -->
<!-- ★Embedブロックの高さ（ブレイクポイント別）：PC(1081px以上) 11400px ／ タブレット(〜1080px) 15500px ／ スマホ(〜600px) 16800px
     FAQを開くとその下が押し下げられ、ページ末尾（フッター下の濃い色の余白）が縮みます。余白が足りないと下が切れるので、上記以上の高さにしてください -->
<style>
@import url('https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;500;700;800;900&family=Baloo+2:wght@600;700;800&display=swap');
%s
%s
</style>
<div id="magna-lp" style="font-family: var(--font-base); color: var(--ink); background: #fff; width: 100%%; box-sizing: border-box; position: relative">
%s
</div>
<script>
%s
%s
</script>
''' % (css, extra, html, cfg, rt)
open(OUT, 'w', encoding='utf-8').write(out); print(len(out))

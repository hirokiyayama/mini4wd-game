# Step 1: template -> static plain HTML (page_static.html) + scoped css (style.css) + meta (meta.json)
import re, json, sys, os, glob, html as H
W = sys.argv[1]; OUT = sys.argv[2]
rd = lambda p: open(p, encoding='utf-8').read()
src = rd(W + '/index.html')
tpl = re.search(r'<x-dc>(.*)</x-dc>', src, re.S).group(1)
tpl = re.sub(r'<helmet>.*?</helmet>', '', tpl, flags=re.S)
style = re.search(r'<style>(.*?)</style>', src, re.S).group(1)
ds = glob.glob(W + '/_ds/*')[0]
css = '\n'.join(rd(ds + '/tokens/' + f) for f in ['colors.css', 'typography.css', 'spacing.css']) + '\n' + style

# ---------- scoped css
def split_top(s, sep=','):
    out, depth, q, cur = [], 0, None, ''
    for ch in s:
        if q:
            cur += ch
            if ch == q: q = None
            continue
        if ch in '"\'': q = ch; cur += ch; continue
        if ch in '([': depth += 1
        if ch in ')]': depth -= 1
        if ch == sep and depth == 0: out.append(cur); cur = ''; continue
        cur += ch
    out.append(cur); return out
def blocks(s):
    i, n = 0, len(s)
    while i < n:
        j = s.find('{', i)
        if j < 0: break
        depth, k = 1, j + 1
        while depth and k < n:
            if s[k] == '{': depth += 1
            elif s[k] == '}': depth -= 1
            k += 1
        yield s[i:j].strip(), s[j+1:k-1]; i = k
ROOT = '#magna-lp'
def scope_sel(sel):
    sel = sel.strip()
    if sel.startswith('html[data-intro-seen'): return None
    if sel in (':root', 'html', 'body', 'html,body'): return ROOT
    if sel.startswith('html'): sel = sel[4:]
    if sel.startswith('body'): sel = sel[4:]
    return ROOT + ' ' + sel
def scope(css):
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    css = re.sub(r'@import[^;]*;', '', css)
    out = []
    for head, body in blocks(css):
        if head.startswith('@media'): out.append(head + '{' + scope(body) + '}')
        elif head.startswith('@keyframes'): out.append(head + '{' + body + '}')
        else:
            sels = [scope_sel(s) for s in split_top(head)]
            sels = [s for s in sels if s]
            if sels: out.append(','.join(sels) + '{' + body.strip() + '}')
    return '\n'.join(out)
scoped = scope(css)
# html-level rules that moved onto root
scoped = scoped.replace('#magna-lp{margin:0;padding-bottom:64px;background:#fff}', '#magna-lp{margin:0;padding-bottom:64px;background:#fff}')
open(OUT + '/style.css', 'w', encoding='utf-8').write(scoped)

# ---------- template -> html
# eyebrow: keep A only
tpl = re.sub(r'<sc-if value="\{\{ eb[B-F] \}\}"[^>]*>.*?</sc-if>', '', tpl, flags=re.S)
tpl = re.sub(r'<sc-if value="\{\{ ebA \}\}"[^>]*>(.*?)</sc-if>', r'\1', tpl, flags=re.S)
# slides
slides = [('fv_slide1', '教室でGIGA端末を使い、AIキャラクターと英会話する子どもたち', '0% center', 'fv-bg-classroom-tablet-v2.jpg'),
          ('fv_slide2', '英検2級レベル(3,000単語)まで対応、聞く・話す・読む・書くの4技能で学べる', '100% 50%', 'fv-slide-eiken-tablet-v11.jpg')]
sl = ''.join('<img data-slide="%d" src="" alt="%s" style="display:block;position:absolute;inset:0;opacity:%d;transition:opacity .6s ease;width:100%%;height:100%%;max-width:none;margin:0;object-fit:cover;object-position:%s">' % (i, a, 1 if i == 0 else 0, p) for i, (k, a, p, f) in enumerate(slides))
tpl = re.sub(r'<sc-for list="\{\{ fvSlides \}\}".*?</sc-for>', lambda m: sl, tpl, flags=re.S)
dots = ''.join('<button type="button" data-dot="%d" data-act="slide" aria-label="%d枚目を表示" style="width:9px;height:9px;border-radius:999px;border:0;padding:0;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.25);background:%s"></button>' % (i, i+1, 'var(--magna-mint-deep)' if i == 0 else '#fff') for i in range(2))
tpl = re.sub(r'<sc-for list="\{\{ fvDots \}\}".*?</sc-for>', lambda m: dots, tpl, flags=re.S)
# conditional blocks
tpl = re.sub(r'<sc-if value="\{\{ (\w+) \}\}"[^>]*>', lambda m: '<div data-if="%s" class="mg-off">' % m.group(1), tpl)
tpl = tpl.replace('</sc-if>', '</div>')
# FAQ
Q = {'qDevice': ['どの端末・アカウントで', '利用できますか？'], 'qSteps': ['For Schoolアプリを', '導入する手順は？'], 'qUnit': ['学校単位・自治体単位のどちらで', '導入できますか？'],
     'qLimit': ['子どもの使いすぎを', '防ぐことはできますか？'], 'qBattle': ['英単語バトル大会への参加は', '必須ですか？']}
def faq(m):
    q = m.group(1); body = m.group(2)
    mm = re.match(r'\{\{ (\w+) \}\}', q)
    qh = ''.join('<span style="display:inline-block">%s</span>' % s for s in Q[mm.group(1)]) if mm else q
    return ('<div data-faq style="font-family:var(--font-base);background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;margin-bottom:10px">'
      '<button type="button" data-act="faq" aria-expanded="false" style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:none;border:none;cursor:pointer;font-family:inherit;padding:13px 14px;font-size:13.5px;font-weight:800;color:var(--ink);line-height:1.5">'
      '<span style="flex-shrink:0;width:24px;height:24px;border-radius:50%;background:var(--magna-mint);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:800">Q</span>'
      '<span style="flex:1">' + qh + '</span><span data-faq-arrow style="flex-shrink:0;color:var(--ink-3);font-size:14px;transition:transform .2s ease">▾</span></button>'
      '<div data-faq-a class="mg-off" style="padding:0 14px 14px 48px;font-size:12.5px;font-weight:600;color:var(--ink-2);line-height:1.75">' + body + '</div></div>')
tpl = re.sub(r'<x-import component-from-global-scope="DesignSystem_cd3c19\.FaqItem" q="([^"]*)"[^>]*>(.*?)</x-import>', faq, tpl, flags=re.S)
# marks / bound attrs
tpl = re.sub(r'\{\{ (case1|case2)Mark \}\}', lambda m: '<span data-mark="%s">▼</span>' % m.group(1), tpl)
tpl = tpl.replace('{{ safeDeviceMark }}', '<span data-mark="safe">▼</span>')
closed = 'box-sizing:border-box;display:flex;align-items:flex-start;gap:14px;border-radius:16px;padding:20px 22px;font-family:inherit;cursor:pointer;text-align:left;transition:border-color .16s ease,box-shadow .16s ease,background .16s ease;background:#fff;border:1px solid var(--line);box-shadow:0 2px 6px rgba(16,24,40,.04)'
opened = 'box-sizing:border-box;display:flex;align-items:flex-start;gap:14px;border-radius:16px;padding:20px 22px;font-family:inherit;cursor:pointer;text-align:left;transition:border-color .16s ease,box-shadow .16s ease,background .16s ease;background:var(--mint-soft);border:1.5px solid var(--magna-mint);box-shadow:0 4px 12px rgba(45,179,154,.14)'
tpl = tpl.replace('style="{{ safeCardStyleBound }}"', 'style="%s" data-style-open="%s" data-style-closed="%s"' % (closed, opened, closed))
tpl = re.sub(r'aria-expanded="\{\{ \w+ \}\}"', 'aria-expanded="false"', tpl)
# actions
for k in ['downloadDoc']:
    tpl = tpl.replace('onClick="{{ downloadDoc }}"', 'data-doc')
tpl = re.sub(r'\s*onClick="\{\{ (stop|stopClose) \}\}"', '', tpl)
tpl = re.sub(r'onClick="\{\{ (\w+) \}\}"', r'data-act="\1"', tpl)
tpl = tpl.replace('href="{{ formSchool }}"', 'data-link="form_school" href="#"').replace('href="{{ formBoard }}"', 'data-link="form_board" href="#"')
assert '{{' not in tpl, re.findall(r'.{60}\{\{.{40}', tpl)[:5]
# pdf links
tpl = tpl.replace('href="assets/magna-school-document.pdf"', 'data-link="doc_pdf" href="#"')
# images -> keys
IMG, order = {}, {}
def key(path):
    base = re.sub(r'[^a-z0-9]+', '_', os.path.splitext(os.path.basename(path))[0].lower()).strip('_')
    k, n = base, 1
    while k in IMG and IMG[k] != path:
        n += 1; k = '%s_%d' % (base, n)
    IMG[k] = path; return k
ALT = {}
def img_sub(m):
    tag = m.group(0)
    s = re.search(r'src="(assets/[^"]+)"', tag)
    if not s: return tag
    path = s.group(1)
    k0 = os.path.splitext(os.path.basename(path))[0]
    k = re.sub(r'[^a-z0-9]+', '_', k0.lower()).strip('_')
    # unique per element
    n, kk = 1, k
    while kk in IMG: n += 1; kk = '%s_%d' % (k, n)
    IMG[kk] = path.replace('assets/', '')
    a = re.search(r'alt="([^"]*)"', tag)
    if a and a.group(1): ALT[kk] = H.unescape(a.group(1))
    tag = tag.replace(s.group(0), 'data-img="%s" src=""' % kk)
    tag = re.sub(r'\s+alt="[^"]*"', '', tag, count=1)
    return tag
tpl = re.sub(r'<img\b[^>]*>', img_sub, tpl)
IMG2 = {}
for i, (k, a, p, f) in enumerate(slides):
    IMG2[k] = f; ALT[k] = a
    tpl = tpl.replace('data-slide="%d" src=""' % i, 'data-slide="%d" data-img="%s" src=""' % (i, k), 1)
    tpl = re.sub(r'(data-slide="%d" data-img="%s" src="" )alt="[^"]*"' % (i, k), r'\1', tpl)
IMG = {**IMG2, **IMG}
open(OUT + '/page_static.html', 'w', encoding='utf-8').write(tpl)
json.dump({'IMG': IMG, 'ALT': ALT}, open(OUT + '/meta.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(tpl), len(scoped), len(IMG), len(ALT))

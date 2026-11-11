# Main.dc.html -> full_static.html (+ meta.json, style.css, jsonld.txt)
import re, json, sys, os, html as H
SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
src = open(os.path.join(SRC, 'Main.dc.html'), encoding='utf-8').read()
tpl = re.search(r'<x-dc>(.*)</x-dc>', src, re.S).group(1)
css_raw = re.search(r'<helmet>.*?<style>(.*?)</style>', tpl, re.S).group(1)
tpl = re.sub(r'<helmet>.*?</helmet>', '', tpl, flags=re.S)
ld = re.search(r'<script type="application/ld\+json">(.*?)</script>', src, re.S).group(1).strip()
open(os.path.join(OUT, 'jsonld.txt'), 'w', encoding='utf-8').write(ld)

# ---- scoped css
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
        d, k = 1, j + 1
        while d and k < n:
            if s[k] == '{': d += 1
            elif s[k] == '}': d -= 1
            k += 1
        yield s[i:j].strip(), s[j+1:k-1]; i = k
ROOT = '.mg-root'
def sel(x):
    x = x.strip()
    if x in ('body', 'html', ':root', 'html,body'): return ROOT
    return ROOT + ' ' + x
def scope(css):
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S); out = []
    for head, body in blocks(css):
        if head.startswith('@media'): out.append(head + '{' + scope(body) + '}')
        else: out.append(','.join(sel(s) for s in split_top(head)) + '{' + body.strip() + '}')
    return '\n'.join(out)
open(os.path.join(OUT, 'style.css'), 'w', encoding='utf-8').write(scope(css_raw))

# ---- root wrapper style
m = re.search(r'<div style="(min-height: 100vh;[^"]*)">', tpl)
root_style = m.group(1).replace('min-height: 100vh;', '').strip()
# strip wrapper open/close
tpl = tpl[tpl.index(m.group(0)) + len(m.group(0)):]
tpl = tpl[:tpl.rindex('</div>')]

# ---- split parts by comment markers
marks = [('header', '<!-- HEADER -->'), ('hero', '<!-- HERO -->'), ('message', '<!-- MESSAGE'), ('mission', '<!-- MISSION -->'),
         ('concept', '<!-- FUN LEARNING (CONCEPT) -->'), ('wanted', "<!-- WHO WE'RE LOOKING FOR -->"), ('workstyle', '<!-- WORK STYLE -->'),
         ('service', '<!-- SERVICE -->'), ('voices', '<!-- MEMBER VOICES -->'), ('positions', '<!-- OPEN POSITIONS'), ('cta', '<!-- CTA -->'),
         ('band', '<!-- HP共通の締め'), ('flinks', '<!-- FOOTER LINKS (HP style) -->')]
idx = [(n, tpl.index(mk)) for n, mk in marks]
idx.append(('footer', tpl.index('<footer')))
idx_sorted = sorted(idx, key=lambda t: t[1]); parts = {}
for i, (n, pos) in enumerate(idx_sorted):
    end = idx_sorted[i+1][1] if i + 1 < len(idx_sorted) else len(tpl)
    seg = tpl[pos:end]
    seg = re.sub(r'^<!--.*?-->\s*', '', seg, flags=re.S).strip()
    parts[n] = seg

IMG, ALT, LINKS = {}, {}, {}
cnt = {}
def nxt(part, kind):
    cnt[(part, kind)] = cnt.get((part, kind), 0) + 1; return '%s_%s%d' % (part, kind, cnt[(part, kind)])
# ---- positions placeholders
def hero_block(s):
    a = s.index('<sc-if value="{{hasPositions}}"'); b = s.rindex('</sc-if>') + len('</sc-if>')
    return s[:a] + '<div data-pos="hero" style="display:contents"></div>' + s[b:]
parts['hero'] = hero_block(parts['hero'])
def list_block(s):
    a = s.index('<sc-if value="{{hasPositions}}"'); b = s.rindex('</sc-if>') + len('</sc-if>')
    return s[:a] + '<div data-pos="list" style="display:contents"></div>' + s[b:]
parts['positions'] = list_block(parts['positions'])
for k in parts:
    parts[k] = parts[k].replace('{{positionCount}}', '<span data-pos-count>3</span>')
    parts[k] = parts[k].replace('href="{{applyUrl}}"', 'data-link="apply_url" href="#"')
    assert '{{' not in parts[k], (k, re.findall(r'.{40}\{\{.{30}', parts[k])[:3])
    # images
    def img_sub(m):
        tag = m.group(0); s = re.search(r'src="\./assets/([^"]+)"', tag)
        if not s: return tag
        key = nxt(k, 'img'); IMG[key] = s.group(1)
        a = re.search(r'alt="([^"]*)"', tag)
        if a and a.group(1): ALT[key] = H.unescape(a.group(1))
        tag = tag.replace(s.group(0), 'data-img="%s" src=""' % key)
        return re.sub(r'\s+alt="[^"]*"', '', tag, count=1)
    parts[k] = re.sub(r'<img\b[^>]*>', img_sub, parts[k])
    # links
    def a_sub(m):
        tag = m.group(0); h = re.search(r'\shref="([^"]*)"', tag)
        if not h or h.group(1).startswith('#') or 'data-link=' in tag: return tag
        key = nxt(k, 'link'); LINKS[key] = H.unescape(h.group(1))
        return tag.replace(h.group(0), ' data-link="%s" href="#"' % key, 1)
    parts[k] = re.sub(r'<a\b[^>]*>', a_sub, parts[k])
LINKS = {'apply_url': 'https://docs.google.com/forms/d/e/1FAIpQLScO0S8gX86mgkHvvfQHZnrqStouttKET9ceHX84v4XjaEa3FQ/viewform', **LINKS}
order = [n for n, _ in sorted(idx, key=lambda t: t[1])]
full = '\n'.join('<div data-part="%s" style="display:contents">\n%s\n</div>' % (n, parts[n]) for n in order)
open(os.path.join(OUT, 'full_static.html'), 'w', encoding='utf-8').write(full)
json.dump({'IMG': IMG, 'ALT': ALT, 'LINKS': LINKS, 'root_style': root_style, 'order': order}, open(os.path.join(OUT, 'meta.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(full), len(IMG), len(LINKS), order)

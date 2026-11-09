import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Beyblade } from './Beyblade.tsx'

// パスワードを入れないと遊べない（このブラウザでは、一度入れると覚えておく）
// ※ブラウザの中だけの簡易的な鍵です。ページのコードを読めば分かるので、強い守りではありません。
const HASH = 'fffed5e5fc969833206caaf5db32587f471eaaac4e2565c8dfe3daacd3e45b17'
const KEY = 'bx_unlocked'
const sha256 = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map(b => b.toString(16).padStart(2, '0')).join('')
const wasUnlocked = () => { try { return localStorage.getItem(KEY) === HASH } catch { return false } }

function Gate() {
  const [ok, setOk] = useState(wasUnlocked)
  const [pw, setPw] = useState('')
  const [err, setErr] = useState(false)
  if (ok) return <Beyblade />
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    let good = false
    try { good = (await sha256('beyx:' + pw.trim())) === HASH } catch { good = false }
    if (good) { try { localStorage.setItem(KEY, HASH) } catch { /* 保存できなくても遊べる */ } setOk(true) }
    else { setErr(true); setPw('') }
  }
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#04071a', color: '#fff', fontFamily: 'sans-serif', padding: 16, boxSizing: 'border-box' }}>
      <form onSubmit={submit} style={{ width: 'min(340px, 100%)', display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 1 }}>BEYBLADE X BATTLE</div>
        <div style={{ fontSize: 14, opacity: 0.8 }}>パスワードを入れてください</div>
        <input type="password" inputMode="numeric" autoFocus value={pw} onChange={e => { setPw(e.target.value); setErr(false) }} placeholder="パスワード"
          style={{ fontSize: 20, padding: '12px 14px', borderRadius: 10, border: err ? '2px solid #ef4444' : '2px solid #38b6ff', background: '#0b1230', color: '#fff', textAlign: 'center', outline: 'none' }} />
        {err && <div style={{ color: '#ef4444', fontSize: 13 }}>パスワードがちがいます</div>}
        <button type="submit" style={{ fontSize: 18, fontWeight: 800, padding: '12px 14px', borderRadius: 10, border: 'none', background: '#38b6ff', color: '#04071a', cursor: 'pointer' }}>入る</button>
      </form>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Gate />
  </StrictMode>,
)

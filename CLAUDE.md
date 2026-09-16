# MINI 4WD SPEED BATTLE — Claude Code 引き継ぎドキュメント

> このファイルは Claude Code が自動読み込みする `CLAUDE.md` です。
> プロジェクトを開いたら **まずこのファイルを読んでください。**

---

## プロジェクト概要

ブラウザで遊べるミニ四駆レーシングゲーム。
**「ミニ四駆 超速グランプリ（超速GP）」**のようなゲームを目指して開発中。

- **技術スタック**: Vite + React 19 + TypeScript
- **場所**: `C:\Users\yahma\.gemini\antigravity\scratch\mini4wd-game`
- **起動**: `npm run dev` → http://localhost:5173

---

## 現在の実装状況（完成済み）

### 画面構成
1. **ガレージ画面** (`src/Garage.tsx`)
   - 左パネル: マシンステータス（スピード/パワー/コーナー/スタミナ/重さ）をゲージバー付きで表示
   - 中央: 選択中マシンの写真プレビュー（浮遊アニメーション付き）
   - 右パネル: タブ式のパーツ選択UI（カード形式）
   - 中央下: レース開始ボタン（立体的・押し込み演出付き）

2. **レース画面** (`src/Race.tsx`)
   - カウントダウン演出 (3→2→1→GO!)
   - SVGで描いたオーバル型サーキット（アスファルト、白線、赤白バリア、スタート/ゴールライン）
   - `requestAnimationFrame` による走行アニメーション
   - HUD: ラップ数・タイム・ベストラップ表示
   - コースアウト判定（コーナーで速度と安定性を比較）
   - 3周でゴール → タイム表示

### UIデザインシステム
- **コンセプト**: 「ミニ四駆 × 本格レーシングゲーム × アーケードゲーム」
- **カラー**: ネイビー基調 (`#04071a`)、アクセントは青 (`#5aabff`)・金 (`#ffd740`)・赤 (`#ef4444`)
- **フォント**: Rajdhani（英数字）+ Noto Sans JP（日本語）
- **グローバルスタイル**: `src/index.css` にデザイントークン・keyframes を集約

---

## ファイル構成

```
src/
├── App.tsx          # ルーティング（garage/race切り替え）+ ステータス計算
├── Garage.tsx       # ガレージ画面（パーツ選択・マシンプレビュー）
├── Race.tsx         # レース画面（走行シミュレーション・HUD）
├── types.ts         # 型定義（PartType, PartStats, MachineSetting, Part）
├── data.ts          # パーツデータ一覧
├── CarModel.tsx     # ※現在未使用（旧3Dモデル用、削除可）
└── index.css        # グローバルデザインシステム

public/
├── magnum.jpg       # マグナムセイバー写真（ユーザー提供）
├── sonic.jpg        # ソニックセイバー写真（ユーザー提供）
└── tridagger.jpg    # トライダガーX写真（ユーザー提供）
```

---

## ゲームロジックの仕様

### パーツ・ステータス計算 (`App.tsx`)
- `MachineSetting`: 各スロット（body/chassis/motor/gear/tire_front/tire_rear/roller_front/roller_rear/frp/mass_damper）に装備パーツIDを保持
- `totalStats`: 全装備パーツの `PartStats` を合算したもの
- `frp`, `mass_damper` スロットは `null`（未装備）が選択可能

### 走行シミュレーション (`Race.tsx`)
```ts
// 最高速度
maxSpeed = totalStats.speed * 0.01

// 加速度
acceleration = (totalStats.power / totalStats.weight) * 0.005

// コースアウト判定（コーナー区間のみ）
isCorner = Math.abs(Math.cos(t)) > 0.8  // 楕円の端付近
stabilityLimit = (totalStats.cornering / 100) * 0.8 + 0.3
if (speed > stabilityLimit) → コースアウト
```

### 楕円コース
```ts
// コース中心・サイズ（ウィンドウに適応）
cx = window.innerWidth / 2
cy = window.innerHeight / 2
rx = Math.min(vw * 0.35, 320)  // 横半径
ry = Math.min(vh * 0.28, 160)  // 縦半径

// progress: 0 〜 2π で1周
x = cx + rx * Math.cos(progress)
y = cy + ry * Math.sin(progress)
```

---

## パーツデータ一覧 (`data.ts`)

| ID | 名前 | タイプ |
|---|---|---|
| b_magnum | マグナムセイバー | body |
| b_sonic | ソニックセイバー | body |
| b_tridagger | トライダガーX | body |
| c_super1 | スーパー1シャーシ | chassis |
| c_tz | スーパーTZシャーシ | chassis |
| c_ar | ARシャーシ | chassis |
| m_normal | ノーマルモーター | motor |
| m_rev | レブチューンモーター | motor |
| m_torque | トルクチューンモーター | motor |
| m_hyper | ハイパーダッシュ | motor |
| g_std | 標準ギヤ (4:1) | gear |
| g_super | 超速ギヤ (3.5:1) | gear |
| tf_slick / tf_sponge | フロントタイヤ | tire_front |
| tr_slick / tr_sponge | リアタイヤ | tire_rear |
| rf_plastic / rf_alum | フロントローラー | roller_front |
| rr_plastic / rr_alum | リアローラー | roller_rear |
| frp_front | FRP強化マウント | frp |
| md_std | マスダンパー | mass_damper |

---

## 残タスク（今後やること）

### Phase 3: 立体コースと物理演算（最優先）
- [ ] 重力・ジャンプの物理シミュレーション（現在は楕円の平面走行のみ）
- [ ] コースアウトした場合の演出強化（マシンが飛んでいく等）
- [ ] ジャンプ台・レーンチェンジ・立体交差コースの追加

### グラフィック改善
- [ ] マシン写真の背景除去（現在は白背景の写真がそのまま表示）
  → 透過PNGへの差し替えが理想
- [ ] より本格的なコース背景（観客席、照明タワー等）

### ゲームシステム拡張
- [ ] 複数コース選択機能
- [ ] 対戦AIの追加
- [ ] ガレージでのパーツ購入・解放システム
- [ ] レース結果の保存・ランキング

### 技術的課題
- `CarModel.tsx` は現在未使用なので削除 or 3Dモデル対応に活用
- `npm install` 時は `--legacy-peer-deps` が必要（React 19 と @react-three/fiber のバージョン競合のため）

---

## 既知の問題

1. **マシン写真の背景**: `public/` に置いた写真は白背景のまま。コース上に配置すると浮いて見える。透過PNGを用意するか、CSS `mix-blend-mode: multiply` などで対応を検討。
2. **コース外観**: SVGで描いた楕円コースが中央に固定されているため、画面サイズによってはバランスが崩れることがある。
3. **ベストラップ計測のバグ**: `bestLap` の計算に `time` state のクロージャ問題があり、正確でない場合がある。`useRef` に移行する必要がある。

---

## 開発サーバーの起動方法

```powershell
# PowerShellの場合、実行ポリシーの設定が必要
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
cd C:\Users\yahma\.gemini\antigravity\scratch\mini4wd-game
npm run dev
```

---

## ユーザーの意向・コンテキスト

- 「ミニ四駆 超速グランプリ（超速GP）」「シャイニングスコーピオン」「ミニ四駆GB」のようなゲームを目指している
- グラフィックのクオリティを重視している（過去に3D→2D→2.5Dと試行錯誤した経緯あり）
- **マシン写真（magnum.jpg / sonic.jpg / tridagger.jpg）はユーザーが実際に撮影・用意したもの。これを最大限活かして欲しい**
- コースの拡張（立体コース）は後回しでOK
- UIは参考画像（青・ネイビー基調のアーケードゲーム風）に沿って作られている

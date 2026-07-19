# Implementation Plan: VFD Font & Scroll Steps Settings

オーディオデッキ（VFDディスプレイ）に表示されるテキストのフォントおよびスクロールのアニメーション（滑らか ⇔ カクカク）を設定画面からカスタマイズできるようにします。

---

## Goal Description

VFD画面のテキスト表示をよりアナログ風にカスタマイズしたいという要望に基づき、以下の設定項目を追加します。
1. **フォント変更**: ピクセル風、液晶風に加え、レトロドット（DotGothic16）、未来デジタル（Orbitron）の4種類から選択可能にします。
2. **スクロールの流れ方**: スムーズなアニメーションと、古いディスプレイのような「カクカクとコマ送りで流れる（Retro Steps）」アニメーションを切り替え可能にします。

---

## Proposed Changes

### Frontend (React & TypeScript)

#### [MODIFY] [index.css](file:///c:/Users/ryo82/.gemini/antigravity/scratch/music-widget/src/index.css)
- Google Fonts から `DotGothic16` および `Orbitron` を追加インポートするように `@import` のURLを更新。

#### [MODIFY] [App.tsx](file:///c:/Users/ryo82/.gemini/antigravity/scratch/music-widget/src/App.tsx)
- 状態変数 `vfdFont` (値: `'pixel' | 'vfd' | 'dot' | 'digital'`) および `vfdScrollSteps` (値: `boolean`) を定義。
- EJECT詳細パネル内の「Visualizer Settings」画面を「Widget Settings」に拡張し、以下のコントロールを追加。
  - **VFD Font**: Pixel / VFD / Retro Dot / Digital を切り替えるラジオボタンまたは選択ボタン。
  - **VFD Scroll style**: Smooth / Retro Steps (カクつくスクロール) を切り替えるトグルボタン。
- VFDの曲名表示部（マーキー部分および非マーキー部分）に対し、選択されたフォント（`fontFamily`）をスタイルで適用。
- スクロールアニメーション時、`vfdScrollSteps` が有効な場合はインラインスタイルで `animation-timing-function: steps(30, end)` を適用し、無効な場合は `linear` を適用して切り替えを実現。

---

## Verification Plan

### Automated Tests
- Tauri 開発サーバーの起動確認: `npm run tauri dev`
- CSS / フォント読み込みエラーのチェック

### Manual Verification
1. `npm run tauri dev` でアプリを起動し、EJECTボタンで設定パネルを開く。
2. 設定パネルに追加された「VFD Display Settings」を確認。
3. **VFD Font の切り替え**:
   - `VFD` を選択した時、フォントがスマートなデジタル液晶風（Share Tech Mono）になること。
   - `Retro Dot` を選択した時、日本語を含めてレトロゲーム風の懐かしいドット文字（DotGothic16）になること。
   - `Digital` を選択した時、未来的なデジタルフォント（Orbitron）になること。
4. **VFD Scroll style の切り替え**:
   - `Smooth` 時、曲名テキストが一定速度で滑らかに流れること。
   - `Retro Steps` 時、曲名テキストが「カクカク」とステップ移動（コマ送り）しながら流れること。

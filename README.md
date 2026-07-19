# Retro-Modern Music Widget (Kenwood DPX-440 Edition)

Tauri v2 + React + TypeScript + Rust で構築された、デスクトップ用のレトロ・モダンハイブリッド音楽ウィジェットです。  
Windowsのシステムメディア再生（SMTC）と連動し、実際にPCで流れている音楽のタイトルやアーティスト情報を取得・表示します。さらに、PCのオーディオ出力（WASAPIループバック）をキャプチャし、リアルタイムに周波数スペクトルを解析してVFD画面にヴィジュアライザとして描画します。

---

## 🌟 主な特徴

### 1. レトロな 2DIN カーオーディオ風フェイスプレート (Kenwood DPX-440 風)
- **VFDピクセルディスプレイ**:
  - 曲名のスクロール（マーキー表示）に対応。長いタイトルでもレイアウトが崩れません。
  - アーティスト名、アルバム名、ジャンル名、現在のボリュームなどのメタデータをサイクル表示。
  - **リアルタイム16バンド・スペクトルアナライザ**をVFDのデジタルドットとして描画。
- **実用的なオーディオ＆メディア操作**:
  - ボリューム：VFD画面上でスクロール（マウスホイール）するか、サイドの `VOL ▲/▼` ボタンで **Windowsシステム音量を直接コントロール**。
  - 再生コントロール：`PLAY/PAUSE`、`SEEK ◀◀/▶▶` ボタンでPCの再生・一時停止・曲送りを同期。
  - `SRC` (Source) ボタンおよび電源ボタン（`⏻`）も実動作に対応（アプリ終了など）。
- **テーマカラー & プリセット切り替え**:
  - `FM+` ボタンまたは `2 SCN` ボタンで液晶カラーをシームレスに変更可能（ブルー、シアン、グリーン、オレンジ）。
  - 各プリセットキーに機能を割り当て：
    - `1 TIME`: 曲名スクロール（スクロールループ ⇔ 16文字制限スタティック表示）のトグル切り替え。
    - `3 RDM`: `LOUD` (重低音強調インジケータ) のトグル。
    - `4 REF`: EQプリセット表示の切り替え（FLAT, ROCK, POP, JAZZ, VOCAL）。
    - `5 D.SCRN`: アナライザの描画スタイル（BARS, PEAK, WAVE）の切り替え。
    - `6 M.RDM`: ミュートトグル。

### 2. モダンなポップアップ液晶（EJECT展開）
- `EJECT` ボタンを押すと、2DINフェイスプレートの背後からスライドアップするモダンな情報パネルが展開。
- グラスモフィズム（すりガラス効果）をふんだんに取り入れた流麗なデザイン。
- アートワーク（アルバムジャケット）、曲情報の詳細、32バンドの滑らかなウェーブヴィジュアライザを搭載。
- **Google Searchとの連携**: 「Search on Google」ボタンから瞬時に現在再生中の曲をブラウザで検索できます。

---

## 🛠️ 技術スタック

- **Frontend**:
  - React 19 / TypeScript / Vite
  - Tailwind CSS v4 (モダンなスタイルシステム)
  - Framer Motion (スムーズな物理ベースの開閉・フェードアニメーション)
- **Backend (Tauri v2 & Rust)**:
  - `cpal` + `rustfft`: WASAPI ループバック経由でのWindowsシステム音声音響キャプチャ＆FFT周波数解析。
  - Windows API (`windows` crate): システムマスターボリューム、SMTC（System Media Transport Controls）からのメタデータ・カバーアートの取得。

---

## 🚀 セットアップと開発手順

### 前提条件
- **Windows OS** (オーディオキャプチャ、音量変更、SMTC連携はWindows専用機能となります)
- **Node.js** (v20以上推奨)
- **Rust** (最新の stable ツールチェーン)

### 開発用サーバーの起動
1. リポジトリをクローンします。
   ```bash
   git clone <repository-url>
   cd music-widget
   ```
2. 依存関係をインストールします。
   ```bash
   npm install
   ```
3. 開発モードでアプリを起動します（ホットリロード有効）。
   ```bash
   npm run tauri dev
   ```

### プロダクションビルド（実行ファイルの作成）
スタンドアロンの軽量な実行ファイルをビルドします。
```bash
npm run tauri build
```
ビルドが完了すると、以下のパスに `.exe` インストーラおよび実行ファイルが生成されます：
`src-tauri/target/release/music-widget.exe` またはパッケージフォルダ

---

## 📄 ライセンス

This project is licensed under the MIT License - see the LICENSE file for details.

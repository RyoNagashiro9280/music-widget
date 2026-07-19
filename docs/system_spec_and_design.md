# Retro-Modern Music Widget (Kenwood DPX-440 Edition) 仕様・設計書

本書は、Tauri v2 + React + Rust で構築されたデスクトップ向け音楽ウィジェット「Retro-Modern Music Widget」のシステム仕様書および設計書です。

---

## 1. システム概要
Windowsのシステムメディア再生（SMTC: System Media Transport Controls）と連動し、実際にPCで流れている音楽のタイトルやアーティスト情報を取得・表示します。さらに、PCのオーディオ出力（WASAPIループバック）をキャプチャし、リアルタイムに周波数スペクトルを解析してVFD（真空蛍光ディスプレイ）画面にビジュアライザとして描画するデスクトップ向けデスクトップウィジェットアプリケーションです。

名機である2DINカーオーディオ「Kenwood DPX-440」のフェイスプレートデザインをオマージュしたレトロなデザインと、EJECTボタンにより展開されるすりガラス調（グラスモフィズム）のモダンなUI表示を組み合わせたハイブリッドデザインを特徴としています。

### 動作対象OS
- **Windows 10/11** (オーディオキャプチャ、音量変更、SMTC連携にWindows依存のAPIを使用するため、Windows専用となります)

---

## 2. 技術スタック・使用ライブラリ

### 2.1. フロントエンド (Frontend)
- **コアフレームワーク**: React 19.1.0
- **言語**: TypeScript (TypeScript 5.8)
- **ビルドツール**: Vite 7.0
- **スタイリング**: Tailwind CSS v4.3.3
- **アニメーション**: Framer Motion 12.4.2
- **アイコン**: Lucide React 1.25.0

### 2.2. バックエンド (Backend / Tauri & Rust)
- **アプリケーションフレームワーク**: Tauri v2.0.0
- **言語**: Rust (edition 2021)
- **主要ライブラリ (Crates)**:
  - `windows` (0.62.2): Windows Runtime APIの操作（SMTC情報の取得、システム音量制御など）
  - `cpal` (0.15): 音声入出力デバイスの管理、WASAPIループバックによる音声キャプチャ
  - `rustfft` (6.2): 高速フーリエ変換（FFT）による音声波形の周波数スペクトル解析
  - `serde` / `serde_json`: データのシリアライズ・デシリアライズ
  - `tokio`: 非同期ランタイム、タイムアウト処理
  - `base64`: アルバムアート画像（バイナリ）のBase64エンコード

---

## 3. 機能仕様

| 機能カテゴリ | 機能概要 | 詳細動作 |
| :--- | :--- | :--- |
| **VFDディスプレイ表示** | 曲名スクロール（マーキー表示） | 20文字を超える長い曲名の場合は自動で左にスクロール。16文字制限スタティック表示への切り替えも可能。 |
| | メタデータローテーション | 3秒間隔で、アーティスト名、アルバム名、ジャンル名などを画面下部に自動で切り替えて表示。 |
| | リアルタイム16バンドスペアナ | WASAPI経由で取得した音声をFFT解析し、16バンドのスペクトラムをVFDディスプレイ下部にシンメトリー描画。表示スタイル（BARS, PEAK, WAVE）を変更可能。 |
| | テーマカラー切り替え | ディスプレイの発光色を「ブルー、シアン、グリーン、オレンジ」から選択可能。 |
| **メディア制御** | 曲戻し/曲送り/再生/一時停止 | フェイスプレート上の物理ボタンと同期し、Windows上のメディアプレイヤー（Spotify, Webブラウザ等）に操作命令を送出。 |
| **音量制御** | システム音量の変更 | `VOL ▲/▼`ボタン、またはVFD画面上でのマウスホイールスクロールにより、Windowsのシステム音量を変更。VFD上に音量インジケータ（0〜35）を表示。 |
| | ミュート (ATT) | 音量を瞬時に消音するトグル機能。 |
| **EJECTポップアップ** | 情報パネル展開 | `EJECT`ボタン手前に、2DINプレートの奥からスライドアップするモダンなグラスモフィズム画面を表示。 |
| | 詳細メタデータ / アートワーク | 高解像度のカバーアート、曲名、アーティスト、アルバム名、リリース年、ジャンル等を表示。 |
| | 32バンドビジュアライザ | 滑らかに動く32バンドのスペクトラムアナライザを表示。 |
| | Google 検索連携 | 現在再生中の「曲名 + アーティスト」をGoogleで即座にブラウザ検索するボタンを提供。 |

---

## 4. システムアーキテクチャ & 設計

本アプリは、TauriのIPC（Inter-Process Communication）をベースとしたフロントエンドとバックエンドの非同期通信モデルを採用しています。

```mermaid
graph TD
    subgraph Frontend (React / TypeScript)
        App[App.tsx / UI & state]
        API[api.ts / External Web APIs]
    end

    subgraph Backend (Tauri / Rust)
        Lib[lib.rs / Launcher]
        Audio[audio.rs / WASAPI & FFT]
        SMTC[smtc.rs / Windows Media]
        Volume[volume.rs / Core Audio]
    end

    App -- "invoke()" --> SMTC
    App -- "invoke()" --> Volume
    Audio -- "emit('audio-spectrum')" --> App
    API -- "fetch" --> Spotify[Spotify API]
    API -- "fetch" --> iTunes[iTunes API]
    API -- "fetch" --> MusicBrainz[MusicBrainz API]
```

### 4.1. フロントエンド設計

#### 1. エントリーポイント & メインレイアウト ([main.tsx](file:///c:/Users/ryo82/.gemini/antigravity/scratch/music-widget/src/main.tsx) / [App.tsx](file:///c:/Users/ryo82/.gemini/antigravity/scratch/music-widget/src/App.tsx))
- [App.tsx](file:///c:/Users/ryo82/.gemini/antigravity/scratch/music-widget/src/App.tsx) コンポーネントがアプリケーション全体の単一状態（UIモード、テーマカラー、音量、再生曲情報、スペクトルデータ等）を管理しています。
- アプリ起動時に、Tauriコマンドを通じて初期のシステム音量とSMTCメディア情報を取得し、1秒周期 of ポーリングによってSMTCメディア情報の更新を検知します。
- `listen("audio-spectrum", ...)` により、バックエンドから60FPSでブロードキャストされるスペクトル情報を受け取り、ビジュアライザの状態（`bands16`, `bands32`）を更新します。

#### 2. 外部 Web API 連携レイヤー ([api.ts](file:///c:/Users/ryo82/.gemini/antigravity/scratch/music-widget/src/api.ts))
WindowsのSMTCから取得できない詳細な音楽メタデータ（アルバムアート、リリース年、ジャンル、正式なアルバム名）を補完するため、フロントエンドから3つのWeb APIを検索・連携します。
- **iTunes Search API**: 楽曲名とアーティストで検索し、高解像度のアートワーク画像URL、アルバム名、ジャンル名、リリース年を取得。
- **Spotify Web API**: クライアント資格情報フロー（Client Credentials Flow）を用いてアクセストークンを自動管理。Spotifyでの楽曲URL、アルバムアート、リリース年を取得。
- **MusicBrainz API**: iTunesやSpotifyで補完できない情報をカバーするため、最古のリリース年やジャンル情報を取得（User-Agentヘッダの設定を義務付け）。

### 4.2. バックエンド設計 (Rust)

#### 1. アプリケーションセットアップ ([lib.rs](file:///c:/Users/ryo82/.gemini/antigravity/scratch/music-widget/src-tauri/src/lib.rs) / [main.rs](file:///c:/Users/ryo82/.gemini/antigravity/scratch/music-widget/src-tauri/src/main.rs))
- Tauriビルダーの `setup` ライフサイクルで、オーディオキャプチャ処理を開始するスレッド `audio::start_audio_capture` を起動します。
- フロントエンドに公開する Tauri Command (`invoke` ハンドラ) を登録します。

#### 2. 音声キャプチャ & 周波数解析 ([audio.rs](file:///c:/Users/ryo82/.gemini/antigravity/scratch/music-widget/src-tauri/src/audio.rs))
- `cpal` を用いて、Windowsのデフォルト出力デバイスの音声ストリームをループバックモードでキャプチャします。
- サンプリングバッファからモノラル波形データを抽出し、サイズ 2048 の配列に保持します。
- ハニング窓（Hanning Window）を適用してスペクトルリークを防いだ上で、`rustfft` を用いて高速フーリエ変換（FFT）を実行します。
- 得られた周波数成分の振幅（マグニチュード）を算出し、対数スケールに基づいて **32バンド** と **16バンド** の対数対周波数ビンに割り当てます。
- 各周波数ビンにおいて、ローパスフィルタ（平滑化係数 `0.6`）を適用し、急激な動きを抑えたスムーズなビジュアライザ表示を実現します。
- 毎秒 60 回の頻度で `audio-spectrum` イベントをフロントエンドにブロードキャストします。

#### 3. Windows SMTC メディア連携 ([smtc.rs](file:///c:/Users/ryo82/.gemini/antigravity/scratch/music-widget/src-tauri/src/smtc.rs))
- Windows 10/11 の `GlobalSystemMediaTransportControlsSessionManager` を利用して、現在再生中の音楽セッションを取得します。
- セッションから「曲名」「アーティスト名」「ソースアプリのID」を取得。
- アルバムのアートワークサムネイル画像は Windows Runtime の `Storage::Streams` からバイナリデータをストリーミング抽出し、Base64エンコードしたデータスキーム（`data:image/jpeg;base64,...`）に変換してフロントエンドに引き渡します。
- メディアの再生、一時停止、スキップ処理は非同期API経由で制御し、OSハング対策として `500ms` のタイムアウト制御を実装しています。

#### 4. システム音量制御 ([volume.rs](file:///c:/Users/ryo82/.gemini/antigravity/scratch/music-widget/src-tauri/src/volume.rs))
- Windows Core Audio API（`IMMDeviceEnumerator`、`IAudioEndpointVolume`）を使用。
- COMライブラリの初期化 (`CoInitializeEx`) を行ったうえで、既定のオーディオ出力デバイスを活性化させます。
- `GetMasterVolumeLevelScalar` / `SetMasterVolumeLevelScalar` を呼び出し、Windowsのマスター音量レベルを `0.0` 〜 `1.0` の範囲で双方向に操作します。

---

## 5. データフロー設計

### 5.1. メディア情報取得フロー
1. フロントエンドが1秒間隔でバックエンドの `get_current_media_info` を呼び出す。
2. バックエンドは Windows SMTC から曲情報とアートワークサムネイルを取得。アートワークはBase64でシリアライズして返す。
3. フロントエンドは受け取ったメタデータ（曲名、アーティスト名、ソースアプリ）をもとに、`api.ts` を用いて外部Web API（iTunes ➔ Spotify ➔ MusicBrainz）を順番に検索。
4. より高解像度なアルバムアートや、追加情報（ジャンル、アルバム名、リリース年）があればフロントエンドの状態（State）にマージし、UIを更新する。

### 5.2. ビジュアライザ描画フロー
1. バックエンドの `audio::start_audio_capture` スレッドが Windows 音声出力をループバックキャプチャ。
2. キャプチャした波形（2048サンプル）に窓関数を適用し、FFTを実行。
3. 結果を 16バンド / 32バンド にそれぞれマージし、前フレーム of データと平滑化した結果を `AudioSpectrum` 構造体に格納。
4. `app_handle.emit("audio-spectrum", ...)` により 60FPS で送信。
5. フロントエンドの `listen` コールバックがデータを受け取り、Reactの状態を更新。
6. VFD（16バンド）およびモダンポップアップ（32バンド）の描画ロジックが走り、CSSアニメーション/描画コンポーネントがリアルタイムに変形する。

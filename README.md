# Image Extractor

Webページ内の画像を抽出し、別タブの一覧でまとめて確認するChrome拡張です。画像のサイズや拡張子を確認し、拡大・原寸表示で閲覧できます。Manifest V3に対応しています。

バージョン1.0は2026-10-24にChrome Web Storeへ審査申請済みです。現在は審査結果待ちで、ストア公開はまだ確認していません。進捗は [TODO](docs/TODO.md) を参照してください。

## 主な機能

- `<img>` の画像URLを抽出。`srcset` がある場合は幅・倍率の大きい候補を選択
- 要素と疑似要素（`::before` / `::after`）のCSS `background-image` を抽出
- 相対URLの絶対化と、同一URLの重複除外
- サムネイルの一覧表示と、画像の自然サイズ・URLから判定した拡張子の表示
- 最小幅・最小高さ、SVG / GIFの非表示フィルター
- 表示中・読み込み中・失敗・フィルター非表示の件数表示
- 画像クリックによる拡大表示、大きな画像の原寸表示とドラッグ移動
- 左右ボタン・左右キーでの画像移動、Escapeで拡大表示を終了
- 透過画像を見やすくする市松模様の背景
- 日本語・英語の切り替えと、言語設定の保存
- Viewerごとの画像データの分離。複製したViewer間では同じ一覧を保持
- 抽出・保存・画像読み込みの失敗に対する案内

## 使い方

1. 画像を確認したいWebページを開きます。
2. 拡張アイコンを押します。その時点のページから画像を抽出し、新しいタブに一覧を開きます。
3. 必要に応じてフィルターを変更します。最小サイズは入力後に「適用」を押します。
4. 画像カードをクリックして拡大表示します。

最小サイズの初期値は、幅・高さともに400pxです。小さい画像も表示する場合は両方を0にして「適用」を押してください。「クリア」は入力欄を0に戻す操作で、条件の反映には「適用」が必要です。SVG / GIFのチェックは変更時に反映されます。

拡大表示中の操作は以下のとおりです。

| 操作 | 動作 |
| --- | --- |
| 左右ボタン / 左右キー | フィルター後の一覧に沿って前後の画像へ移動 |
| 画像クリック / 右下のボタン | 画面に合わせた表示と原寸表示を切り替え。画面より大きい画像が対象 |
| 原寸表示中のドラッグ | 画像を上下左右に移動 |
| Escape / 閉じるボタン / 背景クリック | 一覧に戻る |

## 対応範囲と制限

- 抽出はアイコンを押した時点のDOMが対象です。スクロールなどで後から追加された画像を自動収集する機能は未実装です。元ページで画像を読み込ませた後、再度アイコンを押すと新しい一覧を開きます。
- `<meta property="og:image">`、`<video poster>`、CSS `content: url()` の抽出は未実装です。
- canvasの描画内容、Shadow DOM内部の画像、通信上だけに現れる画像URLは抽出対象外です。
- URLが完全一致した画像を重複除外します。クエリが異なるURLや、別URLで配信される同じ画像は別件として扱います。
- 一覧に保存する画像URLは最大1500件です。超過時は先頭1500件を表示し、通知を出します。
- 拡張子はURLのファイル名から判定します。拡張子のないURLや `blob:` / `data:` URLは「—」と表示し、実際の画像形式は判別しません。SVG / GIFフィルターもURLの拡張子を基準にします。
- `blob:` / `data:` URLの表示可否は元ページやURLの状態に依存します。対応範囲の検証は今後の候補です。
- 読み込みに失敗した画像は一覧から除外します。配信元の制限などにより、元ページで表示できる画像をViewerで表示できない場合があります。
- `chrome://` など、Chromeがスクリプトの注入を許可しないページでは抽出できません。
- ZIPダウンロード、ソート、画像の再試行は未実装です。

今後の機能候補と公開準備の進捗は [docs/TODO.md](docs/TODO.md) を参照してください。

## 権限と保存データ

要求する権限は次の3つです。全サイトへの継続的なアクセス権限は要求しません。

| 権限 | 用途 |
| --- | --- |
| `activeTab` | アイコンを押した元タブへの一時的なアクセス |
| `scripting` | 元ページで画像抽出処理を実行 |
| `storage` | 画像一覧・Viewerの参照情報・言語設定を保存 |

画像URLは `chrome.storage.session` にViewerのセッションごとに保存します。同じViewerを複製した場合、最後のタブを閉じるまで一覧を保持します。ブラウザー終了時にもsessionデータは消えます。言語設定は `chrome.storage.local` に保存します。

session保存に失敗した場合は、メッセージで一覧を一時的に渡します。この場合は通知を表示し、Viewerの再読み込みで一覧が消えることがあります。

## 開発とビルド

### 準備

- Node.js 24.15.0以上の24系を推奨。22系の場合は22.22.2以上が必要です（現在のテスト用依存パッケージの要件）。
- npm

依存パッケージをインストールします。

```sh
npm ci
```

### ビルド

```sh
npm run build
```

esbuildでbackground・content scriptをビルドした後、ViteでViewerをビルドします。`manifest.json`、Chrome用言語辞書、16・24・32・48・128pxのアイコンも `dist/` にコピーします。アイコンの元画像と未採用案は配布ビルドに含めません。

| コマンド | 内容 |
| --- | --- |
| `npm run build` | 拡張全体の配布ビルド |
| `npm run build:esbuild` | background・content scriptと付随ファイルのビルド |
| `npm run build:vite` | Viewerのビルド |
| `npm run dev` | Viewer用のVite開発サーバー |

`npm run dev` だけでは拡張全体のビルドは更新されません。Chrome APIを使う動作は、`npm run build` 後に拡張として読み込んで確認します。

### Chromeへの読み込み

1. `npm run build` で `dist/` を生成します。
2. Chromeで `chrome://extensions` を開き、デベロッパーモードを有効にします。
3. 「パッケージ化されていない拡張機能を読み込む」を押し、`dist/` を選択します。
4. 必要に応じて拡張アイコンをツールバーにピン留めします。

変更後は再ビルドし、拡張管理画面で再読み込みしてください。元ページも再読み込みすると、新しい抽出スクリプトで確認できます。

配布ZIPは、`dist/` の中身をまとめ、ZIPの直下に `manifest.json` がある構成にします。

## テスト

```sh
npm test
```

Node.jsのテストランナーで、セッション管理・Viewer操作・フィルター・異常系を検証します。実際のTypeScriptをビルドして実行し、ViewerのDOM操作にはjsdomを使用します。Chrome APIや画像読み込みは模擬しています。

対象別に実行することもできます。

```sh
npm run test:session
npm run test:viewer
npm run test:filter
npm run test:failure
```

Chrome自身の権限判定や描画などは別途確認します。対象範囲、実機確認手順、権限削減後とService Worker再起動の確認記録は [docs/TESTING.md](docs/TESTING.md) を参照してください。

## プロジェクト構成

```text
manifest.json
package.json / package-lock.json
vite.config.mjs
build/
  esbuild.config.js
assets/icons/               アイコン元画像と各サイズのPNG
_locales/en/・ja/            Chromeに表示する拡張名・説明
src/
  background/background.ts  Viewer起動・画像セッション管理
  content/content.ts        元ページからの画像抽出
  content/extractors/        srcset・CSS背景画像の抽出
  shared/                   URL正規化・セッションキー・件数上限
  i18n/                     Viewerの日本語・英語辞書
  viewer/                   ViewerのHTML・CSS・TypeScript・画像素材
test/                       自動テストと確認用ページ
  helpers/                  Chrome API・Viewerのテスト環境
docs/                       仕様・TODO・テスト記録
dist/                       Chromeに読み込むビルド成果物
```

`node_modules/`、`dist/`、`.vite/` はGit管理の対象外です。

## 関連ドキュメント

- [公開準備・今後の機能候補](docs/TODO.md)
- [テスト手順と確認記録](docs/TESTING.md)
- [Viewer仕様](docs/VIEWER_SPEC.md)
- [全体仕様](docs/SPECIFICATION.md)
- [プライバシーポリシー](docs/PRIVACY.md) / [English](docs/PRIVACY.en.md)

## お問い合わせ・不具合報告

お問い合わせ・不具合報告は、プロジェクトの [GitHub Issues](https://github.com/n-i-practice/chrome-extension-image-extractor/issues) へお願いします。データの取扱いに関するお問い合わせも、同じ窓口で受け付けます。

投稿にはGitHubアカウントが必要です。投稿内容は公開されるため、個人情報・認証情報・非公開ページのURLや画像を含めないでください。不具合報告には、Chromeと拡張のバージョン、再現手順、期待した動作と実際の動作を、公開できる範囲で記載してください。

## 開発への支援

機能は無料で利用できます。任意で開発を支援したい方は [Ko-fi](https://ko-fi.com/F8U228LZP5) から支援できます。Viewer右上にも公式画像ボタンを設置しています。

## ライセンス

Copyright (c) 2026 n-i-practice. All rights reserved.

本プロジェクトの独自コード・ドキュメント・独自素材には、オープンソースライセンスを付与していません。リポジトリを公開する場合も、実装の閲覧・紹介を目的とし、権利者の書面による許可なく、他プロジェクトへの流用・改変・再配布・販売を認めるものではありません。法令上認められる行為と、GitHubの利用規約に基づく公開リポジトリの閲覧・フォークは、この制限の対象外です。

作者が提供する公式のChrome拡張は、無料でインストール・利用できます。この利用許可には、ソースコードの再利用や改変版の配布は含みません。

依存ライブラリやKo-fi公式ボタン画像などの第三者のソフトウェア・素材には、それぞれのライセンス・利用条件が適用されます。本表記はこの版に適用し、過去の版について有効に付与された許諾を取り消すものではありません。

詳細は [LICENSE](LICENSE) を参照してください。`package.json` の `UNLICENSED` は権利を留保する表記であり、自由利用を認めるUnlicenseとは異なります。

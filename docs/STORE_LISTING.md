# Image Extractor ストア説明文案

初回公開用の日英の掲載文。現行の一覧・フィルター・拡大表示を紹介する。素材構成は [STORE_ASSETS.md](STORE_ASSETS.md) を参照。2026-10-24に日英の掲載情報を登録・最終確認し、同日にユーザーがバージョン1.0の審査申請を完了。現在は審査結果待ちで、公開完了は未確認。

## 共通の掲載情報

- 名前：Image Extractor
- サポートURL：https://github.com/n-i-practice/chrome-extension-image-extractor/issues
- プライバシーポリシーURL（日本語）：https://github.com/n-i-practice/chrome-extension-image-extractor/blob/main/docs/PRIVACY.md
- プライバシーポリシーURL（英語）：https://github.com/n-i-practice/chrome-extension-image-extractor/blob/main/docs/PRIVACY.en.md

## 日本語

### 短い説明

Webページの画像を別タブに一覧表示。サイズで絞り込み、SVG・GIFを非表示にして、拡大・原寸表示で確認できます。

### 詳細説明

Image Extractorは、開いているWebページの画像を別タブにまとめて表示するChrome拡張です。サムネイルで全体を見渡し、気になる画像を拡大して確認できます。

主な機能

・ページ内の画像要素とCSS背景画像から画像URLを抽出
・同一URLの重複を除いてサムネイルを一覧表示
・画像の幅・高さと、URLから判定した拡張子を表示
・最小幅・最小高さ、SVG・GIFの非表示で絞り込み
・画面に合わせた拡大表示と、大きな画像の原寸表示
・原寸表示中のドラッグ移動、左右キーでの画像切り替え
・日本語・英語の表示切り替え

使い方

1. 画像を確認したいWebページを開きます。
2. 拡張アイコンを押すと、新しいタブに画像一覧が開きます。
3. 必要に応じて絞り込み、画像をクリックして拡大表示します。

最小サイズの初期値は幅・高さともに400pxです。小さい画像も表示する場合は、両方を0にして「適用」を押してください。大きな画像は拡大表示中に画像をクリックすると原寸表示に切り替えられます。左右キーで前後へ移動し、Escapeで一覧に戻れます。

対応範囲

抽出するのはアイコンを押した時点のページ内の画像です。スクロールなどで後から読み込まれた画像は、元ページで読み込ませてから再度アイコンを押してください。一覧の上限は1500件です。

配信元の制限などにより表示できない画像があります。Chromeの内部ページなどでは抽出できません。SVG・GIFの絞り込みはURLの拡張子を基準にします。画像の一括ダウンロード機能はありません。

canvasに描画された内容、Shadow DOM内部の画像、通信上だけに現れて画像要素やCSS背景画像から参照できない画像URLは、抽出対象外です。

データと利用料金

画像URLと一覧管理用の情報はブラウザー内のセッション用ストレージに一時保存し、同じ一覧の最後のViewerタブを閉じた際に削除処理を行います。削除の失敗や処理の中断などで残った一時データも、ブラウザーを終了して再起動すると消去されます。画像表示時は画像の配信元へ通信します。開発者のサーバーへ画像URLや利用状況を送信する機能はありません。

プライバシーポリシー：https://github.com/n-i-practice/chrome-extension-image-extractor/blob/main/docs/PRIVACY.md

機能は無料で利用できます。任意のKo-fi支援ボタンがありますが、支援の有無による機能制限はありません。

お問い合わせ・不具合報告

https://github.com/n-i-practice/chrome-extension-image-extractor/issues

投稿にはGitHubアカウントが必要です。投稿内容は公開されるため、個人情報・認証情報・非公開ページのURLや画像を含めないでください。

## English

### Short description

View page images in a new tab. Filter by size, hide SVG and GIF images, and inspect images in a larger view or at original size.

### Detailed description

Image Extractor is a Chrome extension that brings images from the page you are viewing into a separate viewer tab. Browse thumbnails, filter the list, and open an image for a closer look.

Features

• Extract image URLs from image elements and CSS background images
• Browse thumbnails with duplicate URLs removed
• See image dimensions and file extensions identified from URLs
• Filter by minimum width and height, or hide SVG and GIF images
• Fit images to the screen or view large images at their original size
• Drag to pan in original-size view and use the arrow keys to move between images
• Switch between English and Japanese

How to use

1. Open the web page whose images you want to inspect.
2. Click the extension icon to open the image list in a new tab.
3. Adjust the filters as needed, then click an image to open the larger view.

The default minimum width and height are both 400 pixels. To include smaller images, set both values to 0 and click Apply. For large images, click the image in the larger view to switch to its original size. Use the left and right arrow keys to move between images, and press Escape to return to the list.

Scope and limitations

Extraction uses the images present in the page when you click the icon. For images loaded later by scrolling, let the page load them and click the icon again. Each list supports up to 1,500 image URLs.

Some images may not display because of restrictions imposed by their host. Extraction is unavailable on Chrome internal pages and other restricted pages. SVG and GIF filters use the file extension in the URL. Bulk image downloading is not included.

Canvas drawings, images inside Shadow DOM, and image URLs that appear only in network traffic without being exposed through image elements or CSS background images are outside the scope of extraction.

Data and pricing

Image URLs and list management data are stored temporarily in the browser's session storage for the extension. The extension performs deletion when you close the last viewer tab for that list. If temporary data remains because deletion fails, processing is interrupted, or a similar issue occurs, it is cleared when the browser exits and restarts. Displaying images sends requests to their image hosts. The extension has no feature that sends image URLs or usage analytics to the developer's server.

Privacy policy: https://github.com/n-i-practice/chrome-extension-image-extractor/blob/main/docs/PRIVACY.en.md

All features are free to use. An optional Ko-fi support button is available, with no feature restrictions based on whether you contribute.

Support and bug reports

https://github.com/n-i-practice/chrome-extension-image-extractor/issues

A GitHub account is required to post. Issues are public, so please do not include personal information, credentials, or private page URLs or images.

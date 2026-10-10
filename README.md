# DOUBLE QR v0.4 PWA

ひとつのQRに、表と裏のメッセージ。

## ▶ [アプリを開く](https://double-qr-pwa.sunny-seed-0354.chatgpt.site)

インストール不要。リンクを開くとブラウザで使えます。ホーム画面への追加にも対応しています。

「作る」「読む」の2画面。ビルド済みの静的ファイルだけで動きます。処理用Pythonサーバー、データベース、外部CDNは不要です。鍵・本文・画像は端末内で処理します。最初の取得とアプリ更新には通信が必要です。

## スクリーンショット

<img src="docs/screenshots/generate.png" alt="DOUBLE QRの生成画面。表のURLと裏メッセージを入力し、自動検査を通過した二重QRを表示。" width="360">

実際の生成画面です。表に `https://masato-lab.pages.dev/`、裏に `SECRET` を入力した例です。

## スマートフォンで使う

HTTPSの公開先をSafari / Chromeで開きます。「オフラインで使えます」と表示されてからホーム画面に追加してください。iPhoneは共有メニュー、Androidはブラウザメニューの「アプリをインストール」または「ホーム画面に追加」を使います。表示名称は端末・ブラウザで異なります。

1. 表のURL、裏メッセージ、鍵を入力し「QRを作る」。
2. 検査を通過した画像を保存。普通のQRと二重QRは、普通のカメラでは同じ表のURLに進みます。これは正常な動作です。
3. 「読む」で同じ鍵を入力し、カメラまたは画像選択から裏を復元。強度は自動判定します。

鍵・メッセージは自動保存しません。画面を閉じると消えます。手動の実機記録だけをブラウザに保存します。保存したPNGやコピーした裏メッセージは保存先に残ります。

ブラウザがアプリのキャッシュを削除した場合、再度オンラインで開いてください。更新は「詳細・診断」→「ホーム画面に追加」→「更新を確認」。更新を適用すると入力が消えます。

## 技術資料

- https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
- https://github.com/Sec-ant/zxing-wasm
- https://github.com/cozmo/jsQR
- https://developers.cloudflare.com/pages/get-started/direct-upload/

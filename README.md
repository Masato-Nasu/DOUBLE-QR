# DOUBLE QR v0.4 PWA

ひとつのQRに、表と裏のメッセージ。

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

## GitHubから起動

リポジトリを取得したフォルダーで実行してください。ビルド済みのためnpmのインストールは不要です。

```bash
bash start.sh
```

ブラウザで http://127.0.0.1:8765 を開きます。

## Linux Mintで起動

ZIPをダウンロードしたディレクトリで実行：

```bash
unzip DOUBLE-QR-PWA.zip
cd double-qr-pwa
bash start.sh
```

ブラウザで http://127.0.0.1:8765 を開きます。終了は Ctrl+C。Python 3標準ライブラリの静的配信のみで、pipやnpmのインストールは不要です。必要な場合だけ `sudo apt install python3 unzip` を実行してください。

PCのlocalhostはスマートフォンから開けません。スマートフォンでPWAやカメラを使うときはHTTPSに配置してください。LANのHTTPアドレスではPWA・Web Crypto・カメラの制限にかかります。

## 配置

`dist/` の中身をHTTPSの静的ホスティングへ置くだけです。ルートでもサブディレクトリでも動く相対パス構成です。WASMは `application/wasm`、JSはJavaScriptのMIME型で配信してください。未存在ファイルにindex.htmlを返す設定は不要です。

Cloudflare Pagesを使う場合（Node.jsとCloudflareアカウントが必要）：

```bash
npx wrangler login
npx wrangler pages project create double-qr --production-branch main
npx wrangler pages deploy dist --project-name double-qr --branch main
```

プロジェクトが既にあれば作成コマンドは不要です。同名プロジェクトを使っている場合は名前を変更してください。こちらのCloudflareアカウントへの配置操作は未実施です。

## 構成と再ビルド

- `dist/`：そのまま配信できる完成アプリ。HTML、CSS、JS、manifest、Service Worker、アイコン、WASM。
- `src/`：QR互換処理、画像読み取り、測定、画面操作。
- `tests/`：旧版の実画像・行列との比較、キャッシュ、DOM操作の自動テスト。
- `dist/DOUBLE-QR-v0.4-diagnostic.zip`：元のPython診断版一式。OpenCV診断をそのまま残しています。
- `TEST-REPORT.md`：検証範囲と未検証事項。

編集後の再ビルドだけNode.jsが必要です（検証にはNode.js 22以降を推奨）：

```bash
npm ci
npm run build
npm test
```

ビルド時にWASMを同梱し、資材の内容からキャッシュ名を生成します。配信時はNode.js不要です。配布ZIPの `dist/` はビルド済みです。

## 互換性・診断結果の扱い

QR version 12 / H / mask 0、標準1重の位置・パケット・鍵処理は旧版互換。3重・5重もv0.4の配置と多数決方式を移植しています。12通りで旧版と全マス一致、旧版PNGからの読み取りを自動確認しました。全入力・全写真を保証する検証ではありません。

診断は「詳細・診断」へ折りたたみました。成功率、容量、統計的検出、実機記録、JSON / CSV保存、差分、強度調整を残しています。

PWAの表デコーダーはZXing WASM / jsQRです。Python版のOpenCV / ZXingとは別の測定です。合成画像の変形条件も異なるので、以前の数値とは直接比較できません。容量検証では表と裏の合格数を分け、「厳格合格」は表2種類と裏がすべて成功した場合だけとします。予算外は未測定です。最大成功長は今回の標本の結果であり、保証容量ではありません。

変更マス数・デコード成否は測定結果。RS訂正残量・形式上限は計算値。スマートフォン実機結果は手動記録として別扱いです。RS残量は撮影時の位置検出や追加誤りを保証しません。

誤り訂正を利用したQRステガノグラフィーには先行研究があります。新方式や検出不能とは主張しません。既知生成器による再生成差分で検出できます。旧版互換の暗号ストリームは同じ表・鍵で再使用されるため、機密保護用の暗号ではありません。比較文献は `dist/RESEARCH.md`。

## 技術資料

- https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
- https://github.com/Sec-ant/zxing-wasm
- https://github.com/cozmo/jsQR
- https://developers.cloudflare.com/pages/get-started/direct-upload/

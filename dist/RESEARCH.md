# DOUBLE QR v0.4 — 既存方式との比較

調査日：2026-10-10（日本時間）。本書は方式の位置付けを示すもので、新規性・特許性・安全性の証明ではありません。論文の手法を再実装して同条件で速度や成功率を比較したわけではありません。

| 方式 | 情報の載せ方 | DOUBLE QRとの関係 |
|---|---|---|
| Chiangほか（2013）、Blind QR code steganographic approach based upon error correction capability | QRモジュールへ秘密情報を埋め込み、誤り訂正を利用して表の読み取りを維持 | 基本的な着想は既存。DOUBLE QRにも直接該当する分類 |
| Tkachenkoほか（2016）、Two-Level QR Code for Private Message Sharing and Document Authentication | 公開・非公開の二段階情報を持つQR。著者の研究群はテクスチャパターンの生成・認識と印刷物認証を扱う | 「通常リーダーと専用読み取りで異なる情報」という構成自体にも先行研究がある。詳細な性能比較は未実施 |
| Steganography in QR Codes—Information Hiding with Suboptimal Segmentation（2024） | QRの符号化セグメントの自由度を利用 | モジュールを上書きして訂正予算を消費する本実装とは埋め込み層が異なる |
| DOUBLE QR v0.3 / v0.4標準 | 鍵由来の位置に、長さ・暗号化本文・認証タグのビットを絶対白黒値として配置 | v0.3形式を保存した実験用実装。既知生成器による再生成差分に弱い |
| DOUBLE QR v0.4 3重 / 5重 | ビットをコードワード単位にまとめ、RSブロックを巡回する配置＋繰り返し多数決 | 実装上の改修。これを新規アルゴリズムとは主張しない |

## 参照資料（一次資料・著者ページ）

1. Chiang, Y. J., Lin, P. Y., Wang, R. Z., Chen, Y. H. (2013). DOI: 10.3837/tiis.2013.10.012. 大学研究成果ページ（概要・出版年を確認）：
   https://pure.lib.cgu.edu.tw/en/publications/blind-qr-code-steganographic-approach-based-upon-error-correction-3/
2. Tkachenkoほか (2016). IEEE Transactions on Information Forensics and Security, 11(3). 著者業績一覧（J2、および関連テクスチャ研究・学位論文を確認）：
   https://perso.liris.cnrs.fr/itkachenko/pages/publications.html
3. Electronics 2024, 13(13), 2658. DOI: 10.3390/electronics13132658. 出版社検索結果の概要を確認。本文の取得は429エラーのため未確認。本文に依存する詳細比較は行っていない：
   https://www.mdpi.com/2079-9292/13/13/2658

## 検出評価の解釈

本アプリは二つの異なる観察者を評価します。

- **白黒統計だけを見る分類器**：黒マス率、横・縦の隣接変化率、一様な2×2領域率を使用。別URLの訓練・評価データを使い、評価データで閾値を調整しません。AUCが0.5に近くても、この弱い分類器が区別しにくいだけです。
- **表と生成器の規則を知る観察者**：同じ表・V12/H/マスク0で正常QRを再生成し、マス差分が1以上なら検出。裏の鍵は不要です。生成行列での実測であり、写真からの位置合わせ・誤り補正や他の生成器での誤検出率は評価していません。

したがって「普通のQRに見える」「単純統計のAUCが低い」は「隠し情報の存在が見破られない」を意味しません。変更が画像劣化由来か埋め込み由来かの識別も別の問題です。

## 暗号処理の限界

v0.3との互換性のためPBKDF2-HMAC-SHA256、HMAC由来ストリームとのXOR、8バイト認証タグを維持しています。nonceがなく、同じ表と鍵から同じストリームが生成されます。異なる裏本文で再利用すると暗号文間に関係が生じます。強いパスワードだけではこの構造は解消しません。隠蔽性の検証と暗号の機密性評価を混同せず、現在の版は試験用として扱ってください。互換形式を黙って変更して暗号化を強化したとは主張しません。

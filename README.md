# clip — 動画を、軽く。

ブラウザ内で動画をトリミングし、Discord向けのサイズに圧縮するシンプルなWebツールです。動画ファイルはサーバーにアップロードされません。

## GitHub Pagesへの公開

1. このフォルダーの内容をGitHubリポジトリの `main` ブランチへ置きます。
2. リポジトリの **Settings → Pages → Build and deployment** を開き、Sourceを **GitHub Actions** にします。
3. `main` にpushすると、`.github/workflows/pages.yml` がサイトを公開します。

FFmpeg WebAssembly本体と公式ワーカーは初回利用時にjsDelivrから読み込みます。そのため、ページの表示と圧縮エンジンの読み込みにはインターネット接続が必要です。動画データ自体はブラウザ内で処理します。

## ローカルでの表示

ブラウザで `index.html` を直接開く代わりに、HTTP経由で配信してください。たとえばNode.jsがある環境では、このフォルダーから `node preview-server.mjs` を実行すると `http://127.0.0.1:4173` で開けます。

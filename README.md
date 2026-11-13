# DotMaker

画像をレトロなドット絵（ピクセルアート）風に変換・編集できる画像加工デスクトップアプリケーション。

## リポジトリ
https://github.com/Toshiaki0315/DotMaker.git

## 技術スタック
- **Frontend**: TypeScript
- **Backend (Core Logic)**: Rust, Tauri v2
- **Build System**: Make
- **Test**: TDD (Unit test coverage target: >= 90%)

## コマンド
- `make dev`: 開発サーバー起動
- `make app`: アプリケーションのビルド（アドホック署名）
- `make dmg`: DMGファイルの生成
- `make test`: テスト実行（Rust & TypeScript）

## ドキュメント
- [SPECIFICATIONS.md](./docs/SPECIFICATIONS.md): アプリの要求仕様
- [CLAUDE.md](./CLAUDE.md): 開発ガイドライン（AI向け）
- [AGENTS.md](./AGENTS.md): エージェント定義
- [TASKS.md](./TASKS.md): タスクリスト

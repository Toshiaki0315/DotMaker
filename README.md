# DotMaker

[![CI](https://github.com/Toshiaki0315/DotMaker/actions/workflows/ci.yml/badge.svg)](https://github.com/Toshiaki0315/DotMaker/actions/workflows/ci.yml)

画像をレトロなドット絵（ピクセルアート）風に変換・編集できる画像加工デスクトップアプリケーション。

## リポジトリ
https://github.com/Toshiaki0315/DotMaker.git

## 技術スタック
- **Frontend**: TypeScript
- **Backend (Core Logic)**: Rust, Tauri v2
- **Build System**: Make
- **Test**: TDD (Unit test coverage target: >= 90%)

## 開発環境
- Rust のバージョンは [rust-toolchain.toml](./rust-toolchain.toml) で固定しています（ローカル・CI 共通）。rustup が自動で該当バージョンを使用します。
- Node.js のバージョンは [.nvmrc](./.nvmrc) で指定しています。

## コマンド
- `make dev`: 開発サーバー起動
- `make app`: アプリケーションのビルド（アドホック署名）
- `make dmg`: DMGファイルの生成
- `make test`: テスト実行（Rust & TypeScript）
- `make coverage`: カバレッジ計測（90%未満で失敗）
- `make lint`: clippy / tsc による静的チェック

## CI
GitHub Actions（macOS arm64）で push / PR ごとに lint・テスト・カバレッジ（90%閾値）を実行し、アドホック署名済み `.app` をビルドしてアーティファクトとして保存します。

## ドキュメント
- [SPECIFICATIONS.md](./docs/SPECIFICATIONS.md): アプリの要求仕様
- [CLAUDE.md](./CLAUDE.md): 開発ガイドライン（AI向け）
- [AGENTS.md](./AGENTS.md): エージェント定義
- [TASKS.md](./TASKS.md): タスクリスト

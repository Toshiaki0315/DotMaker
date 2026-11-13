.PHONY: dev app dmg clean test test-rust test-ts coverage coverage-rust coverage-ts lint

CARGO_MANIFEST := --manifest-path src-tauri/Cargo.toml
# Tauri ランタイムの配線のみを行うファイルはカバレッジ計測から除外
LLVM_COV_IGNORE := --ignore-filename-regex '(main|lib)\.rs$$'

# 開発用
dev:
	npm run tauri dev

# アプリビルド（アドホック署名）
# TauriはmacOS環境でデフォルトでアドホック署名を行います
app:
	npm run tauri build

# DMG作成（アドホック署名）
dmg:
	npm run tauri build -- --bundles dmg

# テスト実行 (Rust & TypeScript)
test: test-rust test-ts

test-rust:
	cargo test $(CARGO_MANIFEST)

test-ts:
	npm run test

# カバレッジ計測（90%未満で失敗）
coverage: coverage-rust coverage-ts

coverage-rust:
	cargo llvm-cov $(CARGO_MANIFEST) --lib $(LLVM_COV_IGNORE) --fail-under-lines 90

coverage-ts:
	npm run coverage

lint:
	cargo clippy $(CARGO_MANIFEST) --all-targets -- -D warnings
	npx tsc --noEmit

# クリーンアップ
clean:
	cargo clean $(CARGO_MANIFEST)
	rm -rf node_modules dist coverage

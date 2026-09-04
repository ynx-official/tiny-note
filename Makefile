.PHONY: dev prod build

dev:
	npm run tauri:dev -- --config src-tauri/tauri.dev.conf.json

prod:
	npm run tauri:dev -- --config src-tauri/tauri.prod.conf.json

build:
	npm run tauri:build

# AI Test Driver

生成AI対応テストドライバ。**CLI/Web で共通シナリオを実行**し、**結果・スクリーンショット・データ状態を検証**する。

## 特徴

- **共通シナリオ定義**: YAML/JSON でシナリオを定義し、CLI と Web の両方から同一実行
- **生成AIフレンドリ**: 実行結果を JSON で出力、短縮 AI サマリ (`*.ai-summary.json`) を生成
- **ブラウザ検証**: Playwright による navigate / click / type / assert / screenshot
- **API/DB検証**: 任意の HTTP API 呼び出し、PostgreSQL 照会を同じシナリオに同居
- **変数補間**: `${var}` / `$var` でパラメータを動的置換

## クイックスタート

```bash
# 依存関係インストール
pnpm install

# ビルド
pnpm run build

# CLI でシナリオ実行 (Webモード)
pnpm run test

# Webサーバー起動
pnpm run start:web
```

## シナリオ記述例

```yaml
name: login-flow
tags: [auth, smoke]

variables:
  base_url: "http://localhost:3000"

steps:
  - name: ログインページを開く
    kind: navigate
    params:
      path: "${base_url}/login"

  - name: ユーザー名を入力
    kind: type
    params:
      selector: "#username"
      text: "admin"

  - name: パスワードを入力
    kind: type
    params:
      selector: "#password"
      text: "${password}"

  - name: ログインボタンクリック
    kind: click
    params:
      selector: "button[type=submit]"

  - name: ダッシュボード確認
    kind: assertText
    params:
      selector: "h1"
      text: "Dashboard"

  - name: スクリーンショット
    kind: screenshot
    params:
      name: "dashboard.png"
```

## 対応ステップ一覧

| 種別 | 説明 | 例パラメータ |
|------|------|------------|
| `navigate` | ページを開く | `path`, `baseUrl` |
| `click` | クリック | `selector` |
| `type` | テキスト入力 | `selector`, `text` |
| `select` | 選択 | `selector`, `value` |
| `wait` / `sleep` | 待機 | `ms` |
| `waitFor` | 要素出現待ち | `selector`, `state` |
| `assertVisible` | 表示確認 | `selector` |
| `assertText` | テキスト確認 | `selector`, `text` |
| `assertUrl` | URL確認 | `url` |
| `screenshot` | スクリーンショット | `name`, `fullPage` |
| `api` | HTTPリクエスト | `method`, `url`, `headers`, `body` |
| `dbQuery` | DB照会 | `sql`, `db` |
| `shell` | シェルコマンド | `command`, `cwd` |

## 出力ファイル

```
tmp/ai-test-driver/<run-id>/
├── <run-id>.report.json    # 完全な実行レポート
├── <run-id>.ai-summary.json # AI向け短縮サマリ
└── screenshots/
    └── *.png
```

### AI サマリ形式

```json
{
  "scenario": "demo-browser",
  "runId": "...",
  "status": "passed",
  "durationMs": 1234,
  "failedStepCount": 0,
  "screenshots": ["..."],
  "failedSteps": [],
  "passedSteps": [
    { "name": "スクリーンショット撮影", "kind": "screenshot", "value": { "path": "..." } }
  ]
}
```

## Web API

```bash
# シナリオ実行
curl -X POST http://localhost:4783/runs \
  -H "content-type: application/json" \
  -d '{
    "scenario": {
      "name": "health-check",
      "steps": [
        { "kind": "api", "name": "health", "params": { "method": "GET", "url": "http://localhost:4783/health" } }
      ]
    },
    "mode": "web"
  }'

# 結果取得
curl http://localhost:4783/runs/<runId>
```

## ライセンス

MIT

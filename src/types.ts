/**
 * シナリオ定義の型とバリデーション。
 *
 * シナリオは YAML/JSON で記述し、CLI/Web の両方から同一の形で実行する。
 */

// ─── ステップ種別 ────────────────────────────────────────────

export type StepKind =
  | 'navigate'       // ページを開く
  | 'click'          // 要素をクリック
  | 'type'           // 入力
  | 'select'         // select を選択
  | 'wait'           // 明示ウェイト (ms)
  | 'waitFor'        // セレクタ/状態の出現を待つ
  | 'assertVisible'  // 要素の visible を検証
  | 'assertText'     // 要素のテキストを検証
  | 'assertUrl'      // URL を検証
  | 'assertValue'    // 値の一致を検証 (JSON/文字列/数値)
  | 'assertContains' // 部分一致を検証
  | 'assertJson'     // JSON構造・値を検証
  | 'assertDb'       // DB 結果の行数/値を検証
  | 'screenshot'     // スクリーンショットを撮影
  | 'assertScreenshot' // スクリーンショットを比較 (GUI)
  | 'measure'        // パフォーマンス測定 (レスポンスタイムなど)
  | 'api'            // HTTP リクエストを送信
  | 'dbQuery'        // DB を照会して結果を検証
  | 'assertStatus'   // HTTP/DB/Shellの終了ステータスを検証
  | 'shell'          // 任意シェルコマンド
  | 'sleep';         // 明示スリープ (ms)

// ─── 個別ステップ ────────────────────────────────────────────

export interface ScenarioStep {
  /** ステップ名 (結果レポートに表示) */
  name?: string;
  /** ステップ種別 */
  kind: StepKind;
  /** 種別ごとのパラメータ */
  params: Record<string, unknown>;
  /** このステップをスキップする条件 (省略時は常に実行) */
  if?: string;
  /** Fail 時に続行するか (省略時は false) */
  continueOnError?: boolean;
}

// ─── シナリオ ────────────────────────────────────────────────

export interface Scenario {
  /** シナリオ名 */
  name: string;
  /** 説明 */
  description?: string;
  /** タグ (フィルタ用) */
  tags?: string[];
  /** 実行前のセットアップ手順 */
  setup?: ScenarioStep[];
  /** メイン手順 */
  steps: ScenarioStep[];
  /** 実行後のティアダウン手順 */
  teardown?: ScenarioStep[];
  /** グローバル変数の初期値 */
  variables?: Record<string, unknown>;
}

// ─── 実行コンテキスト ────────────────────────────────────────

export interface RunContext {
  /** シナリオ名 */
  scenarioName: string;
  /** 実行ID (ファイル名等に使用) */
  runId: string;
  /** 開始時刻 (ISO 8601) */
  startedAt: string;
  /** 変数マップ */
  variables: Record<string, unknown>;
  /** 出力ディレクトリ */
  outputDir: string;
  /** スクリーンショット保存ディレクトリ */
  screenshotDir: string;
  /** base URL (Web ランタイム用) */
  baseUrl?: string;
  /** DB 接続情報 (任意) */
  db?: DbConfig;
  /** 実行トレース用メタデータ */
  trace?: RunTrace;
}

export interface RunTrace {
  /** シナリオファイルパスや生成元 */
  source?: string;
  /** モデルリビジョンやコミットID */
  modelRevision?: string;
  /** 実行環境 (OS, Node, ブラウザ等) */
  environment?: Record<string, unknown>;
  /** 生成物 (スクリーンショット, ログ等) */
  artifacts?: string[];
}

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

// ─── ステップ結果 ────────────────────────────────────────────

export type StepStatus = 'passed' | 'failed' | 'skipped' | 'error';

export interface StepResult {
  /** ステップ名 */
  name: string;
  /** 種別 */
  kind: StepKind;
  /** ステータス */
  status: StepStatus;
  /** 成功時の値 */
  value?: unknown;
  /** エラー情報 */
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  /** 所要時間 (ms) */
  durationMs: number;
  /** 関連スクリーンショットのパス */
  screenshotPath?: string;
  /** 関連アーティファクトのパス */
  artifacts?: string[];
  /** 状態遷移ログ (before/after snapshot) */
  stateTransition?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  /** 失敗時に続行するか */
  continueOnError?: boolean;
}

// ─── シナリオ実行結果 ────────────────────────────────────────

export interface ScenarioRunReport {
  /** シナリオ名 */
  scenario: string;
  /** 実行ID */
  runId: string;
  /** 実行モード (cli | web) */
  mode: 'cli' | 'web';
  /** 実行状態 */
  status: 'passed' | 'failed' | 'error';
  /** 開始時刻 */
  startedAt: string;
  /** 終了時刻 */
  finishedAt: string;
  /** 所要時間 (ms) */
  durationMs: number;
  /** ステップ結果一覧 */
  steps: StepResult[];
  /** 失敗したステップ数 */
  failedStepCount: number;
  /** スクリーンショット一覧 */
  screenshots: string[];
  /** 実行トレース */
  trace?: RunTrace;
  /** 任意のメタデータ */
  meta?: Record<string, unknown>;
}

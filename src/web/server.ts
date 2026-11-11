/**
 * Web サーバー。
 *
 * Express でシナリオ実行 API を公開し、ブラウザ/生成AI から HTTP で実行を指示できる。
 *
 * エンドポイント:
 *   POST /runs            - シナリオを実行 (JSONボディでシナリオ定義またはファイルパスを指定)
 *   GET  /runs/:runId     - 実行結果を取得
 *   GET  /health          - ヘルスチェック
 */

import express from 'express';
import * as cors from 'cors';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as yaml from 'js-yaml';
import { loadScenarioFromObject } from '../loader.js';
import { runScenario, interpolate } from '../engine.js';
import { runCliStep } from '../runners/cli.js';
import { runWebStep } from '../runners/web.js';
import { writeReport, writeAiSummary } from '../reporter.js';
import type { Scenario, ScenarioRunReport, RunContext, RunTrace } from '../types.js';

const app = express();
app.use(cors.default());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

const runs = new Map<string, { report: ScenarioRunReport; at: string }>();

function makeRunId(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }
}

async function execScenario(
  scenario: Scenario,
  opts: {
    mode: 'cli' | 'web';
    baseUrl?: string;
    variables?: Record<string, unknown>;
    db?: RunContext['db'];
    outputDir: string;
    trace?: RunTrace;
  },
): Promise<ScenarioRunReport> {
  const runId = makeRunId();
  const screenshotDir = path.join(opts.outputDir, 'screenshots');
  fs.mkdirSync(screenshotDir, { recursive: true });

  const variables = { ...(scenario.variables ?? {}), ...(opts.variables ?? {}) };
  const ctx: RunContext = {
    scenarioName: scenario.name,
    runId,
    startedAt: new Date().toISOString(),
    variables,
    outputDir: opts.outputDir,
    screenshotDir,
    baseUrl: opts.baseUrl,
    db: opts.db,
    trace: opts.trace,
  };

  const runner = opts.mode === 'web' ? runWebStep : runCliStep;
  const report = await runScenario(scenario, ctx, runner);

  if (opts.mode === 'web') {
    const { dispose } = await import('../runners/web.js');
    await dispose();
  }

  writeReport(report, opts.outputDir);
  writeAiSummary(report, opts.outputDir);
  return report;
}

// ─── routes ─────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

app.post('/runs', async (req, res) => {
  try {
    const outputDir = String(req.body.outputDir ?? path.join(os.tmpdir(), 'ai-test-driver', makeRunId()));
    const mode = req.body.mode ?? 'web';
    const baseUrl = req.body.baseUrl;
    const variables = req.body.variables as Record<string, unknown> | undefined;
    const db = req.body.db as RunContext['db'] | undefined;
    const trace: RunTrace = {
      source: req.body.source,
      modelRevision: req.body.modelRevision,
      environment: {
        node: process.version,
        platform: process.platform,
        userAgent: req.headers['user-agent'],
      },
    };

    let scenario: Scenario;
    if (typeof req.body.scenario === 'string') {
      const raw = fs.readFileSync(req.body.scenario, 'utf-8');
      const ext = req.body.scenario.split('.').pop()?.toLowerCase();
      const parsed = ext === 'json' ? JSON.parse(raw) : yaml.load(raw);
      scenario = loadScenarioFromObject(parsed, req.body.scenario);
      if (!scenario.name || !Array.isArray(scenario.steps)) {
        throw new Error('シナリオ形式が不正です: name/steps が必要です');
      }
    } else {
      scenario = loadScenarioFromObject(req.body.scenario, '<api-body>');
    }

    const report = await execScenario(scenario, { mode, baseUrl, variables, db, outputDir, trace });
    runs.set(report.runId, { report, at: new Date().toISOString() });

    res.status(202).json({ runId: report.runId, status: report.status });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.get('/runs/:runId', (req, res) => {
  const entry = runs.get(req.params.runId);
  if (!entry) return res.status(404).json({ error: 'not found' });
  res.json(entry.report);
});

const PORT = Number(process.env.AI_TEST_DRIVER_PORT ?? 4783);
app.listen(PORT, () => {
  console.log(`🌐 AI Test Driver Web サーバー起動: http://localhost:${PORT}`);
  console.log(`   POST /runs   - シナリオ実行`);
  console.log(`   GET  /runs/:runId - 結果取得`);
  console.log(`   GET  /health - ヘルスチェック`);
});

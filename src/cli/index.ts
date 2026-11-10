#!/usr/bin/env node
/**
 * CLI エントリポイント。
 *
 * 実行例:
 *   ai-test-driver run examples/demo-scenario.yaml --base-url http://localhost:3000
 *   ai-test-driver run examples/demo-scenario.yaml --mode cli
 */

import { Command } from 'commander';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { execaCommand } from 'execa';
import { loadScenario } from '../loader.js';
import { runScenario, interpolate } from '../engine.js';
import { runCliStep } from '../runners/cli.js';
import { runWebStep } from '../runners/web.js';
import { writeReport, writeAiSummary, printSummary } from '../reporter.js';
import type { RunTrace } from '../types.js';

const program = new Command();

program
  .name('ai-test-driver')
  .description('生成AI対応テストドライバ')
  .version('0.1.0');

program
  .command('run')
  .description('シナリオを実行する')
  .argument('<scenario>', 'シナリオYAML/JSONファイルのパス')
  .option('--mode <mode>', '実行モード: cli | web', 'web')
  .option('--base-url <url>', 'Webモード時のbase URL')
  .option('--output-dir <dir>', 'レポート出力ディレクトリ', '')
  .option('--db-host <host>', 'DBホスト (任意)')
  .option('--db-port <port>', 'DBポート (任意)', '5432')
  .option('--db-name <name>', 'DB名 (任意)')
  .option('--db-user <user>', 'DBユーザー (任意)')
  .option('--db-password <pw>', 'DBパスワード (任意)')
  .option('--variable <kv>', '変数 key=value (複数指定可)', [])
  .option('--source <path>', 'シナリオのソースパス (トレース用)')
  .option('--model-revision <rev>', 'モデルリビジョン (トレース用)')
  .action(async (scenarioPath: string, opts) => {
    const resolved = path.resolve(scenarioPath);
    if (!fs.existsSync(resolved)) {
      console.error(`ファイルが見つかりません: ${resolved}`);
      process.exit(1);
    }

    const { scenario } = loadScenario(resolved);

    const runId = `${scenario.name}-${Date.now()}`;
    const tmpDir = path.join(os.tmpdir(), 'ai-test-driver', runId);
    const screenshotDir = path.join(tmpDir, 'screenshots');
    fs.mkdirSync(screenshotDir, { recursive: true });

    const outputDir = opts.outputDir || tmpDir;

    const variables: Record<string, unknown> = { ...(scenario.variables ?? {}) };
    for (const kv of opts.variable) {
      const [k, ...rest] = kv.split('=');
      variables[k] = rest.join('=');
    }

    const trace: RunTrace = {
      source: opts.source ?? resolved,
      modelRevision: opts.modelRevision,
      environment: {
        node: process.version,
        platform: process.platform,
        cwd: process.cwd(),
      },
    };

    const ctx = {
      scenarioName: scenario.name,
      runId,
      startedAt: new Date().toISOString(),
      variables,
      outputDir,
      screenshotDir,
      baseUrl: opts.baseUrl,
      db: opts.dbHost
        ? {
            host: opts.dbHost,
            port: Number(opts.dbPort),
            database: opts.dbName,
            user: opts.dbUser,
            password: opts.dbPassword,
          }
        : undefined,
      trace,
    };

    const useWeb = opts.mode === 'web' && !!opts.baseUrl;

    const runner = useWeb ? runWebStep : runCliStep;
    const report = await runScenario(scenario, ctx, runner);

    // ブラウザ後始末
    if (useWeb) {
      const { dispose } = await import('../runners/web.js');
      await dispose();
    }

    const reportPath = writeReport(report, outputDir);
    const aiPath = writeAiSummary(report, outputDir);

    printSummary(report);

    console.log(`📄 レポート: ${reportPath}`);
    console.log(`🤖 AIサマリ: ${aiPath}\n`);

    process.exit(report.status === 'passed' ? 0 : 1);
  });

program.parse();

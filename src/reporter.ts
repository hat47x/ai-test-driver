/**
 * レポーター。
 *
 * 実行結果を:
 * - pretty console (人間向け)
 * - JSON ファイル (AI/ツール向け)
 * の両方に出力する。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ScenarioRunReport, StepResult } from './types';

function ts() { return new Date().toISOString(); }

export function printSummary(report: ScenarioRunReport): void {
  const icon = report.status === 'passed' ? '✅' : '❌';
  console.log(`\n${icon} [${report.runId}] ${report.scenario} → ${report.status.toUpperCase()}`);
  console.log(`   時間: ${report.durationMs}ms  開始: ${report.startedAt}  終了: ${report.finishedAt}`);
  console.log(`   失敗ステップ: ${report.failedStepCount}  スクリーンショット: ${report.screenshots.length}`);

  for (const s of report.steps) {
    const prefix = statusPrefix(s.status);
    console.log(`   ${prefix} ${s.name} (${s.kind}) — ${s.durationMs}ms`);
    if (s.error) {
      console.log(`         error: ${s.error.message}`);
    }
    if (s.value !== undefined && s.status === 'passed') {
      const text = typeof s.value === 'string' ? s.value : JSON.stringify(s.value);
      const trimmed = text.length > 120 ? text.slice(0, 120) + '…' : text;
      console.log(`         value: ${trimmed}`);
    }
  }
  console.log('');
}

function statusPrefix(status: StepResult['status']): string {
  switch (status) {
    case 'passed': return '✅';
    case 'failed': return '❌';
    case 'error':  return '💥';
    case 'skipped': return '⏭️';
  }
}

export function writeReport(report: ScenarioRunReport, outputDir: string): string {
  const filePath = path.join(outputDir, `${report.runId}.report.json`);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');
  return filePath;
}

export function writeAiSummary(report: ScenarioRunReport, outputDir: string): string {
  // AI が Context として使いやすい短縮形
  const summary = {
    scenario: report.scenario,
    runId: report.runId,
    status: report.status,
    durationMs: report.durationMs,
    failedStepCount: report.failedStepCount,
    screenshots: report.screenshots,
    failedSteps: report.steps
      .filter((s) => s.status === 'failed' || s.status === 'error')
      .map((s) => ({
        name: s.name,
        kind: s.kind,
        status: s.status,
        error: s.error,
        value: s.value,
      })),
    passedSteps: report.steps
      .filter((s) => s.status === 'passed')
      .map((s) => ({ name: s.name, kind: s.kind, value: s.value })),
  };

  const filePath = path.join(outputDir, `${report.runId}.ai-summary.json`);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(summary, null, 2), 'utf-8');
  return filePath;
}

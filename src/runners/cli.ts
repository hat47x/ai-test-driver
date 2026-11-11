/**
 * CLI ランナー。
 *
 * シェルコマンド、HTTP API、DB クエリを中心に実行する。
 */

import type { ScenarioStep, RunContext, StepResult } from '../types.js';
import { interpolate } from '../engine.js';
import { runShell, runApi, runDbQuery } from './shared.js';

export async function runCliStep(step: ScenarioStep, ctx: RunContext): Promise<StepResult> {
  const t0 = Date.now();
  const params = interpolate(step.params, ctx.variables) as Record<string, unknown>;
  const name = step.name ?? step.kind;
  const stateTransition = (() => {
    const before = params.before as Record<string, unknown> | undefined;
    const after = params.after as Record<string, unknown> | undefined;
    if (before || after) return { before, after };
    return undefined;
  })();

  try {
    switch (step.kind) {
      case 'shell': {
        const r = await runShell(params, ctx);
        return { name, kind: step.kind, status: 'passed', value: r.output, durationMs: r.durationMs, stateTransition };
      }
      case 'api': {
        const r = await runApi(params, ctx);
        const value = { status: r.status, body: r.body };
        if (r.status < 200 || r.status >= 300) {
          return { name, kind: step.kind, status: 'failed', value, error: { message: `HTTP ${r.status}` }, durationMs: r.durationMs };
        }
        return { name, kind: step.kind, status: 'passed', value, durationMs: r.durationMs };
      }
      case 'dbQuery': {
        const r = await runDbQuery(params, ctx);
        return { name, kind: step.kind, status: 'passed', value: r.rows, durationMs: r.durationMs, stateTransition };
      }
      case 'wait':
      case 'sleep': {
        const ms = Number(params.ms ?? 0);
        await new Promise((resolve) => setTimeout(resolve, ms));
        return { name, kind: step.kind, status: 'passed', value: { sleptMs: ms }, durationMs: Date.now() - t0 };
      }
      case 'assertValue': {
        const expected = params.expected;
        const actual = params.actual;
        const ok = (() => {
          if (expected === actual) return true;
          if (typeof expected === 'object' && typeof actual === 'object' && expected && actual) {
            return JSON.stringify(expected) === JSON.stringify(actual);
          }
          return false;
        })();
        if (!ok) {
          return {
            name,
            kind: step.kind,
            status: 'failed',
            value: { expected, actual },
            error: { message: `値不一致: expected="${expected}" actual="${actual}"` },
            durationMs: Date.now() - t0,
            stateTransition,
          };
        }
        return { name, kind: step.kind, status: 'passed', durationMs: Date.now() - t0, stateTransition };
      }
      case 'assertContains': {
        const text = String(params.text ?? '');
        const expected = String(params.expected ?? '');
        const ok = text.includes(expected);
        if (!ok) {
          return {
            name,
            kind: step.kind,
            status: 'failed',
            value: { expected, actual: text },
            error: { message: `部分不一致: expected="${expected}" actual="${text}"` },
            durationMs: Date.now() - t0,
          };
        }
        return { name, kind: step.kind, status: 'passed', durationMs: Date.now() - t0 };
      }
      case 'assertJson': {
        const expected = params.expected as Record<string, unknown> | undefined;
        const actual = params.actual as Record<string, unknown> | undefined;
        const ok = JSON.stringify(actual) === JSON.stringify(expected);
        if (!ok) {
          return {
            name,
            kind: step.kind,
            status: 'failed',
            value: { expected, actual },
            error: { message: `JSON不一致: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}` },
            durationMs: Date.now() - t0,
          };
        }
        return { name, kind: step.kind, status: 'passed', durationMs: Date.now() - t0 };
      }
      case 'assertDb': {
        const r = await runDbQuery(params, ctx);
        const rows = r.rows;
        const expectedCount = Number(params.expectedCount ?? -1);
        if (expectedCount >= 0 && rows.length !== expectedCount) {
          return {
            name,
            kind: step.kind,
            status: 'failed',
            value: { expectedCount, actualCount: rows.length, rows },
            error: { message: `DB件数不一致: expected=${expectedCount} actual=${rows.length}` },
            durationMs: r.durationMs,
          };
        }
        const expected = params.expected as Record<string, unknown> | undefined;
        const actual = rows[0];
        if (expected && JSON.stringify(actual) !== JSON.stringify(expected)) {
          return {
            name,
            kind: step.kind,
            status: 'failed',
            value: { expected, actual },
            error: { message: `DB内容不一致: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}` },
            durationMs: r.durationMs,
          };
        }
        return { name, kind: step.kind, status: 'passed', value: { rows, count: rows.length }, durationMs: r.durationMs };
      }
      case 'assertStatus': {
        const expected = Number(params.expected ?? 0);
        const actual = Number(params.actual ?? 0);
        const ok = actual === expected;
        if (!ok) {
          return {
            name,
            kind: step.kind,
            status: 'failed',
            value: { expected, actual },
            error: { message: `ステータス不一致: expected=${expected} actual=${actual}` },
            durationMs: Date.now() - t0,
          };
        }
        return { name, kind: step.kind, status: 'passed', durationMs: Date.now() - t0 };
      }
      default:
        return {
          name,
          kind: step.kind,
          status: 'error',
          error: { message: `CLI runner は ${step.kind} をサポートしていません` },
          durationMs: Date.now() - t0,
        };
    }
  } catch (e) {
    return {
      name,
      kind: step.kind,
      status: 'error',
      error: { message: String(e) },
      durationMs: Date.now() - t0,
    };
  }
}

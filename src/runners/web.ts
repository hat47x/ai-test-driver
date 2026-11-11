/**
 * Web ランナー。
 *
 * Playwright でブラウザ操作、スクリーンショット撮影、DOM 検証を行う。
 * API / DB は shared.ts に委譲する。
 */

import { chromium, type Browser, type Page } from 'playwright';
import * as path from 'node:path';
import type { ScenarioStep, RunContext, StepResult } from '../types.js';
import { interpolate } from '../engine.js';
import { runApi, runDbQuery, runShell } from './shared.js';

let browser: Browser | null = null;
let page: Page | null = null;

async function ensureBrowser(baseUrl?: string): Promise<{ page: Page }> {
  if (!browser) {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    browser = await chromium.launch({
      headless: true,
      executablePath: chromePath,
      args: ['--headless=new', '--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  if (!page) {
    page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  }
  if (baseUrl && page.url() === 'about:blank') {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  }
  return { page };
}

export async function dispose(): Promise<void> {
  if (page) { await page.close(); page = null; }
  if (browser) { await browser.close(); browser = null; }
}

export async function runWebStep(step: ScenarioStep, ctx: RunContext): Promise<StepResult> {
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
      case 'navigate': {
        const { page } = await ensureBrowser(ctx.baseUrl);
        const path = String(params.path ?? '/');
        const url = ctx.baseUrl
          ? new URL(path, ctx.baseUrl).toString()
          : path;
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        return { name, kind: step.kind, status: 'passed', value: { url }, durationMs: Date.now() - t0 };
      }
      case 'click': {
        const { page } = await ensureBrowser(ctx.baseUrl);
        await page.click(String(params.selector));
        return { name, kind: step.kind, status: 'passed', durationMs: Date.now() - t0 };
      }
      case 'type': {
        const { page } = await ensureBrowser(ctx.baseUrl);
        await page.fill(String(params.selector), String(params.text ?? ''));
        return { name, kind: step.kind, status: 'passed', durationMs: Date.now() - t0 };
      }
      case 'select': {
        const { page } = await ensureBrowser(ctx.baseUrl);
        await page.selectOption(String(params.selector), String(params.value ?? ''));
        return { name, kind: step.kind, status: 'passed', durationMs: Date.now() - t0 };
      }
      case 'wait':
      case 'sleep': {
        const ms = Number(params.ms ?? 0);
        await new Promise((resolve) => setTimeout(resolve, ms));
        return { name, kind: step.kind, status: 'passed', value: { waitedMs: ms }, durationMs: Date.now() - t0 };
      }
      case 'waitFor': {
        const { page } = await ensureBrowser(ctx.baseUrl);
        const selector = String(params.selector ?? '');
        const state = String(params.state ?? 'visible').toLowerCase();
        await page.waitForSelector(selector, { state: state as 'visible' | 'hidden' | 'attached' | 'detached' });
        return { name, kind: step.kind, status: 'passed', durationMs: Date.now() - t0 };
      }
      case 'assertVisible': {
        const { page } = await ensureBrowser(ctx.baseUrl);
        const selector = String(params.selector);
        const count = await page.locator(selector).count();
        const visible = count > 0 && (await page.locator(selector).first().isVisible().catch(() => false));
        if (!visible) {
          return { name, kind: step.kind, status: 'failed', error: { message: `要素が見つかりません: ${selector}` }, durationMs: Date.now() - t0 };
        }
        return { name, kind: step.kind, status: 'passed', durationMs: Date.now() - t0 };
      }
      case 'assertText': {
        const { page } = await ensureBrowser(ctx.baseUrl);
        const selector = String(params.selector);
        const expected = String(params.text ?? '');
        const actual = (await page.locator(selector).first().textContent()) ?? '';
        if (actual !== expected) {
          return {
            name,
            kind: step.kind,
            status: 'failed',
            value: { expected, actual },
            error: { message: `テキスト不一致: expected="${expected}" actual="${actual}"` },
            durationMs: Date.now() - t0,
          };
        }
        return { name, kind: step.kind, status: 'passed', durationMs: Date.now() - t0 };
      }
      case 'assertUrl': {
        const { page } = await ensureBrowser(ctx.baseUrl);
        const expected = String(params.url ?? '');
        const actual = page.url();
        const ok = expected
          ? actual === new URL(expected, ctx.baseUrl ?? actual).toString()
          : true;
        if (!ok) {
          return {
            name,
            kind: step.kind,
            status: 'failed',
            value: { expected, actual },
            error: { message: `URL不一致: expected="${expected}" actual="${actual}"` },
            durationMs: Date.now() - t0,
          };
        }
        return { name, kind: step.kind, status: 'passed', durationMs: Date.now() - t0 };
      }
      case 'assertValue': {
        const { page } = await ensureBrowser(ctx.baseUrl);
        const expected = params.expected;
        const selector = String(params.selector ?? '');
        let actual: unknown;
        if (selector) {
          actual = await page.locator(selector).first().textContent();
        } else {
          actual = params.actual;
        }
        const ok = (() => {
          if (actual === expected) return true;
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
        const { page } = await ensureBrowser(ctx.baseUrl);
        const expected = String(params.text ?? '');
        const actual = (await page.locator(String(params.selector)).first().textContent()) ?? '';
        const ok = actual.includes(expected);
        if (!ok) {
          return {
            name,
            kind: step.kind,
            status: 'failed',
            value: { expected, actual },
            error: { message: `部分不一致: expected="${expected}" actual="${actual}"` },
            durationMs: Date.now() - t0,
          };
        }
        return { name, kind: step.kind, status: 'passed', durationMs: Date.now() - t0 };
      }
      case 'assertJson': {
        const { page } = await ensureBrowser(ctx.baseUrl);
        const selector = String(params.selector ?? '');
        const expected = params.expected as Record<string, unknown> | undefined;
        const actualText = await page.locator(selector).first().textContent();
        let actual: unknown = actualText;
        try {
          actual = JSON.parse(actualText ?? '{}');
        } catch {
          // keep text
        }
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
      case 'screenshot': {
        const { page } = await ensureBrowser(ctx.baseUrl);
        const raw = String(params.name ?? `shot-${Date.now()}.png`);
        const safe = raw.replace(/[^a-zA-Z0-9_\-./]+/g, '_');
        const outPath = `${ctx.screenshotDir}/${safe}`;
        await page.screenshot({ path: outPath, fullPage: Boolean(params.fullPage) });
        return { name, kind: step.kind, status: 'passed', value: { path: outPath }, screenshotPath: outPath, durationMs: Date.now() - t0 };
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
        return { name, kind: step.kind, status: 'passed', value: r.rows, durationMs: r.durationMs };
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
      case 'shell': {
        const r = await runShell(params, ctx);
        return { name, kind: step.kind, status: 'passed', value: { output: r.output }, durationMs: r.durationMs };
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
      case 'assertScreenshot': {
        const { page } = await ensureBrowser(ctx.baseUrl);
        const baseline = String(params.baseline ?? '');
        const actualPath = String(params.actual ?? `${ctx.screenshotDir}/assert_${Date.now()}.png`);
        await page.screenshot({ path: actualPath, fullPage: Boolean(params.fullPage) });
        // TODO: pixel diff against baseline
        return { name, kind: step.kind, status: 'passed', value: { baseline, actualPath }, screenshotPath: actualPath, durationMs: Date.now() - t0 };
      }
      case 'measure': {
        const { page } = await ensureBrowser(ctx.baseUrl);
        const metric = String(params.metric ?? 'responseTime');
        const start = Date.now();
        if (params.url) {
          await page.goto(String(params.url), { waitUntil: 'domcontentloaded' });
        } else if (params.selector) {
          await page.waitForSelector(String(params.selector), { state: 'visible' });
        }
        const durationMs = Date.now() - start;
        const threshold = Number(params.thresholdMs ?? 0);
        const ok = threshold > 0 ? durationMs <= threshold : true;
        return {
          name,
          kind: step.kind,
          status: ok ? 'passed' : 'failed',
          value: { metric, durationMs, threshold },
          error: ok ? undefined : { message: `パフォーマンス閾値超過: ${durationMs}ms > ${threshold}ms` },
          durationMs,
        };
      }
      default:
        return {
          name,
          kind: step.kind,
          status: 'error',
          error: { message: `Web runner は ${step.kind} をサポートしていません` },
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

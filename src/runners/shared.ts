/**
 * 共通: HTTP API / DB クエリユーティリティ。
 * CLI/Web の両方から使う。
 */

import { execaCommand } from 'execa';
import pg from 'pg';
import type { RunContext } from '../types';
import { interpolate } from '../engine';

function timer<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const t0 = Date.now();
  return fn().then((r) => ({ result: r, durationMs: Date.now() - t0 }));
}

export async function runApi(
  params: Record<string, unknown>,
  ctx: RunContext,
): Promise<{ status: number; body: unknown; durationMs: number }> {
  const resolved = interpolate(params, ctx.variables) as Record<string, unknown>;
  const method = String(resolved.method ?? 'GET').toUpperCase();
  const url = String(resolved.url);
  const headers = (resolved.headers as Record<string, string>) ?? {};
  const bodyText = typeof resolved.body === 'string' ? resolved.body : undefined;

  const res = await timer(async () => {
    const r = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: bodyText ? (interpolate(bodyText, ctx.variables) as string) : undefined,
    });
    const ct = r.headers.get('content-type') ?? '';
    const text = await r.text();
    let parsed: unknown = text;
    if (ct.includes('application/json')) {
      try { parsed = JSON.parse(text); } catch { /* keep text */ }
    }
    return { status: r.status, body: parsed };
  });
  return { ...res.result, durationMs: res.durationMs };
}

export async function runDbQuery(
  params: Record<string, unknown>,
  ctx: RunContext,
): Promise<{ rows: unknown[]; durationMs: number }> {
  const resolved = interpolate(params, ctx.variables) as Record<string, unknown>;
  if (!ctx.db) throw new Error('RunContext.db が未設定です');
  const sql = String(resolved.sql ?? '');
  const pool = new pg.Pool({
    host: ctx.db.host,
    port: ctx.db.port,
    database: ctx.db.database,
    user: ctx.db.user,
    password: ctx.db.password,
  });
  const res = await timer(async () => {
    const r = await pool.query(sql);
    return { rows: r.rows };
  });
  await pool.end();
  return { ...res.result, durationMs: res.durationMs };
}

export async function runShell(
  params: Record<string, unknown>,
  ctx: RunContext,
): Promise<{ output: string; durationMs: number }> {
  const resolved = interpolate(params, ctx.variables) as Record<string, unknown>;
  const cmd = String(resolved.command ?? '');
  const cwd = String(resolved.cwd ?? ctx.outputDir);
  const stdout = await timer(async () => {
    const result = await execaCommand(cmd, { cwd, shell: true });
    return result.stdout;
  });
  return { output: stdout.result, durationMs: stdout.durationMs };
}

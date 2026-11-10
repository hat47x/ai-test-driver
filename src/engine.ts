/**
 * シナリオ実行エンジン。
 *
 * 各ステップを順次実行し、StepResult を積み上げて ScenarioRunReport を生成する。
 * 変数補間 ($var) は params 実行前に解決する。
 */

import type {
  Scenario,
  RunContext,
  ScenarioRunReport,
  StepResult,
  ScenarioStep,
} from './types';

const VARIABLE_RE = /\$\{([^}]+)\}|\$([a-zA-Z_][a-zA-Z0-9_.]*)/g;

export function interpolate(template: unknown, variables: Record<string, unknown>): unknown {
  if (typeof template === 'string') {
    return template.replace(VARIABLE_RE, (_match, braceKey, dotKey) => {
      const key = braceKey ?? dotKey!;
      const parts = key.split('.');
      let cur: unknown = variables;
      for (const p of parts) {
        if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
          cur = (cur as Record<string, unknown>)[p];
        } else {
          return _match; // unresolved → そのまま
        }
      }
      return String(cur);
    });
  }
  if (Array.isArray(template)) {
    return template.map((v) => interpolate(v, variables));
  }
  if (template && typeof template === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(template as Record<string, unknown>)) {
      out[k] = interpolate(v, variables);
    }
    return out;
  }
  return template;
}

export async function runScenario(
  scenario: Scenario,
  ctx: RunContext,
  stepRunner: (step: ScenarioStep, ctx: RunContext) => Promise<StepResult>,
): Promise<ScenarioRunReport> {
  const startedAt = new Date().toISOString();
  const allSteps: StepResult[] = [];

  // setup
  if (scenario.setup?.length) {
    for (const step of scenario.setup) {
      const res = await stepRunner(step, ctx);
      allSteps.push(res);
      if (res.status === 'failed' || res.status === 'error') {
        break;
      }
    }
  }

  // main steps
  const mainSteps: StepResult[] = [];
  let aborted = false;
  for (const step of scenario.steps) {
    if (aborted) {
      mainSteps.push({
        name: step.name ?? step.kind,
        kind: step.kind,
        status: 'skipped',
        durationMs: 0,
      });
      continue;
    }
    const res = await stepRunner(step, ctx);
    mainSteps.push(res);
    if (res.status === 'failed' || res.status === 'error') {
      if (!step.continueOnError) {
        aborted = true;
      }
    }
  }

  // teardown
  const teardownSteps: StepResult[] = [];
  if (scenario.teardown?.length) {
    for (const step of scenario.teardown) {
      try {
        const res = await stepRunner(step, ctx);
        teardownSteps.push(res);
      } catch (e) {
        teardownSteps.push({
          name: step.name ?? step.kind,
          kind: step.kind,
          status: 'error',
          durationMs: 0,
          error: { message: String(e) },
        });
      }
    }
  }

  const steps = [...allSteps, ...mainSteps, ...teardownSteps];
  const failedStepCount = steps.filter((s) => s.status === 'failed' || s.status === 'error').length;
  const overallStatus: ScenarioRunReport['status'] =
    failedStepCount > 0 ? 'failed' : 'passed';

  const finishedAt = new Date().toISOString();
  const durationMs =
    new Date(finishedAt).getTime() - new Date(startedAt).getTime();

  const screenshots = steps
    .filter((s) => s.screenshotPath)
    .map((s) => s.screenshotPath as string);

  return {
    scenario: scenario.name,
    runId: ctx.runId,
    mode: ctx.baseUrl ? 'web' : 'cli',
    status: overallStatus,
    startedAt,
    finishedAt,
    durationMs,
    steps,
    failedStepCount,
    screenshots,
    trace: ctx.trace,
  };
}

/**
 * シナリオファイルの読み込みとバリデーション。
 */

import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import { z } from 'zod';
import type { Scenario, ScenarioStep, StepKind } from './types';

// ─── Zod スキーマ ────────────────────────────────────────────

const StepKindSchema = z.enum([
  'navigate',
  'click',
  'type',
  'select',
  'wait',
  'waitFor',
  'assertVisible',
  'assertText',
  'assertUrl',
  'assertValue',
  'assertContains',
  'assertJson',
  'assertDb',
  'screenshot',
  'assertScreenshot',
  'measure',
  'api',
  'dbQuery',
  'assertStatus',
  'shell',
  'sleep',
]);

const StepSchema: z.ZodType<ScenarioStep> = z.object({
  name: z.string().optional(),
  kind: StepKindSchema,
  params: z.record(z.unknown()),
  if: z.string().optional(),
  continueOnError: z.boolean().optional(),
});

const ScenarioSchema: z.ZodType<Scenario> = z.object({
  name: z.string().min(1, 'scenario.name は必須です'),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  setup: z.array(StepSchema).optional(),
  steps: z.array(StepSchema).min(1, 'steps は1つ以上必要です'),
  teardown: z.array(StepSchema).optional(),
  variables: z.record(z.unknown()).optional(),
});

// ─── ローダー ────────────────────────────────────────────────

export interface LoadedScenario {
  scenario: Scenario;
  /** ファイルパス (エラー報告用) */
  sourcePath: string;
}

export function loadScenario(filePath: string): LoadedScenario {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const ext = filePath.split('.').pop()?.toLowerCase();

  let parsed: unknown;
  if (ext === 'json') {
    parsed = JSON.parse(raw);
  } else {
    // YAML / YML
    parsed = yaml.load(raw) as unknown;
  }

  const scenario = ScenarioSchema.parse(parsed);
  return { scenario, sourcePath: filePath };
}

export function loadScenarioFromObject(data: unknown, sourcePath = '<input>'): Scenario {
  return ScenarioSchema.parse(data);
}

export { StepKindSchema, StepSchema, ScenarioSchema };

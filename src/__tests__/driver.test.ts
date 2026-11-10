import { describe, it } from 'node:test';
import assert from 'node:assert';
import { loadScenario } from '../loader.js';
import { runScenario } from '../engine.js';
import { runCliStep } from '../runners/cli.js';
import { interpolate } from '../engine.js';

describe('ai-test-driver', () => {
  it('loads a YAML scenario', () => {
    const { scenario } = loadScenario('examples/demo-scenario.yaml');
    assert.strictEqual(scenario.name, 'demo-health-api');
    assert.ok(scenario.steps.length > 0);
  });

  it('interpolates variables', () => {
    const result = interpolate('${base_url}/health', { base_url: 'http://localhost:4783' });
    assert.strictEqual(result, 'http://localhost:4783/health');
  });

  it('runs a CLI scenario', async () => {
    const { scenario } = loadScenario('examples/demo-scenario.yaml');
    const report = await runScenario(scenario, {
      scenarioName: scenario.name,
      runId: 'test-1',
      startedAt: new Date().toISOString(),
      variables: scenario.variables ?? {},
      outputDir: 'tmp/test',
      screenshotDir: 'tmp/test/screenshots',
    }, runCliStep);
    assert.ok(report.steps.length > 0);
  });
});

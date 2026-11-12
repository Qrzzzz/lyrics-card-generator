const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { load } = require('js-yaml');

function readWorkflow(file) {
  return load(readFileSync(file, 'utf8'));
}

// Inspect executable run blocks, never YAML comments or display names.
function commandIndex(step, command) {
  return (step.run || '').split(/\r?\n|&&/).findIndex(line => {
    const executable = line.trim().replace(/^&\s+/, '');
    return executable === command || executable.startsWith(`${command} `);
  });
}

function runs(step, command) {
  return commandIndex(step, command) >= 0;
}

function commandStep(job, command) {
  const step = job.steps?.find(step => runs(step, command));
  assert.ok(step, `missing executable command: ${command}`);
  assert.ok(!job['continue-on-error'] && !step['continue-on-error'], `${command} must block on failure`);
  return step;
}

function before(job, earlier, later) {
  const first = commandStep(job, earlier);
  const second = commandStep(job, later);
  assert.ok(job.steps.indexOf(first) < job.steps.indexOf(second) ||
    (first === second && commandIndex(first, earlier) < commandIndex(second, later)),
  `${earlier} must precede ${later}`);
}

function checkActions(workflow) {
  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps || []) {
      if (step.uses) assert.match(step.uses, /^[^@]+@[0-9a-f]{40}$/, 'external actions are commit-pinned');
    }
  }
}

module.exports = { readWorkflow, runs, commandStep, before, checkActions };

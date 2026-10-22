// Every entry from desktop:scenario-test and desktop:interaction-test is retained.
export const desktopGroups = Object.freeze({
  editor: [
    ...['search', 'song-import', 'examples', 'fonts', 'titlebar', 'lyrics-input'].map(scenario => ({ id: `scenario-${scenario}`, command: 'desktop:scenario-test', args: [`--scenario=${scenario}`] })),
    { id: 'settings', command: 'desktop:settings-test' }
  ],
  data: ['support', 'import-history', 'autosave', 'history-transfer', 'history-budget'].map(id => ({ id, command: `desktop:${id}-test` })),
  native: ['single-instance', 'startup-origin', 'language', 'clipboard', 'ai-errors', 'updater', 'image-output'].map(id => ({ id, command: `desktop:${id}-test` }))
});

export function assertGroupResults(results, expected) {
  const names = Object.keys(desktopGroups);
  if (results.length !== names.length) throw Error('Missing/extra desktop group evidence');
  for (const group of names) {
    const matches = results.filter(result => result.group === group);
    if (matches.length !== 1) throw Error(`Missing/duplicate group: ${group}`);
    const result = matches[0];
    for (const field of ['sha', 'runId', 'buildDigest', 'contractDigest']) {
      if (!expected[field] || result[field] !== expected[field]) throw Error(`${group}: mismatched ${field}`);
    }
    if (!Number.isSafeInteger(result.attempt) || result.attempt < 1 || result.attempt > expected.attempt) throw Error(`${group}: invalid attempt`);
    if (result.outcome !== 'success' || result.entries.length !== desktopGroups[group].length || result.entries.some((entry, index) => entry.id !== desktopGroups[group][index].id || entry.exitCode !== 0)) throw Error(`${group}: incomplete or unsuccessful coverage`);
  }
  return true;
}

// Serialize into the renderer before the action. Only the known fixture message
// is retained; unrelated notifications and document text never enter evidence.
export function installClipboardToastAudit() {
  const expected = '图片已复制到剪贴板';
  const selector = '[data-testid="app-toast"], [data-testid="app-toast-stack"] [role="status"]';
  window.__clipboardToastHistory = [];
  window.__clipboardToastEvents = [];
  const capture = node => {
    if (!node || node.nodeType !== 1) return;
    const candidates = [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)];
    for (const candidate of candidates) {
      if (!(candidate.textContent || '').includes(expected)) continue;
      if (!window.__clipboardToastHistory.includes(expected)) window.__clipboardToastHistory.push(expected);
      if (window.__clipboardToastEvents.length < 50) window.__clipboardToastEvents.push({ at: performance.now(), attached: candidate.isConnected, visibility: document.visibilityState, focused: document.hasFocus() });
    }
  };
  const observer = new MutationObserver(records => {
    // A toast can be added and removed in one delivery batch. Querying only the
    // final document loses that evidence, so inspect retained mutation nodes too.
    for (const record of records) {
      capture(record.target.nodeType === 1 ? record.target : record.target.parentElement);
      for (const node of [...record.addedNodes, ...record.removedNodes]) capture(node);
    }
    capture(document.body);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

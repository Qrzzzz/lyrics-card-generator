/** Vertical ink bounds, excluding the leading around the first and last lines. */
export function measureTextInkInsets(element: HTMLElement) {
  const box = element.getBoundingClientRect();
  const scale = element.offsetWidth > 0 ? box.width / element.offsetWidth : 1;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return { top: 0, bottom: 0 };
  let top = Infinity;
  let bottom = -Infinity;
  for (const mark of element.querySelectorAll<HTMLElement>("[data-lyric-separator] > span")) {
    const rect = mark.getBoundingClientRect();
    top = Math.min(top, rect.top);
    bottom = Math.max(bottom, rect.bottom);
  }
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent) continue;
    const style = getComputedStyle(parent);
    if (style.display === "none" || style.visibility === "hidden") continue;
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const value = node.textContent ?? "";
    let offset = 0;
    for (const character of value) {
      range.setStart(node, offset);
      offset += character.length;
      range.setEnd(node, offset);
      if (!character.trim()) continue;
      const rect = range.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const metrics = context.measureText(character);
      if (!Number.isFinite(metrics.fontBoundingBoxAscent) || !Number.isFinite(metrics.fontBoundingBoxDescent)) {
        return { top: 0, bottom: 0 };
      }
      const baseline = rect.top + (rect.height - (metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent) * scale) / 2 + metrics.fontBoundingBoxAscent * scale;
      top = Math.min(top, baseline - metrics.actualBoundingBoxAscent * scale);
      bottom = Math.max(bottom, baseline + metrics.actualBoundingBoxDescent * scale);
    }
  }
  if (!Number.isFinite(top) || bottom <= top) return { top: 0, bottom: 0 };
  return { top: Math.max(0, top - box.top) / scale, bottom: Math.max(0, box.bottom - bottom) / scale };
}

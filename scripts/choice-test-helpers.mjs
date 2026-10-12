/** Operate the actual collapsed control rather than clicking a hidden option. */
export async function selectChoiceValue(page, value, root = page) {
  const trigger = root.locator(`.choice-dropdown[data-choice-values~="${value}"]`).getByRole("combobox");
  await trigger.scrollIntoViewIfNeeded();
  await trigger.evaluate((element) => new Promise((resolve, reject) => {
    const started = performance.now();
    let previous = "";
    let stable = 0;
    const sample = () => {
      if (!element.isConnected || performance.now() - started > 5000) {
        reject(new Error("Compact choice did not settle"));
        return;
      }
      const rect = element.getBoundingClientRect();
      const signature = [rect.x, rect.y, rect.width, rect.height].map((number) => number.toFixed(2)).join(":");
      stable = signature === previous ? stable + 1 : 0;
      previous = signature;
      if (stable >= 3) resolve();
      else setTimeout(sample, 80);
    };
    sample();
  }));
  await trigger.click();
  const menu = page.locator(`[role="listbox"][data-choice-menu~="${value}"]`);
  const option = menu.locator(`[data-segment-value="${value}"]`);
  await option.click();
  await menu.waitFor({ state: "hidden" });
  if (await trigger.getAttribute("data-choice-value") !== value) {
    throw new Error(`Compact choice did not select ${value}`);
  }
  return trigger;
}

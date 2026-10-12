/** Operate the actual collapsed control rather than clicking a hidden option. */
export async function selectChoiceValue(page, value, root = page) {
  const trigger = root.locator(`.choice-dropdown[data-choice-values~="${value}"]`).getByRole("combobox");
  await trigger.click();
  const id = await trigger.getAttribute("aria-controls");
  const menu = page.locator(`[id="${id}"]`);
  await menu.locator(`[data-segment-value="${value}"]`).click();
  await menu.waitFor({ state: "hidden" });
  return trigger;
}

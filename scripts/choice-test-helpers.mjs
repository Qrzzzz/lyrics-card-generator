/** Operate the actual collapsed control rather than clicking a hidden option. */
export async function selectChoiceValue(page, value, root = page) {
  const trigger = root.locator(`.choice-dropdown[data-choice-values~="${value}"]`).getByRole("combobox");
  await trigger.click();
  const menu = page.locator(`[role="listbox"][data-choice-menu="${value}"]`);
  await menu.locator(`[data-segment-value="${value}"]`).click();
  await menu.waitFor({ state: "hidden" });
  return trigger;
}

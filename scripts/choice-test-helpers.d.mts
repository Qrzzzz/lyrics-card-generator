import type { Locator, Page } from "@playwright/test";

export function selectChoiceValue(page: Page, value: string, root?: Page | Locator): Promise<Locator>;
export function waitForChoiceToSettle(trigger: Locator): Promise<void>;

import { expect, test, type Page } from "@playwright/test";
import { installDesktopFixture } from "../helpers/desktop-render-fixture";

async function open(page: Page, enabled = true) {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installDesktopFixture(page, { previewMotionEnabled: enabled });
  await page.goto("/");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-preferences-loaded", "true");
  await page.locator('[data-step-id="layout"]').click();
}
async function setMotion(page: Page, enabled: boolean) {
  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-tab-appearance").click();
  const toggle = page.getByTestId("preview-motion-toggle");
  await expect(toggle).toHaveAttribute("aria-checked", String(!enabled));
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", String(enabled));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("lyric-card-generator-app-preferences-v2")!).userSettings.previewMotionEnabled)).toBe(enabled);
  await page.getByTestId("settings-close-button").click();
  await expect(page.getByTestId("settings-surface")).not.toHaveAttribute("data-surface-state", "open");
}
test("preview motion can be disabled during editing without changing card output", async ({ page }) => {
  await open(page);
  const preview = page.getByTestId("lyric-card-preview-pressure");
  await expect(preview).toHaveAttribute("data-pressure-enabled", "true");
  const card = page.locator('[data-export-card-host] [data-export-card="true"]').first();
  const before = await card.evaluate(node => node.outerHTML);
  await preview.hover({ position: { x: 20, y: 20 } });
  const isStill = () => preview.locator(".preview-pressure-card").evaluate(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).isIdentity);
  await expect.poll(isStill).toBe(false);
  await setMotion(page, false);
  await expect(preview).toHaveAttribute("data-pressure-enabled", "false");
  await preview.hover({ position: { x: 40, y: 40 } });
  await expect.poll(isStill).toBe(true);
  expect(await card.evaluate(node => node.outerHTML)).toBe(before);
  await page.locator('[data-step-id="font"]').click();
  await expect(preview).toHaveAttribute("data-pressure-enabled", "false");
  await setMotion(page, true);
  await expect(preview).toHaveAttribute("data-pressure-enabled", "true");
});
test("system and app reduced motion override the independent preview preference", async ({ page }) => {
  await open(page);
  const preview = page.getByTestId("lyric-card-preview-pressure");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(preview).toHaveAttribute("data-pressure-enabled", "false");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(preview).toHaveAttribute("data-pressure-enabled", "true");
  await page.getByTestId("settings-button").click();
  await page.getByRole("switch", { name: /^Reduce motion/ }).click();
  await page.getByTestId("settings-close-button").click();
  await expect(preview).toHaveAttribute("data-pressure-enabled", "false");
});
test("saved disabled preview preference is honored on first open", async ({ page }) => {
  await open(page, false);
  await expect(page.getByTestId("lyric-card-preview-pressure")).toHaveAttribute("data-pressure-enabled", "false");
});

test("reading and layout comparison keep enabled decoration within a small visual envelope", async ({ page }) => {
  await open(page);
  const preview = page.getByTestId("lyric-card-preview-pressure");
  const card = page.locator('[data-export-card-host] [data-export-card="true"]').first();
  const before = await card.evaluate(node => node.outerHTML);
  await preview.hover({ position: { x: 12, y: 12 } });
  const metrics = () => preview.locator(".preview-pressure-card").evaluate(node => {
    const m = new DOMMatrixReadOnly(getComputedStyle(node).transform);
    return { x: Math.abs(m.m41), y: Math.abs(m.m42), z: Math.abs(m.m43), scale: Math.hypot(m.m11,m.m12,m.m13), rotation: Math.max(Math.abs(m.m13),Math.abs(m.m23)) };
  });
  await expect.poll(async () => (await metrics()).z).toBeGreaterThan(5);
  const settled = await metrics();
  expect(settled.x).toBeLessThan(2);
  expect(settled.y).toBeLessThan(2);
  expect(settled.z).toBeLessThan(8);
  expect(settled.scale).toBeLessThan(1.007);
  expect(settled.rotation).toBeLessThan(0.05);
  expect(await preview.locator(".preview-pressure-highlight").evaluate(node => Number(getComputedStyle(node).opacity))).toBeLessThanOrEqual(0.36);
  const canvas = page.getByTestId("click-spark-canvas");
  await expect.poll(() => canvas.evaluate((node: HTMLCanvasElement) => node.getContext("2d")!.getImageData(0,0,node.width,node.height).data.some((value,index)=>index%4===3 && value>0))).toBe(false);
  const box = (await preview.boundingBox())!;
  const point = {x:box.x+box.width/2,y:box.y+box.height/2};
  await canvas.evaluate(node => document.addEventListener("pointerdown", () => { node.dataset.pointerDownAt=String(performance.now()); }, {once:true,capture:true}));
  await page.mouse.click(point.x,point.y);
  const spark = await canvas.evaluate(async (node: HTMLCanvasElement) => {
    const start=Number(node.dataset.pointerDownAt),context=node.getContext("2d")!;
    let visible=false,maxWidth=0,maxHeight=0;
    while(performance.now()-start<650){
      await new Promise(requestAnimationFrame);
      const data=context.getImageData(0,0,node.width,node.height).data;
      let left=node.width,right=0,top=node.height,bottom=0;
      for(let i=3;i<data.length;i+=4)if(data[i]>8){const p=(i-3)/4;left=Math.min(left,p%node.width);right=Math.max(right,p%node.width);top=Math.min(top,Math.floor(p/node.width));bottom=Math.max(bottom,Math.floor(p/node.width));}
      if(left<=right){visible=true;maxWidth=Math.max(maxWidth,right-left);maxHeight=Math.max(maxHeight,bottom-top);}
      else if(visible)return {visible,maxWidth,maxHeight,clearedAfterMs:performance.now()-start};
    }
    return {visible,maxWidth,maxHeight,clearedAfterMs:650};
  });
  expect(spark.visible).toBe(true);
  expect(spark.maxWidth).toBeLessThan(70);
  expect(spark.maxHeight).toBeLessThan(70);
  expect(spark.clearedAfterMs).toBeLessThan(480);
  expect(await card.evaluate(node => node.outerHTML)).toBe(before);
  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-tab-appearance").click();
  await expect(page.getByTestId("click-spark-toggle")).toHaveAttribute("aria-checked","true");
  await expect(page.getByTestId("preview-motion-toggle")).toHaveAttribute("aria-checked","true");
});

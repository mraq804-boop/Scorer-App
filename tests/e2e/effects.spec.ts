import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

function effectStyles(page: Page) {
  return page.evaluate(() => {
    const probe = (className: string) => {
      const element = document.createElement("span");
      element.className = className;
      document.body.append(element);
      const style = getComputedStyle(element);
      const result = { display: style.display, animation: style.animationName };
      element.remove();
      return result;
    };
    return { confetti: probe("confetti-piece"), burst: probe("ball-burst"), pulse: probe("tile-pulse") };
  });
}

test("confetti, bursts and pulses animate when the phone allows motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const styles = await effectStyles(page);
  expect([styles.confetti.animation, styles.burst.animation, styles.pulse.animation]).toEqual([
    "confetti-fall",
    "ball-burst",
    "tile-pulse",
  ]);
  expect(styles.confetti.display).not.toBe("none");
});

test("no effect shows when the phone asks for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  const styles = await effectStyles(page);
  expect([styles.confetti.display, styles.burst.display]).toEqual(["none", "none"]);
  expect(styles.pulse.animation).toBe("none");
});

import { test, expect } from "@playwright/test";

const states = {
  selected: "Keep repository reads bounded",
  loaded: "Select a commit",
  unbound: "Choose a repository",
  loading: "Loading commits…",
  empty: "No commits for this exact path.",
  error: "Couldn't load commits",
  incompatible: "No repository read was sent.",
  partial: "Backend patch is partial:",
  unknown: "Patch completeness is unknown",
  clipped: "Reader display limit:",
  plain: "Structured diff work limit reached.",
  "detail-error": "Unable to read this repository.",
};
for (const theme of ["light", "dark"])
  for (const [state, text] of Object.entries(states)) {
    test(`${theme} ${state}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`/?theme=${theme}&state=${state}`);
      const reader = page.locator("portable-commits-reader");
      await expect(reader).toContainText(text);
      const colors = await reader.evaluate((element) => ({
        background: getComputedStyle(element).backgroundColor,
        foreground: getComputedStyle(element).color,
      }));
      expect(colors.background).toBe(theme === "dark" ? "rgb(21, 23, 22)" : "rgb(255, 255, 255)");
      expect(colors.foreground).toBe(theme === "dark" ? "rgb(236, 239, 237)" : "rgb(32, 35, 34)");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (state === "selected") {
        await expect(reader.locator(".body")).toContainText("<literal text, not markup>");
        await expect(reader.locator(".body literal")).toHaveCount(0);
        const split = reader.getByRole("button", { name: "Split", exact: true });
        await split.click();
        await expect(split).toHaveAttribute("aria-pressed", "true");
        expect(await reader.locator("cw-diff-view").evaluate((element: any) => element.split)).toBe(
          true,
        );
      }
      if (state === "loaded") {
        await reader.locator("ol button").first().click();
        await expect(reader.locator(".commit-title")).toHaveText("Keep repository reads bounded");
        await reader.getByRole("searchbox").fill("no matching commit");
        await expect(reader.locator("ol li")).toHaveCount(0);
      }
      await page.screenshot({ path: info.outputPath(`${theme}-${state}.png`), fullPage: true });
      expect(errors).toEqual([]);
    });
  }

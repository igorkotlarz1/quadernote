// Gate M5: "codziennie aplikacja sama wybiera, co powtórzyć".
// Runs against the server (compose stack in CI). The browser clock is moved forward to play out several days:
// day 1 the new cards are learnt, the next day new ones come, ten days later the app itself brings back the old
// ones, also in airplane mode, and a second device sees the same schedule. Made-up words only.
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

const DAY = 24 * 3600 * 1000;

/** What the user would know by heart: Polish → Italian, and every verb form. */
async function answers(request: APIRequestContext) {
  const state = await (await request.get("/api/state")).json();
  const byPl = new Map<string, string>();
  const forms = new Map<string, Record<string, string>>();
  for (const l of state.lessons) {
    for (const e of l.entries) if (e.it && e.pl && !byPl.has(e.pl.trim())) byPl.set(e.pl.trim(), e.it.trim());
    for (const v of l.verbs) if (v.forms) forms.set(v.it, v.forms);
  }
  return { byPl, forms };
}

async function summary(page: Page) {
  const text = (await page.locator("#review-sum").textContent()) ?? "";
  const m = text.match(/Na dziś: (\d+) \S+ do powtórki i (\d+)/);
  return { text, due: m ? Number(m[1]) : 0, fresh: m ? Number(m[2]) : 0 };
}

/** Go through today's queue, answering every card right, until the app says it is done for today. */
async function reviewAll(page: Page, request: APIRequestContext) {
  const { byPl, forms } = await answers(request);
  await page.locator("#review-start").click();
  let answered = 0;
  for (let i = 0; i < 60; i++) {
    const done = page.locator("#review-done");
    const card = page.locator("#review-card");
    await expect(done.or(card)).toBeVisible();
    if (await done.isVisible()) return answered;
    const id = await card.getAttribute("data-card");
    if (await page.locator("#review-show").isVisible()) {
      await page.locator("#review-show").click();
      await page.locator("#rate-3").click(); // "Dobrze"
    } else {
      const prompt = (await page.locator("#review-prompt").innerText()).split("\n")[0].trim();
      let want = byPl.get(prompt) ?? "";
      if (id?.endsWith(":forms")) {
        const person = ((await page.locator("#review-prompt small").innerText()).split(" ")[0]) as string;
        want = forms.get(prompt)?.[person === "lui" ? "lui" : person] ?? "";
      }
      await page.locator("#review-input").fill(want);
      await page.locator("#review-check").click();
      await expect(page.locator("#review-result")).toHaveText("Dobrze!");
      await page.locator("#review-next").click();
    }
    await expect(card.and(page.locator(`[data-card="${id}"]`))).toHaveCount(0);
    answered++;
  }
  throw new Error("the review did not end");
}

async function device(context: BrowserContext, start: number) {
  await context.clock.install({ time: start });
  const page = await context.newPage();
  await page.goto("/");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect(page.locator("#review-sum")).toBeVisible();
  return page;
}

test("every day the app picks by itself what to review", async ({ browser, request }) => {
  const before = (await (await request.get("/api/reviews")).json()).reviews.length;
  const day1 = Date.now();
  const phone = await browser.newContext({ viewport: { width: 412, height: 860 } });
  const page = await device(phone, day1);

  // Make sure there is enough to learn for two days: four words typed in today's lesson (they sync to the server).
  for (const [it, pl] of [["la mela", "jabłko"], ["il treno", "pociąg"], ["la chiave", "klucz"], ["il ponte", "most"]]) {
    const empty = await page.evaluate(() => {
      const el = [...document.querySelectorAll<HTMLInputElement>("#rows input.it")].find((i) => !i.value);
      el?.focus();
      return !!el;
    });
    if (!empty) { await page.locator("#rows .row").last().locator("input.pl").focus(); await page.keyboard.press("Enter"); }
    await page.keyboard.type(it);
    await page.keyboard.press("Enter");
    await page.keyboard.type(pl);
  }
  await page.keyboard.press("Tab");
  await expect(page.locator("#sync")).toContainText("Zapisane na serwerze", { timeout: 10_000 });

  // A small daily portion, so the test is short: 3 new cards a day.
  await page.locator("#review-settings summary").click();
  await page.locator("#srs-new").fill("3");
  await expect.poll(async () => (await summary(page)).fresh).toBe(3);
  expect((await summary(page)).due).toBe(0);

  // Day 1: learn today's three.
  expect(await reviewAll(page, request)).toBe(3);
  await expect(page.locator("#review-sum")).toContainText("Na dziś wszystko powtórzone");
  await expect.poll(async () => (await (await request.get("/api/reviews")).json()).reviews.length).toBe(before + 3);

  // Day 2: the app offers new cards again; yesterday's ones are not due yet.
  await phone.clock.setSystemTime(day1 + DAY);
  await page.reload();
  await expect.poll(async () => (await summary(page)).fresh).toBe(3);
  expect((await summary(page)).due).toBe(0);

  // Day 11, in airplane mode: the cards learnt on day 1 are back, chosen by the app, without the server.
  await phone.setOffline(true);
  await phone.clock.setSystemTime(day1 + 11 * DAY);
  await page.reload();
  await expect.poll(async () => (await summary(page)).due).toBe(3);
  await phone.close();

  // The laptop (another browser, same server) sees the same schedule: the answers travelled with the sync.
  const laptop = await browser.newContext();
  const page2 = await device(laptop, day1 + 11 * DAY);
  await expect.poll(async () => (await summary(page2)).due, { timeout: 10_000 }).toBe(3);
  await laptop.close();
});

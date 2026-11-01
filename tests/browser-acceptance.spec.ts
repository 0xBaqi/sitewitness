import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Saved } from "../lib/inspection";

const marker = "SYNTHETIC TEST DATA";
const reports: Saved[] = ["A", "B"].map((letter, index) => ({
  id: `synthetic-${letter}`,
  provenance: {kind:"legacy_unknown"},
  date: `2026-10-${30 - index}T10:00:00.000Z`,
  question: `${marker}: storage acceptance only`,
  filename: `${marker}-${letter}.png`,
  report: {
    overview: `${marker}: report ${letter}; no Meta inference occurred.`,
    findings: [1, 2].map((n) => ({
      id: `fixture-${n}`,
      category: "observation" as const,
      title: `${marker} ${letter}${n}`,
      description: `${marker}: observation ${letter}${n}`,
      evidence: `${marker}: generated colored canvas, not construction evidence.`,
      limitation: "No engineering conclusions or SAM annotations.",
    })),
    unanswered_questions: [`${marker}: no inference was requested.`],
    notice: `${marker}. Browser testing only. No Meta inference occurred.`,
  },
  reviews: {},
  edits: {},
  notes: {},
}));

async function seed(page: Page, photos = true) {
  // A fresh ephemeral browser context per test. Seed directly in the test runner;
  // no app endpoint, source flag, production import, or mocked inference response.
  await page.goto("/");
  await page.evaluate(
    async ({ records, photos }) => {
      localStorage.setItem(
        "sitewitness-inspections-v1",
        JSON.stringify(records),
      );
      if (!photos) return;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("sitewitness-photographs", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("photos");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      for (const [index, record] of records.entries()) {
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 120;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = index ? "#224488" : "#882244";
        ctx.fillRect(0, 0, 400, 120);
        ctx.fillStyle = "#ffffff";
        ctx.font = "18px sans-serif";
        ctx.fillText("SYNTHETIC TEST DATA", 12, 45);
        ctx.fillText(record.id, 12, 80);
        const blob = await new Promise<Blob>((resolve) =>
          canvas.toBlob((b) => resolve(b!), "image/png"),
        );
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("photos", "readwrite");
          tx.objectStore("photos").put(blob, record.id);
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
        });
      }
      db.close();
    },
    { records: reports, photos },
  );
  await page.reload();
}

async function imageMatchesDatabase(page: Page, id: string) {
  const image = page.getByRole("img", {
    name: `Inspection photograph: ${marker}-${id}.png`,
    exact: true,
  });
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth === 400,
      ),
    )
    .toBe(true);
  expect(
    await image.evaluate(async (img: HTMLImageElement, recordId) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("sitewitness-photographs", 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const saved = await new Promise<Blob>((resolve, reject) => {
        const req = db
          .transaction("photos")
          .objectStore("photos")
          .get(recordId);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      db.close();
      const original = new Uint8Array(await saved.arrayBuffer());
      const shown = new Uint8Array(await (await fetch(img.src)).arrayBuffer());
      return (
        original.length === shown.length &&
        original.every((v, i) => v === shown[i])
      );
    }, `synthetic-${id}`),
  ).toBe(true);
}

test.beforeEach(async ({ context }) => {
  // Defense in depth: never allow an analysis POST or any external network request.
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.pathname === "/api/analyze" ||
      !["127.0.0.1", "localhost"].includes(url.hostname)
    ) {
      await route.abort();
      return;
    }
    await route.continue();
  });
});

test("SYNTHETIC TEST DATA: IndexedDB restoration, reviews, switching and JSON export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await seed(page);
  await expect(
    page.getByText(reports[0].report.overview, { exact: true }),
  ).toBeVisible();
  await imageMatchesDatabase(page, "A");
  await page
    .getByRole("button", { name: `02 / ${marker} A2`, exact: true })
    .click();
  await expect(page.getByLabel("Reviewed observation")).toHaveValue(
    reports[0].report.findings[1].description,
  );
  await page.getByLabel("Reviewed observation").fill(`${marker}: edited A2`);
  await page.getByLabel("Reviewer notes").fill(`${marker}: notes A2`);
  await page.getByLabel("Reviewer decision").selectOption("investigate");
  await page
    .getByRole("button", { name: `01 / ${marker} A1`, exact: true })
    .click();
  await page.getByLabel("Reviewer decision").selectOption("accepted");
  await page
    .getByLabel("Reviewer notes")
    .pressSequentially("SYNTHETIC TEST DATA: rapid edits");
  await page
    .getByRole("button")
    .filter({ hasText: `${marker}-B.png` })
    .click();
  await imageMatchesDatabase(page, "B");
  await expect(page.getByLabel("Reviewer notes")).toHaveValue("");
  await expect(page.getByLabel("Reviewer decision")).toHaveValue("unreviewed");
  await page.getByLabel("Reviewer decision").selectOption("rejected");
  await page.getByLabel("Reviewer notes").fill(`${marker}: notes B1`);
  await page.getByLabel("Reviewed observation").fill(`${marker}: edited B1`);
  await page.reload();
  await imageMatchesDatabase(page, "A");
  await expect(page.getByLabel("Reviewer decision")).toHaveValue("accepted");
  await expect(page.getByLabel("Reviewer notes")).toHaveValue(
    "SYNTHETIC TEST DATA: rapid edits",
  );
  await page
    .getByRole("button", { name: `02 / ${marker} A2`, exact: true })
    .click();
  await expect(page.getByLabel("Reviewer decision")).toHaveValue("investigate");
  await expect(page.getByLabel("Reviewer notes")).toHaveValue(
    `${marker}: notes A2`,
  );
  await expect(page.getByLabel("Reviewed observation")).toHaveValue(
    `${marker}: edited A2`,
  );
  for (const letter of ["B", "A", "B"]) {
    await page
      .getByRole("button")
      .filter({ hasText: `${marker}-${letter}.png` })
      .click();
    await imageMatchesDatabase(page, letter);
  }
  await expect(page.getByLabel("Reviewer decision")).toHaveValue("rejected");
  await expect(page.getByLabel("Reviewer notes")).toHaveValue(
    `${marker}: notes B1`,
  );
  await expect(page.getByLabel("Reviewed observation")).toHaveValue(
    `${marker}: edited B1`,
  );
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export JSON ↓", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("sitewitness-syntheti.json");
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(exported).toEqual({
    ...reports[1],
    reviews: { "fixture-1": "rejected" },
    edits: { "fixture-1": `${marker}: edited B1` },
    notes: { "fixture-1": `${marker}: notes B1` },
  });
  expect(Object.keys(exported).sort()).toEqual(Object.keys(reports[1]).sort());
  await page.screenshot({
    path: "test-results/synthetic-review.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("SYNTHETIC TEST DATA: missing photograph does not prevent report review", async ({
  page,
}) => {
  await seed(page, false);
  await expect(
    page.getByText("No retained photograph is available for this inspection.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Reviewer notes")
    .fill(`${marker}: missing image review`);
  await page.reload();
  await expect(page.getByLabel("Reviewer notes")).toHaveValue(
    `${marker}: missing image review`,
  );
});

test("SYNTHETIC TEST DATA: mobile layout, keyboard controls and corrupt history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const choice = page.getByRole("button", {
    name: `02 / ${marker} A2`,
    exact: true,
  });
  await choice.focus();
  await page.keyboard.press("Enter");
  await expect(choice).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Reviewed observation")).toBeVisible();
  await page.screenshot({
    path: "test-results/synthetic-mobile.png",
    fullPage: true,
  });
  await page.evaluate(() =>
    localStorage.setItem(
      "sitewitness-inspections-v1",
      JSON.stringify([
        { id: "broken", report: { findings: [null] }, reviews: {} },
      ]),
    ),
  );
  await page.reload();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "invalid",
  );
  await expect(
    page.getByRole("heading", { name: "Awaiting an inspection" }),
  ).toBeVisible();
});

test("AI unavailable state offers manual creation without sending an analysis request", async ({page}) => {
  let analysisRequests=0;
  page.on("request",req=>{if(new URL(req.url()).pathname==="/api/analyze")analysisRequests++;});
  await page.goto("/");
  await expect(page.getByText("AI analysis is unavailable.",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"New manual inspection"})).toBeEnabled();
  await page.getByRole("button",{name:"New manual inspection"}).click();
  await expect(page.getByLabel("Inspection title",{exact:true})).toBeFocused();
  expect(analysisRequests).toBe(0);
});

test("preview server keeps inference and server persistence disabled", async ({ request }) => {
  // Local production server only; no photograph, key, or model request.
  for (const path of ["/api/analyze", "/api/inspections"]) {
    const response = await request.post(path, {data: {}});
    expect(response.status()).toBe(503);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect((await response.json()).error).toContain("disabled");
  }
});

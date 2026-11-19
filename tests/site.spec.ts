import { test, expect } from "@playwright/test";

test("landing page explains the product and links to the workspace", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Traceable evidence out");
  await expect(page.getByRole("heading", { name: "One inspection, five steps" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What SiteWitness is — and is not" })).toBeVisible();
  await page.getByRole("link", { name: "Start an inspection" }).click();
  await expect(page).toHaveURL(/\/inspect$/);
  await expect(page.getByRole("button", { name: "New inspection" })).toBeVisible();
});

test("contact form submits and shows confirmation", async ({ page }) => {
  await page.route("**/api/contact", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }));
  await page.goto("/contact");
  await page.getByLabel("Your name").fill("Ada");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Message").fill("This is a test message for the form.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("status")).toContainText("Message sent");
});

test("contact form surfaces server errors and keeps direct links visible", async ({ page }) => {
  await page.route("**/api/contact", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"The contact form is not available right now. Please use the direct links instead."}' }));
  await page.goto("/contact");
  await page.getByLabel("Your name").fill("Ada");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Message").fill("This is a test message for the form.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator("p.error")).toContainText("not available");
  await expect(page.locator(".contact-links").getByRole("link", { name: "@0xBaqi" })).toBeVisible();
});

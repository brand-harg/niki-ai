import { expect, test, type Page } from "@playwright/test";

async function openFreshHome(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.goto("/");
  await expect(page.getByTestId("niki-home")).toBeVisible();
  await expect(page.getByTestId("chat-input")).toBeVisible();
}

test.describe("NIKIAI home smoke", () => {
  test("home loads and shows the empty-state guidance", async ({ page }) => {
    await openFreshHome(page);

    await expect(page.getByRole("heading", { name: /NikiAi/i })).toBeVisible();
    await expect(page.getByTestId("chat-empty-state")).toBeVisible();
    await expect(page.getByText(/Ask a question, or choose a course first/i)).toBeVisible();
  });

  test("user can type and toggle chat modes without sending", async ({ page }) => {
    await openFreshHome(page);

    const chatInput = page.getByTestId("chat-input");
    await chatInput.fill("Explain limits step by step");
    await expect(chatInput).toHaveValue("Explain limits step by step");

    await page.getByTestId("mode-nemanja").click();
    await expect(chatInput).toHaveAttribute("placeholder", /Nemanja Mode/i);

    await page.getByTestId("mode-pure-logic").click();
    await expect(chatInput).toHaveAttribute("placeholder", /math, code, or technical/i);
    await expect(chatInput).toHaveValue("Explain limits step by step");
  });

  test("logged-out protected knowledge-base upload shows a login prompt", async ({ page }) => {
    await openFreshHome(page);

    await page.getByRole("button", { name: "Knowledge Base" }).click();
    await page.getByRole("button", { name: /Log in to upload a course file/i }).click();

    await expect(page.getByRole("dialog", { name: /Login required/i })).toBeVisible();
    await expect(page.getByText(/Log in to save your study progress/i)).toBeVisible();
  });

  test("attachment menu exposes upload safely while logged out", async ({ page }) => {
    await openFreshHome(page);

    await page.getByTestId("attachment-menu-button").click();
    await expect(page.getByText("Attach & Tools")).toBeVisible();
    await expect(page.getByRole("button", { name: /Upload File/i })).toBeVisible();
    await expect(page.getByTestId("chat-file-input")).toHaveCount(1);
  });

  test("mobile viewport keeps controls compact and composer usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFreshHome(page);

    await expect(page.getByTestId("mobile-study-controls-toggle")).toBeVisible();
    await expect(page.getByTestId("chat-composer")).toBeVisible();

    const chatInput = page.getByTestId("chat-input");
    await chatInput.fill("practice problems");
    await expect(chatInput).toHaveValue("practice problems");

    await page.getByTestId("mobile-study-controls-toggle").click();
    await expect(page.getByTestId("mobile-mode-nemanja")).toBeVisible();
  });

  test("settings artifact entry point is safely gated when logged out", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.goto("/settings");

    await page.getByRole("button", { name: /Open Artifact Panel/i }).click();
    await expect(page.getByText(/Log in to access your artifacts/i)).toBeVisible();
  });
});

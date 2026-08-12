import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const artifact = path.resolve("dist/rocket-chat-markdown-plus.user.js");

async function mountFixture(page: Page, language = "en") {
  await page.setContent(`
    <!doctype html>
    <html lang="${language}">
      <body>
        <main id="app">
          <footer class="rc-message-box" aria-label="Room composer" style="position: relative">
            <div role="group" style="position: relative; z-index: 2; overflow: hidden; background: white">
              <textarea class="rc-message-box__textarea js-input-message" name="msg" aria-label="Message"></textarea>
              <div>
                <div class="rcx-button-group" role="toolbar" aria-label="Composer Primary Actions" style="position: relative; z-index: 1">
                  <button type="button" title="Emoji">Emoji</button>
                </div>
                <button id="send" type="button" aria-label="Send">Send</button>
              </div>
            </div>
          </footer>
        </main>
      </body>
    </html>
  `);
  await page.evaluate(() => {
    const state = { sent: [] as unknown[], rest: [] as unknown[] };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: (key: string) => (key === "Meteor.loginToken" ? "fixture-token" : null) },
    });
    Object.assign(window, {
      __fixtureState: state,
      Meteor: {
        userId: () => "fixture-user",
        connection: {
          applyAsync(method: string, args: unknown[]) {
            state.sent.push({ method, args });
            return Promise.resolve({ ok: true });
          },
        },
      },
      fetch(input: RequestInfo | URL, init?: RequestInit) {
        state.rest.push({
          url: String(input),
          method: init?.method,
          headers: init?.headers,
          body: JSON.parse(String(init?.body)),
        });
        return Promise.resolve(
          new Response('{"success":true}', {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      },
    });
    document
      .querySelector('footer[aria-label="Room composer"]')
      ?.addEventListener("click", (event) => {
        if (
          !(event.target instanceof Element) ||
          !event.target.closest('button[aria-label="Send"]')
        )
          return;
        const input = document.querySelector("textarea");
        void (
          window as typeof window & {
            Meteor: {
              connection: { applyAsync: (method: string, args: unknown[]) => Promise<unknown> };
            };
          }
        ).Meteor.connection.applyAsync("sendMessage", [
          { _id: "m1", rid: "r1", tmid: "thread1", msg: input?.value ?? "" },
        ]);
      });
  });
  await page.addScriptTag({ path: artifact });
  await expect(page.getByRole("button", { name: "Insert a callout block" })).toBeVisible();
}

test("stays passive on a non-Rocket.Chat page", async ({ page }) => {
  await page.setContent("<html><body><main>Ordinary HTTPS page</main></body></html>");
  await page.evaluate(() => {
    let reads = 0;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem() {
          reads += 1;
          return "should-not-be-read";
        },
      },
    });
    Object.assign(window, {
      __fixtureState: { reads },
      fetch: () => {
        throw new Error("The universal guard should not make requests.");
      },
    });
    Object.defineProperty(window, "__getStorageReads", {
      configurable: true,
      value: () => reads,
    });
  });
  await page.addScriptTag({ path: artifact });
  await page.waitForTimeout(700);
  await expect(page.getByRole("button", { name: "Insert a callout block" })).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      (window as typeof window & { __getStorageReads: () => number }).__getStorageReads(),
    ),
  ).toBe(0);
});

test("inserts the selected template at the caret and selects its placeholder", async ({ page }) => {
  await mountFixture(page);
  const input = page.getByLabel("Message");
  await input.fill("Before ");
  await input.evaluate((element: HTMLTextAreaElement) =>
    element.setSelectionRange(element.value.length, element.value.length),
  );
  await page.getByRole("button", { name: "Insert a callout block" }).click();
  await page.getByRole("button", { name: "Information" }).click();
  await expect(input).toHaveValue("Before ");
  await page.getByRole("button", { name: "Insert", exact: true }).click();

  await expect(input).toHaveValue(
    "Before :::info\ntitle=ℹ Information\ncolor=#3498db\n\nBlock text\n:::",
  );
  expect(
    await input.evaluate((element: HTMLTextAreaElement) =>
      element.value.slice(element.selectionStart, element.selectionEnd),
    ),
  ).toBe("Block text");
});

test("supports keyboard use in the preset form", async ({ page }) => {
  await mountFixture(page);
  const trigger = page.getByRole("button", { name: "Insert a callout block" });
  await trigger.focus();
  await trigger.press("Enter");
  await page.getByRole("button", { name: "Warning" }).press("Enter");
  await page.getByRole("button", { name: "Insert", exact: true }).press("Enter");
  await expect(page.getByLabel("Message")).toHaveValue(
    ":::warning\ntitle=⚠ Warning\ncolor=#ff8800\n\nBlock text\n:::",
  );
});

test("fills every preset without inserting before confirmation", async ({ page }) => {
  await mountFixture(page);
  const input = page.getByLabel("Message");
  await page.getByRole("button", { name: "Insert a callout block" }).click();
  for (const [name, title, color] of [
    ["Warning", "⚠ Warning", "#ff8800"],
    ["Information", "ℹ Information", "#3498db"],
    ["Success", "✅ Success", "#27ae60"],
    ["Error", "❌ Error", "#e74c3c"],
    ["Note", "📝 Note", "#9b59b6"],
  ] as const) {
    await page.getByRole("button", { name }).click();
    await expect(page.getByLabel("Title")).toHaveValue(title);
    await expect(page.getByLabel("Color HEX")).toHaveValue(color);
    await expect(input).toHaveValue("");
  }
});

test("mounts in the composer toolbar without clipping the preset form", async ({ page }) => {
  await mountFixture(page);
  const trigger = page.getByRole("button", { name: "Insert a callout block" });
  expect(
    await trigger.evaluate((button) => {
      const root = button.getRootNode();
      return root instanceof ShadowRoot ? root.host.parentElement?.ariaLabel : null;
    }),
  ).toBe("Composer Primary Actions");
  await trigger.click();
  const presets = page.getByRole("group", { name: "Preset styles" }).getByRole("button");
  await expect(presets).toHaveCount(5);
  for (const item of await presets.all()) {
    await expect(item).toBeInViewport();
  }
  const firstItem = presets.first();
  expect(
    await firstItem.evaluate((item) => {
      const rect = item.getBoundingClientRect();
      return (
        (
          document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          ) as HTMLElement
        )?.dataset.rcmpPopup !== undefined
      );
    }),
  ).toBe(true);
});

test("inserts a custom block with optional metadata", async ({ page }) => {
  await mountFixture(page);
  const input = page.getByLabel("Message");
  await input.fill("Before ");
  await input.evaluate((element: HTMLTextAreaElement) =>
    element.setSelectionRange(element.value.length, element.value.length),
  );
  await page.getByRole("button", { name: "Insert a callout block" }).click();
  await page.getByRole("button", { name: "Error" }).click();
  await page.getByLabel("Title").fill("Deploy");
  await page.getByLabel("Color picker").evaluate((element: HTMLInputElement) => {
    element.value = "#123456";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.getByLabel("Color HEX")).toHaveValue("#123456");
  await page.getByLabel("Color HEX").fill("#0af");
  await page.getByText("Additional options").click();
  await page.getByLabel("Thumbnail (HTTPS URL)").fill("https://example.com/thumb.png");
  await page.getByLabel("Image (HTTPS URL)").fill("https://example.com/image.png");
  await page.getByRole("button", { name: "Insert", exact: true }).click();

  await expect(input).toHaveValue(
    "Before :::error\ntitle=Deploy\ncolor=#0af\nthumb=https://example.com/thumb.png\nimage=https://example.com/image.png\n\nBlock text\n:::",
  );
  expect(
    await input.evaluate((element: HTMLTextAreaElement) =>
      element.value.slice(element.selectionStart, element.selectionEnd),
    ),
  ).toBe("Block text");
});

test("keeps image and collapsed media mutually exclusive", async ({ page }) => {
  await mountFixture(page);
  const input = page.getByLabel("Message");
  await page.getByRole("button", { name: "Insert a callout block" }).click();
  await page.getByText("Additional options").click();

  const image = page.getByLabel("Image (HTTPS URL)");
  const collapsed = page.getByLabel("Collapse media");
  await image.fill("https://example.com/image.png");
  await expect(collapsed).toBeDisabled();
  await image.fill("");
  await expect(collapsed).toBeEnabled();
  await collapsed.check();
  await expect(image).toBeDisabled();
  await collapsed.uncheck();
  await expect(image).toBeEnabled();
  await collapsed.check();
  await page.getByRole("button", { name: "Insert", exact: true }).click();

  await expect(input).toHaveValue(
    ":::note\ntitle=📝 Note\ncolor=#9b59b6\ncollapsed=true\n\nBlock text\n:::",
  );
});

test("validates the custom block form without losing its draft", async ({ page }) => {
  await mountFixture(page);
  await page.getByRole("button", { name: "Insert a callout block" }).click();
  await page.getByLabel("Title").fill("");
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await expect(page.getByText("Enter a title.", { exact: true })).toBeVisible();
  await page.getByLabel("Title").fill("Deploy");
  await page.getByText("Additional options").click();
  await page.getByLabel("Image (HTTPS URL)").fill("http://example.com/image.png");
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await expect(page.getByText("Enter an absolute HTTPS URL.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("Deploy");
  await expect(page.getByLabel("Image (HTTPS URL)")).toHaveValue("http://example.com/image.png");
});

test("resets the form to the note preset when reopened", async ({ page }) => {
  await mountFixture(page);
  const trigger = page.getByRole("button", { name: "Insert a callout block" });
  await trigger.click();
  await page.getByRole("button", { name: "Warning" }).click();
  await page.getByLabel("Title").fill("Changed");
  await trigger.click();
  await trigger.click();
  await expect(page.getByRole("button", { name: "Note" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Title")).toHaveValue("📝 Note");
  await expect(page.getByLabel("Color HEX")).toHaveValue("#9b59b6");
});

test("marks manual edits and keeps additional fields when presets change", async ({ page }) => {
  await mountFixture(page);
  await page.getByRole("button", { name: "Insert a callout block" }).click();
  await page.getByText("Additional options").click();
  await page.getByRole("button", { name: "Warning" }).click();
  await page.getByLabel("Title").fill("Custom warning");
  await expect(page.getByText("Warning · modified", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Warning" }).click();
  await expect(page.getByLabel("Title")).toHaveValue("⚠ Warning");
  await expect(page.locator(".preset-state")).toHaveText("Warning");
});

test("keeps the custom form scrollable and keyboard focus inside the popup", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 360 });
  await mountFixture(page);
  await page.getByRole("button", { name: "Insert a callout block" }).click();
  await page.getByText("Additional options").click();

  expect(
    await page.getByRole("heading", { name: "Message style" }).evaluate((heading) => {
      const panel = heading.closest("form");
      return panel
        ? {
            scrollable: panel.scrollHeight > panel.clientHeight,
            overflowY: getComputedStyle(panel).overflowY,
            top: panel.getBoundingClientRect().top,
            bottom: panel.getBoundingClientRect().bottom,
            viewportHeight: window.innerHeight,
          }
        : null;
    }),
  ).toMatchObject({ scrollable: true, overflowY: "auto" });
  await expect
    .poll(() =>
      page.getByRole("heading", { name: "Message style" }).evaluate((heading) => {
        const rect = heading.closest("form")?.getBoundingClientRect();
        return Boolean(rect && rect.top >= 0 && rect.bottom <= window.innerHeight);
      }),
    )
    .toBe(true);

  const image = page.getByLabel("Image (HTTPS URL)");
  await image.hover();
  await page.mouse.wheel(0, 300);
  expect(
    await page
      .getByRole("heading", { name: "Message style" })
      .evaluate((heading) => (heading.closest("form") as HTMLElement).scrollTop),
  ).toBeGreaterThan(0);
  await image.focus();
  await image.evaluate((element) => {
    element.addEventListener(
      "keydown",
      () => document.querySelector<HTMLTextAreaElement>("textarea")?.focus(),
      { once: true },
    );
  });
  await image.press("x");
  await expect(image).toBeFocused();
  const submit = page.getByRole("button", { name: "Insert", exact: true });
  await submit.focus();
  await submit.press("Tab");
  await expect(page.getByRole("button", { name: "Warning" })).toBeFocused();
});

test("inserts into a contenteditable composer", async ({ page }) => {
  await page.setContent(`
    <html lang="en"><body><form>
      <div style="overflow: hidden">
        <div contenteditable="true" role="textbox" data-qa-id="message-composer-input" aria-label="Message"></div>
      </div>
      <div role="toolbar" aria-label="Composer Primary Actions"></div>
      <button>Send</button>
    </form></body></html>
  `);
  await page.evaluate(() => {
    Object.assign(window, {
      Meteor: { connection: { applyAsync: () => Promise.resolve({ ok: true }) } },
    });
  });
  await page.addScriptTag({ path: artifact });
  const composer = page.getByLabel("Message");
  await composer.focus();
  await page.getByRole("button", { name: "Insert a callout block" }).click();
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await expect(composer).toHaveText(":::note\ntitle=📝 Note\ncolor=#9b59b6\n\nBlock text\n:::");
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("Block text");
});

test("blocks invalid markup and preserves the draft", async ({ page }) => {
  await mountFixture(page);
  const input = page.getByLabel("Message");
  const draft = ":::unknown\nBody\n:::";
  await input.fill(draft);
  await input.press("Enter");
  await expect(input).toHaveValue(draft);
  await expect(page.getByRole("status")).toContainText("Line 1: Unknown block type");
  expect(
    await page.evaluate(
      () => (window as never as { __fixtureState: { sent: unknown[] } }).__fixtureState.sent,
    ),
  ).toHaveLength(0);
});

test("sends mixed text and attachments while preserving thread metadata", async ({ page }) => {
  await mountFixture(page);
  await page.getByLabel("Message").fill("Intro\n\n:::success\ntitle=Ready\n\n**Done**\n:::");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const sent = await page.evaluate(
    () => (window as never as { __fixtureState: { rest: unknown[] } }).__fixtureState.rest,
  );
  expect(sent).toEqual([
    {
      url: "/api/v1/chat.sendMessage",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": "fixture-token",
        "X-User-Id": "fixture-user",
      },
      body: {
        message: {
          _id: "m1",
          rid: "r1",
          tmid: "thread1",
          msg: "Intro",
          attachments: [{ color: "#27ae60", title: "Ready", text: "**Done**" }],
        },
      },
    },
  ]);
});

test("sends a simple warning block through REST", async ({ page }) => {
  await mountFixture(page);
  await page.getByLabel("Message").fill(":::warning\nBody\n:::");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const state = await page.evaluate(
    () =>
      (window as never as { __fixtureState: { sent: unknown[]; rest: unknown[] } }).__fixtureState,
  );
  expect(state.sent).toHaveLength(0);
  expect(state.rest).toHaveLength(1);
  expect(state.rest[0]).toMatchObject({
    url: "/api/v1/chat.sendMessage",
    body: {
      message: {
        rid: "r1",
        msg: "",
        attachments: [{ color: "#ff8800", title: "⚠ Warning", text: "Body" }],
      },
    },
  });
});

test("reinjects once when the SPA remounts the composer", async ({ page }) => {
  await mountFixture(page);
  await page.evaluate(() => {
    const composer = document.querySelector('footer[aria-label="Room composer"]');
    composer?.remove();
    document
      .querySelector("#app")
      ?.insertAdjacentHTML(
        "beforeend",
        '<footer class="rc-message-box" aria-label="Room composer"><div role="group"><textarea name="msg" aria-label="New message"></textarea><div role="toolbar" aria-label="Composer Primary Actions"></div><button type="button" aria-label="Send">Send</button></div></footer>',
      );
  });
  await expect(page.getByRole("button", { name: "Insert a callout block" })).toHaveCount(1);
  await expect(page.getByLabel("New message")).toBeVisible();
});

test("adapts its form colors to the browser theme", async ({ page }) => {
  await mountFixture(page);
  const trigger = page.getByRole("button", { name: "Insert a callout block" });
  await trigger.click();
  const form = page.getByRole("dialog", { name: "Callout style form" });
  const light = await form.evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.emulateMedia({ colorScheme: "dark" });
  const dark = await form.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(light).not.toBe(dark);
});

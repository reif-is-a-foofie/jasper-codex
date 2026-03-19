import test from "node:test";
import assert from "node:assert/strict";
import {
  browserPlanSteps,
  createBrowserAutomation,
  describeBrowserAction,
  isBrowserPlanContext,
} from "./browser.js";

test("describes browser actions for milestone plans", () => {
  assert.equal(
    describeBrowserAction({
      type: "fill",
      label: "Email address",
    }),
    "Fill label:Email address",
  );
  assert.equal(
    describeBrowserAction({
      type: "click",
      text: "Subscribe",
    }),
    "Click text:Subscribe",
  );
});

test("detects browser plan contexts and derives step text", () => {
  const context = {
    kind: "browser",
    browser: "chrome",
    actions: [
      {
        type: "open",
        url: "https://example.com",
      },
      {
        type: "fill",
        label: "Email",
        value: "news@thegoodproject.net",
      },
    ],
  };

  assert.equal(isBrowserPlanContext(context), true);
  assert.deepEqual(browserPlanSteps(context), [
    "Open https://example.com",
    "Fill label:Email",
  ]);
});

test("runs browser plans through the injected session adapter", async () => {
  const screenshots = [];
  const automation = createBrowserAutomation({
    async launchSession(plan) {
      assert.equal(plan.browser, "chrome");
      return {
        browser: "chrome",
        closeOnExit: true,
        debugPort: 9333,
        userDataDir: "/tmp/jasper-browser-profile-test",
        downloadDir: "/tmp/jasper-browser-downloads-test",
        async navigate(url) {
          return {
            url,
            title: "Browser Smoke",
          };
        },
        async waitForSelector(selector) {
          return selector;
        },
        async fill(action) {
          return {
            field: action.label || action.selector,
            value: action.value,
          };
        },
        async click(action) {
          return {
            clicked: action.text || action.selector,
          };
        },
        async select(action) {
          return {
            selected: action.value,
          };
        },
        async read() {
          return {
            text: "Subscription confirmed",
          };
        },
        async evaluate(expression) {
          return {
            evaluated: expression,
          };
        },
        async snapshot() {
          return {
            url: "https://example.com/success",
            title: "Done",
          };
        },
        async screenshot(filePath) {
          screenshots.push(filePath);
          return filePath;
        },
        async waitForDownload() {
          return {
            suggestedFilename: "statement.pdf",
            state: "completed",
          };
        },
        async waitForLoad() {
          return true;
        },
        async close() {
          return true;
        },
      };
    },
  });

  const result = await automation.runPlan({
    kind: "browser",
    browser: "chrome",
    headless: true,
    closeOnExit: true,
    downloadDir: "/tmp/jasper-browser-downloads-test",
    actions: [
      {
        type: "open",
        url: "https://example.com/newsletter",
      },
      {
        type: "fill",
        label: "Email",
        value: "news@thegoodproject.net",
      },
      {
        type: "click",
        text: "Subscribe",
        waitForDownload: true,
      },
      {
        type: "screenshot",
        path: "/tmp/jasper-browser-shot.png",
      },
      {
        type: "read",
        selector: "main",
      },
    ],
  });

  assert.equal(result.status, "completed");
  assert.equal(result.actions.length, 5);
  assert.equal(
    result.actions[2].result.download.suggestedFilename,
    "statement.pdf",
  );
  assert.equal(screenshots[0], "/tmp/jasper-browser-shot.png");
  assert.deepEqual(result.finalSnapshot, {
    url: "https://example.com/success",
    title: "Done",
  });
});

test("reports browser action failures without hiding earlier progress", async () => {
  const automation = createBrowserAutomation({
    async launchSession() {
      return {
        browser: "chrome",
        closeOnExit: true,
        async navigate(url) {
          return {
            url,
            title: "Start",
          };
        },
        async snapshot() {
          return {
            url: "https://example.com",
            title: "Start",
          };
        },
        async click() {
          throw new Error("Could not click text:Join");
        },
        async close() {
          return true;
        },
      };
    },
  });

  const result = await automation.runPlan({
    kind: "browser",
    browser: "chrome",
    actions: [
      {
        type: "open",
        url: "https://example.com",
      },
      {
        type: "click",
        text: "Join",
      },
    ],
  });

  assert.equal(result.status, "failed");
  assert.equal(result.actions[0].status, "completed");
  assert.equal(result.actions[1].status, "failed");
  assert.match(result.failure, /Could not click text:Join/);
});

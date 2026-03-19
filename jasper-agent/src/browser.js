import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_WAIT_MS = 1_000;
const DEFAULT_POLL_MS = 150;

function normalizeTimeout(value, fallback = DEFAULT_TIMEOUT_MS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

function normalizeWait(value, fallback = DEFAULT_WAIT_MS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function normalizeBrowser(value) {
  const normalized = String(value || "chrome")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return "chrome";
  }
  if (["chrome", "google-chrome", "chromium"].includes(normalized)) {
    return "chrome";
  }
  throw new Error(
    `Unsupported browser '${value}'. Jasper browser mode currently supports Chrome via the local DevTools protocol.`,
  );
}

function resolveChromeExecutable(configuredPath) {
  const candidates = [
    configuredPath,
    process.env.JASPER_CHROME_BIN,
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "Could not find a local Chrome binary. Set JASPER_CHROME_BIN to the Chrome executable path.",
  );
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Invalid JSON for ${label}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function ensureObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function ensureArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
}

function describeCriteria(action) {
  if (action.selector) {
    return action.selector;
  }
  if (action.label) {
    return `label:${action.label}`;
  }
  if (action.text) {
    return `text:${action.text}`;
  }
  return null;
}

export function describeBrowserAction(action = {}) {
  const type = String(action.type || "")
    .trim()
    .toLowerCase();

  if (type === "open" || type === "navigate") {
    return `Open ${action.url || "browser target"}`;
  }

  if (type === "wait") {
    return `Wait ${normalizeWait(action.ms, DEFAULT_WAIT_MS)}ms`;
  }

  if (type === "wait-for-selector") {
    return `Wait for ${action.selector || "selector"}`;
  }

  if (type === "fill") {
    return `Fill ${describeCriteria(action) || "field"}`;
  }

  if (type === "click") {
    return `Click ${describeCriteria(action) || "target"}`;
  }

  if (type === "select") {
    return `Select ${action.value || "value"} in ${describeCriteria(action) || "field"}`;
  }

  if (type === "read") {
    return `Read ${describeCriteria(action) || "page content"}`;
  }

  if (type === "snapshot") {
    return "Capture page snapshot";
  }

  if (type === "screenshot") {
    return `Capture screenshot${action.path ? ` (${action.path})` : ""}`;
  }

  if (type === "evaluate") {
    return "Evaluate browser script";
  }

  return `Run browser action ${type || "unknown"}`;
}

export function isBrowserPlanContext(context) {
  return Boolean(
    context &&
      typeof context === "object" &&
      !Array.isArray(context) &&
      Array.isArray(context.actions) &&
      (context.kind === "browser" ||
        context.executor === "browser" ||
        context.mode === "browser" ||
        context.browser),
  );
}

export function browserPlanSteps(context) {
  const actions = Array.isArray(context?.actions) ? context.actions : [];
  return actions.map((action) => describeBrowserAction(action));
}

function normalizeBrowserPlan(plan = {}) {
  const normalized = ensureObject(plan, "Browser plan");
  const actions = ensureArray(normalized.actions, "Browser plan actions").map(
    (action, index) => {
      const item = ensureObject(action, `Browser action ${index + 1}`);
      const type = String(item.type || "")
        .trim()
        .toLowerCase();
      if (!type) {
        throw new Error(`Browser action ${index + 1} is missing a type.`);
      }
      return {
        ...item,
        type,
      };
    },
  );

  return {
    kind: "browser",
    browser: normalizeBrowser(normalized.browser),
    headless: Boolean(normalized.headless),
    closeOnExit:
      typeof normalized.closeOnExit === "boolean"
        ? normalized.closeOnExit
        : normalized.headless
          ? true
          : false,
    timeoutMs: normalizeTimeout(normalized.timeoutMs, DEFAULT_TIMEOUT_MS),
    downloadDir: normalized.downloadDir || null,
    browserPath: normalized.browserPath || null,
    userDataDir: normalized.userDataDir || null,
    outputDir: normalized.outputDir || null,
    actions,
  };
}

async function getOpenPort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Could not allocate a browser debug port.")),
        );
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Browser endpoint ${url} failed: ${response.status} ${body}`.trim(),
    );
  }
  return await response.json();
}

async function waitForBrowserVersion(baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      return await fetchJson(`${baseUrl}/json/version`);
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }

  throw new Error(
    `Chrome DevTools endpoint did not become ready: ${lastError instanceof Error ? lastError.message : String(lastError || "unknown error")}`,
  );
}

async function waitForProcessExit(child, timeoutMs) {
  if (!child || child.exitCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      child.off("exit", onExit);
    };

    const onExit = () => {
      cleanup();
      resolve();
    };

    child.once("exit", onExit);
  });
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.eventWaiters = [];
  }

  async connect(timeoutMs = DEFAULT_TIMEOUT_MS) {
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(this.wsUrl);
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error(`Timed out connecting to ${this.wsUrl}`));
      }, timeoutMs);

      const cleanup = () => clearTimeout(timer);

      socket.addEventListener("open", () => {
        cleanup();
        this.socket = socket;
        resolve();
      });

      socket.addEventListener("message", (event) => {
        this.handleMessage(String(event.data || ""));
      });

      socket.addEventListener("error", (error) => {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      });

      socket.addEventListener("close", () => {
        for (const pending of this.pending.values()) {
          pending.reject(new Error(`CDP socket closed for ${this.wsUrl}`));
        }
        this.pending.clear();
      });
    });

    return this;
  }

  handleMessage(rawMessage) {
    const message = parseJson(rawMessage, "Chrome DevTools message");

    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(
          new Error(
            message.error.message ||
              `CDP command failed for request ${message.id}`,
          ),
        );
        return;
      }
      pending.resolve(message.result ?? null);
      return;
    }

    if (!message.method) {
      return;
    }

    const remaining = [];
    for (const waiter of this.eventWaiters) {
      if (
        waiter.method === message.method &&
        (!waiter.predicate || waiter.predicate(message.params || {}))
      ) {
        clearTimeout(waiter.timer);
        waiter.resolve(message.params || {});
      } else {
        remaining.push(waiter);
      }
    }
    this.eventWaiters = remaining;
  }

  async send(method, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error(`CDP socket is not connected for ${method}`);
    }

    const id = this.nextId;
    this.nextId += 1;

    const payload = JSON.stringify({
      id,
      method,
      params,
    });

    const responsePromise = new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve,
        reject,
      });
    });

    this.socket.send(payload);
    return await responsePromise;
  }

  async waitForEvent(method, predicate, timeoutMs = DEFAULT_TIMEOUT_MS) {
    return await new Promise((resolve, reject) => {
      const waiter = {
        method,
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.eventWaiters = this.eventWaiters.filter(
            (entry) => entry !== waiter,
          );
          reject(new Error(`Timed out waiting for ${method}`));
        }, timeoutMs),
      };

      this.eventWaiters.push(waiter);
    });
  }

  close() {
    for (const waiter of this.eventWaiters) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(`CDP socket closed for ${this.wsUrl}`));
    }
    this.eventWaiters = [];

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close();
    }
  }
}

function browserHelpersExpression() {
  return `
    const normalizeText = (value) =>
      String(value || "").replace(/\\s+/g, " ").trim().toLowerCase();

    const firstText = (...values) => {
      for (const value of values) {
        const text = normalizeText(value);
        if (text) {
          return text;
        }
      }
      return "";
    };

    const resolveByLabel = (labelText) => {
      const desired = normalizeText(labelText);
      if (!desired) {
        return null;
      }

      for (const label of document.querySelectorAll("label")) {
        const labelValue = firstText(
          label.innerText,
          label.textContent,
          label.getAttribute("aria-label"),
        );
        if (!labelValue.includes(desired)) {
          continue;
        }
        if (label.control) {
          return label.control;
        }
        const nested = label.querySelector("input, textarea, select");
        if (nested) {
          return nested;
        }
      }

      return null;
    };

    const resolveClickableByText = (targetText) => {
      const desired = normalizeText(targetText);
      if (!desired) {
        return null;
      }

      const candidates = [
        ...document.querySelectorAll(
          "button, a, input[type='submit'], input[type='button'], [role='button']",
        ),
      ];

      return (
        candidates.find((candidate) => {
          const value = firstText(
            candidate.innerText,
            candidate.textContent,
            candidate.value,
            candidate.getAttribute("aria-label"),
            candidate.getAttribute("title"),
          );
          return value === desired || value.includes(desired);
        }) || null
      );
    };

    const resolveField = ({ selector, label }) => {
      if (selector) {
        return document.querySelector(selector);
      }
      if (label) {
        return resolveByLabel(label);
      }
      return null;
    };

    const resolveClickTarget = ({ selector, text }) => {
      if (selector) {
        return document.querySelector(selector);
      }
      if (text) {
        return resolveClickableByText(text);
      }
      return null;
    };
  `;
}

function buildEvaluateExpression(expression, returnByValue = true) {
  return {
    expression,
    awaitPromise: true,
    returnByValue,
  };
}

function formatRuntimeError(result, label) {
  if (result?.exceptionDetails?.text) {
    return `${label} failed: ${result.exceptionDetails.text}`;
  }
  return `${label} failed.`;
}

async function launchChromeCdpSession(options = {}) {
  const browser = normalizeBrowser(options.browser);
  const timeoutMs = normalizeTimeout(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const debugPort = await getOpenPort();
  const chromePath = resolveChromeExecutable(options.browserPath);
  const userDataDir =
    options.userDataDir ||
    fs.mkdtempSync(path.join(os.tmpdir(), "jasper-browser-profile-"));
  const ownsUserDataDir = !options.userDataDir;
  const downloadDir = options.downloadDir
    ? path.resolve(options.downloadDir)
    : null;
  if (downloadDir) {
    fs.mkdirSync(downloadDir, {
      recursive: true,
    });
  }

  const chromeArgs = [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-popup-blocking",
    "about:blank",
  ];

  if (options.headless) {
    chromeArgs.unshift("--headless=new");
  }

  const child = spawn(chromePath, chromeArgs, {
    stdio: "ignore",
  });

  const baseUrl = `http://127.0.0.1:${debugPort}`;
  const version = await waitForBrowserVersion(baseUrl, timeoutMs);
  const browserClient = await new CdpClient(
    version.webSocketDebuggerUrl,
  ).connect(timeoutMs);

  if (downloadDir) {
    await browserClient.send("Browser.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: downloadDir,
      eventsEnabled: true,
    });
  }

  const target = await fetchJson(`${baseUrl}/json/new?about:blank`, {
    method: "PUT",
  });
  const pageClient = await new CdpClient(target.webSocketDebuggerUrl).connect(
    timeoutMs,
  );

  await pageClient.send("Page.enable");
  await pageClient.send("Runtime.enable");
  await pageClient.send("Network.enable");

  async function evaluate(expression, evaluateOptions = {}) {
    const result = await pageClient.send(
      "Runtime.evaluate",
      buildEvaluateExpression(
        expression,
        evaluateOptions.returnByValue !== false,
      ),
    );

    if (result?.exceptionDetails) {
      throw new Error(formatRuntimeError(result, "Browser evaluation"));
    }

    return result?.result?.value ?? null;
  }

  async function snapshot() {
    return await evaluate(`
      (() => {
        ${browserHelpersExpression()}

        const fieldLabel = (field) => {
          if (field.labels && field.labels.length > 0) {
            return firstText(...Array.from(field.labels).map((label) => label.innerText));
          }
          if (field.id) {
            const byId = document.querySelector(\`label[for="\${field.id}"]\`);
            if (byId) {
              return firstText(byId.innerText, byId.textContent);
            }
          }
          return null;
        };

        return {
          url: window.location.href,
          title: document.title,
          readyState: document.readyState,
          headings: Array.from(document.querySelectorAll("h1, h2, h3"))
            .map((entry) => firstText(entry.innerText, entry.textContent))
            .filter(Boolean)
            .slice(0, 8),
          fields: Array.from(document.querySelectorAll("input, textarea, select"))
            .map((field) => ({
              tag: field.tagName.toLowerCase(),
              type: field.getAttribute("type") || null,
              name: field.getAttribute("name") || null,
              id: field.id || null,
              label: fieldLabel(field),
            }))
            .slice(0, 12),
          buttons: Array.from(
            document.querySelectorAll(
              "button, a, input[type='submit'], input[type='button'], [role='button']",
            ),
          )
            .map((entry) => firstText(
              entry.innerText,
              entry.textContent,
              entry.value,
              entry.getAttribute("aria-label"),
            ))
            .filter(Boolean)
            .slice(0, 12),
        };
      })()
    `);
  }

  async function waitForLoad(customTimeoutMs) {
    await pageClient.waitForEvent(
      "Page.loadEventFired",
      null,
      normalizeTimeout(customTimeoutMs, timeoutMs),
    );
  }

  async function navigate(url, action = {}) {
    const loadPromise = waitForLoad(action.timeoutMs);
    await pageClient.send("Page.navigate", {
      url,
    });
    await loadPromise;
    return await snapshot();
  }

  async function waitForSelector(selector, action = {}) {
    const deadline = Date.now() + normalizeTimeout(action.timeoutMs, timeoutMs);
    while (Date.now() < deadline) {
      const found = await evaluate(`
        (() => Boolean(document.querySelector(${JSON.stringify(selector)})))()
      `);
      if (found) {
        return true;
      }
      await delay(DEFAULT_POLL_MS);
    }
    throw new Error(`Timed out waiting for selector ${selector}`);
  }

  async function fill(action = {}) {
    const result = await evaluate(`
      (() => {
        ${browserHelpersExpression()}
        const target = resolveField({
          selector: ${JSON.stringify(action.selector || null)},
          label: ${JSON.stringify(action.label || null)},
        });
        if (!target) {
          return { ok: false, reason: "not_found" };
        }

        if (target instanceof HTMLSelectElement) {
          target.value = ${JSON.stringify(action.value || "")};
        } else if ("value" in target) {
          target.focus();
          target.value = ${JSON.stringify(action.value || "")};
        } else {
          return { ok: false, reason: "unsupported_target" };
        }

        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
        return {
          ok: true,
          tag: target.tagName.toLowerCase(),
          name: target.getAttribute("name") || null,
          id: target.id || null,
        };
      })()
    `);

    if (!result?.ok) {
      throw new Error(
        `Could not fill ${describeCriteria(action) || "field"}: ${result?.reason || "unknown error"}`,
      );
    }

    return result;
  }

  async function click(action = {}) {
    const result = await evaluate(`
      (() => {
        ${browserHelpersExpression()}
        const target = resolveClickTarget({
          selector: ${JSON.stringify(action.selector || null)},
          text: ${JSON.stringify(action.text || null)},
        });
        if (!target) {
          return { ok: false, reason: "not_found" };
        }

        target.scrollIntoView({
          block: "center",
          inline: "center",
        });
        target.click();

        return {
          ok: true,
          tag: target.tagName.toLowerCase(),
          text: firstText(
            target.innerText,
            target.textContent,
            target.value,
            target.getAttribute("aria-label"),
          ),
        };
      })()
    `);

    if (!result?.ok) {
      throw new Error(
        `Could not click ${describeCriteria(action) || "target"}: ${result?.reason || "unknown error"}`,
      );
    }

    return result;
  }

  async function select(action = {}) {
    const result = await evaluate(`
      (() => {
        ${browserHelpersExpression()}
        const target = resolveField({
          selector: ${JSON.stringify(action.selector || null)},
          label: ${JSON.stringify(action.label || null)},
        });
        if (!(target instanceof HTMLSelectElement)) {
          return { ok: false, reason: target ? "not_select" : "not_found" };
        }
        target.value = ${JSON.stringify(action.value || "")};
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
        return {
          ok: true,
          value: target.value,
          name: target.getAttribute("name") || null,
        };
      })()
    `);

    if (!result?.ok) {
      throw new Error(
        `Could not select ${action.value || "value"} in ${describeCriteria(action) || "field"}: ${result?.reason || "unknown error"}`,
      );
    }

    return result;
  }

  async function read(action = {}) {
    const result = await evaluate(`
      (() => {
        ${browserHelpersExpression()}
        const target =
          resolveField({
            selector: ${JSON.stringify(action.selector || null)},
            label: ${JSON.stringify(action.label || null)},
          }) ||
          resolveClickTarget({
            selector: ${JSON.stringify(action.selector || null)},
            text: ${JSON.stringify(action.text || null)},
          });

        if (!target) {
          return { ok: false, reason: "not_found" };
        }

        return {
          ok: true,
          text: firstText(target.innerText, target.textContent, target.value),
          html: target.outerHTML,
          tag: target.tagName.toLowerCase(),
        };
      })()
    `);

    if (!result?.ok) {
      throw new Error(
        `Could not read ${describeCriteria(action) || "target"}: ${result?.reason || "unknown error"}`,
      );
    }

    return result;
  }

  async function evaluateExpression(expression) {
    return await evaluate(expression);
  }

  async function screenshot(filePath) {
    const resolvedPath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(resolvedPath), {
      recursive: true,
    });

    const payload = await pageClient.send("Page.captureScreenshot", {
      format: "png",
    });
    fs.writeFileSync(resolvedPath, Buffer.from(payload.data, "base64"));
    return resolvedPath;
  }

  async function waitForDownload(customTimeoutMs) {
    const timeout = normalizeTimeout(customTimeoutMs, timeoutMs);
    const started = await browserClient.waitForEvent(
      "Browser.downloadWillBegin",
      null,
      timeout,
    );
    const progress = await browserClient.waitForEvent(
      "Browser.downloadProgress",
      (event) => event.guid === started.guid && event.state === "completed",
      timeout,
    );
    return {
      guid: started.guid,
      url: started.url,
      suggestedFilename: started.suggestedFilename || null,
      state: progress.state,
      totalBytes: progress.totalBytes ?? null,
    };
  }

  async function close(closeOptions = {}) {
    const closeBrowser = closeOptions.closeBrowser !== false;

    pageClient.close();
    browserClient.close();

    if (closeBrowser && child.exitCode === null && !child.killed) {
      child.kill("SIGTERM");
      await waitForProcessExit(child, 2_000);
    }

    if (closeBrowser && child.exitCode === null && !child.killed) {
      child.kill("SIGKILL");
      await waitForProcessExit(child, 1_000);
    }

    if (closeBrowser && ownsUserDataDir) {
      try {
        fs.rmSync(userDataDir, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 100,
        });
      } catch {
        // Cleanup failure should not hide a successful browser run.
      }
    }
  }

  return {
    browser,
    debugPort,
    downloadDir,
    headless: Boolean(options.headless),
    userDataDir,
    closeOnExit:
      typeof options.closeOnExit === "boolean"
        ? options.closeOnExit
        : options.headless
          ? true
          : false,
    navigate,
    waitForSelector,
    waitForLoad,
    fill,
    click,
    select,
    read,
    evaluate: evaluateExpression,
    snapshot,
    screenshot,
    waitForDownload,
    close,
  };
}

function resolveScreenshotPath(action, plan, index) {
  if (action.path) {
    return path.resolve(action.path);
  }

  const outputDir = plan.outputDir || process.cwd();
  return path.resolve(outputDir, `browser-action-${index + 1}.png`);
}

async function executeBrowserAction(session, action, plan, index) {
  if (action.type === "open" || action.type === "navigate") {
    return {
      snapshot: await session.navigate(action.url, action),
      url: action.url,
    };
  }

  if (action.type === "wait") {
    const waitedMs = normalizeWait(action.ms, DEFAULT_WAIT_MS);
    await delay(waitedMs);
    return {
      waitedMs,
    };
  }

  if (action.type === "wait-for-selector") {
    await session.waitForSelector(action.selector, action);
    return {
      selector: action.selector,
    };
  }

  if (action.type === "fill") {
    return await session.fill(action);
  }

  if (action.type === "click") {
    const navigationPromise = action.waitForNavigation
      ? session.waitForLoad(action.timeoutMs)
      : null;
    const downloadPromise = action.waitForDownload
      ? session.waitForDownload(action.timeoutMs)
      : null;

    const clickResult = await session.click(action);

    if (navigationPromise) {
      await navigationPromise;
    }

    if (action.waitForSelector) {
      await session.waitForSelector(action.waitForSelector, action);
    }

    return {
      ...clickResult,
      download: downloadPromise ? await downloadPromise : null,
    };
  }

  if (action.type === "select") {
    return await session.select(action);
  }

  if (action.type === "read") {
    return await session.read(action);
  }

  if (action.type === "snapshot") {
    return {
      snapshot: await session.snapshot(),
    };
  }

  if (action.type === "screenshot") {
    const screenshotPath = resolveScreenshotPath(action, plan, index);
    return {
      screenshotPath: await session.screenshot(screenshotPath),
    };
  }

  if (action.type === "evaluate") {
    return {
      value: await session.evaluate(action.expression),
    };
  }

  throw new Error(`Unsupported browser action type: ${action.type}`);
}

export function createBrowserAutomation(options = {}) {
  const launchSession = options.launchSession || launchChromeCdpSession;

  return {
    async runPlan(planInput = {}) {
      const plan = normalizeBrowserPlan(planInput);
      const session = await launchSession(plan);
      const actionResults = [];
      let finalSnapshot = null;
      let status = "completed";
      let failure = null;

      try {
        for (const [index, action] of plan.actions.entries()) {
          try {
            const result = await executeBrowserAction(
              session,
              action,
              plan,
              index,
            );
            actionResults.push({
              index,
              type: action.type,
              description: describeBrowserAction(action),
              status: "completed",
              result,
            });
          } catch (error) {
            status = "failed";
            failure = error instanceof Error ? error.message : String(error);
            actionResults.push({
              index,
              type: action.type,
              description: describeBrowserAction(action),
              status: "failed",
              error: failure,
            });
            break;
          }
        }

        try {
          finalSnapshot = await session.snapshot();
        } catch {
          finalSnapshot = null;
        }

        return {
          kind: "browser",
          browser: session.browser || plan.browser,
          headless: Boolean(plan.headless),
          status,
          failure,
          closeOnExit: session.closeOnExit ?? plan.closeOnExit,
          debugPort: session.debugPort || null,
          userDataDir: session.userDataDir || null,
          downloadDir: session.downloadDir || plan.downloadDir || null,
          actions: actionResults,
          finalSnapshot,
        };
      } finally {
        await session.close({
          closeBrowser: session.closeOnExit ?? plan.closeOnExit,
        });
      }
    },

    loadPlan(planText, label = "browser plan") {
      const parsed = parseJson(planText, label);
      if (Array.isArray(parsed)) {
        return {
          kind: "browser",
          browser: "chrome",
          actions: parsed,
        };
      }
      return parsed;
    },
  };
}

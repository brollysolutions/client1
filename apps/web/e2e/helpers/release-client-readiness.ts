import { writeFile } from "node:fs/promises";

import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";

const RELEASE_CLIENT_DELAY_ENV = "PLAYWRIGHT_RELEASE_CLIENT_DELAY_MS";
const MAX_RELEASE_CLIENT_DELAY_MS = 5_000;
const processDiagnostics = new WeakMap<Page, Array<Record<string, unknown>>>();

function diagnosticPath(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.pathname.startsWith("/api/v1/auth/register/")) return url.pathname;
    if (url.pathname !== "/loans") return null;

    const query = new URLSearchParams();
    for (const name of ["q", "category"]) {
      const value = url.searchParams.get(name);
      if (value != null) query.set(`${name}_length`, String(value.length));
    }
    const suffix = query.toString();
    return suffix ? `${url.pathname}?${suffix}` : url.pathname;
  } catch {
    return null;
  }
}

/**
 * Retain a bounded, synthetic-only interaction timeline for hosted failures.
 * Values, request bodies, headers, tokens, and response bodies are deliberately
 * excluded; the Playwright trace remains the authoritative detailed evidence.
 */
export async function installReleaseInteractionDiagnostics(page: Page): Promise<void> {
  if (processDiagnostics.has(page)) return;

  const processEvents: Array<Record<string, unknown>> = [];
  processDiagnostics.set(page, processEvents);
  const record = (event: Record<string, unknown>) => {
    if (processEvents.length < 200) processEvents.push(event);
  };

  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      record({ type: "console", level: message.type(), text: message.text().slice(0, 1_000) });
    }
  });
  page.on("pageerror", (error) => {
    record({ type: "pageerror", name: error.name, message: error.message.slice(0, 1_000) });
  });
  page.on("request", (request) => {
    const path = diagnosticPath(request.url());
    if (path) record({ type: "request", method: request.method(), path });
  });
  page.on("response", (response) => {
    const path = diagnosticPath(response.url());
    if (path) record({ type: "response", status: response.status(), path });
  });
  page.on("requestfailed", (request) => {
    const path = diagnosticPath(request.url());
    if (path) {
      record({
        type: "requestfailed",
        method: request.method(),
        path,
        failure: request.failure()?.errorText.slice(0, 500) ?? null,
      });
    }
  });

  await page.addInitScript(() => {
    type BrowserDiagnostic = {
      type: string;
      probe?: string | null;
      tag?: string | null;
      name?: string | null;
      disabled?: boolean | null;
      valueLength?: number | null;
      formBusy?: string | null;
      defaultPrevented?: boolean;
      trusted?: boolean;
    };
    type DiagnosticWindow = Window & {
      __releaseInteractionDiagnostics?: {
        events: BrowserDiagnostic[];
        removedProbes: string[];
      };
    };

    const diagnostics = { events: [] as BrowserDiagnostic[], removedProbes: [] as string[] };
    Object.defineProperty(window as DiagnosticWindow, "__releaseInteractionDiagnostics", {
      value: diagnostics,
      configurable: false,
      enumerable: false,
      writable: false,
    });

    const record = (event: BrowserDiagnostic) => {
      if (diagnostics.events.length < 200) diagnostics.events.push(event);
    };
    for (const type of ["beforeinput", "input", "change", "click", "submit"]) {
      document.addEventListener(
        type,
        (event) => {
          const target = event.target instanceof Element ? event.target : null;
          const probe = target?.closest<HTMLElement>("[data-release-probe]") ?? null;
          const valueTarget =
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement
              ? target
              : null;
          queueMicrotask(() => {
            record({
              type,
              probe: probe?.dataset.releaseProbe ?? null,
              tag: target?.tagName.toLowerCase() ?? null,
              name: target?.getAttribute("name") ?? null,
              disabled:
                target instanceof HTMLInputElement ||
                target instanceof HTMLButtonElement ||
                target instanceof HTMLSelectElement ||
                target instanceof HTMLTextAreaElement
                  ? target.disabled
                  : null,
              valueLength: valueTarget?.value.length ?? null,
              formBusy: target?.closest("form")?.getAttribute("aria-busy") ?? null,
              defaultPrevented: event.defaultPrevented,
              trusted: event.isTrusted,
            });
          });
        },
        true,
      );
    }

    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const removedNode of mutation.removedNodes) {
          if (!(removedNode instanceof Element)) continue;
          const removed = [
            ...(removedNode.matches("[data-release-probe]") ? [removedNode] : []),
            ...removedNode.querySelectorAll<HTMLElement>("[data-release-probe]"),
          ];
          for (const element of removed) {
            const probe = (element as HTMLElement).dataset.releaseProbe;
            if (probe && diagnostics.removedProbes.length < 100) {
              diagnostics.removedProbes.push(probe);
            }
          }
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

export async function markReleaseProbe(locator: Locator, name: string): Promise<void> {
  await locator.evaluate((element, probe) => {
    element.setAttribute("data-release-probe", probe);
  }, name);
}

export async function expectReleaseEvent(
  page: Page,
  probe: string,
  type: string,
): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ expectedProbe, expectedType }) => {
            const diagnostics = (
              window as unknown as {
                __releaseInteractionDiagnostics?: {
                  events: Array<{ probe?: string | null; type: string }>;
                };
              }
            ).__releaseInteractionDiagnostics;
            return (
              diagnostics?.events.some(
                (event) => event.probe === expectedProbe && event.type === expectedType,
              ) ?? false
            );
          },
          { expectedProbe: probe, expectedType: type },
        ),
      { timeout: 5_000 },
    )
    .toBe(true);
}

export async function attachReleaseInteractionDiagnostics(
  page: Page,
  testInfo: TestInfo,
): Promise<void> {
  let browser: unknown;
  try {
    browser = await page.evaluate(() => {
      const diagnostics = (
        window as unknown as {
          __releaseInteractionDiagnostics?: {
            events: Array<Record<string, unknown>>;
            removedProbes: string[];
          };
        }
      ).__releaseInteractionDiagnostics;
      const probes = [...document.querySelectorAll<HTMLElement>("[data-release-probe]")].map(
        (element) => ({
          probe: element.dataset.releaseProbe ?? null,
          tag: element.tagName.toLowerCase(),
          connected: element.isConnected,
          disabled:
            element instanceof HTMLInputElement ||
            element instanceof HTMLButtonElement ||
            element instanceof HTMLSelectElement ||
            element instanceof HTMLTextAreaElement
              ? element.disabled
              : null,
          valueLength:
            element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement ||
            element instanceof HTMLSelectElement
              ? element.value.length
              : null,
          ariaBusy: element.getAttribute("aria-busy"),
          ariaPressed: element.getAttribute("aria-pressed"),
        }),
      );
      return { readyState: document.readyState, diagnostics, probes };
    });
  } catch (error) {
    browser = { unavailable: error instanceof Error ? error.message : String(error) };
  }

  const body = JSON.stringify(
    {
      url: page.url(),
      browser,
      process: processDiagnostics.get(page) ?? [],
    },
    null,
    2,
  );
  const diagnosticsPath = testInfo.outputPath("release-interaction-diagnostics.json");
  await writeFile(diagnosticsPath, body, "utf8");
  await testInfo.attach("release-interaction-diagnostics", {
    path: diagnosticsPath,
    contentType: "application/json",
  });
}

/**
 * Give the release gate a deterministic slow-hydration mode. The hosted gate
 * enables this before navigation so client-readiness assertions cannot pass by
 * runner timing alone. Application responses and test retries stay unchanged.
 */
export async function installReleaseClientDelay(page: Page): Promise<boolean> {
  const rawDelay = process.env[RELEASE_CLIENT_DELAY_ENV];
  if (rawDelay == null || rawDelay === "") return false;

  const delayMs = Number(rawDelay);
  if (
    !Number.isInteger(delayMs) ||
    delayMs < 0 ||
    delayMs > MAX_RELEASE_CLIENT_DELAY_MS
  ) {
    throw new Error(
      `${RELEASE_CLIENT_DELAY_ENV} must be an integer from 0 to ${MAX_RELEASE_CLIENT_DELAY_MS}`,
    );
  }
  if (delayMs === 0) return false;

  await page.route("**/_next/static/chunks/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.continue();
  });
  return true;
}

/** Wait until the catalogue's client-only keyboard effect owns the input. */
export async function focusCatalogueAfterHydration(
  page: Page,
  search: Locator,
): Promise<void> {
  await expect(search).toBeEnabled({ timeout: 30_000 });
  await expect(async () => {
    await page.keyboard.press("/");
    await expect(search).toBeFocused({ timeout: 500 });
  }).toPass({ timeout: 30_000, intervals: [100, 250, 500] });
}

/** Select a React-owned toggle, retrying only while its state did not change. */
export async function selectToggleAfterHydration(
  toggle: Locator,
): Promise<void> {
  await expect(toggle).toBeEnabled({ timeout: 30_000 });
  await expect(async () => {
    if ((await toggle.getAttribute("aria-pressed")) !== "true") {
      await toggle.click();
    }
    await expect(toggle).toHaveAttribute("aria-pressed", "true", { timeout: 500 });
  }).toPass({ timeout: 30_000, intervals: [100, 250, 500] });
}

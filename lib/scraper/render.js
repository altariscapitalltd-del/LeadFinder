import { createRequire } from "module";

const require = createRequire(import.meta.url);

function looksJsHeavy(html) {
  const text = String(html || "");
  return (
    /__next|id="__nuxt"|data-reactroot|ng-version|window\.__INITIAL_STATE__|Loading\.\.\.|enable javascript/i.test(text) ||
    (text.length < 2500 && /script/i.test(text))
  );
}

export async function maybeRenderPage(url, initialHtml) {
  const enabled = process.env.PLAYWRIGHT_RENDER !== "0";
  if (!enabled || !looksJsHeavy(initialHtml)) {
    return { html: initialHtml, rendered: false, reason: "not_needed" };
  }

  try {
    const chromium = require("@sparticuz/chromium");
    const { chromium: playwrightChromium } = require("playwright-core");
    const executablePath = await chromium.executablePath();
    const browser = await playwrightChromium.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    });
    const page = await browser.newPage({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
    });
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(900);
    const html = await page.content();
    await browser.close();
    return { html, rendered: true, reason: "playwright" };
  } catch (error) {
    return { html: initialHtml, rendered: false, reason: `render_failed:${error.message}` };
  }
}

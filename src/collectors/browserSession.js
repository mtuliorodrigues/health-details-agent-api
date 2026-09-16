const { chromium } = require('playwright');

const TIMEOUT_MS = Number(process.env.COLLECTOR_TIMEOUT_MS || 8_000);

function deviceUrl(ip, protocol) {
  return `${protocol}://${ip}/`;
}

async function createSession(ip, protocol) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ ignoreHTTPSErrors: true });
    page.setDefaultTimeout(TIMEOUT_MS);
    await page.goto(deviceUrl(ip, protocol), { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    return { page, close: () => browser.close() };
  } catch (error) {
    await browser?.close();
    if (/Executable doesn't exist|browserType\.launch/i.test(error.message)) {
      const setupError = new Error('Navegador de automação não instalado. Execute "npx playwright install chromium" no servidor.');
      setupError.statusCode = 503;
      throw setupError;
    }
    throw error;
  }
}

async function login(page, credentials) {
  if (!credentials?.username || !credentials?.password) {
    const error = new Error('Usuário e senha do dispositivo são obrigatórios para a coleta.');
    error.statusCode = 400;
    throw error;
  }

  const userInput = page.locator('input[name="username"], input[name="user"], input[type="text"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  if (!await userInput.count() || !await passwordInput.count()) return;

  await userInput.fill(credentials.username);
  await passwordInput.fill(credentials.password);
  const submit = page.locator('button[type="submit"], input[type="submit"], input[type="image"], button:has-text("Login")').first();
  if (await submit.count()) {
    await submit.click();
  } else {
    await passwordInput.press('Enter');
  }
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500);
}

async function pageSnapshot(page) {
  return page.evaluate(() => ({
    text: document.body.innerText,
    tables: [...document.querySelectorAll('table')].map((table) => ({
      headers: [...table.querySelectorAll(':scope > thead > tr > th')].map((cell) => cell.innerText),
      rows: [...table.querySelectorAll(':scope > tbody > tr')].map((row) => [...row.querySelectorAll(':scope > td')].map((cell) => cell.innerText))
    })).filter((table) => table.headers.length && table.rows.length)
  }));
}

async function tableSnapshotAtXPath(page, xpath) {
  return page.evaluate((targetXpath) => {
    const target = document.evaluate(targetXpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (!target) return null;
    const tables = [
      ...(target.matches?.('table') ? [target] : []),
      ...target.querySelectorAll?.('table') || []
    ];
    const table = tables.find((item) => item.querySelector(':scope > thead > tr > th') && item.querySelector(':scope > tbody > tr'));
    if (!table) return null;
    return {
      headers: [...table.querySelectorAll(':scope > thead > tr > th')].map((cell) => cell.innerText),
      rows: [...table.querySelectorAll(':scope > tbody > tr')].map((row) => [...row.querySelectorAll(':scope > td')].map((cell) => cell.innerText))
    };
  }, xpath);
}

async function textAtXPath(page, xpath) {
  return page.evaluate((targetXpath) => {
    const node = document.evaluate(targetXpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    return node ? node.innerText : null;
  }, xpath);
}

module.exports = { createSession, login, pageSnapshot, tableSnapshotAtXPath, textAtXPath };

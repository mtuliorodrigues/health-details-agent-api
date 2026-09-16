const { chromium } = require('playwright');

const TIMEOUT_MS = Number(process.env.COLLECTOR_TIMEOUT_MS || 8_000);

function deviceUrl(ip, protocol, port) {
  return `${protocol}://${ip}${port ? `:${port}` : ''}/`;
}

async function createSession(ip, protocol, port) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ ignoreHTTPSErrors: true });
    page.setDefaultTimeout(TIMEOUT_MS);
    await page.goto(deviceUrl(ip, protocol, port), { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
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

async function login(page, credentials, { requireForm = false } = {}) {
  if (!credentials?.username || !credentials?.password) {
    const error = new Error('Usuário e senha do dispositivo são obrigatórios para a coleta.');
    error.statusCode = 400;
    throw error;
  }

  const userInput = page.locator('input[name="username"], input[name="user"], input[type="text"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.waitFor({ state: 'visible', timeout: Math.min(TIMEOUT_MS, 3_000) }).catch(() => {});
  if (!await userInput.count() || !await passwordInput.count()) {
    if (!requireForm) return;
    const error = new Error('A página da porta consultada não apresentou o login Ubiquiti.');
    error.code = 'LOGIN_FORM_NOT_FOUND';
    throw error;
  }

  await userInput.fill(credentials.username);
  await passwordInput.fill(credentials.password);
  const submit = page.locator('button[type="submit"], input[type="submit"], input[type="image"], button:has-text("Login")').first();
  if (await submit.count()) {
    await submit.click();
  } else {
    await passwordInput.press('Enter');
  }
  await page.waitForLoadState('domcontentloaded');
  await passwordInput.waitFor({ state: 'hidden', timeout: Math.min(TIMEOUT_MS, 5_000) }).catch(() => {});
  if (await passwordInput.isVisible().catch(() => false)) {
    const error = new Error('Credenciais não aceitas pelo dispositivo.');
    error.code = 'AUTH_FAILED';
    throw error;
  }
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

async function classicTableSnapshotAtXPath(page, xpath) {
  return page.evaluate((targetXpath) => {
    const target = document.evaluate(targetXpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (!target) return null;
    const tables = [...(target.matches?.('table') ? [target] : []), ...target.querySelectorAll?.('table') || []];
    let best = null;
    for (const table of tables) {
      const headerRow = [...table.querySelectorAll('tr')].find((row) => row.querySelectorAll('th').length);
      if (!headerRow) continue;
      const headers = [...headerRow.querySelectorAll('th')].map((cell) => cell.innerText.trim());
      const rows = [...table.querySelectorAll('tr')].filter((row) => row !== headerRow && row.querySelectorAll('td').length).map((row) => [...row.querySelectorAll('td')].map((cell) => cell.innerText.trim()));
      const score = ['device name', 'ccq', 'connection'].filter((term) => headers.join(' ').toLowerCase().includes(term)).length;
      if (headers.length && rows.length && (!best || score > best.score)) best = { headers, rows, score };
    }
    return best && { headers: best.headers, rows: best.rows };
  }, xpath);
}

async function textAtXPath(page, xpath) {
  return page.evaluate((targetXpath) => {
    const node = document.evaluate(targetXpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    return node ? node.innerText : null;
  }, xpath);
}

module.exports = { createSession, login, pageSnapshot, tableSnapshotAtXPath, classicTableSnapshotAtXPath, textAtXPath };

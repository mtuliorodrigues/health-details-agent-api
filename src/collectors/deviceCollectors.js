const { createSession, login, pageSnapshot, tableSnapshotAtXPath, classicTableSnapshotAtXPath, textAtXPath } = require('./browserSession');
const { clientsFromTable, clientsFromUbiquitiText, ubiquitiUptimeFromText, clientFromUbiquitiDashboard, valueFromPanel, clientsFromM5Table } = require('./collectorUtils');

const VENDORS = {
  mikrotik: { label: 'MikroTik', protocol: 'http', includeCcq: true },
  'ubiquiti-ac': { label: 'Ubiquiti 5AC', protocol: 'http', includeCcq: false },
  'ubiquiti-m5': { label: 'Ubiquiti M5', protocol: 'http', includeCcq: false }
};
const MIKROTIK_REGISTRATION_XPATH = '/html/body/div[3]/table/tbody/tr/td[2]/table/tbody/tr[3]';
const MIKROTIK_CCQ_XPATH = '/html/body/div[3]/table/tbody/tr/td[2]/table/tbody/tr[3]/td/div/table[3]/tbody[31]';
const UBIQUITI_DEVICE_NAME_XPATH = '/html/body/div[1]/div/div[4]/div/div/div[1]/div/div[2]/div[1]/div/div/div/div/div[1]/div/div/div/div[2]/div[2]';
const UBIQUITI_UPTIME_XPATH = '/html/body/div[1]/div/div[4]/div/div/div[2]/div[4]/div/div/div[1]';
const UBIQUITI_CLIENTS_XPATH = '/html/body/div[1]/div/div[4]/div/div/div[2]/div/div[2]';
const M5_PANEL_XPATH = '/html/body/table/tbody/tr[3]/td';
const UBIQUITI_PORTS = [8074, 8075, 8076];
const UBIQUITI_DEFAULT_CREDENTIALS = [{ username: 'ubnt', password: 'play8074' }, { username: 'ubnt', password: 'Play8074' }, { username: 'admin', password: 'Play8074' }];

function uptimeFromText(text) {
  const match = text.match(/(?:system\s+)?uptime\s*[:\-]?\s*([^\r\n]+)/i);
  return match?.[1] ?? null;
}

function selectClientTable(tables) {
  return tables.find((table) => table.headers.some((header) => /station|client|signal|ccq/i.test(header))) || { headers: [], rows: [] };
}

async function mikrotikSnapshots(page) {
  await openMikrotikRegistration(page);
  await page.waitForTimeout(250);
  const registrationTable = await tableSnapshotAtXPath(page, MIKROTIK_REGISTRATION_XPATH);
  const registration = registrationTable
    ? { text: '', tables: [registrationTable] }
    : await pageSnapshot(page);
  const ccq = await textAtXPath(page, MIKROTIK_CCQ_XPATH);

  let uptime = null;
  let identity = null;
  try {
    await page.getByText('System', { exact: true }).first().click();
    await page.getByText('Resources', { exact: true }).first().click();
    await page.waitForTimeout(250);
    uptime = uptimeFromText((await pageSnapshot(page)).text);
    await page.getByText('Identity', { exact: true }).first().click();
    await page.waitForTimeout(250);
    identity = await page.locator('input[type="text"], input:not([type])').evaluateAll((inputs) =>
      inputs.map((input) => input.value).filter(Boolean).at(-1) || null
    );
  } catch {
    // A coleta de clientes permanece válida quando o perfil não permite Resources.
  }
  return { registration, uptime, identity, ccq };
}

async function openMikrotikRegistration(page) {
  await page.getByText('Wireless', { exact: true }).first().click();
  await page.getByText('Registration', { exact: true }).first().click();
  await page.waitForTimeout(200);
}

async function enrichMikrotikClientCcq(page, clients, onProgress) {
  if (!clients.length) return;

  for (const client of clients) {
    if (!client.radioName || client.txRxCcq !== null) continue;
    try {
      onProgress(`Consultando dispositivo: ${client.radioName}.`);
      await openMikrotikRegistration(page);
      await page.getByText(client.radioName, { exact: true }).first().dblclick({ timeout: 2_000 });
      await page.waitForTimeout(200);
      const label = page.locator('td.label span').filter({ hasText: 'Tx/Rx CCQ' }).first();
      if (await label.count()) {
        client.txRxCcq = await label.evaluate((element) =>
          element.closest('tr')?.querySelector('td.value .rovalue')?.textContent ?? null
        );
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
    } catch {
      // Um cliente sem painel de detalhes legível permanece com CCQ não informado.
    }
  }
}

function uniqueCredentials(credentials) { return [...(credentials?.username && credentials?.password ? [credentials] : []), ...UBIQUITI_DEFAULT_CREDENTIALS].filter((item, index, all) => all.findIndex((candidate) => candidate.username === item.username && candidate.password === item.password) === index); }
async function ubiquitiSnapshots(page) { await page.waitForFunction((xpath) => Boolean(document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue?.innerText?.trim()), UBIQUITI_DEVICE_NAME_XPATH, { timeout: 8_000 }); const [identityText, uptimeText, clientsText, dashboardText] = await Promise.all([textAtXPath(page, UBIQUITI_DEVICE_NAME_XPATH), textAtXPath(page, UBIQUITI_UPTIME_XPATH), textAtXPath(page, UBIQUITI_CLIENTS_XPATH), page.locator('body').innerText()]); const clients = clientsFromUbiquitiText(clientsText); return { identity: identityText?.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || null, uptime: ubiquitiUptimeFromText(uptimeText) || ubiquitiUptimeFromText(dashboardText), clients: clients.length ? clients : clientFromUbiquitiDashboard(dashboardText) }; }
async function m5Snapshots(page) { await page.waitForFunction((xpath) => { const lines = (document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue?.innerText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean); const value = (label) => { const index = lines.findIndex((line) => line.toLowerCase() === label); return index >= 0 && lines[index + 1] && !lines[index + 1].endsWith(':'); }; return value('device name:') && value('uptime:'); }, M5_PANEL_XPATH, { timeout: 8_000 }); const text = await textAtXPath(page, M5_PANEL_XPATH); await page.getByText(/stations/i, { exact: true }).first().click(); await page.waitForFunction((xpath) => { const text = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue?.innerText || ''; return /connection\s+time/i.test(text) && !/loading\.\.\./i.test(text); }, M5_PANEL_XPATH, { timeout: 8_000 }); return { identity: valueFromPanel(text, 'Device Name'), uptime: valueFromPanel(text, 'Uptime'), clients: clientsFromM5Table(await classicTableSnapshotAtXPath(page, M5_PANEL_XPATH)) }; }
async function collectUbiquiti({ ip, definition, credentials, protocol, onProgress }) { for (const port of UBIQUITI_PORTS) { const candidates = definition.key === 'ubiquiti-m5' ? [...(credentials?.username && credentials?.password ? [credentials] : []), { username: 'ubnt', password: 'play8074' }] : uniqueCredentials(credentials); for (const candidate of candidates) { let session; try { onProgress(`Tentando ${definition.label} na porta ${port}.`); session = await createSession(ip, protocol || definition.protocol, port); await login(session.page, candidate, { requireForm: true }); const data = definition.key === 'ubiquiti-m5' ? await m5Snapshots(session.page) : await ubiquitiSnapshots(session.page); return { status: 'success', device: { ip, port, vendor: definition.key, vendorLabel: definition.label, identity: data.identity, uptime: data.uptime, collectedAt: new Date().toISOString() }, clients: data.clients, warnings: data.clients.length ? [] : ['O equipamento foi acessado, mas não retornou clientes no painel atual.'] }; } catch {} finally { await session?.close(); } } } const error = new Error('Não foi possível acessar o Ubiquiti nas portas 8074, 8075 ou 8076.'); error.statusCode = 502; throw error; }
async function detectDevice({ ip, protocol, onProgress }) { for (const target of [{ vendor: 'mikrotik', port: null }, ...UBIQUITI_PORTS.map((port) => ({ vendor: 'ubiquiti', port }))]) { let session; try { onProgress(`Identificando tela de login${target.port ? ` na porta ${target.port}` : ''}.`); session = await createSession(ip, protocol || 'http', target.port); await session.page.waitForTimeout(750); const fingerprint = await session.page.evaluate(() => ({ title: document.title, text: document.body.innerText, classic: Boolean(document.querySelector('body > table')) })); const source = `${fingerprint.title}\n${fingerprint.text}`.toLowerCase(); if (/mikrotik|webfig/.test(source)) return 'mikrotik'; if (/airos/.test(source) || fingerprint.classic) return 'ubiquiti-m5'; if (/ubiquiti|5ac|nanostation|powerbeam/.test(source)) return 'ubiquiti-ac'; } catch {} finally { await session?.close(); } } const error = new Error('Não foi possível identificar o dispositivo.'); error.statusCode = 502; throw error; }

async function collectDevice({ ip, vendor, credentials, protocol, onProgress = () => {} }) {
  if (vendor === 'auto') { const detected = await detectDevice({ ip, protocol, onProgress }); onProgress(`Dispositivo identificado: ${VENDORS[detected].label}.`); return collectDevice({ ip, vendor: detected, credentials, protocol, onProgress }); }
  const definition = VENDORS[vendor];
  if (!definition) {
    const error = new Error('Tipo de dispositivo não suportado. Use mikrotik, ubiquiti-ac ou ubiquiti-m5.');
    error.statusCode = 400;
    throw error;
  }
  if (protocol && !['http', 'https'].includes(protocol)) {
    const error = new Error('Protocolo inválido. Use http ou https.');
    error.statusCode = 400;
    throw error;
  }

  onProgress(`Abrindo a interface ${definition.label}.`);
  if (vendor !== 'mikrotik') return collectUbiquiti({ ip, definition: { ...definition, key: vendor }, credentials, protocol, onProgress });
  const session = await createSession(ip, protocol || definition.protocol);
  try {
    onProgress('Autenticando no equipamento.');
    await login(session.page, credentials);
    onProgress('Lendo dados do equipamento e clientes.');
    const { registration: snapshot, uptime, identity, ccq } = vendor === 'mikrotik'
      ? await mikrotikSnapshots(session.page)
      : { registration: await pageSnapshot(session.page), uptime: null, identity: null, ccq: null };
    const table = selectClientTable(snapshot.tables);
    const clients = clientsFromTable(table, { includeCcq: definition.includeCcq });
    if (vendor === 'mikrotik') await enrichMikrotikClientCcq(session.page, clients, onProgress);
    if (ccq !== null && clients.length === 1 && clients[0].txRxCcq === null) {
      clients[0].txRxCcq = ccq;
    }
    onProgress(`Coleta concluída: ${clients.length} cliente(s) encontrado(s).`);
    return {
      status: 'success',
      device: { ip, vendor, vendorLabel: definition.label, identity, uptime: uptime || uptimeFromText(snapshot.text), collectedAt: new Date().toISOString() },
      clients,
      warnings: clients.length ? [] : ['Nenhuma tabela de clientes foi identificada. A interface ou versão do firmware pode exigir ajuste no conector.']
    };
  } finally {
    await session.close();
  }
}

module.exports = { VENDORS, collectDevice, detectDevice };

const { createSession, login, pageSnapshot, tableSnapshotAtXPath, textAtXPath } = require('./browserSession');
const { clientsFromTable } = require('./collectorUtils');

const VENDORS = {
  mikrotik: { label: 'MikroTik', protocol: 'http', includeCcq: true },
  'ubiquiti-ac': { label: 'Ubiquiti AC', protocol: 'https', includeCcq: false },
  'ubiquiti-m5': { label: 'Ubiquiti M5', protocol: 'https', includeCcq: false }
};
const MIKROTIK_REGISTRATION_XPATH = '/html/body/div[3]/table/tbody/tr/td[2]/table/tbody/tr[3]';
const MIKROTIK_CCQ_XPATH = '/html/body/div[3]/table/tbody/tr/td[2]/table/tbody/tr[3]/td/div/table[3]/tbody[31]';

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

async function collectDevice({ ip, vendor, credentials, protocol, onProgress = () => {} }) {
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

module.exports = { VENDORS, collectDevice };

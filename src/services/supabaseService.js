const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const supabase = supabaseUrl && supabaseSecretKey
  ? createClient(supabaseUrl, supabaseSecretKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

async function persistCollection(collection) {
  if (!supabase) return { persisted: false, reason: 'Supabase não configurado.' };
  const { device, clients } = collection;
  const { data: savedDevice, error: deviceError } = await supabase
    .from('devices')
    .upsert({ ip: device.ip, vendor: device.vendor, identity: device.identity, uptime: device.uptime, last_collected_at: device.collectedAt }, { onConflict: 'ip' })
    .select('id')
    .single();
  if (deviceError) throw deviceError;

  if (clients.length) {
    const { error: clientError } = await supabase.from('client_samples').insert(clients.map((client) => ({
      device_id: savedDevice.id,
      radio_name: client.radioName,
      mac: client.mac,
      uptime: client.uptime,
      tx_rx_signal_strength: client.txRxSignalStrength,
      tx_rx_ccq: client.txRxCcq,
      collected_at: device.collectedAt
    })));
    if (clientError) throw clientError;
  }

  const { data: historyItem, error: historyError } = await supabase
    .from('collection_history')
    .insert({
      device_id: savedDevice.id,
      ip: device.ip,
      vendor: device.vendor,
      vendor_label: device.vendorLabel,
      identity: device.identity,
      uptime: device.uptime,
      client_count: clients.length,
      clients,
      collected_at: device.collectedAt
    })
    .select('id')
    .single();
  if (historyError) throw historyError;

  return { persisted: true, historyId: historyItem.id };
}

async function persistCollectionFailure({ ip, vendor = 'unknown', vendorLabel = null, identity = null, errorMessage }) {
  if (!supabase) return { persisted: false, reason: 'Supabase não configurado.' };
  const { data, error } = await supabase
    .from('collection_history')
    .insert({
      ip,
      vendor: vendor || 'unknown',
      vendor_label: vendorLabel,
      identity,
      status: 'failure',
      error_message: errorMessage || 'Falha durante a coleta.',
      client_count: 0,
      clients: [],
      collected_at: new Date().toISOString()
    })
    .select('id')
    .single();
  if (error) throw error;
  return { persisted: true, historyId: data.id };
}

async function listCollectionHistory({ limit = 30, page = 1, ip = '', vendor = '', from = '', to = '', status = '' } = {}) {
  if (!supabase) return { history: [], reason: 'Supabase não configurado.' };
  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  let query = supabase
    .from('collection_history')
    .select('id, ip, vendor, vendor_label, identity, uptime, client_count, clients, collected_at, status, error_message', { count: 'exact' })
    .order('collected_at', { ascending: false });
  if (ip) query = query.eq('ip', ip);
  if (vendor) query = query.eq('vendor', vendor);
  if (from) query = query.gte('collected_at', /^\d{4}-\d{2}-\d{2}$/.test(from) ? `${from}T00:00:00.000Z` : from);
  if (to) query = query.lte('collected_at', /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999Z` : to);
  if (status === 'success') query = query.eq('status', 'success');
  if (status === 'failure' || status === 'error') query = query.eq('status', 'failure');
  const { data, error, count } = await query.range((safePage - 1) * safeLimit, safePage * safeLimit - 1);
  if (error) throw error;
  const history = data || [];
  const total = count ?? history.length;
  return { history, total, page: safePage, pageSize: safeLimit, totalPages: Math.ceil(total / safeLimit) };
}

async function deleteCollectionHistory(id) {
  if (!supabase) return { deleted: false, reason: 'Supabase não configurado.' };
  const { error, count } = await supabase
    .from('collection_history')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) throw error;
  return { deleted: count === 1 };
}

module.exports = { persistCollection, persistCollectionFailure, listCollectionHistory, deleteCollectionHistory };

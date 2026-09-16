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

async function listCollectionHistory(limit = 30) {
  if (!supabase) return { history: [], reason: 'Supabase não configurado.' };
  const { data, error } = await supabase
    .from('collection_history')
    .select('id, ip, vendor, vendor_label, identity, uptime, client_count, clients, collected_at')
    .order('collected_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return { history: data };
}

module.exports = { persistCollection, listCollectionHistory };

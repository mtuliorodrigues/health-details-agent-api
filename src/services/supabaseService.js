const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const ownerId = process.env.SUPABASE_OWNER_ID;
const supabase = supabaseUrl && supabaseSecretKey && ownerId
  ? createClient(supabaseUrl, supabaseSecretKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

async function persistCollection(collection) {
  if (!supabase) return { persisted: false, reason: 'Supabase não configurado.' };
  const { device, clients } = collection;
  const { data: savedDevice, error: deviceError } = await supabase
    .from('devices')
    .upsert({ ip: device.ip, vendor: device.vendor, identity: device.identity, uptime: device.uptime, owner_id: ownerId, last_collected_at: device.collectedAt }, { onConflict: 'ip' })
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
  return { persisted: true };
}

module.exports = { persistCollection };

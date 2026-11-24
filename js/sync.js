import {
  clearSyncChange, completeSyncChange, deleteRecord, getAll, getSyncConflicts,
  getSyncMetadata, getSyncQueue, queueSyncChange, removeSyncConflict,
  saveRecord, saveSyncConflict, saveSyncMetadata
} from './storage.js';
import { getActiveAccountId, getAuthState, getSupabaseClient } from './cloud.js';

const RESOURCES = ['clients', 'services', 'quotes'];
let synchronization;

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sameRecord(first, second) {
  return first !== null && second !== null && stableJson(first) === stableJson(second);
}

export function needsManualReview({ pending, local, remote }) {
  if (!remote) return false;
  const operation = pending?.operation || (local ? 'upsert' : null);
  const desired = pending ? pending.payload : local;
  if (operation === 'delete' && remote.deletedAt) return false;
  if (operation === 'upsert' && !remote.deletedAt && sameRecord(desired, remote.payload)) return false;
  if (pending) return !pending.baseUpdatedAt || pending.baseUpdatedAt !== remote.updatedAt;
  return Boolean(local) && (Boolean(remote.deletedAt) || !sameRecord(local, remote.payload));
}

function remoteRecord(resource, row) {
  const id = resource === 'quotes' ? row.quote_date : row.id;
  if (typeof id !== 'string' || !id || !row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)) {
    throw new Error(`O Supabase retornou um registro inválido em ${resource}.`);
  }
  if (resource === 'quotes' ? row.payload.date !== id : row.payload.id !== id) {
    throw new Error(`O identificador do registro retornado em ${resource} não corresponde aos dados.`);
  }
  if (typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))) {
    throw new Error(`O Supabase retornou uma data de atualização inválida em ${resource}.`);
  }
  return {
    key: `${resource}:${id}`,
    resource,
    id,
    payload: row.payload,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at || null
  };
}

async function fetchRemoteRecords(supabase, resource) {
  const records = [];
  for (let offset = 0; ; offset += 1000) {
    const columns = resource === 'quotes'
      ? 'quote_date,payload,updated_at'
      : 'id,payload,updated_at,deleted_at';
    const { data, error } = await supabase.from(resource).select(columns).range(offset, offset + 999);
    if (error) throw new Error(`Não foi possível baixar ${resource} do Supabase: ${error.message}`);
    records.push(...data.map(row => remoteRecord(resource, row)));
    if (data.length < 1000) return records;
  }
}

function currentLocalQuote(id) {
  if (localStorage.getItem('cafeflow-quote-date') !== id) return null;
  return {
    date: id,
    rate: localStorage.getItem('cafeflow-quote-rate'),
    sacks: localStorage.getItem('cafeflow-quote-sacks')
  };
}

async function applyRemoteRecord(record) {
  if (record.resource === 'quotes') {
    if (record.id === localStorage.getItem('cafeflow-quote-date')) {
      localStorage.setItem('cafeflow-quote-rate', record.payload.rate);
      localStorage.setItem('cafeflow-quote-sacks', record.payload.sacks);
    }
    return;
  }
  if (record.deletedAt) await deleteRecord(record.resource, record.id);
  else await saveRecord(record.resource, record.payload);
}

async function setCloudQuoteAsDeleted(id) {
  if (localStorage.getItem('cafeflow-quote-date') !== id) return;
  ['cafeflow-quote-date', 'cafeflow-quote-rate', 'cafeflow-quote-sacks'].forEach(key => localStorage.removeItem(key));
}

async function addConflict({ userId, record, pending, local }) {
  const key = record.key;
  const latestPending = (await getSyncQueue(userId)).find(change => change.key === key) || pending;
  let latestLocal = local;
  if (record.resource === 'clients' || record.resource === 'services') {
    latestLocal = (await getAll(record.resource)).find(item => item.id === record.id) || null;
  } else {
    latestLocal = currentLocalQuote(record.id);
  }
  await saveSyncConflict({
    key,
    userId,
    resource: record.resource,
    id: record.id,
    localOperation: latestPending?.operation || (latestLocal ? 'upsert' : 'delete'),
    localPayload: latestPending ? latestPending.payload : latestLocal,
    pendingRevision: latestPending?.revision ?? null,
    remotePayload: record.deletedAt ? null : record.payload,
    remoteDeletedAt: record.deletedAt,
    remoteUpdatedAt: record.updatedAt,
    detectedAt: Date.now()
  });
}

async function pushChange(supabase, change) {
  const deletedAt = change.operation === 'delete' ? new Date().toISOString() : null;
  const payload = change.payload;
  let result;
  if (change.resource === 'quotes') {
    result = await supabase.from('quotes').upsert({
      quote_date: change.id,
      payload
    }, { onConflict: 'owner_id,quote_date' }).select('updated_at').single();
  } else {
    result = await supabase.from(change.resource).upsert({
      id: change.id,
      payload,
      deleted_at: deletedAt
    }, { onConflict: 'owner_id,id' }).select('updated_at').single();
  }
  if (result.error) throw new Error(`Não foi possível enviar ${change.resource} para o Supabase: ${result.error.message}`);
  const updatedAt = result.data?.updated_at;
  if (typeof updatedAt !== 'string') throw new Error(`O Supabase não confirmou a atualização de ${change.resource}.`);
  await completeSyncChange(change.resource, change.id, change.revision, {
    updatedAt,
    deletedAt,
    payload
  });
}

async function runSynchronization() {
  if (!navigator.onLine) throw new Error('Sem conexão. As alterações ficam neste aparelho e serão sincronizadas quando voltar a ficar online.');
  const { session, accountMismatch } = await getAuthState();
  if (!session?.user?.id) throw new Error('Entre na conta CafeFlow para sincronizar.');
  if (accountMismatch) throw new Error('Este aparelho está vinculado a outra conta CafeFlow.');
  const userId = session.user.id;
  const activeAccountId = getActiveAccountId();
  if (activeAccountId !== userId) throw new Error('A conta ativa neste aparelho não corresponde à sessão do Supabase.');
  const supabase = await getSupabaseClient();
  const remoteByKey = new Map();
  for (const resource of RESOURCES) {
    for (const record of await fetchRemoteRecords(supabase, resource)) remoteByKey.set(record.key, record);
  }

  const [localClients, localServices, pendingChanges, existingConflicts] = await Promise.all([
    getAll('clients'),
    getAll('services'),
    getSyncQueue(userId),
    getSyncConflicts(userId)
  ]);
  const localByKey = new Map();
  localClients.forEach(record => localByKey.set(`clients:${record.id}`, record));
  localServices.forEach(record => localByKey.set(`services:${record.id}`, record));
  const quoteDate = localStorage.getItem('cafeflow-quote-date');
  if (quoteDate) localByKey.set(`quotes:${quoteDate}`, currentLocalQuote(quoteDate));
  const pendingByKey = new Map(pendingChanges.map(change => [change.key, change]));
  const conflictByKey = new Map(existingConflicts.map(conflict => [conflict.key, conflict]));
  let pulled = 0;
  let pushed = 0;

  for (const record of remoteByKey.values()) {
    const pending = pendingByKey.get(record.key);
    const local = localByKey.get(record.key) || null;
    const existingConflict = conflictByKey.get(record.key);
    if (existingConflict) {
      await saveSyncConflict({
        ...existingConflict,
        remotePayload: record.deletedAt ? null : record.payload,
        remoteDeletedAt: record.deletedAt,
        remoteUpdatedAt: record.updatedAt
      });
      continue;
    }
    if (needsManualReview({ pending, local, remote: record })) {
      await addConflict({ userId, record, pending, local });
      conflictByKey.set(record.key, true);
      continue;
    }
    if (pending) {
      if ((pending.operation === 'upsert' && !record.deletedAt && sameRecord(pending.payload, record.payload)) ||
          (pending.operation === 'delete' && record.deletedAt)) {
        await clearSyncChange(record.key, pending.revision);
        await saveSyncMetadata(record.resource, record.id, {
          updatedAt: record.updatedAt,
          deletedAt: record.deletedAt,
          payload: record.payload
        });
        pendingByKey.delete(record.key);
      }
      continue;
    }
    if (!local || !sameRecord(local, record.deletedAt ? null : record.payload)) {
      await applyRemoteRecord(record);
      pulled += 1;
    }
    await saveSyncMetadata(record.resource, record.id, {
      updatedAt: record.updatedAt,
      deletedAt: record.deletedAt,
      payload: record.payload
    });
  }

  for (const change of pendingByKey.values()) {
    if (conflictByKey.has(change.key)) continue;
    if (change.operation === 'delete' && !remoteByKey.has(change.key)) {
      await clearSyncChange(change.key, change.revision);
      continue;
    }
    const remote = remoteByKey.get(change.key);
    if (remote && needsManualReview({ pending: change, local: localByKey.get(change.key) || null, remote })) {
      await addConflict({ userId, record: remote, pending: change, local: localByKey.get(change.key) || null });
      conflictByKey.set(change.key, true);
      continue;
    }
    await pushChange(supabase, change);
    pushed += 1;
  }

  return {
    pulled,
    pushed,
    conflicts: (await getSyncConflicts(userId)).length,
    completedAt: Date.now()
  };
}

export function synchronize() {
  if (!synchronization) {
    synchronization = runSynchronization().finally(() => { synchronization = null; });
  }
  return synchronization;
}

export async function resolveSyncConflict(key, choice) {
  if (!['local', 'cloud'].includes(choice)) throw new Error('Escolha de resolução inválida.');
  const conflicts = await getSyncConflicts(getActiveAccountId());
  const conflict = conflicts.find(item => item.key === key);
  if (!conflict) throw new Error('Este conflito já foi resolvido ou não está disponível.');
  if (choice === 'local') {
    if (conflict.resource === 'clients' || conflict.resource === 'services') {
      if (conflict.localOperation === 'delete') await deleteRecord(conflict.resource, conflict.id);
      else if (conflict.localPayload) await saveRecord(conflict.resource, conflict.localPayload);
    } else if (conflict.localPayload) {
      localStorage.setItem('cafeflow-quote-date', conflict.localPayload.date);
      localStorage.setItem('cafeflow-quote-rate', conflict.localPayload.rate);
      localStorage.setItem('cafeflow-quote-sacks', conflict.localPayload.sacks);
    }
    await queueSyncChange(
      conflict.resource,
      conflict.id,
      conflict.localOperation,
      conflict.localPayload,
      conflict.userId,
      conflict.remoteUpdatedAt
    );
  } else {
    if (conflict.resource === 'quotes' && conflict.remotePayload) {
      if (conflict.id === localStorage.getItem('cafeflow-quote-date')) {
        localStorage.setItem('cafeflow-quote-rate', conflict.remotePayload.rate);
        localStorage.setItem('cafeflow-quote-sacks', conflict.remotePayload.sacks);
      }
    } else if (conflict.remotePayload) {
      await saveRecord(conflict.resource, conflict.remotePayload);
    } else if (conflict.resource === 'quotes') {
      await setCloudQuoteAsDeleted(conflict.id);
    } else {
      await deleteRecord(conflict.resource, conflict.id);
    }
    await clearSyncChange(conflict.key);
    await saveSyncMetadata(conflict.resource, conflict.id, {
      updatedAt: conflict.remoteUpdatedAt,
      deletedAt: conflict.remoteDeletedAt,
      payload: conflict.remotePayload
    });
  }
  await removeSyncConflict(conflict.key);
}

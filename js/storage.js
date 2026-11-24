// Persistência local: IndexedDB, cópia de segurança e restauração.
import { capacities, statuses, parseLocalizedNumber } from './domain.js';

const DB_NAME = 'cafeflow-db';
const DB_VERSION = 1;
const BACKUP_FORMAT = 'cafeflow-backup';
const BACKUP_VERSION = 1;
export const BACKUP_MAX_BYTES = 10 * 1024 * 1024;
let db;

export function initializeStorage() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('clients')) database.createObjectStore('clients', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('services')) database.createObjectStore('services', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      db = request.result;
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

export function getAll(store) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function saveRecord(store, record) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, 'readwrite');
    transaction.objectStore(store).put(record);
    transaction.oncomplete = () => resolve(record);
    transaction.onerror = () => reject(transaction.error);
  });
}

export function deleteRecord(store, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, 'readwrite');
    transaction.objectStore(store).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertAllowedKeys(value, allowed, label) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error(`${label}: o arquivo contém campos não reconhecidos.`);
}

function assertOptionalTimestamp(value, label) {
  if (value !== undefined && value !== null && (!Number.isFinite(value) || value < 0)) throw new Error(`${label}: data inválida.`);
}

function validateBackupClient(client, index) {
  const label = `Cliente ${index + 1}`;
  if (!isPlainObject(client)) throw new Error(`${label}: registro inválido.`);
  assertAllowedKeys(client, ['id', 'name', 'phone', 'createdAt'], label);
  if (typeof client.id !== 'string' || !client.id.trim() || client.id.length > 200 ||
      typeof client.name !== 'string' || !client.name.trim() || client.name.length > 90 ||
      typeof client.phone !== 'string' || client.phone.length > 25 ||
      !Number.isFinite(client.createdAt) || client.createdAt < 0) {
    throw new Error(`${label}: confira o identificador, nome, telefone e data.`);
  }
}

function validateBackupCoffeePayment(payment, label) {
  if (payment === null) return;
  if (!isPlainObject(payment)) throw new Error(`${label}: dados do pagamento em café inválidos.`);
  const numericFields = ['grossWeight', 'sacks', 'feeWeight', 'netWeight', 'quoteRate', 'amount'];
  const optionalNumericFields = ['dryersUsed', 'dryingFeeWeight', 'dryingAmount', 'hullingFeeWeight', 'hullingAmount', 'netSacks', 'calculatedAt'];
  assertAllowedKeys(payment, [...numericFields, ...optionalNumericFields], label);
  if (numericFields.some(key => !Number.isFinite(payment[key]) || payment[key] < 0) ||
      optionalNumericFields.some(key => payment[key] !== undefined && (!Number.isFinite(payment[key]) || payment[key] < 0)) ||
      (payment.dryersUsed !== undefined && !Number.isInteger(payment.dryersUsed))) {
    throw new Error(`${label}: valores do pagamento em café inválidos.`);
  }
}

function validateBackupService(service, index) {
  const label = `Serviço ${index + 1}`;
  const allowed = ['id', 'clientId', 'bagSize', 'bagQty', 'bagNumbers', 'status', 'createdAt', 'dryer', 'startedDryingAt', 'readyAt', 'startedHullingAt', 'finishedAt', 'finalWeight', 'bagWeights', 'grossWeight', 'bagTareKg', 'bagTareTotal', 'warehouseAt', 'paymentMethod', 'serviceValue', 'coffeePayment'];
  if (!isPlainObject(service)) throw new Error(`${label}: registro inválido.`);
  assertAllowedKeys(service, allowed, label);
  if (typeof service.id !== 'string' || !service.id.trim() || service.id.length > 200 ||
      typeof service.clientId !== 'string' || !service.clientId.trim() ||
      !Object.prototype.hasOwnProperty.call(capacities, service.bagSize) ||
      !Number.isInteger(service.bagQty) || service.bagQty < 1 || service.bagQty > 500 ||
      !Array.isArray(service.bagNumbers) || service.bagNumbers.length !== service.bagQty ||
      service.bagNumbers.some(number => typeof number !== 'string' || !number.trim() || number.length > 100) ||
      new Set(service.bagNumbers).size !== service.bagNumbers.length ||
      !Object.prototype.hasOwnProperty.call(statuses, service.status) ||
      !Number.isFinite(service.createdAt) || service.createdAt < 0) {
    throw new Error(`${label}: confira cliente, bags, status e data.`);
  }
  if (service.dryer !== undefined && service.dryer !== null && ![1, 2].includes(service.dryer)) throw new Error(`${label}: secador inválido.`);
  ['startedDryingAt', 'readyAt', 'startedHullingAt', 'finishedAt', 'warehouseAt'].forEach(key => assertOptionalTimestamp(service[key], label));
  if (service.finalWeight !== undefined && service.finalWeight !== null && (!Number.isFinite(service.finalWeight) || service.finalWeight <= 0)) throw new Error(`${label}: peso final inválido.`);
  ['grossWeight', 'bagTareKg', 'bagTareTotal'].forEach(key => {
    if (service[key] !== undefined && (!Number.isFinite(service[key]) || service[key] <= 0)) throw new Error(`${label}: peso ou tara inválidos.`);
  });
  if (service.bagWeights !== undefined && (!Array.isArray(service.bagWeights) || service.bagWeights.length > service.bagQty ||
      service.bagWeights.some(item => !isPlainObject(item) || Object.keys(item).some(key => !['bagNumber', 'weight'].includes(key)) ||
        !service.bagNumbers.includes(item.bagNumber) || !Number.isFinite(item.weight) || item.weight <= 0))) {
    throw new Error(`${label}: pesos por bag inválidos.`);
  }
  if (service.paymentMethod !== undefined && !['manual', 'coffee'].includes(service.paymentMethod)) throw new Error(`${label}: forma de pagamento inválida.`);
  if (service.serviceValue !== undefined && (!Number.isFinite(service.serviceValue) || service.serviceValue < 0)) throw new Error(`${label}: valor do serviço inválido.`);
  if (service.coffeePayment !== undefined) validateBackupCoffeePayment(service.coffeePayment, label);
}

function validateBackupQuote(quote) {
  if (quote === undefined) return;
  if (!isPlainObject(quote)) throw new Error('Cotação do backup inválida.');
  assertAllowedKeys(quote, ['date', 'rate', 'sacks'], 'Cotação');
  if (quote.date !== null && (typeof quote.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(quote.date))) throw new Error('Data da cotação inválida.');
  for (const key of ['rate', 'sacks']) {
    if (quote[key] !== null && (typeof quote[key] !== 'string' || parseLocalizedNumber(quote[key]) === null ||
        !Number.isFinite(parseLocalizedNumber(quote[key])) || parseLocalizedNumber(quote[key]) < 0)) {
      throw new Error('Valores da cotação inválidos.');
    }
  }
}

export function validateBackup(data) {
  if (!isPlainObject(data) || data.format !== BACKUP_FORMAT || data.version !== BACKUP_VERSION ||
      !isPlainObject(data.data) || !Array.isArray(data.data.clients) || !Array.isArray(data.data.services) ||
      data.data.clients.length > 50000 || data.data.services.length > 50000) {
    throw new Error('Arquivo inválido ou versão de backup não reconhecida.');
  }
  if (typeof data.exportedAt !== 'string' || !Number.isFinite(Date.parse(data.exportedAt))) throw new Error('Data de exportação inválida.');
  assertAllowedKeys(data, ['format', 'version', 'exportedAt', 'data'], 'Backup');
  assertAllowedKeys(data.data, ['clients', 'services', 'quote'], 'Dados do backup');
  data.data.clients.forEach(validateBackupClient);
  data.data.services.forEach(validateBackupService);
  if (new Set(data.data.clients.map(client => client.id)).size !== data.data.clients.length ||
      new Set(data.data.services.map(service => service.id)).size !== data.data.services.length) {
    throw new Error('O backup contém identificadores repetidos.');
  }
  validateBackupQuote(data.data.quote);
  return data;
}

function backupQuote() {
  return {
    date: localStorage.getItem('cafeflow-quote-date'),
    rate: localStorage.getItem('cafeflow-quote-rate'),
    sacks: localStorage.getItem('cafeflow-quote-sacks')
  };
}

export async function createBackup() {
  const backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: { clients: await getAll('clients'), services: await getAll('services'), quote: backupQuote() }
  };
  validateBackup(backup);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  if (blob.size > BACKUP_MAX_BYTES) throw new Error('O backup excede o limite de 10 MB aceito na restauração.');
  return { blob, backup };
}

export async function parseBackupFile(file) {
  if (file.size > BACKUP_MAX_BYTES) throw new Error('O arquivo excede o limite de 10 MB.');
  return validateBackup(JSON.parse(await file.text()));
}

export function restoreBackupAtomic(backup, mode) {
  return new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = db.transaction(['clients', 'services'], 'readwrite');
    } catch (error) {
      reject(error);
      return;
    }
    let currentClients;
    let currentServices;
    let result;
    let applied = false;
    const apply = () => {
      if (applied || !currentClients || !currentServices) return;
      applied = true;
      const clientStore = transaction.objectStore('clients');
      const serviceStore = transaction.objectStore('services');
      if (mode === 'replace') {
        clientStore.clear();
        serviceStore.clear();
        backup.data.clients.forEach(client => clientStore.put(client));
        backup.data.services.forEach(service => serviceStore.put(service));
        result = { clientsImported: backup.data.clients.length, servicesImported: backup.data.services.length, clientsSkipped: 0, servicesSkipped: 0 };
        return;
      }
      const clientIds = new Set(currentClients.map(client => client.id));
      const serviceIds = new Set(currentServices.map(service => service.id));
      const newClients = backup.data.clients.filter(client => !clientIds.has(client.id));
      const newServices = backup.data.services.filter(service => !serviceIds.has(service.id));
      newClients.forEach(client => clientStore.put(client));
      newServices.forEach(service => serviceStore.put(service));
      result = {
        clientsImported: newClients.length,
        servicesImported: newServices.length,
        clientsSkipped: backup.data.clients.length - newClients.length,
        servicesSkipped: backup.data.services.length - newServices.length
      };
    };
    const clientsRequest = transaction.objectStore('clients').getAll();
    const servicesRequest = transaction.objectStore('services').getAll();
    clientsRequest.onsuccess = () => { currentClients = clientsRequest.result; apply(); };
    servicesRequest.onsuccess = () => { currentServices = servicesRequest.result; apply(); };
    clientsRequest.onerror = () => transaction.abort();
    servicesRequest.onerror = () => transaction.abort();
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error('Falha ao restaurar o backup.'));
    transaction.onabort = () => reject(transaction.error || new Error('A restauração foi cancelada pelo armazenamento local.'));
  });
}

export function restoreBackupQuote(quote, mode) {
  if (mode === 'merge' && localStorage.getItem('cafeflow-quote-date')) return;
  if (mode === 'replace' && !quote) {
    ['cafeflow-quote-date', 'cafeflow-quote-rate', 'cafeflow-quote-sacks'].forEach(key => localStorage.removeItem(key));
    return;
  }
  if (!quote) return;
  [['cafeflow-quote-date', quote.date], ['cafeflow-quote-rate', quote.rate], ['cafeflow-quote-sacks', quote.sacks]].forEach(([key, value]) => {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  });
}

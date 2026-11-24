// Regras de negócio puras: validação, cálculos e transições de serviço.
export const statuses = {
  aguardando_secagem: 'Aguardando secagem',
  em_secagem: 'Em secagem',
  aguardando_pilagem: 'Aguardando pilagem',
  em_pilagem: 'Em pilagem',
  finalizado: 'Finalizado'
};

export const capacities = { Pequeno: '900 kg', Médio: '1.200 kg', Grande: '1.500 kg' };
export const capacityKgPerBag = { Pequeno: 900, Médio: 1200, Grande: 1500 };

export function parseLocalizedNumber(value) {
  const raw = String(value ?? '').trim().replace(/\s/g, '');
  if (!raw) return null;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return NaN;
  return Number(normalized);
}

export function parseBagNumbers(value) {
  return String(value ?? '').split(',').map(number => number.trim()).filter(Boolean);
}

export function createServiceRecord({ clientId, bagSize, quantity, bagNumbers, existingServices, id, createdAt }) {
  const bagQty = parseLocalizedNumber(quantity);
  const numbers = parseBagNumbers(bagNumbers);
  if (!Number.isInteger(bagQty) || bagQty < 1 || bagQty > 500) return { error: 'Informe uma quantidade inteira de bags entre 1 e 500.' };
  if (numbers.length !== bagQty) return { error: `Informe exatamente ${bagQty} numeração(ões) de saco, separadas por vírgula.` };
  if (new Set(numbers).size !== numbers.length) return { error: 'Não repita a numeração de um bag no mesmo serviço.' };
  if (!Object.prototype.hasOwnProperty.call(capacities, bagSize)) return { error: 'Selecione um tamanho de saco válido.' };
  if (existingServices.some(service => service.status !== 'finalizado' && service.bagNumbers.some(number => numbers.includes(number)))) {
    return { error: 'Uma dessas numerações já está em um serviço ativo.' };
  }
  return {
    service: {
      id, clientId, bagSize, bagQty, bagNumbers: numbers,
      status: 'aguardando_secagem', createdAt, dryer: null, finalWeight: null
    }
  };
}

export function updateServiceBags({ service, quantity, bagNumbers, existingServices }) {
  if (!service) return { error: 'Serviço não encontrado.' };
  const bagQty = parseLocalizedNumber(quantity);
  const numbers = parseBagNumbers(bagNumbers);
  if (!Number.isInteger(bagQty) || bagQty < 1 || bagQty > 500) return { error: 'Informe uma quantidade inteira de bags entre 1 e 500.' };
  if (numbers.length !== bagQty) return { error: `Informe exatamente ${bagQty} numeração(ões) de bag, separadas por vírgula.` };
  if (new Set(numbers).size !== numbers.length) return { error: 'Não repita a numeração de um bag no mesmo serviço.' };
  if (service.status === 'finalizado' && service.bagWeights?.length &&
      (numbers.length !== service.bagNumbers.length || numbers.some(number => !service.bagNumbers.includes(number)))) {
    return { error: 'Não é possível alterar os bags após registrar os pesos individuais.' };
  }
  if (existingServices.some(item => item.id !== service.id && item.status !== 'finalizado' && item.bagNumbers.some(number => numbers.includes(number)))) {
    return { error: 'Uma dessas numerações já está em outro serviço ativo.' };
  }
  return { patch: { bagQty, bagNumbers: numbers } };
}

export function calculateTareAdjustedWeight(rawWeights, rawTarePerBag) {
  const weights = rawWeights.map(weight => parseLocalizedNumber(weight));
  const validWeights = weights.filter(weight => Number.isFinite(weight) && weight > 0);
  const grossWeight = validWeights.reduce((total, weight) => total + weight, 0);
  const missing = weights.length - validWeights.length;
  if (!Number.isFinite(grossWeight)) return { grossWeight, missing, error: 'Peso bruto excede o limite permitido.' };
  if (missing) return { grossWeight, missing, error: 'Informe um peso válido maior que zero para cada bag.' };

  const tarePerBag = parseLocalizedNumber(rawTarePerBag);
  if (!Number.isFinite(tarePerBag) || tarePerBag <= 0) return { grossWeight, missing, error: 'Informe um peso válido maior que zero para a tara do bag.' };
  if (weights.some(weight => tarePerBag >= weight)) return { grossWeight, missing, error: 'A tara por bag deve ser menor que o peso bruto de cada bag.' };

  const bagTareTotal = tarePerBag * weights.length;
  const finalWeight = grossWeight - bagTareTotal;
  if (!Number.isFinite(bagTareTotal) || !Number.isFinite(finalWeight)) return { grossWeight, missing, error: 'O peso total excede o limite permitido.' };
  if (finalWeight <= 0) return { grossWeight, missing, error: 'O desconto da tara deve ser menor que o peso bruto total.' };
  return { weights, grossWeight, tarePerBag, bagTareTotal, finalWeight, missing: 0 };
}

export function finalizeService(service, rawWeights, rawTarePerBag, finishedAt) {
  if (!service) return { error: 'Serviço não encontrado.' };
  if (rawWeights.length !== service.bagNumbers.length) return { error: 'Informe um peso válido maior que zero para cada bag.' };
  const result = calculateTareAdjustedWeight(rawWeights, rawTarePerBag);
  if (result.error) return result;
  return {
    patch: {
      status: 'finalizado',
      bagWeights: result.weights.map((weight, index) => ({ bagNumber: service.bagNumbers[index], weight })),
      grossWeight: result.grossWeight,
      bagTareKg: result.tarePerBag,
      bagTareTotal: result.bagTareTotal,
      finalWeight: result.finalWeight,
      finishedAt
    }
  };
}

export function serviceWeightBreakdown(service) {
  const netWeight = service.finalWeight == null ? null : Number(service.finalWeight);
  const rawTarePerBag = Number(service.bagTareKg);
  const tarePerBag = Number.isFinite(rawTarePerBag) && rawTarePerBag > 0 ? rawTarePerBag : 0;
  const storedTareTotal = Number(service.bagTareTotal);
  const tareTotal = service.bagTareTotal != null && Number.isFinite(storedTareTotal)
    ? storedTareTotal
    : tarePerBag * Number(service.bagQty || 0);
  const storedGrossWeight = Number(service.grossWeight);
  const grossWeight = service.grossWeight != null && Number.isFinite(storedGrossWeight)
    ? storedGrossWeight
    : Number.isFinite(netWeight) ? netWeight + tareTotal : null;
  return { grossWeight, tarePerBag, tareTotal, netWeight };
}

// No pagamento em café, a secagem é fixa por secador e a pilagem é proporcional às sacas.
export function calculateCoffeePayment(service, rawQuoteRate) {
  const grossWeight = Number(service?.finalWeight);
  if (!Number.isFinite(grossWeight) || grossWeight <= 0) return { error: 'O pagamento em café exige peso final registrado.' };
  const sacks = grossWeight / 60;
  const dryersUsed = service.dryer ? 1 : 0;
  const dryingFeeWeight = dryersUsed * 90;
  const hullingFeeWeight = sacks * 1.5;
  const feeWeight = dryingFeeWeight + hullingFeeWeight;
  const netWeight = grossWeight - feeWeight;
  const netSacks = netWeight / 60;
  const preview = { grossWeight, sacks, dryersUsed, dryingFeeWeight, hullingFeeWeight, feeWeight, netWeight, netSacks };
  const quoteRate = parseLocalizedNumber(rawQuoteRate);
  if (feeWeight > grossWeight) return { error: 'Os descontos de secagem e pilagem excedem o peso final do serviço.', preview };
  if (quoteRate === null || !Number.isFinite(quoteRate) || quoteRate < 0) return { error: 'Informe uma cotação válida por saca para calcular os valores.', preview };

  const dryingAmount = dryingFeeWeight / 60 * quoteRate;
  const hullingAmount = hullingFeeWeight / 60 * quoteRate;
  const amount = dryingAmount + hullingAmount;
  if (!Number.isFinite(amount)) return { error: 'O valor calculado excede o limite permitido.', preview };
  return {
    payment: {
      grossWeight, sacks, dryersUsed, dryingFeeWeight, dryingAmount,
      hullingFeeWeight, hullingAmount, feeWeight, netWeight, netSacks, quoteRate, amount
    }
  };
}

export function calculateQuote(rawPrice, rawQuantity) {
  const price = parseLocalizedNumber(rawPrice);
  const quantity = parseLocalizedNumber(rawQuantity);
  if (price === null || quantity === null) return { error: 'Informe o valor da cotação e a quantidade de sacas.' };
  if (!Number.isFinite(price) || price < 0 || !Number.isFinite(quantity) || quantity < 0) {
    return { error: 'Informe valores numéricos válidos, iguais ou maiores que zero.' };
  }
  const total = price * quantity;
  if (!Number.isFinite(total)) return { error: 'O valor estimado excede o limite permitido.' };
  return { price, quantity, total };
}

export function warehouseWeight(service) {
  const finalWeight = Number(service.finalWeight);
  if (Number.isFinite(finalWeight) && finalWeight > 0) return { kg: finalWeight, estimated: false };
  const perBag = capacityKgPerBag[service.bagSize];
  const estimate = Number.isFinite(perBag) ? perBag * Number(service.bagQty) : NaN;
  return { kg: Number.isFinite(estimate) ? estimate : null, estimated: true };
}

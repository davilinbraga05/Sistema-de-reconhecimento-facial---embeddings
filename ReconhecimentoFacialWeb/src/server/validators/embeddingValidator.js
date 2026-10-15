/**
 * Validador estrito de Embeddings Faciais
 * Garante que apenas vetores matematicamente válidos (128 dimensões numéricas finitas)
 * sejam processados ou persistidos pelo sistema.
 */

export const EMBEDDING_DIMENSION = 128;

/**
 * Valida um único descritor/embedding facial.
 * @param {Array|Float32Array} descriptor Vetor de entrada
 * @returns {{ valid: boolean, error?: string, normalized?: number[] }}
 */
export function validateEmbedding(descriptor) {
  if (!descriptor) {
    return { valid: false, error: 'O vetor de embedding não foi fornecido.' };
  }

  if (!Array.isArray(descriptor) && !(descriptor instanceof Float32Array)) {
    return { valid: false, error: 'O embedding deve ser um Array ou Float32Array de números.' };
  }

  if (descriptor.length !== EMBEDDING_DIMENSION) {
    return {
      valid: false,
      error: `Dimensão incorreta do embedding: esperado ${EMBEDDING_DIMENSION}, recebido ${descriptor.length}.`
    };
  }

  const cleanVector = new Array(EMBEDDING_DIMENSION);
  let sumSq = 0;

  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    const val = Number(descriptor[i]);
    if (!Number.isFinite(val) || Number.isNaN(val)) {
      return {
        valid: false,
        error: `Valor inválido ou não finito no índice ${i} do embedding: ${descriptor[i]}`
      };
    }
    cleanVector[i] = val;
    sumSq += val * val;
  }

  const norm = Math.sqrt(sumSq);
  if (norm === 0) {
    return { valid: false, error: 'Vetor de embedding nulo (norma igual a zero).' };
  }

  return { valid: true, vector: cleanVector, norm };
}

/**
 * Valida uma lista de amostras de embeddings para cadastro facial.
 * Exige entre minSamples e maxSamples amostras válidas.
 * @param {Array} samples Lista de embeddings
 * @param {number} minSamples Mínimo de amostras (padrão 5)
 * @param {number} maxSamples Máximo de amostras (padrão 8)
 * @returns {{ valid: boolean, error?: string, vectors?: number[][] }}
 */
export function validateEmbeddingBatch(samples, minSamples = 5, maxSamples = 8) {
  if (!Array.isArray(samples)) {
    return { valid: false, error: 'As amostras devem ser fornecidas como um array.' };
  }

  if (samples.length < minSamples) {
    return {
      valid: false,
      error: `Quantidade insuficiente de amostras: fornecidas ${samples.length}, mínimo exigido ${minSamples}.`
    };
  }

  if (samples.length > maxSamples) {
    return {
      valid: false,
      error: `Quantidade excessiva de amostras: fornecidas ${samples.length}, máximo permitido ${maxSamples}.`
    };
  }

  const validVectors = [];
  for (let i = 0; i < samples.length; i++) {
    const res = validateEmbedding(samples[i]);
    if (!res.valid) {
      return {
        valid: false,
        error: `Amostra de embedding #${i + 1} inválida: ${res.error}`
      };
    }
    validVectors.push(res.vector);
  }

  return { valid: true, vectors: validVectors };
}

/**
 * Serviço de Reconhecimento Facial e Comparação Vetorial de Embeddings
 * Implementa cálculo de distância Euclidiana, agregação multi-amostras robusta,
 * avaliação de threshold, separação de ambiguidade e detecção de duplicidade.
 */

import { validateEmbedding } from '../validators/embeddingValidator.js';

/**
 * Calcula a distância Euclidiana d(A, B) entre dois vetores de 128 dimensões.
 * d(A,B) = sqrt(sum((A[i] - B[i])^2))
 * @param {number[]} a Vetor A
 * @param {number[]} b Vetor B
 * @returns {number} Distância Euclidiana (valores menores indicam maior similaridade)
 */
export function calculateEuclideanDistance(a, b) {
  if (a.length !== b.length) {
    throw new Error(`Dimensões incompatíveis: ${a.length} vs ${b.length}`);
  }

  let sumSq = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq);
}

/**
 * Agrega as distâncias entre o vetor de entrada e as múltiplas amostras de um usuário.
 * Para evitar falsos positivos provocados por um único frame anômalo,
 * utiliza a média das K melhores correspondências (K = min(3, total_amostras)).
 * @param {number[]} probeVector Vetor capturado pela webcam
 * @param {number[][]} userSamples Lista de amostras do usuário armazenadas no banco
 * @returns {{ aggregatedDistance: number, minDistance: number, sampleDistances: number[] }}
 */
export function evaluateUserDistance(probeVector, userSamples) {
  if (!userSamples || userSamples.length === 0) {
    return { aggregatedDistance: Infinity, minDistance: Infinity, sampleDistances: [] };
  }

  const distances = userSamples.map(sample => calculateEuclideanDistance(probeVector, sample));
  distances.sort((a, b) => a - b);

  const k = Math.min(3, distances.length);
  const bestK = distances.slice(0, k);
  const sumBestK = bestK.reduce((acc, val) => acc + val, 0);
  const aggregatedDistance = sumBestK / k;

  return {
    aggregatedDistance,
    minDistance: distances[0],
    sampleDistances: distances
  };
}

/**
 * Realiza o reconhecimento facial comparando o vetor de entrada contra todos os usuários cadastrados.
 * @param {number[]} probeVector Vetor de 128 dimensões
 * @param {Array<{ id: number, name: string, is_active: number, samples: number[][] }>} candidates
 * @param {{ threshold: number, ambiguityMargin: number }} config
 * @returns {Object} Decisão estruturada
 */
export function recognizeFace(probeVector, candidates, config = {}) {
  const threshold = config.threshold ?? 0.55;
  const ambiguityMargin = config.ambiguityMargin ?? 0.05;

  const validRes = validateEmbedding(probeVector);
  if (!validRes.valid) {
    return {
      access: 'DENIED',
      status: 'INVALID_EMBEDDING',
      reason: `Embedding inválido: ${validRes.error}`,
      distance: null
    };
  }

  if (!candidates || candidates.length === 0) {
    return {
      access: 'DENIED',
      status: 'NO_USERS',
      reason: 'Nenhum usuário cadastrado no sistema.',
      distance: null
    };
  }

  // Avalia cada usuário candidato
  const evaluatedCandidates = candidates
    .filter(u => u.samples && u.samples.length > 0)
    .map(user => {
      const { aggregatedDistance, minDistance, sampleDistances } = evaluateUserDistance(probeVector, user.samples);
      return {
        id: user.id,
        name: user.name,
        is_active: Boolean(user.is_active),
        distance: aggregatedDistance,
        minDistance,
        sampleCount: user.samples.length,
        sampleDistances
      };
    });

  if (evaluatedCandidates.length === 0) {
    return {
      access: 'DENIED',
      status: 'NO_ACTIVE_EMBEDDINGS',
      reason: 'Nenhum embedding válido disponível para comparação.',
      distance: null
    };
  }

  // Ordena por distância agregada ascendente (menor distância = mais próximo)
  evaluatedCandidates.sort((a, b) => a.distance - b.distance);

  const bestCandidate = evaluatedCandidates[0];
  const secondCandidate = evaluatedCandidates.length > 1 ? evaluatedCandidates[1] : null;

  // 1. Verificação de Threshold
  if (bestCandidate.distance > threshold) {
    return {
      access: 'DENIED',
      status: 'UNKNOWN_FACE',
      reason: 'Rosto não reconhecido ou não autorizado (distância acima do threshold).',
      distance: Number(bestCandidate.distance.toFixed(4)),
      threshold,
      candidate: null // Não expõe dados do candidato não reconhecido
    };
  }

  // 2. Verificação de Ambiguidade (apenas se houver mais de um usuário)
  if (secondCandidate) {
    const margin = secondCandidate.distance - bestCandidate.distance;
    if (margin < ambiguityMargin) {
      return {
        access: 'DENIED',
        status: 'AMBIGUOUS_MATCH',
        reason: `Correspondência ambígua entre candidatos (${margin.toFixed(4)} < margem de ${ambiguityMargin}).`,
        distance: Number(bestCandidate.distance.toFixed(4)),
        secondDistance: Number(secondCandidate.distance.toFixed(4)),
        margin: Number(margin.toFixed(4)),
        threshold
      };
    }
  }

  // 3. Verificação do Status de Ativação do Usuário
  if (!bestCandidate.is_active) {
    return {
      access: 'DENIED',
      status: 'INACTIVE_USER',
      reason: 'Usuário reconhecido, porém seu cadastro encontra-se inativo ou revogado.',
      userId: bestCandidate.id,
      userName: bestCandidate.name,
      distance: Number(bestCandidate.distance.toFixed(4)),
      threshold
    };
  }

  // 4. Sucesso: ACESSO LIBERADO
  return {
    access: 'GRANTED',
    status: 'AUTHORIZED',
    reason: 'Acesso liberado: identidade confirmada e autorizada.',
    userId: bestCandidate.id,
    userName: bestCandidate.name,
    distance: Number(bestCandidate.distance.toFixed(4)),
    minDistance: Number(bestCandidate.minDistance.toFixed(4)),
    threshold,
    margin: secondCandidate ? Number((secondCandidate.distance - bestCandidate.distance).toFixed(4)) : null
  };
}

/**
 * Verifica se novas amostras colidem excessivamente com um usuário já existente (prevenção de duplicidade).
 * @param {number[][]} newSamples Novas amostras a cadastrar
 * @param {Array<{ id: number, name: string, samples: number[][] }>} existingCandidates
 * @param {number} duplicateThreshold Limiar de proximidade para alerta de duplicidade (padrão 0.50)
 * @returns {{ isDuplicate: boolean, candidate?: { id: number, name: string, distance: number } }}
 */
export function checkDuplicateIdentity(newSamples, existingCandidates, duplicateThreshold = 0.50) {
  for (const existing of existingCandidates) {
    if (!existing.samples || existing.samples.length === 0) continue;

    // Calcula a distância média de todas as novas amostras contra as existentes
    let totalDist = 0;
    let comparisons = 0;

    for (const sample of newSamples) {
      const evalResult = evaluateUserDistance(sample, existing.samples);
      totalDist += evalResult.aggregatedDistance;
      comparisons++;
    }

    const avgDistance = comparisons > 0 ? totalDist / comparisons : Infinity;
    if (avgDistance <= duplicateThreshold) {
      return {
        isDuplicate: true,
        candidate: {
          id: existing.id,
          name: existing.name,
          distance: Number(avgDistance.toFixed(4))
        }
      };
    }
  }

  return { isDuplicate: false };
}

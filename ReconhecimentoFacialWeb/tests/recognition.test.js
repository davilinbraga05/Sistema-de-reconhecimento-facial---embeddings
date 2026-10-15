/**
 * Testes Unitários de Reconhecimento Facial e Cálculo Matemático Vetorial
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateEuclideanDistance,
  evaluateUserDistance,
  recognizeFace,
  checkDuplicateIdentity
} from '../src/server/services/recognitionService.js';
import {
  validateEmbedding,
  validateEmbeddingBatch,
  EMBEDDING_DIMENSION
} from '../src/server/validators/embeddingValidator.js';

// Helper para gerar vetor sintético normalizado de 128 dimensões
function createSyntheticVector(baseValue = 0.1, variation = 0) {
  const v = new Array(EMBEDDING_DIMENSION);
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    v[i] = baseValue + (i * 0.001 * variation);
  }
  return v;
}

describe('1. Validação de Embeddings Faciais', () => {
  it('deve aceitar um vetor válido de 128 dimensões numéricas', () => {
    const vector = createSyntheticVector(0.05);
    const result = validateEmbedding(vector);
    assert.equal(result.valid, true);
    assert.equal(result.vector.length, 128);
    assert(result.norm > 0);
  });

  it('deve rejeitar vetor com dimensão diferente de 128', () => {
    const invalidShort = new Array(120).fill(0.1);
    const result = validateEmbedding(invalidShort);
    assert.equal(result.valid, false);
    assert.match(result.error, /Dimensão incorreta/);
  });

  it('deve rejeitar valores não numéricos, NaN ou infinitos', () => {
    const invalidNan = createSyntheticVector();
    invalidNan[10] = NaN;
    assert.equal(validateEmbedding(invalidNan).valid, false);

    const invalidInf = createSyntheticVector();
    invalidInf[20] = Infinity;
    assert.equal(validateEmbedding(invalidInf).valid, false);

    const invalidStr = createSyntheticVector();
    invalidStr[5] = 'invalido';
    assert.equal(validateEmbedding(invalidStr).valid, false);
  });

  it('deve validar um lote de amostras dentro dos limites (5 a 8 amostras)', () => {
    const validBatch = [
      createSyntheticVector(0.1),
      createSyntheticVector(0.11),
      createSyntheticVector(0.09),
      createSyntheticVector(0.12),
      createSyntheticVector(0.1)
    ];

    const result = validateEmbeddingBatch(validBatch, 5, 8);
    assert.equal(result.valid, true);
    assert.equal(result.vectors.length, 5);

    // Rejeita menos que o mínimo (4 amostras)
    const shortBatch = validBatch.slice(0, 4);
    assert.equal(validateEmbeddingBatch(shortBatch, 5, 8).valid, false);

    // Rejeita mais que o máximo (9 amostras)
    const excessiveBatch = [...validBatch, ...validBatch.slice(0, 4)];
    assert.equal(validateEmbeddingBatch(excessiveBatch, 5, 8).valid, false);
  });
});

describe('2. Cálculo da Distância Euclidiana e Agregação de Amostras', () => {
  it('deve calcular corretamente a distância euclidiana d(A,B) = sqrt(sum((A-B)^2))', () => {
    const a = [0, 0, 0];
    const b = [3, 4, 0];
    const dist = calculateEuclideanDistance(a, b);
    assert.equal(dist, 5); // Triângulo retângulo 3, 4, 5
  });

  it('deve retornar distância zero para vetores idênticos', () => {
    const v = createSyntheticVector(0.2);
    const dist = calculateEuclideanDistance(v, v);
    assert.equal(dist, 0);
  });

  it('deve agregar as distâncias utilizando a média das 3 melhores amostras', () => {
    const probe = createSyntheticVector(0.1);
    // Cria 5 amostras com pequenas variações conhecidas
    const samples = [
      createSyntheticVector(0.101), // d ~ 0.0113
      createSyntheticVector(0.102), // d ~ 0.0226
      createSyntheticVector(0.103), // d ~ 0.0339
      createSyntheticVector(0.150), // amostra distante
      createSyntheticVector(0.200)  // amostra distante
    ];

    const evaluated = evaluateUserDistance(probe, samples);
    assert(evaluated.aggregatedDistance < 0.05, 'A média das 3 melhores deve ser baixa');
    assert.equal(evaluated.sampleDistances.length, 5);
    assert(evaluated.minDistance <= evaluated.aggregatedDistance);
  });
});

describe('3. Tomada de Decisão do Reconhecimento Facial', () => {
  const aliceVector = createSyntheticVector(0.1);
  const aliceSamples = [
    createSyntheticVector(0.101),
    createSyntheticVector(0.102),
    createSyntheticVector(0.099),
    createSyntheticVector(0.103),
    createSyntheticVector(0.100)
  ];

  const bobVector = createSyntheticVector(0.8);
  const bobSamples = [
    createSyntheticVector(0.801),
    createSyntheticVector(0.802),
    createSyntheticVector(0.799),
    createSyntheticVector(0.803),
    createSyntheticVector(0.800)
  ];

  const candidates = [
    { id: 1, name: 'Alice Silva', is_active: true, samples: aliceSamples },
    { id: 2, name: 'Bob Souza', is_active: true, samples: bobSamples }
  ];

  it('deve conceder ACESSO LIBERADO quando houver correspondência clara e autorizada', () => {
    const probeAlice = createSyntheticVector(0.101);
    const decision = recognizeFace(probeAlice, candidates, { threshold: 0.55, ambiguityMargin: 0.05 });

    assert.equal(decision.access, 'GRANTED');
    assert.equal(decision.status, 'AUTHORIZED');
    assert.equal(decision.userName, 'Alice Silva');
    assert(decision.distance < 0.15);
  });

  it('deve negar ACESSO NEGADO quando o rosto for desconhecido (distância > threshold)', () => {
    // Vetor distante de Alice e de Bob
    const unknownProbe = createSyntheticVector(0.45);
    const decision = recognizeFace(unknownProbe, candidates, { threshold: 0.55, ambiguityMargin: 0.05 });

    assert.equal(decision.access, 'DENIED');
    assert.equal(decision.status, 'UNKNOWN_FACE');
    assert.equal(decision.candidate, null, 'Não deve vazar nome de candidatos');
    assert(decision.distance > 0.55);
  });

  it('deve negar ACESSO NEGADO quando o resultado for ambíguo (margem insuficiente entre 2 candidatos)', () => {
    // Cria dois usuários com vetores quase idênticos
    const cloneSamples = [
      createSyntheticVector(0.102),
      createSyntheticVector(0.101),
      createSyntheticVector(0.103)
    ];

    const ambiguousCandidates = [
      { id: 1, name: 'Usuário A', is_active: true, samples: aliceSamples },
      { id: 3, name: 'Usuário Quase Igual', is_active: true, samples: cloneSamples }
    ];

    const probe = createSyntheticVector(0.101);
    // Margem exigida de 0.08, mas a diferença entre eles será bem menor
    const decision = recognizeFace(probe, ambiguousCandidates, { threshold: 0.55, ambiguityMargin: 0.08 });

    assert.equal(decision.access, 'DENIED');
    assert.equal(decision.status, 'AMBIGUOUS_MATCH');
    assert.match(decision.reason, /Correspondência ambígua/);
  });

  it('deve negar ACESSO NEGADO quando o usuário for reconhecido mas seu status for INATIVO', () => {
    const inactiveCandidates = [
      { id: 1, name: 'Alice Silva Bloqueada', is_active: false, samples: aliceSamples }
    ];

    const probeAlice = createSyntheticVector(0.101);
    const decision = recognizeFace(probeAlice, inactiveCandidates, { threshold: 0.55 });

    assert.equal(decision.access, 'DENIED');
    assert.equal(decision.status, 'INACTIVE_USER');
    assert.equal(decision.userName, 'Alice Silva Bloqueada');
    assert.match(decision.reason, /inativo ou revogado/);
  });

  it('deve detectar tentativa de cadastro com rosto duplicado de usuário existente', () => {
    const newSamples = [
      createSyntheticVector(0.101),
      createSyntheticVector(0.102),
      createSyntheticVector(0.099)
    ];

    const dupCheck = checkDuplicateIdentity(newSamples, candidates, 0.48);
    assert.equal(dupCheck.isDuplicate, true);
    assert.equal(dupCheck.candidate.name, 'Alice Silva');
    assert(dupCheck.candidate.distance < 0.1);
  });
});

/**
 * Testes Unitários de Banco de Dados e Persistência SQLite
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase } from '../src/server/database/db.js';
import {
  createUser,
  getUserById,
  listUsers,
  updateUser,
  deleteUser,
  getAllUsersWithSamples
} from '../src/server/services/userService.js';
import { getSettings, updateSettings } from '../src/server/services/settingsService.js';
import { recordEvent, listEvents, clearEvents } from '../src/server/services/eventService.js';
import { EMBEDDING_DIMENSION } from '../src/server/validators/embeddingValidator.js';

function createDummyVector(val = 0.1) {
  return new Array(EMBEDDING_DIMENSION).fill(val);
}

describe('Banco de Dados SQLite e Persistência Local', () => {
  let db;

  beforeEach(() => {
    // Cria instância limpa em memória para cada suite de testes
    db = initDatabase(':memory:');
  });

  it('deve inicializar tabelas e configurações padrão', () => {
    const settings = getSettings(db);
    assert.equal(settings.recognition_threshold, 0.55);
    assert.equal(settings.ambiguity_margin, 0.05);
    assert.equal(settings.min_samples, 5);
  });

  it('deve criar usuário e persistir amostras de embeddings em transação', () => {
    const samples = [
      createDummyVector(0.1),
      createDummyVector(0.11),
      createDummyVector(0.12),
      createDummyVector(0.13),
      createDummyVector(0.14)
    ];

    const user = createUser(db, { name: 'Carlos Lima', samples });
    assert.equal(user.name, 'Carlos Lima');
    assert.equal(user.is_active, true);
    assert.equal(user.sample_count, 5);

    const fetched = getUserById(db, user.id);
    assert.equal(fetched.name, 'Carlos Lima');
    assert.equal(fetched.sample_count, 5);

    const withSamples = getAllUsersWithSamples(db, true);
    assert.equal(withSamples.length, 1);
    assert.equal(withSamples[0].samples.length, 5);
  });

  it('deve atualizar o estado de ativação e nome do usuário', () => {
    const samples = [createDummyVector(0.1)];
    const user = createUser(db, { name: 'Débora Dias', samples });

    // Desativa usuário
    const updated = updateUser(db, user.id, { is_active: false, name: 'Débora D.' });
    assert.equal(updated.is_active, false);
    assert.equal(updated.name, 'Débora D.');

    // Verifica que getAllUsersWithSamples com onlyActive=true exclui o usuário
    const activeUsers = getAllUsersWithSamples(db, true);
    assert.equal(activeUsers.length, 0);

    const allUsers = getAllUsersWithSamples(db, false);
    assert.equal(allUsers.length, 1);
  });

  it('deve excluir usuário e remover automaticamente seus embeddings (ON DELETE CASCADE)', () => {
    const samples = [createDummyVector(0.2), createDummyVector(0.3)];
    const user = createUser(db, { name: 'Eduardo Ramos', samples });

    // Conta embeddings antes da exclusão
    const beforeCount = db.prepare('SELECT COUNT(*) as count FROM embeddings WHERE user_id = ?').get(user.id).count;
    assert.equal(beforeCount, 2);

    // Exclui o usuário
    const deleted = deleteUser(db, user.id);
    assert.equal(deleted, true);

    // Garante que o usuário foi removido
    assert.equal(getUserById(db, user.id), null);

    // Garante que a integridade referencial removeu os embeddings
    const afterCount = db.prepare('SELECT COUNT(*) as count FROM embeddings WHERE user_id = ?').get(user.id).count;
    assert.equal(afterCount, 0);
  });

  it('deve registrar eventos no histórico e permitir limpeza administrativa', () => {
    recordEvent(db, {
      result: 'GRANTED',
      userId: 1,
      userName: 'Teste',
      distance: 0.32,
      reason: 'Acesso autorizado'
    }, true);

    recordEvent(db, {
      result: 'DENIED',
      userId: null,
      userName: null,
      distance: 0.78,
      reason: 'Rosto desconhecido'
    }, true);

    const events = listEvents(db, 10);
    assert.equal(events.length, 2);
    assert.equal(events[0].result, 'DENIED');
    assert.equal(events[1].result, 'GRANTED');

    clearEvents(db);
    const emptyEvents = listEvents(db, 10);
    assert.equal(emptyEvents.length, 0);
  });

  it('deve atualizar parâmetros do sistema com validação', () => {
    const updated = updateSettings(db, {
      recognition_threshold: 0.60,
      ambiguity_margin: 0.08
    });

    assert.equal(updated.recognition_threshold, 0.60);
    assert.equal(updated.ambiguity_margin, 0.08);

    // Rejeita threshold absurdo
    assert.throws(() => {
      updateSettings(db, { recognition_threshold: 2.5 });
    }, /entre 0.10 e 1.50/);
  });
});

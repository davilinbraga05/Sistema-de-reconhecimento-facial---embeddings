/**
 * Teste de Persistência Após Reinício do Servidor / Banco de Dados
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { initDatabase } from '../src/server/database/db.js';
import { createUser, getUserById, getAllUsersWithSamples } from '../src/server/services/userService.js';
import { EMBEDDING_DIMENSION } from '../src/server/validators/embeddingValidator.js';

describe('Persistência Após Reinício do Banco de Dados', () => {
  it('deve manter usuários e embeddings intactos após fechar e reabrir o banco de dados SQLite', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rfw-test-'));
    const testDbPath = path.join(tmpDir, 'test-persistence.sqlite');

    try {
      // 1. Inicializa o banco e cadastra um usuário
      let db = initDatabase(testDbPath);

      const dummyVector = new Array(EMBEDDING_DIMENSION).fill(0.123);
      const createdUser = createUser(db, {
        name: 'Usuário Persistido',
        samples: [dummyVector, dummyVector, dummyVector, dummyVector, dummyVector]
      });

      assert.equal(createdUser.name, 'Usuário Persistido');
      const userId = createdUser.id;

      // 2. Fecha a conexão com o banco de dados simulando restart do servidor
      db.close();

      // 3. Reabre a conexão no mesmo arquivo SQLite
      db = initDatabase(testDbPath);

      const retrievedUser = getUserById(db, userId);
      assert.notEqual(retrievedUser, null);
      assert.equal(retrievedUser.name, 'Usuário Persistido');
      assert.equal(retrievedUser.sample_count, 5);

      const allUsers = getAllUsersWithSamples(db, true);
      assert.equal(allUsers.length, 1);
      assert.equal(allUsers[0].samples.length, 5);
      assert.equal(allUsers[0].samples[0][0], 0.123);

      db.close();
    } finally {
      // Limpeza de arquivos temporários do teste
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  });
});

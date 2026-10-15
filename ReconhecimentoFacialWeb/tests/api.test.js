/**
 * Testes de Integração da API REST e Rotas do Servidor
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { initDatabase } from '../src/server/database/db.js';
import { createApp } from '../server.js';
import { EMBEDDING_DIMENSION } from '../src/server/validators/embeddingValidator.js';

function createDummyVector(val = 0.1) {
  return new Array(EMBEDDING_DIMENSION).fill(val);
}

describe('API REST e Rotas HTTP do Servidor', () => {
  let server;
  let baseUrl;
  let db;
  let adminCookie = '';

  before(async () => {
    db = initDatabase(':memory:');
    const app = createApp(db);

    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(() => {
    if (server) server.close();
    if (db) db.close();
  });

  it('GET /api/health deve responder status online e estatísticas', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'online');
    assert.equal(data.database, 'connected');
    assert.equal(data.stats.totalUsers, 0);
  });

  it('GET /api/auth/status deve informar que o PIN ainda não foi configurado', async () => {
    const res = await fetch(`${baseUrl}/api/auth/status`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.configured, false);
    assert.equal(data.authenticated, false);
  });

  it('POST /api/users sem autenticação administrativa deve retornar 401', async () => {
    const res = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Tentativa Não Autorizada',
        samples: [createDummyVector()],
        consent: true
      })
    });
    assert.equal(res.status, 401);
  });

  it('POST /api/auth/setup deve cadastrar o PIN inicial e autenticar o administrador', async () => {
    const res = await fetch(`${baseUrl}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '1234' })
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.authenticated, true);

    const setCookie = res.headers.get('set-cookie');
    assert(setCookie, 'Deve retornar cookie de sessão admin');
    adminCookie = setCookie.split(';')[0];
  });

  it('POST /api/auth/setup repetido deve ser bloqueado', async () => {
    const res = await fetch(`${baseUrl}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '9999' })
    });
    assert.equal(res.status, 400);
  });

  it('POST /api/users com autenticação admin deve cadastrar usuário com 5 amostras', async () => {
    const samples = [
      createDummyVector(0.101),
      createDummyVector(0.102),
      createDummyVector(0.099),
      createDummyVector(0.100),
      createDummyVector(0.103)
    ];

    const res = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': adminCookie
      },
      body: JSON.stringify({
        name: 'Maria Fernandes',
        consent: true,
        samples
      })
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.user.name, 'Maria Fernandes');
    assert.equal(data.user.sample_count, 5);
  });

  it('POST /api/recognize deve reconhecer o usuário e retornar ACESSO LIBERADO', async () => {
    const matchingProbe = createDummyVector(0.101);

    const res = await fetch(`${baseUrl}/api/recognize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descriptor: matchingProbe })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.access, 'GRANTED');
    assert.equal(data.status, 'AUTHORIZED');
    assert.equal(data.userName, 'Maria Fernandes');
    assert(data.distance < 0.1);
  });

  it('POST /api/recognize com rosto distante deve retornar ACESSO NEGADO', async () => {
    const strangeProbe = createDummyVector(0.9);

    const res = await fetch(`${baseUrl}/api/recognize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descriptor: strangeProbe })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.access, 'DENIED');
    assert.equal(data.status, 'UNKNOWN_FACE');
  });

  it('PATCH /api/settings com autenticação deve atualizar o threshold com sucesso', async () => {
    const res = await fetch(`${baseUrl}/api/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': adminCookie
      },
      body: JSON.stringify({ recognition_threshold: 0.62 })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.settings.recognition_threshold, 0.62);
  });

  it('GET /api/events deve listar as tentativas registradas', async () => {
    const res = await fetch(`${baseUrl}/api/events`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert(Array.isArray(data.events));
    assert(data.events.length >= 1);
  });
});

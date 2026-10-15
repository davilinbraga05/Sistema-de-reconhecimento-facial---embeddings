/**
 * Serviço de Histórico e Auditoria de Acessos
 * Registra eventos de autenticação biométrica com taxa controlada (rate-limiting)
 * para não sobrecarregar o banco de dados com frames repetitivos.
 */

// Armazenamento em memória do último registro para controle de taxa (throttling)
let lastLoggedEvent = {
  timestamp: 0,
  result: null,
  userId: null,
  reason: null
};

const THROTTLE_INTERVAL_MS = 4000; // Mínimo de 4 segundos entre eventos redundantes

/**
 * Registra uma tentativa de acesso no histórico caso atenda ao critério de relevância temporal.
 * @param {import('better-sqlite3').Database} db
 * @param {{ result: 'GRANTED' | 'DENIED' | 'ERROR', userId?: number|null, userName?: string|null, distance?: number|null, reason: string }} event
 * @param {boolean} forceForcibly Se verdadeiro, ignora o rate-limiting
 */
export function recordEvent(db, event, forceForcibly = false) {
  const now = Date.now();
  const timeSinceLast = now - lastLoggedEvent.timestamp;

  const isSameResult = lastLoggedEvent.result === event.result;
  const isSameUser = lastLoggedEvent.userId === (event.userId ?? null);

  // Se for o mesmo evento dentro da janela de throttle, ignora para não poluir o histórico
  if (!forceForcibly && isSameResult && isSameUser && timeSinceLast < THROTTLE_INTERVAL_MS) {
    return null;
  }

  // Garante que o user_id só seja vinculado se o registro existir no banco (integridade referencial)
  let validUserId = null;
  if (event.userId) {
    const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(event.userId);
    if (userExists) {
      validUserId = event.userId;
    }
  }

  const isoTimestamp = new Date(now).toISOString();
  const stmt = db.prepare(`
    INSERT INTO events (timestamp, result, user_id, user_name, distance, reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    isoTimestamp,
    event.result,
    validUserId,
    event.userName ?? null,
    event.distance !== undefined && event.distance !== null ? Number(event.distance) : null,
    event.reason
  );

  lastLoggedEvent = {
    timestamp: now,
    result: event.result,
    userId: event.userId ?? null,
    reason: event.reason
  };

  return {
    id: Number(info.lastInsertRowid),
    timestamp: isoTimestamp,
    ...event
  };
}

/**
 * Lista os eventos mais recentes do histórico de acessos.
 * @param {import('better-sqlite3').Database} db
 * @param {number} limit Quantidade máxima de registros
 */
export function listEvents(db, limit = 50) {
  const stmt = db.prepare(`
    SELECT id, timestamp, result, user_id, user_name, distance, reason
    FROM events
    ORDER BY id DESC
    LIMIT ?
  `);
  return stmt.all(limit);
}

/**
 * Limpa o histórico de eventos de acesso (função administrativa).
 * @param {import('better-sqlite3').Database} db
 */
export function clearEvents(db) {
  return db.prepare('DELETE FROM events').run();
}

/**
 * Módulo de Segurança e Autenticação Administrativa
 * Utiliza scrypt para derivação de chaves criptográficas com salt seguro
 * e sessões assinadas via cookies HttpOnly para controle de acesso.
 */

import crypto from 'node:crypto';

// Sessões ativas em memória: Map<token, { createdAt: number, expiresAt: number }>
const activeSessions = new Map();
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas de validade

/**
 * Deriva um hash criptográfico usando scrypt com salt aleatório.
 * @param {string} pin PIN ou senha administrativa
 * @param {string} saltHex Salt em hexadecimal (opcional, gera novo se não fornecido)
 * @returns {Promise<{ hash: string, salt: string }>}
 */
export function hashPin(pin, saltHex = null) {
  return new Promise((resolve, reject) => {
    const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(32);
    crypto.scrypt(pin, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve({
        hash: derivedKey.toString('hex'),
        salt: salt.toString('hex')
      });
    });
  });
}

/**
 * Verifica se o PIN fornecido confere com o hash e salt armazenados usando comparação em tempo constante.
 * @param {string} inputPin PIN fornecido pelo usuário
 * @param {string} storedHash Hash armazenado no banco
 * @param {string} storedSalt Salt armazenado no banco
 * @returns {Promise<boolean>}
 */
export async function verifyPin(inputPin, storedHash, storedSalt) {
  if (!inputPin || !storedHash || !storedSalt) return false;
  try {
    const { hash } = await hashPin(inputPin, storedSalt);
    const hashBuffer = Buffer.from(hash, 'hex');
    const storedBuffer = Buffer.from(storedHash, 'hex');
    if (hashBuffer.length !== storedBuffer.length) return false;
    return crypto.timingSafeEqual(hashBuffer, storedBuffer);
  } catch {
    return false;
  }
}

/**
 * Verifica se o PIN administrativo já foi configurado no banco de dados.
 * @param {import('better-sqlite3').Database} db
 */
export function isPinConfigured(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'admin_pin_hash'").get();
  return Boolean(row && row.value && row.value.length > 0);
}

/**
 * Configura o primeiro PIN administrativo no banco.
 * @param {import('better-sqlite3').Database} db
 * @param {string} pin
 */
export async function setupAdminPin(db, pin) {
  if (!pin || typeof pin !== 'string' || pin.trim().length < 4) {
    throw new Error('O PIN administrativo deve ter no mínimo 4 caracteres ou dígitos.');
  }

  if (isPinConfigured(db)) {
    throw new Error('O PIN administrativo já foi configurado anteriormente.');
  }

  const { hash, salt } = await hashPin(pin.trim());

  const stmt = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const transaction = db.transaction(() => {
    stmt.run('admin_pin_hash', hash);
    stmt.run('admin_pin_salt', salt);
  });

  transaction();
  return true;
}

/**
 * Autentica o administrador com o PIN e cria uma nova sessão.
 * @param {import('better-sqlite3').Database} db
 * @param {string} pin
 * @returns {Promise<string|null>} Token da sessão ou null se inválido
 */
export async function authenticateAdmin(db, pin) {
  const hashRow = db.prepare("SELECT value FROM settings WHERE key = 'admin_pin_hash'").get();
  const saltRow = db.prepare("SELECT value FROM settings WHERE key = 'admin_pin_salt'").get();

  if (!hashRow || !saltRow) return null;

  const valid = await verifyPin(pin.trim(), hashRow.value, saltRow.value);
  if (!valid) return null;

  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  activeSessions.set(token, {
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS
  });

  return token;
}

/**
 * Valida se um token de sessão está ativo.
 * @param {string} token
 * @returns {boolean}
 */
export function isValidSession(token) {
  if (!token || typeof token !== 'string') return false;
  const session = activeSessions.get(token);
  if (!session) return false;

  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return false;
  }

  return true;
}

/**
 * Encerra uma sessão administrativa.
 * @param {string} token
 */
export function destroySession(token) {
  if (token) activeSessions.delete(token);
}

/**
 * Middleware Express para proteger rotas administrativas.
 */
export function requireAdminAuth(req, res, next) {
  const cookieToken = req.cookies?.admin_session;
  const headerToken = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const token = cookieToken || headerToken;

  if (!isValidSession(token)) {
    return res.status(401).json({
      error: 'Acesso negado: Autenticação administrativa necessária para esta operação.'
    });
  }

  next();
}

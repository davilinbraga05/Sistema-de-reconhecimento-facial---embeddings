/**
 * Serviço de Gerenciamento de Usuários e Embeddings Faciais
 * Operações CRUD com transações seguras no SQLite e proteção de dados biométricos.
 */

/**
 * Lista todos os usuários cadastrados sem expor seus vetores de embeddings sensíveis.
 * @param {import('better-sqlite3').Database} db
 */
export function listUsers(db) {
  const stmt = db.prepare(`
    SELECT 
      u.id, 
      u.name, 
      u.is_active, 
      u.created_at, 
      u.updated_at,
      COUNT(e.id) as sample_count
    FROM users u
    LEFT JOIN embeddings e ON u.id = e.user_id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `);
  return stmt.all().map(u => ({
    ...u,
    is_active: Boolean(u.is_active)
  }));
}

/**
 * Obtém todos os usuários com seus respectivos embeddings decodificados para o motor de inferência.
 * @param {import('better-sqlite3').Database} db
 * @param {boolean} onlyActive Se verdadeiro, traz apenas usuários ativos
 */
export function getAllUsersWithSamples(db, onlyActive = false) {
  const query = `
    SELECT 
      u.id, 
      u.name, 
      u.is_active,
      e.descriptor
    FROM users u
    JOIN embeddings e ON u.id = e.user_id
    ${onlyActive ? 'WHERE u.is_active = 1' : ''}
    ORDER BY u.id ASC
  `;

  const rows = db.prepare(query).all();
  const usersMap = new Map();

  for (const row of rows) {
    if (!usersMap.has(row.id)) {
      usersMap.set(row.id, {
        id: row.id,
        name: row.name,
        is_active: Boolean(row.is_active),
        samples: []
      });
    }

    try {
      const vector = JSON.parse(row.descriptor);
      usersMap.get(row.id).samples.push(vector);
    } catch {
      // Ignora amostra corrompida se houver
    }
  }

  return Array.from(usersMap.values());
}

/**
 * Obtém um usuário específico por ID.
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 */
export function getUserById(db, id) {
  const stmt = db.prepare(`
    SELECT 
      u.id, 
      u.name, 
      u.is_active, 
      u.created_at, 
      u.updated_at,
      COUNT(e.id) as sample_count
    FROM users u
    LEFT JOIN embeddings e ON u.id = e.user_id
    WHERE u.id = ?
    GROUP BY u.id
  `);
  const user = stmt.get(id);
  if (!user) return null;
  return {
    ...user,
    is_active: Boolean(user.is_active)
  };
}

/**
 * Cria um novo usuário e persiste seus embeddings de forma transacional.
 * @param {import('better-sqlite3').Database} db
 * @param {{ name: string, samples: number[][] }} data
 */
export function createUser(db, { name, samples }) {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('O nome do usuário é obrigatório.');
  }

  const trimmedName = name.trim();
  const now = new Date().toISOString();

  const insertUser = db.prepare(`
    INSERT INTO users (name, is_active, created_at, updated_at)
    VALUES (?, 1, ?, ?)
  `);

  const insertEmbedding = db.prepare(`
    INSERT INTO embeddings (user_id, descriptor, created_at)
    VALUES (?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    const userResult = insertUser.run(trimmedName, now, now);
    const userId = Number(userResult.lastInsertRowid);

    for (const sample of samples) {
      insertEmbedding.run(userId, JSON.stringify(sample), now);
    }

    return {
      id: userId,
      name: trimmedName,
      is_active: true,
      created_at: now,
      updated_at: now,
      sample_count: samples.length
    };
  });

  return transaction();
}

/**
 * Atualiza o nome ou estado de autorização de um usuário.
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 * @param {{ name?: string, is_active?: boolean }} updates
 */
export function updateUser(db, id, updates) {
  const existing = getUserById(db, id);
  if (!existing) {
    return null;
  }

  const name = updates.name !== undefined ? updates.name.trim() : existing.name;
  const isActive = updates.is_active !== undefined ? (updates.is_active ? 1 : 0) : (existing.is_active ? 1 : 0);
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE users 
    SET name = ?, is_active = ?, updated_at = ?
    WHERE id = ?
  `);

  stmt.run(name, isActive, now, id);
  return getUserById(db, id);
}

/**
 * Exclui um usuário e remove todos os seus embeddings associados (cascade).
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 */
export function deleteUser(db, id) {
  const stmt = db.prepare('DELETE FROM users WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

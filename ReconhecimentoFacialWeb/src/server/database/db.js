/**
 * Camada de Acesso e Inicialização do Banco de Dados SQLite
 * Utiliza better-sqlite3 para persistência local transacional e de alto desempenho.
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..', '..');

const DEFAULT_DB_PATH = path.join(projectRoot, 'data', 'database.sqlite');

export function initDatabase(dbPath = DEFAULT_DB_PATH) {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);

  // Habilitar integridade referencial e modo WAL para concorrência
  db.pragma('foreign_keys = ON');
  if (dbPath !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }

  // Criação das tabelas
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      descriptor TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      result TEXT NOT NULL, -- 'GRANTED', 'DENIED', 'ERROR'
      user_id INTEGER,
      user_name TEXT,
      distance REAL,
      reason TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_embeddings_user_id ON embeddings(user_id);
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
  `);

  // Configurações padrão
  const defaultSettings = [
    { key: 'recognition_threshold', value: '0.55' },
    { key: 'ambiguity_margin', value: '0.05' },
    { key: 'min_samples', value: '5' },
    { key: 'max_samples', value: '8' }
  ];

  const insertSettingStmt = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES (@key, @value)
  `);

  for (const s of defaultSettings) {
    insertSettingStmt.run(s);
  }

  return db;
}

// Instância padrão única para o servidor
let defaultDbInstance = null;

export function getDatabase() {
  if (!defaultDbInstance) {
    defaultDbInstance = initDatabase();
  }
  return defaultDbInstance;
}

export function closeDatabase() {
  if (defaultDbInstance) {
    defaultDbInstance.close();
    defaultDbInstance = null;
  }
}

/**
 * Servidor Principal HTTP e API REST (Express + SQLite)
 * Sistema de Reconhecimento Facial com Embeddings
 * Escuta exclusivamente em 127.0.0.1 por segurança.
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { initDatabase, getDatabase } from './src/server/database/db.js';
import { createAuthRouter } from './src/server/routes/auth.js';
import { createUsersRouter } from './src/server/routes/users.js';
import { createRecognitionRouter } from './src/server/routes/recognition.js';
import { createEventsRouter } from './src/server/routes/events.js';
import { createSettingsRouter } from './src/server/routes/settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const HOST = '127.0.0.1';

export function createApp(db = getDatabase()) {
  const app = express();

  // Middlewares essenciais
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  // Servir arquivos estáticos da pasta public (HTML, CSS, modelos e scripts compilados)
  const publicDir = path.join(__dirname, 'public');
  app.use(express.static(publicDir));

  // Health check e resumo operacional do sistema
  app.get('/api/health', (req, res) => {
    try {
      const modelsDir = path.join(publicDir, 'models');
      const hasModels = fs.existsSync(modelsDir) && fs.readdirSync(modelsDir).length >= 4;

      const userCountStmt = db.prepare('SELECT COUNT(*) as total FROM users');
      const activeCountStmt = db.prepare('SELECT COUNT(*) as total FROM users WHERE is_active = 1');
      const embCountStmt = db.prepare('SELECT COUNT(*) as total FROM embeddings');

      const totalUsers = userCountStmt.get().total;
      const activeUsers = activeCountStmt.get().total;
      const totalEmbeddings = embCountStmt.get().total;

      res.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        modelsAvailable: hasModels,
        database: 'connected',
        stats: {
          totalUsers,
          activeUsers,
          totalEmbeddings
        }
      });
    } catch (err) {
      res.status(500).json({ status: 'error', error: err.message });
    }
  });

  // Montagem das rotas da API
  app.use('/api/auth', createAuthRouter(db));
  app.use('/api/users', createUsersRouter(db));
  app.use('/api/recognize', createRecognitionRouter(db));
  app.use('/api/events', createEventsRouter(db));
  app.use('/api/settings', createSettingsRouter(db));

  // Fallback para SPA/Frontend
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Endpoint da API não encontrado.' });
    }
    if (req.method === 'GET') {
      return res.sendFile(path.join(publicDir, 'index.html'));
    }
    next();
  });

  return app;
}

// Inicia o servidor se executado diretamente
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  const db = initDatabase();
  const app = createApp(db);

  const server = app.listen(PORT, HOST, () => {
    console.log('=====================================================');
    console.log('SISTEMA WEB DE RECONHECIMENTO FACIAL COM EMBEDDINGS');
    console.log('=====================================================');
    console.log(`Servidor ativo e pronto para demonstração acadêmica!`);
    console.log(`Endereço Local: http://${HOST}:${PORT}`);
    console.log(`Ambiente: Localhost restrito (127.0.0.1)`);
    console.log(`Banco de Dados: data/database.sqlite`);
    console.log(`Modelos de IA: public/models/`);
    console.log('=====================================================');
  });

  process.on('SIGINT', () => {
    console.log('\nEncerrando servidor com segurança...');
    server.close(() => {
      db.close();
      console.log('Servidor e banco de dados finalizados.');
      process.exit(0);
    });
  });
}

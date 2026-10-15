/**
 * Rotas de Consulta e Gerenciamento do Histórico de Acessos
 */

import { Router } from 'express';
import { listEvents, clearEvents } from '../services/eventService.js';
import { requireAdminAuth } from '../security/auth.js';

export function createEventsRouter(db) {
  const router = Router();

  // Consultar histórico de acessos
  router.get('/', (req, res) => {
    try {
      const limit = req.query.limit ? Math.min(parseInt(req.query.limit, 10), 200) : 50;
      const events = listEvents(db, limit);
      res.json({ events });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Limpar histórico (requer PIN administrativo)
  router.delete('/', requireAdminAuth, (req, res) => {
    try {
      clearEvents(db);
      res.json({ message: 'Histórico de acessos limpo com sucesso.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

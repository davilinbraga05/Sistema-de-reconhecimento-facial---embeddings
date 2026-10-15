/**
 * Rotas de Configuração dos Parâmetros Biométricos e do Sistema
 */

import { Router } from 'express';
import { getSettings, updateSettings } from '../services/settingsService.js';
import { requireAdminAuth } from '../security/auth.js';

export function createSettingsRouter(db) {
  const router = Router();

  // Obter configurações ativas
  router.get('/', (req, res) => {
    try {
      const settings = getSettings(db);
      res.json({ settings });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Atualizar configurações (requer PIN administrativo)
  router.patch('/', requireAdminAuth, (req, res) => {
    try {
      const updated = updateSettings(db, req.body);
      res.json({
        message: 'Configurações atualizadas com sucesso.',
        settings: updated
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

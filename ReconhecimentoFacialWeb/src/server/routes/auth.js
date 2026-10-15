/**
 * Rotas de Autenticação Administrativa
 */

import { Router } from 'express';
import {
  isPinConfigured,
  setupAdminPin,
  authenticateAdmin,
  destroySession,
  isValidSession
} from '../security/auth.js';

export function createAuthRouter(db) {
  const router = Router();

  // Verifica estado de configuração do PIN e sessão atual
  router.get('/status', (req, res) => {
    try {
      const configured = isPinConfigured(db);
      const token = req.cookies?.admin_session || req.headers.authorization?.replace(/^Bearer\s+/i, '');
      const authenticated = isValidSession(token);

      res.json({
        configured,
        authenticated
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Configuração inicial do PIN
  router.post('/setup', async (req, res) => {
    try {
      const { pin } = req.body;
      if (!pin) {
        return res.status(400).json({ error: 'O PIN é obrigatório.' });
      }

      await setupAdminPin(db, pin);
      const token = await authenticateAdmin(db, pin);

      res.cookie('admin_session', token, {
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 2 * 60 * 60 * 1000
      });

      res.status(201).json({
        message: 'PIN administrativo configurado e autenticado com sucesso.',
        authenticated: true,
        token
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Login com PIN administrativo
  router.post('/login', async (req, res) => {
    try {
      const { pin } = req.body;
      if (!pin) {
        return res.status(400).json({ error: 'Informe o PIN administrativo.' });
      }

      const token = await authenticateAdmin(db, pin);
      if (!token) {
        return res.status(401).json({ error: 'PIN incorreto. Acesso administrativo negado.' });
      }

      res.cookie('admin_session', token, {
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 2 * 60 * 60 * 1000
      });

      res.json({
        message: 'Autenticado com sucesso.',
        authenticated: true,
        token
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Encerramento da sessão (Logout)
  router.post('/logout', (req, res) => {
    const token = req.cookies?.admin_session || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (token) {
      destroySession(token);
    }
    res.clearCookie('admin_session');
    res.json({ message: 'Sessão encerrada com sucesso.', authenticated: false });
  });

  return router;
}

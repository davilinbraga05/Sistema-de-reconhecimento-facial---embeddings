/**
 * Rotas de Gerenciamento de Usuários e Cadastros Biométricos
 */

import { Router } from 'express';
import { requireAdminAuth } from '../security/auth.js';
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  getUserById,
  getAllUsersWithSamples
} from '../services/userService.js';
import { getSettings } from '../services/settingsService.js';
import { validateEmbeddingBatch } from '../validators/embeddingValidator.js';
import { checkDuplicateIdentity } from '../services/recognitionService.js';

export function createUsersRouter(db) {
  const router = Router();

  // Listar todos os usuários (metadados e contagem de amostras, sem expor vetores brutos)
  router.get('/', (req, res) => {
    try {
      const users = listUsers(db);
      res.json({ users });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Obter um usuário por ID
  router.get('/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const user = getUserById(db, id);
      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }
      res.json({ user });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Cadastrar novo usuário e persistir embeddings (Protegido por PIN administrativo)
  router.post('/', requireAdminAuth, (req, res) => {
    try {
      const { name, samples, consent, force } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length < 2) {
        return res.status(400).json({ error: 'Nome de usuário inválido (mínimo de 2 caracteres).' });
      }

      if (consent !== true) {
        return res.status(400).json({
          error: 'É obrigatório registrar o consentimento para o processamento de dados biométricos.'
        });
      }

      const settings = getSettings(db);
      const valRes = validateEmbeddingBatch(samples, settings.min_samples, settings.max_samples);
      if (!valRes.valid) {
        return res.status(400).json({ error: valRes.error });
      }

      // Verificação de duplicidade com usuários já existentes
      if (!force) {
        const existingCandidates = getAllUsersWithSamples(db, false);
        const dupCheck = checkDuplicateIdentity(valRes.vectors, existingCandidates, 0.48);
        if (dupCheck.isDuplicate) {
          return res.status(409).json({
            error: 'Possível duplicidade facial detectada.',
            isDuplicate: true,
            candidate: dupCheck.candidate,
            message: `O rosto capturado apresenta alta similaridade com o usuário cadastrado '${dupCheck.candidate.name}' (distância: ${dupCheck.candidate.distance}). Se deseja prosseguir mesmo assim, confirme a criação forçada.`
          });
        }
      }

      const newUser = createUser(db, {
        name: name.trim(),
        samples: valRes.vectors
      });

      res.status(201).json({
        message: 'Usuário e amostras biométricas cadastrados com sucesso.',
        user: newUser
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Atualizar usuário (nome ou status ativo/inativo) - Protegido
  router.patch('/:id', requireAdminAuth, (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { name, is_active } = req.body;

      const updated = updateUser(db, id, { name, is_active });
      if (!updated) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      res.json({
        message: 'Usuário atualizado com sucesso.',
        user: updated
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Excluir usuário e seus respectivos embeddings (ON DELETE CASCADE) - Protegido
  router.delete('/:id', requireAdminAuth, (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const success = deleteUser(db, id);

      if (!success) {
        return res.status(404).json({ error: 'Usuário não encontrado para exclusão.' });
      }

      res.json({
        message: 'Usuário e todos os seus dados biométricos foram excluídos permanentemente.'
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

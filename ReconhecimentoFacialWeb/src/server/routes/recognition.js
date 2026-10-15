/**
 * Rota de Inferência e Reconhecimento Facial em Tempo Real
 * Recebe o embedding facial capturado no navegador e calcula a correspondência
 * com base na distância Euclidiana contra o banco de dados.
 */

import { Router } from 'express';
import { getAllUsersWithSamples } from '../services/userService.js';
import { getSettings } from '../services/settingsService.js';
import { recognizeFace } from '../services/recognitionService.js';
import { recordEvent } from '../services/eventService.js';

export function createRecognitionRouter(db) {
  const router = Router();

  router.post('/', (req, res) => {
    try {
      const { descriptor } = req.body;

      if (!descriptor) {
        return res.status(400).json({
          access: 'DENIED',
          status: 'MISSING_DESCRIPTOR',
          reason: 'O vetor de embedding facial é obrigatório.'
        });
      }

      const settings = getSettings(db);
      // Carrega todos os usuários cadastrados (inclusive os inativos, para validação de bloqueio)
      const candidates = getAllUsersWithSamples(db, false);

      const decision = recognizeFace(descriptor, candidates, {
        threshold: settings.recognition_threshold,
        ambiguityMargin: settings.ambiguity_margin
      });

      // Registra evento no banco de dados com rate-limiting inteligente
      recordEvent(db, {
        result: decision.access,
        userId: decision.userId ?? null,
        userName: decision.userName ?? null,
        distance: decision.distance ?? null,
        reason: decision.reason
      });

      res.json(decision);
    } catch (err) {
      console.error('Erro no processamento do reconhecimento facial:', err);
      res.status(500).json({
        access: 'DENIED',
        status: 'SERVER_ERROR',
        reason: `Falha interna no reconhecimento: ${err.message}`
      });
    }
  });

  return router;
}

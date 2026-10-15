/**
 * Orquestrador do Processo de Cadastro Biométrico Facial
 * Gerencia a captura sequencial de 8 amostras de embeddings e a persistência.
 */

import { api } from './api.js';

export class RegistrationManager {
  constructor({ camera, aiEngine, ui }) {
    this.camera = camera;
    this.aiEngine = aiEngine;
    this.ui = ui;
    this.isCapturing = false;
    this.samples = [];
    this.targetSamples = 8;
  }

  /**
   * Reseta o estado do cadastro.
   */
  reset() {
    this.isCapturing = false;
    this.samples = [];
    this.ui.updateRegistrationProgress(0, this.targetSamples);
    this.ui.updateQualityChecks({ faceCount: 0, centered: false, landmarks: false });
  }

  /**
   * Inicia o ciclo de captura automática das 8 amostras biométricas.
   */
  async startCapture(userName) {
    if (this.isCapturing) return;
    this.isCapturing = true;
    this.samples = [];

    this.ui.setRegistrationStep(
      'Capturando Amostras Biométricas',
      'Olhe para a câmera e faça pequenos movimentos suaves com a cabeça.'
    );

    const videoEl = this.camera.video;
    const canvasEl = this.camera.canvas;

    let consecutiveFailures = 0;

    while (this.isCapturing && this.samples.length < this.targetSamples) {
      try {
        // 1. Verifica se há exatamente 1 rosto
        const allFaces = await this.aiEngine.detectAllFaces(videoEl);

        if (allFaces.length === 0) {
          this.ui.updateQualityChecks({ faceCount: 0, centered: false, landmarks: false });
          this.ui.setRegistrationStep('Aguardando Rosto', 'Posicione seu rosto dentro da moldura oval.');
          await this.delay(300);
          continue;
        }

        if (allFaces.length > 1) {
          this.ui.updateQualityChecks({ faceCount: allFaces.length, centered: false, landmarks: false });
          this.ui.setRegistrationStep('Múltiplos Rostos Detectados', 'Permaneça sozinho diante da câmera.');
          await this.delay(300);
          continue;
        }

        // 2. Extrai o descritor e os marcos
        const faceData = await this.aiEngine.extractSingleFace(videoEl);

        if (!faceData || !faceData.descriptor || !faceData.isQualitySufficient) {
          this.ui.updateQualityChecks({ faceCount: 1, centered: false, landmarks: false });
          this.ui.setRegistrationStep('Qualidade Insuficiente', 'Aproxime-se e melhore a iluminação do ambiente.');
          await this.delay(300);
          continue;
        }

        // Qualidade aprovada
        this.ui.updateQualityChecks({ faceCount: 1, centered: true, landmarks: true });
        this.aiEngine.drawOverlay(canvasEl, faceData, 'standby', `Amostra ${this.samples.length + 1} de ${this.targetSamples}`);

        // Converte Float32Array para array tradicional de números para serialização JSON
        const vectorArray = Array.from(faceData.descriptor);
        this.samples.push(vectorArray);

        this.ui.updateRegistrationProgress(this.samples.length, this.targetSamples);
        this.ui.setRegistrationStep(
          `Amostra ${this.samples.length} de ${this.targetSamples} coletada`,
          'Mantenha a posição...'
        );

        // Intervalo de 350ms entre amostras para capturar micro-variações naturais
        await this.delay(350);
      } catch (err) {
        console.error('Erro durante captura de amostra:', err);
        consecutiveFailures++;
        if (consecutiveFailures > 10) {
          this.ui.showToast('Falha reiterada na captura. Verifique a câmera.', 'error');
          break;
        }
        await this.delay(400);
      }
    }

    if (!this.isCapturing) return; // Foi cancelado pelo usuário

    if (this.samples.length >= this.targetSamples) {
      await this.submitRegistration(userName, false);
    } else {
      this.ui.setRegistrationStep('Captura Incompleta', 'Não foi possível coletar todas as amostras.');
      this.isCapturing = false;
    }
  }

  /**
   * Envia os embeddings para o servidor backend.
   */
  async submitRegistration(userName, force = false) {
    this.ui.setRegistrationStep('Persistindo Dados', 'Salvando embeddings no banco SQLite local...');

    try {
      const response = await api.createUser({
        name: userName,
        consent: true,
        samples: this.samples,
        force
      });

      this.ui.showToast(`Usuário "${response.user.name}" cadastrado com sucesso!`, 'success');
      this.ui.setRegistrationStep('Cadastro Concluído', 'Usuário cadastrado e pronto para reconhecimento.');
      this.camera.stop();
      this.reset();
      this.ui.onUserRegistered();
    } catch (err) {
      if (err.status === 409 && err.data?.isDuplicate) {
        // Exibe modal de alerta de duplicidade
        this.ui.showDuplicateModal(err.data.message, () => {
          // Confirmou envio forçado
          this.submitRegistration(userName, true);
        }, () => {
          // Abortou
          this.reset();
          this.ui.setRegistrationStep('Cadastro Cancelado', 'Operação cancelada devido à duplicidade facial.');
        });
      } else {
        this.ui.showToast(err.message || 'Erro ao registrar usuário.', 'error');
        this.ui.setRegistrationStep('Erro no Cadastro', err.message);
      }
    } finally {
      this.isCapturing = false;
    }
  }

  cancel() {
    this.isCapturing = false;
    this.reset();
    this.camera.stop();
    this.ui.setRegistrationStep('Cancelado', 'Processo de cadastro interrompido pelo usuário.');
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

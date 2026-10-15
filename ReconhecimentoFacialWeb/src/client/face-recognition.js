/**
 * Motor de Inteligência Artificial e Reconhecimento Facial no Navegador
 * Interface com a biblioteca @vladmandic/face-api carregada localmente.
 */

export class FaceRecognitionEngine {
  constructor() {
    this.modelsLoaded = false;
    this.detectorOptions = null;
    this.modelsUri = '/models';
  }

  /**
   * Inicializa e carrega os pesos dos modelos neurais a partir de public/models/
   * @param {(status: string) => void} onStatus Callback para atualizar interface
   */
  async loadModels(onStatus = () => {}) {
    if (this.modelsLoaded) return true;

    if (!window.faceapi) {
      throw new Error('A biblioteca face-api.js não foi encontrada no escopo global.');
    }

    try {
      onStatus('Carregando TinyFaceDetector...');
      await window.faceapi.nets.tinyFaceDetector.loadFromUri(this.modelsUri);

      onStatus('Carregando FaceLandmark68Net...');
      await window.faceapi.nets.faceLandmark68Net.loadFromUri(this.modelsUri);

      onStatus('Carregando FaceRecognitionNet (128-d embeddings)...');
      await window.faceapi.nets.faceRecognitionNet.loadFromUri(this.modelsUri);

      this.detectorOptions = new window.faceapi.TinyFaceDetectorOptions({
        inputSize: 320,
        scoreThreshold: 0.5
      });

      this.modelsLoaded = true;
      onStatus('Modelos carregados com sucesso');
      return true;
    } catch (err) {
      this.modelsLoaded = false;
      onStatus('Erro ao carregar modelos');
      throw err;
    }
  }

  /**
   * Detecta todas as faces presentes para controle de multidão/múltiplos rostos.
   * @param {HTMLVideoElement} video
   */
  async detectAllFaces(video) {
    if (!this.modelsLoaded || !video || video.readyState < 2) return [];
    return window.faceapi.detectAllFaces(video, this.detectorOptions);
  }

  /**
   * Detecta um único rosto, extrai marcos faciais e computa o embedding de 128 dimensões.
   * @param {HTMLVideoElement} video
   */
  async extractSingleFace(video) {
    if (!this.modelsLoaded || !video || video.readyState < 2) return null;

    const result = await window.faceapi
      .detectSingleFace(video, this.detectorOptions)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!result) return null;

    // Avalia qualidade básica do enquadramento
    const box = result.detection.box;
    const isQualitySufficient = box.width >= 100 && box.height >= 100;

    return {
      detection: result.detection,
      landmarks: result.landmarks,
      descriptor: result.descriptor, // Float32Array de 128 posições
      box,
      score: result.detection.score,
      isQualitySufficient
    };
  }

  /**
   * Renderiza os marcos faciais e a caixa delimitadora com visual moderno e customizado no canvas.
   * @param {HTMLCanvasElement} canvas
   * @param {Object} faceData
   * @param {'standby'|'granted'|'denied'} state
   * @param {string} labelText
   */
  drawOverlay(canvas, faceData, state = 'standby', labelText = '') {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!faceData || !faceData.box) return;

    const { x, y, width, height } = faceData.box;

    let primaryColor = '#6366f1';
    let glowColor = 'rgba(99, 102, 241, 0.4)';

    if (state === 'granted') {
      primaryColor = '#10b981';
      glowColor = 'rgba(16, 185, 129, 0.5)';
    } else if (state === 'denied') {
      primaryColor = '#f43f5e';
      glowColor = 'rgba(244, 63, 94, 0.5)';
    }

    ctx.save();

    // 1. Desenha cantos estilizados da caixa delimitadora
    const cornerLen = Math.min(24, width * 0.2);
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 3;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 12;

    // Canto Superior Esquerdo
    ctx.beginPath();
    ctx.moveTo(x, y + cornerLen);
    ctx.lineTo(x, y);
    ctx.lineTo(x + cornerLen, y);
    ctx.stroke();

    // Canto Superior Direito
    ctx.beginPath();
    ctx.moveTo(x + width - cornerLen, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + cornerLen);
    ctx.stroke();

    // Canto Inferior Esquerdo
    ctx.beginPath();
    ctx.moveTo(x, y + height - cornerLen);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x + cornerLen, y + height);
    ctx.stroke();

    // Canto Inferior Direito
    ctx.beginPath();
    ctx.moveTo(x + width - cornerLen, y + height);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x + width, y + height - cornerLen);
    ctx.stroke();

    // 2. Pontos dos marcos faciais (landmarks sutis)
    if (faceData.landmarks) {
      const positions = faceData.landmarks.positions;
      ctx.fillStyle = primaryColor;
      ctx.shadowBlur = 4;
      for (let i = 0; i < positions.length; i += 2) {
        ctx.beginPath();
        ctx.arc(positions[i].x, positions[i].y, 1.6, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    // 3. Etiqueta / Badge com texto flutuante
    if (labelText) {
      ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
      const textWidth = ctx.measureText(labelText).width;
      const padX = 10;
      const padY = 6;
      const badgeY = y > 35 ? y - 28 : y + height + 20;

      ctx.fillStyle = 'rgba(14, 19, 31, 0.9)';
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.roundRect(x, badgeY, textWidth + padX * 2, 24, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 0;
      ctx.fillText(labelText, x + padX, badgeY + 16);
    }

    ctx.restore();
  }
}

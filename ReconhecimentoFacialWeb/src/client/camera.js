/**
 * Gerenciador de Acesso e Fluxo de Vídeo da Webcam
 * Controla ativação, enumeração de dispositivos e desligamento do stream.
 */

export class CameraManager {
  constructor(videoElement, canvasElement) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.stream = null;
    this.currentDeviceId = null;
    this.isActive = false;
  }

  /**
   * Lista os dispositivos de entrada de vídeo disponíveis.
   */
  async getAvailableCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'videoinput');
    } catch (err) {
      console.warn('Não foi possível enumerar dispositivos de vídeo:', err);
      return [];
    }
  }

  /**
   * Inicia o fluxo de vídeo da webcam.
   * @param {string} deviceId ID opcional do dispositivo selecionado
   */
  async start(deviceId = null) {
    this.stop(); // Garante interrupção prévia

    const constraints = {
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user'
      },
      audio: false
    };

    if (deviceId) {
      constraints.video.deviceId = { exact: deviceId };
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;
      this.currentDeviceId = deviceId;
      this.isActive = true;

      // Aguarda o vídeo carregar metadados e começar a tocar
      await new Promise(resolve => {
        this.video.onloadedmetadata = () => {
          this.video.play().then(resolve);
        };
      });

      this.syncCanvasSize();
      return true;
    } catch (err) {
      this.isActive = false;
      this.stream = null;
      throw err;
    }
  }

  /**
   * Sincroniza as dimensões do canvas de overlay com o vídeo.
   */
  syncCanvasSize() {
    if (this.video && this.canvas && this.video.videoWidth > 0) {
      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;
    }
  }

  /**
   * Interrompe o fluxo de vídeo e desliga a câmera física (LED apaga).
   */
  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
    }
    if (this.canvas) {
      const ctx = this.canvas.getContext('2d');
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.isActive = false;
  }
}

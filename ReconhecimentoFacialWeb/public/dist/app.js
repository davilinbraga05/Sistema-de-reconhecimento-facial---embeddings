(() => {
  // src/client/api.js
  var api = {
    async getHealth() {
      const res = await fetch("/api/health");
      return res.json();
    },
    async getAuthStatus() {
      const res = await fetch("/api/auth/status");
      return res.json();
    },
    async setupAdminPin(pin) {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao configurar PIN.");
      return data;
    },
    async loginAdmin(pin) {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha na autentica\xE7\xE3o.");
      return data;
    },
    async logoutAdmin() {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      return res.json();
    },
    async getUsers() {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao obter usu\xE1rios.");
      return data.users;
    },
    async createUser({ name, consent, samples, force = false }) {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, consent, samples, force })
      });
      const data = await res.json();
      if (!res.ok) {
        const err = new Error(data.error || "Falha ao cadastrar usu\xE1rio.");
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    },
    async updateUser(id, updates) {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao atualizar usu\xE1rio.");
      return data;
    },
    async deleteUser(id) {
      const res = await fetch(`/api/users/${id}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao excluir usu\xE1rio.");
      return data;
    },
    async recognizeFace(descriptor) {
      const res = await fetch("/api/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descriptor })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.reason || "Erro na infer\xEAncia do servidor.");
      return data;
    },
    async getEvents(limit = 50) {
      const res = await fetch(`/api/events?limit=${limit}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao obter hist\xF3rico.");
      return data.events;
    },
    async clearEvents() {
      const res = await fetch("/api/events", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao limpar hist\xF3rico.");
      return data;
    },
    async getSettings() {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao obter configura\xE7\xF5es.");
      return data.settings;
    },
    async updateSettings(settings) {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao atualizar configura\xE7\xF5es.");
      return data.settings;
    }
  };

  // src/client/camera.js
  var CameraManager = class {
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
        return devices.filter((device) => device.kind === "videoinput");
      } catch (err) {
        console.warn("N\xE3o foi poss\xEDvel enumerar dispositivos de v\xEDdeo:", err);
        return [];
      }
    }
    /**
     * Inicia o fluxo de vídeo da webcam.
     * @param {string} deviceId ID opcional do dispositivo selecionado
     */
    async start(deviceId = null) {
      this.stop();
      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user"
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
        await new Promise((resolve) => {
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
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
      }
      if (this.video) {
        this.video.srcObject = null;
      }
      if (this.canvas) {
        const ctx = this.canvas.getContext("2d");
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
      this.isActive = false;
    }
  };

  // src/client/face-recognition.js
  var FaceRecognitionEngine = class {
    constructor() {
      this.modelsLoaded = false;
      this.detectorOptions = null;
      this.modelsUri = "/models";
    }
    /**
     * Inicializa e carrega os pesos dos modelos neurais a partir de public/models/
     * @param {(status: string) => void} onStatus Callback para atualizar interface
     */
    async loadModels(onStatus = () => {
    }) {
      if (this.modelsLoaded) return true;
      if (!window.faceapi) {
        throw new Error("A biblioteca face-api.js n\xE3o foi encontrada no escopo global.");
      }
      try {
        onStatus("Carregando TinyFaceDetector...");
        await window.faceapi.nets.tinyFaceDetector.loadFromUri(this.modelsUri);
        onStatus("Carregando FaceLandmark68Net...");
        await window.faceapi.nets.faceLandmark68Net.loadFromUri(this.modelsUri);
        onStatus("Carregando FaceRecognitionNet (128-d embeddings)...");
        await window.faceapi.nets.faceRecognitionNet.loadFromUri(this.modelsUri);
        this.detectorOptions = new window.faceapi.TinyFaceDetectorOptions({
          inputSize: 320,
          scoreThreshold: 0.5
        });
        this.modelsLoaded = true;
        onStatus("Modelos carregados com sucesso");
        return true;
      } catch (err) {
        this.modelsLoaded = false;
        onStatus("Erro ao carregar modelos");
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
      const result = await window.faceapi.detectSingleFace(video, this.detectorOptions).withFaceLandmarks().withFaceDescriptor();
      if (!result) return null;
      const box = result.detection.box;
      const isQualitySufficient = box.width >= 100 && box.height >= 100;
      return {
        detection: result.detection,
        landmarks: result.landmarks,
        descriptor: result.descriptor,
        // Float32Array de 128 posições
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
    drawOverlay(canvas, faceData, state = "standby", labelText = "") {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!faceData || !faceData.box) return;
      const { x, y, width, height } = faceData.box;
      let primaryColor = "#6366f1";
      let glowColor = "rgba(99, 102, 241, 0.4)";
      if (state === "granted") {
        primaryColor = "#10b981";
        glowColor = "rgba(16, 185, 129, 0.5)";
      } else if (state === "denied") {
        primaryColor = "#f43f5e";
        glowColor = "rgba(244, 63, 94, 0.5)";
      }
      ctx.save();
      const cornerLen = Math.min(24, width * 0.2);
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 3;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(x, y + cornerLen);
      ctx.lineTo(x, y);
      ctx.lineTo(x + cornerLen, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + width - cornerLen, y);
      ctx.lineTo(x + width, y);
      ctx.lineTo(x + width, y + cornerLen);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y + height - cornerLen);
      ctx.lineTo(x, y + height);
      ctx.lineTo(x + cornerLen, y + height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + width - cornerLen, y + height);
      ctx.lineTo(x + width, y + height);
      ctx.lineTo(x + width, y + height - cornerLen);
      ctx.stroke();
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
      if (labelText) {
        ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
        const textWidth = ctx.measureText(labelText).width;
        const padX = 10;
        const padY = 6;
        const badgeY = y > 35 ? y - 28 : y + height + 20;
        ctx.fillStyle = "rgba(14, 19, 31, 0.9)";
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(x, badgeY, textWidth + padX * 2, 24, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.shadowBlur = 0;
        ctx.fillText(labelText, x + padX, badgeY + 16);
      }
      ctx.restore();
    }
  };

  // src/client/registration.js
  var RegistrationManager = class {
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
        "Capturando Amostras Biom\xE9tricas",
        "Olhe para a c\xE2mera e fa\xE7a pequenos movimentos suaves com a cabe\xE7a."
      );
      const videoEl = this.camera.video;
      const canvasEl = this.camera.canvas;
      let consecutiveFailures = 0;
      while (this.isCapturing && this.samples.length < this.targetSamples) {
        try {
          const allFaces = await this.aiEngine.detectAllFaces(videoEl);
          if (allFaces.length === 0) {
            this.ui.updateQualityChecks({ faceCount: 0, centered: false, landmarks: false });
            this.ui.setRegistrationStep("Aguardando Rosto", "Posicione seu rosto dentro da moldura oval.");
            await this.delay(300);
            continue;
          }
          if (allFaces.length > 1) {
            this.ui.updateQualityChecks({ faceCount: allFaces.length, centered: false, landmarks: false });
            this.ui.setRegistrationStep("M\xFAltiplos Rostos Detectados", "Permane\xE7a sozinho diante da c\xE2mera.");
            await this.delay(300);
            continue;
          }
          const faceData = await this.aiEngine.extractSingleFace(videoEl);
          if (!faceData || !faceData.descriptor || !faceData.isQualitySufficient) {
            this.ui.updateQualityChecks({ faceCount: 1, centered: false, landmarks: false });
            this.ui.setRegistrationStep("Qualidade Insuficiente", "Aproxime-se e melhore a ilumina\xE7\xE3o do ambiente.");
            await this.delay(300);
            continue;
          }
          this.ui.updateQualityChecks({ faceCount: 1, centered: true, landmarks: true });
          this.aiEngine.drawOverlay(canvasEl, faceData, "standby", `Amostra ${this.samples.length + 1} de ${this.targetSamples}`);
          const vectorArray = Array.from(faceData.descriptor);
          this.samples.push(vectorArray);
          this.ui.updateRegistrationProgress(this.samples.length, this.targetSamples);
          this.ui.setRegistrationStep(
            `Amostra ${this.samples.length} de ${this.targetSamples} coletada`,
            "Mantenha a posi\xE7\xE3o..."
          );
          await this.delay(350);
        } catch (err) {
          console.error("Erro durante captura de amostra:", err);
          consecutiveFailures++;
          if (consecutiveFailures > 10) {
            this.ui.showToast("Falha reiterada na captura. Verifique a c\xE2mera.", "error");
            break;
          }
          await this.delay(400);
        }
      }
      if (!this.isCapturing) return;
      if (this.samples.length >= this.targetSamples) {
        await this.submitRegistration(userName, false);
      } else {
        this.ui.setRegistrationStep("Captura Incompleta", "N\xE3o foi poss\xEDvel coletar todas as amostras.");
        this.isCapturing = false;
      }
    }
    /**
     * Envia os embeddings para o servidor backend.
     */
    async submitRegistration(userName, force = false) {
      this.ui.setRegistrationStep("Persistindo Dados", "Salvando embeddings no banco SQLite local...");
      try {
        const response = await api.createUser({
          name: userName,
          consent: true,
          samples: this.samples,
          force
        });
        this.ui.showToast(`Usu\xE1rio "${response.user.name}" cadastrado com sucesso!`, "success");
        this.ui.setRegistrationStep("Cadastro Conclu\xEDdo", "Usu\xE1rio cadastrado e pronto para reconhecimento.");
        this.camera.stop();
        this.reset();
        this.ui.onUserRegistered();
      } catch (err) {
        if (err.status === 409 && err.data?.isDuplicate) {
          this.ui.showDuplicateModal(err.data.message, () => {
            this.submitRegistration(userName, true);
          }, () => {
            this.reset();
            this.ui.setRegistrationStep("Cadastro Cancelado", "Opera\xE7\xE3o cancelada devido \xE0 duplicidade facial.");
          });
        } else {
          this.ui.showToast(err.message || "Erro ao registrar usu\xE1rio.", "error");
          this.ui.setRegistrationStep("Erro no Cadastro", err.message);
        }
      } finally {
        this.isCapturing = false;
      }
    }
    cancel() {
      this.isCapturing = false;
      this.reset();
      this.camera.stop();
      this.ui.setRegistrationStep("Cancelado", "Processo de cadastro interrompido pelo usu\xE1rio.");
    }
    delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
  };

  // src/client/ui.js
  var UIManager = class {
    constructor() {
      this.activeTab = "tab-dashboard";
      this.toastContainer = document.getElementById("toast-container");
      this.initTabNavigation();
    }
    initTabNavigation() {
      const tabs = document.querySelectorAll(".nav-tab");
      tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
          const targetTab = tab.getAttribute("data-tab");
          this.switchTab(targetTab);
        });
      });
    }
    switchTab(tabId) {
      this.activeTab = tabId;
      document.querySelectorAll(".nav-tab").forEach((t) => {
        t.classList.toggle("active", t.getAttribute("data-tab") === tabId);
      });
      document.querySelectorAll(".tab-pane").forEach((p) => {
        p.classList.toggle("active", p.id === tabId);
      });
      window.dispatchEvent(new CustomEvent("tabChanged", { detail: { activeTab: tabId } }));
    }
    showToast(message, type = "info") {
      const toast = document.createElement("div");
      toast.className = `toast toast-${type}`;
      let icon = "\u2139";
      if (type === "success") icon = "\u2713";
      if (type === "error") icon = "\u2715";
      toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
      this.toastContainer.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(100%)";
        toast.style.transition = "all 0.3s ease";
        setTimeout(() => toast.remove(), 300);
      }, 4e3);
    }
    updateSystemStatus({ server, models, camera, users }) {
      if (server !== void 0) {
        const pill = document.getElementById("pill-server");
        const val = document.getElementById("val-server");
        pill.className = `status-pill ${server ? "online" : "offline"}`;
        val.textContent = server ? "Online" : "Offline";
      }
      if (models !== void 0) {
        const pill = document.getElementById("pill-models");
        const val = document.getElementById("val-models");
        pill.className = `status-pill ${models === "ready" ? "online" : models === "loading" ? "warning" : "offline"}`;
        val.textContent = models === "ready" ? "Prontos" : models === "loading" ? "Carregando" : "Erro";
      }
      if (camera !== void 0) {
        const pill = document.getElementById("pill-camera");
        const val = document.getElementById("val-camera");
        pill.className = `status-pill ${camera ? "online" : ""}`;
        val.textContent = camera ? "Ativa" : "Em espera";
      }
      if (users !== void 0) {
        document.getElementById("val-users").textContent = String(users);
        const dashUsers = document.getElementById("dash-total-users");
        if (dashUsers) dashUsers.textContent = String(users);
      }
    }
    updateDashboardStats(stats) {
      if (!stats) return;
      if (stats.totalUsers !== void 0) {
        document.getElementById("dash-total-users").textContent = String(stats.totalUsers);
      }
      if (stats.activeUsers !== void 0) {
        document.getElementById("dash-active-users").textContent = `${stats.activeUsers} autorizados`;
      }
      if (stats.totalEmbeddings !== void 0) {
        document.getElementById("dash-total-embeddings").textContent = String(stats.totalEmbeddings);
      }
      if (stats.threshold !== void 0) {
        document.getElementById("dash-threshold").textContent = Number(stats.threshold).toFixed(2);
      }
    }
    /**
     * Apresenta o modal para inserção do PIN administrativo.
     * Retorna uma Promise que resolve com o PIN ou rejeita se cancelado.
     */
    requestAdminPin(title = "Autentica\xE7\xE3o Administrativa", desc = "Digite o PIN para continuar:") {
      return new Promise((resolve, reject) => {
        const modal = document.getElementById("modal-admin-pin");
        const titleEl = document.getElementById("modal-pin-title");
        const descEl = document.getElementById("modal-pin-desc");
        const inputEl = document.getElementById("input-admin-pin");
        const errorEl = document.getElementById("modal-pin-error");
        const btnSubmit = document.getElementById("btn-submit-pin");
        const btnCancel = document.getElementById("btn-cancel-pin");
        const btnClose = document.getElementById("btn-close-pin-modal");
        titleEl.textContent = title;
        descEl.textContent = desc;
        inputEl.value = "";
        errorEl.style.display = "none";
        modal.style.display = "flex";
        inputEl.focus();
        const cleanup = () => {
          modal.style.display = "none";
          btnSubmit.onclick = null;
          btnCancel.onclick = null;
          btnClose.onclick = null;
          inputEl.onkeydown = null;
        };
        btnSubmit.onclick = () => {
          const val = inputEl.value.trim();
          if (val.length < 4) {
            errorEl.textContent = "O PIN deve ter no m\xEDnimo 4 d\xEDgitos.";
            errorEl.style.display = "block";
            return;
          }
          cleanup();
          resolve(val);
        };
        const handleCancel = () => {
          cleanup();
          reject(new Error("Opera\xE7\xE3o cancelada pelo usu\xE1rio."));
        };
        btnCancel.onclick = handleCancel;
        btnClose.onclick = handleCancel;
        inputEl.onkeydown = (e) => {
          if (e.key === "Enter") btnSubmit.click();
          if (e.key === "Escape") handleCancel();
        };
      });
    }
    showDuplicateModal(message, onForce, onAbort) {
      const modal = document.getElementById("modal-duplicate-alert");
      const msgEl = document.getElementById("duplicate-modal-msg");
      const btnForce = document.getElementById("btn-force-duplicate");
      const btnAbort = document.getElementById("btn-abort-duplicate");
      const btnClose = document.getElementById("btn-close-duplicate-modal");
      msgEl.textContent = message;
      modal.style.display = "flex";
      const cleanup = () => {
        modal.style.display = "none";
        btnForce.onclick = null;
        btnAbort.onclick = null;
        btnClose.onclick = null;
      };
      btnForce.onclick = () => {
        cleanup();
        onForce();
      };
      btnAbort.onclick = () => {
        cleanup();
        onAbort();
      };
      btnClose.onclick = () => {
        cleanup();
        onAbort();
      };
    }
    showEditUserModal(userId, currentName, onSave) {
      const modal = document.getElementById("modal-edit-user");
      const inputId = document.getElementById("edit-user-id");
      const inputName = document.getElementById("edit-user-name");
      const btnSave = document.getElementById("btn-save-edit");
      const btnCancel = document.getElementById("btn-cancel-edit");
      const btnClose = document.getElementById("btn-close-edit-modal");
      inputId.value = userId;
      inputName.value = currentName;
      modal.style.display = "flex";
      inputName.focus();
      const cleanup = () => {
        modal.style.display = "none";
        btnSave.onclick = null;
        btnCancel.onclick = null;
        btnClose.onclick = null;
      };
      btnSave.onclick = () => {
        const newName = inputName.value.trim();
        if (!newName) return;
        cleanup();
        onSave(newName);
      };
      btnCancel.onclick = cleanup;
      btnClose.onclick = cleanup;
    }
    renderUsersTable(users, { onToggleStatus, onEdit, onDelete }) {
      const tbody = document.getElementById("users-table-body");
      if (!users || users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center">Nenhum usu\xE1rio cadastrado no sistema. Cadastre seu rosto na aba "Cadastro Facial".</td></tr>`;
        return;
      }
      tbody.innerHTML = users.map((user) => {
        const dateFormatted = new Date(user.created_at).toLocaleString("pt-BR");
        const statusBadge = user.is_active ? `<span class="badge badge-active">Autorizado</span>` : `<span class="badge badge-inactive">Bloqueado</span>`;
        return `
        <tr data-user-id="${user.id}">
          <td><strong>#${user.id}</strong></td>
          <td><strong>${this.escapeHtml(user.name)}</strong></td>
          <td>${statusBadge}</td>
          <td><span class="badge badge-info">${user.sample_count} amostras</span></td>
          <td>${dateFormatted}</td>
          <td>
            <div class="table-actions">
              <button class="btn btn-secondary btn-sm btn-action-toggle" title="Alterar status de autoriza\xE7\xE3o">
                ${user.is_active ? "Desativar" : "Ativar"}
              </button>
              <button class="btn btn-secondary btn-sm btn-action-edit" title="Editar nome">
                Renomear
              </button>
              <button class="btn btn-danger btn-sm btn-action-delete" title="Excluir biometria">
                Excluir
              </button>
            </div>
          </td>
        </tr>
      `;
      }).join("");
      tbody.querySelectorAll("tr").forEach((row) => {
        const userId = parseInt(row.getAttribute("data-user-id"), 10);
        const user = users.find((u) => u.id === userId);
        row.querySelector(".btn-action-toggle")?.addEventListener("click", () => onToggleStatus(user));
        row.querySelector(".btn-action-edit")?.addEventListener("click", () => onEdit(user));
        row.querySelector(".btn-action-delete")?.addEventListener("click", () => onDelete(user));
      });
    }
    renderHistoryTable(events) {
      const tbody = document.getElementById("history-table-body");
      if (!events || events.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center">Nenhuma tentativa de acesso registrada at\xE9 o momento.</td></tr>`;
        return;
      }
      tbody.innerHTML = events.map((ev) => {
        const dateFormatted = new Date(ev.timestamp).toLocaleString("pt-BR");
        const badge = ev.result === "GRANTED" ? `<span class="badge badge-granted">ACESSO LIBERADO</span>` : `<span class="badge badge-denied">ACESSO NEGADO</span>`;
        const distFormatted = ev.distance !== null && ev.distance !== void 0 ? `<code>${Number(ev.distance).toFixed(4)}</code>` : "\u2014";
        return `
        <tr>
          <td>${dateFormatted}</td>
          <td>${badge}</td>
          <td><strong>${ev.user_name ? this.escapeHtml(ev.user_name) : "N\xE3o Identificado"}</strong></td>
          <td>${distFormatted}</td>
          <td>${this.escapeHtml(ev.reason)}</td>
        </tr>
      `;
      }).join("");
    }
    updateRegistrationProgress(current, total) {
      const fill = document.getElementById("reg-progress-fill");
      const label = document.getElementById("reg-sample-count-txt");
      const percent = document.getElementById("reg-progress-percent");
      const pct = Math.round(current / total * 100);
      fill.style.width = `${pct}%`;
      label.textContent = `Amostras: ${current} de ${total}`;
      percent.textContent = `${pct}%`;
    }
    setRegistrationStep(title, desc) {
      document.getElementById("reg-step-title").textContent = title;
      document.getElementById("reg-step-desc").textContent = desc;
    }
    updateQualityChecks({ faceCount, centered, landmarks }) {
      const qFace = document.getElementById("q-check-face");
      const qPos = document.getElementById("q-check-position");
      const qLand = document.getElementById("q-check-landmarks");
      const oval = document.getElementById("face-guide-oval");
      qFace.classList.toggle("passed", faceCount === 1);
      qPos.classList.toggle("passed", centered);
      qLand.classList.toggle("passed", landmarks);
      if (oval) {
        oval.classList.toggle("ready", faceCount === 1 && centered && landmarks);
      }
    }
    escapeHtml(str) {
      if (!str) return "";
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }
  };

  // src/client/main.js
  var App = class {
    constructor() {
      this.ui = new UIManager();
      this.aiEngine = new FaceRecognitionEngine();
      this.recCamera = new CameraManager(
        document.getElementById("rec-video"),
        document.getElementById("rec-canvas")
      );
      this.regCamera = new CameraManager(
        document.getElementById("reg-video"),
        document.getElementById("reg-canvas")
      );
      this.registration = new RegistrationManager({
        camera: this.regCamera,
        aiEngine: this.aiEngine,
        ui: this.ui
      });
      this.isRecognizing = false;
      this.recognitionLoopId = null;
      this.recentDecisions = [];
      this.temporalWindowSize = 4;
      this.requiredMatchesForGrant = 3;
      this.adminAuthenticated = false;
      this.activeSettings = {
        recognition_threshold: 0.55,
        ambiguity_margin: 0.05
      };
    }
    async init() {
      console.log("Iniciando BioAccess AI...");
      await this.checkSystemHealth();
      await this.checkAdminAuth();
      await this.loadSettings();
      await this.initializeAIModels();
      await this.setupCameraDevices();
      this.bindEvents();
      await this.loadUsers();
      await this.loadHistory();
    }
    async checkSystemHealth() {
      try {
        const health = await api.getHealth();
        this.ui.updateSystemStatus({
          server: health.status === "online",
          users: health.stats?.totalUsers ?? 0
        });
        this.ui.updateDashboardStats({
          totalUsers: health.stats?.totalUsers,
          activeUsers: health.stats?.activeUsers,
          totalEmbeddings: health.stats?.totalEmbeddings,
          threshold: this.activeSettings.recognition_threshold
        });
      } catch (err) {
        this.ui.updateSystemStatus({ server: false });
        this.ui.showToast("N\xE3o foi poss\xEDvel conectar ao servidor backend.", "error");
      }
    }
    async checkAdminAuth() {
      try {
        const auth = await api.getAuthStatus();
        this.adminAuthenticated = auth.authenticated;
        this.updateAdminButtonUI(auth);
      } catch {
        this.adminAuthenticated = false;
      }
    }
    updateAdminButtonUI({ configured, authenticated }) {
      const btn = document.getElementById("btn-admin-auth");
      const txt = document.getElementById("txt-admin-auth");
      if (!configured) {
        txt.textContent = "Criar PIN Admin";
        btn.className = "btn btn-primary btn-sm";
      } else if (authenticated) {
        txt.textContent = "Admin (Sair)";
        btn.className = "btn btn-secondary btn-sm";
      } else {
        txt.textContent = "Login Admin";
        btn.className = "btn btn-secondary btn-sm";
      }
    }
    async loadSettings() {
      try {
        const settings = await api.getSettings();
        this.activeSettings = settings;
        document.getElementById("input-threshold").value = settings.recognition_threshold;
        document.getElementById("display-threshold").textContent = Number(settings.recognition_threshold).toFixed(3);
        document.getElementById("dash-threshold").textContent = Number(settings.recognition_threshold).toFixed(2);
        document.getElementById("dec-threshold").textContent = Number(settings.recognition_threshold).toFixed(3);
        document.getElementById("input-margin").value = settings.ambiguity_margin;
        document.getElementById("display-margin").textContent = Number(settings.ambiguity_margin).toFixed(3);
      } catch (err) {
        console.warn("Erro ao carregar configura\xE7\xF5es:", err);
      }
    }
    async initializeAIModels() {
      this.ui.updateSystemStatus({ models: "loading" });
      try {
        await this.aiEngine.loadModels((statusMsg) => {
          const valModels = document.getElementById("val-models");
          if (valModels) valModels.textContent = statusMsg;
        });
        this.ui.updateSystemStatus({ models: "ready" });
        document.getElementById("dash-model-status").textContent = "Prontas";
      } catch (err) {
        console.error("Falha ao carregar modelos neurais:", err);
        this.ui.updateSystemStatus({ models: "error" });
        document.getElementById("dash-model-status").textContent = "Erro ao carregar";
        this.ui.showToast("Erro ao carregar os modelos de reconhecimento facial.", "error");
      }
    }
    async setupCameraDevices() {
      const cameras = await this.recCamera.getAvailableCameras();
      const select = document.getElementById("rec-camera-select");
      select.innerHTML = "";
      if (cameras.length === 0) {
        select.innerHTML = '<option value="">C\xE2mera padr\xE3o do sistema</option>';
        return;
      }
      cameras.forEach((cam, idx) => {
        const opt = document.createElement("option");
        opt.value = cam.deviceId;
        opt.textContent = cam.label || `C\xE2mera ${idx + 1}`;
        select.appendChild(opt);
      });
    }
    bindEvents() {
      document.getElementById("btn-quick-recognize")?.addEventListener("click", () => {
        this.ui.switchTab("tab-recognition");
        this.startRecognition();
      });
      document.getElementById("btn-quick-register")?.addEventListener("click", () => {
        this.ui.switchTab("tab-registration");
      });
      document.getElementById("btn-admin-auth")?.addEventListener("click", () => this.handleAdminAuthClick());
      document.getElementById("btn-toggle-recognition-camera")?.addEventListener("click", () => {
        if (this.isRecognizing) {
          this.stopRecognition();
        } else {
          this.startRecognition();
        }
      });
      document.getElementById("rec-camera-select")?.addEventListener("change", async (e) => {
        if (this.isRecognizing) {
          await this.recCamera.start(e.target.value);
        }
      });
      document.getElementById("btn-start-registration-camera")?.addEventListener("click", () => {
        this.startRegistrationCamera();
      });
      document.getElementById("btn-capture-samples")?.addEventListener("click", () => {
        this.handleStartRegistrationCapture();
      });
      document.getElementById("btn-cancel-registration")?.addEventListener("click", () => {
        this.registration.cancel();
        this.updateRegistrationButtonsState(false);
      });
      document.getElementById("btn-refresh-users")?.addEventListener("click", () => this.loadUsers());
      document.getElementById("btn-refresh-history")?.addEventListener("click", () => this.loadHistory());
      document.getElementById("btn-clear-history")?.addEventListener("click", () => this.handleClearHistory());
      const inputThreshold = document.getElementById("input-threshold");
      inputThreshold?.addEventListener("input", (e) => {
        document.getElementById("display-threshold").textContent = Number(e.target.value).toFixed(3);
      });
      const inputMargin = document.getElementById("input-margin");
      inputMargin?.addEventListener("input", (e) => {
        document.getElementById("display-margin").textContent = Number(e.target.value).toFixed(3);
      });
      document.getElementById("btn-save-settings")?.addEventListener("click", () => this.handleSaveSettings());
      document.getElementById("btn-reset-settings")?.addEventListener("click", () => this.handleResetSettings());
      window.addEventListener("tabChanged", (e) => {
        const active = e.detail.activeTab;
        if (active !== "tab-recognition" && this.isRecognizing) {
          this.stopRecognition();
        }
        if (active !== "tab-registration" && this.regCamera.isActive) {
          this.regCamera.stop();
          this.updateRegistrationButtonsState(false);
        }
      });
      this.ui.onUserRegistered = () => {
        this.loadUsers();
        this.checkSystemHealth();
        this.updateRegistrationButtonsState(false);
        document.getElementById("reg-name-input").value = "";
        document.getElementById("reg-consent-checkbox").checked = false;
        this.ui.switchTab("tab-users");
      };
    }
    // ==========================================================================
    // Reconhecimento Facial em Tempo Real
    // ==========================================================================
    async startRecognition() {
      if (!this.aiEngine.modelsLoaded) {
        this.ui.showToast("Os modelos neurais ainda est\xE3o sendo inicializados. Aguarde um instante.", "error");
        return;
      }
      try {
        const select = document.getElementById("rec-camera-select");
        const deviceId = select ? select.value : null;
        document.getElementById("rec-overlay-spinner").classList.add("active");
        document.getElementById("rec-overlay-text").textContent = "Conectando \xE0 c\xE2mera...";
        document.getElementById("rec-overlay-msg").classList.remove("hidden");
        await this.recCamera.start(deviceId);
        this.isRecognizing = true;
        this.recentDecisions = [];
        this.ui.updateSystemStatus({ camera: true });
        document.getElementById("rec-live-indicator").classList.add("active");
        document.getElementById("btn-toggle-recognition-camera").innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12"></rect></svg>
        Interromper C\xE2mera
      `;
        document.getElementById("btn-toggle-recognition-camera").className = "btn btn-danger btn-sm";
        document.getElementById("rec-overlay-msg").classList.add("hidden");
        this.runRecognitionLoop();
      } catch (err) {
        console.error("Falha ao abrir c\xE2mera de reconhecimento:", err);
        this.ui.showToast("N\xE3o foi poss\xEDvel acessar a webcam. Verifique permiss\xF5es do navegador.", "error");
        document.getElementById("rec-overlay-spinner").classList.remove("active");
        document.getElementById("rec-overlay-text").textContent = "Erro de acesso \xE0 c\xE2mera. Conceda permiss\xE3o no navegador.";
        this.stopRecognition();
      }
    }
    stopRecognition() {
      this.isRecognizing = false;
      if (this.recognitionLoopId) {
        clearTimeout(this.recognitionLoopId);
        this.recognitionLoopId = null;
      }
      this.recCamera.stop();
      this.ui.updateSystemStatus({ camera: false });
      this.recentDecisions = [];
      document.getElementById("rec-live-indicator").classList.remove("active");
      document.getElementById("btn-toggle-recognition-camera").innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
      Iniciar C\xE2mera
    `;
      document.getElementById("btn-toggle-recognition-camera").className = "btn btn-primary btn-sm";
      const overlay = document.getElementById("rec-overlay-msg");
      overlay.classList.remove("hidden");
      document.getElementById("rec-overlay-spinner").classList.remove("active");
      document.getElementById("rec-overlay-text").textContent = 'C\xE2mera inativa. Clique em "Iniciar C\xE2mera" para come\xE7ar.';
      this.resetDecisionBanner();
    }
    async runRecognitionLoop() {
      if (!this.isRecognizing) return;
      const startTime = performance.now();
      const videoEl = this.recCamera.video;
      const canvasEl = this.recCamera.canvas;
      try {
        this.recCamera.syncCanvasSize();
        const allFaces = await this.aiEngine.detectAllFaces(videoEl);
        document.getElementById("rec-faces-count").textContent = String(allFaces.length);
        if (allFaces.length === 0) {
          this.handleNoFacesDetected(canvasEl);
        } else if (allFaces.length > 1) {
          this.handleMultipleFacesDetected(canvasEl, allFaces.length);
        } else {
          const faceData = await this.aiEngine.extractSingleFace(videoEl);
          if (faceData && faceData.descriptor) {
            await this.processFaceRecognition(faceData, canvasEl);
          } else {
            this.handleLowQualityFace(canvasEl);
          }
        }
      } catch (err) {
        console.warn("Erro na infer\xEAncia:", err);
      }
      const elapsed = performance.now() - startTime;
      const fps = Math.round(1e3 / Math.max(elapsed, 1));
      document.getElementById("rec-fps").textContent = String(fps);
      const nextDelay = Math.max(20, 280 - elapsed);
      if (this.isRecognizing) {
        this.recognitionLoopId = setTimeout(() => this.runRecognitionLoop(), nextDelay);
      }
    }
    handleNoFacesDetected(canvasEl) {
      const ctx = canvasEl.getContext("2d");
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      this.recentDecisions = [];
      document.getElementById("rec-temporal-score").textContent = "0/3";
      this.updateDecisionBanner({
        state: "standby",
        headline: "AGUARDANDO ROSTO",
        sub: "Posicione-se diante da c\xE2mera para identifica\xE7\xE3o biom\xE9trica.",
        reason: "Nenhum rosto detectado no frame."
      });
    }
    handleMultipleFacesDetected(canvasEl, count) {
      const ctx = canvasEl.getContext("2d");
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      this.recentDecisions = [];
      document.getElementById("rec-temporal-score").textContent = "0/3";
      this.updateDecisionBanner({
        state: "denied",
        headline: "ACESSO NEGADO",
        sub: "Mais de um rosto detectado. Permane\xE7a sozinho diante da c\xE2mera.",
        userName: "M\xFAltiplos Rostos",
        distance: null,
        reason: `${count} rostos presentes no enquadramento.`
      });
    }
    handleLowQualityFace(canvasEl) {
      const ctx = canvasEl.getContext("2d");
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      this.updateDecisionBanner({
        state: "standby",
        headline: "ENQUADRAMENTO INSUFICIENTE",
        sub: "N\xE3o foi poss\xEDvel reconhecer o rosto com qualidade. Aproxime-se da c\xE2mera.",
        reason: "Resolu\xE7\xE3o ou ilumina\xE7\xE3o do rosto abaixo do limiar aceit\xE1vel."
      });
    }
    async processFaceRecognition(faceData, canvasEl) {
      const vectorArray = Array.from(faceData.descriptor);
      const result = await api.recognizeFace(vectorArray);
      this.recentDecisions.push(result);
      if (this.recentDecisions.length > this.temporalWindowSize) {
        this.recentDecisions.shift();
      }
      const grantedMatches = this.recentDecisions.filter(
        (d) => d.access === "GRANTED" && d.userId === result.userId
      ).length;
      document.getElementById("rec-temporal-score").textContent = `${grantedMatches}/${this.requiredMatchesForGrant}`;
      let visualState = "standby";
      let overlayLabel = "";
      if (result.access === "GRANTED" && grantedMatches >= this.requiredMatchesForGrant) {
        visualState = "granted";
        overlayLabel = `ACESSO LIBERADO: ${result.userName}`;
        this.updateDecisionBanner({
          state: "granted",
          headline: "ACESSO LIBERADO",
          sub: "Identidade biom\xE9trica autorizada com sucesso.",
          userName: result.userName,
          distance: result.distance,
          threshold: result.threshold,
          margin: result.margin,
          reason: result.reason
        });
        this.logRecentDecision(result);
      } else if (result.access === "DENIED") {
        visualState = "denied";
        overlayLabel = result.status === "INACTIVE_USER" ? "ACESSO NEGADO (INATIVO)" : "ACESSO NEGADO";
        this.updateDecisionBanner({
          state: "denied",
          headline: "ACESSO NEGADO",
          sub: result.status === "INACTIVE_USER" ? "Cadastro inativo ou revogado no sistema." : "Rosto n\xE3o reconhecido ou n\xE3o autorizado.",
          userName: result.userName || "Desconhecido",
          distance: result.distance,
          threshold: result.threshold,
          margin: result.margin,
          reason: result.reason
        });
        this.logRecentDecision(result);
      } else {
        visualState = "standby";
        overlayLabel = "Analisando vetor biom\xE9trico...";
      }
      this.aiEngine.drawOverlay(canvasEl, faceData, visualState, overlayLabel);
    }
    updateDecisionBanner({ state, headline, sub, userName, distance, threshold, margin, reason }) {
      const banner = document.getElementById("decision-banner");
      banner.className = `decision-banner state-${state}`;
      document.getElementById("decision-headline").textContent = headline;
      document.getElementById("decision-sub").textContent = sub;
      if (userName !== void 0) {
        document.getElementById("dec-user-name").textContent = userName || "\u2014";
      }
      if (distance !== void 0) {
        document.getElementById("dec-distance").textContent = distance !== null ? Number(distance).toFixed(4) : "\u2014";
      }
      if (threshold !== void 0) {
        document.getElementById("dec-threshold").textContent = Number(threshold).toFixed(3);
      }
      if (margin !== void 0) {
        document.getElementById("dec-margin").textContent = margin !== null ? Number(margin).toFixed(4) : "\u2014";
      }
      if (reason !== void 0) {
        document.getElementById("dec-reason").textContent = reason || "\u2014";
      }
    }
    resetDecisionBanner() {
      this.updateDecisionBanner({
        state: "standby",
        headline: "AGUARDANDO DETEC\xC7\xC3O",
        sub: "Posicione-se diante da c\xE2mera para identifica\xE7\xE3o.",
        userName: "\u2014",
        distance: null,
        reason: "Aguardando vetor de entrada"
      });
      document.getElementById("rec-faces-count").textContent = "0";
      document.getElementById("rec-temporal-score").textContent = "0/3";
    }
    logRecentDecision(result) {
      const list = document.getElementById("rec-recent-log");
      if (!list) return;
      const empty = list.querySelector(".log-empty");
      if (empty) empty.remove();
      const li = document.createElement("li");
      li.className = `recent-log-item ${result.access === "GRANTED" ? "granted" : "denied"}`;
      const timeStr = (/* @__PURE__ */ new Date()).toLocaleTimeString("pt-BR");
      const userStr = result.userName || "N\xE3o Identificado";
      const distStr = result.distance !== null ? `d=${Number(result.distance).toFixed(3)}` : "";
      li.innerHTML = `
      <span><strong>${result.access === "GRANTED" ? "LIBERADO" : "NEGADO"}:</strong> ${this.ui.escapeHtml(userStr)}</span>
      <span class="mono">${distStr} | ${timeStr}</span>
    `;
      list.insertBefore(li, list.firstChild);
      while (list.children.length > 5) {
        list.removeChild(list.lastChild);
      }
    }
    // ==========================================================================
    // Cadastro Facial
    // ==========================================================================
    async startRegistrationCamera() {
      if (!this.aiEngine.modelsLoaded) {
        this.ui.showToast("Aguarde os modelos neurais terminarem de carregar.", "error");
        return;
      }
      try {
        document.getElementById("reg-overlay-msg").classList.add("hidden");
        await this.regCamera.start();
        this.updateRegistrationButtonsState(true);
        document.getElementById("face-guide-oval").classList.add("active");
        document.getElementById("reg-camera-badge").className = "badge badge-active";
        document.getElementById("reg-camera-badge").textContent = "C\xE2mera Ativa";
      } catch (err) {
        console.error("Falha ao abrir c\xE2mera de cadastro:", err);
        this.ui.showToast("Erro ao acessar webcam para cadastro.", "error");
      }
    }
    updateRegistrationButtonsState(cameraActive) {
      document.getElementById("btn-capture-samples").disabled = !cameraActive;
      document.getElementById("btn-cancel-registration").disabled = !cameraActive;
      document.getElementById("btn-start-registration-camera").disabled = cameraActive;
      if (!cameraActive) {
        document.getElementById("face-guide-oval").classList.remove("active");
        document.getElementById("reg-camera-badge").className = "badge badge-warning";
        document.getElementById("reg-camera-badge").textContent = "Aguardando C\xE2mera";
        document.getElementById("reg-overlay-msg").classList.remove("hidden");
      }
    }
    async handleStartRegistrationCapture() {
      const nameInput = document.getElementById("reg-name-input");
      const consentCheck = document.getElementById("reg-consent-checkbox");
      const name = nameInput.value.trim();
      if (!name || name.length < 2) {
        this.ui.showToast("Informe o nome completo do usu\xE1rio para cadastro.", "error");
        nameInput.focus();
        return;
      }
      if (!consentCheck.checked) {
        this.ui.showToast("\xC9 obrigat\xF3rio assinalar o consentimento para prosseguir.", "error");
        return;
      }
      if (!this.adminAuthenticated) {
        const pin = await this.ui.requestAdminPin(
          "Autoriza\xE7\xE3o Administrativa",
          "Digite o PIN administrativo para autorizar o cadastro:"
        ).catch(() => null);
        if (!pin) return;
        try {
          await api.loginAdmin(pin);
          this.adminAuthenticated = true;
          this.updateAdminButtonUI({ configured: true, authenticated: true });
        } catch (err) {
          this.ui.showToast(err.message, "error");
          return;
        }
      }
      document.getElementById("btn-capture-samples").disabled = true;
      this.registration.startCapture(name);
    }
    // ==========================================================================
    // Gestão de Usuários
    // ==========================================================================
    async loadUsers() {
      try {
        const users = await api.getUsers();
        this.ui.renderUsersTable(users, {
          onToggleStatus: (u) => this.handleToggleUserStatus(u),
          onEdit: (u) => this.handleEditUser(u),
          onDelete: (u) => this.handleDeleteUser(u)
        });
        this.ui.updateSystemStatus({ users: users.length });
        this.ui.updateDashboardStats({
          totalUsers: users.length,
          activeUsers: users.filter((u) => u.is_active).length
        });
      } catch (err) {
        console.warn("Erro ao carregar usu\xE1rios:", err);
      }
    }
    async handleToggleUserStatus(user) {
      await this.ensureAdminAuth();
      try {
        const newStatus = !user.is_active;
        await api.updateUser(user.id, { is_active: newStatus });
        this.ui.showToast(`Usu\xE1rio "${user.name}" ${newStatus ? "ativado" : "desativado"} com sucesso!`, "success");
        await this.loadUsers();
      } catch (err) {
        this.ui.showToast(err.message, "error");
      }
    }
    async handleEditUser(user) {
      await this.ensureAdminAuth();
      this.ui.showEditUserModal(user.id, user.name, async (newName) => {
        try {
          await api.updateUser(user.id, { name: newName });
          this.ui.showToast("Nome atualizado com sucesso!", "success");
          await this.loadUsers();
        } catch (err) {
          this.ui.showToast(err.message, "error");
        }
      });
    }
    async handleDeleteUser(user) {
      await this.ensureAdminAuth();
      const confirmed = confirm(
        `ATEN\xC7\xC3O: Deseja realmente excluir permanentemente o usu\xE1rio "${user.name}"?
Todos os seus embeddings faciais ser\xE3o apagados do banco.`
      );
      if (!confirmed) return;
      try {
        await api.deleteUser(user.id);
        this.ui.showToast(`Usu\xE1rio "${user.name}" e seus embeddings foram exclu\xEDdos.`, "success");
        await this.loadUsers();
        await this.checkSystemHealth();
      } catch (err) {
        this.ui.showToast(err.message, "error");
      }
    }
    // ==========================================================================
    // Histórico e Configurações
    // ==========================================================================
    async loadHistory() {
      try {
        const events = await api.getEvents(50);
        this.ui.renderHistoryTable(events);
      } catch (err) {
        console.warn("Erro ao carregar hist\xF3rico:", err);
      }
    }
    async handleClearHistory() {
      await this.ensureAdminAuth();
      if (!confirm("Deseja limpar todo o hist\xF3rico de tentativas de acesso?")) return;
      try {
        await api.clearEvents();
        this.ui.showToast("Hist\xF3rico limpo com sucesso!", "success");
        await this.loadHistory();
      } catch (err) {
        this.ui.showToast(err.message, "error");
      }
    }
    async handleSaveSettings() {
      await this.ensureAdminAuth();
      const threshold = parseFloat(document.getElementById("input-threshold").value);
      const margin = parseFloat(document.getElementById("input-margin").value);
      try {
        const updated = await api.updateSettings({
          recognition_threshold: threshold,
          ambiguity_margin: margin
        });
        this.activeSettings = updated;
        document.getElementById("dash-threshold").textContent = Number(updated.recognition_threshold).toFixed(2);
        document.getElementById("dec-threshold").textContent = Number(updated.recognition_threshold).toFixed(3);
        this.ui.showToast("Configura\xE7\xF5es biom\xE9tricas atualizadas com sucesso!", "success");
      } catch (err) {
        this.ui.showToast(err.message, "error");
      }
    }
    async handleResetSettings() {
      document.getElementById("input-threshold").value = "0.55";
      document.getElementById("display-threshold").textContent = "0.550";
      document.getElementById("input-margin").value = "0.05";
      document.getElementById("display-margin").textContent = "0.050";
      await this.handleSaveSettings();
    }
    // ==========================================================================
    // Autenticação Administrativa
    // ==========================================================================
    async handleAdminAuthClick() {
      const authStatus = await api.getAuthStatus();
      if (!authStatus.configured) {
        try {
          const pin = await this.ui.requestAdminPin(
            "Configurar PIN Administrativo",
            "Crie um PIN administrativo de no m\xEDnimo 4 d\xEDgitos:"
          );
          await api.setupAdminPin(pin);
          this.adminAuthenticated = true;
          this.ui.showToast("PIN administrativo configurado e autenticado!", "success");
          this.updateAdminButtonUI({ configured: true, authenticated: true });
        } catch (err) {
          if (err.message) this.ui.showToast(err.message, "error");
        }
      } else if (authStatus.authenticated) {
        await api.logoutAdmin();
        this.adminAuthenticated = false;
        this.ui.showToast("Sess\xE3o administrativa encerrada.", "info");
        this.updateAdminButtonUI({ configured: true, authenticated: false });
      } else {
        try {
          const pin = await this.ui.requestAdminPin(
            "Login Administrativo",
            "Digite seu PIN administrativo:"
          );
          await api.loginAdmin(pin);
          this.adminAuthenticated = true;
          this.ui.showToast("Autenticado como Administrador!", "success");
          this.updateAdminButtonUI({ configured: true, authenticated: true });
        } catch (err) {
          if (err.message) this.ui.showToast(err.message, "error");
        }
      }
    }
    async ensureAdminAuth() {
      if (this.adminAuthenticated) return true;
      const authStatus = await api.getAuthStatus();
      if (!authStatus.configured) {
        const pin2 = await this.ui.requestAdminPin(
          "Criar PIN Administrativo",
          "Crie um PIN administrativo para prosseguir:"
        );
        await api.setupAdminPin(pin2);
        this.adminAuthenticated = true;
        this.updateAdminButtonUI({ configured: true, authenticated: true });
        return true;
      }
      const pin = await this.ui.requestAdminPin(
        "Autentica\xE7\xE3o Necess\xE1ria",
        "Opera\xE7\xE3o administrativa protegida. Digite seu PIN:"
      );
      await api.loginAdmin(pin);
      this.adminAuthenticated = true;
      this.updateAdminButtonUI({ configured: true, authenticated: true });
      return true;
    }
  };
  document.addEventListener("DOMContentLoaded", () => {
    const app = new App();
    app.init().catch((err) => {
      console.error("Erro na inicializa\xE7\xE3o da aplica\xE7\xE3o:", err);
    });
  });
})();
//# sourceMappingURL=app.js.map

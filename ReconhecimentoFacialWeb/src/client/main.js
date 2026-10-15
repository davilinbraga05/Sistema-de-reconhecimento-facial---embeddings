/**
 * Ponto de Entrada Principal da Aplicação Web Cliente
 * Integra Câmera, Motor de IA, Reconhecimento com Suavização Temporal e UI.
 */

import { api } from './api.js';
import { CameraManager } from './camera.js';
import { FaceRecognitionEngine } from './face-recognition.js';
import { RegistrationManager } from './registration.js';
import { UIManager } from './ui.js';

class App {
  constructor() {
    this.ui = new UIManager();
    this.aiEngine = new FaceRecognitionEngine();

    // Gerenciadores de câmera para Reconhecimento e Cadastro
    this.recCamera = new CameraManager(
      document.getElementById('rec-video'),
      document.getElementById('rec-canvas')
    );

    this.regCamera = new CameraManager(
      document.getElementById('reg-video'),
      document.getElementById('reg-canvas')
    );

    this.registration = new RegistrationManager({
      camera: this.regCamera,
      aiEngine: this.aiEngine,
      ui: this.ui
    });

    this.isRecognizing = false;
    this.recognitionLoopId = null;

    // Buffer de decisões recentes para estabilização temporal (anti-flickering)
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
    console.log('Iniciando BioAccess AI...');

    // 1. Carrega configurações do sistema e estado do servidor
    await this.checkSystemHealth();
    await this.checkAdminAuth();
    await this.loadSettings();

    // 2. Carrega modelos neurais locais
    await this.initializeAIModels();

    // 3. Enumera câmeras disponíveis
    await this.setupCameraDevices();

    // 4. Vincula eventos do DOM
    this.bindEvents();

    // 5. Carrega dados iniciais das tabelas
    await this.loadUsers();
    await this.loadHistory();
  }

  async checkSystemHealth() {
    try {
      const health = await api.getHealth();
      this.ui.updateSystemStatus({
        server: health.status === 'online',
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
      this.ui.showToast('Não foi possível conectar ao servidor backend.', 'error');
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
    const btn = document.getElementById('btn-admin-auth');
    const txt = document.getElementById('txt-admin-auth');

    if (!configured) {
      txt.textContent = 'Criar PIN Admin';
      btn.className = 'btn btn-primary btn-sm';
    } else if (authenticated) {
      txt.textContent = 'Admin (Sair)';
      btn.className = 'btn btn-secondary btn-sm';
    } else {
      txt.textContent = 'Login Admin';
      btn.className = 'btn btn-secondary btn-sm';
    }
  }

  async loadSettings() {
    try {
      const settings = await api.getSettings();
      this.activeSettings = settings;

      document.getElementById('input-threshold').value = settings.recognition_threshold;
      document.getElementById('display-threshold').textContent = Number(settings.recognition_threshold).toFixed(3);
      document.getElementById('dash-threshold').textContent = Number(settings.recognition_threshold).toFixed(2);
      document.getElementById('dec-threshold').textContent = Number(settings.recognition_threshold).toFixed(3);

      document.getElementById('input-margin').value = settings.ambiguity_margin;
      document.getElementById('display-margin').textContent = Number(settings.ambiguity_margin).toFixed(3);
    } catch (err) {
      console.warn('Erro ao carregar configurações:', err);
    }
  }

  async initializeAIModels() {
    this.ui.updateSystemStatus({ models: 'loading' });
    try {
      await this.aiEngine.loadModels(statusMsg => {
        const valModels = document.getElementById('val-models');
        if (valModels) valModels.textContent = statusMsg;
      });
      this.ui.updateSystemStatus({ models: 'ready' });
      document.getElementById('dash-model-status').textContent = 'Prontas';
    } catch (err) {
      console.error('Falha ao carregar modelos neurais:', err);
      this.ui.updateSystemStatus({ models: 'error' });
      document.getElementById('dash-model-status').textContent = 'Erro ao carregar';
      this.ui.showToast('Erro ao carregar os modelos de reconhecimento facial.', 'error');
    }
  }

  async setupCameraDevices() {
    const cameras = await this.recCamera.getAvailableCameras();
    const select = document.getElementById('rec-camera-select');
    select.innerHTML = '';

    if (cameras.length === 0) {
      select.innerHTML = '<option value="">Câmera padrão do sistema</option>';
      return;
    }

    cameras.forEach((cam, idx) => {
      const opt = document.createElement('option');
      opt.value = cam.deviceId;
      opt.textContent = cam.label || `Câmera ${idx + 1}`;
      select.appendChild(opt);
    });
  }

  bindEvents() {
    // Ações Rápidas do Dashboard
    document.getElementById('btn-quick-recognize')?.addEventListener('click', () => {
      this.ui.switchTab('tab-recognition');
      this.startRecognition();
    });

    document.getElementById('btn-quick-register')?.addEventListener('click', () => {
      this.ui.switchTab('tab-registration');
    });

    // Botão de Autenticação / PIN
    document.getElementById('btn-admin-auth')?.addEventListener('click', () => this.handleAdminAuthClick());

    // Câmera de Reconhecimento
    document.getElementById('btn-toggle-recognition-camera')?.addEventListener('click', () => {
      if (this.isRecognizing) {
        this.stopRecognition();
      } else {
        this.startRecognition();
      }
    });

    document.getElementById('rec-camera-select')?.addEventListener('change', async (e) => {
      if (this.isRecognizing) {
        await this.recCamera.start(e.target.value);
      }
    });

    // Cadastro Facial
    document.getElementById('btn-start-registration-camera')?.addEventListener('click', () => {
      this.startRegistrationCamera();
    });

    document.getElementById('btn-capture-samples')?.addEventListener('click', () => {
      this.handleStartRegistrationCapture();
    });

    document.getElementById('btn-cancel-registration')?.addEventListener('click', () => {
      this.registration.cancel();
      this.updateRegistrationButtonsState(false);
    });

    // Usuários e Histórico
    document.getElementById('btn-refresh-users')?.addEventListener('click', () => this.loadUsers());
    document.getElementById('btn-refresh-history')?.addEventListener('click', () => this.loadHistory());
    document.getElementById('btn-clear-history')?.addEventListener('click', () => this.handleClearHistory());

    // Configurações
    const inputThreshold = document.getElementById('input-threshold');
    inputThreshold?.addEventListener('input', (e) => {
      document.getElementById('display-threshold').textContent = Number(e.target.value).toFixed(3);
    });

    const inputMargin = document.getElementById('input-margin');
    inputMargin?.addEventListener('input', (e) => {
      document.getElementById('display-margin').textContent = Number(e.target.value).toFixed(3);
    });

    document.getElementById('btn-save-settings')?.addEventListener('click', () => this.handleSaveSettings());
    document.getElementById('btn-reset-settings')?.addEventListener('click', () => this.handleResetSettings());

    // Pausar câmeras ao trocar de aba para liberar hardware
    window.addEventListener('tabChanged', (e) => {
      const active = e.detail.activeTab;
      if (active !== 'tab-recognition' && this.isRecognizing) {
        this.stopRecognition();
      }
      if (active !== 'tab-registration' && this.regCamera.isActive) {
        this.regCamera.stop();
        this.updateRegistrationButtonsState(false);
      }
    });

    this.ui.onUserRegistered = () => {
      this.loadUsers();
      this.checkSystemHealth();
      this.updateRegistrationButtonsState(false);
      document.getElementById('reg-name-input').value = '';
      document.getElementById('reg-consent-checkbox').checked = false;
      this.ui.switchTab('tab-users');
    };
  }

  // ==========================================================================
  // Reconhecimento Facial em Tempo Real
  // ==========================================================================
  async startRecognition() {
    if (!this.aiEngine.modelsLoaded) {
      this.ui.showToast('Os modelos neurais ainda estão sendo inicializados. Aguarde um instante.', 'error');
      return;
    }

    try {
      const select = document.getElementById('rec-camera-select');
      const deviceId = select ? select.value : null;

      document.getElementById('rec-overlay-spinner').classList.add('active');
      document.getElementById('rec-overlay-text').textContent = 'Conectando à câmera...';
      document.getElementById('rec-overlay-msg').classList.remove('hidden');

      await this.recCamera.start(deviceId);

      this.isRecognizing = true;
      this.recentDecisions = [];
      this.ui.updateSystemStatus({ camera: true });

      document.getElementById('rec-live-indicator').classList.add('active');
      document.getElementById('btn-toggle-recognition-camera').innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12"></rect></svg>
        Interromper Câmera
      `;
      document.getElementById('btn-toggle-recognition-camera').className = 'btn btn-danger btn-sm';
      document.getElementById('rec-overlay-msg').classList.add('hidden');

      this.runRecognitionLoop();
    } catch (err) {
      console.error('Falha ao abrir câmera de reconhecimento:', err);
      this.ui.showToast('Não foi possível acessar a webcam. Verifique permissões do navegador.', 'error');
      document.getElementById('rec-overlay-spinner').classList.remove('active');
      document.getElementById('rec-overlay-text').textContent = 'Erro de acesso à câmera. Conceda permissão no navegador.';
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

    document.getElementById('rec-live-indicator').classList.remove('active');
    document.getElementById('btn-toggle-recognition-camera').innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
      Iniciar Câmera
    `;
    document.getElementById('btn-toggle-recognition-camera').className = 'btn btn-primary btn-sm';

    const overlay = document.getElementById('rec-overlay-msg');
    overlay.classList.remove('hidden');
    document.getElementById('rec-overlay-spinner').classList.remove('active');
    document.getElementById('rec-overlay-text').textContent = 'Câmera inativa. Clique em "Iniciar Câmera" para começar.';

    this.resetDecisionBanner();
  }

  async runRecognitionLoop() {
    if (!this.isRecognizing) return;

    const startTime = performance.now();
    const videoEl = this.recCamera.video;
    const canvasEl = this.recCamera.canvas;

    try {
      this.recCamera.syncCanvasSize();

      // 1. Detecta todos os rostos para contagem
      const allFaces = await this.aiEngine.detectAllFaces(videoEl);
      document.getElementById('rec-faces-count').textContent = String(allFaces.length);

      if (allFaces.length === 0) {
        this.handleNoFacesDetected(canvasEl);
      } else if (allFaces.length > 1) {
        this.handleMultipleFacesDetected(canvasEl, allFaces.length);
      } else {
        // Exatamente 1 rosto: extrai landmarks e embedding 128-d
        const faceData = await this.aiEngine.extractSingleFace(videoEl);
        if (faceData && faceData.descriptor) {
          await this.processFaceRecognition(faceData, canvasEl);
        } else {
          this.handleLowQualityFace(canvasEl);
        }
      }
    } catch (err) {
      console.warn('Erro na inferência:', err);
    }

    const elapsed = performance.now() - startTime;
    const fps = Math.round(1000 / Math.max(elapsed, 1));
    document.getElementById('rec-fps').textContent = String(fps);

    // Cadência controlada: ~280ms por ciclo para inferência suave e responsiva sem sobrecarregar a CPU
    const nextDelay = Math.max(20, 280 - elapsed);
    if (this.isRecognizing) {
      this.recognitionLoopId = setTimeout(() => this.runRecognitionLoop(), nextDelay);
    }
  }

  handleNoFacesDetected(canvasEl) {
    const ctx = canvasEl.getContext('2d');
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    this.recentDecisions = [];
    document.getElementById('rec-temporal-score').textContent = '0/3';

    this.updateDecisionBanner({
      state: 'standby',
      headline: 'AGUARDANDO ROSTO',
      sub: 'Posicione-se diante da câmera para identificação biométrica.',
      reason: 'Nenhum rosto detectado no frame.'
    });
  }

  handleMultipleFacesDetected(canvasEl, count) {
    const ctx = canvasEl.getContext('2d');
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    this.recentDecisions = [];
    document.getElementById('rec-temporal-score').textContent = '0/3';

    this.updateDecisionBanner({
      state: 'denied',
      headline: 'ACESSO NEGADO',
      sub: 'Mais de um rosto detectado. Permaneça sozinho diante da câmera.',
      userName: 'Múltiplos Rostos',
      distance: null,
      reason: `${count} rostos presentes no enquadramento.`
    });
  }

  handleLowQualityFace(canvasEl) {
    const ctx = canvasEl.getContext('2d');
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    this.updateDecisionBanner({
      state: 'standby',
      headline: 'ENQUADRAMENTO INSUFICIENTE',
      sub: 'Não foi possível reconhecer o rosto com qualidade. Aproxime-se da câmera.',
      reason: 'Resolução ou iluminação do rosto abaixo do limiar aceitável.'
    });
  }

  async processFaceRecognition(faceData, canvasEl) {
    const vectorArray = Array.from(faceData.descriptor);
    const result = await api.recognizeFace(vectorArray);

    // Suavização Temporal (Anti-flickering)
    this.recentDecisions.push(result);
    if (this.recentDecisions.length > this.temporalWindowSize) {
      this.recentDecisions.shift();
    }

    // Conta correspondências recentes para o mesmo usuário
    const grantedMatches = this.recentDecisions.filter(
      d => d.access === 'GRANTED' && d.userId === result.userId
    ).length;

    document.getElementById('rec-temporal-score').textContent = `${grantedMatches}/${this.requiredMatchesForGrant}`;

    let visualState = 'standby';
    let overlayLabel = '';

    if (result.access === 'GRANTED' && grantedMatches >= this.requiredMatchesForGrant) {
      visualState = 'granted';
      overlayLabel = `ACESSO LIBERADO: ${result.userName}`;

      this.updateDecisionBanner({
        state: 'granted',
        headline: 'ACESSO LIBERADO',
        sub: 'Identidade biométrica autorizada com sucesso.',
        userName: result.userName,
        distance: result.distance,
        threshold: result.threshold,
        margin: result.margin,
        reason: result.reason
      });

      this.logRecentDecision(result);
    } else if (result.access === 'DENIED') {
      visualState = 'denied';
      overlayLabel = result.status === 'INACTIVE_USER' ? 'ACESSO NEGADO (INATIVO)' : 'ACESSO NEGADO';

      this.updateDecisionBanner({
        state: 'denied',
        headline: 'ACESSO NEGADO',
        sub: result.status === 'INACTIVE_USER'
          ? 'Cadastro inativo ou revogado no sistema.'
          : 'Rosto não reconhecido ou não autorizado.',
        userName: result.userName || 'Desconhecido',
        distance: result.distance,
        threshold: result.threshold,
        margin: result.margin,
        reason: result.reason
      });

      this.logRecentDecision(result);
    } else {
      // Estabilizando frame...
      visualState = 'standby';
      overlayLabel = 'Analisando vetor biométrico...';
    }

    this.aiEngine.drawOverlay(canvasEl, faceData, visualState, overlayLabel);
  }

  updateDecisionBanner({ state, headline, sub, userName, distance, threshold, margin, reason }) {
    const banner = document.getElementById('decision-banner');
    banner.className = `decision-banner state-${state}`;

    document.getElementById('decision-headline').textContent = headline;
    document.getElementById('decision-sub').textContent = sub;

    if (userName !== undefined) {
      document.getElementById('dec-user-name').textContent = userName || '—';
    }
    if (distance !== undefined) {
      document.getElementById('dec-distance').textContent = distance !== null ? Number(distance).toFixed(4) : '—';
    }
    if (threshold !== undefined) {
      document.getElementById('dec-threshold').textContent = Number(threshold).toFixed(3);
    }
    if (margin !== undefined) {
      document.getElementById('dec-margin').textContent = margin !== null ? Number(margin).toFixed(4) : '—';
    }
    if (reason !== undefined) {
      document.getElementById('dec-reason').textContent = reason || '—';
    }
  }

  resetDecisionBanner() {
    this.updateDecisionBanner({
      state: 'standby',
      headline: 'AGUARDANDO DETECÇÃO',
      sub: 'Posicione-se diante da câmera para identificação.',
      userName: '—',
      distance: null,
      reason: 'Aguardando vetor de entrada'
    });
    document.getElementById('rec-faces-count').textContent = '0';
    document.getElementById('rec-temporal-score').textContent = '0/3';
  }

  logRecentDecision(result) {
    const list = document.getElementById('rec-recent-log');
    if (!list) return;

    // Remove mensagem vazia se houver
    const empty = list.querySelector('.log-empty');
    if (empty) empty.remove();

    const li = document.createElement('li');
    li.className = `recent-log-item ${result.access === 'GRANTED' ? 'granted' : 'denied'}`;

    const timeStr = new Date().toLocaleTimeString('pt-BR');
    const userStr = result.userName || 'Não Identificado';
    const distStr = result.distance !== null ? `d=${Number(result.distance).toFixed(3)}` : '';

    li.innerHTML = `
      <span><strong>${result.access === 'GRANTED' ? 'LIBERADO' : 'NEGADO'}:</strong> ${this.ui.escapeHtml(userStr)}</span>
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
      this.ui.showToast('Aguarde os modelos neurais terminarem de carregar.', 'error');
      return;
    }

    try {
      document.getElementById('reg-overlay-msg').classList.add('hidden');
      await this.regCamera.start();
      this.updateRegistrationButtonsState(true);
      document.getElementById('face-guide-oval').classList.add('active');
      document.getElementById('reg-camera-badge').className = 'badge badge-active';
      document.getElementById('reg-camera-badge').textContent = 'Câmera Ativa';
    } catch (err) {
      console.error('Falha ao abrir câmera de cadastro:', err);
      this.ui.showToast('Erro ao acessar webcam para cadastro.', 'error');
    }
  }

  updateRegistrationButtonsState(cameraActive) {
    document.getElementById('btn-capture-samples').disabled = !cameraActive;
    document.getElementById('btn-cancel-registration').disabled = !cameraActive;
    document.getElementById('btn-start-registration-camera').disabled = cameraActive;
    if (!cameraActive) {
      document.getElementById('face-guide-oval').classList.remove('active');
      document.getElementById('reg-camera-badge').className = 'badge badge-warning';
      document.getElementById('reg-camera-badge').textContent = 'Aguardando Câmera';
      document.getElementById('reg-overlay-msg').classList.remove('hidden');
    }
  }

  async handleStartRegistrationCapture() {
    const nameInput = document.getElementById('reg-name-input');
    const consentCheck = document.getElementById('reg-consent-checkbox');

    const name = nameInput.value.trim();
    if (!name || name.length < 2) {
      this.ui.showToast('Informe o nome completo do usuário para cadastro.', 'error');
      nameInput.focus();
      return;
    }

    if (!consentCheck.checked) {
      this.ui.showToast('É obrigatório assinalar o consentimento para prosseguir.', 'error');
      return;
    }

    // Se o admin não estiver autenticado, exige PIN para cadastrar
    if (!this.adminAuthenticated) {
      const pin = await this.ui.requestAdminPin(
        'Autorização Administrativa',
        'Digite o PIN administrativo para autorizar o cadastro:'
      ).catch(() => null);

      if (!pin) return;

      try {
        await api.loginAdmin(pin);
        this.adminAuthenticated = true;
        this.updateAdminButtonUI({ configured: true, authenticated: true });
      } catch (err) {
        this.ui.showToast(err.message, 'error');
        return;
      }
    }

    document.getElementById('btn-capture-samples').disabled = true;
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
        activeUsers: users.filter(u => u.is_active).length
      });
    } catch (err) {
      console.warn('Erro ao carregar usuários:', err);
    }
  }

  async handleToggleUserStatus(user) {
    await this.ensureAdminAuth();
    try {
      const newStatus = !user.is_active;
      await api.updateUser(user.id, { is_active: newStatus });
      this.ui.showToast(`Usuário "${user.name}" ${newStatus ? 'ativado' : 'desativado'} com sucesso!`, 'success');
      await this.loadUsers();
    } catch (err) {
      this.ui.showToast(err.message, 'error');
    }
  }

  async handleEditUser(user) {
    await this.ensureAdminAuth();
    this.ui.showEditUserModal(user.id, user.name, async (newName) => {
      try {
        await api.updateUser(user.id, { name: newName });
        this.ui.showToast('Nome atualizado com sucesso!', 'success');
        await this.loadUsers();
      } catch (err) {
        this.ui.showToast(err.message, 'error');
      }
    });
  }

  async handleDeleteUser(user) {
    await this.ensureAdminAuth();
    const confirmed = confirm(
      `ATENÇÃO: Deseja realmente excluir permanentemente o usuário "${user.name}"?\nTodos os seus embeddings faciais serão apagados do banco.`
    );
    if (!confirmed) return;

    try {
      await api.deleteUser(user.id);
      this.ui.showToast(`Usuário "${user.name}" e seus embeddings foram excluídos.`, 'success');
      await this.loadUsers();
      await this.checkSystemHealth();
    } catch (err) {
      this.ui.showToast(err.message, 'error');
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
      console.warn('Erro ao carregar histórico:', err);
    }
  }

  async handleClearHistory() {
    await this.ensureAdminAuth();
    if (!confirm('Deseja limpar todo o histórico de tentativas de acesso?')) return;
    try {
      await api.clearEvents();
      this.ui.showToast('Histórico limpo com sucesso!', 'success');
      await this.loadHistory();
    } catch (err) {
      this.ui.showToast(err.message, 'error');
    }
  }

  async handleSaveSettings() {
    await this.ensureAdminAuth();
    const threshold = parseFloat(document.getElementById('input-threshold').value);
    const margin = parseFloat(document.getElementById('input-margin').value);

    try {
      const updated = await api.updateSettings({
        recognition_threshold: threshold,
        ambiguity_margin: margin
      });
      this.activeSettings = updated;
      document.getElementById('dash-threshold').textContent = Number(updated.recognition_threshold).toFixed(2);
      document.getElementById('dec-threshold').textContent = Number(updated.recognition_threshold).toFixed(3);
      this.ui.showToast('Configurações biométricas atualizadas com sucesso!', 'success');
    } catch (err) {
      this.ui.showToast(err.message, 'error');
    }
  }

  async handleResetSettings() {
    document.getElementById('input-threshold').value = '0.55';
    document.getElementById('display-threshold').textContent = '0.550';
    document.getElementById('input-margin').value = '0.05';
    document.getElementById('display-margin').textContent = '0.050';
    await this.handleSaveSettings();
  }

  // ==========================================================================
  // Autenticação Administrativa
  // ==========================================================================
  async handleAdminAuthClick() {
    const authStatus = await api.getAuthStatus();

    if (!authStatus.configured) {
      // Criação inicial do PIN
      try {
        const pin = await this.ui.requestAdminPin(
          'Configurar PIN Administrativo',
          'Crie um PIN administrativo de no mínimo 4 dígitos:'
        );
        await api.setupAdminPin(pin);
        this.adminAuthenticated = true;
        this.ui.showToast('PIN administrativo configurado e autenticado!', 'success');
        this.updateAdminButtonUI({ configured: true, authenticated: true });
      } catch (err) {
        if (err.message) this.ui.showToast(err.message, 'error');
      }
    } else if (authStatus.authenticated) {
      // Logout
      await api.logoutAdmin();
      this.adminAuthenticated = false;
      this.ui.showToast('Sessão administrativa encerrada.', 'info');
      this.updateAdminButtonUI({ configured: true, authenticated: false });
    } else {
      // Login
      try {
        const pin = await this.ui.requestAdminPin(
          'Login Administrativo',
          'Digite seu PIN administrativo:'
        );
        await api.loginAdmin(pin);
        this.adminAuthenticated = true;
        this.ui.showToast('Autenticado como Administrador!', 'success');
        this.updateAdminButtonUI({ configured: true, authenticated: true });
      } catch (err) {
        if (err.message) this.ui.showToast(err.message, 'error');
      }
    }
  }

  async ensureAdminAuth() {
    if (this.adminAuthenticated) return true;

    const authStatus = await api.getAuthStatus();
    if (!authStatus.configured) {
      const pin = await this.ui.requestAdminPin(
        'Criar PIN Administrativo',
        'Crie um PIN administrativo para prosseguir:'
      );
      await api.setupAdminPin(pin);
      this.adminAuthenticated = true;
      this.updateAdminButtonUI({ configured: true, authenticated: true });
      return true;
    }

    const pin = await this.ui.requestAdminPin(
      'Autenticação Necessária',
      'Operação administrativa protegida. Digite seu PIN:'
    );
    await api.loginAdmin(pin);
    this.adminAuthenticated = true;
    this.updateAdminButtonUI({ configured: true, authenticated: true });
    return true;
  }
}

// Inicializa a aplicação quando a página estiver carregada
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init().catch(err => {
    console.error('Erro na inicialização da aplicação:', err);
  });
});

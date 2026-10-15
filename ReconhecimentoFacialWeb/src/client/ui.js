/**
 * Gerenciador de Interface de Usuário (UI / DOM)
 * Controle de abas, modais, toasts, renderização de tabelas e atualização de dashboards.
 */

export class UIManager {
  constructor() {
    this.activeTab = 'tab-dashboard';
    this.toastContainer = document.getElementById('toast-container');
    this.initTabNavigation();
  }

  initTabNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.getAttribute('data-tab');
        this.switchTab(targetTab);
      });
    });
  }

  switchTab(tabId) {
    this.activeTab = tabId;

    document.querySelectorAll('.nav-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === tabId);
    });

    document.querySelectorAll('.tab-pane').forEach(p => {
      p.classList.toggle('active', p.id === tabId);
    });

    // Dispara evento customizado para pausar/retomar streams de câmera ao mudar de aba
    window.dispatchEvent(new CustomEvent('tabChanged', { detail: { activeTab: tabId } }));
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ';
    if (type === 'success') icon = '✓';
    if (type === 'error') icon = '✕';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  updateSystemStatus({ server, models, camera, users }) {
    if (server !== undefined) {
      const pill = document.getElementById('pill-server');
      const val = document.getElementById('val-server');
      pill.className = `status-pill ${server ? 'online' : 'offline'}`;
      val.textContent = server ? 'Online' : 'Offline';
    }

    if (models !== undefined) {
      const pill = document.getElementById('pill-models');
      const val = document.getElementById('val-models');
      pill.className = `status-pill ${models === 'ready' ? 'online' : models === 'loading' ? 'warning' : 'offline'}`;
      val.textContent = models === 'ready' ? 'Prontos' : models === 'loading' ? 'Carregando' : 'Erro';
    }

    if (camera !== undefined) {
      const pill = document.getElementById('pill-camera');
      const val = document.getElementById('val-camera');
      pill.className = `status-pill ${camera ? 'online' : ''}`;
      val.textContent = camera ? 'Ativa' : 'Em espera';
    }

    if (users !== undefined) {
      document.getElementById('val-users').textContent = String(users);
      const dashUsers = document.getElementById('dash-total-users');
      if (dashUsers) dashUsers.textContent = String(users);
    }
  }

  updateDashboardStats(stats) {
    if (!stats) return;
    if (stats.totalUsers !== undefined) {
      document.getElementById('dash-total-users').textContent = String(stats.totalUsers);
    }
    if (stats.activeUsers !== undefined) {
      document.getElementById('dash-active-users').textContent = `${stats.activeUsers} autorizados`;
    }
    if (stats.totalEmbeddings !== undefined) {
      document.getElementById('dash-total-embeddings').textContent = String(stats.totalEmbeddings);
    }
    if (stats.threshold !== undefined) {
      document.getElementById('dash-threshold').textContent = Number(stats.threshold).toFixed(2);
    }
  }

  /**
   * Apresenta o modal para inserção do PIN administrativo.
   * Retorna uma Promise que resolve com o PIN ou rejeita se cancelado.
   */
  requestAdminPin(title = 'Autenticação Administrativa', desc = 'Digite o PIN para continuar:') {
    return new Promise((resolve, reject) => {
      const modal = document.getElementById('modal-admin-pin');
      const titleEl = document.getElementById('modal-pin-title');
      const descEl = document.getElementById('modal-pin-desc');
      const inputEl = document.getElementById('input-admin-pin');
      const errorEl = document.getElementById('modal-pin-error');
      const btnSubmit = document.getElementById('btn-submit-pin');
      const btnCancel = document.getElementById('btn-cancel-pin');
      const btnClose = document.getElementById('btn-close-pin-modal');

      titleEl.textContent = title;
      descEl.textContent = desc;
      inputEl.value = '';
      errorEl.style.display = 'none';
      modal.style.display = 'flex';
      inputEl.focus();

      const cleanup = () => {
        modal.style.display = 'none';
        btnSubmit.onclick = null;
        btnCancel.onclick = null;
        btnClose.onclick = null;
        inputEl.onkeydown = null;
      };

      btnSubmit.onclick = () => {
        const val = inputEl.value.trim();
        if (val.length < 4) {
          errorEl.textContent = 'O PIN deve ter no mínimo 4 dígitos.';
          errorEl.style.display = 'block';
          return;
        }
        cleanup();
        resolve(val);
      };

      const handleCancel = () => {
        cleanup();
        reject(new Error('Operação cancelada pelo usuário.'));
      };

      btnCancel.onclick = handleCancel;
      btnClose.onclick = handleCancel;

      inputEl.onkeydown = (e) => {
        if (e.key === 'Enter') btnSubmit.click();
        if (e.key === 'Escape') handleCancel();
      };
    });
  }

  showDuplicateModal(message, onForce, onAbort) {
    const modal = document.getElementById('modal-duplicate-alert');
    const msgEl = document.getElementById('duplicate-modal-msg');
    const btnForce = document.getElementById('btn-force-duplicate');
    const btnAbort = document.getElementById('btn-abort-duplicate');
    const btnClose = document.getElementById('btn-close-duplicate-modal');

    msgEl.textContent = message;
    modal.style.display = 'flex';

    const cleanup = () => {
      modal.style.display = 'none';
      btnForce.onclick = null;
      btnAbort.onclick = null;
      btnClose.onclick = null;
    };

    btnForce.onclick = () => { cleanup(); onForce(); };
    btnAbort.onclick = () => { cleanup(); onAbort(); };
    btnClose.onclick = () => { cleanup(); onAbort(); };
  }

  showEditUserModal(userId, currentName, onSave) {
    const modal = document.getElementById('modal-edit-user');
    const inputId = document.getElementById('edit-user-id');
    const inputName = document.getElementById('edit-user-name');
    const btnSave = document.getElementById('btn-save-edit');
    const btnCancel = document.getElementById('btn-cancel-edit');
    const btnClose = document.getElementById('btn-close-edit-modal');

    inputId.value = userId;
    inputName.value = currentName;
    modal.style.display = 'flex';
    inputName.focus();

    const cleanup = () => {
      modal.style.display = 'none';
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
    const tbody = document.getElementById('users-table-body');
    if (!users || users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center">Nenhum usuário cadastrado no sistema. Cadastre seu rosto na aba "Cadastro Facial".</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(user => {
      const dateFormatted = new Date(user.created_at).toLocaleString('pt-BR');
      const statusBadge = user.is_active
        ? `<span class="badge badge-active">Autorizado</span>`
        : `<span class="badge badge-inactive">Bloqueado</span>`;

      return `
        <tr data-user-id="${user.id}">
          <td><strong>#${user.id}</strong></td>
          <td><strong>${this.escapeHtml(user.name)}</strong></td>
          <td>${statusBadge}</td>
          <td><span class="badge badge-info">${user.sample_count} amostras</span></td>
          <td>${dateFormatted}</td>
          <td>
            <div class="table-actions">
              <button class="btn btn-secondary btn-sm btn-action-toggle" title="Alterar status de autorização">
                ${user.is_active ? 'Desativar' : 'Ativar'}
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
    }).join('');

    // Vincula eventos nos botões de cada linha
    tbody.querySelectorAll('tr').forEach(row => {
      const userId = parseInt(row.getAttribute('data-user-id'), 10);
      const user = users.find(u => u.id === userId);

      row.querySelector('.btn-action-toggle')?.addEventListener('click', () => onToggleStatus(user));
      row.querySelector('.btn-action-edit')?.addEventListener('click', () => onEdit(user));
      row.querySelector('.btn-action-delete')?.addEventListener('click', () => onDelete(user));
    });
  }

  renderHistoryTable(events) {
    const tbody = document.getElementById('history-table-body');
    if (!events || events.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center">Nenhuma tentativa de acesso registrada até o momento.</td></tr>`;
      return;
    }

    tbody.innerHTML = events.map(ev => {
      const dateFormatted = new Date(ev.timestamp).toLocaleString('pt-BR');
      const badge = ev.result === 'GRANTED'
        ? `<span class="badge badge-granted">ACESSO LIBERADO</span>`
        : `<span class="badge badge-denied">ACESSO NEGADO</span>`;

      const distFormatted = ev.distance !== null && ev.distance !== undefined
        ? `<code>${Number(ev.distance).toFixed(4)}</code>`
        : '—';

      return `
        <tr>
          <td>${dateFormatted}</td>
          <td>${badge}</td>
          <td><strong>${ev.user_name ? this.escapeHtml(ev.user_name) : 'Não Identificado'}</strong></td>
          <td>${distFormatted}</td>
          <td>${this.escapeHtml(ev.reason)}</td>
        </tr>
      `;
    }).join('');
  }

  updateRegistrationProgress(current, total) {
    const fill = document.getElementById('reg-progress-fill');
    const label = document.getElementById('reg-sample-count-txt');
    const percent = document.getElementById('reg-progress-percent');

    const pct = Math.round((current / total) * 100);
    fill.style.width = `${pct}%`;
    label.textContent = `Amostras: ${current} de ${total}`;
    percent.textContent = `${pct}%`;
  }

  setRegistrationStep(title, desc) {
    document.getElementById('reg-step-title').textContent = title;
    document.getElementById('reg-step-desc').textContent = desc;
  }

  updateQualityChecks({ faceCount, centered, landmarks }) {
    const qFace = document.getElementById('q-check-face');
    const qPos = document.getElementById('q-check-position');
    const qLand = document.getElementById('q-check-landmarks');
    const oval = document.getElementById('face-guide-oval');

    qFace.classList.toggle('passed', faceCount === 1);
    qPos.classList.toggle('passed', centered);
    qLand.classList.toggle('passed', landmarks);

    if (oval) {
      oval.classList.toggle('ready', faceCount === 1 && centered && landmarks);
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

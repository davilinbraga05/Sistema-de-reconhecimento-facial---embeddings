/**
 * Cliente de Comunicação com a API REST do Backend
 */

export const api = {
  async getHealth() {
    const res = await fetch('/api/health');
    return res.json();
  },

  async getAuthStatus() {
    const res = await fetch('/api/auth/status');
    return res.json();
  },

  async setupAdminPin(pin) {
    const res = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao configurar PIN.');
    return data;
  },

  async loginAdmin(pin) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha na autenticação.');
    return data;
  },

  async logoutAdmin() {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    return res.json();
  },

  async getUsers() {
    const res = await fetch('/api/users');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao obter usuários.');
    return data.users;
  },

  async createUser({ name, consent, samples, force = false }) {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, consent, samples, force })
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error || 'Falha ao cadastrar usuário.');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },

  async updateUser(id, updates) {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao atualizar usuário.');
    return data;
  },

  async deleteUser(id) {
    const res = await fetch(`/api/users/${id}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao excluir usuário.');
    return data;
  },

  async recognizeFace(descriptor) {
    const res = await fetch('/api/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descriptor })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.reason || 'Erro na inferência do servidor.');
    return data;
  },

  async getEvents(limit = 50) {
    const res = await fetch(`/api/events?limit=${limit}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao obter histórico.');
    return data.events;
  },

  async clearEvents() {
    const res = await fetch('/api/events', { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao limpar histórico.');
    return data;
  },

  async getSettings() {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao obter configurações.');
    return data.settings;
  },

  async updateSettings(settings) {
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao atualizar configurações.');
    return data.settings;
  }
};

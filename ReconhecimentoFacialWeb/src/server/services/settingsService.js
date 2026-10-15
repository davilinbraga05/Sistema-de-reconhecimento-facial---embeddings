/**
 * Serviço de Configurações do Sistema
 * Gerencia threshold de reconhecimento, margem de ambiguidade e parâmetros biométricos.
 */

export function getSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};

  for (const row of rows) {
    if (row.key === 'recognition_threshold' || row.key === 'ambiguity_margin') {
      settings[row.key] = parseFloat(row.value);
    } else if (row.key === 'min_samples' || row.key === 'max_samples') {
      settings[row.key] = parseInt(row.value, 10);
    } else if (row.key.startsWith('admin_pin_')) {
      // Omite dados sensíveis de credenciais do payload geral
      continue;
    } else {
      settings[row.key] = row.value;
    }
  }

  return {
    recognition_threshold: settings.recognition_threshold ?? 0.55,
    ambiguity_margin: settings.ambiguity_margin ?? 0.05,
    min_samples: settings.min_samples ?? 5,
    max_samples: settings.max_samples ?? 8,
    ...settings
  };
}

export function updateSettings(db, updates) {
  const upsertStmt = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const allowedKeys = ['recognition_threshold', 'ambiguity_margin', 'min_samples', 'max_samples'];

  const transaction = db.transaction(() => {
    for (const key of allowedKeys) {
      if (updates[key] !== undefined) {
        let val = updates[key];
        if (key === 'recognition_threshold') {
          val = Number(parseFloat(val).toFixed(3));
          if (val < 0.1 || val > 1.5) throw new Error('O threshold deve estar entre 0.10 e 1.50.');
        } else if (key === 'ambiguity_margin') {
          val = Number(parseFloat(val).toFixed(3));
          if (val < 0.0 || val > 0.5) throw new Error('A margem de ambiguidade deve estar entre 0.00 e 0.50.');
        }
        upsertStmt.run(key, String(val));
      }
    }
  });

  transaction();
  return getSettings(db);
}

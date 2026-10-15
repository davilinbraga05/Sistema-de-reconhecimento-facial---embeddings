/**
 * Script de preparação e validação dos modelos de IA para Reconhecimento Facial
 * Copia os modelos oficiais do pacote @vladmandic/face-api para public/models/
 * e valida a integridade de todos os manifests e binários.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const TARGET_DIR = path.join(projectRoot, 'public', 'models');
const SOURCE_DIR = path.join(projectRoot, 'node_modules', '@vladmandic', 'face-api', 'model');

// Lista de arquivos obrigatórios para detecção, landmarks e extração de descritores (128-d)
const REQUIRED_FILES = [
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model.bin',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model.bin',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model.bin',
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model.bin'
];

const OFFICIAL_BASE_URL = 'https://raw.githubusercontent.com/vladmandic/face-api/master/model/';

async function downloadFile(url, destPath) {
  console.log(`Baixando da fonte oficial: ${url}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao baixar ${url}: status HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
}

async function setupModels() {
  console.log('=====================================================');
  console.log('PREPARAÇÃO E VERIFICAÇÃO DOS MODELOS DE IA LOCAIS');
  console.log('=====================================================');
  console.log(`Destino local: ${TARGET_DIR}`);

  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
  }

  let copiedCount = 0;
  let downloadedCount = 0;
  let existingCount = 0;

  for (const file of REQUIRED_FILES) {
    const targetPath = path.join(TARGET_DIR, file);
    const sourcePath = path.join(SOURCE_DIR, file);

    // Se o arquivo já existe e tem tamanho maior que 0, não precisa recriar sem necessidade
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) {
      existingCount++;
      continue;
    }

    if (fs.existsSync(sourcePath) && fs.statSync(sourcePath).size > 0) {
      console.log(`Copiando do pacote local: ${file}`);
      fs.copyFileSync(sourcePath, targetPath);
      copiedCount++;
    } else {
      console.log(`Arquivo não encontrado no pacote local: ${file}. Tentando baixar da fonte oficial...`);
      try {
        await downloadFile(`${OFFICIAL_BASE_URL}${file}`, targetPath);
        downloadedCount++;
      } catch (err) {
        console.error(`ERRO ao obter ${file}: ${err.message}`);
      }
    }
  }

  console.log(`\nVerificando integridade dos arquivos em ${TARGET_DIR}:`);
  let allValid = true;

  for (const file of REQUIRED_FILES) {
    const filePath = path.join(TARGET_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.error(`  [FALHA] Arquivo ausente: ${file}`);
      allValid = false;
      continue;
    }

    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      console.error(`  [FALHA] Arquivo vazio (0 bytes): ${file}`);
      allValid = false;
      continue;
    }

    if (file.endsWith('.json')) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const manifest = JSON.parse(content);
        if (!Array.isArray(manifest)) {
          throw new Error('Manifesto não é um array válido');
        }
        console.log(`  [OK] Manifesto JSON válido: ${file} (${stats.size} bytes)`);
      } catch (err) {
        console.error(`  [FALHA] JSON corrompido em ${file}: ${err.message}`);
        allValid = false;
      }
    } else {
      console.log(`  [OK] Peso binário presente: ${file} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    }
  }

  console.log('-----------------------------------------------------');
  if (allValid) {
    console.log(`SUCESSO: Todos os ${REQUIRED_FILES.length} arquivos de modelos estão presentes e íntegros!`);
    console.log(`  - Já existentes: ${existingCount}`);
    console.log(`  - Copiados: ${copiedCount}`);
    console.log(`  - Baixados: ${downloadedCount}`);
  } else {
    console.error('ATENÇÃO: Um ou mais arquivos de modelos estão incompletos ou ausentes.');
    process.exit(1);
  }
  console.log('=====================================================\n');
}

setupModels().catch(err => {
  console.error('Erro fatal na preparação dos modelos:', err);
  process.exit(1);
});

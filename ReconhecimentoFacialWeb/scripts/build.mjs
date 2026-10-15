/**
 * Script de build para a aplicação cliente usando esbuild
 * Empacota o código cliente em public/dist/ e disponibiliza a biblioteca face-api
 */

import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const publicDist = path.join(projectRoot, 'public', 'dist');
const faceApiDistSource = path.join(projectRoot, 'node_modules', '@vladmandic', 'face-api', 'dist', 'face-api.js');
const faceApiDistDest = path.join(publicDist, 'face-api.js');

async function build() {
  console.log('=====================================================');
  console.log('BUILD DOS SCRIPTS CLIENTE');
  console.log('=====================================================');

  if (!fs.existsSync(publicDist)) {
    fs.mkdirSync(publicDist, { recursive: true });
  }

  // Copia face-api.js UMD para public/dist/face-api.js
  if (fs.existsSync(faceApiDistSource)) {
    console.log('Copiando face-api.js para public/dist/face-api.js...');
    fs.copyFileSync(faceApiDistSource, faceApiDistDest);
  } else {
    throw new Error('Arquivo face-api.js não encontrado no node_modules');
  }

  // Build do código cliente com esbuild
  console.log('Compilando src/client/main.js para public/dist/app.js...');
  await esbuild.build({
    entryPoints: [path.join(projectRoot, 'src', 'client', 'main.js')],
    bundle: true,
    minify: false, // Deixamos legível e fácil de inspecionar no ambiente acadêmico
    sourcemap: true,
    target: ['chrome100', 'edge100'],
    outfile: path.join(publicDist, 'app.js'),
    format: 'iife'
  });

  const appStats = fs.statSync(path.join(publicDist, 'app.js'));
  const faceApiStats = fs.statSync(faceApiDistDest);

  console.log('Build concluído com sucesso:');
  console.log(`  - public/dist/face-api.js (${(faceApiStats.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`  - public/dist/app.js (${(appStats.size / 1024).toFixed(2)} KB)`);
  console.log('=====================================================\n');
}

build().catch(err => {
  console.error('Erro no processo de build:', err);
  process.exit(1);
});

# BioAccess AI — Sistema Web de Reconhecimento Facial com Embeddings

> **Projeto Acadêmico Demonstrativo de Visão Computacional, Biometria e Inteligência Artificial**  
> Desenvolvido inteiramente em **Node.js** e **JavaScript** (sem nenhuma dependência de Python).

---

## 1. Visão Geral e Arquitetura

O **BioAccess AI** é uma solução completa de controle de acesso biométrico que opera diretamente no navegador web, integrando captura por webcam, detecção facial neural, extração de descritores de características (**embeddings** de 128 dimensões) e comparação vetorial euclidiana com persistência relacional no **SQLite**.

### Componentes do Sistema:
- **Backend**: Node.js LTS, Express.js (escutando exclusivamente em `127.0.0.1:3000`), SQLite nativo via `better-sqlite3`, e biblioteca criptográfica `node:crypto` (`scrypt` para hashing de credenciais).
- **Frontend**: HTML5 semântico, Vanilla CSS3 com design moderno em tema escuro (glassmorphism e microinterações dinâmicas), e JavaScript moderno (ES Modules).
- **Visão Computacional & IA**: `@vladmandic/face-api` (baseado em TensorFlow.js), operando com pesos e modelos hospedados **100% localmente** no servidor (sem requisições externas em tempo de execução).
- **Build Tool**: `esbuild` para empacotamento rápido e geração dos scripts clientes.

---

## 2. Fundamentação Teórica: Embeddings e Distância Euclidiana

### 2.1 O que é um Embedding Facial?
Em visão computacional moderna, o reconhecimento facial não é realizado pela comparação de pixels brutos da imagem, pois variações de iluminação, pose e escala alteram os valores dos pixels de forma imprevisível.

Em vez disso, a rede neural convolucional profunda `FaceRecognitionNet` (baseada em arquitetura ResNet) mapeia a face alinhada para um **espaço vetorial contínuo de 128 dimensões**:

$$\mathbf{v} = [v_0, v_1, v_2, \dots, v_{127}] \in \mathbb{R}^{128}$$

Nesse hiperplano métrico:
- Rostos pertencentes à **mesma pessoa** são projetados para coordenadas muito próximas.
- Rostos de **pessoas diferentes** são projetados para posições distantes.

### 2.2 Distância Euclidiana
A similaridade entre o vetor capturado em tempo real ($\mathbf{A}$) e uma amostra de referência cadastrada no banco ($\mathbf{B}$) é calculada pela **Distância Euclidiana**:

$$d(\mathbf{A}, \mathbf{B}) = \sqrt{\sum_{i=0}^{127} (A[i] - B[i])^2}$$

* **Quanto menor a distância $d(\mathbf{A}, \mathbf{B})$, mais semelhantes são as faces.**
* Distância $0$ indica vetores idênticos.

### 2.3 Estratégia Multi-Amostras
Para evitar que uma única foto anômala ou piscada de olhos comprometa a precisão, o sistema coleta **8 amostras** biométricas durante o cadastro de cada pessoa.

Ao receber um frame de verificação, o sistema calcula a distância contra todas as amostras do usuário e utiliza a **média das 3 melhores correspondências**:

$$\text{Distância Agregada}(U) = \frac{1}{3} \sum_{k=1}^3 d_{(k)}$$

### 2.4 Regras de Tomada de Decisão:
1. **Threshold de Reconhecimento ($T$):**  
   O valor de referência padrão é **$0.550$**.  
   - Se a menor distância agregada $d_1 > T$, a decisão é **ACESSO NEGADO** (*Rosto não reconhecido ou não autorizado*).
2. **Margem de Ambiguidade ($M$):**  
   Quando há dois ou mais usuários no sistema, a diferença entre o melhor candidato ($d_1$) e o segundo colocado ($d_2$) deve ser maior ou igual a $M$ (padrão $0.050$):  
   - Se $(d_2 - d_1) < M$, a decisão é **ACESSO NEGADO** (*Identidade ambígua por segurança*).
3. **Status de Autorização:**  
   Se o usuário for reconhecido, mas seu cadastro estiver inativo no banco, a decisão é **ACESSO NEGADO** (*Cadastro inativo ou revogado*).
4. **ACESSO LIBERADO:**  
   Ocorre apenas quando $d_1 \le T$, a margem de separação é respeitada e o cadastro está ativo.
5. **Estabilização Temporal:**  
   Para evitar que a interface pisque (flickering), o sistema exige confirmação consistente em múltiplos frames consecutivos antes de acionar a liberação visual.

---

## 3. Pré-requisitos de Instalação

- **Sistema Operacional:** Windows 10, Windows 11 ou Linux.
- **Node.js:** Versão LTS (v18, v20 ou v24 recomendada).
- **Navegador Web:** Google Chrome ou Microsoft Edge (com suporte a WebRTC e WebGL).

> **Observação sobre o PowerShell no Windows:**  
> Se o PowerShell apresentar erro informando que *a execução de scripts foi desabilitada no sistema*, utilize o comando `npm.cmd` em vez de `npm`, ou execute uma vez no terminal como administrador:  
> `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

---

## 4. Guia de Instalação e Execução

Abra o terminal PowerShell na pasta do projeto:
```powershell
cd C:\Users\25011881\Desktop\Midiapipe\ReconhecimentoFacialWeb
```

### Passo 1: Instalar Dependências
```powershell
npm.cmd install
```

### Passo 2: Preparar e Validar os Modelos Neurais Locais
Este comando copia os modelos do pacote para a pasta `public/models/` e valida a integridade de todos os manifests e binários:
```powershell
npm.cmd run setup
```

### Passo 3: Compilar os Scripts do Navegador
Empacota o código cliente com o `esbuild`:
```powershell
npm.cmd run build
```

### Passo 4: Executar a Suíte de Testes Automatizados
Executa todos os 29 testes unitários e de integração (validação vetorial, threshold, ambiguidade, cascata de banco de dados e persistência):
```powershell
npm.cmd test
```

### Passo 5: Iniciar o Servidor
```powershell
npm.cmd start
```

O servidor inicializará em:
👉 **[http://127.0.0.1:3000](http://127.0.0.1:3000)**

---

## 5. Instruções Passo a Passo para o Primeiro Uso

### 1. Configurar o PIN Administrativo
1. Acesse `http://127.0.0.1:3000` no Google Chrome ou Edge.
2. No canto superior direito, clique em **Criar PIN Admin**.
3. Defina um PIN de 4 ou mais dígitos (ex: `1234`). Este PIN é protegido por derivação de chave com `scrypt` e protege operações de cadastro, alteração e exclusão.

### 2. Cadastrar seu Rosto
1. Clique na aba **Cadastro Facial**.
2. Digite seu nome completo no campo indicado.
3. Marque a caixa de seleção do **Termo de Consentimento Biométrico**.
4. Clique em **Ativar Câmera** e autorize o acesso à webcam no navegador.
5. Posicione seu rosto dentro da moldura oval (o indicador ficará verde quando o enquadramento estiver correto).
6. Clique em **Capturar 8 Amostras**.
7. Mantenha o olhar para a câmera com pequenos movimentos sutis enquanto a barra de progresso avança de 1 a 8.
8. Ao concluir, os vetores serão validados e persistidos no banco de dados SQLite.

### 3. Testar o Reconhecimento ao Vivo
1. Clique na aba **Reconhecimento Ao Vivo**.
2. Clique em **Iniciar Câmera**.
3. Posicione seu rosto em frente à lente:
   - O sistema detectará o rosto e extrairá o embedding.
   - O backend comparará com o banco de dados.
   - Assim que atingir a estabilização de frames, o grande banner exibirá **ACESSO LIBERADO** em verde com seu nome e a distância calculada.
4. Peça para outra pessoa se posicionar diante da câmera (ou cubra o rosto):
   - O sistema exibirá **ACESSO NEGADO** em vermelho com a mensagem de rosto não reconhecido.

### 4. Gerenciamento de Usuários
- Na aba **Usuários Cadastrados**, você pode alternar o status de um usuário entre **Autorizado** e **Bloqueado**. Se um usuário for desativado, o sistema passará a negar seu acesso mesmo reconhecendo o rosto.
- É possível renomear ou excluir o cadastro permanentemente (removendo todos os seus vetores de embeddings por integridade referencial em cascata).

### 5. Calibração do Threshold
- Na aba **Configurações & Threshold**, utilize os seletores para calibrar a sensibilidade:
  - **Threshold menor (ex: 0.450):** Maior segurança, exige rostos quase idênticos às amostras (menor risco de falsos positivos).
  - **Threshold padrão (0.550):** Equilíbrio recomendado para iluminação comum de escritório.
  - **Threshold maior (ex: 0.650):** Mais tolerante a sombras ou câmeras de baixa resolução.

---

## 6. Estrutura de Diretórios do Projeto

```
ReconhecimentoFacialWeb/
├── package.json              # Dependências e scripts npm
├── server.js                 # Servidor Express e ponto de entrada da API REST
├── README.md                 # Documentação técnica e guia acadêmico
├── .gitignore                # Regras de exclusão de binários e banco SQLite
├── public/
│   ├── index.html            # Estrutura semântica da aplicação web
│   ├── styles.css            # Folha de estilo moderna dark theme
│   ├── dist/                 # Bundles compilados (face-api.js e app.js)
│   └── models/               # Pesos neurais oficiais locais do face-api
├── src/
│   ├── client/               # Código executado no navegador
│   │   ├── main.js           # Orquestração geral e loop de reconhecimento
│   │   ├── camera.js         # Gerenciamento de stream de webcam
│   │   ├── face-recognition.js # Interface neural e desenho no canvas
│   │   ├── registration.js   # Wizard de captura de 8 amostras
│   │   ├── api.js            # Cliente REST para comunicação com o backend
│   │   └── ui.js             # Manipulação de DOM, modais e feedback
│   └── server/               # Código do backend Node.js
│       ├── database/
│       │   └── db.js         # Conexão e esquemas do SQLite (better-sqlite3)
│       ├── security/
│       │   └── auth.js       # Hashing scrypt e controle de sessões HttpOnly
│       ├── validators/
│       │   └── embeddingValidator.js # Validação estrita de vetores 128-d
│       ├── services/
│       │   ├── recognitionService.js # Cálculo de distância Euclidiana e matching
│       │   ├── userService.js        # CRUD transacional de usuários
│       │   ├── settingsService.js   # Gestão de limiares biométricos
│       │   └── eventService.js      # Auditoria de acessos com rate-limiting
│       └── routes/           # Rotas REST modularizadas da API
├── scripts/
│   ├── setup-models.mjs      # Preparação e verificação dos modelos locais
│   └── build.mjs             # Compilação cliente com esbuild
├── tests/
│   ├── recognition.test.js   # Testes matemáticos de distância e threshold
│   ├── database.test.js      # Testes de persistência e integridade referencial
│   ├── persistence.test.js   # Teste de integridade pós-restart do servidor
│   └── api.test.js           # Testes de integração das rotas HTTP
└── data/
    └── database.sqlite       # Banco de dados local SQLite
```

---

## 7. Privacidade e Limitações Biométricas

1. **Privacidade e LGPD:**  
   Nenhuma imagem capturada pela câmera ou fotografia pessoal é salva permanentemente no disco. O sistema persiste apenas descritores matemáticos anônimos (vetores de 128 números de ponto flutuante).
2. **Exclusão Efetiva de Dados:**  
   Ao excluir um usuário na interface, todos os seus registros de embeddings são apagados do banco de dados em cascata (`ON DELETE CASCADE`).
3. **Vulnerabilidade a Ataques de Apresentação (Spoofing):**  
   Este sistema utiliza webcam comum 2D e não possui sensores de profundidade (ToF/IR) ou algoritmos ativos de vivacidade (liveness). Dessa forma, fotografias estáticas ou vídeos exibidos em smartphones podem enganar o modelo.
4. **Finalidade Acadêmica:**  
   O sistema foi concebido exclusivamente para fins educacionais e acadêmicos. **Não deve ser empregado para controle de fechaduras físicas, cofres ou instalações de alta segurança**.

---

## 8. Relatório dos Testes Automatizados Executados

Executados com o runner nativo do Node.js (`node --test tests/*.test.js`):
- **Total de Suítes:** 6
- **Total de Testes:** 29
- **Aprovados:** 29 (100%)
- **Falhas:** 0
- **Duração média:** ~300 ms

---
*BioAccess AI — Demonstração Acadêmica de Engenharia de Software e Visão Computacional.*

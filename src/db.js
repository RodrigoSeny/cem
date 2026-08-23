// ═══════════════════════════════════════════════════════════════
// CEM — Centro Educacional Milezi
// Conexão SQLite + criação/migração do schema
// ═══════════════════════════════════════════════════════════════
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'dados');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'cem.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ────────────────────────────────────────────────────────────────
// SCHEMA
// Ordem de criação respeita as dependências de chave estrangeira.
// ────────────────────────────────────────────────────────────────
const SCHEMA = `
-- ── Dados da escola (registro único, id = 1) ──────────────────
CREATE TABLE IF NOT EXISTS escola (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  nome_fantasia     TEXT NOT NULL DEFAULT 'Centro Educacional Milezi',
  razao_social      TEXT,
  cnpj              TEXT,
  inep              TEXT,
  email             TEXT,
  telefone          TEXT,
  whatsapp          TEXT,
  cep               TEXT,
  logradouro        TEXT,
  numero            TEXT,
  complemento       TEXT,
  bairro            TEXT,
  cidade            TEXT,
  estado            TEXT,
  diretor           TEXT,
  logo_url          TEXT DEFAULT '/img/LogoMilezi.jpg',
  ano_letivo        INTEGER,
  atualizado_em     TEXT
);

-- ── Perfis de acesso (RBAC por página) ────────────────────────
CREATE TABLE IF NOT EXISTS perfis (
  id          TEXT PRIMARY KEY,
  nome        TEXT NOT NULL UNIQUE,
  descricao   TEXT,
  paginas     TEXT NOT NULL DEFAULT '[]',
  sistema     INTEGER NOT NULL DEFAULT 0,
  criado_em   TEXT DEFAULT (datetime('now','localtime'))
);

-- ── Funcionários ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS funcionarios (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula             TEXT UNIQUE,
  nome                  TEXT NOT NULL,
  nome_social           TEXT,
  cpf                   TEXT UNIQUE,
  rg                    TEXT,
  orgao_expedidor       TEXT,
  data_nascimento       TEXT,
  sexo                  TEXT,
  estado_civil          TEXT,
  telefone              TEXT,
  whatsapp              TEXT,
  email                 TEXT,
  cep                   TEXT,
  logradouro            TEXT,
  numero                TEXT,
  complemento           TEXT,
  bairro                TEXT,
  cidade                TEXT,
  estado                TEXT,
  cargo                 TEXT NOT NULL,
  setor                 TEXT,
  tipo_contrato         TEXT DEFAULT 'clt',
  data_admissao         TEXT,
  data_demissao         TEXT,
  salario               REAL,
  carga_horaria         TEXT,
  turno                 TEXT,
  formacao              TEXT,
  especializacao        TEXT,
  pis                   TEXT,
  ctps                  TEXT,
  banco                 TEXT,
  agencia               TEXT,
  conta                 TEXT,
  pix                   TEXT,
  contato_emergencia    TEXT,
  telefone_emergencia   TEXT,
  foto_url              TEXT,
  observacoes           TEXT,
  ativo                 INTEGER NOT NULL DEFAULT 1,
  criado_em             TEXT DEFAULT (datetime('now','localtime')),
  atualizado_em         TEXT
);
CREATE INDEX IF NOT EXISTS idx_func_nome  ON funcionarios (nome);
CREATE INDEX IF NOT EXISTS idx_func_ativo ON funcionarios (ativo);

-- ── Turmas ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS turmas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT NOT NULL,
  etapa         TEXT,
  serie         TEXT,
  turno         TEXT NOT NULL DEFAULT 'manha' CHECK (turno IN ('manha','tarde','integral','noite')),
  ano_letivo    INTEGER NOT NULL,
  sala          TEXT,
  capacidade    INTEGER,
  professor_id  INTEGER REFERENCES funcionarios(id) ON DELETE SET NULL,
  auxiliar_id   INTEGER REFERENCES funcionarios(id) ON DELETE SET NULL,
  ativa         INTEGER NOT NULL DEFAULT 1,
  criado_em     TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE (nome, ano_letivo)
);

-- ── Responsáveis ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS responsaveis (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  nome               TEXT NOT NULL,
  cpf                TEXT UNIQUE,
  rg                 TEXT,
  data_nascimento    TEXT,
  sexo               TEXT,
  estado_civil       TEXT,
  telefone           TEXT,
  whatsapp           TEXT,
  email              TEXT,
  cep                TEXT,
  logradouro         TEXT,
  numero             TEXT,
  complemento        TEXT,
  bairro             TEXT,
  cidade             TEXT,
  estado             TEXT,
  profissao          TEXT,
  local_trabalho     TEXT,
  telefone_trabalho  TEXT,
  renda              REAL,
  observacoes        TEXT,
  ativo              INTEGER NOT NULL DEFAULT 1,
  criado_em          TEXT DEFAULT (datetime('now','localtime')),
  atualizado_em      TEXT
);
CREATE INDEX IF NOT EXISTS idx_resp_nome ON responsaveis (nome);

-- ── Alunos ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alunos (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula               TEXT NOT NULL UNIQUE,
  nome                    TEXT NOT NULL,
  nome_social             TEXT,
  data_nascimento         TEXT,
  sexo                    TEXT,
  cpf                     TEXT,
  rg                      TEXT,
  certidao_nascimento     TEXT,
  nis                     TEXT,
  naturalidade            TEXT,
  uf_nascimento           TEXT,
  nacionalidade           TEXT DEFAULT 'Brasileira',
  cor_raca                TEXT,
  turma_id                INTEGER REFERENCES turmas(id) ON DELETE SET NULL,
  ano_letivo              INTEGER,
  turno                   TEXT,
  situacao                TEXT NOT NULL DEFAULT 'matriculado'
                            CHECK (situacao IN ('pre_matricula','matriculado','transferido','trancado','desistente','egresso')),
  data_matricula          TEXT,
  data_saida              TEXT,
  escola_anterior         TEXT,
  cep                     TEXT,
  logradouro              TEXT,
  numero                  TEXT,
  complemento             TEXT,
  bairro                  TEXT,
  cidade                  TEXT,
  estado                  TEXT,
  tipo_sanguineo          TEXT,
  alergias                TEXT,
  medicamentos            TEXT,
  restricoes_alimentares  TEXT,
  plano_saude             TEXT,
  medico_referencia       TEXT,
  contato_emergencia      TEXT,
  telefone_emergencia     TEXT,
  necessidades_especiais  TEXT,
  laudo                   TEXT,
  autoriza_imagem         INTEGER NOT NULL DEFAULT 0,
  autoriza_medicamento    INTEGER NOT NULL DEFAULT 0,
  autoriza_passeio        INTEGER NOT NULL DEFAULT 0,
  foto_url                TEXT,
  observacoes             TEXT,
  criado_em               TEXT DEFAULT (datetime('now','localtime')),
  atualizado_em           TEXT
);
CREATE INDEX IF NOT EXISTS idx_alunos_nome     ON alunos (nome);
CREATE INDEX IF NOT EXISTS idx_alunos_turma    ON alunos (turma_id);
CREATE INDEX IF NOT EXISTS idx_alunos_situacao ON alunos (situacao);

-- ── Vínculo aluno ↔ responsável (N:N) ─────────────────────────
CREATE TABLE IF NOT EXISTS aluno_responsaveis (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  aluno_id            INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  responsavel_id      INTEGER NOT NULL REFERENCES responsaveis(id) ON DELETE CASCADE,
  parentesco          TEXT,
  tipo_vinculo        TEXT NOT NULL DEFAULT 'ambos'
                        CHECK (tipo_vinculo IN ('financeiro','pedagogico','ambos')),
  principal           INTEGER NOT NULL DEFAULT 0,
  autorizado_retirar  INTEGER NOT NULL DEFAULT 1,
  UNIQUE (aluno_id, responsavel_id)
);

-- ── Pessoas autorizadas pelos responsáveis a retirar o aluno,      ──
-- ── mesmo sem ter cadastro próprio de responsável (avós, vizinhos, ──
-- ── motoristas etc.) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aluno_autorizados_retirada (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  aluno_id      INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  cpf           TEXT,
  parentesco    TEXT,
  telefone      TEXT,
  observacoes   TEXT,
  ativo         INTEGER NOT NULL DEFAULT 1,
  criado_em     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aut_retirada_aluno ON aluno_autorizados_retirada (aluno_id);

-- ── Usuários do sistema (funcionários) e do portal (responsáveis) ──
CREATE TABLE IF NOT EXISTS usuarios (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  nome                  TEXT NOT NULL,
  login                 TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email                 TEXT,
  senha_hash            TEXT NOT NULL,
  tipo                  TEXT NOT NULL DEFAULT 'funcionario'
                          CHECK (tipo IN ('funcionario','responsavel')),
  perfil_id             TEXT REFERENCES perfis(id) ON DELETE SET NULL,
  funcionario_id        INTEGER REFERENCES funcionarios(id) ON DELETE SET NULL,
  responsavel_id        INTEGER REFERENCES responsaveis(id) ON DELETE SET NULL,
  ativo                 INTEGER NOT NULL DEFAULT 1,
  precisa_trocar_senha  INTEGER NOT NULL DEFAULT 0,
  ultimo_login          TEXT,
  tentativas            INTEGER NOT NULL DEFAULT 0,
  bloqueado_ate         TEXT,
  criado_em             TEXT DEFAULT (datetime('now','localtime')),
  atualizado_em         TEXT
);

-- ── Inscrições de notificação push (Web Push) ──────────────────
-- Um usuário pode ter mais de um aparelho inscrito (celular, tablet...).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  criado_em   TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_push_usuario ON push_subscriptions (usuario_id);

-- ── Auditoria ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id    INTEGER,
  usuario_nome  TEXT,
  acao          TEXT NOT NULL,
  entidade      TEXT,
  entidade_id   INTEGER,
  detalhe       TEXT,
  ip            TEXT,
  criado_em     TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_logs_data ON logs (criado_em);

-- ── Anexos (documentos digitalizados e fotos) ─────────────────
-- Genérico: serve a alunos, responsáveis, funcionários e ocorrências.
CREATE TABLE IF NOT EXISTS anexos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  entidade       TEXT NOT NULL CHECK (entidade IN ('aluno','responsavel','funcionario','ocorrencia','despesa','mensagem')),
  entidade_id    INTEGER NOT NULL,
  categoria      TEXT NOT NULL DEFAULT 'documento',
  descricao      TEXT,
  nome_original  TEXT NOT NULL,
  nome_arquivo   TEXT NOT NULL,
  mime           TEXT,
  tamanho        INTEGER,
  criado_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em      TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_anexos_entidade ON anexos (entidade, entidade_id);

-- ── Ocorrências (histórico do aluno) ──────────────────────────
CREATE TABLE IF NOT EXISTS ocorrencias (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  aluno_id             INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  tipo                 TEXT NOT NULL,
  gravidade            TEXT NOT NULL DEFAULT 'informativa'
                         CHECK (gravidade IN ('informativa','atencao','grave')),
  titulo               TEXT NOT NULL,
  descricao            TEXT,
  data_ocorrencia      TEXT NOT NULL,
  hora_ocorrencia      TEXT,
  local_ocorrencia     TEXT,
  providencia          TEXT,
  visivel_responsavel  INTEGER NOT NULL DEFAULT 0,
  exige_ciencia        INTEGER NOT NULL DEFAULT 0,
  registrado_por       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  registrado_nome      TEXT,
  criado_em            TEXT DEFAULT (datetime('now','localtime')),
  atualizado_em        TEXT,
  invalidada_em        TEXT,
  invalidada_motivo    TEXT,
  invalidada_por       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_ocorr_aluno ON ocorrencias (aluno_id, data_ocorrencia);

-- ── Ciências de ocorrências (responsável confirma leitura) ─────
CREATE TABLE IF NOT EXISTS ocorrencia_ciencias (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ocorrencia_id   INTEGER NOT NULL REFERENCES ocorrencias(id) ON DELETE CASCADE,
  responsavel_id  INTEGER NOT NULL REFERENCES responsaveis(id) ON DELETE CASCADE,
  ciente_em       TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(ocorrencia_id, responsavel_id)
);
CREATE INDEX IF NOT EXISTS idx_ocorr_cienc ON ocorrencia_ciencias (ocorrencia_id);

-- ── Leituras de ocorrências (responsável abriu no app) ─────────
CREATE TABLE IF NOT EXISTS ocorrencia_leituras (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ocorrencia_id   INTEGER NOT NULL REFERENCES ocorrencias(id) ON DELETE CASCADE,
  responsavel_id  INTEGER NOT NULL REFERENCES responsaveis(id) ON DELETE CASCADE,
  lido_em         TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(ocorrencia_id, responsavel_id)
);
CREATE INDEX IF NOT EXISTS idx_ocorr_leit ON ocorrencia_leituras (ocorrencia_id);

-- ── Mensageria (escola → responsáveis) ────────────────────────
CREATE TABLE IF NOT EXISTS mensagens (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo         TEXT NOT NULL,
  conteudo       TEXT NOT NULL,
  tipo           TEXT NOT NULL DEFAULT 'comunicado',
  exige_ciencia  INTEGER NOT NULL DEFAULT 0,
  alvo           TEXT NOT NULL DEFAULT 'todos' CHECK (alvo IN ('todos','turma','aluno')),
  turma_id       INTEGER REFERENCES turmas(id) ON DELETE SET NULL,
  aluno_id       INTEGER REFERENCES alunos(id) ON DELETE SET NULL,
  criado_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_nome    TEXT,
  criado_em      TEXT DEFAULT (datetime('now','localtime')),
  invalidada_em      TEXT,
  invalidada_motivo  TEXT,
  invalidada_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Uma linha por responsável que recebeu a mensagem (com o aluno de contexto)
CREATE TABLE IF NOT EXISTS mensagem_destinatarios (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  mensagem_id     INTEGER NOT NULL REFERENCES mensagens(id) ON DELETE CASCADE,
  responsavel_id  INTEGER NOT NULL REFERENCES responsaveis(id) ON DELETE CASCADE,
  aluno_id        INTEGER REFERENCES alunos(id) ON DELETE CASCADE,
  lido_em         TEXT,
  ciente_em       TEXT,
  UNIQUE (mensagem_id, responsavel_id, aluno_id)
);
CREATE INDEX IF NOT EXISTS idx_msgdest_resp ON mensagem_destinatarios (responsavel_id, lido_em);

-- ══ FINANCEIRO ════════════════════════════════════════════════

-- Planos de pagamento praticados pela escola
CREATE TABLE IF NOT EXISTS planos_pagamento (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome                        TEXT NOT NULL,
  valor_mensalidade           REAL NOT NULL DEFAULT 0,
  taxa_matricula              REAL NOT NULL DEFAULT 0,
  num_parcelas                INTEGER NOT NULL DEFAULT 12,
  dia_vencimento              INTEGER NOT NULL DEFAULT 10,
  descricao                   TEXT,
  ativo                       INTEGER NOT NULL DEFAULT 1,
  -- Desconto por irmão matriculado: incide sobre o valor já líquido do
  -- desconto/bolsa manual do contrato (composto, não somado).
  desconto_irmao2_percentual  REAL NOT NULL DEFAULT 0,
  desconto_irmao3_percentual  REAL NOT NULL DEFAULT 0,
  criado_em                   TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE (nome)
);

-- Valores do plano por turma e por aluno novo/antigo. turma_id NULL = vale
-- pra qualquer turma sem linha específica; tipo_aluno 'ambos' = mesmo valor
-- pros dois. Sem nenhuma linha, o contrato usa planos_pagamento.valor_mensalidade.
CREATE TABLE IF NOT EXISTS plano_valores (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  plano_id           INTEGER NOT NULL REFERENCES planos_pagamento(id) ON DELETE CASCADE,
  turma_id           INTEGER REFERENCES turmas(id) ON DELETE CASCADE,
  tipo_aluno         TEXT NOT NULL DEFAULT 'ambos' CHECK (tipo_aluno IN ('novo','antigo','ambos')),
  valor_mensalidade  REAL NOT NULL,
  UNIQUE (plano_id, turma_id, tipo_aluno)
);

-- Histórico de reajustes gerais aplicados (auditoria)
CREATE TABLE IF NOT EXISTS reajustes_historico (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  escopo              TEXT NOT NULL CHECK (escopo IN ('geral','turno','turma')),
  referencia          TEXT,
  percentual          REAL NOT NULL,
  retroativo          INTEGER NOT NULL DEFAULT 0,
  planos_afetados     INTEGER NOT NULL DEFAULT 0,
  contratos_afetados  INTEGER NOT NULL DEFAULT 0,
  aplicado_por        INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em           TEXT DEFAULT (datetime('now','localtime'))
);

-- Contrato financeiro do aluno no ano letivo
CREATE TABLE IF NOT EXISTS contratos_financeiros (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  aluno_id             INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  plano_id             INTEGER NOT NULL REFERENCES planos_pagamento(id),
  responsavel_id       INTEGER REFERENCES responsaveis(id) ON DELETE SET NULL,
  ano_letivo           INTEGER NOT NULL,
  valor_mensalidade    REAL NOT NULL,
  desconto_percentual  REAL NOT NULL DEFAULT 0,
  bolsa_percentual     REAL NOT NULL DEFAULT 0,
  desconto_irmao_percentual REAL NOT NULL DEFAULT 0,
  tipo_aluno           TEXT CHECK (tipo_aluno IN ('novo','antigo')),
  dia_vencimento       INTEGER NOT NULL DEFAULT 10,
  num_parcelas         INTEGER NOT NULL DEFAULT 12,
  mes_inicio           INTEGER NOT NULL DEFAULT 1,
  status               TEXT NOT NULL DEFAULT 'ativo'
                         CHECK (status IN ('ativo','encerrado','cancelado')),
  observacoes          TEXT,
  criado_em            TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE (aluno_id, ano_letivo)
);

-- Parcelas geradas a partir do contrato
CREATE TABLE IF NOT EXISTS mensalidades (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  contrato_id    INTEGER NOT NULL REFERENCES contratos_financeiros(id) ON DELETE CASCADE,
  aluno_id       INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  competencia    TEXT NOT NULL,
  parcela        INTEGER,
  descricao      TEXT,
  valor_original REAL NOT NULL,
  valor_desconto REAL NOT NULL DEFAULT 0,
  valor_acrescimo REAL NOT NULL DEFAULT 0,
  vencimento     TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'aberta'
                   CHECK (status IN ('aberta','paga','cancelada')),
  observacoes    TEXT,
  criado_em      TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE (contrato_id, competencia, parcela)
);
CREATE INDEX IF NOT EXISTS idx_mens_aluno ON mensalidades (aluno_id, status);
CREATE INDEX IF NOT EXISTS idx_mens_venc  ON mensalidades (status, vencimento);

-- Baixas (podem ser parciais; a soma define a quitação)
CREATE TABLE IF NOT EXISTS pagamentos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  mensalidade_id  INTEGER NOT NULL REFERENCES mensalidades(id) ON DELETE CASCADE,
  valor           REAL NOT NULL,
  data_pagamento  TEXT NOT NULL,
  forma           TEXT NOT NULL DEFAULT 'dinheiro',
  observacoes     TEXT,
  registrado_por  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  registrado_nome TEXT,
  criado_em       TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_pag_mens ON pagamentos (mensalidade_id);

-- ── Centros de custo ──────────────────────────────────────────
-- Amarram receita e despesa: é o que responde "quanto a festa
-- custou e quanto dela já foi pago".
CREATE TABLE IF NOT EXISTS centros_custo (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo             TEXT NOT NULL UNIQUE,
  nome               TEXT NOT NULL,
  descricao          TEXT,
  tipo               TEXT NOT NULL DEFAULT 'evento'
                       CHECK (tipo IN ('evento','material','rotina','servico','outro')),
  data_inicio        TEXT,
  data_fim           TEXT,
  orcamento_previsto REAL NOT NULL DEFAULT 0,
  ativo              INTEGER NOT NULL DEFAULT 1,
  criado_em          TEXT DEFAULT (datetime('now','localtime'))
);

-- ── Cobranças programadas (variáveis) ─────────────────────────
-- modo 'embutir'  → soma na mensalidade do mês
-- modo 'separada' → gera documento próprio (a extra avulsa)
CREATE TABLE IF NOT EXISTS cobrancas (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao          TEXT NOT NULL,
  valor              REAL NOT NULL,
  centro_custo_id    INTEGER REFERENCES centros_custo(id) ON DELETE SET NULL,
  modo               TEXT NOT NULL DEFAULT 'embutir'
                       CHECK (modo IN ('embutir','separada')),
  escopo             TEXT NOT NULL DEFAULT 'todos'
                       CHECK (escopo IN ('todos','turma','turno','aluno')),
  turma_id           INTEGER REFERENCES turmas(id) ON DELETE SET NULL,
  turno              TEXT,
  aluno_id           INTEGER REFERENCES alunos(id) ON DELETE CASCADE,
  periodicidade      TEXT NOT NULL DEFAULT 'unica'
                       CHECK (periodicidade IN ('unica','mensal','bimestral','trimestral','semestral','anual')),
  competencia_inicio TEXT NOT NULL,
  ocorrencias        INTEGER NOT NULL DEFAULT 1,
  dia_vencimento     INTEGER,
  observacoes        TEXT,
  ativa              INTEGER NOT NULL DEFAULT 1,
  criado_por         INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_nome        TEXT,
  criado_em          TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_cobr_comp ON cobrancas (competencia_inicio, ativa);

-- Quem deve o quê, em qual competência (gerado a partir do escopo)
CREATE TABLE IF NOT EXISTS cobranca_alunos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  cobranca_id    INTEGER NOT NULL REFERENCES cobrancas(id) ON DELETE CASCADE,
  aluno_id       INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  competencia    TEXT NOT NULL,
  valor          REAL NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pendente'
                   CHECK (status IN ('pendente','lancada','cancelada')),
  mensalidade_id INTEGER REFERENCES mensalidades(id) ON DELETE SET NULL,
  criado_em      TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE (cobranca_id, aluno_id, competencia)
);
CREATE INDEX IF NOT EXISTS idx_cobral_pend ON cobranca_alunos (aluno_id, competencia, status);

-- ── Itens da mensalidade ──────────────────────────────────────
-- A mensalidade vira cabeçalho + itens: é o que permite o
-- documento único discriminado e o rateio por centro de custo.
CREATE TABLE IF NOT EXISTS mensalidade_itens (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  mensalidade_id  INTEGER NOT NULL REFERENCES mensalidades(id) ON DELETE CASCADE,
  descricao       TEXT NOT NULL,
  valor           REAL NOT NULL,
  tipo            TEXT NOT NULL DEFAULT 'cobranca'
                    CHECK (tipo IN ('mensalidade','cobranca','desconto','acrescimo')),
  centro_custo_id INTEGER REFERENCES centros_custo(id) ON DELETE SET NULL,
  cobranca_id     INTEGER REFERENCES cobrancas(id) ON DELETE SET NULL,
  ordem           INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_item_mens ON mensalidade_itens (mensalidade_id);
CREATE INDEX IF NOT EXISTS idx_item_cc   ON mensalidade_itens (centro_custo_id);

-- ── Despesas ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS despesas (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao        TEXT NOT NULL,
  fornecedor       TEXT,
  documento        TEXT,
  valor            REAL NOT NULL,
  centro_custo_id  INTEGER REFERENCES centros_custo(id) ON DELETE SET NULL,
  competencia      TEXT,
  vencimento       TEXT,
  data_pagamento   TEXT,
  forma            TEXT,
  status           TEXT NOT NULL DEFAULT 'aberta'
                     CHECK (status IN ('aberta','paga','cancelada')),
  observacoes      TEXT,
  registrado_por   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  registrado_nome  TEXT,
  criado_em        TEXT DEFAULT (datetime('now','localtime')),
  atualizado_em    TEXT
);
CREATE INDEX IF NOT EXISTS idx_desp_cc  ON despesas (centro_custo_id);
CREATE INDEX IF NOT EXISTS idx_desp_st  ON despesas (status, vencimento);

-- ══ CONTROLE BANCÁRIO ════════════════════════════════════

-- Contas bancárias da escola
CREATE TABLE IF NOT EXISTS contas_bancarias (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  nome           TEXT NOT NULL,
  banco          TEXT NOT NULL DEFAULT '',
  codigo_banco   TEXT,
  agencia        TEXT,
  conta          TEXT,
  tipo           TEXT NOT NULL DEFAULT 'corrente'
                   CHECK (tipo IN ('corrente','poupanca','investimento','caixa')),
  saldo_inicial  REAL NOT NULL DEFAULT 0,
  data_inicial   TEXT,
  ativa          INTEGER NOT NULL DEFAULT 1,
  criado_em      TEXT DEFAULT (datetime('now','localtime'))
);

-- Cabeçalho de cada arquivo OFX importado
CREATE TABLE IF NOT EXISTS importacoes_ofx (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  conta_id          INTEGER REFERENCES contas_bancarias(id) ON DELETE SET NULL,
  banco_origem      TEXT,
  agencia_origem    TEXT,
  conta_origem      TEXT,
  periodo_inicio    TEXT,
  periodo_fim       TEXT,
  total_transacoes  INTEGER NOT NULL DEFAULT 0,
  nome_arquivo      TEXT,
  importado_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  importado_nome    TEXT,
  importado_em      TEXT DEFAULT (datetime('now','localtime'))
);

-- Transações do extrato (uma linha por <STMTTRN>)
CREATE TABLE IF NOT EXISTS ofx_transacoes (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  importacao_id      INTEGER NOT NULL REFERENCES importacoes_ofx(id) ON DELETE CASCADE,
  conta_id           INTEGER REFERENCES contas_bancarias(id) ON DELETE SET NULL,
  fitid              TEXT NOT NULL,
  tipo               TEXT NOT NULL CHECK (tipo IN ('CREDIT','DEBIT')),
  data_lancamento    TEXT NOT NULL,
  valor              REAL NOT NULL,
  descricao          TEXT,
  nome_beneficiario  TEXT,
  status             TEXT NOT NULL DEFAULT 'pendente'
                       CHECK (status IN ('pendente','conciliado','descartado')),
  observacoes        TEXT,
  conciliado_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  conciliado_nome    TEXT,
  conciliado_em      TEXT,
  criado_em          TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE (importacao_id, fitid)
);
CREATE INDEX IF NOT EXISTS idx_ofxt_status ON ofx_transacoes (status, data_lancamento);
CREATE INDEX IF NOT EXISTS idx_ofxt_import ON ofx_transacoes (importacao_id);
CREATE INDEX IF NOT EXISTS idx_ofxt_conta  ON ofx_transacoes (conta_id, data_lancamento);

-- Vínculos N:N transação OFX ↔ pagamento ou despesa
-- Permite que 2 pagamentos do sistema = 1 PIX recebido (e vice-versa)
CREATE TABLE IF NOT EXISTS ofx_vinculos (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  transacao_id     INTEGER NOT NULL REFERENCES ofx_transacoes(id) ON DELETE CASCADE,
  entidade         TEXT NOT NULL CHECK (entidade IN ('pagamento','despesa')),
  entidade_id      INTEGER NOT NULL,
  valor_vinculado  REAL NOT NULL,
  criado_em        TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE (transacao_id, entidade, entidade_id)
);
CREATE INDEX IF NOT EXISTS idx_ofxv_trans ON ofx_vinculos (transacao_id);
CREATE INDEX IF NOT EXISTS idx_ofxv_ent   ON ofx_vinculos (entidade, entidade_id);
`;

db.exec(SCHEMA);

// ────────────────────────────────────────────────────────────────
// MIGRAÇÕES
// Ajustes em bancos que já existem. Todas idempotentes: rodam a
// cada subida e não fazem nada se já foram aplicadas.
// ────────────────────────────────────────────────────────────────
function migrar() {
  const colunas = tabela => db.pragma(`table_info(${tabela})`).map(c => c.name);

  // 1. Origem da mensalidade (contrato, avulsa ou cobrança separada)
  if (!colunas('mensalidades').includes('origem')) {
    db.exec(`ALTER TABLE mensalidades ADD COLUMN origem TEXT NOT NULL DEFAULT 'contrato'`);
    console.log('↗️  mensalidades.origem criada.');
  }

  // 2. Anexos passam a aceitar despesa (nota fiscal).
  //    O CHECK não é alterável no SQLite: recria a tabela preservando os dados.
  const ddlAnexos = db.prepare(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='anexos'`
  ).get()?.sql || '';

  if (!ddlAnexos.includes("'despesa'")) {
    const recriar = db.transaction(() => {
      db.exec(`
        CREATE TABLE anexos_novo (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          entidade       TEXT NOT NULL CHECK (entidade IN ('aluno','responsavel','funcionario','ocorrencia','despesa')),
          entidade_id    INTEGER NOT NULL,
          categoria      TEXT NOT NULL DEFAULT 'documento',
          descricao      TEXT,
          nome_original  TEXT NOT NULL,
          nome_arquivo   TEXT NOT NULL,
          mime           TEXT,
          tamanho        INTEGER,
          criado_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
          criado_em      TEXT DEFAULT (datetime('now','localtime'))
        );
        INSERT INTO anexos_novo SELECT id, entidade, entidade_id, categoria, descricao,
               nome_original, nome_arquivo, mime, tamanho, criado_por, criado_em FROM anexos;
        DROP TABLE anexos;
        ALTER TABLE anexos_novo RENAME TO anexos;
        CREATE INDEX IF NOT EXISTS idx_anexos_entidade ON anexos (entidade, entidade_id);
      `);
    });
    db.pragma('foreign_keys = OFF');
    recriar();
    db.pragma('foreign_keys = ON');
    console.log('↗️  anexos agora aceitam despesa.');
  }

  // 3. Mensalidades antigas viram cabeçalho + item, para o
  //    documento sair discriminado e entrar no centro de custo.
  const semItens = db.prepare(`
    SELECT m.id, m.descricao, m.competencia, m.valor_original, m.valor_desconto, m.valor_acrescimo
      FROM mensalidades m
     WHERE NOT EXISTS (SELECT 1 FROM mensalidade_itens i WHERE i.mensalidade_id = m.id)`).all();

  if (semItens.length) {
    const inserir = db.prepare(`
      INSERT INTO mensalidade_itens (mensalidade_id, descricao, valor, tipo, ordem)
      VALUES (?, ?, ?, ?, ?)`);

    const converter = db.transaction(linhas => {
      for (const m of linhas) {
        inserir.run(m.id, m.descricao || `Mensalidade ${m.competencia}`, m.valor_original, 'mensalidade', 0);
        if (m.valor_desconto > 0) inserir.run(m.id, 'Desconto', -m.valor_desconto, 'desconto', 1);
        if (m.valor_acrescimo > 0) inserir.run(m.id, 'Acréscimo', m.valor_acrescimo, 'acrescimo', 2);
      }
    });
    converter(semItens);
    console.log(`↗️  ${semItens.length} mensalidade(s) convertida(s) para o formato com itens.`);
  }

  // 4. Ocorrências passam a ter exige_ciencia.
  if (!colunas('ocorrencias').includes('exige_ciencia')) {
    db.exec(`ALTER TABLE ocorrencias ADD COLUMN exige_ciencia INTEGER NOT NULL DEFAULT 0`);
    console.log('↗️  ocorrencias.exige_ciencia criada.');
  }

  // 5. Mensagens e ocorrências que já receberam ciência não podem mais ser
  //    editadas/excluídas — só invalidadas, com motivo, permanecendo visíveis.
  if (!colunas('mensagens').includes('invalidada_em')) {
    db.exec(`
      ALTER TABLE mensagens ADD COLUMN invalidada_em TEXT;
      ALTER TABLE mensagens ADD COLUMN invalidada_motivo TEXT;
      ALTER TABLE mensagens ADD COLUMN invalidada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
    `);
    console.log('↗️  mensagens.invalidada_* criadas.');
  }
  if (!colunas('ocorrencias').includes('invalidada_em')) {
    db.exec(`
      ALTER TABLE ocorrencias ADD COLUMN invalidada_em TEXT;
      ALTER TABLE ocorrencias ADD COLUMN invalidada_motivo TEXT;
      ALTER TABLE ocorrencias ADD COLUMN invalidada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
    `);
    console.log('↗️  ocorrencias.invalidada_* criadas.');
  }

  // 6. Anexos passam a aceitar mensagem (fotos/documentos anexados a comunicados).
  //    O CHECK não é alterável no SQLite: recria a tabela preservando os dados.
  const ddlAnexos2 = db.prepare(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='anexos'`
  ).get()?.sql || '';

  if (!ddlAnexos2.includes("'mensagem'")) {
    const recriar2 = db.transaction(() => {
      db.exec(`
        CREATE TABLE anexos_novo (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          entidade       TEXT NOT NULL CHECK (entidade IN ('aluno','responsavel','funcionario','ocorrencia','despesa','mensagem')),
          entidade_id    INTEGER NOT NULL,
          categoria      TEXT NOT NULL DEFAULT 'documento',
          descricao      TEXT,
          nome_original  TEXT NOT NULL,
          nome_arquivo   TEXT NOT NULL,
          mime           TEXT,
          tamanho        INTEGER,
          criado_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
          criado_em      TEXT DEFAULT (datetime('now','localtime'))
        );
        INSERT INTO anexos_novo SELECT id, entidade, entidade_id, categoria, descricao,
               nome_original, nome_arquivo, mime, tamanho, criado_por, criado_em FROM anexos;
        DROP TABLE anexos;
        ALTER TABLE anexos_novo RENAME TO anexos;
        CREATE INDEX IF NOT EXISTS idx_anexos_entidade ON anexos (entidade, entidade_id);
      `);
    });
    db.pragma('foreign_keys = OFF');
    recriar2();
    db.pragma('foreign_keys = ON');
    console.log('↗️  anexos agora aceitam mensagem.');
  }

  // 7. Montagem de plano por lote: valores por turma/tipo de aluno e
  //    desconto de irmãos definido no plano.
  if (!colunas('planos_pagamento').includes('desconto_irmao2_percentual')) {
    db.exec(`
      ALTER TABLE planos_pagamento ADD COLUMN desconto_irmao2_percentual REAL NOT NULL DEFAULT 0;
      ALTER TABLE planos_pagamento ADD COLUMN desconto_irmao3_percentual REAL NOT NULL DEFAULT 0;
    `);
    console.log('↗️  planos_pagamento.desconto_irmao{2,3}_percentual criadas.');
  }
  if (!colunas('contratos_financeiros').includes('desconto_irmao_percentual')) {
    db.exec(`
      ALTER TABLE contratos_financeiros ADD COLUMN desconto_irmao_percentual REAL NOT NULL DEFAULT 0;
      ALTER TABLE contratos_financeiros ADD COLUMN tipo_aluno TEXT CHECK (tipo_aluno IN ('novo','antigo'));
    `);
    console.log('↗️  contratos_financeiros.desconto_irmao_percentual/tipo_aluno criadas.');
  }
}

migrar();

// ────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────

/** Data/hora local no formato do banco (YYYY-MM-DD HH:MM:SS). */
function agora() {
  return new Date().toLocaleString('sv-SE').replace('T', ' ');
}

/** Registra uma ação na auditoria. Nunca derruba a requisição. */
function log(req, acao, entidade, entidade_id, detalhe) {
  try {
    db.prepare(`INSERT INTO logs (usuario_id, usuario_nome, acao, entidade, entidade_id, detalhe, ip)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(
        req?.usuario?.id ?? null,
        req?.usuario?.nome ?? null,
        acao, entidade ?? null, entidade_id ?? null,
        detalhe ?? null,
        req?.ip ?? null
      );
  } catch (e) {
    console.error('[log]', e.message);
  }
}

module.exports = { db, log, agora, DB_PATH };

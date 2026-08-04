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
  entidade       TEXT NOT NULL CHECK (entidade IN ('aluno','responsavel','funcionario','ocorrencia')),
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
  registrado_por       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  registrado_nome      TEXT,
  criado_em            TEXT DEFAULT (datetime('now','localtime')),
  atualizado_em        TEXT
);
CREATE INDEX IF NOT EXISTS idx_ocorr_aluno ON ocorrencias (aluno_id, data_ocorrencia);

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
  criado_em      TEXT DEFAULT (datetime('now','localtime'))
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
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  nome               TEXT NOT NULL,
  valor_mensalidade  REAL NOT NULL DEFAULT 0,
  taxa_matricula     REAL NOT NULL DEFAULT 0,
  num_parcelas       INTEGER NOT NULL DEFAULT 12,
  dia_vencimento     INTEGER NOT NULL DEFAULT 10,
  descricao          TEXT,
  ativo              INTEGER NOT NULL DEFAULT 1,
  criado_em          TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE (nome)
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
`;

db.exec(SCHEMA);

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

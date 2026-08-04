// ═══════════════════════════════════════════════════════════════
// CEM — Carga inicial: escola, perfis de acesso e usuário master
// Executado automaticamente na subida do servidor (idempotente)
// e também via: npm run seed
// ═══════════════════════════════════════════════════════════════
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db, agora } = require('./db');

const TODAS = [
  'dashboard', 'alunos', 'responsaveis', 'turmas', 'ocorrencias', 'mensagens',
  'funcionarios', 'financeiro', 'relatorios', 'usuarios', 'configuracoes',
];

const PERFIS = [
  {
    id: 'PERFIL-MASTER', nome: 'Master', sistema: 1,
    descricao: 'Acesso irrestrito ao sistema (suporte/proprietário).',
    paginas: TODAS,
  },
  {
    id: 'PERFIL-DIRECAO', nome: 'Direção', sistema: 1,
    descricao: 'Direção da escola — acesso completo aos módulos.',
    paginas: TODAS,
  },
  {
    id: 'PERFIL-SECRETARIA', nome: 'Secretaria', sistema: 1,
    descricao: 'Matrículas, cadastros, mensalidades e comunicação.',
    paginas: ['dashboard', 'alunos', 'responsaveis', 'turmas', 'ocorrencias', 'mensagens', 'financeiro', 'relatorios'],
  },
  {
    id: 'PERFIL-COORDENACAO', nome: 'Coordenação', sistema: 1,
    descricao: 'Acompanhamento pedagógico das turmas, alunos e ocorrências.',
    paginas: ['dashboard', 'alunos', 'responsaveis', 'turmas', 'ocorrencias', 'mensagens', 'funcionarios', 'relatorios'],
  },
  {
    id: 'PERFIL-PROFESSOR', nome: 'Professor', sistema: 1,
    descricao: 'Consulta das próprias turmas e registro de ocorrências.',
    paginas: ['dashboard', 'alunos', 'turmas', 'ocorrencias'],
  },
  {
    id: 'PERFIL-RESPONSAVEL', nome: 'Responsável', sistema: 1,
    descricao: 'Acesso exclusivo ao aplicativo (portal dos pais).',
    paginas: [],
  },
];

function seed() {
  const ano = new Date().getFullYear();

  // ── Escola ──────────────────────────────────────────────────
  db.prepare(`
    INSERT INTO escola (id, nome_fantasia, razao_social, logo_url, ano_letivo, atualizado_em)
    VALUES (1, 'Centro Educacional Milezi', 'Centro Educacional Milezi', '/img/LogoMilezi.jpg', ?, ?)
    ON CONFLICT(id) DO NOTHING`).run(ano, agora());

  // ── Perfis ──────────────────────────────────────────────────
  const upPerfil = db.prepare(`
    INSERT INTO perfis (id, nome, descricao, paginas, sistema)
    VALUES (@id, @nome, @descricao, @paginas, @sistema)
    ON CONFLICT(id) DO UPDATE SET
      descricao = excluded.descricao,
      paginas   = excluded.paginas,
      sistema   = excluded.sistema`);

  for (const p of PERFIS) {
    upPerfil.run({ ...p, paginas: JSON.stringify(p.paginas) });
  }

  // ── Plano de pagamento inicial ──────────────────────────────
  const temPlano = db.prepare('SELECT id FROM planos_pagamento LIMIT 1').get();
  if (!temPlano) {
    db.prepare(`
      INSERT INTO planos_pagamento (nome, valor_mensalidade, taxa_matricula, num_parcelas, dia_vencimento, descricao, ativo)
      VALUES ('Mensalidade padrão', 0, 0, 12, 10, 'Ajuste o valor em Financeiro → Planos.', 1)`).run();
  }

  // ── Usuário master ──────────────────────────────────────────
  const login = process.env.MASTER_LOGIN || 'master';
  const senha = process.env.MASTER_SENHA || 'cem@2026';

  const existe = db.prepare('SELECT id FROM usuarios WHERE perfil_id = ?').get('PERFIL-MASTER');
  if (!existe) {
    db.prepare(`
      INSERT INTO usuarios (nome, login, senha_hash, tipo, perfil_id, ativo, precisa_trocar_senha, criado_em)
      VALUES (?, ?, ?, 'funcionario', 'PERFIL-MASTER', 1, 1, ?)`)
      .run('Administrador CEM', login, bcrypt.hashSync(senha, 10), agora());

    console.log(`✅ Usuário master criado — login: ${login} | senha: ${senha}`);
    console.log('   Troque a senha no primeiro acesso.');
  }

  return { perfis: PERFIS.length };
}

// Execução direta: node src/seed.js
if (require.main === module) {
  const r = seed();
  console.log(`✅ Seed concluído (${r.perfis} perfis).`);
}

module.exports = { seed, PERFIS };

// ═══════════════════════════════════════════════════════════════
// CEM — Carga inicial: escola, perfis de acesso e usuário master
// Executado automaticamente na subida do servidor (idempotente)
// e também via: npm run seed
// ═══════════════════════════════════════════════════════════════
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db, agora } = require('./db');
const { TODAS_PAGINAS, PAGINAS_MASTER, PERFIL_MASTER } = require('./auth');

// O Master recebe automaticamente tudo o que existir no catálogo de páginas
const TODAS = TODAS_PAGINAS;

const PERFIS = [
  {
    id: 'PERFIL-MASTER', nome: 'Master', sistema: 1,
    descricao: 'Acesso irrestrito ao sistema (suporte/proprietário).',
    paginas: TODAS,
  },
  {
    id: 'PERFIL-DIRECAO', nome: 'Direção', sistema: 1,
    descricao: 'Direção da escola — acesso completo aos módulos.',
    // Tudo, menos o que é exclusivo do Master (SQL Manager)
    paginas: TODAS.filter(p => !PAGINAS_MASTER.includes(p)),
  },
  {
    id: 'PERFIL-SECRETARIA', nome: 'Secretaria', sistema: 1,
    descricao: 'Matrículas, cadastros, mensalidades e comunicação.',
    paginas: ['dashboard', 'alunos', 'responsaveis', 'turmas', 'ocorrencias', 'mensagens',
              'fin-painel', 'fin-cadastros', 'fin-recebimentos', 'relatorios'],
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

/** Cadastra uma lista de material + itens uma única vez (por nome), inativa
 *  e sem turma vinculada — a escola revisa e ativa depois. */
function seedListaMaterial({ nome, tipo, escopo, valor_alternativo, observacoes, itens }) {
  if (db.prepare('SELECT id FROM material_listas WHERE nome = ?').get(nome)) return;

  const inserirLista = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO material_listas (nome, tipo, escopo, valor_alternativo, observacoes, ativa, criado_em)
      VALUES (?, ?, ?, ?, ?, 0, ?)`
    ).run(nome, tipo, escopo, valor_alternativo || null, observacoes || null, agora());

    const inserirItem = db.prepare(`
      INSERT INTO material_lista_itens (lista_id, ordem, quantidade, descricao, observacao)
      VALUES (?, ?, ?, ?, ?)`);
    itens.forEach(([quantidade, descricao, observacao], i) =>
      inserirItem.run(info.lastInsertRowid, i, quantidade, descricao, observacao || null));
  });
  inserirLista();

  console.log(`📋 Lista de material "${nome}" cadastrada como rascunho (${itens.length} itens) — revise em Pedagógico.`);
}

function seed() {
  const ano = new Date().getFullYear();

  // ── Escola ──────────────────────────────────────────────────
  db.prepare(`
    INSERT INTO escola (id, nome_fantasia, razao_social, logo_url, ano_letivo, atualizado_em)
    VALUES (1, 'Centro Educacional Milezi', 'Centro Educacional Milezi', '/img/LogoMilezi.jpg', ?, ?)
    ON CONFLICT(id) DO NOTHING`).run(ano, agora());

  // ── Perfis ──────────────────────────────────────────────────
  // Na criação, grava a lista sugerida. Em reinícios, NÃO mexe nas
  // páginas: o que a direção ajustou em Perfis de Acesso é decisão
  // dela e seria perdido a cada deploy.
  const criarPerfil = db.prepare(`
    INSERT INTO perfis (id, nome, descricao, paginas, sistema)
    VALUES (@id, @nome, @descricao, @paginas, @sistema)
    ON CONFLICT(id) DO UPDATE SET
      descricao = excluded.descricao,
      sistema   = excluded.sistema`);

  for (const p of PERFIS) {
    criarPerfil.run({ ...p, paginas: JSON.stringify(p.paginas) });
  }

  // ── Migração: 'financeiro' virou quatro módulos ─────────────
  // Quem já tinha acesso ao financeiro recebe os quatro, para não
  // perder acesso no dia do deploy. A partir daí, quem aperta é a
  // direção, em Perfis de Acesso.
  const NOVOS_FIN = ['fin-painel', 'fin-cadastros', 'fin-recebimentos', 'fin-pagamentos'];
  const comFinanceiroAntigo = db.prepare(
    `SELECT id, paginas FROM perfis WHERE paginas LIKE '%"financeiro"%'`).all();

  for (const p of comFinanceiroAntigo) {
    let lista;
    try { lista = JSON.parse(p.paginas || '[]'); } catch { continue; }

    const nova = lista.filter(x => x !== 'financeiro');
    for (const n of NOVOS_FIN) if (!nova.includes(n)) nova.push(n);

    db.prepare('UPDATE perfis SET paginas = ? WHERE id = ?').run(JSON.stringify(nova), p.id);
    console.log(`↗️  ${p.id}: 'financeiro' substituído pelos 4 módulos.`);
  }

  // ── Sincronização do catálogo de páginas ────────────────────
  // O Master sempre enxerga tudo o que existe no sistema: toda tela
  // nova nasce liberada só para ele, e a liberação para os demais
  // perfis passa a ser uma escolha consciente em Perfis de Acesso.
  const master = db.prepare('SELECT paginas FROM perfis WHERE id = ?').get(PERFIL_MASTER);
  if (master) {
    let atuais = [];
    try { atuais = JSON.parse(master.paginas || '[]'); } catch { atuais = []; }

    const novas = TODAS.filter(p => !atuais.includes(p));
    if (novas.length) {
      db.prepare('UPDATE perfis SET paginas = ? WHERE id = ?').run(JSON.stringify(TODAS), PERFIL_MASTER);
      console.log(`🔑 Novas páginas liberadas para o Master: ${novas.join(', ')}`);
      console.log('   Para liberar a outros perfis, use Sistema → Perfis de Acesso.');
    }
  }

  // Páginas exclusivas do Master não podem ficar presas em outro perfil
  // (ex.: perfil que já tinha a página antes de ela virar exclusiva).
  if (PAGINAS_MASTER.length) {
    const outros = db.prepare('SELECT id, paginas FROM perfis WHERE id <> ?').all(PERFIL_MASTER);
    for (const p of outros) {
      let lista = [];
      try { lista = JSON.parse(p.paginas || '[]'); } catch { continue; }
      const limpa = lista.filter(x => !PAGINAS_MASTER.includes(x));
      if (limpa.length !== lista.length) {
        db.prepare('UPDATE perfis SET paginas = ? WHERE id = ?').run(JSON.stringify(limpa), p.id);
        console.log(`🔒 Página exclusiva do Master removida do perfil ${p.id}.`);
      }
    }
  }

  // ── Plano de pagamento inicial ──────────────────────────────
  const temPlano = db.prepare('SELECT id FROM planos_pagamento LIMIT 1').get();
  if (!temPlano) {
    db.prepare(`
      INSERT INTO planos_pagamento (nome, valor_mensalidade, taxa_matricula, num_parcelas, dia_vencimento, descricao, ativo)
      VALUES ('Mensalidade padrão', 0, 0, 12, 10, 'Ajuste o valor em Financeiro → Planos.', 1)`).run();
  }

  // ── Listas de material iniciais (rascunho, transcritas das fotos) ──
  // Roda uma única vez: cadastra as duas listas reais entregues na
  // matrícula como rascunho inativo, sem turma vinculada, pra a escola
  // revisar/corrigir a transcrição em Pedagógico → Listas de Material
  // antes de ativar e vincular às turmas certas.
  seedListaMaterial({
    nome: 'Lista de Material — Jardim IV (rascunho)',
    tipo: 'coletivo',
    escopo: 'turma',
    valor_alternativo: 550,
    observacoes: '⚠️ Lista transcrita de foto por IA — revise todos os itens antes de ativar. ' +
      'Se preferir, pode pagar na escola R$ 550,00 (quinhentos e cinquenta reais) à vista ou em três vezes, no boleto.',
    itens: [
      [1, 'Resma de papel A4'],
      [200, 'Folhas de papel colorido A4'],
      [3, 'Folhas de papel crepom', 'rosa, amarelo, vermelho'],
      [2, 'Folha 40kg'],
      [1, 'Cartolina azul'],
      [4, 'Placas de EVA lisa', 'não serve rolinho'],
      [4, 'Placas de EVA com glitter', 'não serve rolinho'],
      [2, 'Pacotes de colorset liso'],
      [1, 'Pacote de colorset neon'],
      [2, 'Pacotes de bandeirinha com corda'],
      [3, 'Pacotes de penas grandes'],
      [2, 'Potes de massa de modelar 500g'],
      [1, 'Pacote de palito de picolé'],
      [2, 'Pacotes de saco de celofane', '30x40 e 10x20'],
      [1, 'Rolo de fita crepe'],
      [1, 'Fita cetim 10 metros', 'azul'],
      [1, 'Caixa de fita colorida'],
      [1, 'Caixa de cola com glitter'],
      [1, 'Vidro de cola branca 250ml'],
      [1, 'Caixa de tinta para pintura a dedo'],
      [2, 'Potes de tinta guache 250ml', 'preto e branco'],
      [1, 'Pacote de bolinhas de lã'],
      [4, 'Lixas'],
      [1, 'Novelo de lã'],
      [1, 'Rolo de fitilho'],
      [5, 'Envelopes A4'],
      [2, 'Telas de pintura 30x20'],
      [5, 'Bastões de cola de silicone grosso'],
      [5, 'Bastões de cola de silicone fino'],
      [1, 'Cola de silicone'],
      [2, 'Metros de TNT', 'vermelho/azul/amarelo'],
      [1, 'Caixa de giz de cera'],
      [1, 'Caixa de lápis de cor'],
      [1, 'Caixa de hidrocor'],
      [2, 'Lápis'],
      [2, 'Borrachas'],
      [2, 'Apontadores'],
      [4, 'Rolos de durex colorido'],
      [1, 'Rolo de fita durex grosso'],
      [1, 'Rolo de durex fina'],
      [1, 'Rolo de linha de nylon'],
      [1, 'Pacote de papel fotográfico'],
      [1, 'Brinquedo educativo', 'de acordo com a idade'],
      [1, 'Livro educativo', 'de acordo com a idade'],
      [1, 'Rolinho de pintura'],
      [1, 'Pincel artístico achatado', 'nº 16 e 18'],
      [1, 'Pasta com alça A4', 'amarelo'],
    ],
  });

  seedListaMaterial({
    nome: 'Lista de Materiais de Uso Individualizado Integral (rascunho)',
    tipo: 'individual',
    escopo: 'geral',
    observacoes: '⚠️ Lista transcrita de foto por IA — revise todos os itens antes de ativar. ' +
      'Do Jardim I ao Jardim IV. Importante: todo material deve ser identificado com nome e turma da criança.',
    itens: [
      [1, 'Shampoo'],
      [1, 'Condicionador'],
      [1, 'Creme de cabelo', 'se necessário'],
      [1, 'Sabonete líquido', 'não aceitamos em barra'],
      [1, 'Creme dental'],
      [1, 'Escova de dente'],
      [1, 'Porta escova de dente e creme dental', 'adquirir na escola'],
      [1, 'Creme para assadura ou talco'],
      [1, 'Lenço umedecido'],
      [25, 'Fraldas descartáveis'],
      [1, 'Repelente'],
      [1, 'Pente ou escova de cabelo'],
      [1, 'Prendedor de cabelo, xuxinha'],
      [2, 'Mudas de roupa, mais uniforme'],
      [1, 'Saco para roupa limpa e para roupa suja'],
      [1, 'Toalha de banho infantil', 'adquirir na escola'],
      [1, 'Toalha de mão', 'adquirir na escola'],
      [1, 'Garrafinha para água de 300ml'],
    ],
  });

  // ── Usuário master ──────────────────────────────────────────
  const login = process.env.MASTER_LOGIN || 'master';
  const SENHA_PADRAO = 'cem@2026';
  const senha = process.env.MASTER_SENHA || SENHA_PADRAO;

  const existe = db.prepare('SELECT id FROM usuarios WHERE perfil_id = ?').get('PERFIL-MASTER');
  if (!existe) {
    // Essa senha padrão está no código-fonte — criar a primeira conta master
    // com ela em produção equivale a publicar a senha do sistema.
    if (senha === SENHA_PADRAO && process.env.NODE_ENV === 'production') {
      throw new Error(
        'MASTER_SENHA não definida (ou usando o valor padrão do código) com NODE_ENV=production. ' +
        'Defina uma senha própria em MASTER_SENHA no .env da VPS antes de subir o servidor.'
      );
    }
    db.prepare(`
      INSERT INTO usuarios (nome, login, senha_hash, tipo, perfil_id, ativo, precisa_trocar_senha, criado_em)
      VALUES (?, ?, ?, 'funcionario', 'PERFIL-MASTER', 1, 1, ?)`)
      .run('Administrador CEM', login, bcrypt.hashSync(senha, 10), agora());

    console.log(`✅ Usuário master criado — login: ${login} | senha: ${senha}`);
    console.log('   Troque a senha no primeiro acesso.');
  }

  // Alerta em TODA subida (não só na criação): pega o caso de uma conta
  // Master que já existia com a senha padrão antes desta checagem existir.
  const masters = db.prepare(
    `SELECT id, login, senha_hash FROM usuarios WHERE perfil_id = 'PERFIL-MASTER' AND ativo = 1`
  ).all();
  for (const m of masters) {
    if (bcrypt.compareSync(SENHA_PADRAO, m.senha_hash)) {
      console.error('');
      console.error('  🚨🚨🚨  ALERTA DE SEGURANÇA  🚨🚨🚨');
      console.error(`  A conta Master "${m.login}" está usando a senha padrão do código-fonte.`);
      console.error('  Troque agora: entre no sistema e use "Trocar senha" no menu lateral.');
      console.error('');
    }
  }

  return { perfis: PERFIS.length };
}

// Execução direta: node src/seed.js
if (require.main === module) {
  const r = seed();
  console.log(`✅ Seed concluído (${r.perfis} perfis).`);
}

module.exports = { seed, PERFIS };

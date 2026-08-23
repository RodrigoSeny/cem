// ═══════════════════════════════════════════════════════════════
// CEM — Rotinas de sistema
//
// Hoje só tem a limpeza total de dados — um botão de "reset de
// fábrica" pensado para o período de teste beta, antes de o
// sistema entrar em produção de verdade com dados reais das
// famílias. Some (e o servidor passa a recusar) assim que a
// variável BETA sair do .env.
// ═══════════════════════════════════════════════════════════════
const path = require('path');
const fs = require('fs');
const express = require('express');
const { db, log } = require('../db');
const { rota } = require('../util');
const { requireMaster } = require('../auth');

const router = express.Router();

const BETA = String(process.env.BETA || '').toLowerCase() === 'true';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');

// Tudo que é dado operacional. NÃO entram aqui: escola (configuração da
// instituição), perfis (definição dos acessos) e o próprio usuário Master.
const TABELAS_OPERACIONAIS = [
  'ofx_vinculos', 'ofx_transacoes', 'importacoes_ofx', 'contas_bancarias',
  'cobranca_alunos', 'cobrancas', 'despesas', 'centros_custo',
  'mensalidade_itens', 'pagamentos', 'mensalidades', 'contratos_financeiros', 'planos_pagamento',
  'mensagem_destinatarios', 'mensagens',
  'ocorrencia_ciencias', 'ocorrencias',
  'anexos',
  'aluno_autorizados_retirada', 'aluno_responsaveis',
  'alunos', 'turmas',
  'responsaveis', 'funcionarios',
  'logs',
];

// ── GET /api/sistema/beta — liga o aviso ">>> BETA <<<" no menu ──
router.get('/beta', rota((req, res) => res.json({ beta: BETA })));

// ── POST /api/sistema/limpar-tudo — apaga todos os dados operacionais ──
router.post('/limpar-tudo', requireMaster, rota((req, res) => {
  if (!BETA) return res.status(403).json({ error: 'Disponível apenas durante o teste beta.' });

  const confirmacao = String(req.body.confirmacao || '').trim();
  if (confirmacao !== 'APAGAR TUDO') {
    return res.status(400).json({ error: 'Digite exatamente "APAGAR TUDO" para confirmar.' });
  }

  const nomeMaster = req.usuario.nome;

  const executar = db.transaction(() => {
    for (const tabela of TABELAS_OPERACIONAIS) db.prepare(`DELETE FROM ${tabela}`).run();
    // Mantém só o(s) acesso(s) Master — todo o resto de usuarios é operacional.
    // "IS NOT" (em vez de "!=") é necessário: com perfil_id NULL (usuário sem
    // perfil), "!= 'PERFIL-MASTER'" dá NULL (não true) e a linha escaparia do DELETE.
    db.prepare(`DELETE FROM usuarios WHERE perfil_id IS NOT 'PERFIL-MASTER'`).run();
  });

  db.pragma('foreign_keys = OFF');
  try { executar(); } finally { db.pragma('foreign_keys = ON'); }

  // Os arquivos anexados (registro no banco já apagado acima) saem do disco.
  try {
    for (const arquivo of fs.readdirSync(UPLOAD_DIR)) {
      fs.unlinkSync(path.join(UPLOAD_DIR, arquivo));
    }
  } catch {}

  // Único registro que sobra no log: a própria limpeza.
  log(req, 'limpar-sistema', 'sistema', 0, `Limpeza total (beta) por ${nomeMaster}`);
  console.log(`⚠️  Sistema zerado (beta) por ${nomeMaster} — todos os dados operacionais foram apagados.`);

  res.json({ ok: true });
}));

module.exports = router;

// ═══════════════════════════════════════════════════════════════
// CEM — Dados institucionais da escola
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const { db, log, agora } = require('../db');
const { filtrarCampos, montarUpdate, soNumeros, rota } = require('../util');

const router = express.Router();

const CAMPOS = [
  'nome_fantasia', 'razao_social', 'cnpj', 'inep', 'email', 'telefone', 'whatsapp',
  'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado',
  'diretor', 'logo_url', 'ano_letivo',
];

function carregar() {
  return db.prepare('SELECT * FROM escola WHERE id = 1').get() || null;
}

// ── GET /api/escola/publica — cabeçalho do login (sem token) ──
router.get('/publica', rota((req, res) => {
  const e = carregar();
  res.json({
    nome_fantasia: e?.nome_fantasia || 'Centro Educacional Milezi',
    logo_url: e?.logo_url || '/img/LogoMilezi.jpg',
    ano_letivo: e?.ano_letivo || new Date().getFullYear(),
    // Contatos institucionais — exibidos no app para os responsáveis
    telefone: e?.telefone || null,
    whatsapp: e?.whatsapp || null,
    email: e?.email || null,
  });
}));

// ── GET /api/escola ───────────────────────────────────────────
router.get('/', rota((req, res) => res.json(carregar())));

// ── PUT /api/escola ───────────────────────────────────────────
router.put('/', rota((req, res) => {
  const d = filtrarCampos(req.body, CAMPOS);
  if ('cnpj' in d) d.cnpj = soNumeros(d.cnpj);
  if ('cep' in d) d.cep = soNumeros(d.cep);
  if ('ano_letivo' in d) d.ano_letivo = d.ano_letivo ? Number(d.ano_letivo) : null;
  d.atualizado_em = agora();

  const { sql, valores } = montarUpdate('escola', d, 1);
  db.prepare(sql).run(...valores);

  log(req, 'atualizar', 'escola', 1, null);
  res.json({ ok: true });
}));

module.exports = router;

// ═══════════════════════════════════════════════════════════════
// CEM — Dados institucionais da escola
// ═══════════════════════════════════════════════════════════════
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
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

// ── Logotipo — arquivo público em /img (login e menu não têm token) ──
const LOGO_DIR = path.join(__dirname, '..', '..', 'img', 'escola');
if (!fs.existsSync(LOGO_DIR)) fs.mkdirSync(LOGO_DIR, { recursive: true });

const TIPOS_LOGO = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
const uploadLogo = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, LOGO_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 10) || '.png';
      cb(null, `logo_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },   // 5 MB
  fileFilter: (req, file, cb) => {
    if (TIPOS_LOGO.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Formato não aceito. Envie PNG, JPG, WEBP ou SVG.'));
  },
});

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

// ── POST /api/escola/logo — troca o logotipo ──────────────────
router.post('/logo', uploadLogo.single('logo'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Selecione um arquivo.' });

    const antigo = carregar()?.logo_url;
    const logo_url = `/img/escola/${req.file.filename}`;

    db.prepare('UPDATE escola SET logo_url = ?, atualizado_em = ? WHERE id = 1').run(logo_url, agora());
    log(req, 'atualizar', 'escola', 1, 'logotipo');

    // Remove o arquivo anterior, se também tiver sido um upload por aqui
    // (não mexe no LogoMilezi.jpg padrão nem em URLs externas).
    if (antigo && antigo.startsWith('/img/escola/')) {
      fs.unlink(path.join(__dirname, '..', '..', antigo), () => {});
    }

    res.json({ logo_url });
  } catch (e) {
    if (req.file) fs.unlink(path.join(LOGO_DIR, req.file.filename), () => {});
    console.error('[escola/logo]', e);
    res.status(500).json({ error: 'Erro ao salvar o logotipo.' });
  }
});

module.exports = router;

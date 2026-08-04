// ═══════════════════════════════════════════════════════════════
// CEM — Anexos (documentos digitalizados e fotos)
//
// Os arquivos ficam em ./uploads, fora de /public: só saem por esta
// rota, que exige token. O banco guarda apenas os metadados.
// ═══════════════════════════════════════════════════════════════
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { db, log, agora } = require('../db');
const { rota } = require('../util');
const { temPagina } = require('../auth');

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ENTIDADES = ['aluno', 'responsavel', 'funcionario', 'ocorrencia'];

// Categorias sugeridas na interface (o campo aceita texto livre)
const CATEGORIAS = [
  { id: 'plano_saude',   nome: 'Carteira do plano de saúde' },
  { id: 'vacinacao',     nome: 'Carteira de vacinação' },
  { id: 'atestado',      nome: 'Atestado médico' },
  { id: 'laudo',         nome: 'Laudo / relatório' },
  { id: 'autorizacao',   nome: 'Autorização assinada' },
  { id: 'certidao',      nome: 'Certidão de nascimento' },
  { id: 'identidade',    nome: 'RG / CPF' },
  { id: 'residencia',    nome: 'Comprovante de residência' },
  { id: 'contrato',      nome: 'Contrato' },
  { id: 'foto',          nome: 'Foto' },
  { id: 'documento',     nome: 'Outro documento' },
];

const TIPOS_ACEITOS = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif',
  'application/pdf',
];

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
      cb(null, `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 12 * 1024 * 1024 },   // 12 MB por arquivo
  fileFilter: (req, file, cb) => {
    if (TIPOS_ACEITOS.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Formato não aceito. Envie imagem (JPG, PNG, WEBP) ou PDF.'));
  },
});

// ── GET /api/anexos/categorias ────────────────────────────────
router.get('/categorias', rota((req, res) => res.json(CATEGORIAS)));

// ── GET /api/anexos?entidade=aluno&entidade_id=1 ──────────────
router.get('/', rota((req, res) => {
  const { entidade, entidade_id } = req.query;
  if (!ENTIDADES.includes(entidade) || !entidade_id) {
    return res.status(400).json({ error: 'Informe a entidade e o registro.' });
  }
  res.json(db.prepare(`
    SELECT id, entidade, entidade_id, categoria, descricao, nome_original,
           mime, tamanho, criado_em
      FROM anexos
     WHERE entidade = ? AND entidade_id = ?
     ORDER BY criado_em DESC`).all(entidade, Number(entidade_id)));
}));

// ── GET /api/anexos/:id/arquivo — download / visualização ─────
router.get('/:id/arquivo', rota((req, res) => {
  const a = db.prepare('SELECT * FROM anexos WHERE id = ?').get(Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'Anexo não encontrado.' });

  // Responsável só baixa anexo de aluno vinculado a ele
  if (req.usuario.tipo === 'responsavel' && !podeResponsavelVer(req.usuario, a)) {
    return res.status(403).json({ error: 'Sem acesso a este arquivo.' });
  }

  const caminho = path.join(UPLOAD_DIR, a.nome_arquivo);
  if (!fs.existsSync(caminho)) return res.status(404).json({ error: 'Arquivo não encontrado no servidor.' });

  res.setHeader('Content-Type', a.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(a.nome_original)}"`);
  fs.createReadStream(caminho).pipe(res);
}));

/** Anexo pertence a um aluno (ou ocorrência de aluno) do responsável? */
function podeResponsavelVer(usuario, anexo) {
  const meus = db.prepare('SELECT aluno_id FROM aluno_responsaveis WHERE responsavel_id = ?')
    .all(usuario.responsavel_id).map(r => r.aluno_id);

  if (anexo.entidade === 'aluno') return meus.includes(anexo.entidade_id);
  if (anexo.entidade === 'ocorrencia') {
    const o = db.prepare('SELECT aluno_id, visivel_responsavel FROM ocorrencias WHERE id = ?').get(anexo.entidade_id);
    return !!o && o.visivel_responsavel === 1 && meus.includes(o.aluno_id);
  }
  return false;
}

// ── POST /api/anexos ──────────────────────────────────────────
router.post('/', upload.single('arquivo'), (req, res) => {
  try {
    const { entidade, entidade_id, categoria, descricao } = req.body;

    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    if (!ENTIDADES.includes(entidade) || !entidade_id) {
      fs.unlink(path.join(UPLOAD_DIR, req.file.filename), () => {});
      return res.status(400).json({ error: 'Informe a entidade e o registro.' });
    }

    const info = db.prepare(`
      INSERT INTO anexos (entidade, entidade_id, categoria, descricao, nome_original, nome_arquivo, mime, tamanho, criado_por, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        entidade, Number(entidade_id),
        categoria || 'documento',
        descricao || null,
        req.file.originalname,
        req.file.filename,
        req.file.mimetype,
        req.file.size,
        req.usuario?.id ?? null,
        agora()
      );

    log(req, 'anexar', entidade, Number(entidade_id), `${categoria || 'documento'}: ${req.file.originalname}`);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    if (req.file) fs.unlink(path.join(UPLOAD_DIR, req.file.filename), () => {});
    console.error('[anexos]', e);
    res.status(500).json({ error: 'Erro ao salvar o anexo.' });
  }
});

// ── DELETE /api/anexos/:id ────────────────────────────────────
router.delete('/:id', rota((req, res) => {
  const a = db.prepare('SELECT * FROM anexos WHERE id = ?').get(Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'Anexo não encontrado.' });

  db.prepare('DELETE FROM anexos WHERE id = ?').run(a.id);
  fs.unlink(path.join(UPLOAD_DIR, a.nome_arquivo), () => {});

  log(req, 'excluir-anexo', a.entidade, a.entidade_id, a.nome_original);
  res.json({ ok: true });
}));

// Erros do multer (tamanho, formato) viram mensagem de usuário
router.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Arquivo muito grande. O limite é 12 MB.' });
  }
  if (err) return res.status(400).json({ error: err.message || 'Erro no envio do arquivo.' });
  next();
});

module.exports = { router, UPLOAD_DIR, CATEGORIAS };

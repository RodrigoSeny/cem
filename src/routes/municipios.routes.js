// ═══════════════════════════════════════════════════════════════
// CEM — Municípios brasileiros (naturalidade)
//
// O navegador não fala direto com o IBGE (CORS/rede da escola),
// então o servidor busca uma vez, grava em dados/municipios.json
// e passa a servir do disco. Se o IBGE estiver inacessível, a
// rota devolve lista vazia e o campo continua aceitando digitação.
// ═══════════════════════════════════════════════════════════════
const path = require('path');
const fs = require('fs');
const express = require('express');
const { rota } = require('../util');

const router = express.Router();

const ARQUIVO = path.join(__dirname, '..', '..', 'dados', 'municipios.json');
const URL_IBGE = 'https://servicosdados.ibge.gov.br/api/v1/localidades/municipios';

let memoria = null;
let buscando = null;

/** Extrai a sigla da UF nas várias formas que o IBGE devolve. */
function ufDoMunicipio(m) {
  return m?.microrregiao?.mesorregiao?.UF?.sigla
      || m?.['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla
      || m?.UF?.sigla
      || '';
}

function lerDoDisco() {
  try {
    if (!fs.existsSync(ARQUIVO)) return null;
    const dados = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    return Array.isArray(dados) && dados.length ? dados : null;
  } catch { return null; }
}

async function baixarDoIbge() {
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), 15000);
  try {
    const r = await fetch(URL_IBGE, { signal: controle.signal });
    if (!r.ok) throw new Error('IBGE respondeu ' + r.status);

    const dados = (await r.json())
      .map(m => ({ n: m.nome, uf: ufDoMunicipio(m) }))
      .filter(m => m.n && m.uf);

    if (dados.length < 1000) throw new Error('Lista do IBGE veio incompleta.');

    try { fs.writeFileSync(ARQUIVO, JSON.stringify(dados), 'utf8'); } catch {}
    return dados;
  } finally {
    clearTimeout(limite);
  }
}

/** Lista de municípios: memória → disco → IBGE. */
async function obter() {
  if (memoria) return memoria;

  const doDisco = lerDoDisco();
  if (doDisco) { memoria = doDisco; return memoria; }

  // Uma única busca simultânea, mesmo com vários pedidos ao mesmo tempo
  if (!buscando) {
    buscando = baixarDoIbge()
      .then(d => { memoria = d; return d; })
      .catch(e => { console.warn('[municipios] IBGE indisponível:', e.message); return []; })
      .finally(() => { buscando = null; });
  }
  return buscando;
}

// ── GET /api/municipios ───────────────────────────────────────
router.get('/', rota(async (req, res) => {
  const lista = await obter();
  res.json({
    total: lista.length,
    disponivel: lista.length > 0,
    municipios: lista,
  });
}));

// ── POST /api/municipios/atualizar — força nova busca no IBGE ──
router.post('/atualizar', rota(async (req, res) => {
  try {
    const dados = await baixarDoIbge();
    memoria = dados;
    res.json({ ok: true, total: dados.length });
  } catch (e) {
    res.status(503).json({ error: 'Não foi possível acessar o IBGE agora. ' + e.message });
  }
}));

module.exports = router;

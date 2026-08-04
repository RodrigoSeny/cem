// ═══════════════════════════════════════════════════════════════
// CEM — Municípios brasileiros (naturalidade)
//
// A lista vem embutida no projeto (src/municipios.json, 5.590
// municípios com UF). Não depende de rede: nem o IBGE nem a VPS
// precisam estar acessíveis para o campo funcionar.
//
// Origem dos dados: IBGE, via pacote brazilian-cities (MIT).
// Para atualizar quando houver acesso ao IBGE:
//   POST /api/municipios/atualizar
// que grava dados/municipios.json e passa a ter prioridade.
// ═══════════════════════════════════════════════════════════════
const path = require('path');
const fs = require('fs');
const express = require('express');
const { rota } = require('../util');

const router = express.Router();

const EMBUTIDO = path.join(__dirname, '..', 'municipios.json');
const ATUALIZADO = path.join(__dirname, '..', '..', 'dados', 'municipios.json');
const URL_IBGE = 'https://servicosdados.ibge.gov.br/api/v1/localidades/municipios';

let memoria = null;
let origem = null;

/** Extrai a sigla da UF nas várias formas que o IBGE devolve. */
function ufDoMunicipio(m) {
  return m?.microrregiao?.mesorregiao?.UF?.sigla
      || m?.['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla
      || m?.UF?.sigla
      || '';
}

function lerArquivo(caminho) {
  try {
    if (!fs.existsSync(caminho)) return null;
    const dados = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    return Array.isArray(dados) && dados.length ? dados : null;
  } catch { return null; }
}

/** Lista de municípios: memória → arquivo atualizado → embutido. */
function obter() {
  if (memoria) return memoria;

  const atualizado = lerArquivo(ATUALIZADO);
  if (atualizado) { memoria = atualizado; origem = 'ibge'; return memoria; }

  const embutido = lerArquivo(EMBUTIDO);
  if (embutido) { memoria = embutido; origem = 'embutido'; return memoria; }

  memoria = [];
  origem = 'indisponivel';
  return memoria;
}

async function baixarDoIbge() {
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), 20000);
  try {
    const r = await fetch(URL_IBGE, { signal: controle.signal });
    if (!r.ok) throw new Error('IBGE respondeu ' + r.status);

    const dados = (await r.json())
      .map(m => ({ n: m.nome, uf: ufDoMunicipio(m) }))
      .filter(m => m.n && m.uf);

    if (dados.length < 1000) throw new Error('Lista do IBGE veio incompleta.');

    fs.mkdirSync(path.dirname(ATUALIZADO), { recursive: true });
    fs.writeFileSync(ATUALIZADO, JSON.stringify(dados), 'utf8');
    return dados;
  } finally {
    clearTimeout(limite);
  }
}

// ── GET /api/municipios ───────────────────────────────────────
router.get('/', rota((req, res) => {
  const lista = obter();
  res.json({
    total: lista.length,
    disponivel: lista.length > 0,
    origem,
    municipios: lista,
  });
}));

// ── POST /api/municipios/atualizar — busca a versão do IBGE ───
router.post('/atualizar', rota(async (req, res) => {
  try {
    const dados = await baixarDoIbge();
    memoria = dados;
    origem = 'ibge';
    res.json({ ok: true, total: dados.length });
  } catch (e) {
    res.status(503).json({
      error: 'Não foi possível acessar o IBGE agora. A lista embutida continua em uso. ' + e.message,
    });
  }
}));

module.exports = router;

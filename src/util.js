// ═══════════════════════════════════════════════════════════════
// CEM — Utilitários compartilhados pelas rotas
// ═══════════════════════════════════════════════════════════════

/** Mantém apenas os campos permitidos e normaliza vazio → null. */
function filtrarCampos(body, permitidos) {
  const out = {};
  for (const campo of permitidos) {
    if (!(campo in body)) continue;
    let v = body[campo];
    if (typeof v === 'string') {
      v = v.trim();
      if (v === '') v = null;
    }
    if (v === undefined) v = null;
    out[campo] = v;
  }
  return out;
}

/** Monta INSERT a partir de um objeto de campos já filtrado. */
function montarInsert(tabela, dados) {
  const cols = Object.keys(dados);
  const sql = `INSERT INTO ${tabela} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
  return { sql, valores: cols.map(c => dados[c]) };
}

/** Monta UPDATE ... WHERE id = ? a partir de um objeto de campos. */
function montarUpdate(tabela, dados, id) {
  const cols = Object.keys(dados);
  const sql = `UPDATE ${tabela} SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`;
  return { sql, valores: [...cols.map(c => dados[c]), id] };
}

/** Só dígitos (CPF, CEP, telefone). */
function soNumeros(v) {
  return v ? String(v).replace(/\D/g, '') : null;
}

/** Booleano vindo do front (checkbox, string, número) → 0/1. */
function bool01(v) {
  return (v === true || v === 1 || v === '1' || v === 'true' || v === 'on') ? 1 : 0;
}

/** Dígitos verificadores do CPF (algoritmo oficial da Receita Federal). */
function cpfValido(cpf) {
  const v = String(cpf || '').replace(/\D/g, '');
  if (v.length !== 11 || /^(\d)\1{10}$/.test(v)) return false;

  const digito = tamanho => {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(v[i]) * (tamanho + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(v[9]) && digito(10) === Number(v[10]);
}

/** Traduz erros de constraint do SQLite em mensagens de usuário. */
function tratarErro(e, res, contexto = {}) {
  const msg = String(e && e.message || e);
  if (msg.includes('UNIQUE constraint failed')) {
    const campo = msg.split('UNIQUE constraint failed:')[1]?.trim() || '';
    const amigavel = contexto[campo] || `Já existe um registro com este valor (${campo}).`;
    return res.status(409).json({ error: amigavel });
  }
  if (msg.includes('CHECK constraint failed')) {
    return res.status(400).json({ error: 'Valor inválido para um dos campos.' });
  }
  if (msg.includes('FOREIGN KEY constraint failed')) {
    return res.status(409).json({ error: 'Existe vínculo com outro cadastro. Remova o vínculo antes de excluir.' });
  }
  console.error('[erro]', e);
  return res.status(500).json({ error: 'Erro interno ao processar a solicitação.' });
}

/** Envolve o handler capturando exceções — inclusive de funções async. */
function rota(handler, contexto = {}) {
  return (req, res) => {
    try {
      const r = handler(req, res);
      if (r && typeof r.then === 'function') {
        r.catch(e => tratarErro(e, res, contexto));
      }
    } catch (e) {
      tratarErro(e, res, contexto);
    }
  };
}

/** Idade em anos a partir de 'YYYY-MM-DD'. */
function idade(dataNasc) {
  if (!dataNasc) return null;
  const d = new Date(dataNasc + 'T00:00:00');
  if (isNaN(d)) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - d.getFullYear();
  const m = hoje.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) anos--;
  return anos;
}

module.exports = {
  filtrarCampos, montarInsert, montarUpdate,
  soNumeros, bool01, cpfValido, tratarErro, rota, idade,
};

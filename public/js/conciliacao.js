/* ══════════════════════════════════════════════════════════════
   CEM — Conciliação Bancária
   ══════════════════════════════════════════════════════════════ */

const Conciliacao = {
  transacoes: [],
  importacaoId: null,
  contaId: null,
  transacaoAtual: null,  // usada nos modais

  // ── Entrada pela página de contas ────────────────────────────
  async abrirComConta(contaId) {
    this.contaId = contaId;
    this.importacaoId = null;
    await this._carregarSeletores();
    document.getElementById('concilConta').value = contaId;
    await this._carregarImportacoesDaConta(contaId);
  },

  async abrirComImportacao(importacaoId, contaId) {
    this.contaId = contaId;
    this.importacaoId = importacaoId;
    await this._carregarSeletores();
    document.getElementById('concilConta').value = contaId;
    await this._carregarImportacoesDaConta(contaId);
    document.getElementById('concilImportacao').value = importacaoId;
    await this.carregar();
  },

  async _carregarSeletores() {
    try {
      const contas = await Api.get('/api/banco/contas');
      const sel = document.getElementById('concilConta');
      sel.innerHTML = '<option value="">Selecione…</option>' +
        contas.map(c => `<option value="${c.id}">${escapar(c.nome)} — ${escapar(c.banco)}</option>`).join('');
    } catch {}
  },

  async trocarConta() {
    const contaId = document.getElementById('concilConta').value;
    this.contaId = contaId || null;
    this.importacaoId = null;
    document.getElementById('concilImportacao').innerHTML = '<option value="">Selecione…</option>';
    document.getElementById('concilLista').innerHTML = '';
    document.getElementById('concilResumo').classList.add('oculto');
    if (contaId) await this._carregarImportacoesDaConta(contaId);
  },

  async _carregarImportacoesDaConta(contaId) {
    try {
      const lista = await Api.get('/api/banco/importacoes', { conta_id: contaId });
      const sel = document.getElementById('concilImportacao');
      sel.innerHTML = '<option value="">Selecione…</option>' +
        lista.map(i => {
          const periodo = i.periodo_inicio ? ` (${fmtData(i.periodo_inicio)} a ${fmtData(i.periodo_fim)})` : '';
          const pend = i.pendentes ? ` · ${i.pendentes} pendente(s)` : '';
          return `<option value="${i.id}">${escapar(i.nome_arquivo || 'Extrato')}${periodo}${pend}</option>`;
        }).join('');
    } catch {}
  },

  // ── Carregamento principal ────────────────────────────────────
  async carregar() {
    this.importacaoId = document.getElementById('concilImportacao').value || null;
    if (!this.importacaoId) {
      document.getElementById('concilLista').innerHTML =
        '<div class="vazio">Selecione uma importação para conciliar.</div>';
      document.getElementById('concilResumo').classList.add('oculto');
      return;
    }

    const status = document.getElementById('concilFiltroStatus').value;
    document.getElementById('concilLista').innerHTML = '<div class="vazio"><span class="spinner"></span></div>';

    try {
      const [transacoes, resumoData] = await Promise.all([
        Api.get('/api/conciliacao/transacoes', {
          importacao_id: this.importacaoId,
          ...(status ? { status } : {}),
        }),
        Api.get(`/api/conciliacao/resumo/${this.importacaoId}`),
      ]);

      this.transacoes = transacoes;
      this._renderResumo(resumoData);
      this._renderLista(transacoes);
    } catch (e) {
      document.getElementById('concilLista').innerHTML = `<div class="vazio">Erro: ${escapar(e.message)}</div>`;
      toastErro(e.message);
    }
  },

  // ── Resumo da importação ──────────────────────────────────────
  _renderResumo(data) {
    const el = document.getElementById('concilResumo');
    const s = data.stats;
    const i = data.importacao;
    const pct = s.total ? Math.round(((s.conciliados + s.descartados) / s.total) * 100) : 0;

    el.innerHTML = `
      <div class="card card-p" style="padding:14px 18px">
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <div style="font-weight:700;font-size:14px">${escapar(i.conta_nome || '—')} — ${escapar(i.banco || '')}</div>
            <div style="font-size:12px;color:var(--txt2)">${escapar(i.nome_arquivo || '')} · ${fmtData(i.periodo_inicio)} a ${fmtData(i.periodo_fim)}</div>
          </div>
          <div class="stat-grid" style="gap:14px;grid-template-columns:repeat(4,auto)">
            ${this._statBox('Total', s.total, '')}
            ${this._statBox('Pendentes', s.pendentes, s.pendentes ? '#d97706' : '')}
            ${this._statBox('Conciliados', s.conciliados, '#16a34a')}
            ${this._statBox('Descartados', s.descartados, '')}
          </div>
          <div style="text-align:right;min-width:110px">
            <div style="font-size:11px;color:var(--txt3);text-transform:uppercase">Progresso</div>
            <div style="font-size:22px;font-weight:800;color:${pct === 100 ? '#16a34a' : 'inherit'}">${pct}%</div>
          </div>
        </div>
        <div style="display:flex;gap:20px;margin-top:12px;flex-wrap:wrap;font-size:12.5px">
          <span>Entradas: <strong style="color:#16a34a">${fmtMoeda(s.total_entradas)}</strong>
            (conciliado: ${fmtMoeda(s.entradas_conciliadas)})</span>
          <span>Saídas: <strong style="color:#dc2626">${fmtMoeda(s.total_saidas)}</strong>
            (conciliado: ${fmtMoeda(s.saidas_conciliadas)})</span>
        </div>
      </div>`;
    el.classList.remove('oculto');
  },

  _statBox(label, val, cor) {
    return `<div style="text-align:center">
      <div style="font-size:10.5px;color:var(--txt3);text-transform:uppercase">${label}</div>
      <div style="font-size:19px;font-weight:700;${cor ? 'color:' + cor : ''}">${val}</div>
    </div>`;
  },

  // ── Renderiza lista de transações ─────────────────────────────
  _renderLista(lista) {
    const el = document.getElementById('concilLista');
    if (!lista.length) {
      el.innerHTML = '<div class="vazio">Nenhuma transação neste filtro.</div>';
      return;
    }
    el.innerHTML = lista.map(t => this._renderCard(t)).join('');
  },

  _renderCard(t) {
    const credit  = t.tipo === 'CREDIT';
    const valorCor = credit ? '#16a34a' : '#dc2626';
    const sinal    = credit ? '+' : '−';
    const dataFmt  = fmtData(t.data_lancamento);
    const desc     = escapar(t.descricao || t.nome_beneficiario || '—');
    const conta    = t.banco ? `${escapar(t.banco)}${t.agencia ? ' · Ag: ' + escapar(t.agencia) : ''}${t.numero_conta ? ' · CC: ' + escapar(t.numero_conta) : ''}` : '';

    let corpo = '';
    let acoes = '';

    if (t.status === 'conciliado') {
      const links = (t.vinculos || []).map(v => {
        if (v.entidade === 'pagamento') return `Pagamento #${v.entidade_id} — ${fmtMoeda(v.valor_vinculado)}`;
        return `Despesa #${v.entidade_id} — ${fmtMoeda(v.valor_vinculado)}`;
      }).join('<br>');
      corpo = `<div class="concil-match ok">
        <span style="color:#16a34a;font-size:17px">✓</span>
        <div style="flex:1;font-size:12.5px">${links || 'Conciliado'}</div>
      </div>`;
      acoes = `<button class="btn btn-ghost btn-sm" onclick="Conciliacao.desvincular(${t.id})">↩ Desvincular</button>`;

    } else if (t.status === 'descartado') {
      corpo = `<div class="concil-match descartado">
        <span style="font-size:16px">—</span>
        <span style="font-size:12.5px;color:var(--txt3)">Descartado${t.conciliado_nome ? ' por ' + escapar(t.conciliado_nome) : ''}</span>
      </div>`;
      acoes = `<button class="btn btn-ghost btn-sm" onclick="Conciliacao.restaurar(${t.id})">↺ Restaurar</button>`;

    } else {
      // pendente
      if (t.sugestoes && t.sugestoes.length) {
        const s = t.sugestoes[0];
        const sDesc = credit
          ? `${escapar(s.aluno_nome || '—')} · ${escapar(s.mensalidade_desc || s.competencia || '')} · ${fmtMoeda(s.valor)}`
          : `${escapar(s.descricao || '—')} · ${escapar(s.fornecedor || '')} · ${fmtMoeda(s.valor)}`;
        const vincSugestao = JSON.stringify([{ entidade: credit ? 'pagamento' : 'despesa', entidade_id: s.id, valor_vinculado: s.valor }]).replace(/"/g, '&quot;');
        corpo = `<div class="concil-match sugestao">
          <span style="color:#d97706;font-size:17px">★</span>
          <div style="flex:1;font-size:12.5px">
            <strong>Sugestão:</strong> ${sDesc}
            <span style="color:var(--txt3);margin-left:8px">${fmtData(credit ? s.data_pagamento : s.data_pagamento)}</span>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn btn-green btn-sm" onclick="Conciliacao.aceitar(${t.id}, ${vincSugestao})">Aceitar</button>
            <button class="btn btn-ghost btn-sm" onclick="Conciliacao.abrirManual(${t.id})">Ver outras</button>
          </div>
        </div>`;
      } else {
        corpo = `<div class="concil-match sem-match">
          <span style="font-size:16px">○</span>
          <span style="font-size:12.5px;color:var(--txt3)">Sem correspondência encontrada</span>
        </div>`;
      }
      const labelCriar = credit ? 'Criar recebimento' : 'Criar despesa';
      acoes = `
        <button class="btn btn-ghost btn-sm" onclick="Conciliacao.abrirManual(${t.id})">🔗 Vincular</button>
        <button class="btn btn-ghost btn-sm" onclick="Conciliacao.abrirCriar(${t.id})">＋ ${labelCriar}</button>
        <button class="btn btn-ghost btn-sm perigo" onclick="Conciliacao.descartar(${t.id})">✕ Descartar</button>`;
    }

    return `<div class="concil-card" id="concil-card-${t.id}" data-status="${t.status}">
      <div class="concil-card-head">
        <div class="concil-tipo" style="color:${valorCor};font-weight:700;font-size:11px;text-transform:uppercase">
          ${credit ? '↑ ENTRADA' : '↓ SAÍDA'}
        </div>
        <div class="concil-data">${dataFmt}</div>
        <div class="concil-desc" title="${desc}">${desc}</div>
        <div class="concil-valor" style="color:${valorCor};font-weight:700;white-space:nowrap">
          ${sinal} ${fmtMoeda(t.valor)}
        </div>
      </div>
      ${conta ? `<div class="concil-card-banco">${conta}</div>` : ''}
      ${corpo}
      ${acoes ? `<div class="concil-card-acoes">${acoes}</div>` : ''}
    </div>`;
  },

  // ── Atualiza um card sem recarregar tudo ──────────────────────
  _atualizarCard(transacao) {
    const el = document.getElementById(`concil-card-${transacao.id}`);
    if (!el) return;
    const filtroStatus = document.getElementById('concilFiltroStatus').value;
    if (filtroStatus && transacao.status !== filtroStatus) {
      el.remove();
    } else {
      el.outerHTML = this._renderCard(transacao);
    }
    this._refreshResumo();
  },

  async _refreshResumo() {
    if (!this.importacaoId) return;
    try {
      const resumoData = await Api.get(`/api/conciliacao/resumo/${this.importacaoId}`);
      this._renderResumo(resumoData);
    } catch {}
  },

  // ── Aceitar sugestão automática ───────────────────────────────
  async aceitar(id, vinculos) {
    try {
      await Api.post(`/api/conciliacao/aceitar/${id}`, { vinculos });
      toast('Conciliação aceita.');
      const t = await this._recarregarTransacao(id);
      if (t) this._atualizarCard(t);
    } catch (e) { toastErro(e.message); }
  },

  // ── Desvincular ───────────────────────────────────────────────
  async desvincular(id) {
    if (!confirmar('Remover os vínculos desta transação e volá-la para "pendente"?')) return;
    try {
      await Api.delete(`/api/conciliacao/vinculos/${id}`);
      toast('Vínculo removido.');
      const t = await this._recarregarTransacao(id);
      if (t) this._atualizarCard(t);
    } catch (e) { toastErro(e.message); }
  },

  // ── Descartar / Restaurar ─────────────────────────────────────
  async descartar(id) {
    try {
      await Api.post(`/api/conciliacao/descartar/${id}`, {});
      toast('Transação descartada.');
      const t = await this._recarregarTransacao(id);
      if (t) this._atualizarCard(t);
    } catch (e) { toastErro(e.message); }
  },

  async restaurar(id) {
    try {
      await Api.post(`/api/conciliacao/restaurar/${id}`, {});
      toast('Transação restaurada para pendente.');
      const t = await this._recarregarTransacao(id);
      if (t) this._atualizarCard(t);
    } catch (e) { toastErro(e.message); }
  },

  async _recarregarTransacao(id) {
    try {
      const lista = await Api.get('/api/conciliacao/transacoes', { importacao_id: this.importacaoId });
      return lista.find(t => t.id === id) || null;
    } catch { return null; }
  },

  // ── Modal de vínculo manual ───────────────────────────────────
  abrirManual(transacaoId) {
    const t = this.transacoes.find(x => x.id === transacaoId);
    if (!t) return;
    this.transacaoAtual = t;

    // Cabeçalho da transação
    const credit = t.tipo === 'CREDIT';
    document.getElementById('concilManualSub').textContent =
      credit ? 'Buscar em: Pagamentos recebidos' : 'Buscar em: Despesas pagas';
    document.getElementById('concilManualTransacao').innerHTML = this._cardTransacaoCompacto(t);

    // Pré-preenche datas: ±15 dias da data do extrato
    const dt = t.data_lancamento;
    document.getElementById('concilBuscaDe').value  = deslocarData(dt, -15);
    document.getElementById('concilBuscaAte').value = deslocarData(dt, +15);
    document.getElementById('concilBusca').value    = '';
    document.getElementById('concilManualCorpo').innerHTML = '';
    document.getElementById('concilManualQtd').textContent   = '0';
    document.getElementById('concilManualTotal').textContent = 'R$ 0,00';

    abrirModal('modalConciliarManual');
    this.buscar();
  },

  _cardTransacaoCompacto(t) {
    const credit = t.tipo === 'CREDIT';
    return `<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <div style="font-weight:700;font-size:13px">${escapar(t.descricao || t.nome_beneficiario || '—')}</div>
        <div style="font-size:11.5px;color:var(--txt2)">${fmtData(t.data_lancamento)} · ${escapar(t.banco || '')}</div>
      </div>
      <div style="font-size:18px;font-weight:800;color:${credit ? '#16a34a' : '#dc2626'}">
        ${credit ? '+' : '−'} ${fmtMoeda(t.valor)}
      </div>
    </div>`;
  },

  async buscar() {
    const t = this.transacaoAtual;
    if (!t) return;
    const credit = t.tipo === 'CREDIT';
    const q   = document.getElementById('concilBusca').value;
    const de  = document.getElementById('concilBuscaDe').value;
    const ate = document.getElementById('concilBuscaAte').value;
    const tbody = document.getElementById('concilManualCorpo');
    tbody.innerHTML = '<tr><td colspan="5" class="vazio"><span class="spinner"></span></td></tr>';

    try {
      const rota  = credit ? '/api/conciliacao/buscar-pagamentos' : '/api/conciliacao/buscar-despesas';
      const lista = await Api.get(rota, { q, de, ate });

      if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="vazio">Nenhum registro encontrado.</td></tr>`;
        return;
      }

      tbody.innerHTML = lista.map(r => {
        const descr = credit
          ? `${escapar(r.aluno_nome || '—')} — ${escapar(r.mensalidade_desc || r.competencia || '')}`
          : `${escapar(r.descricao || '—')}${r.fornecedor ? ' · ' + escapar(r.fornecedor) : ''}`;
        const detalhe = credit ? escapar(r.forma || '') : escapar(r.centro_nome || '');
        return `<tr>
          <td style="text-align:center">
            <input type="checkbox" class="concil-check"
                   data-id="${r.id}" data-valor="${r.valor}"
                   data-entidade="${credit ? 'pagamento' : 'despesa'}"
                   onchange="Conciliacao._atualizarSoma()">
          </td>
          <td>${fmtData(r.data_pagamento)}</td>
          <td>${descr}</td>
          <td style="text-align:right;white-space:nowrap">${fmtMoeda(r.valor)}</td>
          <td style="color:var(--txt3);font-size:12px">${detalhe}</td>
        </tr>`;
      }).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" class="vazio">${escapar(e.message)}</td></tr>`;
    }
  },

  _atualizarSoma() {
    const checks = [...document.querySelectorAll('.concil-check:checked')];
    const total  = checks.reduce((s, c) => s + Number(c.dataset.valor), 0);
    document.getElementById('concilManualQtd').textContent   = checks.length;
    document.getElementById('concilManualTotal').textContent = fmtMoeda(total);
  },

  async vincularManual() {
    const t = this.transacaoAtual;
    if (!t) return;
    const checks = [...document.querySelectorAll('.concil-check:checked')];
    if (!checks.length) return toastErro('Selecione ao menos um registro.');

    const vinculos = checks.map(c => ({
      entidade:       c.dataset.entidade,
      entidade_id:    Number(c.dataset.id),
      valor_vinculado: Number(c.dataset.valor),
    }));

    try {
      await Api.post(`/api/conciliacao/vincular/${t.id}`, { vinculos });
      toast('Vínculo realizado.');
      fecharModal('modalConciliarManual');
      const updated = await this._recarregarTransacao(t.id);
      if (updated) {
        const idx = this.transacoes.findIndex(x => x.id === t.id);
        if (idx >= 0) this.transacoes[idx] = updated;
        this._atualizarCard(updated);
      }
    } catch (e) { toastErro(e.message); }
  },

  // ── Modal criar lançamento ────────────────────────────────────
  abrirCriar(transacaoId) {
    const t = this.transacoes.find(x => x.id === transacaoId);
    if (!t) return;
    this.transacaoAtual = t;
    const credit = t.tipo === 'CREDIT';

    document.getElementById('criarLancTitulo').textContent = credit ? 'Criar recebimento' : 'Criar despesa';
    document.getElementById('criarLancTransacao').innerHTML = this._cardTransacaoCompacto(t);

    const hoje = new Date().toISOString().slice(0, 10);
    if (credit) {
      document.getElementById('criarLancForm').innerHTML = `
        <div class="form-hint mb-3">
          Cria um pagamento avulso no sistema e o vincula a esta transação do extrato.
          Se existir uma mensalidade em aberto para o aluno, a baixa fica registrada nela.
        </div>
        <div class="form-grid">
          <div class="form-group col-2">
            <label class="form-label">Aluno</label>
            <select class="form-select" id="criarAluno"><option value="">— Pagamento avulso (sem aluno) —</option></select>
          </div>
          <div class="form-group">
            <label class="form-label">Valor (R$) <span class="req">*</span></label>
            <input class="form-input" id="criarValor" type="number" step="0.01" value="${t.valor}">
          </div>
          <div class="form-group">
            <label class="form-label">Data do pagamento <span class="req">*</span></label>
            <input class="form-input" type="date" id="criarData" value="${t.data_lancamento}">
          </div>
          <div class="form-group">
            <label class="form-label">Forma</label>
            <select class="form-select" id="criarForma">
              <option value="pix">PIX</option><option value="transferencia">Transferência</option>
              <option value="dinheiro">Dinheiro</option><option value="boleto">Boleto</option>
              <option value="cartao_credito">Cartão crédito</option><option value="cartao_debito">Cartão débito</option>
            </select>
          </div>
          <div class="form-group col-2">
            <label class="form-label">Observação</label>
            <input class="form-input" id="criarObs" value="${escapar(t.descricao || '')}">
          </div>
        </div>`;
      // Popula alunos
      Api.get('/api/alunos', { situacao: 'matriculado' }).then(lista => {
        const sel = document.getElementById('criarAluno');
        if (!sel) return;
        sel.innerHTML = '<option value="">— Pagamento avulso (sem aluno) —</option>' +
          lista.map(a => `<option value="${a.id}">${escapar(a.nome)}${a.turma_nome ? ' · ' + escapar(a.turma_nome) : ''}</option>`).join('');
      }).catch(() => {});
    } else {
      document.getElementById('criarLancForm').innerHTML = `
        <div class="form-hint mb-3">
          Cria uma despesa paga no sistema e a vincula a esta transação do extrato.
        </div>
        <div class="form-grid">
          <div class="form-group col-2">
            <label class="form-label">Descrição <span class="req">*</span></label>
            <input class="form-input" id="criarDesc" value="${escapar(t.descricao || '')}">
          </div>
          <div class="form-group col-2">
            <label class="form-label">Fornecedor</label>
            <input class="form-input" id="criarFornecedor" value="${escapar(t.nome_beneficiario || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Valor (R$) <span class="req">*</span></label>
            <input class="form-input" id="criarValor" type="number" step="0.01" value="${t.valor}">
          </div>
          <div class="form-group">
            <label class="form-label">Data do pagamento <span class="req">*</span></label>
            <input class="form-input" type="date" id="criarData" value="${t.data_lancamento}">
          </div>
          <div class="form-group">
            <label class="form-label">Forma</label>
            <select class="form-select" id="criarForma">
              <option value="pix">PIX</option><option value="transferencia">Transferência</option>
              <option value="dinheiro">Dinheiro</option><option value="boleto">Boleto</option>
              <option value="cartao_credito">Cartão crédito</option><option value="cartao_debito">Cartão débito</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Centro de custo</label>
            <select class="form-select" id="criarCentro"><option value="">—</option></select>
          </div>
          <div class="form-group col-2">
            <label class="form-label">Observações</label>
            <input class="form-input" id="criarObs">
          </div>
        </div>`;
      // Popula centros de custo
      Api.get('/api/financeiro/centros-custo').then(lista => {
        const sel = document.getElementById('criarCentro');
        if (!sel) return;
        sel.innerHTML = '<option value="">—</option>' +
          lista.map(c => `<option value="${c.id}">${escapar(c.nome)}</option>`).join('');
      }).catch(() => {});
    }

    abrirModal('modalCriarLancamento');
  },

  async criarLancamento() {
    const t = this.transacaoAtual;
    if (!t) return;
    const credit = t.tipo === 'CREDIT';
    const valor  = Number(document.getElementById('criarValor').value) || 0;
    const data   = document.getElementById('criarData').value;
    const forma  = document.getElementById('criarForma')?.value || 'pix';
    const obs    = document.getElementById('criarObs')?.value || '';

    if (!valor) return toastErro('Informe o valor.');
    if (!data)  return toastErro('Informe a data.');

    try {
      let entidadeId;

      if (credit) {
        // Cria pagamento avulso vinculado a mensalidade (se houver) ou solto
        const alunoId = Number(document.getElementById('criarAluno').value) || null;
        let mensalidadeId = null;

        if (alunoId) {
          const mens = await Api.get('/api/financeiro/mensalidades', {
            aluno_id: alunoId, status: 'aberta',
          }).catch(() => []);
          // Pega a aberta mais próxima da data do extrato
          const prox = mens.sort((a, b) =>
            Math.abs(new Date(a.vencimento) - new Date(t.data_lancamento)) -
            Math.abs(new Date(b.vencimento) - new Date(t.data_lancamento))
          )[0];
          if (prox) mensalidadeId = prox.id;
        }

        if (mensalidadeId) {
          const res = await Api.post(`/api/financeiro/mensalidades/${mensalidadeId}/pagar`, {
            valor, data_pagamento: data, forma, observacoes: obs,
          });
          // Busca o pagamento criado
          const pagamentos = await Api.get('/api/conciliacao/buscar-pagamentos', {
            de: data, ate: data,
          });
          const pg = pagamentos.find(p => Math.abs(p.valor - valor) < 0.01);
          entidadeId = pg ? pg.id : null;
        }

        if (!entidadeId) {
          toastErro('Não foi possível identificar o pagamento criado. Vincule manualmente.');
          fecharModal('modalCriarLancamento');
          return;
        }

        await Api.post(`/api/conciliacao/vincular/${t.id}`, {
          vinculos: [{ entidade: 'pagamento', entidade_id: entidadeId, valor_vinculado: valor }],
        });

      } else {
        const desc      = document.getElementById('criarDesc')?.value || t.descricao || '';
        const fornecedor = document.getElementById('criarFornecedor')?.value || '';
        const centroId  = Number(document.getElementById('criarCentro')?.value) || null;

        if (!desc) return toastErro('Informe a descrição da despesa.');

        const res = await Api.post('/api/financeiro/despesas', {
          descricao: desc, fornecedor, valor, vencimento: data,
          data_pagamento: data, forma, status: 'paga',
          centro_custo_id: centroId, observacoes: obs,
        });

        await Api.post(`/api/conciliacao/vincular/${t.id}`, {
          vinculos: [{ entidade: 'despesa', entidade_id: res.id, valor_vinculado: valor }],
        });
      }

      toast('Lançamento criado e vinculado.');
      fecharModal('modalCriarLancamento');
      const updated = await this._recarregarTransacao(t.id);
      if (updated) {
        const idx = this.transacoes.findIndex(x => x.id === t.id);
        if (idx >= 0) this.transacoes[idx] = updated;
        this._atualizarCard(updated);
      }
    } catch (e) { toastErro(e.message); }
  },
};

// ── CSS inline dos cards ──────────────────────────────────────
(function injetarEstilos() {
  const s = document.createElement('style');
  s.textContent = `
  .concil-card {
    background: var(--card-bg, var(--surface));
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 10px;
  }
  .concil-card[data-status="conciliado"] { border-left: 3px solid #16a34a; }
  .concil-card[data-status="descartado"] { opacity: .65; }
  .concil-card-head {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .concil-tipo  { min-width: 70px; }
  .concil-data  { font-size: 12.5px; color: var(--txt2); white-space: nowrap; }
  .concil-desc  { flex: 1; font-size: 13px; min-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .concil-valor { font-size: 15px; }
  .concil-card-banco { font-size: 11.5px; color: var(--txt3); margin-bottom: 8px; }
  .concil-match {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px; border-radius: 7px; margin-bottom: 8px;
    font-size: 12.5px;
  }
  .concil-match.ok          { background: rgba(22,163,74,.08); }
  .concil-match.sugestao    { background: rgba(217,119,6,.08); }
  .concil-match.sem-match   { background: var(--hover); }
  .concil-match.descartado  { background: var(--hover); }
  .concil-card-acoes { display: flex; gap: 8px; flex-wrap: wrap; }
  `;
  document.head.appendChild(s);
})();

// ── Helpers ───────────────────────────────────────────────────
function fmtMoeda(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function deslocarData(dataStr, dias) {
  const d = new Date(dataStr + 'T00:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

Carregadores['fin-conciliacao'] = () => Conciliacao.carregar();

/* ══════════════════════════════════════════════════════════════
   CEM — Financeiro (planos, contratos, mensalidades, baixas)
   ══════════════════════════════════════════════════════════════ */

const Financeiro = {
  planos: [],
  parcelas: [],
  contratos: [],
  editandoPlano: null,
  editandoContrato: null,
  baixando: null,

  montarFiltros() {
    const sel = document.getElementById('finAluno');
    if (sel.dataset.pronto) return;
    sel.innerHTML = Cache.opcoesAlunos('', 'Todos os alunos');
    document.getElementById('finTurma').innerHTML = Cache.opcoesTurmas('', 'Todas as turmas');
    sel.dataset.pronto = '1';
  },

  // ══════════════════════ RESUMO ══════════════════════════════
  async carregarResumo() {
    const alvo = document.getElementById('finResumo');
    alvo.innerHTML = '<div class="vazio"><span class="spinner"></span></div>';

    let d;
    try { d = await Api.get('/api/financeiro/resumo'); }
    catch (e) {
      alvo.innerHTML = `<div class="vazio"><span class="ico">⚠️</span><div class="titulo">${escapar(e.message)}</div></div>`;
      return;
    }

    alvo.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">Recebido em ${competenciaBR(d.competencia)}</div>
          <div class="stat-val c-green">${moedaBR(d.recebido_mes)}</div>
          <div class="stat-sub">previsto ${moedaBR(d.previsto_mes)}</div>
          <div class="stat-ico">💰</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Em aberto</div>
          <div class="stat-val c-blue">${moedaBR(d.em_aberto)}</div>
          <div class="stat-sub">todas as parcelas não quitadas</div>
          <div class="stat-ico">📋</div>
        </div>
        <div class="stat-card clicavel" onclick="Financeiro.verVencidas()">
          <div class="stat-label">Vencido</div>
          <div class="stat-val c-red">${moedaBR(d.vencido)}</div>
          <div class="stat-sub">${d.qtd_vencidas} parcela(s) em atraso</div>
          <div class="stat-ico">⚠️</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Inadimplentes</div>
          <div class="stat-val c-gold">${d.qtd_inadimplentes}</div>
          <div class="stat-sub">aluno(s) com parcela vencida</div>
          <div class="stat-ico">👥</div>
        </div>
      </div>

      ${d.alunos_sem_contrato.length ? `
        <div class="card card-p mb-5" style="border-color:rgba(242,183,5,.35)">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <span style="font-size:22px">💡</span>
            <div style="flex:1;min-width:220px">
              <div style="font-weight:700;margin-bottom:3px">${d.alunos_sem_contrato.length} aluno(s) sem contrato financeiro</div>
              <div style="font-size:12.5px;color:var(--txt2)">
                ${d.alunos_sem_contrato.slice(0, 6).map(a => escapar(a.nome)).join(', ')}${d.alunos_sem_contrato.length > 6 ? '…' : ''}
              </div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="Financeiro.abrirContrato()">Criar contrato →</button>
          </div>
        </div>` : ''}

      <div class="card">
        <div class="card-head">Inadimplência por aluno</div>
        <div class="card-p">
          ${d.inadimplentes.length ? `
            <div class="tabela-scroll"><table class="tabela">
              <thead><tr><th>Aluno</th><th>Turma</th><th>Responsável financeiro</th><th>Parcelas</th><th>Total devido</th><th class="acoes">Ações</th></tr></thead>
              <tbody>
                ${d.inadimplentes.map(i => `
                  <tr>
                    <td style="font-weight:600">${escapar(i.nome)}</td>
                    <td>${escapar(i.turma_nome || '—')}</td>
                    <td>
                      <div style="font-size:12.5px">${escapar(i.responsavel_nome || '—')}</div>
                      <div style="font-size:11px;color:var(--txt3)">${i.responsavel_contato ? telefoneBR(i.responsavel_contato) : ''}</div>
                    </td>
                    <td><span class="badge badge-red">${i.parcelas}</span></td>
                    <td class="mono c-red" style="font-weight:600">${moedaBR(i.total)}</td>
                    <td class="acoes">
                      <button class="btn-ico" onclick="Financeiro.verExtrato(${i.id})" title="Extrato do aluno">📄</button>
                      ${i.responsavel_contato ? `<button class="btn-ico" onclick="Financeiro.cobrarWhats(${i.id})" title="Cobrar no WhatsApp">💬</button>` : ''}
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table></div>`
            : '<div class="vazio"><span class="ico">✅</span><div class="titulo">Nenhuma parcela vencida</div><div class="sub">Todos os pagamentos estão em dia.</div></div>'}
        </div>
      </div>`;

    this._inadimplentes = d.inadimplentes;
  },

  verVencidas() {
    irPara('fin-recebimentos');
    setTimeout(() => {
      this.abrirAbaRecebimento('mensalidades');
      document.getElementById('finSituacao').value = 'vencida';
      document.getElementById('finCompetencia').value = ''; // vencidas podem ser de qualquer mês
      this.carregarParcelas();
    }, 120);
  },

  /** Abre o WhatsApp com uma mensagem de cobrança pronta. */
  cobrarWhats(alunoId) {
    const i = (this._inadimplentes || []).find(x => x.id === alunoId);
    if (!i || !i.responsavel_contato) return toast('Responsável sem WhatsApp cadastrado.', 'aviso');

    const texto = `Olá, ${nomeCurto(i.responsavel_nome)}! Aqui é do Centro Educacional Milezi. ` +
      `Identificamos ${i.parcelas} parcela(s) em aberto referente(s) ao(à) aluno(a) ${i.nome}, ` +
      `totalizando ${moedaBR(i.total)}. Podemos combinar a regularização? Obrigado!`;

    window.open(`https://wa.me/55${String(i.responsavel_contato).replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`, '_blank');
  },

  // ══════════════════════ MENSALIDADES ════════════════════════
  async carregarParcelas() {
    const corpo = document.getElementById('finCorpo');
    corpo.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:26px"><span class="spinner"></span></td></tr>`;

    const situacao = document.getElementById('finSituacao').value;
    const filtros = {
      aluno_id: document.getElementById('finAluno').value,
      turma_id: document.getElementById('finTurma').value,
      competencia: document.getElementById('finCompetencia').value,
      de: document.getElementById('finDe').value,
      ate: document.getElementById('finAte').value,
    };
    if (situacao === 'vencida') filtros.situacao = 'vencida';
    else if (situacao) filtros.status = situacao;

    try { this.parcelas = await Api.get('/api/financeiro/mensalidades', filtros); }
    catch (e) {
      corpo.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:26px;color:var(--red)">${escapar(e.message)}</td></tr>`;
      return;
    }

    if (!this.parcelas.length) {
      corpo.innerHTML = `<tr><td colspan="9"><div class="vazio">
        <span class="ico">💰</span><div class="titulo">Nenhuma mensalidade encontrada</div>
        <div class="sub">Crie o contrato financeiro do aluno para gerar as parcelas.</div></div></td></tr>`;
      document.getElementById('finTotal').textContent = 'Nenhum registro';
      return;
    }

    corpo.innerHTML = this.parcelas.map(m => `
      <tr class="clicavel" ondblclick="Financeiro.verExtrato(${m.aluno_id})">
        <td>
          <div style="font-weight:600;font-size:12.5px">${escapar(m.aluno_nome)}</div>
          <div style="font-size:11px;color:var(--txt3)">${escapar(m.turma_nome || 'sem turma')}</div>
        </td>
        <td class="mono" style="font-size:12px">${competenciaBR(m.competencia)}</td>
        <td style="font-size:12.5px">${escapar(m.descricao || '—')}</td>
        <td class="mono" style="font-size:12px;white-space:nowrap">
          ${dataBR(m.vencimento)}
          ${m.dias_atraso ? `<br><span class="c-red" style="font-size:11px">${m.dias_atraso} dia(s)</span>` : ''}
        </td>
        <td class="mono">${moedaBR(m.valor_total)}</td>
        <td class="mono c-green">${m.valor_pago ? moedaBR(m.valor_pago) : '—'}</td>
        <td class="mono" style="font-weight:600">${m.saldo > 0 ? moedaBR(m.saldo) : '—'}</td>
        <td>${badgeFinanceiro(m.situacao)}</td>
        <td class="acoes">
          ${m.saldo > 0 && m.status !== 'cancelada'
            ? `<button class="btn-ico" onclick="Financeiro.abrirBaixa(${m.id})" title="Registrar pagamento">✅</button>` : ''}
          <button class="btn-ico" onclick="Financeiro.verExtrato(${m.aluno_id})" title="Extrato do aluno">📄</button>
          ${m.status !== 'paga'
            ? `<button class="btn-ico perigo" onclick="Financeiro.excluirParcela(${m.id})" title="Excluir">🗑️</button>` : ''}
        </td>
      </tr>`).join('');

    const total = this.parcelas.reduce((s, m) => s + m.valor_total, 0);
    const pago = this.parcelas.reduce((s, m) => s + m.valor_pago, 0);
    const saldo = this.parcelas.reduce((s, m) => s + (m.status === 'aberta' ? m.saldo : 0), 0);
    document.getElementById('finTotal').textContent =
      `${this.parcelas.length} parcela(s) · total ${moedaBR(total)} · recebido ${moedaBR(pago)} · em aberto ${moedaBR(saldo)}`;
  },

  // ── Baixa ──────────────────────────────────────────────────
  abrirBaixa(id) {
    const m = this.parcelas.find(x => x.id === id);
    if (!m) return;
    this.baixando = m;

    limparFormulario('formBaixa');
    const form = document.getElementById('formBaixa');
    form.querySelector('[data-campo=valor]').value = m.saldo.toFixed(2).replace('.', ',');
    form.querySelector('[data-campo=data_pagamento]').value = new Date().toISOString().slice(0, 10);
    form.querySelector('[data-campo=forma]').value = 'pix';

    document.getElementById('baixaSub').textContent =
      `${m.aluno_nome} · ${competenciaBR(m.competencia)} · saldo ${moedaBR(m.saldo)}`;
    abrirModal('modalBaixa');
  },

  async confirmarBaixa() {
    const d = lerFormulario('formBaixa');
    const valor = Number(String(d.valor).replace(/\./g, '').replace(',', '.'));
    if (!(valor > 0)) return toastErro('Informe um valor válido.');

    try {
      const r = await Api.post(`/api/financeiro/mensalidades/${this.baixando.id}/pagar`, {
        valor, data_pagamento: d.data_pagamento, forma: d.forma, observacoes: d.observacoes,
      });
      fecharModal('modalBaixa');
      toast(r.quitada ? 'Parcela quitada.' : 'Pagamento parcial registrado.');
      this.carregarParcelas();
    } catch (e) { toastErro(e.message); }
  },

  async excluirParcela(id) {
    const ok = await confirmar('Excluir esta parcela?', { titulo: 'Excluir parcela', textoOk: 'Excluir' });
    if (!ok) return;
    try {
      await Api.excluir('/api/financeiro/mensalidades/' + id);
      toast('Parcela excluída.');
      this.carregarParcelas();
    } catch (e) { toastErro(e.message); }
  },

  // ══════════════════════ PLANOS ══════════════════════════════
  async abrirPlanos() {
    this.editandoPlano = null;
    limparFormulario('formPlano');
    document.getElementById('formPlano').querySelector('[data-campo=num_parcelas]').value = 12;
    document.getElementById('formPlano').querySelector('[data-campo=dia_vencimento]').value = 10;
    await this.listarPlanos();
    abrirModal('modalPlanos');
  },

  async listarPlanos() {
    try { this.planos = await Api.get('/api/financeiro/planos'); }
    catch (e) { return toastErro(e.message); }

    document.getElementById('planosCorpo').innerHTML = this.planos.length ? this.planos.map(p => `
      <tr>
        <td>
          <div style="font-weight:600">${escapar(p.nome)}</div>
          ${p.descricao ? `<div style="font-size:11px;color:var(--txt3)">${escapar(p.descricao)}</div>` : ''}
        </td>
        <td class="mono">${moedaBR(p.valor_mensalidade)}</td>
        <td>${p.num_parcelas}x</td>
        <td>dia ${p.dia_vencimento}</td>
        <td>${p.qtd_contratos ? `<span class="badge badge-blue">${p.qtd_contratos}</span>` : '<span class="c-txt3">—</span>'}</td>
        <td class="acoes">
          <button class="btn-ico" onclick="Financeiro.editarPlano(${p.id})" title="Editar">✏️</button>
          <button class="btn-ico perigo" onclick="Financeiro.excluirPlano(${p.id})" title="Excluir">🗑️</button>
        </td>
      </tr>`).join('')
      : `<tr><td colspan="6"><div class="vazio" style="padding:22px"><span class="ico">⚙️</span>
           <div class="titulo">Nenhum plano cadastrado</div></div></td></tr>`;
  },

  editarPlano(id) {
    const p = this.planos.find(x => x.id === id);
    if (!p) return;
    this.editandoPlano = id;
    preencherFormulario('formPlano', {
      ...p,
      valor_mensalidade: Number(p.valor_mensalidade).toFixed(2).replace('.', ','),
      taxa_matricula: Number(p.taxa_matricula).toFixed(2).replace('.', ','),
    });
    document.getElementById('btnSalvarPlano').textContent = '💾 Salvar alterações';
    document.getElementById('btnCancelarPlano').classList.remove('oculto');
  },

  cancelarEdicaoPlano() {
    this.editandoPlano = null;
    limparFormulario('formPlano');
    document.getElementById('btnSalvarPlano').textContent = '💾 Adicionar plano';
    document.getElementById('btnCancelarPlano').classList.add('oculto');
  },

  async salvarPlano() {
    const d = lerFormulario('formPlano');
    if (!d.nome) return toastErro('Informe o nome do plano.');
    d.valor_mensalidade = Number(String(d.valor_mensalidade || '0').replace(/\./g, '').replace(',', '.'));
    d.taxa_matricula = Number(String(d.taxa_matricula || '0').replace(/\./g, '').replace(',', '.'));

    try {
      if (this.editandoPlano) {
        await Api.put('/api/financeiro/planos/' + this.editandoPlano, d);
        toast('Plano atualizado.');
      } else {
        await Api.post('/api/financeiro/planos', d);
        toast('Plano criado.');
      }
      this.cancelarEdicaoPlano();
      this.listarPlanos();
    } catch (e) { toastErro(e.message); }
  },

  async excluirPlano(id) {
    const ok = await confirmar('Excluir este plano?', { titulo: 'Excluir plano', textoOk: 'Excluir' });
    if (!ok) return;
    try {
      await Api.excluir('/api/financeiro/planos/' + id);
      toast('Plano excluído.');
      this.listarPlanos();
    } catch (e) { toastErro(e.message); }
  },

  // ══════════════════════ CONTRATOS ═══════════════════════════
  async carregarContratos() {
    const corpo = document.getElementById('finContratosCorpo');
    corpo.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:26px"><span class="spinner"></span></td></tr>`;

    try { this.contratos = await Api.get('/api/financeiro/contratos'); }
    catch (e) {
      corpo.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:26px;color:var(--red)">${escapar(e.message)}</td></tr>`;
      return;
    }

    if (!this.contratos.length) {
      corpo.innerHTML = `<tr><td colspan="9"><div class="vazio">
        <span class="ico">📄</span><div class="titulo">Nenhum contrato financeiro</div>
        <div class="sub">Crie o contrato para gerar as mensalidades do aluno.</div></div></td></tr>`;
      document.getElementById('finContratosTotal').textContent = 'Nenhum registro';
      return;
    }

    corpo.innerHTML = this.contratos.map(c => `
      <tr class="clicavel" ondblclick="Financeiro.abrirContrato(${c.id})">
        <td style="font-weight:600">${escapar(c.aluno_nome)}</td>
        <td>${escapar(c.turma_nome || '—')}</td>
        <td>${escapar(c.plano_nome)}</td>
        <td class="mono">${moedaBR(c.valor_mensalidade)}</td>
        <td>${(Number(c.desconto_percentual) + Number(c.bolsa_percentual)) > 0
              ? `<span class="badge badge-gold">${Number(c.desconto_percentual) + Number(c.bolsa_percentual)}%</span>`
              : '<span class="c-txt3">—</span>'}</td>
        <td style="font-size:12.5px">${escapar(c.responsavel_nome || '—')}</td>
        <td>${c.qtd_parcelas}</td>
        <td>${c.status === 'ativo'
              ? '<span class="badge badge-green">ativo</span>'
              : `<span class="badge badge-cinza">${escapar(c.status)}</span>`}</td>
        <td class="acoes">
          <button class="btn-ico" onclick="Financeiro.verExtrato(${c.aluno_id})" title="Extrato">📄</button>
          <button class="btn-ico" onclick="Financeiro.abrirContrato(${c.id})" title="Editar">✏️</button>
          <button class="btn-ico perigo" onclick="Financeiro.excluirContrato(${c.id})" title="Excluir">🗑️</button>
        </td>
      </tr>`).join('');

    document.getElementById('finContratosTotal').textContent =
      `${this.contratos.length} contrato(s)`;
  },

  async abrirContrato(id = null) {
    if (!this.planos.length) {
      try { this.planos = await Api.get('/api/financeiro/planos'); } catch {}
    }

    this.editandoContrato = id;
    limparFormulario('formContrato');

    document.getElementById('contratoPlano').innerHTML =
      this.planos.filter(p => p.ativo || p.id === id).map(p =>
        `<option value="${p.id}">${escapar(p.nome)} — ${moedaBR(p.valor_mensalidade)}</option>`).join('');

    const form = document.getElementById('formContrato');

    if (id) {
      const c = this.contratos.find(x => x.id === id);
      document.getElementById('contratoAluno').innerHTML = Cache.opcoesAlunos(c.aluno_id);
      document.getElementById('contratoAluno').disabled = true;
      await this.carregarResponsaveisContrato();
      preencherFormulario('formContrato', {
        ...c,
        valor_mensalidade: Number(c.valor_mensalidade).toFixed(2).replace('.', ','),
      });
      document.getElementById('contratoPlano').value = c.plano_id;
      document.getElementById('contratoResponsavel').value = c.responsavel_id || '';
      document.getElementById('modalContratoTitulo').textContent = `Contrato — ${c.aluno_nome}`;
    } else {
      document.getElementById('contratoAluno').innerHTML = Cache.opcoesAlunos();
      document.getElementById('contratoAluno').disabled = false;
      await this.carregarResponsaveisContrato();
      form.querySelector('[data-campo=ano_letivo]').value = new Date().getFullYear();
      form.querySelector('[data-campo=mes_inicio]').value = '1';
      form.querySelector('[data-campo=status]').value = 'ativo';
      document.getElementById('modalContratoTitulo').textContent = 'Novo contrato';
      this.aplicarPlano();
    }

    this.previaContrato();
    abrirModal('modalContrato');
  },

  /** Restringe o select de responsável financeiro aos responsáveis vinculados ao aluno selecionado. */
  async carregarResponsaveisContrato() {
    const alunoId = document.getElementById('contratoAluno').value;
    const sel = document.getElementById('contratoResponsavel');
    const anterior = sel.value;

    if (!alunoId) {
      sel.innerHTML = '<option value="">Selecione o aluno primeiro</option>';
      return;
    }

    let vinculados = [];
    try {
      const aluno = await Api.get('/api/alunos/' + alunoId);
      vinculados = aluno.responsaveis || [];
    } catch { vinculados = []; }

    sel.innerHTML = '<option value="">Responsável principal do aluno</option>' +
      vinculados.map(r => `<option value="${r.id}">${escapar(r.nome)}</option>`).join('');
    sel.value = vinculados.some(r => String(r.id) === String(anterior)) ? anterior : '';
  },

  /** Ao escolher o plano, herda valor, parcelas e vencimento. */
  aplicarPlano() {
    const p = this.planos.find(x => String(x.id) === document.getElementById('contratoPlano').value);
    if (!p) return;
    const form = document.getElementById('formContrato');
    form.querySelector('[data-campo=valor_mensalidade]').value = Number(p.valor_mensalidade).toFixed(2).replace('.', ',');
    form.querySelector('[data-campo=num_parcelas]').value = p.num_parcelas;
    form.querySelector('[data-campo=dia_vencimento]').value = p.dia_vencimento;
    this.previaContrato();
  },

  previaContrato() {
    const d = lerFormulario('formContrato');
    const bruto = Number(String(d.valor_mensalidade || '0').replace(/\./g, '').replace(',', '.'));
    const desc = (Number(d.desconto_percentual || 0) + Number(d.bolsa_percentual || 0)) / 100;
    const liquido = bruto * (1 - Math.min(desc, 1));
    const parcelas = Number(d.num_parcelas) || 12;

    document.getElementById('contratoPrevia').innerHTML = `
      <div style="display:flex;gap:18px;flex-wrap:wrap;font-size:13px">
        <div><span class="c-txt2">Parcela: </span><strong class="mono c-gold">${moedaBR(liquido)}</strong></div>
        <div><span class="c-txt2">Parcelas: </span><strong>${parcelas}x</strong></div>
        <div><span class="c-txt2">Total do ano: </span><strong class="mono">${moedaBR(liquido * parcelas)}</strong></div>
      </div>
      <div class="form-hint mt-2">Ao salvar, as parcelas em aberto são recriadas com estes valores. Parcelas já pagas são preservadas.</div>`;
  },

  async salvarContrato() {
    const d = lerFormulario('formContrato');
    d.aluno_id = document.getElementById('contratoAluno').value;
    d.plano_id = document.getElementById('contratoPlano').value;
    d.responsavel_id = document.getElementById('contratoResponsavel').value || null;
    d.valor_mensalidade = Number(String(d.valor_mensalidade || '0').replace(/\./g, '').replace(',', '.'));

    if (!d.aluno_id) return toastErro('Selecione o aluno.');
    if (!d.plano_id) return toastErro('Selecione o plano.');

    try {
      const r = this.editandoContrato
        ? await Api.put('/api/financeiro/contratos/' + this.editandoContrato, d)
        : await Api.post('/api/financeiro/contratos', d);

      fecharModal('modalContrato');
      toast(`Contrato salvo. ${r.parcelas} parcela(s) gerada(s).`);
      this.carregarContratos();
    } catch (e) { toastErro(e.message); }
  },

  async excluirContrato(id) {
    const ok = await confirmar('Excluir este contrato e suas parcelas em aberto?',
      { titulo: 'Excluir contrato', textoOk: 'Excluir' });
    if (!ok) return;
    try {
      await Api.excluir('/api/financeiro/contratos/' + id);
      toast('Contrato excluído.');
      this.carregarContratos();
    } catch (e) { toastErro(e.message); }
  },

  // ══════════════════════ COBRANÇA AVULSA ═════════════════════
  abrirCobranca(alunoId = null) {
    limparFormulario('formCobranca');
    document.getElementById('cobrancaAluno').innerHTML = Cache.opcoesAlunos(alunoId || '');
    document.getElementById('formCobranca').querySelector('[data-campo=vencimento]').value =
      new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    abrirModal('modalCobranca');
  },

  async salvarCobranca() {
    const d = lerFormulario('formCobranca');
    d.aluno_id = document.getElementById('cobrancaAluno').value;
    d.valor_original = Number(String(d.valor_original || '0').replace(/\./g, '').replace(',', '.'));

    if (!d.aluno_id) return toastErro('Selecione o aluno.');
    if (!d.descricao) return toastErro('Descreva a cobrança.');
    if (!(d.valor_original > 0)) return toastErro('Informe o valor.');

    try {
      await Api.post('/api/financeiro/mensalidades', d);
      fecharModal('modalCobranca');
      toast('Cobrança lançada.');
      this.abrirAbaRecebimento('mensalidades');
    } catch (e) { toastErro(e.message); }
  },

  // ══════════════════════ EXTRATO ═════════════════════════════
  async verExtrato(alunoId) {
    let d;
    try { d = await Api.get('/api/financeiro/aluno/' + alunoId); }
    catch (e) { return toastErro(e.message); }

    document.getElementById('extratoTitulo').textContent = d.aluno.nome;
    document.getElementById('extratoSub').textContent =
      `${d.aluno.turma_nome || 'sem turma'} · matrícula ${d.aluno.matricula}`;

    document.getElementById('extratoCorpo').innerHTML = `
      <div class="stat-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
        <div class="stat-card"><div class="stat-label">Total do ano</div><div class="stat-val">${moedaBR(d.totais.total_ano)}</div></div>
        <div class="stat-card"><div class="stat-label">Pago</div><div class="stat-val c-green">${moedaBR(d.totais.pago)}</div></div>
        <div class="stat-card"><div class="stat-label">Em aberto</div><div class="stat-val c-blue">${moedaBR(d.totais.em_aberto)}</div></div>
        <div class="stat-card"><div class="stat-label">Vencido</div><div class="stat-val c-red">${moedaBR(d.totais.vencido)}</div>
          <div class="stat-sub">${d.totais.parcelas_vencidas} parcela(s)</div></div>
      </div>

      ${d.contratos.length ? `
        <div class="secao-titulo">Contrato</div>
        ${d.contratos.map(c => `
          <div style="font-size:13px;padding:8px 0;border-bottom:1px solid var(--border)">
            <strong>${c.ano_letivo}</strong> · ${escapar(c.plano_nome)} ·
            ${moedaBR(c.valor_mensalidade)} × ${c.num_parcelas}
            ${(Number(c.desconto_percentual) + Number(c.bolsa_percentual)) > 0
              ? ` · desconto ${Number(c.desconto_percentual) + Number(c.bolsa_percentual)}%` : ''}
            · resp.: ${escapar(c.responsavel_nome || '—')}
          </div>`).join('')}` : ''}

      <div class="secao-titulo">Parcelas</div>
      <div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Competência</th><th>Descrição</th><th>Vencimento</th><th>Valor</th><th>Pago</th><th>Situação</th><th class="acoes"></th></tr></thead>
        <tbody>
          ${d.parcelas.map(p => `
            <tr>
              <td class="mono" style="font-size:12px">${competenciaBR(p.competencia)}</td>
              <td style="font-size:12.5px">
                ${(p.itens && p.itens.length > 1)
                  ? p.itens.map(i => `<div>${escapar(i.descricao)}
                      <span class="mono ${i.valor < 0 ? 'c-green' : ''}">${moedaBR(i.valor)}</span>
                      ${i.centro_codigo ? `<span class="c-txt3" style="font-size:10.5px">${escapar(i.centro_codigo)}</span>` : ''}</div>`).join('')
                  : escapar(p.descricao || '—')}
                ${p.pagamentos.length ? `<div style="font-size:11px;color:var(--txt3);margin-top:4px">${p.pagamentos.map(g =>
                  `${dataBR(g.data_pagamento)} ${moedaBR(g.valor)} (${FORMAS_PAGAMENTO[g.forma] || g.forma})`).join(' · ')}</div>` : ''}
              </td>
              <td class="mono" style="font-size:12px">${dataBR(p.vencimento)}</td>
              <td class="mono">${moedaBR(p.valor_total)}</td>
              <td class="mono c-green">${p.valor_pago ? moedaBR(p.valor_pago) : '—'}</td>
              <td>${badgeFinanceiro(p.situacao)}</td>
              <td class="acoes">
                ${p.pagamentos.map(g =>
                  `<button class="btn-ico perigo" onclick="Financeiro.estornar(${g.id}, ${alunoId})" title="Estornar ${moedaBR(g.valor)}">↩️</button>`).join('')}
              </td>
            </tr>`).join('')}
        </tbody>
      </table></div>`;

    abrirModal('modalExtrato');
  },

  async estornar(pagamentoId, alunoId) {
    const ok = await confirmar('Estornar este pagamento? A parcela volta para "em aberto".',
      { titulo: 'Estornar pagamento', textoOk: 'Estornar' });
    if (!ok) return;
    try {
      await Api.excluir('/api/financeiro/pagamentos/' + pagamentoId);
      toast('Pagamento estornado.');
      this.verExtrato(alunoId);
      this.carregarParcelas();
    } catch (e) { toastErro(e.message); }
  },
};

document.addEventListener('DOMContentLoaded', () => {
  ['finAluno', 'finTurma', 'finSituacao', 'finCompetencia', 'finDe', 'finAte'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', () => Financeiro.carregarParcelas()));

  ['desconto_percentual', 'bolsa_percentual', 'valor_mensalidade', 'num_parcelas'].forEach(campo => {
    const el = document.querySelector(`#formContrato [data-campo="${campo}"]`);
    el?.addEventListener('input', () => Financeiro.previaContrato());
  });
});

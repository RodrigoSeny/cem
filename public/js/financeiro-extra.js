/* ══════════════════════════════════════════════════════════════
   CEM — Financeiro: cobranças variáveis, movimento mensal,
   planilha de cobrança, despesas e centros de custo.

   Estende o objeto Financeiro (js/financeiro.js).
   ══════════════════════════════════════════════════════════════ */

const ESCOPOS = { todos: 'Todos os alunos', turma: 'Turma', turno: 'Turno', aluno: 'Individual' };
const PERIODICIDADES = {
  unica: 'Única', mensal: 'Mensal', bimestral: 'Bimestral',
  trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual',
};
const TIPOS_CENTRO = {
  evento: 'Evento', material: 'Material', rotina: 'Rotina', servico: 'Serviço', outro: 'Outro',
};

/** 'R$ 1.234,56' ou '1234,56' → 1234.56 */
const paraNumero = v => Number(String(v ?? '0').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
const mesAtual = () => new Date().toISOString().slice(0, 7);

Object.assign(Financeiro, {
  cobrancas: [],
  centros: [],
  despesas: [],
  editandoCobranca: null,
  editandoDespesa: null,
  editandoCentro: null,
  _previa: null,
  _planilha: null,

  // ── Seções de Cadastros (navegação só pelo menu lateral) ─────
  abrirAbaCadastro(nome) {
    ['planos', 'contratos', 'cobrancas', 'centros'].forEach(n =>
      document.getElementById('cadaba-' + n)?.classList.toggle('active', n === nome));

    // O botão do cabeçalho muda conforme a aba
    const acoes = {
      planos:    { rotulo: '＋ Novo plano',           fn: 'Financeiro.abrirPlanos()' },
      contratos: { rotulo: '📄 Novo contrato',        fn: 'Financeiro.abrirContrato()' },
      cobrancas: { rotulo: '＋ Nova cobrança',        fn: 'Financeiro.abrirCobrancaVariavel()' },
      centros:   { rotulo: '＋ Novo centro de custo', fn: 'Financeiro.abrirCentro()' },
    }[nome];
    document.getElementById('finCadAcoes').innerHTML =
      `<button class="btn btn-primary" onclick="${acoes.fn}">${acoes.rotulo}</button>`;

    ({
      planos: () => this.carregarPlanosTabela(),
      contratos: () => this.carregarContratos(),
      cobrancas: () => this.carregarCobrancas(),
      centros: () => this.carregarCentros(),
    })[nome]();
  },

  // ── Seções de Recebimentos (navegação só pelo menu lateral) ──
  abrirAbaRecebimento(nome) {
    ['mensalidades', 'movimento', 'planilha'].forEach(n =>
      document.getElementById('recaba-' + n)?.classList.toggle('active', n === nome));

    if (nome === 'mensalidades') {
      this.montarFiltros();
      document.getElementById('finCompetencia').value ||= mesAtual();
      this.carregarParcelas();
    }
    if (nome === 'movimento') document.getElementById('movCompetencia').value ||= mesAtual();
    if (nome === 'planilha') document.getElementById('planCompetencia').value ||= mesAtual();
  },

  /** Planos na aba de cadastros (o modal continua para criar/editar). */
  async carregarPlanosTabela() {
    const corpo = document.getElementById('planosPagCorpo');
    corpo.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:26px"><span class="spinner"></span></td></tr>`;

    try { this.planos = await Api.get('/api/financeiro/planos'); }
    catch (e) {
      corpo.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:26px;color:var(--red)">${escapar(e.message)}</td></tr>`;
      return;
    }

    if (!this.planos.length) {
      corpo.innerHTML = `<tr><td colspan="7"><div class="vazio">
        <span class="ico">⚙️</span><div class="titulo">Nenhum plano cadastrado</div>
        <div class="sub">O plano define o valor base da mensalidade e o vencimento.</div></div></td></tr>`;
      document.getElementById('planosPagTotal').textContent = 'Nenhum registro';
      return;
    }

    corpo.innerHTML = this.planos.map(p => `
      <tr class="clicavel" ondblclick="Financeiro.abrirPlanos();setTimeout(()=>Financeiro.editarPlano(${p.id}),350)">
        <td>
          <div style="font-weight:600">${escapar(p.nome)}</div>
          ${p.descricao ? `<div style="font-size:11px;color:var(--txt3)">${escapar(p.descricao)}</div>` : ''}
        </td>
        <td class="mono">${moedaBR(p.valor_mensalidade)}</td>
        <td class="mono">${p.taxa_matricula ? moedaBR(p.taxa_matricula) : '—'}</td>
        <td>${p.num_parcelas}x</td>
        <td>dia ${p.dia_vencimento}</td>
        <td>${p.qtd_contratos ? `<span class="badge badge-blue">${p.qtd_contratos}</span>` : '<span class="c-txt3">—</span>'}</td>
        <td class="acoes">
          <button class="btn-ico" onclick="Financeiro.abrirPlanos();setTimeout(()=>Financeiro.editarPlano(${p.id}),350)" title="Editar">✏️</button>
          <button class="btn-ico perigo" onclick="Financeiro.excluirPlano(${p.id})" title="Excluir">🗑️</button>
        </td>
      </tr>`).join('');

    const ativos = this.planos.filter(p => p.ativo).length;
    document.getElementById('planosPagTotal').textContent =
      `${this.planos.length} plano(s) · ${ativos} ativo(s)`;
  },

  /** Recarrega a lista de centros pros seletores — sempre na hora, pra não
   *  ficar faltando um centro criado depois da primeira visita à página. */
  async garantirCentros() {
    try { this.centros = await Api.get('/api/financeiro/centros-custo'); }
    catch { this.centros = this.centros || []; }
    return this.centros;
  },

  /** `incluirInativos`: use nos filtros de consulta — nas telas de vincular
   *  (nova despesa/cobrança), deixe false pra não atribuir a um centro encerrado. */
  opcoesCentros(selecionado = '', vazio = 'Selecione…', incluirInativos = false) {
    return `<option value="">${vazio}</option>` + this.centros
      .filter(c => incluirInativos || c.ativo || String(c.id) === String(selecionado))
      .map(c => `<option value="${c.id}" ${String(c.id) === String(selecionado) ? 'selected' : ''}>${escapar(c.codigo)} — ${escapar(c.nome)}${c.ativo ? '' : ' (inativo)'}</option>`)
      .join('');
  },

  // ══════════════════ COBRANÇAS VARIÁVEIS ═════════════════════
  async carregarCobrancas() {
    await this.garantirCentros();
    const corpo = document.getElementById('cobrCorpo');
    corpo.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:26px"><span class="spinner"></span></td></tr>`;

    // Reconstrói as opções toda vez (pode ter surgido um centro novo),
    // preservando o filtro que já estava selecionado.
    const filtroCentro = document.getElementById('cobrFiltroCentro');
    const centroSelecionado = filtroCentro.value;
    filtroCentro.innerHTML = this.opcoesCentros('', 'Todos os centros', true);
    filtroCentro.value = centroSelecionado;

    try {
      this.cobrancas = await Api.get('/api/financeiro/cobrancas', {
        centro_custo_id: filtroCentro.value,
        ativa: document.getElementById('cobrFiltroAtiva').value,
      });
    } catch (e) {
      corpo.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:26px;color:var(--red)">${escapar(e.message)}</td></tr>`;
      return;
    }

    if (!this.cobrancas.length) {
      corpo.innerHTML = `<tr><td colspan="8"><div class="vazio">
        <span class="ico">🧾</span><div class="titulo">Nenhuma cobrança cadastrada</div>
        <div class="sub">Crie taxas, eventos e serviços que entram no movimento do mês.</div></div></td></tr>`;
      document.getElementById('cobrTotal').textContent = 'Nenhum registro';
      return;
    }

    corpo.innerHTML = this.cobrancas.map(c => `
      <tr class="clicavel" ondblclick="Financeiro.verCobranca(${c.id})">
        <td>
          <div style="font-weight:600">${escapar(c.descricao)}</div>
          <div style="font-size:11px;color:var(--txt3)">desde ${competenciaBR(c.competencia_inicio)}${c.ativa ? '' : ' · inativa'}</div>
        </td>
        <td class="mono">${moedaBR(c.valor)}</td>
        <td>
          <span class="badge badge-cinza">${ESCOPOS[c.escopo]}</span>
          ${c.turma_nome ? `<div style="font-size:11px;color:var(--txt3);margin-top:3px">${escapar(c.turma_nome)}</div>` : ''}
          ${c.turno ? `<div style="font-size:11px;color:var(--txt3);margin-top:3px">${TURNOS[c.turno] || c.turno}</div>` : ''}
          ${c.aluno_nome ? `<div style="font-size:11px;color:var(--txt3);margin-top:3px">${escapar(c.aluno_nome)}</div>` : ''}
        </td>
        <td>${PERIODICIDADES[c.periodicidade]}${c.periodicidade !== 'unica' ? ` · ${c.ocorrencias}x` : ''}</td>
        <td>${c.modo === 'embutir'
              ? '<span class="badge badge-blue">na mensalidade</span>'
              : '<span class="badge badge-purple">documento à parte</span>'}</td>
        <td style="font-size:12.5px">${c.centro_codigo ? escapar(c.centro_codigo) : '<span class="c-txt3">—</span>'}</td>
        <td>
          <div class="mono" style="font-size:12px">${c.lancados}/${c.alcancados}</div>
          <div style="font-size:11px;color:var(--txt3)">${moedaBR(c.total_previsto)}</div>
        </td>
        <td class="acoes">
          <button class="btn-ico" onclick="Financeiro.verCobranca(${c.id})" title="Ver alunos">👁️</button>
          <button class="btn-ico" onclick="Financeiro.abrirCobrancaVariavel(${c.id})" title="Editar">✏️</button>
          <button class="btn-ico perigo" onclick="Financeiro.excluirCobranca(${c.id})" title="Excluir">🗑️</button>
        </td>
      </tr>`).join('');

    const previsto = this.cobrancas.reduce((s, c) => s + c.total_previsto, 0);
    document.getElementById('cobrTotal').textContent =
      `${this.cobrancas.length} cobrança(s) · previsto ${moedaBR(previsto)}`;
  },

  async abrirCobrancaVariavel(id = null) {
    await this.garantirCentros();
    if (!this.centros.length) {
      const ok = await confirmar(
        'Nenhum centro de custo cadastrado. Toda cobrança precisa de um, para o fechamento fechar. Cadastrar agora?',
        { titulo: 'Centro de custo', textoOk: 'Cadastrar', perigo: false });
      if (ok) this.abrirCentro();
      return;
    }

    this.editandoCobranca = id;
    limparFormulario('formCobrancaVar');

    document.getElementById('cobrVarTurma').innerHTML = Cache.opcoesTurmas('', 'Selecione a turma');
    document.getElementById('cobrVarAluno').innerHTML = Cache.opcoesAlunos();

    if (id) {
      const c = this.cobrancas.find(x => x.id === id);
      preencherFormulario('formCobrancaVar', { ...c, valor: Number(c.valor).toFixed(2).replace('.', ',') });
      document.getElementById('cobrVarCentro').innerHTML = this.opcoesCentros(c.centro_custo_id);
      document.getElementById('cobrVarEscopo').value = c.escopo;
      document.getElementById('cobrVarTurma').value = c.turma_id || '';
      document.getElementById('cobrVarTurno').value = c.turno || 'manha';
      document.getElementById('cobrVarAluno').value = c.aluno_id || '';
      document.getElementById('cobrVarCompetencia').value = c.competencia_inicio;
      document.getElementById('cobrVarTitulo').textContent = c.descricao;
    } else {
      document.getElementById('cobrVarCentro').innerHTML = this.opcoesCentros();
      document.getElementById('cobrVarEscopo').value = 'todos';
      document.getElementById('cobrVarCompetencia').value = mesAtual();
      document.getElementById('formCobrancaVar').querySelector('[data-campo=periodicidade]').value = 'unica';
      document.getElementById('formCobrancaVar').querySelector('[data-campo=modo]').value = 'embutir';
      document.getElementById('cobrVarTitulo').textContent = 'Nova cobrança';
    }

    this.trocarEscopo();
    this.trocarPeriodicidade();
    abrirModal('modalCobrancaVar');
  },

  trocarEscopo() {
    const e = document.getElementById('cobrVarEscopo').value;
    document.getElementById('cobrVarGrupoTurma').classList.toggle('oculto', e !== 'turma');
    document.getElementById('cobrVarGrupoTurno').classList.toggle('oculto', e !== 'turno');
    document.getElementById('cobrVarGrupoAluno').classList.toggle('oculto', e !== 'aluno');
    this.previaCobranca();
  },

  trocarPeriodicidade() {
    const form = document.getElementById('formCobrancaVar');
    const p = form.querySelector('[data-campo=periodicidade]').value;
    const modo = form.querySelector('[data-campo=modo]').value;
    document.getElementById('cobrVarGrupoOcorrencias').classList.toggle('oculto', p === 'unica');
    document.getElementById('cobrVarGrupoVencimento').classList.toggle('oculto', modo !== 'separada');
    this.previaCobranca();
  },

  /** Quantos alunos e qual o total previsto, antes de salvar. */
  previaCobranca() {
    const form = document.getElementById('formCobrancaVar');
    const valor = paraNumero(form.querySelector('[data-campo=valor]').value);
    const escopo = document.getElementById('cobrVarEscopo').value;
    const p = form.querySelector('[data-campo=periodicidade]').value;
    const vezes = p === 'unica' ? 1 : (Number(form.querySelector('[data-campo=ocorrencias]').value) || 1);

    let alunos = Cache.alunos.length;
    let alvo = 'todos os alunos matriculados';
    if (escopo === 'turma') {
      const t = Cache.turmas.find(x => String(x.id) === document.getElementById('cobrVarTurma').value);
      alunos = t ? t.qtd_alunos : 0;
      alvo = t ? `turma ${t.nome}` : 'turma não selecionada';
    } else if (escopo === 'turno') {
      const turno = document.getElementById('cobrVarTurno').value;
      alunos = Cache.alunos.filter(a => {
        const t = Cache.turmas.find(x => x.id === a.turma_id);
        return (t ? t.turno : a.turno) === turno;
      }).length;
      alvo = `turno da ${(TURNOS[turno] || turno).toLowerCase()}`;
    } else if (escopo === 'aluno') {
      const a = Cache.alunos.find(x => String(x.id) === document.getElementById('cobrVarAluno').value);
      alunos = a ? 1 : 0;
      alvo = a ? a.nome : 'aluno não selecionado';
    }

    document.getElementById('cobrVarPrevia').innerHTML = `
      <div style="display:flex;gap:18px;flex-wrap:wrap;font-size:13px">
        <div><span class="c-txt2">Alcance: </span><strong>${escapar(alvo)}</strong></div>
        <div><span class="c-txt2">Alunos: </span><strong>${alunos}</strong></div>
        <div><span class="c-txt2">Lançamentos: </span><strong>${alunos * vezes}</strong></div>
        <div><span class="c-txt2">Total previsto: </span><strong class="mono c-gold">${moedaBR(valor * alunos * vezes)}</strong></div>
      </div>`;
  },

  async salvarCobrancaVariavel() {
    const d = lerFormulario('formCobrancaVar');
    d.valor = paraNumero(d.valor);
    d.centro_custo_id = document.getElementById('cobrVarCentro').value || null;
    d.escopo = document.getElementById('cobrVarEscopo').value;
    d.competencia_inicio = document.getElementById('cobrVarCompetencia').value;
    if (d.escopo === 'turma') d.turma_id = document.getElementById('cobrVarTurma').value;
    if (d.escopo === 'turno') d.turno = document.getElementById('cobrVarTurno').value;
    if (d.escopo === 'aluno') d.aluno_id = document.getElementById('cobrVarAluno').value;

    if (!d.descricao) return toastErro('Descreva a cobrança.');
    if (!(d.valor > 0)) return toastErro('Informe o valor.');
    if (!d.centro_custo_id) return toastErro('Selecione o centro de custo.');
    if (!d.competencia_inicio) return toastErro('Informe a competência inicial.');

    try {
      if (this.editandoCobranca) {
        await Api.put('/api/financeiro/cobrancas/' + this.editandoCobranca, d);
        toast('Cobrança atualizada.');
      } else {
        const r = await Api.post('/api/financeiro/cobrancas', d);
        toast(`Cobrança criada para ${r.previstos} lançamento(s).`);
      }
      fecharModal('modalCobrancaVar');
      this.centros = [];
      this.carregarCobrancas();
    } catch (e) { toastErro(e.message); }
  },

  async verCobranca(id) {
    let c;
    try { c = await Api.get('/api/financeiro/cobrancas/' + id); }
    catch (e) { return toastErro(e.message); }

    document.getElementById('cobrDetTitulo').textContent = c.descricao;
    document.getElementById('cobrDetSub').textContent =
      `${moedaBR(c.valor)} · ${ESCOPOS[c.escopo]} · ${PERIODICIDADES[c.periodicidade]} · ${c.centro_codigo || 'sem centro'}`;

    const rotulo = { pendente: 'badge-blue', lancada: 'badge-green', cancelada: 'badge-cinza' };

    document.getElementById('cobrDetCorpo').innerHTML = `
      <div class="stat-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
        <div class="stat-card"><div class="stat-label">Alunos</div><div class="stat-val">${c.alcancados}</div></div>
        <div class="stat-card"><div class="stat-label">Lançados</div><div class="stat-val c-green">${c.lancados}</div></div>
        <div class="stat-card"><div class="stat-label">Total previsto</div><div class="stat-val c-gold">${moedaBR(c.total_previsto)}</div></div>
      </div>

      <div class="secao-titulo">Competências</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${c.competencias.map(x => `<span class="badge badge-cinza">${competenciaBR(x)}</span>`).join('')}
      </div>

      <div class="secao-titulo">Alunos alcançados</div>
      <div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Aluno</th><th>Turma</th><th>Competência</th><th>Valor</th><th>Situação</th><th class="acoes"></th></tr></thead>
        <tbody>
          ${c.alunos.map(a => `
            <tr>
              <td style="font-weight:600">${escapar(a.aluno_nome)}</td>
              <td>${escapar(a.turma_nome || '—')}</td>
              <td class="mono" style="font-size:12px">${competenciaBR(a.competencia)}</td>
              <td class="mono">${moedaBR(a.valor)}</td>
              <td><span class="badge ${rotulo[a.status]}">${a.status}</span></td>
              <td class="acoes">${a.status === 'pendente'
                ? `<button class="btn-ico perigo" onclick="Financeiro.tirarDaCobranca(${c.id},${a.aluno_id})" title="Tirar da cobrança">🚫</button>`
                : ''}</td>
            </tr>`).join('')}
        </tbody>
      </table></div>`;

    abrirModal('modalCobrancaDetalhe');
  },

  async tirarDaCobranca(cobrancaId, alunoId) {
    const ok = await confirmar('Tirar este aluno da cobrança?', { titulo: 'Cancelar lançamento', textoOk: 'Tirar' });
    if (!ok) return;
    try {
      await Api.excluir(`/api/financeiro/cobrancas/${cobrancaId}/alunos/${alunoId}`);
      toast('Aluno retirado da cobrança.');
      this.verCobranca(cobrancaId);
      this.carregarCobrancas();
    } catch (e) { toastErro(e.message); }
  },

  async excluirCobranca(id) {
    const c = this.cobrancas.find(x => x.id === id);
    const ok = await confirmar(`Excluir a cobrança "${c ? c.descricao : ''}"?`,
      { titulo: 'Excluir cobrança', textoOk: 'Excluir' });
    if (!ok) return;
    try {
      await Api.excluir('/api/financeiro/cobrancas/' + id);
      toast('Cobrança excluída.');
      this.carregarCobrancas();
    } catch (e) { toastErro(e.message); }
  },

  // ══════════════════ MOVIMENTO MENSAL ════════════════════════
  async previaMovimento() {
    const competencia = document.getElementById('movCompetencia').value;
    if (!competencia) return toast('Escolha a competência.', 'aviso');

    const alvo = document.getElementById('movResultado');
    alvo.innerHTML = '<div class="vazio"><span class="spinner"></span></div>';
    document.getElementById('btnGerarMovimento').classList.add('oculto');

    let d;
    try { d = await Api.get('/api/financeiro/cobrancas/movimento/previa', { competencia }); }
    catch (e) {
      alvo.innerHTML = `<div class="vazio"><span class="ico">⚠️</span><div class="titulo">${escapar(e.message)}</div></div>`;
      return;
    }

    this._previa = d;

    if (!d.linhas.length) {
      alvo.innerHTML = `<div class="vazio"><span class="ico">📭</span>
        <div class="titulo">Nada a lançar em ${competenciaBR(competencia)}</div>
        <div class="sub">Não há mensalidades nem cobranças pendentes nesta competência.</div></div>`;
      return;
    }

    const comCobranca = d.linhas.filter(l => l.embutidas.length || l.separadas.length).length;

    alvo.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Alunos</div><div class="stat-val">${d.totais.alunos}</div>
          <div class="stat-sub">${comCobranca} com cobrança no mês</div></div>
        <div class="stat-card"><div class="stat-label">Mensalidades</div><div class="stat-val c-gold">${moedaBR(d.totais.mensalidades)}</div>
          <div class="stat-sub">documentos do mês</div></div>
        <div class="stat-card"><div class="stat-label">Cobranças à parte</div><div class="stat-val c-purple">${moedaBR(d.totais.extras)}</div></div>
        <div class="stat-card"><div class="stat-label">A lançar</div><div class="stat-val c-blue">${d.totais.cobrancas_pendentes}</div>
          <div class="stat-sub">cobranças pendentes</div></div>
      </div>

      <div class="tabela-wrap">
        <div class="tabela-scroll" style="max-height:52vh">
          <table class="tabela">
            <thead><tr><th>Aluno</th><th>Turma</th><th>Mensalidade</th><th>Cobranças do mês</th><th>Total do documento</th><th>À parte</th></tr></thead>
            <tbody>
              ${d.linhas.map(l => `
                <tr>
                  <td style="font-weight:600">${escapar(l.aluno_nome)}
                    ${l.ja_paga ? '<span class="badge badge-green">já paga</span>' : ''}
                    ${!l.mensalidade_id ? '<span class="badge badge-gold">sem mensalidade</span>' : ''}</td>
                  <td>${escapar(l.turma_nome || '—')}</td>
                  <td class="mono">${moedaBR(l.base)}</td>
                  <td style="font-size:12px">
                    ${l.embutidas.length
                      ? l.embutidas.map(c => `<div>${escapar(c.descricao)} <span class="mono c-gold">${moedaBR(c.valor)}</span></div>`).join('')
                      : '<span class="c-txt3">—</span>'}
                  </td>
                  <td class="mono" style="font-weight:700">${moedaBR(l.total_documento)}</td>
                  <td style="font-size:12px">
                    ${l.separadas.length
                      ? l.separadas.map(c => `<div>${escapar(c.descricao)} <span class="mono c-purple">${moedaBR(c.valor)}</span></div>`).join('')
                      : '<span class="c-txt3">—</span>'}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="tabela-rodape">
          <span>Prévia de ${competenciaBR(competencia)} — nada foi gravado ainda.</span>
        </div>
      </div>`;

    if (d.totais.cobrancas_pendentes > 0) {
      document.getElementById('btnGerarMovimento').classList.remove('oculto');
    }
  },

  async gerarMovimento() {
    const competencia = document.getElementById('movCompetencia').value;
    const d = this._previa;
    if (!d) return;

    const ok = await confirmar(
      `Lançar ${d.totais.cobrancas_pendentes} cobrança(s) em ${competenciaBR(competencia)}? ` +
      `As mensalidades passam a somar ${moedaBR(d.totais.mensalidades)} e serão criados os documentos à parte.`,
      { titulo: 'Gerar movimento do mês', textoOk: 'Gerar', perigo: false }
    );
    if (!ok) return;

    try {
      const r = await Api.post('/api/financeiro/cobrancas/movimento/gerar', { competencia });
      toast(`${r.embutidas} cobrança(s) somada(s) em ${r.documentos} documento(s) · ${r.separadas} avulsa(s).`, 'sucesso', 8);
      this.previaMovimento();
      this.carregarCobrancas();
    } catch (e) { toastErro(e.message); }
  },

  // ══════════════════ PLANILHA DE COBRANÇA ════════════════════
  async carregarPlanilha() {
    const competencia = document.getElementById('planCompetencia').value;
    if (!competencia) return toast('Escolha a competência.', 'aviso');

    const alvo = document.getElementById('planResultado');
    alvo.innerHTML = '<div class="vazio"><span class="spinner"></span></div>';

    let d;
    try {
      d = await Api.get('/api/financeiro/planilha', {
        competencia, status: document.getElementById('planStatus').value === 'todas' ? 'todas' : '',
      });
    } catch (e) {
      alvo.innerHTML = `<div class="vazio"><span class="ico">⚠️</span><div class="titulo">${escapar(e.message)}</div></div>`;
      return;
    }

    this._planilha = d;

    if (!d.documentos.length) {
      alvo.innerHTML = `<div class="vazio"><span class="ico">📄</span>
        <div class="titulo">Nada a cobrar em ${competenciaBR(competencia)}</div></div>`;
      return;
    }

    alvo.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Responsáveis</div><div class="stat-val">${d.totais.responsaveis}</div></div>
        <div class="stat-card"><div class="stat-label">Documentos</div><div class="stat-val">${d.totais.documentos}</div></div>
        <div class="stat-card"><div class="stat-label">Total a cobrar</div><div class="stat-val c-gold">${moedaBR(d.totais.valor)}</div></div>
        ${d.totais.sem_responsavel ? `<div class="stat-card" style="border-color:rgba(255,94,94,.4)">
          <div class="stat-label">Sem responsável</div><div class="stat-val c-red">${d.totais.sem_responsavel}</div>
          <div class="stat-sub">documento sem quem cobrar</div></div>` : ''}
      </div>

      <div class="tabela-wrap">
        <div class="tabela-scroll" style="max-height:55vh">
          <table class="tabela">
            <thead><tr><th>Responsável financeiro</th><th>CPF</th><th>Contato</th><th>Aluno</th><th>Detalhamento</th><th>Vencimento</th><th>Valor</th></tr></thead>
            <tbody>
              ${d.responsaveis.map(g => g.documentos.map((doc, i) => `
                <tr>
                  ${i === 0 ? `
                    <td rowspan="${g.documentos.length}" style="font-weight:600;vertical-align:top">
                      ${escapar(g.responsavel_nome)}
                      <div style="font-size:11px;color:var(--txt3);font-weight:400;margin-top:3px">${escapar(g.endereco || '')}</div>
                    </td>
                    <td rowspan="${g.documentos.length}" class="mono" style="font-size:12px;vertical-align:top">${g.responsavel_cpf ? cpfBR(g.responsavel_cpf) : '—'}</td>
                    <td rowspan="${g.documentos.length}" style="font-size:12px;vertical-align:top">
                      ${telefoneBR(g.responsavel_contato)}
                      <div style="font-size:11px;color:var(--txt3)">${escapar(g.responsavel_email || '')}</div>
                    </td>` : ''}
                  <td>${escapar(doc.aluno_nome)}
                    <div style="font-size:11px;color:var(--txt3)">${escapar(doc.turma_nome || '')}</div></td>
                  <td style="font-size:11.5px">
                    ${doc.itens.length
                      ? doc.itens.map(it => `<div>${escapar(it.descricao)} <span class="mono">${moedaBR(it.valor)}</span></div>`).join('')
                      : escapar(doc.descricao || '—')}
                  </td>
                  <td class="mono" style="font-size:12px">${dataBR(doc.vencimento)}</td>
                  <td class="mono" style="font-weight:600">${moedaBR(doc.saldo)}</td>
                </tr>`).join('')).join('')}
            </tbody>
          </table>
        </div>
        <div class="tabela-rodape">
          <span>${d.totais.documentos} documento(s) · ${moedaBR(d.totais.valor)}</span>
        </div>
      </div>`;
  },

  planilhaCsv() {
    const d = this._planilha;
    if (!d) return toast('Monte a planilha primeiro.', 'aviso');

    const esc = v => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const linhas = [
      ['Responsavel', 'CPF', 'Contato', 'Email', 'Endereco', 'Aluno', 'Matricula', 'Turma',
       'Competencia', 'Vencimento', 'Detalhamento', 'Valor'].join(';'),
    ];

    for (const g of d.responsaveis) {
      for (const doc of g.documentos) {
        linhas.push([
          esc(g.responsavel_nome), esc(g.responsavel_cpf), esc(g.responsavel_contato),
          esc(g.responsavel_email), esc(g.endereco), esc(doc.aluno_nome), esc(doc.matricula),
          esc(doc.turma_nome), esc(doc.competencia), esc(doc.vencimento),
          esc(doc.itens.map(i => `${i.descricao} ${i.valor.toFixed(2)}`).join(' + ')),
          esc(doc.saldo.toFixed(2).replace('.', ',')),
        ].join(';'));
      }
    }

    const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cobranca-${d.competencia}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    toast('Planilha exportada.');
  },

  async imprimirPlanilha() {
    const d = this._planilha;
    if (!d) return toast('Monte a planilha primeiro.', 'aviso');
    const e = await Relatorios.carregarEscola();

    const corpo = Relatorios.tabela(
      ['Responsável financeiro', 'CPF', 'Contato', 'Aluno', 'Turma', 'Detalhamento', 'Venc.', 'Valor'],
      d.responsaveis.flatMap(g => g.documentos.map(doc => [
        g.responsavel_nome, g.responsavel_cpf ? cpfBR(g.responsavel_cpf) : '',
        telefoneBR(g.responsavel_contato), doc.aluno_nome, doc.turma_nome,
        doc.itens.map(i => `${i.descricao} ${moedaBR(i.valor)}`).join(' + ') || doc.descricao,
        dataBR(doc.vencimento), moedaBR(doc.saldo),
      ]))
    );

    Relatorios.publicar('Planilha de Cobrança', corpo,
      `${competenciaBR(d.competencia)} · ${d.totais.documentos} documento(s) · total ${moedaBR(d.totais.valor)}`, e);
  },

  // ══════════════════ BAIXA EM LOTE ═══════════════════════════
  marcarTodos(marcado) {
    document.querySelectorAll('#finCorpo input[data-parcela]').forEach(c => { c.checked = marcado; });
    this.atualizarLote();
  },

  atualizarLote() {
    const marcados = [...document.querySelectorAll('#finCorpo input[data-parcela]:checked')];
    const barra = document.getElementById('finBarraLote');
    barra.classList.toggle('oculto', !marcados.length);
    if (!marcados.length) return;

    const total = marcados.reduce((s, c) => s + Number(c.dataset.saldo || 0), 0);
    document.getElementById('finLoteQtd').textContent = marcados.length;
    document.getElementById('finLoteTotal').textContent = moedaBR(total);
    document.getElementById('finLoteData').value ||= new Date().toISOString().slice(0, 10);
  },

  async baixarLote() {
    const ids = [...document.querySelectorAll('#finCorpo input[data-parcela]:checked')]
      .map(c => Number(c.dataset.parcela));
    if (!ids.length) return;

    const total = [...document.querySelectorAll('#finCorpo input[data-parcela]:checked')]
      .reduce((s, c) => s + Number(c.dataset.saldo || 0), 0);

    const ok = await confirmar(
      `Dar baixa em ${ids.length} parcela(s), totalizando ${moedaBR(total)}? Cada uma será quitada pelo saldo total.`,
      { titulo: 'Baixa em lote', textoOk: 'Confirmar baixa', perigo: false });
    if (!ok) return;

    try {
      const r = await Api.post('/api/financeiro/mensalidades/pagar-lote', {
        ids,
        forma: document.getElementById('finLoteForma').value,
        data_pagamento: document.getElementById('finLoteData').value,
      });
      toast(`${r.quitadas} parcela(s) quitada(s) · ${moedaBR(r.total)}` +
            (r.ignoradas ? ` · ${r.ignoradas} ignorada(s)` : ''), 'sucesso', 7);
      document.getElementById('finMarcarTodos').checked = false;
      this.carregarParcelas();
    } catch (e) { toastErro(e.message); }
  },

  // ══════════════════ DESPESAS ════════════════════════════════
  async carregarDespesas() {
    await this.garantirCentros();
    const corpo = document.getElementById('despCorpo');
    corpo.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:26px"><span class="spinner"></span></td></tr>`;

    // Reconstrói as opções toda vez (pode ter surgido um centro novo),
    // preservando o filtro que já estava selecionado.
    const filtro = document.getElementById('despFiltroCentro');
    const centroSelecionado = filtro.value;
    filtro.innerHTML = this.opcoesCentros('', 'Todos os centros', true);
    filtro.value = centroSelecionado;

    try {
      this.despesas = await Api.get('/api/financeiro/despesas', {
        centro_custo_id: filtro.value,
        status: document.getElementById('despFiltroStatus').value,
      });
    } catch (e) {
      corpo.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:26px;color:var(--red)">${escapar(e.message)}</td></tr>`;
      return;
    }

    if (!this.despesas.length) {
      corpo.innerHTML = `<tr><td colspan="7"><div class="vazio">
        <span class="ico">🧾</span><div class="titulo">Nenhuma despesa lançada</div>
        <div class="sub">Lance os gastos para fechar o custo de cada evento.</div></div></td></tr>`;
      document.getElementById('despTotal').textContent = 'Nenhum registro';
      return;
    }

    corpo.innerHTML = this.despesas.map(d => `
      <tr class="clicavel" ondblclick="Financeiro.abrirDespesa(${d.id})">
        <td>
          <div style="font-weight:600">${escapar(d.descricao)}</div>
          ${d.documento ? `<div style="font-size:11px;color:var(--txt3)">${escapar(d.documento)}</div>` : ''}
          ${d.qtd_anexos ? `<div style="font-size:11px;color:var(--txt3)">📎 ${d.qtd_anexos}</div>` : ''}
        </td>
        <td>${escapar(d.fornecedor || '—')}</td>
        <td style="font-size:12.5px">${d.centro_codigo ? escapar(d.centro_codigo) : '<span class="c-txt3">—</span>'}</td>
        <td class="mono" style="font-size:12px">${dataBR(d.vencimento)}
          ${d.vencida ? '<br><span class="c-red" style="font-size:11px">vencida</span>' : ''}</td>
        <td class="mono">${moedaBR(d.valor)}</td>
        <td>${d.status === 'paga'
              ? `<span class="badge badge-green">paga</span>`
              : d.status === 'cancelada'
                ? '<span class="badge badge-cinza">cancelada</span>'
                : `<span class="badge ${d.vencida ? 'badge-red' : 'badge-blue'}">em aberto</span>`}</td>
        <td class="acoes">
          ${d.status === 'aberta' ? `<button class="btn-ico" onclick="Financeiro.pagarDespesa(${d.id})" title="Dar baixa">✅</button>` : ''}
          <button class="btn-ico" onclick="Financeiro.abrirDespesa(${d.id})" title="Editar">✏️</button>
          <button class="btn-ico perigo" onclick="Financeiro.excluirDespesa(${d.id})" title="Excluir">🗑️</button>
        </td>
      </tr>`).join('');

    const total = this.despesas.reduce((s, d) => s + d.valor, 0);
    const pago = this.despesas.filter(d => d.status === 'paga').reduce((s, d) => s + d.valor, 0);
    document.getElementById('despTotal').textContent =
      `${this.despesas.length} despesa(s) · total ${moedaBR(total)} · pago ${moedaBR(pago)}`;
  },

  async abrirDespesa(id = null) {
    await this.garantirCentros();
    this.editandoDespesa = id;
    limparFormulario('formDespesa');

    if (id) {
      const d = this.despesas.find(x => x.id === id);
      preencherFormulario('formDespesa', { ...d, valor: Number(d.valor).toFixed(2).replace('.', ',') });
      document.getElementById('despCentro').innerHTML = this.opcoesCentros(d.centro_custo_id);
      document.getElementById('despTitulo').textContent = d.descricao;
      UI.painelAnexos('despAnexos', 'despesa', id);
    } else {
      document.getElementById('despCentro').innerHTML = this.opcoesCentros();
      document.getElementById('formDespesa').querySelector('[data-campo=status]').value = 'aberta';
      document.getElementById('despTitulo').textContent = 'Nova despesa';
      document.getElementById('despAnexos').innerHTML =
        '<div class="form-hint">Salve a despesa para anexar a nota fiscal.</div>';
    }
    abrirModal('modalDespesa');
  },

  async salvarDespesa() {
    const d = lerFormulario('formDespesa');
    d.valor = paraNumero(d.valor);
    d.centro_custo_id = document.getElementById('despCentro').value || null;

    if (!d.descricao) return toastErro('Descreva a despesa.');
    if (!(d.valor > 0)) return toastErro('Informe o valor.');

    try {
      if (this.editandoDespesa) {
        await Api.put('/api/financeiro/despesas/' + this.editandoDespesa, d);
        toast('Despesa atualizada.');
        fecharModal('modalDespesa');
      } else {
        const r = await Api.post('/api/financeiro/despesas', d);
        this.editandoDespesa = r.id;
        toast('Despesa lançada. Agora você pode anexar a nota.');
        UI.painelAnexos('despAnexos', 'despesa', r.id);
      }
      this.centros = [];
      this.carregarDespesas();
    } catch (e) { toastErro(e.message); }
  },

  async pagarDespesa(id) {
    const d = this.despesas.find(x => x.id === id);
    const ok = await confirmar(`Registrar o pagamento de ${moedaBR(d.valor)} — ${d.descricao}?`,
      { titulo: 'Baixa de despesa', textoOk: 'Confirmar', perigo: false });
    if (!ok) return;
    try {
      await Api.post(`/api/financeiro/despesas/${id}/pagar`, {});
      toast('Despesa quitada.');
      this.centros = [];
      this.carregarDespesas();
    } catch (e) { toastErro(e.message); }
  },

  async excluirDespesa(id) {
    const ok = await confirmar('Excluir esta despesa?', { titulo: 'Excluir despesa', textoOk: 'Excluir' });
    if (!ok) return;
    try {
      await Api.excluir('/api/financeiro/despesas/' + id);
      toast('Despesa excluída.');
      this.centros = [];
      this.carregarDespesas();
    } catch (e) { toastErro(e.message); }
  },

  // ══════════════════ CENTROS DE CUSTO ════════════════════════
  async carregarCentros() {
    const alvo = document.getElementById('centrosLista');
    alvo.innerHTML = '<div class="vazio"><span class="spinner"></span></div>';

    try { this.centros = await Api.get('/api/financeiro/centros-custo'); }
    catch (e) {
      alvo.innerHTML = `<div class="vazio"><span class="ico">⚠️</span><div class="titulo">${escapar(e.message)}</div></div>`;
      return;
    }

    if (!this.centros.length) {
      alvo.innerHTML = `<div class="vazio"><span class="ico">🏷️</span>
        <div class="titulo">Nenhum centro de custo</div>
        <div class="sub">Crie um para cada evento, taxa ou serviço que precise ser prestado conta.</div></div>`;
      return;
    }

    alvo.innerHTML = this.centros.map(c => {
      const saldo = c.saldo_realizado;
      const pct = c.receita_prevista ? Math.round(c.receita_recebida / c.receita_prevista * 100) : 0;
      return `
        <div class="card card-p">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
            <div style="flex:1;min-width:0">
              <div style="font-size:14.5px;font-weight:700">${escapar(c.nome)}</div>
              <div class="mono" style="font-size:11.5px;color:var(--txt3);margin-top:2px">${escapar(c.codigo)}</div>
            </div>
            <span class="badge badge-cinza">${TIPOS_CENTRO[c.tipo] || c.tipo}</span>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:14px 0 11px;font-size:12.5px">
            <div><div class="c-txt2" style="font-size:11px">RECEITA PREVISTA</div>
              <div class="mono" style="font-weight:700">${moedaBR(c.receita_prevista)}</div></div>
            <div><div class="c-txt2" style="font-size:11px">RECEBIDO</div>
              <div class="mono c-green" style="font-weight:700">${moedaBR(c.receita_recebida)}</div></div>
            <div><div class="c-txt2" style="font-size:11px">DESPESAS</div>
              <div class="mono c-red" style="font-weight:700">${moedaBR(c.despesa_total)}</div></div>
            <div><div class="c-txt2" style="font-size:11px">SALDO REALIZADO</div>
              <div class="mono ${saldo >= 0 ? 'c-green' : 'c-red'}" style="font-weight:700">${moedaBR(saldo)}</div></div>
          </div>

          <div class="barra mb-2"><i style="width:${pct}%"></i></div>
          <div style="font-size:11px;color:var(--txt3)">
            ${c.itens_pagos}/${c.itens} cobranças pagas${c.orcamento_previsto > 0 ? ` · orçamento ${moedaBR(c.orcamento_previsto)}` : ''}
          </div>

          <div style="display:flex;align-items:center;justify-content:space-between;padding-top:11px;margin-top:11px;border-top:1px solid var(--border)">
            <span style="font-size:11.5px;color:var(--txt3)">${c.ativo ? 'ativo' : 'inativo'}</span>
            <div>
              <button class="btn-ico" onclick="Financeiro.verFechamento(${c.id})" title="Fechamento">📊</button>
              <button class="btn-ico" onclick="Financeiro.abrirCentro(${c.id})" title="Editar">✏️</button>
              <button class="btn-ico perigo" onclick="Financeiro.excluirCentro(${c.id})" title="Excluir">🗑️</button>
            </div>
          </div>
        </div>`;
    }).join('');
  },

  abrirCentro(id = null) {
    this.editandoCentro = id;
    limparFormulario('formCentro');

    if (id) {
      const c = this.centros.find(x => x.id === id);
      preencherFormulario('formCentro', {
        ...c, orcamento_previsto: Number(c.orcamento_previsto).toFixed(2).replace('.', ','),
      });
      document.getElementById('centroTitulo').textContent = c.nome;
    } else {
      document.getElementById('formCentro').querySelector('[data-campo=ativo]').checked = true;
      document.getElementById('formCentro').querySelector('[data-campo=tipo]').value = 'evento';
      document.getElementById('centroTitulo').textContent = 'Novo centro de custo';
    }
    abrirModal('modalCentro');
  },

  async salvarCentro() {
    const d = lerFormulario('formCentro');
    d.orcamento_previsto = paraNumero(d.orcamento_previsto);
    if (!d.nome) return toastErro('Informe o nome do centro de custo.');

    try {
      if (this.editandoCentro) {
        await Api.put('/api/financeiro/centros-custo/' + this.editandoCentro, d);
        toast('Centro de custo atualizado.');
      } else {
        const r = await Api.post('/api/financeiro/centros-custo', d);
        toast(`Centro criado com o código ${r.codigo}.`);
      }
      fecharModal('modalCentro');
      this.centros = [];
      this.carregarCentros();
    } catch (e) { toastErro(e.message); }
  },

  async excluirCentro(id) {
    const ok = await confirmar('Excluir este centro de custo?', { titulo: 'Excluir centro', textoOk: 'Excluir' });
    if (!ok) return;
    try {
      await Api.excluir('/api/financeiro/centros-custo/' + id);
      toast('Centro excluído.');
      this.centros = [];
      this.carregarCentros();
    } catch (e) { toastErro(e.message); }
  },

  /** Prestação de contas: quanto entrou, quanto saiu, o que falta. */
  async verFechamento(id) {
    let c;
    try { c = await Api.get('/api/financeiro/centros-custo/' + id); }
    catch (e) { return toastErro(e.message); }

    const r = c.resumo;
    document.getElementById('fechTitulo').textContent = c.nome;
    document.getElementById('fechSub').textContent =
      `${c.codigo} · ${TIPOS_CENTRO[c.tipo] || c.tipo}` +
      (c.data_inicio ? ` · ${dataBR(c.data_inicio)}${c.data_fim ? ' a ' + dataBR(c.data_fim) : ''}` : '');
    document.getElementById('btnImprimirFechamento').onclick = () => this.imprimirFechamento(c);

    document.getElementById('fechCorpo').innerHTML = `
      <div class="stat-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
        <div class="stat-card"><div class="stat-label">Receita prevista</div><div class="stat-val">${moedaBR(r.receita_prevista)}</div>
          <div class="stat-sub">${r.itens} cobrança(s)</div></div>
        <div class="stat-card"><div class="stat-label">Recebido</div><div class="stat-val c-green">${moedaBR(r.receita_recebida)}</div>
          <div class="stat-sub">${r.itens_pagos} paga(s)</div></div>
        <div class="stat-card"><div class="stat-label">A receber</div><div class="stat-val c-blue">${moedaBR(r.receita_pendente)}</div></div>
        <div class="stat-card"><div class="stat-label">Despesas</div><div class="stat-val c-red">${moedaBR(r.despesa_total)}</div>
          <div class="stat-sub">${moedaBR(r.despesa_paga)} paga(s)</div></div>
        <div class="stat-card"><div class="stat-label">Saldo realizado</div>
          <div class="stat-val ${r.saldo_realizado >= 0 ? 'c-green' : 'c-red'}">${moedaBR(r.saldo_realizado)}</div>
          <div class="stat-sub">previsto ${moedaBR(r.saldo_previsto)}</div></div>
      </div>

      ${c.orcamento_previsto > 0 ? `
        <div class="card card-p mb-4" style="padding:13px 16px">
          <div style="font-size:12.5px">
            Orçamento previsto: <strong class="mono">${moedaBR(c.orcamento_previsto)}</strong> ·
            gasto: <strong class="mono ${r.despesa_total > c.orcamento_previsto ? 'c-red' : 'c-green'}">${moedaBR(r.despesa_total)}</strong>
            ${r.despesa_total > c.orcamento_previsto ? ' — <strong class="c-red">estourou o orçamento</strong>' : ''}
          </div>
        </div>` : ''}

      <div class="secao-titulo">Cobranças deste centro</div>
      ${c.cobrancas.length ? `
        <div class="tabela-wrap mb-4"><table class="tabela">
          <thead><tr><th>Descrição</th><th>Valor</th><th>Alcance</th><th>Alunos</th></tr></thead>
          <tbody>${c.cobrancas.map(x => `
            <tr><td>${escapar(x.descricao)}</td><td class="mono">${moedaBR(x.valor)}</td>
                <td>${ESCOPOS[x.escopo]}</td><td>${x.alunos}</td></tr>`).join('')}</tbody>
        </table></div>` : '<div class="form-hint mb-4">Nenhuma cobrança vinculada.</div>'}

      <div class="secao-titulo">Despesas</div>
      ${c.despesas.length ? `
        <div class="tabela-wrap mb-4"><table class="tabela">
          <thead><tr><th>Descrição</th><th>Fornecedor</th><th>Vencimento</th><th>Valor</th><th>Situação</th></tr></thead>
          <tbody>${c.despesas.map(x => `
            <tr><td>${escapar(x.descricao)}</td><td>${escapar(x.fornecedor || '—')}</td>
                <td class="mono" style="font-size:12px">${dataBR(x.vencimento)}</td>
                <td class="mono">${moedaBR(x.valor)}</td>
                <td>${x.status === 'paga' ? '<span class="badge badge-green">paga</span>' : '<span class="badge badge-blue">em aberto</span>'}</td></tr>`).join('')}</tbody>
        </table></div>` : '<div class="form-hint mb-4">Nenhuma despesa lançada.</div>'}

      <div class="secao-titulo">Quem já pagou</div>
      <div class="tabela-wrap"><div class="tabela-scroll" style="max-height:34vh"><table class="tabela">
        <thead><tr><th>Aluno</th><th>Turma</th><th>Cobrança</th><th>Competência</th><th>Valor</th><th>Situação</th></tr></thead>
        <tbody>${c.recebimentos.map(x => `
          <tr><td>${escapar(x.aluno_nome)}</td><td>${escapar(x.turma_nome || '—')}</td>
              <td style="font-size:12px">${escapar(x.descricao)}</td>
              <td class="mono" style="font-size:12px">${competenciaBR(x.competencia)}</td>
              <td class="mono">${moedaBR(x.valor)}</td>
              <td>${x.status === 'paga' ? '<span class="badge badge-green">paga</span>' : badgeFinanceiro('aberta')}</td></tr>`).join('')}</tbody>
      </table></div></div>`;

    abrirModal('modalFechamento');
  },

  async imprimirFechamento(c) {
    const e = await Relatorios.carregarEscola();
    const r = c.resumo;

    const corpo = `
      <div class="ficha-secao">Resumo</div>
      <div class="ficha-linha"><span class="rotulo">Receita prevista</span><span class="valor">${moedaBR(r.receita_prevista)} em ${r.itens} cobrança(s)</span></div>
      <div class="ficha-linha"><span class="rotulo">Receita recebida</span><span class="valor">${moedaBR(r.receita_recebida)} (${r.itens_pagos} paga[s])</span></div>
      <div class="ficha-linha"><span class="rotulo">A receber</span><span class="valor">${moedaBR(r.receita_pendente)}</span></div>
      <div class="ficha-linha"><span class="rotulo">Despesas lançadas</span><span class="valor">${moedaBR(r.despesa_total)} · pagas ${moedaBR(r.despesa_paga)}</span></div>
      <div class="ficha-linha"><span class="rotulo">Saldo realizado</span><span class="valor">${moedaBR(r.saldo_realizado)}</span></div>
      <div class="ficha-linha"><span class="rotulo">Saldo previsto</span><span class="valor">${moedaBR(r.saldo_previsto)}</span></div>
      ${c.orcamento_previsto > 0 ? `<div class="ficha-linha"><span class="rotulo">Orçamento previsto</span><span class="valor">${moedaBR(c.orcamento_previsto)}</span></div>` : ''}

      <div class="ficha-secao">Despesas</div>
      ${c.despesas.length ? Relatorios.tabela(
        ['Descrição', 'Fornecedor', 'Documento', 'Vencimento', 'Pagamento', 'Valor', 'Situação'],
        c.despesas.map(x => [x.descricao, x.fornecedor, x.documento, dataBR(x.vencimento),
                             dataBR(x.data_pagamento), moedaBR(x.valor), x.status])
      ) : '<div class="vazio-doc">Nenhuma despesa lançada.</div>'}

      <div class="ficha-secao">Cobranças por aluno</div>
      ${c.recebimentos.length ? Relatorios.tabela(
        ['Aluno', 'Turma', 'Cobrança', 'Competência', 'Valor', 'Situação'],
        c.recebimentos.map(x => [x.aluno_nome, x.turma_nome, x.descricao,
                                 competenciaBR(x.competencia), moedaBR(x.valor),
                                 x.status === 'paga' ? 'Paga' : 'Em aberto'])
      ) : '<div class="vazio-doc">Nenhuma cobrança lançada.</div>'}

      <div class="assinaturas"><div>Responsável pelo evento</div><div>Direção</div></div>`;

    Relatorios.publicar(`Prestação de Contas — ${c.nome}`, corpo, c.codigo, e);
  },
});

// O modal de planos e a aba de planos mostram a mesma lista:
// ao mexer num, o outro acompanha.
const _listarPlanosOriginal = Financeiro.listarPlanos.bind(Financeiro);
Financeiro.listarPlanos = async function () {
  await _listarPlanosOriginal();
  if (document.getElementById('cadaba-planos')?.classList.contains('active')) {
    this.carregarPlanosTabela();
  }
};

// A aba de recebimentos ganhou a coluna de seleção; o corpo é
// redesenhado aqui para incluir a caixa de marcação.
const _carregarParcelasOriginal = Financeiro.carregarParcelas.bind(Financeiro);

Financeiro.carregarParcelas = async function () {
  await _carregarParcelasOriginal();

  const corpo = document.getElementById('finCorpo');
  const linhas = corpo.querySelectorAll('tr');

  linhas.forEach(tr => {
    if (tr.querySelector('.vazio') || tr.querySelector('.spinner')) return;
    if (tr.querySelector('input[data-parcela]')) return;

    const idx = [...corpo.querySelectorAll('tr')].indexOf(tr);
    const m = this.parcelas[idx];
    const td = document.createElement('td');
    td.innerHTML = (m && m.saldo > 0 && m.status === 'aberta')
      ? `<input type="checkbox" data-parcela="${m.id}" data-saldo="${m.saldo}" onchange="Financeiro.atualizarLote()">`
      : '';
    tr.insertBefore(td, tr.firstChild);
  });

  document.getElementById('finMarcarTodos').checked = false;
  this.atualizarLote();
};

// ── Ligação das páginas ao menu ──────────────────────────────
Carregadores['fin-painel'] = () => Financeiro.carregarResumo();
Carregadores['fin-cadastros'] = () => Financeiro.abrirAbaCadastro(
  document.querySelector('#pagina-fin-cadastros .aba-conteudo.active')?.id.replace('cadaba-', '') || 'planos');
Carregadores['fin-recebimentos'] = () => Financeiro.abrirAbaRecebimento(
  document.querySelector('#pagina-fin-recebimentos .aba-conteudo.active')?.id.replace('recaba-', '') || 'mensalidades');
Carregadores['fin-pagamentos'] = () => Financeiro.carregarDespesas();

document.addEventListener('DOMContentLoaded', () => {
  ['cobrFiltroCentro', 'cobrFiltroAtiva'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', () => Financeiro.carregarCobrancas()));
  ['despFiltroCentro', 'despFiltroStatus'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', () => Financeiro.carregarDespesas()));

  ['valor', 'ocorrencias'].forEach(campo => {
    document.querySelector(`#formCobrancaVar [data-campo="${campo}"]`)
      ?.addEventListener('input', () => Financeiro.previaCobranca());
  });
  ['cobrVarTurma', 'cobrVarTurno', 'cobrVarAluno'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', () => Financeiro.previaCobranca()));
  document.querySelector('#formCobrancaVar [data-campo=modo]')
    ?.addEventListener('change', () => Financeiro.trocarPeriodicidade());
});

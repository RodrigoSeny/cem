/* ══════════════════════════════════════════════════════════════
   CEM — Pedagógico: listas de material e checklist por aluno
   ══════════════════════════════════════════════════════════════ */

const Pedagogico = {
  listas: [],
  editandoLista: null,
  itensLista: [],
  resumoTurma: [],
  alunoAtual: null,
  itensChecklist: [],

  // ══════════════════════ LISTAS DE MATERIAL ═══════════════════
  async carregarListas() {
    const corpo = document.getElementById('pedListasCorpo');
    corpo.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:26px"><span class="spinner"></span></td></tr>`;

    try { this.listas = await Api.get('/api/material/listas'); }
    catch (e) {
      corpo.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:26px;color:var(--red)">${escapar(e.message)}</td></tr>`;
      return;
    }

    if (!this.listas.length) {
      corpo.innerHTML = `<tr><td colspan="7"><div class="vazio">
        <span class="ico">🎒</span><div class="titulo">Nenhuma lista cadastrada</div>
        <div class="sub">Crie a lista de material entregue na matrícula.</div></div></td></tr>`;
      document.getElementById('pedListasTotal').textContent = 'Nenhum registro';
      return;
    }

    corpo.innerHTML = this.listas.map(l => `
      <tr class="clicavel" ondblclick="Pedagogico.abrirLista(${l.id})">
        <td style="font-weight:600">${escapar(l.nome)}</td>
        <td>${l.tipo === 'coletivo' ? 'Coletivo' : 'Individual'}</td>
        <td>${l.escopo === 'geral' ? '<span class="badge badge-blue">Geral</span>' : '<span class="badge badge-purple">Por turma</span>'}</td>
        <td>${l.qtd_itens}</td>
        <td>${l.escopo === 'geral' ? '—' : (l.qtd_turmas || '<span class="c-txt3">nenhuma</span>')}</td>
        <td>${l.ativa ? '<span class="badge badge-green">ativa</span>' : '<span class="badge badge-cinza">inativa</span>'}</td>
        <td class="acoes">
          <button class="btn-ico" onclick="Pedagogico.abrirLista(${l.id})" title="Editar">✏️</button>
          <button class="btn-ico perigo" onclick="Pedagogico.excluirLista(${l.id})" title="Excluir">🗑️</button>
        </td>
      </tr>`).join('');

    document.getElementById('pedListasTotal').textContent = `${this.listas.length} lista(s)`;
  },

  async abrirLista(id = null) {
    this.editandoLista = id;
    limparFormulario('formListaMaterial');
    const form = document.getElementById('formListaMaterial');
    form.querySelector('[data-campo=tipo]').value = 'coletivo';
    form.querySelector('[data-campo=escopo]').value = 'turma';
    form.querySelector('[data-campo=ativa]').checked = true;
    document.getElementById('btnDuplicarListaMaterial').style.display = 'none';
    document.getElementById('listaItensBox').classList.add('oculto');
    document.getElementById('listaTurmasBox').classList.add('oculto');
    this.itensLista = [];

    if (id) {
      const l = this.listas.find(x => x.id === id);
      if (!l) return;
      preencherFormulario('formListaMaterial', {
        ...l,
        valor_alternativo: l.valor_alternativo != null ? Number(l.valor_alternativo).toFixed(2).replace('.', ',') : '',
      });
      form.querySelector('[data-campo=ativa]').checked = !!l.ativa;
      document.getElementById('modalListaMaterialTitulo').textContent = l.nome;
      document.getElementById('btnDuplicarListaMaterial').style.display = '';
      await this.carregarItensLista();
      await this.carregarTurmasLista();
      this.mudarEscopoLista();
    } else {
      document.getElementById('modalListaMaterialTitulo').textContent = 'Nova lista de material';
    }
    abrirModal('modalListaMaterial');
  },

  mudarEscopoLista() {
    const escopo = document.getElementById('formListaMaterial').querySelector('[data-campo=escopo]').value;
    document.getElementById('listaTurmasBox').classList.toggle('oculto', escopo !== 'turma' || !this.editandoLista);
  },

  async salvarLista() {
    const d = lerFormulario('formListaMaterial');
    d.ativa = document.getElementById('formListaMaterial').querySelector('[data-campo=ativa]').checked;
    if (!d.nome) return toastErro('Informe o nome da lista.');
    d.valor_alternativo = d.valor_alternativo ? paraNumero(d.valor_alternativo) : null;

    try {
      if (this.editandoLista) {
        await Api.put('/api/material/listas/' + this.editandoLista, d);
        toast('Lista atualizada.');
      } else {
        const r = await Api.post('/api/material/listas', d);
        this.editandoLista = r.id;
        document.getElementById('btnDuplicarListaMaterial').style.display = '';
        toast('Lista criada. Agora cadastre os itens.');
      }
      await this.carregarListas();
      const atualizado = this.listas.find(x => x.id === this.editandoLista);
      if (atualizado) document.getElementById('modalListaMaterialTitulo').textContent = atualizado.nome;
      await this.carregarItensLista();
      await this.carregarTurmasLista();
      this.mudarEscopoLista();
    } catch (e) { toastErro(e.message); }
  },

  async duplicarLista() {
    if (!this.editandoLista) return;
    try {
      const r = await Api.post(`/api/material/listas/${this.editandoLista}/duplicar`);
      toast('Lista duplicada. Escolha as turmas da cópia.');
      await this.carregarListas();
      this.abrirLista(r.id);
    } catch (e) { toastErro(e.message); }
  },

  async excluirLista(id) {
    const ok = await confirmar('Excluir esta lista de material?', { titulo: 'Excluir lista', textoOk: 'Excluir' });
    if (!ok) return;
    try {
      await Api.excluir('/api/material/listas/' + id);
      toast('Lista excluída.');
      this.carregarListas();
    } catch (e) { toastErro(e.message); }
  },

  // ── Itens da lista ───────────────────────────────────────────
  async carregarItensLista() {
    if (!this.editandoLista) return;
    try { this.itensLista = await Api.get(`/api/material/listas/${this.editandoLista}/itens`); }
    catch { this.itensLista = []; }
    document.getElementById('listaItensBox').classList.remove('oculto');
    this.renderItensLista();
  },

  renderItensLista() {
    const corpo = document.getElementById('listaItensCorpo');
    if (!this.itensLista.length) {
      corpo.innerHTML = `<tr><td colspan="4"><div class="vazio" style="padding:14px"><div class="sub">Nenhum item ainda.</div></div></td></tr>`;
      return;
    }
    corpo.innerHTML = this.itensLista.map((it, i) => `
      <tr>
        <td><input type="number" min="1" class="form-input" style="width:70px" value="${it.quantidade}"
              onchange="Pedagogico.itensLista[${i}].quantidade = Number(this.value) || 1"></td>
        <td><input class="form-input" value="${escapar(it.descricao)}"
              onchange="Pedagogico.itensLista[${i}].descricao = this.value"></td>
        <td><input class="form-input" value="${escapar(it.observacao || '')}"
              onchange="Pedagogico.itensLista[${i}].observacao = this.value"></td>
        <td class="acoes"><button class="btn-ico perigo" onclick="Pedagogico.removerItemLista(${i})" title="Remover">🗑️</button></td>
      </tr>`).join('');
  },

  adicionarItemLista() {
    this.itensLista.push({ quantidade: 1, descricao: '', observacao: '' });
    this.renderItensLista();
  },

  removerItemLista(i) {
    this.itensLista.splice(i, 1);
    this.renderItensLista();
  },

  async salvarItensLista() {
    if (!this.editandoLista) return;
    try {
      await Api.put(`/api/material/listas/${this.editandoLista}/itens`, { itens: this.itensLista });
      toast('Itens salvos.');
      await this.carregarItensLista();
      await this.carregarListas();
    } catch (e) { toastErro(e.message); }
  },

  // ── Turmas vinculadas ────────────────────────────────────────
  async carregarTurmasLista() {
    if (!this.editandoLista) return;
    let vinculadas = [];
    try { vinculadas = await Api.get(`/api/material/listas/${this.editandoLista}/turmas`); } catch {}
    const idsVinculados = new Set(vinculadas.map(v => v.turma_id));

    document.getElementById('listaTurmasChecks').innerHTML = Cache.turmas.map(t => `
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;background:var(--card);padding:6px 10px;border-radius:8px;border:1px solid var(--border)">
        <input type="checkbox" data-turma-check="${t.id}" ${idsVinculados.has(t.id) ? 'checked' : ''}>
        ${escapar(t.nome)}
      </label>`).join('') || '<div class="form-hint">Nenhuma turma cadastrada ainda.</div>';
  },

  async salvarTurmasLista() {
    if (!this.editandoLista) return;
    const turma_ids = [...document.querySelectorAll('[data-turma-check]:checked')].map(el => Number(el.dataset.turmaCheck));
    try {
      await Api.put(`/api/material/listas/${this.editandoLista}/turmas`, { turma_ids });
      toast('Turmas atualizadas.');
      await this.carregarListas();
    } catch (e) { toastErro(e.message); }
  },

  // ══════════════════════ CHECKLIST POR ALUNO ══════════════════
  carregarChecklistPagina() {
    document.getElementById('pedChecklistTurma').innerHTML = Cache.opcoesTurmas('', 'Selecione a turma');
    document.getElementById('pedResumoCorpo').innerHTML = `<tr><td colspan="4"><div class="vazio" style="padding:20px">
      <div class="sub">Selecione uma turma para ver os alunos.</div></div></td></tr>`;
    document.getElementById('pedResumoTotal').textContent = '—';
  },

  async carregarResumoTurma() {
    const turmaId = document.getElementById('pedChecklistTurma').value;
    const corpo = document.getElementById('pedResumoCorpo');
    if (!turmaId) return this.carregarChecklistPagina();

    corpo.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:26px"><span class="spinner"></span></td></tr>`;
    try { this.resumoTurma = await Api.get(`/api/material/turmas/${turmaId}/checklist-resumo`); }
    catch (e) {
      corpo.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:26px;color:var(--red)">${escapar(e.message)}</td></tr>`;
      return;
    }

    if (!this.resumoTurma.length) {
      corpo.innerHTML = `<tr><td colspan="4"><div class="vazio" style="padding:20px">
        <span class="ico">🎓</span><div class="titulo">Nenhum aluno nesta turma</div></div></td></tr>`;
      document.getElementById('pedResumoTotal').textContent = 'Nenhum registro';
      return;
    }

    corpo.innerHTML = this.resumoTurma.map(a => `
      <tr class="clicavel" ondblclick="Pedagogico.abrirChecklist(${a.id})">
        <td style="font-weight:600">${escapar(a.nome)}</td>
        <td class="mono" style="font-size:12px">${escapar(a.matricula)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:9px">
            <div class="barra" style="flex:1"><i style="width:${a.percentual}%;${a.percentual === 100 ? 'background:var(--green)' : ''}"></i></div>
            <span class="mono" style="font-size:11.5px;color:var(--txt2);white-space:nowrap">${a.entregues}/${a.total_itens}</span>
          </div>
        </td>
        <td class="acoes"><button class="btn-ico" onclick="Pedagogico.abrirChecklist(${a.id})" title="Abrir checklist">📋</button></td>
      </tr>`).join('');

    document.getElementById('pedResumoTotal').textContent = `${this.resumoTurma.length} aluno(s)`;
  },

  async abrirChecklist(alunoId) {
    let dados;
    try { dados = await Api.get(`/api/material/alunos/${alunoId}/checklist`); }
    catch (e) { return toastErro(e.message); }

    this.alunoAtual = dados.aluno;
    this.itensChecklist = dados.itens;
    document.getElementById('modalChecklistTitulo').textContent = dados.aluno.nome;
    document.getElementById('modalChecklistSub').textContent = dados.aluno.turma_nome || 'Sem turma';
    this.renderChecklistAluno();
    abrirModal('modalChecklistAluno');
  },

  renderChecklistAluno() {
    const corpo = document.getElementById('checklistAlunoCorpo');
    if (!this.itensChecklist.length) {
      corpo.innerHTML = `<div class="vazio" style="padding:20px">
        <span class="ico">🎒</span><div class="titulo">Nenhuma lista se aplica a este aluno</div>
        <div class="sub">Vincule uma lista geral ou à turma dele em "Listas de Material".</div></div>`;
      return;
    }

    const pendentes = this.itensChecklist.some(i => !i.enviado);
    const acoes = `<div style="display:flex;justify-content:flex-end;margin-bottom:8px">
      <button class="btn btn-ghost btn-sm" onclick="Pedagogico.marcarTodos(${pendentes})">
        ${pendentes ? '☑️ Marcar tudo como entregue' : '↩️ Desmarcar tudo'}
      </button>
    </div>`;

    const porLista = {};
    for (const it of this.itensChecklist) (porLista[it.lista_nome] ||= []).push(it);

    corpo.innerHTML = acoes + Object.entries(porLista).map(([nome, itens]) => `
      <div class="secao-titulo" style="margin-top:12px">${escapar(nome)}</div>
      ${itens.map(it => `
        <label style="display:flex;align-items:center;gap:10px;padding:6px 0;font-size:13.5px;border-bottom:1px solid var(--border)">
          <input type="checkbox" ${it.enviado ? 'checked' : ''} onchange="Pedagogico.marcarItem(${it.id}, this.checked)">
          <span style="flex:1">${it.quantidade > 1 ? `${it.quantidade}x ` : ''}${escapar(it.descricao)}${it.observacao ? ` <span style="color:var(--txt3)">(${escapar(it.observacao)})</span>` : ''}</span>
          ${it.enviado && it.enviado_em ? `<span style="font-size:11px;color:var(--txt3)">${dataBR(it.enviado_em)}</span>` : ''}
        </label>`).join('')}
    `).join('');
  },

  async marcarItem(itemId, enviado) {
    try {
      await Api.post(`/api/material/alunos/${this.alunoAtual.id}/itens/${itemId}`, { enviado });
      await this.abrirChecklist(this.alunoAtual.id);
      this.carregarResumoTurma();
    } catch (e) { toastErro(e.message); }
  },

  async marcarTodos(enviado) {
    const item_ids = this.itensChecklist.map(i => i.id);
    try {
      await Api.post(`/api/material/alunos/${this.alunoAtual.id}/itens/lote`, { item_ids, enviado });
      await this.abrirChecklist(this.alunoAtual.id);
      this.carregarResumoTurma();
    } catch (e) { toastErro(e.message); }
  },

  // ── Impressão (reaproveita Relatorios.publicar) ──────────────
  async imprimirListaPais() {
    if (!this.alunoAtual || !this.itensChecklist.length) return toastErro('Nada para imprimir.');
    const e = await Relatorios.carregarEscola();

    const porLista = {};
    for (const it of this.itensChecklist) {
      (porLista[it.lista_nome] ||= { itens: [], obs: it.lista_observacoes, valor: it.valor_alternativo }).itens.push(it);
    }

    const corpo = Object.entries(porLista).map(([nome, grupo]) => `
      <div class="ficha-secao">${escapar(nome)}</div>
      ${Relatorios.tabela(['Qtd.', 'Descrição'],
        grupo.itens.map(it => [it.quantidade, `${it.descricao}${it.observacao ? ` (${it.observacao})` : ''}`]))}
      ${grupo.obs ? `<div style="font-size:10.5px;margin-top:6px;color:#555">${escapar(grupo.obs)}</div>` : ''}
      ${grupo.valor ? `<div style="font-size:10.5px;margin-top:4px;font-weight:700">Valor alternativo: ${moedaBR(grupo.valor)}</div>` : ''}
    `).join('');

    Relatorios.publicar('Lista de Material', corpo,
      `${this.alunoAtual.nome} · ${this.alunoAtual.turma_nome || 'sem turma'}`, e);
  },

  async imprimirChecklist() {
    if (!this.alunoAtual || !this.itensChecklist.length) return toastErro('Nada para imprimir.');
    const e = await Relatorios.carregarEscola();

    const corpo = Relatorios.tabela(
      ['Lista', 'Qtd.', 'Descrição', 'Status', 'Data', 'Marcado por'],
      this.itensChecklist.map(it => [
        it.lista_nome, it.quantidade, it.descricao,
        it.enviado ? 'Entregue' : 'Pendente',
        it.enviado_em ? dataHoraBR(it.enviado_em) : '',
        it.marcado_por_nome || '',
      ])
    );

    Relatorios.publicar('Checklist de Material — Controle Interno', corpo,
      `${this.alunoAtual.nome} · ${this.alunoAtual.turma_nome || 'sem turma'}`, e);
  },
};

Carregadores['ped-listas'] = () => Pedagogico.carregarListas();
Carregadores['ped-checklist'] = () => Pedagogico.carregarChecklistPagina();

/* ══════════════════════════════════════════════════════════════
   CEM — Ocorrências (histórico do aluno)
   ══════════════════════════════════════════════════════════════ */

const Ocorrencias = {
  lista: [],
  tipos: [],
  editandoId: null,

  async carregarTipos() {
    if (this.tipos.length) return this.tipos;
    try { this.tipos = await Api.get('/api/ocorrencias/tipos'); }
    catch { this.tipos = [{ id: 'outro', nome: 'Outro', gravidade: 'informativa' }]; }
    return this.tipos;
  },

  filtros() {
    return {
      aluno_id: document.getElementById('ocorrAluno').value,
      turma_id: document.getElementById('ocorrTurma').value,
      tipo: document.getElementById('ocorrTipo').value,
      gravidade: document.getElementById('ocorrGravidade').value,
      de: document.getElementById('ocorrDe').value,
      ate: document.getElementById('ocorrAte').value,
    };
  },

  async carregar() {
    await this.carregarTipos();
    this.montarFiltros();

    const corpo = document.getElementById('ocorrCorpo');
    corpo.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:26px"><span class="spinner"></span></td></tr>`;

    try { this.lista = await Api.get('/api/ocorrencias', this.filtros()); }
    catch (e) {
      corpo.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:26px;color:var(--red)">${escapar(e.message)}</td></tr>`;
      return;
    }

    if (!this.lista.length) {
      corpo.innerHTML = `<tr><td colspan="8"><div class="vazio">
        <span class="ico">📌</span><div class="titulo">Nenhuma ocorrência registrada</div>
        <div class="sub">Registre acidentes, incidentes, atendimentos e elogios.</div></div></td></tr>`;
      document.getElementById('ocorrTotal').textContent = 'Nenhum registro';
      return;
    }

    const nomeTipo = id => this.tipos.find(t => t.id === id)?.nome || id;

    corpo.innerHTML = this.lista.map(o => `
      <tr class="clicavel" ondblclick="Ocorrencias.abrirEdicao(${o.id})">
        <td class="mono" style="font-size:12px;white-space:nowrap">
          ${dataBR(o.data_ocorrencia)}${o.hora_ocorrencia ? `<br><span class="c-txt3">${escapar(o.hora_ocorrencia)}</span>` : ''}
        </td>
        <td>
          <div style="font-weight:600">${escapar(o.aluno_nome)}</div>
          <div style="font-size:11px;color:var(--txt3)">${escapar(o.turma_nome || 'sem turma')}</div>
        </td>
        <td><span class="badge badge-cinza">${escapar(nomeTipo(o.tipo))}</span></td>
        <td>
          <div style="font-weight:600;font-size:12.5px">${escapar(o.titulo)}</div>
          ${o.qtd_anexos ? `<div style="font-size:11px;color:var(--txt3)">📎 ${o.qtd_anexos} anexo(s)</div>` : ''}
        </td>
        <td>${badgeGravidade(o.gravidade)}</td>
        <td>${o.visivel_responsavel
              ? '<span class="badge badge-green">sim</span>'
              : '<span class="badge badge-cinza">interna</span>'}</td>
        <td style="font-size:12px;color:var(--txt2)">${escapar(o.registrado_nome || '—')}</td>
        <td class="acoes">
          <button class="btn-ico" onclick="Ocorrencias.abrirEdicao(${o.id})" title="Abrir">✏️</button>
          <button class="btn-ico perigo" onclick="Ocorrencias.excluir(${o.id})" title="Excluir">🗑️</button>
        </td>
      </tr>`).join('');

    const compartilhadas = this.lista.filter(o => o.visivel_responsavel).length;
    document.getElementById('ocorrTotal').textContent =
      `${this.lista.length} ocorrência(s) · ${compartilhadas} compartilhada(s) com os responsáveis`;
  },

  montarFiltros() {
    const aluno = document.getElementById('ocorrAluno');
    if (!aluno.dataset.pronto) {
      aluno.innerHTML = Cache.opcoesAlunos('', 'Todos os alunos');
      document.getElementById('ocorrTurma').innerHTML = Cache.opcoesTurmas('', 'Todas as turmas');
      document.getElementById('ocorrTipo').innerHTML =
        '<option value="">Todos os tipos</option>' +
        this.tipos.map(t => `<option value="${t.id}">${escapar(t.nome)}</option>`).join('');
      aluno.dataset.pronto = '1';
    }
  },

  // ── Cadastro ───────────────────────────────────────────────
  async abrirNova(alunoId = null) {
    await this.carregarTipos();
    this.editandoId = null;
    limparFormulario('formOcorrencia');

    document.getElementById('ocorrFormAluno').innerHTML = Cache.opcoesAlunos(alunoId || '');
    document.getElementById('ocorrFormTipo').innerHTML =
      this.tipos.map(t => `<option value="${t.id}">${escapar(t.nome)}</option>`).join('');

    const form = document.getElementById('formOcorrencia');
    form.querySelector('[data-campo=data_ocorrencia]').value = new Date().toISOString().slice(0, 10);
    form.querySelector('[data-campo=hora_ocorrencia]').value =
      new Date().toTimeString().slice(0, 5);

    document.getElementById('modalOcorrTitulo').textContent = 'Nova ocorrência';
    document.getElementById('modalOcorrSub').textContent = '';
    document.getElementById('ocorrAnexos').innerHTML =
      '<div class="form-hint">Salve a ocorrência para anexar fotos e documentos.</div>';

    this.sugerirGravidade();
    abrirModal('modalOcorrencia');
  },

  async abrirEdicao(id) {
    await this.carregarTipos();
    let o;
    try { o = await Api.get('/api/ocorrencias/' + id); }
    catch (e) { return toastErro(e.message); }

    this.editandoId = id;
    document.getElementById('ocorrFormAluno').innerHTML = Cache.opcoesAlunos(o.aluno_id);
    document.getElementById('ocorrFormTipo').innerHTML =
      this.tipos.map(t => `<option value="${t.id}">${escapar(t.nome)}</option>`).join('');

    limparFormulario('formOcorrencia');
    preencherFormulario('formOcorrencia', o);
    document.getElementById('ocorrFormAluno').value = o.aluno_id;

    document.getElementById('modalOcorrTitulo').textContent = o.titulo;
    document.getElementById('modalOcorrSub').textContent =
      `${o.aluno_nome} · registrada por ${o.registrado_nome || '—'} em ${dataHoraBR(o.criado_em)}`;

    UI.painelAnexos('ocorrAnexos', 'ocorrencia', id);
    abrirModal('modalOcorrencia');
  },

  /** Ao trocar o tipo, sugere a gravidade correspondente. */
  sugerirGravidade() {
    const tipo = document.getElementById('ocorrFormTipo').value;
    const meta = this.tipos.find(t => t.id === tipo);
    if (!meta) return;
    const campo = document.getElementById('formOcorrencia').querySelector('[data-campo=gravidade]');
    if (campo && !this.editandoId) campo.value = meta.gravidade;
  },

  async salvar() {
    const dados = lerFormulario('formOcorrencia');
    dados.aluno_id = document.getElementById('ocorrFormAluno').value;

    if (!dados.aluno_id) return toastErro('Selecione o aluno.');
    if (!dados.titulo) return toastErro('Informe o título da ocorrência.');

    try {
      if (this.editandoId) {
        await Api.put('/api/ocorrencias/' + this.editandoId, dados);
        toast('Ocorrência atualizada.');
        fecharModal('modalOcorrencia');
      } else {
        const r = await Api.post('/api/ocorrencias', dados);
        this.editandoId = r.id;
        toast('Ocorrência registrada. Agora você pode anexar fotos e documentos.');
        UI.painelAnexos('ocorrAnexos', 'ocorrencia', r.id);
      }
      this.carregar();
    } catch (e) { toastErro(e.message); }
  },

  async excluir(id) {
    const o = this.lista.find(x => x.id === id);
    const ok = await confirmar(
      `Excluir a ocorrência "${o ? o.titulo : ''}"? Os anexos também serão removidos.`,
      { titulo: 'Excluir ocorrência', textoOk: 'Excluir' }
    );
    if (!ok) return;

    try {
      await Api.excluir('/api/ocorrencias/' + id);
      toast('Ocorrência excluída.');
      this.carregar();
    } catch (e) { toastErro(e.message); }
  },
};

Carregadores.ocorrencias = () => Ocorrencias.carregar();

document.addEventListener('DOMContentLoaded', () => {
  ['ocorrAluno', 'ocorrTurma', 'ocorrTipo', 'ocorrGravidade', 'ocorrDe', 'ocorrAte'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => Ocorrencias.carregar());
  });
});

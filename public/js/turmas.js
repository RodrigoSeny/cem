/* ══════════════════════════════════════════════════════════════
   CEM — Turmas
   ══════════════════════════════════════════════════════════════ */

const Turmas = {
  lista: [],
  editandoId: null,

  async carregar() {
    const corpo = document.getElementById('turmasCorpo');
    corpo.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:26px"><span class="spinner"></span></td></tr>`;

    const ano = document.getElementById('turmasAno').value;
    try { this.lista = await Api.get('/api/turmas', { ano_letivo: ano }); }
    catch (e) {
      corpo.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:26px;color:var(--red)">${escapar(e.message)}</td></tr>`;
      return;
    }

    if (!this.lista.length) {
      corpo.innerHTML = `<tr><td colspan="7"><div class="vazio">
        <span class="ico">🏫</span><div class="titulo">Nenhuma turma neste ano letivo</div>
        <div class="sub">Crie as turmas para distribuir os alunos.</div></div></td></tr>`;
      document.getElementById('turmasTotal').textContent = 'Nenhum registro';
      return;
    }

    corpo.innerHTML = this.lista.map(t => {
      const pct = t.capacidade ? Math.min(100, Math.round(t.qtd_alunos / t.capacidade * 100)) : 0;
      return `
        <tr class="clicavel" ondblclick="Turmas.abrirEdicao(${t.id})">
          <td>
            <div style="font-weight:600">${escapar(t.nome)}</div>
            <div style="font-size:11px;color:var(--txt3)">${t.ativa ? 'ativa' : 'inativa'}</div>
          </td>
          <td>${escapar([t.etapa, t.serie].filter(Boolean).join(' · ') || '—')}</td>
          <td><span class="badge badge-gold">${TURNOS[t.turno] || t.turno}</span></td>
          <td>${escapar(t.sala || '—')}</td>
          <td>${escapar(t.professor_nome || '—')}</td>
          <td style="min-width:150px">
            <div style="display:flex;align-items:center;gap:9px">
              <div class="barra" style="flex:1"><i style="width:${t.capacidade ? pct : 100}%;${!t.capacidade ? 'background:var(--border2)' : ''}"></i></div>
              <span class="mono" style="font-size:11.5px;color:var(--txt2)">${t.qtd_alunos}${t.capacidade ? '/' + t.capacidade : ''}</span>
            </div>
          </td>
          <td class="acoes">
            <button class="btn-ico" onclick="Turmas.verAlunos(${t.id})" title="Ver alunos">👁️</button>
            <button class="btn-ico" onclick="Turmas.abrirEdicao(${t.id})" title="Editar">✏️</button>
            <button class="btn-ico perigo" onclick="Turmas.excluir(${t.id})" title="Excluir">🗑️</button>
          </td>
        </tr>`;
    }).join('');

    const alunos = this.lista.reduce((s, t) => s + t.qtd_alunos, 0);
    document.getElementById('turmasTotal').textContent =
      `${this.lista.length} turma${this.lista.length === 1 ? '' : 's'} · ${alunos} aluno(s) alocado(s)`;
  },

  montarSelects() {
    const opcoes = '<option value="">—</option>' +
      Cache.funcionarios.map(f => `<option value="${f.id}">${escapar(f.nome)} · ${escapar(f.cargo)}</option>`).join('');
    document.getElementById('turmaProfessor').innerHTML = opcoes;
    document.getElementById('turmaAuxiliar').innerHTML = opcoes;
  },

  abrirNovo() {
    this.editandoId = null;
    limparFormulario('formTurma');
    this.montarSelects();

    const form = document.getElementById('formTurma');
    form.querySelector('[data-campo=ativa]').checked = true;
    form.querySelector('[data-campo=turno]').value = 'manha';
    form.querySelector('[data-campo=ano_letivo]').value =
      document.getElementById('turmasAno').value || new Date().getFullYear();

    document.getElementById('modalTurmaTitulo').textContent = 'Nova turma';
    abrirModal('modalTurma');
  },

  async abrirEdicao(id) {
    let t;
    try { t = await Api.get('/api/turmas/' + id); }
    catch (e) { return toastErro(e.message); }

    this.editandoId = id;
    limparFormulario('formTurma');
    this.montarSelects();
    preencherFormulario('formTurma', t);
    document.getElementById('turmaProfessor').value = t.professor_id || '';
    document.getElementById('turmaAuxiliar').value = t.auxiliar_id || '';
    document.getElementById('modalTurmaTitulo').textContent = t.nome;
    abrirModal('modalTurma');
  },

  async salvar() {
    const dados = lerFormulario('formTurma');
    if (!dados.nome) return toastErro('Informe o nome da turma.');
    if (!dados.ano_letivo) return toastErro('Informe o ano letivo.');

    try {
      if (this.editandoId) {
        await Api.put('/api/turmas/' + this.editandoId, dados);
        toast('Turma atualizada.');
      } else {
        await Api.post('/api/turmas', dados);
        toast('Turma criada.');
      }
      fecharModal('modalTurma');
      await Cache.recarregarTurmas();
      this.carregar();
    } catch (e) { toastErro(e.message); }
  },

  async excluir(id) {
    const t = this.lista.find(x => x.id === id);
    const ok = await confirmar(
      `Excluir a turma ${t ? t.nome : ''}?`,
      { titulo: 'Excluir turma', textoOk: 'Excluir' }
    );
    if (!ok) return;

    try {
      await Api.excluir('/api/turmas/' + id);
      toast('Turma excluída.');
      await Cache.recarregarTurmas();
      this.carregar();
    } catch (e) { toastErro(e.message); }
  },

  async verAlunos(id) {
    let t;
    try { t = await Api.get('/api/turmas/' + id); }
    catch (e) { return toastErro(e.message); }

    document.getElementById('fichaTitulo').textContent = t.nome;
    document.getElementById('fichaSub').textContent =
      `${TURNOS[t.turno] || t.turno} · ${t.professor_nome || 'sem professor'} · ${t.alunos.length} aluno(s)`;
    document.getElementById('btnImprimirFicha').onclick = () => Relatorios.imprimirListaAlunos({ turma_id: id });

    document.getElementById('fichaCorpo').innerHTML = t.alunos.length ? `
      <div class="tabela-wrap">
        <table class="tabela">
          <thead><tr><th>#</th><th>Aluno</th><th>Matrícula</th><th>Nascimento</th><th>Situação</th></tr></thead>
          <tbody>
            ${t.alunos.map((a, i) => `
              <tr><td class="mono c-txt3">${i + 1}</td>
                  <td style="font-weight:600">${escapar(a.nome)}</td>
                  <td class="mono" style="font-size:12px">${escapar(a.matricula)}</td>
                  <td>${dataBR(a.data_nascimento)}</td>
                  <td>${badgeSituacao(a.situacao)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>`
      : '<div class="vazio"><span class="ico">🎓</span><div class="titulo">Turma sem alunos</div></div>';

    abrirModal('modalFicha');
  },
};

Carregadores.turmas = () => Turmas.carregar();

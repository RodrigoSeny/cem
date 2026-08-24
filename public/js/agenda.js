/* ══════════════════════════════════════════════════════════════
   CEM — Agenda diária (padrão por turma + exceções do dia)
   ══════════════════════════════════════════════════════════════ */

const AGD_SONO = [['', 'Sem alteração (usa padrão)'], ['manha', 'Manhã'], ['apos_almoco', 'Após o almoço'], ['tarde', 'Tarde'], ['nao_dormiu', 'Não dormiu']];
const AGD_DISPOSICAO = [['', 'Sem alteração (usa padrão)'], ['normal', 'Normal'], ['agitado', 'Agitado'], ['quieto', 'Quieto']];
const AGD_EVACUACAO = [['', 'Sem alteração (usa padrão)'], ['normal', 'Normal'], ['pastosa', 'Pastosa'], ['liquida', 'Líquida'], ['nao_evacuou', 'Não evacuou']];
const AGD_REFEICAO = [['', 'Sem alteração (usa padrão)'], ['bem', 'Bem'], ['metade', 'Metade'], ['menos_metade', 'Menos da metade'], ['recusou', 'Recusou']];
const AGD_BANHO = [['', 'Sem alteração (usa padrão)'], ['1', 'Toma banho'], ['0', 'Não toma banho']];
const AGD_TRAZER_CATALOGO = ['Repelente', 'Lenço umedecido', 'Pomada', 'Shampoo', 'Creme Dental', 'Fraldas', 'Sabonete Líquido', 'Escova de Dente', 'Toalha'];

const AGD_ROTULOS = {
  sono: { manha: 'Manhã', apos_almoco: 'Após o almoço', tarde: 'Tarde', nao_dormiu: 'Não dormiu' },
  disposicao: { normal: 'Normal', agitado: 'Agitado', quieto: 'Quieto' },
  evacuacao: { normal: 'Normal', pastosa: 'Pastosa', liquida: 'Líquida', nao_evacuou: 'Não evacuou' },
  colacao: { bem: 'Bem', metade: 'Metade', menos_metade: 'Menos da metade', recusou: 'Recusou' },
  almoco: { bem: 'Bem', metade: 'Metade', menos_metade: 'Menos da metade', recusou: 'Recusou' },
  lanche: { bem: 'Bem', metade: 'Metade', menos_metade: 'Menos da metade', recusou: 'Recusou' },
  jantar: { bem: 'Bem', metade: 'Metade', menos_metade: 'Menos da metade', recusou: 'Recusou' },
};

const Agenda = {
  gradeAlunos: [],
  editandoAluno: null,
  editandoData: null,
  medicamentos: [],

  // ══════════════════════ CONFIGURAÇÃO PADRÃO ══════════════════
  async carregarPadrao() {
    const sel = document.getElementById('agpTurma');
    if (!sel.dataset.pronto) {
      sel.innerHTML = Cache.opcoesTurmas('', 'Selecione a turma');
      sel.dataset.pronto = '1';
    }
    if (!sel.value) { limparFormulario('agpForm'); return; }

    let padrao;
    try { padrao = await Api.get(`/api/agenda/padrao/${sel.value}`); }
    catch (e) { return toastErro(e.message); }

    limparFormulario('agpForm');
    const form = document.getElementById('agpForm');
    for (const campo of ['sono', 'banho', 'disposicao', 'evacuacao', 'colacao', 'almoco', 'lanche', 'jantar']) {
      const valor = padrao[campo];
      form.querySelector(`[data-campo=${campo}]`).value = valor === null || valor === undefined ? '' : String(valor);
    }
  },

  async salvarPadrao() {
    const turmaId = document.getElementById('agpTurma').value;
    if (!turmaId) return toastErro('Selecione a turma.');

    const d = lerFormulario('agpForm');
    try {
      await Api.put(`/api/agenda/padrao/${turmaId}`, d);
      toast('Padrão da turma salvo.');
    } catch (e) { toastErro(e.message); }
  },

  // ══════════════════════ PREENCHIMENTO DO DIA ═════════════════
  carregarGrade() {
    const sel = document.getElementById('agdTurma');
    if (!sel.dataset.pronto) {
      sel.innerHTML = Cache.opcoesTurmas('', 'Selecione a turma');
      sel.dataset.pronto = '1';
    }
    document.getElementById('agdData').value ||= new Date().toISOString().slice(0, 10);
    this._recarregarGrade();
  },

  async _recarregarGrade() {
    const turmaId = document.getElementById('agdTurma').value;
    const data = document.getElementById('agdData').value;
    const corpo = document.getElementById('agdGradeCorpo');

    if (!turmaId) {
      corpo.innerHTML = `<tr><td colspan="4"><div class="vazio" style="padding:20px"><div class="sub">Selecione uma turma.</div></div></td></tr>`;
      document.getElementById('agdGradeTotal').textContent = '—';
      return;
    }

    corpo.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:26px"><span class="spinner"></span></td></tr>`;
    try { this.gradeAlunos = await Api.get(`/api/agenda/turmas/${turmaId}/dia`, { data }); }
    catch (e) {
      corpo.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:26px;color:var(--red)">${escapar(e.message)}</td></tr>`;
      return;
    }

    if (!this.gradeAlunos.length) {
      corpo.innerHTML = `<tr><td colspan="4"><div class="vazio" style="padding:20px"><span class="ico">📔</span><div class="titulo">Nenhum aluno nesta turma</div></div></td></tr>`;
      document.getElementById('agdGradeTotal').textContent = 'Nenhum registro';
      return;
    }

    corpo.innerHTML = this.gradeAlunos.map(a => `
      <tr class="clicavel" ondblclick="Agenda.abrirAluno(${a.id})">
        <td style="font-weight:600">${escapar(a.nome)}</td>
        <td class="mono" style="font-size:12px">${escapar(a.matricula)}</td>
        <td>${a.preenchido ? '<span class="badge badge-green">preenchido</span>' : '<span class="badge badge-cinza">só padrão</span>'}</td>
        <td class="acoes"><button class="btn-ico" onclick="Agenda.abrirAluno(${a.id})" title="Abrir agenda do dia">📝</button></td>
      </tr>`).join('');

    document.getElementById('agdGradeTotal').textContent = `${this.gradeAlunos.length} aluno(s)`;
  },

  async abrirAluno(alunoId) {
    const data = document.getElementById('agdData').value;
    let d;
    try { d = await Api.get(`/api/agenda/alunos/${alunoId}`, { data }); }
    catch (e) { return toastErro(e.message); }

    this.editandoAluno = alunoId;
    this.editandoData = data;
    this.medicamentos = d.medicamentos || [];

    document.getElementById('modalAgendaTitulo').textContent = d.aluno.nome;
    document.getElementById('modalAgendaSub').textContent = dataBR(data);
    this._renderFormulario(d);
    abrirModal('modalAgendaDiaria');
  },

  _selectRotina(campo, opcoes, valorAtual) {
    return `<select class="form-select" data-agd-campo="${campo}">
      ${opcoes.map(([v, r]) => `<option value="${v}" ${String(valorAtual ?? '') === v ? 'selected' : ''}>${r}</option>`).join('')}
    </select>`;
  },

  _renderFormulario(d) {
    const ex = d.excecoes || {};
    const corpo = document.getElementById('agendaDiariaCorpo');
    corpo.innerHTML = `
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Entrada</label><input type="time" class="form-input" id="agdEntrada" value="${d.entrada || ''}"></div>
        <div class="form-group"><label class="form-label">Saída</label><input type="time" class="form-input" id="agdSaida" value="${d.saida || ''}"></div>
      </div>

      <div class="secao-titulo">Rotina — só muda o que for diferente do padrão</div>
      <div class="form-grid3">
        <div class="form-group"><label class="form-label">Sono</label>${this._selectRotina('sono', AGD_SONO, ex.sono)}</div>
        <div class="form-group"><label class="form-label">Banho</label>${this._selectRotina('banho', AGD_BANHO, ex.banho === null || ex.banho === undefined ? '' : String(ex.banho))}</div>
        <div class="form-group"><label class="form-label">Disposição</label>${this._selectRotina('disposicao', AGD_DISPOSICAO, ex.disposicao)}</div>
        <div class="form-group"><label class="form-label">Evacuação</label>${this._selectRotina('evacuacao', AGD_EVACUACAO, ex.evacuacao)}</div>
        <div class="form-group"><label class="form-label">Colação</label>${this._selectRotina('colacao', AGD_REFEICAO, ex.colacao)}</div>
        <div class="form-group"><label class="form-label">Almoço</label>${this._selectRotina('almoco', AGD_REFEICAO, ex.almoco)}</div>
        <div class="form-group"><label class="form-label">Lanche</label>${this._selectRotina('lanche', AGD_REFEICAO, ex.lanche)}</div>
        <div class="form-group"><label class="form-label">Jantar</label>${this._selectRotina('jantar', AGD_REFEICAO, ex.jantar)}</div>
      </div>

      <div class="secao-titulo">Observações</div>
      <textarea class="form-input" id="agdObservacoes" rows="3" style="width:100%">${escapar(d.observacoes || '')}</textarea>

      <div class="secao-titulo">Mamãe trazer</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px" id="agdTrazerBox">
        ${AGD_TRAZER_CATALOGO.map(item => `
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;background:var(--card);padding:6px 10px;border-radius:8px;border:1px solid var(--border)">
            <input type="checkbox" data-agd-trazer="${escapar(item)}" ${(d.trazer || []).includes(item) ? 'checked' : ''}>
            ${escapar(item)}
          </label>`).join('')}
      </div>

      <div class="secao-titulo">Febre</div>
      <div class="form-grid3">
        <div class="form-group">
          <label class="form-label">Teve febre?</label>
          <select class="form-select" id="agdTeveFebre">
            <option value="0" ${!d.teve_febre ? 'selected' : ''}>Não</option>
            <option value="1" ${d.teve_febre ? 'selected' : ''}>Sim</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">Temperatura / hora</label>
          <div style="display:flex;gap:6px">
            <input class="form-input" id="agdTemperatura" placeholder="°C" value="${escapar(d.temperatura || '')}" style="width:70px">
            <input type="time" class="form-input" id="agdFebreHora" value="${d.febre_hora || ''}">
          </div>
        </div>
        <div class="form-group"><label class="form-label">Antifebril</label><input class="form-input" id="agdAntifebril" value="${escapar(d.antifebril || '')}"></div>
      </div>

      <div class="secao-titulo">Remédios administrados</div>
      <div class="tabela-wrap">
        <table class="tabela">
          <thead><tr><th>Remédio</th><th>Dosagem</th><th>Horário</th><th>Ministrado por</th><th class="acoes"></th></tr></thead>
          <tbody id="agdMedicamentosCorpo"></tbody>
        </table>
      </div>
      <button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="Agenda.adicionarMedicamento()">＋ Adicionar remédio</button>
    `;
    this._renderMedicamentos();
  },

  _renderMedicamentos() {
    const corpo = document.getElementById('agdMedicamentosCorpo');
    if (!this.medicamentos.length) {
      corpo.innerHTML = `<tr><td colspan="5"><div class="sub" style="padding:8px">Nenhum remédio administrado.</div></td></tr>`;
      return;
    }
    corpo.innerHTML = this.medicamentos.map((m, i) => `
      <tr>
        <td><input class="form-input" value="${escapar(m.nome_remedio || '')}" onchange="Agenda.medicamentos[${i}].nome_remedio = this.value"></td>
        <td><input class="form-input" value="${escapar(m.dosagem || '')}" onchange="Agenda.medicamentos[${i}].dosagem = this.value"></td>
        <td><input type="time" class="form-input" value="${m.horario || ''}" onchange="Agenda.medicamentos[${i}].horario = this.value"></td>
        <td><input class="form-input" value="${escapar(m.ministrado_por || '')}" onchange="Agenda.medicamentos[${i}].ministrado_por = this.value"></td>
        <td class="acoes"><button class="btn-ico perigo" onclick="Agenda.removerMedicamento(${i})" title="Remover">🗑️</button></td>
      </tr>`).join('');
  },

  adicionarMedicamento() {
    this.medicamentos.push({ nome_remedio: '', dosagem: '', horario: '', ministrado_por: '' });
    this._renderMedicamentos();
  },

  removerMedicamento(i) {
    this.medicamentos.splice(i, 1);
    this._renderMedicamentos();
  },

  async salvarAluno() {
    if (!this.editandoAluno) return;

    const d = {
      entrada: document.getElementById('agdEntrada').value || null,
      saida: document.getElementById('agdSaida').value || null,
      observacoes: document.getElementById('agdObservacoes').value || null,
      teve_febre: document.getElementById('agdTeveFebre').value === '1',
      temperatura: document.getElementById('agdTemperatura').value || null,
      febre_hora: document.getElementById('agdFebreHora').value || null,
      antifebril: document.getElementById('agdAntifebril').value || null,
      trazer: [...document.querySelectorAll('[data-agd-trazer]:checked')].map(el => el.dataset.agdTrazer),
      medicamentos: this.medicamentos.filter(m => m.nome_remedio && m.nome_remedio.trim()),
    };
    for (const campo of ['sono', 'banho', 'disposicao', 'evacuacao', 'colacao', 'almoco', 'lanche', 'jantar']) {
      const el = document.querySelector(`[data-agd-campo=${campo}]`);
      d[campo] = el.value === '' ? null : el.value;
    }

    try {
      await Api.put(`/api/agenda/alunos/${this.editandoAluno}?data=${this.editandoData}`, d);
      toast('Agenda do dia salva.');
      fecharModal('modalAgendaDiaria');
      this._recarregarGrade();
    } catch (e) { toastErro(e.message); }
  },
};

Carregadores['agenda-padrao'] = () => Agenda.carregarPadrao();
Carregadores['agenda-diaria'] = () => Agenda.carregarGrade();

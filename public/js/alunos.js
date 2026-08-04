/* ══════════════════════════════════════════════════════════════
   CEM — Cadastro de Alunos
   ══════════════════════════════════════════════════════════════ */

const Alunos = {
  lista: [],
  editandoId: null,
  vinculos: [],        // responsáveis do aluno em edição
  editandoVinculo: null,

  filtrosAtuais() {
    return {
      busca: document.getElementById('alunosBusca').value.trim(),
      turma_id: document.getElementById('alunosTurma').value,
      situacao: document.getElementById('alunosSituacao').value,
    };
  },

  async carregar() {
    const corpo = document.getElementById('alunosCorpo');
    corpo.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:26px"><span class="spinner"></span></td></tr>`;

    try {
      this.lista = await Api.get('/api/alunos', this.filtrosAtuais());
    } catch (e) {
      corpo.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:26px;color:var(--red)">${escapar(e.message)}</td></tr>`;
      return;
    }

    this.preencherFiltroTurmas();

    if (!this.lista.length) {
      corpo.innerHTML = `<tr><td colspan="7"><div class="vazio">
        <span class="ico">🎓</span><div class="titulo">Nenhum aluno encontrado</div>
        <div class="sub">Ajuste os filtros ou cadastre um novo aluno.</div></div></td></tr>`;
      document.getElementById('alunosTotal').textContent = 'Nenhum registro';
      return;
    }

    corpo.innerHTML = this.lista.map(a => `
      <tr class="clicavel" ondblclick="Alunos.abrirEdicao(${a.id})">
        <td>
          <div class="pessoa">
            <div class="av">${iniciais(a.nome)}</div>
            <div>
              <div class="nm">${escapar(a.nome)}</div>
              <div class="sb">${a.data_nascimento ? dataBR(a.data_nascimento) : 'sem data de nascimento'}</div>
            </div>
          </div>
        </td>
        <td class="mono" style="font-size:12px">${escapar(a.matricula)}</td>
        <td>${a.turma_nome ? escapar(a.turma_nome) : '<span class="badge badge-cinza">sem turma</span>'}</td>
        <td>${a.idade !== null && a.idade !== undefined ? a.idade + ' anos' : '—'}</td>
        <td>${a.qtd_responsaveis
              ? `<span class="badge badge-blue">${a.qtd_responsaveis}</span>`
              : '<span class="badge badge-red">nenhum</span>'}</td>
        <td>${badgeSituacao(a.situacao)}</td>
        <td class="acoes">
          <button class="btn-ico" onclick="Alunos.verFicha(${a.id})" title="Ver ficha">👁️</button>
          <button class="btn-ico" onclick="Financeiro.verExtrato(${a.id})" title="Financeiro">💰</button>
          <button class="btn-ico" onclick="Alunos.abrirEdicao(${a.id})" title="Editar">✏️</button>
          <button class="btn-ico perigo" onclick="Alunos.excluir(${a.id})" title="Excluir">🗑️</button>
        </td>
      </tr>`).join('');

    document.getElementById('alunosTotal').textContent =
      `${this.lista.length} aluno${this.lista.length === 1 ? '' : 's'}`;
  },

  preencherFiltroTurmas() {
    const sel = document.getElementById('alunosTurma');
    if (sel.dataset.pronto) return;
    sel.innerHTML = Cache.opcoesTurmas('', 'Todas as turmas');
    sel.dataset.pronto = '1';
  },

  // ── Cadastro ───────────────────────────────────────────────
  async abrirNovo() {
    this.editandoId = null;
    this.vinculos = [];
    limparFormulario('formAluno');

    document.getElementById('modalAlunoTitulo').textContent = 'Novo aluno';
    document.getElementById('modalAlunoSub').textContent = 'Preencha a ficha de matrícula';

    const form = document.getElementById('formAluno');
    form.querySelector('[data-campo=situacao]').value = 'matriculado';
    form.querySelector('[data-campo=ano_letivo]').value = new Date().getFullYear();
    form.querySelector('[data-campo=data_matricula]').value = new Date().toISOString().slice(0, 10);
    document.getElementById('alunoNacionalidade').value = 'Brasileira';

    try {
      const { matricula } = await Api.get('/api/alunos/proxima-matricula');
      form.querySelector('[data-campo=matricula]').value = matricula;
    } catch {}

    this.montarSelects();
    this.trocarNacionalidade();
    this.renderVinculos();
    this.renderAnexos();
    this.primeiraAba();
    abrirModal('modalAluno');
  },

  async abrirEdicao(id) {
    let a;
    try { a = await Api.get('/api/alunos/' + id); }
    catch (e) { return toastErro(e.message); }

    this.editandoId = id;
    this.vinculos = (a.responsaveis || []).map(r => ({
      responsavel_id: r.id, nome: r.nome, telefone: r.whatsapp || r.telefone,
      parentesco: r.parentesco, tipo_vinculo: r.tipo_vinculo,
      principal: r.principal, autorizado_retirar: r.autorizado_retirar,
    }));

    limparFormulario('formAluno');
    preencherFormulario('formAluno', a);

    // Nacionalidade fora da lista (ex.: cadastro antigo) volta como Estrangeira
    const nac = document.getElementById('alunoNacionalidade');
    nac.value = (a.nacionalidade === 'Brasileira' || !a.nacionalidade) ? 'Brasileira' : 'Estrangeira';

    document.getElementById('modalAlunoTitulo').textContent = a.nome;
    document.getElementById('modalAlunoSub').textContent =
      `Matrícula ${a.matricula} · ${a.turma_nome || 'sem turma'}`;

    this.montarSelects();
    document.getElementById('formAluno').querySelector('[data-campo=turma_id]').value = a.turma_id || '';
    this.trocarNacionalidade();
    this.renderVinculos();
    this.renderAnexos();
    this.primeiraAba();
    abrirModal('modalAluno');
  },

  primeiraAba() {
    const body = document.getElementById('modalAluno').querySelector('.modal-body');
    body.querySelectorAll('.aba').forEach((a, i) => a.classList.toggle('active', i === 0));
    body.querySelectorAll('.aba-conteudo').forEach((c, i) => c.classList.toggle('active', i === 0));
  },

  irParaAba(nome) {
    document.querySelector(`.aba[data-aba="${nome}"]`)?.click();
  },

  montarSelects() {
    document.getElementById('alunoTurmaSelect').innerHTML = Cache.opcoesTurmas('', 'Sem turma');
    document.getElementById('vincParentesco').innerHTML = opcoesParentesco();
    this.montarSelectResponsaveis();
  },

  montarSelectResponsaveis() {
    const jaVinculados = new Set(this.vinculos.map(v => v.responsavel_id));
    document.getElementById('vincResponsavel').innerHTML =
      '<option value="">Selecione…</option>' +
      Cache.responsaveis
        .filter(r => !jaVinculados.has(r.id))
        .map(r => `<option value="${r.id}">${escapar(r.nome)}${r.cpf ? ' · ' + cpfBR(r.cpf) : ''}</option>`).join('');
  },

  // ── Naturalidade / nacionalidade ───────────────────────────
  trocarNacionalidade() {
    const brasileira = document.getElementById('alunoNacionalidade').value === 'Brasileira';
    const dica = document.getElementById('alunoNatDica');
    const uf = document.getElementById('alunoUfNascimento');

    if (brasileira) {
      // A lista de municípios pode não estar disponível (rede da escola sem
      // acesso ao IBGE). Nesse caso a UF volta a ser digitável.
      const temLista = Municipios.disponivel;
      dica.textContent = temLista
        ? '(digite e escolha a cidade — a UF é preenchida sozinha)'
        : '(digite a cidade e a UF)';
      uf.readOnly = temLista;
      uf.style.opacity = temLista ? '.75' : '1';
    } else {
      dica.textContent = '(estrangeiro: preencha cidade e país livremente)';
      uf.readOnly = false;
      uf.style.opacity = '1';
      document.getElementById('listaMunicipios').innerHTML = '';
    }
  },

  /** Sugere municípios enquanto digita e completa a UF ao escolher. */
  async sugerirMunicipios() {
    if (document.getElementById('alunoNacionalidade').value !== 'Brasileira') return;
    const campo = document.getElementById('alunoNaturalidade');
    await Municipios.carregar();

    const achados = Municipios.buscar(campo.value);
    document.getElementById('listaMunicipios').innerHTML =
      achados.map(m => `<option value="${escapar(m.n)}">${escapar(m.n)} — ${m.uf}</option>`).join('');

    const uf = Municipios.ufDe(campo.value);
    if (uf) document.getElementById('alunoUfNascimento').value = uf;
  },

  // ── Endereço a partir do responsável ───────────────────────
  atualizarCopiaEndereco() {
    const bloco = document.getElementById('alunoEnderecoResp');
    const sel = document.getElementById('alunoCopiarDe');
    const comEndereco = this.vinculos
      .map(v => Cache.responsaveis.find(r => r.id === v.responsavel_id))
      .filter(r => r && (r.logradouro || r.cep));

    if (!comEndereco.length) { bloco.style.display = 'none'; return; }

    bloco.style.display = 'block';
    sel.innerHTML = comEndereco.map(r => {
      const resumo = [r.logradouro, r.numero, r.bairro].filter(Boolean).join(', ');
      return `<option value="${r.id}">${escapar(r.nome)}${resumo ? ' — ' + escapar(resumo) : ''}</option>`;
    }).join('');
  },

  copiarEnderecoResponsavel() {
    const id = Number(document.getElementById('alunoCopiarDe').value);
    const r = Cache.responsaveis.find(x => x.id === id);
    if (!r) return toast('Selecione o responsável.', 'aviso');

    const form = document.getElementById('formAluno');
    for (const campo of ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado']) {
      const el = form.querySelector(`[data-campo="${campo}"]`);
      if (el) el.value = r[campo] || '';
    }
    const cep = form.querySelector('[data-campo=cep]');
    if (cep && cep.value) cep.value = cepBR(cep.value);

    toast(`Endereço de ${nomeCurto(r.nome)} copiado.`);
  },

  // ── Vínculos com responsáveis ──────────────────────────────
  adicionarVinculo() {
    const sel = document.getElementById('vincResponsavel');
    const id = Number(sel.value);
    if (!id) return toast('Selecione um responsável ou cadastre um novo.', 'aviso');

    const r = Cache.responsaveis.find(x => x.id === id);
    this.vincular({
      responsavel_id: id,
      nome: r ? r.nome : sel.options[sel.selectedIndex].text.split(' · ')[0],
      telefone: r ? (r.whatsapp || r.telefone) : null,
      parentesco: document.getElementById('vincParentesco').value || null,
      tipo_vinculo: document.getElementById('vincTipo').value,
    });

    sel.value = '';
    document.getElementById('vincParentesco').value = '';
  },

  vincular(dados) {
    if (this.vinculos.some(v => v.responsavel_id === dados.responsavel_id)) {
      return toast('Este responsável já está vinculado.', 'aviso');
    }
    this.vinculos.push({
      autorizado_retirar: 1,
      principal: this.vinculos.length === 0 ? 1 : 0,
      tipo_vinculo: 'ambos',
      ...dados,
    });
    this.renderVinculos();
  },

  /** Abre o cadastro de responsável e volta vinculando ao aluno. */
  cadastrarResponsavel() {
    Responsaveis.abrirNovo({
      aoSalvar: async (novoId) => {
        await Cache.recarregarResponsaveis();
        const r = Cache.responsaveis.find(x => x.id === novoId);
        if (r) {
          this.vincular({
            responsavel_id: r.id, nome: r.nome,
            telefone: r.whatsapp || r.telefone,
            parentesco: document.getElementById('vincParentesco').value || null,
            tipo_vinculo: document.getElementById('vincTipo').value || 'ambos',
          });
          toast(`${nomeCurto(r.nome)} cadastrado e vinculado ao aluno.`);
        }
        this.montarSelectResponsaveis();
      },
    });
  },

  /** Abre o cadastro completo do responsável já vinculado. */
  editarResponsavel(i) {
    const v = this.vinculos[i];
    Responsaveis.abrirEdicao(v.responsavel_id, {
      aoSalvar: async () => {
        await Cache.recarregarResponsaveis();
        const r = Cache.responsaveis.find(x => x.id === v.responsavel_id);
        if (r) { v.nome = r.nome; v.telefone = r.whatsapp || r.telefone; }
        this.renderVinculos();
      },
    });
  },

  /** Edita parentesco / tipo de vínculo / autorizações. */
  editarVinculo(i) {
    const v = this.vinculos[i];
    const el = document.createElement('div');
    el.className = 'modal-overlay aberto';
    el.innerHTML = `
      <div class="modal" style="max-width:460px">
        <div class="modal-head">
          <div><h3>Editar vínculo</h3><div class="sub">${escapar(v.nome)}</div></div>
          <button class="btn-ico" data-acao="fechar">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Parentesco</label>
            <select class="form-select" id="_vincParentesco">${opcoesParentesco(v.parentesco || '')}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Tipo de vínculo</label>
            <select class="form-select" id="_vincTipo">
              ${Object.entries(TIPOS_VINCULO).map(([k, r]) =>
                `<option value="${k}" ${v.tipo_vinculo === k ? 'selected' : ''}>${r}</option>`).join('')}
            </select>
          </div>
          <label class="form-check mb-3">
            <input type="checkbox" id="_vincPrincipal" ${v.principal ? 'checked' : ''}> Responsável principal
          </label>
          <label class="form-check">
            <input type="checkbox" id="_vincRetirar" ${v.autorizado_retirar ? 'checked' : ''}> Autorizado a retirar o aluno
          </label>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" data-acao="fechar">Cancelar</button>
          <button class="btn btn-primary" data-acao="salvar">Aplicar</button>
        </div>
      </div>`;
    document.body.appendChild(el);

    el.querySelectorAll('[data-acao=fechar]').forEach(b => b.onclick = () => el.remove());
    el.querySelector('[data-acao=salvar]').onclick = () => {
      v.parentesco = el.querySelector('#_vincParentesco').value || null;
      v.tipo_vinculo = el.querySelector('#_vincTipo').value;
      v.autorizado_retirar = el.querySelector('#_vincRetirar').checked ? 1 : 0;
      if (el.querySelector('#_vincPrincipal').checked) this.vinculos.forEach((x, k) => x.principal = k === i ? 1 : 0);
      else v.principal = 0;
      el.remove();
      this.renderVinculos();
    };
  },

  removerVinculo(i) { this.vinculos.splice(i, 1); this.renderVinculos(); },

  marcarPrincipal(i) {
    this.vinculos.forEach((v, k) => v.principal = k === i ? 1 : 0);
    this.renderVinculos();
  },

  alternarRetirar(i) {
    this.vinculos[i].autorizado_retirar = this.vinculos[i].autorizado_retirar ? 0 : 1;
    this.renderVinculos();
  },

  renderVinculos() {
    const corpo = document.getElementById('vincCorpo');
    this.montarSelectResponsaveis();
    this.atualizarCopiaEndereco();

    if (!this.vinculos.length) {
      corpo.innerHTML = `<tr><td colspan="7"><div class="vazio" style="padding:26px">
        <span class="ico">👨‍👩‍👧</span><div class="titulo">Nenhum responsável vinculado</div>
        <div class="sub">Vincule um cadastro existente ou use "Cadastrar novo".</div></div></td></tr>`;
      return;
    }

    corpo.innerHTML = this.vinculos.map((v, i) => `
      <tr>
        <td style="font-weight:600">${escapar(v.nome)}</td>
        <td style="font-size:12px;color:var(--txt2)">${v.telefone ? telefoneBR(v.telefone) : '—'}</td>
        <td>${v.parentesco ? escapar(v.parentesco) : '<span class="c-txt3">não informado</span>'}</td>
        <td><span class="badge badge-cinza">${TIPOS_VINCULO[v.tipo_vinculo] || v.tipo_vinculo}</span></td>
        <td><button class="btn-ico" onclick="Alunos.marcarPrincipal(${i})" title="Definir como principal">${v.principal ? '⭐' : '☆'}</button></td>
        <td><button class="btn-ico" onclick="Alunos.alternarRetirar(${i})" title="Autorizado a retirar o aluno">${v.autorizado_retirar ? '✅' : '🚫'}</button></td>
        <td class="acoes">
          <button class="btn-ico" onclick="Alunos.editarVinculo(${i})" title="Editar vínculo">🔗</button>
          <button class="btn-ico" onclick="Alunos.editarResponsavel(${i})" title="Editar cadastro do responsável">✏️</button>
          <button class="btn-ico perigo" onclick="Alunos.removerVinculo(${i})" title="Desvincular">🗑️</button>
        </td>
      </tr>`).join('');
  },

  // ── Documentos digitalizados ───────────────────────────────
  renderAnexos() {
    const alvo = document.getElementById('alunoAnexos');
    if (!this.editandoId) {
      alvo.innerHTML = `<div class="form-hint">Salve o aluno primeiro — depois será possível anexar carteirinha do plano,
        caderneta de vacinação, atestados e autorizações assinadas.</div>`;
      return;
    }
    UI.painelAnexos(alvo, 'aluno', this.editandoId);
  },

  // ── Persistência ───────────────────────────────────────────
  async salvar() {
    const dados = lerFormulario('formAluno');
    if (!dados.nome) {
      toastErro('Informe o nome do aluno.');
      this.irParaAba('al-dados');
      return;
    }

    dados.responsaveis = this.vinculos.map(v => ({
      responsavel_id: v.responsavel_id, parentesco: v.parentesco,
      tipo_vinculo: v.tipo_vinculo, principal: v.principal, autorizado_retirar: v.autorizado_retirar,
    }));

    const btn = document.getElementById('btnSalvarAluno');
    btn.disabled = true;

    try {
      if (this.editandoId) {
        await Api.put('/api/alunos/' + this.editandoId, dados);
        toast('Aluno atualizado.');
        fecharModal('modalAluno');
      } else {
        const r = await Api.post('/api/alunos', dados);
        this.editandoId = r.id;
        toast('Aluno cadastrado. Agora você já pode anexar documentos.');
        document.getElementById('modalAlunoTitulo').textContent = dados.nome;
        this.renderAnexos();
      }
      await Cache.recarregarAlunos();
      this.carregar();
    } catch (e) {
      toastErro(e.message);
    } finally {
      btn.disabled = false;
    }
  },

  async excluir(id) {
    const a = this.lista.find(x => x.id === id);
    const ok = await confirmar(
      `Excluir definitivamente o cadastro de ${a ? a.nome : 'este aluno'}? Vínculos, ocorrências e lançamentos financeiros também serão removidos.`,
      { titulo: 'Excluir aluno', textoOk: 'Excluir' }
    );
    if (!ok) return;

    try {
      await Api.excluir('/api/alunos/' + id);
      toast('Aluno excluído.');
      await Cache.recarregarAlunos();
      this.carregar();
    } catch (e) { toastErro(e.message); }
  },

  // ── Ficha (visualização rápida) ────────────────────────────
  async verFicha(id) {
    let a, ocorrencias = [];
    try {
      a = await Api.get('/api/alunos/' + id);
      if (Sessao.pode('ocorrencias')) ocorrencias = await Api.get('/api/ocorrencias', { aluno_id: id });
    } catch (e) { return toastErro(e.message); }

    document.getElementById('fichaTitulo').textContent = a.nome;
    document.getElementById('fichaSub').textContent =
      `Matrícula ${a.matricula} · ${a.turma_nome || 'sem turma'} · ${SITUACOES[a.situacao]?.rotulo || a.situacao}`;
    document.getElementById('btnImprimirFicha').onclick = () => Relatorios.imprimirFichaAluno(id);

    const linha = (r, v) => `
      <div style="display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">
        <span style="min-width:170px;color:var(--txt2)">${r}</span>
        <span style="flex:1">${v || '—'}</span>
      </div>`;

    document.getElementById('fichaCorpo').innerHTML = `
      <div class="secao-titulo">Dados pessoais</div>
      ${linha('Nascimento', `${dataBR(a.data_nascimento)}${a.idade != null ? ` (${a.idade} anos)` : ''}`)}
      ${linha('CPF', a.cpf ? cpfBR(a.cpf) : '')}
      ${linha('Naturalidade', escapar([a.naturalidade, a.uf_nascimento].filter(Boolean).join(' / ')))}
      ${linha('Nacionalidade', escapar(a.nacionalidade))}
      ${linha('Endereço', escapar([a.logradouro, a.numero, a.bairro, a.cidade, a.estado].filter(Boolean).join(', ')))}

      <div class="secao-titulo">Vida escolar</div>
      ${linha('Turma', escapar(a.turma_nome))}
      ${linha('Turno', TURNOS[a.turma_turno || a.turno] || '')}
      ${linha('Matriculado em', dataBR(a.data_matricula))}

      <div class="secao-titulo">Saúde</div>
      ${linha('Tipo sanguíneo', escapar(a.tipo_sanguineo))}
      ${linha('Alergias', escapar(a.alergias))}
      ${linha('Medicamentos', escapar(a.medicamentos))}
      ${linha('Restrições alimentares', escapar(a.restricoes_alimentares))}
      ${linha('Necessidades especiais', escapar(a.necessidades_especiais))}
      ${linha('Emergência', escapar([a.contato_emergencia, telefoneBR(a.telefone_emergencia)].filter(x => x && x !== '—').join(' · ')))}
      ${linha('Autorizações', [
        a.autoriza_imagem ? 'imagem' : null,
        a.autoriza_medicamento ? 'medicamentos' : null,
        a.autoriza_passeio ? 'passeios' : null,
      ].filter(Boolean).join(', ') || 'nenhuma')}

      <div class="secao-titulo">Responsáveis</div>
      ${(a.responsaveis || []).length ? a.responsaveis.map(r => `
        <div style="padding:9px 0;border-bottom:1px solid var(--border)">
          <div style="font-weight:600;font-size:13px">
            ${escapar(r.nome)} ${r.principal ? '<span class="badge badge-gold">principal</span>' : ''}
          </div>
          <div style="font-size:12px;color:var(--txt2);margin-top:3px">
            ${escapar(r.parentesco || 'parentesco não informado')} ·
            ${telefoneBR(r.whatsapp || r.telefone)} ·
            ${escapar(r.email || 'sem e-mail')}
            ${r.autorizado_retirar ? '' : ' · <span class="c-red">não autorizado a retirar</span>'}
          </div>
        </div>`).join('') : '<div class="form-hint">Nenhum responsável vinculado.</div>'}

      ${ocorrencias.length ? `
        <div class="secao-titulo">Histórico de ocorrências (${ocorrencias.length})</div>
        ${ocorrencias.slice(0, 8).map(o => `
          <div style="padding:9px 0;border-bottom:1px solid var(--border)">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <span class="mono c-txt2" style="font-size:11.5px">${dataBR(o.data_ocorrencia)}</span>
              <strong style="font-size:13px">${escapar(o.titulo)}</strong>
              ${badgeGravidade(o.gravidade)}
              ${o.visivel_responsavel ? '<span class="badge badge-blue">compartilhada</span>' : ''}
              ${o.qtd_anexos ? `<span class="badge badge-cinza">📎 ${o.qtd_anexos}</span>` : ''}
            </div>
            ${o.descricao ? `<div style="font-size:12px;color:var(--txt2);margin-top:3px">${escapar(o.descricao)}</div>` : ''}
          </div>`).join('')}` : ''}`;

    abrirModal('modalFicha');
  },
};

Carregadores.alunos = () => Alunos.carregar();

document.addEventListener('DOMContentLoaded', () => {
  const recarregar = debounce(() => Alunos.carregar(), 380);
  document.getElementById('alunosBusca').addEventListener('input', recarregar);
  document.getElementById('alunosTurma').addEventListener('change', () => Alunos.carregar());
  document.getElementById('alunosSituacao').addEventListener('change', () => Alunos.carregar());

  const nat = document.getElementById('alunoNaturalidade');
  nat.addEventListener('input', debounce(() => Alunos.sugerirMunicipios(), 200));
  nat.addEventListener('change', () => Alunos.sugerirMunicipios());
});

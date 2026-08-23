/* ══════════════════════════════════════════════════════════════
   CEM — Cadastro de Responsáveis
   ══════════════════════════════════════════════════════════════ */

const Responsaveis = {
  lista: [],
  editandoId: null,

  async carregar() {
    const corpo = document.getElementById('respCorpo');
    corpo.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:26px"><span class="spinner"></span></td></tr>`;

    const filtros = {
      busca: document.getElementById('respBusca').value.trim(),
      ativo: document.getElementById('respAtivo').value,
    };

    try { this.lista = await Api.get('/api/responsaveis', filtros); }
    catch (e) {
      corpo.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:26px;color:var(--red)">${escapar(e.message)}</td></tr>`;
      return;
    }

    if (!this.lista.length) {
      corpo.innerHTML = `<tr><td colspan="6"><div class="vazio">
        <span class="ico">👨‍👩‍👧</span><div class="titulo">Nenhum responsável encontrado</div>
        <div class="sub">Cadastre os pais e responsáveis para vincular aos alunos.</div></div></td></tr>`;
      document.getElementById('respTotal').textContent = 'Nenhum registro';
      return;
    }

    corpo.innerHTML = this.lista.map(r => `
      <tr class="clicavel" ondblclick="Responsaveis.abrirEdicao(${r.id})">
        <td>
          <div class="pessoa">
            <div class="av">${iniciais(r.nome)}</div>
            <div>
              <div class="nm">${escapar(r.nome)}</div>
              <div class="sb">${escapar(r.profissao || 'profissão não informada')}</div>
            </div>
          </div>
        </td>
        <td class="mono" style="font-size:12px">${r.cpf ? cpfBR(r.cpf) : '—'}</td>
        <td>
          <div style="font-size:12.5px">${telefoneBR(r.whatsapp || r.telefone)}</div>
          <div style="font-size:11px;color:var(--txt3)">${escapar(r.email || '')}</div>
        </td>
        <td>${r.qtd_alunos
              ? `<span class="badge badge-blue">${r.qtd_alunos}</span>`
              : '<span class="badge badge-cinza">—</span>'}</td>
        <td>${r.tem_acesso
              ? '<span class="badge badge-green">ativo</span>'
              : `<button class="btn btn-ghost btn-sm" onclick="Responsaveis.criarAcesso(${r.id})">criar</button>`}</td>
        <td class="acoes">
          <button class="btn-ico" onclick="Responsaveis.enviarInstrucoesApp(${r.id})" title="Enviar link e instruções do app pelo WhatsApp">📲</button>
          <button class="btn-ico" onclick="Responsaveis.abrirEdicao(${r.id})" title="Editar">✏️</button>
          <button class="btn-ico perigo" onclick="Responsaveis.excluir(${r.id})" title="Excluir">🗑️</button>
        </td>
      </tr>`).join('');

    document.getElementById('respTotal').textContent =
      `${this.lista.length} responsáve${this.lista.length === 1 ? 'l' : 'is'}`;
  },

  /**
   * Abre o cadastro. Quando chamado de dentro da ficha do aluno,
   * `aoSalvar` recebe o id gravado para vincular na hora — nesse caso o
   * aluno já é conhecido, então pulamos a pergunta de "já tem aluno".
   */
  async abrirNovo({ aoSalvar } = {}) {
    this.editandoId = null;
    this.aoSalvar = aoSalvar || null;
    this.vinculoPendente = null;

    const endereco = aoSalvar ? null : await this.perguntarEnderecoDeAluno();

    limparFormulario('formResponsavel');
    document.getElementById('formResponsavel').querySelector('[data-campo=ativo]').checked = true;
    if (endereco) this.preencherEndereco(endereco);
    this.atualizarEstadoWhatsapp();

    document.getElementById('modalRespTitulo').textContent = 'Novo responsável';
    document.getElementById('modalRespSub').textContent = aoSalvar || this.vinculoPendente
      ? 'Ao salvar, ele já será vinculado ao aluno.' : '';
    abrirModal('modalResponsavel');
  },

  /**
   * Fluxo de "já tem aluno cadastrado?" para quem entra pelo cadastro avulso
   * de responsáveis. Pergunta o aluno, o parentesco/vínculo (guardados em
   * `this.vinculoPendente` para o vínculo ser criado ao salvar) e devolve os
   * campos de endereço a copiar, ou null.
   */
  async perguntarEnderecoDeAluno() {
    const temAluno = await confirmar(
      'O aluno deste responsável já está cadastrado no sistema?',
      { titulo: 'Novo responsável', textoOk: 'Sim, selecionar aluno', perigo: false }
    );
    if (!temAluno) return null;

    if (!Cache.alunos.length) await Cache.recarregarAlunos();
    const alunoId = await selecionarOpcao('Selecionar aluno',
      Cache.alunos.map(a => ({ id: a.id, texto: a.nome + (a.turma_nome ? ' · ' + a.turma_nome : '') })),
      { rotulo: 'Aluno' });
    if (!alunoId) return null;

    let aluno;
    try { aluno = await Api.get('/api/alunos/' + alunoId); }
    catch (e) { toastErro(e.message); return null; }

    const vinculo = await this.perguntarVinculo(aluno);
    if (vinculo) {
      this.vinculoPendente = { alunoId: aluno.id, alunoNome: aluno.nome, ...vinculo };
    }

    const repetirDoAluno = await confirmar(
      `Repetir o endereço de ${nomeCurto(aluno.nome)} para este responsável?`,
      { titulo: 'Endereço', textoOk: 'Sim, repetir', perigo: false }
    );
    if (repetirDoAluno) return aluno;

    // Não repetiu do aluno: oferece copiar de um dos responsáveis já vinculados a ele.
    await Cache.recarregarResponsaveis();
    const vinculados = (aluno.responsaveis || [])
      .map(v => Cache.responsaveis.find(r => r.id === v.id))
      .filter(r => r && (r.logradouro || r.cep));
    if (!vinculados.length) return null;

    // Só pergunta se houver endereços realmente diferentes entre eles.
    const chave = r => [r.cep, r.logradouro, r.numero, r.complemento, r.bairro, r.cidade, r.estado].join('|');
    const distintos = [...new Map(vinculados.map(r => [chave(r), r])).values()];
    if (distintos.length === 1) return distintos[0];

    const respId = await selecionarOpcao('Repetir endereço de qual responsável?',
      distintos.map(r => ({ id: r.id, texto: r.nome })), { rotulo: 'Responsável' });
    return distintos.find(r => String(r.id) === String(respId)) || null;
  },

  /** Pergunta parentesco e tipo de vínculo com o aluno selecionado. */
  perguntarVinculo(aluno) {
    return new Promise(resolve => {
      const el = document.createElement('div');
      el.className = 'modal-overlay aberto';
      el.innerHTML = `
        <div class="modal" style="max-width:430px">
          <div class="modal-head"><h3>Vínculo com ${escapar(nomeCurto(aluno.nome))}</h3></div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Parentesco</label>
              <select class="form-select" id="_novoRespParentesco">${opcoesParentesco()}</select>
            </div>
            <div class="form-group">
              <label class="form-label">Vínculo</label>
              <select class="form-select" id="_novoRespTipo">
                ${Object.entries(TIPOS_VINCULO).map(([k, r]) => `<option value="${k}">${escapar(r)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" data-acao="cancelar">Não vincular agora</button>
            <button class="btn btn-primary" data-acao="ok">Confirmar</button>
          </div>
        </div>`;
      document.body.appendChild(el);

      const responder = v => { el.remove(); resolve(v); };
      el.querySelector('[data-acao=ok]').onclick = () => responder({
        parentesco: el.querySelector('#_novoRespParentesco').value || null,
        tipo_vinculo: el.querySelector('#_novoRespTipo').value,
      });
      el.querySelector('[data-acao=cancelar]').onclick = () => responder(null);
      el.onclick = e => { if (e.target === el) responder(null); };
    });
  },

  preencherEndereco(origem) {
    const form = document.getElementById('formResponsavel');
    for (const campo of ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado']) {
      const el = form.querySelector(`[data-campo="${campo}"]`);
      if (el) el.value = origem[campo] || '';
    }
  },

  async abrirEdicao(id, { aoSalvar } = {}) {
    let r;
    try { r = await Api.get('/api/responsaveis/' + id); }
    catch (e) { return toastErro(e.message); }

    this.editandoId = id;
    this.aoSalvar = aoSalvar || null;
    this.vinculoPendente = null;
    limparFormulario('formResponsavel');
    preencherFormulario('formResponsavel', r);
    this.atualizarEstadoWhatsapp();
    document.getElementById('modalRespTitulo').textContent = r.nome;
    document.getElementById('modalRespSub').textContent =
      r.alunos?.length ? `${r.alunos.length} aluno(s) vinculado(s)` : '';
    abrirModal('modalResponsavel');
  },

  // ── WhatsApp = telefone ────────────────────────────────────
  sincronizarWhatsapp() {
    if (!document.getElementById('respMesmoWhatsapp').checked) return;
    const tel = document.querySelector('#formResponsavel [data-campo=telefone]').value;
    document.getElementById('respWhatsapp').value = tel;
  },

  alternarMesmoWhatsapp(marcado) {
    const zap = document.getElementById('respWhatsapp');
    zap.disabled = marcado;
    if (marcado) zap.value = document.querySelector('#formResponsavel [data-campo=telefone]').value;
  },

  /** Ao abrir um cadastro, detecta se telefone e whatsapp já são iguais. */
  atualizarEstadoWhatsapp() {
    const tel = document.querySelector('#formResponsavel [data-campo=telefone]').value;
    const zap = document.getElementById('respWhatsapp');
    const mesmo = !!tel && tel === zap.value;
    document.getElementById('respMesmoWhatsapp').checked = mesmo;
    zap.disabled = mesmo;
  },

  async salvar() {
    const dados = lerFormulario('formResponsavel');
    if (!dados.nome) return toastErro('Informe o nome do responsável.');
    if (!dados.cpf) return toastErro('Informe o CPF do responsável.');
    if (!cpfValido(dados.cpf)) return toastErro('CPF inválido.');
    const enderecoObrigatorio = ['cep', 'logradouro', 'numero', 'bairro', 'cidade', 'estado'];
    if (enderecoObrigatorio.some(campo => !dados[campo])) {
      return toastErro('Preencha o endereço completo do responsável.');
    }

    try {
      let id = this.editandoId;
      const novo = !id;
      if (id) {
        await Api.put('/api/responsaveis/' + id, dados);
        toast('Responsável atualizado.');
      } else {
        const r = await Api.post('/api/responsaveis', dados);
        id = r.id;
        toast('Responsável cadastrado.');
      }

      // Vínculo pedido no fluxo de "já tem aluno cadastrado?"
      const vinculo = this.vinculoPendente;
      this.vinculoPendente = null;
      if (novo && vinculo) {
        try {
          await Api.post(`/api/alunos/${vinculo.alunoId}/responsaveis`, {
            responsavel_id: id, parentesco: vinculo.parentesco, tipo_vinculo: vinculo.tipo_vinculo,
          });
          toast(`Vinculado a ${nomeCurto(vinculo.alunoNome)}.`);
        } catch (e) { toastErro(e.message); }
      }

      fecharModal('modalResponsavel');
      await Cache.recarregarResponsaveis();

      // Devolve o controle a quem abriu (ex.: ficha do aluno)
      const retorno = this.aoSalvar;
      this.aoSalvar = null;
      if (retorno) { await retorno(id); return; }

      this.carregar();
    } catch (e) { toastErro(e.message); }
  },

  async excluir(id) {
    const r = this.lista.find(x => x.id === id);
    const ok = await confirmar(
      `Excluir o cadastro de ${r ? r.nome : 'este responsável'}? O acesso ao aplicativo também será removido.`,
      { titulo: 'Excluir responsável', textoOk: 'Excluir' }
    );
    if (!ok) return;

    try {
      await Api.excluir('/api/responsaveis/' + id);
      toast('Responsável excluído.');
      await Cache.recarregarResponsaveis();
      this.carregar();
    } catch (e) { toastErro(e.message); }
  },

  /** Atalho: cria o acesso ao app já com o responsável selecionado. */
  criarAcesso(id) {
    if (!Sessao.pode('usuarios')) {
      return toast('Somente a direção pode criar acessos ao aplicativo.', 'aviso');
    }
    irPara('usuarios');
    setTimeout(() => Usuarios.abrirNovo({ tipo: 'responsavel', responsavel_id: id }), 300);
  },

  /** Manda pelo WhatsApp o link do app, o passo a passo de instalação e,
   *  quando informado, o login/senha provisória recém-gerados do acesso. */
  enviarInstrucoesApp(id, credenciais = null) {
    // Cai pro Cache (sempre carregado) se a tela de Responsáveis ainda não
    // tiver sido aberta nesta sessão — ex.: acesso criado direto em Usuários.
    const r = this.lista.find(x => x.id === id) || Cache.responsaveis.find(x => x.id === id);
    if (!r) return;

    const contato = r.whatsapp || r.telefone;
    if (!contato) return toast('Este responsável não tem telefone/WhatsApp cadastrado.', 'aviso');

    const blocoAcesso = credenciais
      ? `🔐 *Seu acesso:*\n` +
        `Login: *${credenciais.login}*\n` +
        `Senha provisória: *${credenciais.senha}*\n` +
        `⚠️ Essa senha é válida até *${dataBR(credenciais.validaAte)}*. No primeiro acesso, você vai criar sua senha definitiva.\n\n`
      : '';

    const link = `${location.origin}/app-login`;
    const texto = `Olá, ${nomeCurto(r.nome)}! Aqui é da secretaria do Centro Educacional Milezi. 👋\n\n` +
      `Agora você pode acompanhar tudo pelo nosso aplicativo: mensalidades, ocorrências, comunicados e mais.\n\n` +
      blocoAcesso +
      `📲 *Acesse por aqui:* ${link}\n\n` +
      `*Como instalar no celular:*\n\n` +
      `🤖 *Android (Chrome):* abra o link acima, toque nos 3 pontinhos (⋮) no canto superior direito e escolha "Instalar aplicativo" ou "Adicionar à tela inicial".\n\n` +
      `🍎 *iPhone (Safari):* abra o link acima, toque no ícone de compartilhar (o quadrado com uma seta para cima, na barra inferior) e escolha "Adicionar à Tela de Início".\n\n` +
      `Qualquer dúvida, é só chamar a secretaria!`;

    window.open(`https://wa.me/55${String(contato).replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`, '_blank');
  },
};

Carregadores.responsaveis = () => Responsaveis.carregar();

document.addEventListener('DOMContentLoaded', () => {
  const recarregar = debounce(() => Responsaveis.carregar(), 380);
  document.getElementById('respBusca').addEventListener('input', recarregar);
  document.getElementById('respAtivo').addEventListener('change', () => Responsaveis.carregar());
});

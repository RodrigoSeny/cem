/* ══════════════════════════════════════════════════════════════
   CEM — Usuários e Perfis de Acesso
   ══════════════════════════════════════════════════════════════ */

const Usuarios = {
  lista: [],
  perfis: [],
  editandoId: null,

  async carregar() {
    const corpo = document.getElementById('usuariosCorpo');
    corpo.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:26px"><span class="spinner"></span></td></tr>`;

    try {
      [this.lista, this.perfis] = await Promise.all([
        Api.get('/api/usuarios'),
        Api.get('/api/perfis'),
      ]);
    } catch (e) {
      corpo.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:26px;color:var(--red)">${escapar(e.message)}</td></tr>`;
      return;
    }

    corpo.innerHTML = this.lista.map(u => `
      <tr class="clicavel" ondblclick="Usuarios.abrirEdicao(${u.id})">
        <td>
          <div class="pessoa">
            <div class="av">${iniciais(u.nome)}</div>
            <div>
              <div class="nm">${escapar(u.nome)}</div>
              <div class="sb">${escapar(u.funcionario_nome || u.responsavel_nome || u.email || '')}</div>
            </div>
          </div>
        </td>
        <td class="mono" style="font-size:12px">${escapar(u.login)}</td>
        <td>${u.tipo === 'responsavel'
              ? '<span class="badge badge-purple">app · responsável</span>'
              : '<span class="badge badge-blue">sistema</span>'}</td>
        <td>${escapar(u.perfil_nome || '—')}</td>
        <td style="font-size:12px">${u.ultimo_login ? dataHoraBR(u.ultimo_login) : '<span class="c-txt3">nunca acessou</span>'}</td>
        <td>${u.ativo
              ? '<span class="badge badge-green">ativo</span>'
              : '<span class="badge badge-cinza">inativo</span>'}
            ${u.precisa_trocar_senha ? '<span class="badge badge-gold" title="Senha provisória">🔑</span>' : ''}</td>
        <td class="acoes">
          <button class="btn-ico" onclick="Usuarios.redefinirSenha(${u.id})" title="Redefinir senha">🔑</button>
          <button class="btn-ico" onclick="Usuarios.abrirEdicao(${u.id})" title="Editar">✏️</button>
          <button class="btn-ico perigo" onclick="Usuarios.excluir(${u.id})" title="Excluir">🗑️</button>
        </td>
      </tr>`).join('');

    document.getElementById('usuariosTotal').textContent =
      `${this.lista.length} acesso${this.lista.length === 1 ? '' : 's'} cadastrado${this.lista.length === 1 ? '' : 's'}`;
  },

  /** Gera uma senha provisória legível. */
  senhaSugerida() {
    return 'cem' + Math.floor(1000 + Math.random() * 9000);
  },

  async abrirNovo(pre = {}) {
    this.editandoId = null;
    limparFormulario('formUsuario');

    if (!this.perfis.length) {
      try { this.perfis = await Api.get('/api/perfis'); } catch {}
    }
    this.montarSelects();

    document.getElementById('modalUsuarioTitulo').textContent = 'Novo acesso';
    document.getElementById('usuarioTipo').value = pre.tipo || 'funcionario';
    document.getElementById('usuarioTipo').disabled = false;
    document.getElementById('usuarioSenha').value = this.senhaSugerida();
    document.getElementById('usuarioAtivo').checked = true;
    document.getElementById('grupoSenha').classList.remove('oculto');
    this.trocarTipo();

    if (pre.responsavel_id) {
      document.getElementById('usuarioResponsavel').value = pre.responsavel_id;
      this.preencherPorPessoa('responsavel');
    }

    abrirModal('modalUsuario');
  },

  async abrirEdicao(id) {
    const u = this.lista.find(x => x.id === id);
    if (!u) return;

    this.editandoId = id;
    this.montarSelects();

    limparFormulario('formUsuario');
    preencherFormulario('formUsuario', u);

    document.getElementById('modalUsuarioTitulo').textContent = 'Editar acesso';
    document.getElementById('usuarioTipo').value = u.tipo;
    document.getElementById('usuarioTipo').disabled = true;
    document.getElementById('usuarioFuncionario').value = u.funcionario_id || '';
    document.getElementById('usuarioResponsavel').value = u.responsavel_id || '';
    document.getElementById('usuarioAtivo').checked = !!u.ativo;
    document.getElementById('grupoSenha').classList.add('oculto');
    this.trocarTipo();
    document.getElementById('usuarioPerfil').value = u.perfil_id || '';

    abrirModal('modalUsuario');
  },

  montarSelects() {
    document.getElementById('usuarioPerfil').innerHTML = this.perfis
      .filter(p => p.id !== 'PERFIL-RESPONSAVEL')
      .map(p => `<option value="${p.id}">${escapar(p.nome)}</option>`).join('');

    document.getElementById('usuarioFuncionario').innerHTML =
      '<option value="">— Não vincular —</option>' +
      Cache.funcionarios.map(f => `<option value="${f.id}">${escapar(f.nome)} · ${escapar(f.cargo)}</option>`).join('');

    document.getElementById('usuarioResponsavel').innerHTML =
      '<option value="">Selecione…</option>' +
      Cache.responsaveis.map(r => `<option value="${r.id}">${escapar(r.nome)}</option>`).join('');
  },

  trocarTipo() {
    const tipo = document.getElementById('usuarioTipo').value;
    const eResp = tipo === 'responsavel';
    document.getElementById('grupoFuncionario').classList.toggle('oculto', eResp);
    document.getElementById('grupoResponsavel').classList.toggle('oculto', !eResp);
    document.getElementById('grupoPerfil').classList.toggle('oculto', eResp);
  },

  /** Preenche nome/login/e-mail a partir da pessoa escolhida. */
  preencherPorPessoa(tipo) {
    const id = Number(document.getElementById(tipo === 'responsavel' ? 'usuarioResponsavel' : 'usuarioFuncionario').value);
    if (!id) return;

    const pessoa = (tipo === 'responsavel' ? Cache.responsaveis : Cache.funcionarios).find(p => p.id === id);
    if (!pessoa) return;

    const form = document.getElementById('formUsuario');
    form.querySelector('[data-campo=nome]').value = pessoa.nome;
    if (pessoa.email) form.querySelector('[data-campo=email]').value = pessoa.email;

    const campoLogin = form.querySelector('[data-campo=login]');
    if (!campoLogin.value) {
      campoLogin.value = pessoa.email ||
        pessoa.nome.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').trim().split(/\s+/).slice(0, 2).join('.');
    }
  },

  async salvar() {
    const dados = lerFormulario('formUsuario');
    dados.tipo = document.getElementById('usuarioTipo').value;
    dados.ativo = document.getElementById('usuarioAtivo').checked ? 1 : 0;
    dados.perfil_id = document.getElementById('usuarioPerfil').value;
    dados.funcionario_id = document.getElementById('usuarioFuncionario').value || null;
    dados.responsavel_id = document.getElementById('usuarioResponsavel').value || null;

    if (!dados.nome || !dados.login) return toastErro('Informe o nome e o login.');

    try {
      if (this.editandoId) {
        await Api.put('/api/usuarios/' + this.editandoId, dados);
        toast('Acesso atualizado.');
      } else {
        dados.senha = document.getElementById('usuarioSenha').value;
        if (!dados.senha || dados.senha.length < 6) return toastErro('A senha provisória precisa ter ao menos 6 caracteres.');
        await Api.post('/api/usuarios', dados);
        toast(`Acesso criado. Login: ${dados.login} · senha: ${dados.senha}`, 'sucesso', 12);
      }
      fecharModal('modalUsuario');
      this.carregar();
    } catch (e) { toastErro(e.message); }
  },

  async redefinirSenha(id) {
    const u = this.lista.find(x => x.id === id);
    const nova = this.senhaSugerida();
    const ok = await confirmar(
      `Redefinir a senha de ${u ? u.nome : 'este usuário'} para "${nova}"? A pessoa deverá trocá-la no próximo acesso.`,
      { titulo: 'Redefinir senha', textoOk: 'Redefinir', perigo: false }
    );
    if (!ok) return;

    try {
      await Api.post(`/api/usuarios/${id}/senha`, { senha: nova });
      toast(`Nova senha de ${u.login}: ${nova}`, 'sucesso', 14);
      this.carregar();
    } catch (e) { toastErro(e.message); }
  },

  async excluir(id) {
    const u = this.lista.find(x => x.id === id);
    const ok = await confirmar(
      `Excluir o acesso de ${u ? u.nome : 'este usuário'}? O cadastro da pessoa é mantido.`,
      { titulo: 'Excluir acesso', textoOk: 'Excluir' }
    );
    if (!ok) return;

    try {
      await Api.excluir('/api/usuarios/' + id);
      toast('Acesso excluído.');
      this.carregar();
    } catch (e) { toastErro(e.message); }
  },
};

// ══════════════════════════════════════════════════════════════
const Perfis = {
  lista: [],
  paginas: [],
  editandoId: null,

  async carregar() {
    const alvo = document.getElementById('perfisLista');
    alvo.innerHTML = '<div class="vazio"><span class="spinner"></span></div>';

    try {
      [this.lista, this.paginas] = await Promise.all([
        Api.get('/api/perfis'),
        this.paginas.length ? Promise.resolve(this.paginas) : Api.get('/api/perfis/paginas'),
      ]);
    } catch (e) {
      alvo.innerHTML = `<div class="vazio"><span class="ico">⚠️</span><div class="titulo">${escapar(e.message)}</div></div>`;
      return;
    }

    alvo.innerHTML = this.lista.map(p => `
      <div class="card card-p">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
          <div>
            <div style="font-size:14.5px;font-weight:700">${escapar(p.nome)}</div>
            <div style="font-size:12px;color:var(--txt2);margin-top:3px">${escapar(p.descricao || '')}</div>
          </div>
          ${p.sistema ? '<span class="badge badge-gold">sistema</span>' : ''}
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:5px;margin:14px 0 12px">
          ${p.paginas.length
            ? p.paginas.map(id => {
                const pg = this.paginas.find(x => x.id === id);
                return `<span class="badge badge-cinza">${escapar(pg ? pg.nome : id)}</span>`;
              }).join('')
            : '<span class="badge badge-purple">somente aplicativo</span>'}
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;padding-top:11px;border-top:1px solid var(--border)">
          <span style="font-size:11.5px;color:var(--txt3)">${p.qtd_usuarios} usuário(s)</span>
          <div>
            ${p.id === 'PERFIL-MASTER' ? '' : `<button class="btn-ico" onclick="Perfis.abrirEdicao('${p.id}')" title="Editar">✏️</button>`}
            ${p.sistema ? '' : `<button class="btn-ico perigo" onclick="Perfis.excluir('${p.id}')" title="Excluir">🗑️</button>`}
          </div>
        </div>
      </div>`).join('');
  },

  renderPaginas(selecionadas = []) {
    const grupos = {};
    this.paginas.forEach(p => { (grupos[p.grupo] = grupos[p.grupo] || []).push(p); });

    document.getElementById('perfilPaginas').innerHTML = Object.entries(grupos).map(([grupo, itens]) => `
      <div style="margin-bottom:14px">
        <div style="font-size:10.5px;font-weight:700;color:var(--txt3);text-transform:uppercase;letter-spacing:.09em;margin-bottom:7px">${escapar(grupo)}</div>
        ${itens.map(p => `
          <label class="form-check" style="padding:5px 0">
            <input type="checkbox" value="${p.id}" ${selecionadas.includes(p.id) ? 'checked' : ''}> ${escapar(p.nome)}
          </label>`).join('')}
      </div>`).join('');
  },

  abrirNovo() {
    this.editandoId = null;
    limparFormulario('formPerfil');
    this.renderPaginas([]);
    document.getElementById('modalPerfilTitulo').textContent = 'Novo perfil';
    abrirModal('modalPerfil');
  },

  abrirEdicao(id) {
    const p = this.lista.find(x => x.id === id);
    if (!p) return;
    this.editandoId = id;
    preencherFormulario('formPerfil', p);
    this.renderPaginas(p.paginas);
    document.getElementById('modalPerfilTitulo').textContent = p.nome;
    abrirModal('modalPerfil');
  },

  async salvar() {
    const dados = lerFormulario('formPerfil');
    if (!dados.nome) return toastErro('Informe o nome do perfil.');

    dados.paginas = [...document.querySelectorAll('#perfilPaginas input:checked')].map(el => el.value);

    try {
      if (this.editandoId) {
        await Api.put('/api/perfis/' + this.editandoId, dados);
        toast('Perfil atualizado.');
      } else {
        await Api.post('/api/perfis', dados);
        toast('Perfil criado.');
      }
      fecharModal('modalPerfil');
      this.carregar();
    } catch (e) { toastErro(e.message); }
  },

  async excluir(id) {
    const p = this.lista.find(x => x.id === id);
    const ok = await confirmar(`Excluir o perfil ${p ? p.nome : ''}?`, { titulo: 'Excluir perfil', textoOk: 'Excluir' });
    if (!ok) return;

    try {
      await Api.excluir('/api/perfis/' + id);
      toast('Perfil excluído.');
      this.carregar();
    } catch (e) { toastErro(e.message); }
  },
};

Carregadores.usuarios = () => Usuarios.carregar();
Carregadores.perfis = () => Perfis.carregar();

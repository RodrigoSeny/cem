/* ══════════════════════════════════════════════════════════════
   CEM — Cadastro de Funcionários
   ══════════════════════════════════════════════════════════════ */

const Funcionarios = {
  lista: [],
  editandoId: null,

  async carregar() {
    const corpo = document.getElementById('funcCorpo');
    corpo.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:26px"><span class="spinner"></span></td></tr>`;

    const filtros = {
      busca: document.getElementById('funcBusca').value.trim(),
      setor: document.getElementById('funcSetor').value,
      ativo: document.getElementById('funcAtivo').value,
    };

    try { this.lista = await Api.get('/api/funcionarios', filtros); }
    catch (e) {
      corpo.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:26px;color:var(--red)">${escapar(e.message)}</td></tr>`;
      return;
    }

    this.preencherFiltroSetor();

    if (!this.lista.length) {
      corpo.innerHTML = `<tr><td colspan="8"><div class="vazio">
        <span class="ico">👔</span><div class="titulo">Nenhum funcionário encontrado</div>
        <div class="sub">Cadastre a equipe da escola para montar as turmas.</div></div></td></tr>`;
      document.getElementById('funcTotal').textContent = 'Nenhum registro';
      return;
    }

    corpo.innerHTML = this.lista.map(f => `
      <tr class="clicavel" ondblclick="Funcionarios.abrirEdicao(${f.id})">
        <td>
          <div class="pessoa">
            <div class="av">${iniciais(f.nome)}</div>
            <div>
              <div class="nm">${escapar(f.nome)}</div>
              <div class="sb">${f.qtd_turmas ? `${f.qtd_turmas} turma(s)` : (f.formacao ? escapar(f.formacao) : '—')}</div>
            </div>
          </div>
        </td>
        <td class="mono" style="font-size:12px">${escapar(f.matricula || '—')}</td>
        <td>${escapar(f.cargo)}</td>
        <td>${escapar(f.setor || '—')}</td>
        <td>${dataBR(f.data_admissao)}</td>
        <td>
          <div style="font-size:12.5px">${telefoneBR(f.whatsapp || f.telefone)}</div>
          <div style="font-size:11px;color:var(--txt3)">${escapar(f.email || '')}</div>
        </td>
        <td>${f.ativo
              ? '<span class="badge badge-green">ativo</span>'
              : '<span class="badge badge-cinza">desligado</span>'}</td>
        <td class="acoes">
          <button class="btn-ico" onclick="Funcionarios.abrirEdicao(${f.id})" title="Editar">✏️</button>
          <button class="btn-ico perigo" onclick="Funcionarios.excluir(${f.id})" title="Excluir">🗑️</button>
        </td>
      </tr>`).join('');

    document.getElementById('funcTotal').textContent =
      `${this.lista.length} funcionário${this.lista.length === 1 ? '' : 's'}`;
  },

  preencherFiltroSetor() {
    const sel = document.getElementById('funcSetor');
    if (sel.dataset.pronto) return;
    const setores = [...new Set(this.lista.map(f => f.setor).filter(Boolean))].sort();
    if (!setores.length) return;
    sel.innerHTML = '<option value="">Todos os setores</option>' +
      setores.map(s => `<option value="${escapar(s)}">${escapar(s)}</option>`).join('');
    sel.dataset.pronto = '1';
  },

  async abrirNovo() {
    this.editandoId = null;
    limparFormulario('formFuncionario');

    const form = document.getElementById('formFuncionario');
    form.querySelector('[data-campo=ativo]').checked = true;
    form.querySelector('[data-campo=tipo_contrato]').value = 'clt';
    document.getElementById('modalFuncTitulo').textContent = 'Novo funcionário';

    try {
      const { matricula } = await Api.get('/api/funcionarios/proxima-matricula');
      form.querySelector('[data-campo=matricula]').value = matricula;
    } catch {}

    this.primeiraAba();
    abrirModal('modalFuncionario');
  },

  async abrirEdicao(id) {
    let f;
    try { f = await Api.get('/api/funcionarios/' + id); }
    catch (e) { return toastErro(e.message); }

    this.editandoId = id;
    limparFormulario('formFuncionario');
    preencherFormulario('formFuncionario', f);
    if (f.salario != null) {
      document.getElementById('formFuncionario').querySelector('[data-campo=salario]').value =
        Number(f.salario).toFixed(2).replace('.', ',');
    }
    document.getElementById('modalFuncTitulo').textContent = f.nome;
    this.primeiraAba();
    abrirModal('modalFuncionario');
  },

  primeiraAba() {
    const body = document.getElementById('modalFuncionario').querySelector('.modal-body');
    body.querySelectorAll('.aba').forEach((a, i) => a.classList.toggle('active', i === 0));
    body.querySelectorAll('.aba-conteudo').forEach((c, i) => c.classList.toggle('active', i === 0));
  },

  async salvar() {
    const dados = lerFormulario('formFuncionario');
    if (!dados.nome) {
      toastErro('Informe o nome do funcionário.');
      document.querySelector('.aba[data-aba=fn-dados]').click();
      return;
    }
    if (!dados.cargo) {
      toastErro('Informe o cargo do funcionário.');
      document.querySelector('.aba[data-aba=fn-func]').click();
      return;
    }
    if (dados.cpf && !cpfValido(dados.cpf)) {
      toastErro('CPF inválido.');
      document.querySelector('.aba[data-aba=fn-dados]').click();
      return;
    }

    try {
      if (this.editandoId) {
        await Api.put('/api/funcionarios/' + this.editandoId, dados);
        toast('Funcionário atualizado.');
      } else {
        await Api.post('/api/funcionarios', dados);
        toast('Funcionário cadastrado.');
      }
      fecharModal('modalFuncionario');
      await Cache.recarregarFuncionarios();
      this.carregar();
    } catch (e) { toastErro(e.message); }
  },

  async excluir(id) {
    const f = this.lista.find(x => x.id === id);
    const ok = await confirmar(
      `Excluir o cadastro de ${f ? f.nome : 'este funcionário'}? O acesso ao sistema também será removido.`,
      { titulo: 'Excluir funcionário', textoOk: 'Excluir' }
    );
    if (!ok) return;

    try {
      await Api.excluir('/api/funcionarios/' + id);
      toast('Funcionário excluído.');
      await Cache.recarregarFuncionarios();
      this.carregar();
    } catch (e) { toastErro(e.message); }
  },
};

Carregadores.funcionarios = () => Funcionarios.carregar();

document.addEventListener('DOMContentLoaded', () => {
  const recarregar = debounce(() => Funcionarios.carregar(), 380);
  document.getElementById('funcBusca').addEventListener('input', recarregar);
  document.getElementById('funcSetor').addEventListener('change', () => Funcionarios.carregar());
  document.getElementById('funcAtivo').addEventListener('change', () => Funcionarios.carregar());
});

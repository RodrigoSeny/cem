/* ══════════════════════════════════════════════════════════════
   CEM — Configurações da escola
   ══════════════════════════════════════════════════════════════ */

const Configuracoes = {
  dados: null,

  async carregar() {
    try { this.dados = await Api.get('/api/escola'); }
    catch (e) { return toastErro(e.message); }

    preencherFormulario('formEscola', this.dados || {});
    this.atualizarPreview();

    const input = document.getElementById('logoArquivo');
    if (input && !input._ligado) {
      input._ligado = true;
      input.addEventListener('change', () => this.trocarLogo());
    }

    document.getElementById('cardZonaRisco')?.classList.toggle('oculto',
      !(window.SISTEMA_BETA && Sessao.ehMaster()));
  },

  atualizarPreview() {
    document.getElementById('previewLogo').src = this.dados?.logo_url || '/img/LogoMilezi.jpg';
  },

  /** Envia o novo arquivo de logotipo — troca já é salva na hora. */
  async trocarLogo() {
    const input = document.getElementById('logoArquivo');
    const arquivo = input.files[0];
    if (!arquivo) return;

    const btn = document.getElementById('btnTrocarLogo');
    btn.disabled = true;
    btn.textContent = 'Enviando…';

    const fd = new FormData();
    fd.append('logo', arquivo);

    try {
      const resp = await fetch('/api/escola/logo', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + Sessao.token() },
        body: fd,
      });
      const d = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error((d && d.error) || 'Erro ao enviar o logotipo.');

      this.dados = { ...(this.dados || {}), logo_url: d.logo_url };
      this.atualizarPreview();
      document.getElementById('navLogo').src = d.logo_url;
      Relatorios.escola = null; // força releitura no próximo relatório
      toast('Logotipo atualizado.');
    } catch (e) { toastErro(e.message); }
    finally {
      btn.disabled = false;
      btn.textContent = '🖼️ Trocar logotipo';
      input.value = '';
    }
  },

  async salvar() {
    const dados = lerFormulario('formEscola');
    if (!dados.nome_fantasia) return toastErro('Informe o nome da escola.');

    try {
      await Api.put('/api/escola', dados);
      toast('Configurações salvas.');
      // Reflete a marca imediatamente no menu
      document.getElementById('navNomeEscola').textContent = dados.nome_fantasia;
      Relatorios.escola = null; // força releitura no próximo relatório
    } catch (e) { toastErro(e.message); }
  },

  /**
   * Zera o sistema (só Master, só em beta): apaga alunos, responsáveis,
   * funcionários, turmas, financeiro, mensagens, ocorrências, anexos e
   * acessos — preserva escola, perfis e o próprio usuário Master.
   */
  async limparTudo() {
    const passo1 = await confirmar(
      'Isso apaga TODOS os alunos, responsáveis, funcionários, turmas, financeiro, mensagens, ' +
      'ocorrências, anexos e acessos ao sistema/app — sem volta. Só ficam preservados a ' +
      'configuração da escola, os perfis de acesso e o seu próprio usuário Master. Continuar?',
      { titulo: '⚠️ Apagar todos os dados do sistema', textoOk: 'Continuar' }
    );
    if (!passo1) return;

    const confirmacao = await pedirTexto(
      'Confirme a limpeza',
      { rotulo: 'Digite exatamente APAGAR TUDO para confirmar', textoOk: 'Apagar tudo', placeholder: 'APAGAR TUDO' }
    );
    if (!confirmacao) return;

    try {
      await Api.post('/api/sistema/limpar-tudo', { confirmacao });
      toast('Sistema zerado. Recarregando…');
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) { toastErro(e.message); }
  },
};

Carregadores.configuracoes = () => Configuracoes.carregar();

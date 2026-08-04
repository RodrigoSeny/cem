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

    const campoLogo = document.querySelector('#formEscola [data-campo=logo_url]');
    if (campoLogo && !campoLogo._ligado) {
      campoLogo._ligado = true;
      campoLogo.addEventListener('input', () => this.atualizarPreview());
    }
  },

  atualizarPreview() {
    const url = document.querySelector('#formEscola [data-campo=logo_url]').value.trim();
    document.getElementById('previewLogo').src = url || '/img/LogoMilezi.jpg';
  },

  async salvar() {
    const dados = lerFormulario('formEscola');
    if (!dados.nome_fantasia) return toastErro('Informe o nome da escola.');

    try {
      await Api.put('/api/escola', dados);
      toast('Configurações salvas.');
      // Reflete a marca imediatamente no menu
      document.getElementById('navNomeEscola').textContent = dados.nome_fantasia;
      if (dados.logo_url) document.getElementById('navLogo').src = dados.logo_url;
      Relatorios.escola = null; // força releitura no próximo relatório
    } catch (e) { toastErro(e.message); }
  },
};

Carregadores.configuracoes = () => Configuracoes.carregar();

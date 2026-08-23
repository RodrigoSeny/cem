/* ══════════════════════════════════════════════════════════════
   CEM — Aplicação principal
   Navegação do menu, guia de atalhos, tema e permissões.
   ══════════════════════════════════════════════════════════════ */

const USUARIO = Sessao.exigir('funcionario');

// Catálogo das páginas navegáveis (usado no menu de atalhos)
const PAGINAS_APP = [
  { id: 'home',           rotulo: 'Painel',            ico: '🏠', permissao: 'dashboard' },
  { id: 'alunos',         rotulo: 'Alunos',            ico: '🎓', permissao: 'alunos' },
  { id: 'turmas',         rotulo: 'Turmas',            ico: '🏫', permissao: 'turmas' },
  { id: 'responsaveis',   rotulo: 'Responsáveis',      ico: '👨‍👩‍👧', permissao: 'responsaveis' },
  { id: 'ocorrencias',    rotulo: 'Ocorrências',       ico: '📌', permissao: 'ocorrencias' },
  { id: 'mensagens',      rotulo: 'Mensagens',         ico: '✉️', permissao: 'mensagens' },
  { id: 'funcionarios',   rotulo: 'Funcionários',      ico: '👔', permissao: 'funcionarios' },
  { id: 'fin-painel',       rotulo: 'Painel Financeiro',    ico: '📊', permissao: 'fin-painel' },
  { id: 'fin-cadastros',    rotulo: 'Cadastros Financeiro', ico: '🗂️', permissao: 'fin-cadastros' },
  { id: 'fin-recebimentos', rotulo: 'Recebimentos',         ico: '💵', permissao: 'fin-recebimentos' },
  { id: 'fin-pagamentos',   rotulo: 'Pagamentos',           ico: '💳', permissao: 'fin-pagamentos' },
  { id: 'fin-banco',        rotulo: 'Contas Bancárias',     ico: '🏦', permissao: 'fin-banco' },
  { id: 'fin-conciliacao',  rotulo: 'Conciliação Bancária', ico: '🔗', permissao: 'fin-conciliacao' },
  { id: 'relatorios',     rotulo: 'Relatórios',        ico: '📊', permissao: 'relatorios' },
  { id: 'usuarios',       rotulo: 'Usuários',          ico: '👥', permissao: 'usuarios' },
  { id: 'perfis',         rotulo: 'Perfis de Acesso',  ico: '🛡️', permissao: 'usuarios' },
  { id: 'configuracoes',  rotulo: 'Configurações',     ico: '⚙️', permissao: 'configuracoes' },
  { id: 'sql-manager',    rotulo: 'SQL Manager',       ico: '🗄️', permissao: 'sql-manager' },
];

// Carregadores por página (preenchidos pelos módulos)
const Carregadores = {};

// Cache de listas reaproveitadas em vários formulários
const Cache = {
  turmas: [],
  funcionarios: [],
  responsaveis: [],
  alunos: [],

  async recarregarAlunos() {
    try { this.alunos = await Api.get('/api/alunos', { situacao: 'matriculado' }); }
    catch { this.alunos = []; }
    return this.alunos;
  },

  /** <option> de alunos para selects de outros módulos. */
  opcoesAlunos(selecionado = '', rotuloVazio = 'Selecione…') {
    return `<option value="">${rotuloVazio}</option>` + this.alunos.map(a =>
      `<option value="${a.id}" ${String(a.id) === String(selecionado) ? 'selected' : ''}>${escapar(a.nome)}${a.turma_nome ? ' · ' + escapar(a.turma_nome) : ''}</option>`
    ).join('');
  },

  opcoesTurmas(selecionado = '', rotuloVazio = 'Todas') {
    return `<option value="">${rotuloVazio}</option>` + this.turmas.map(t =>
      `<option value="${t.id}" ${String(t.id) === String(selecionado) ? 'selected' : ''}>${escapar(t.nome)} · ${TURNOS[t.turno] || t.turno}</option>`
    ).join('');
  },

  async recarregarTurmas() {
    try { this.turmas = await Api.get('/api/turmas', { ativa: 1 }); }
    catch { this.turmas = []; }
    return this.turmas;
  },
  async recarregarFuncionarios() {
    try { this.funcionarios = await Api.get('/api/funcionarios', { ativo: 1 }); }
    catch { this.funcionarios = []; }
    return this.funcionarios;
  },
  async recarregarResponsaveis() {
    try { this.responsaveis = await Api.get('/api/responsaveis', { ativo: 1 }); }
    catch { this.responsaveis = []; }
    return this.responsaveis;
  },
};

// ─────────────────────────────────────────────────────────────
// NAVEGAÇÃO
// ─────────────────────────────────────────────────────────────
let paginaAtual = 'home';

function irPara(pagina, aba) {
  const meta = PAGINAS_APP.find(p => p.id === pagina);
  if (meta && !Sessao.pode(meta.permissao)) {
    return toast('Seu perfil não tem acesso a este módulo.', 'aviso');
  }

  // Chegando em Recebimentos/Cadastros sem uma aba específica (atalho,
  // "voltar" etc.), mantém a seção que já estava aberta em vez de perder
  // a marcação do menu.
  if (pagina === 'fin-recebimentos' && !aba) {
    aba = document.querySelector('#pagina-fin-recebimentos .aba-conteudo.active')?.id.replace('recaba-', '') || 'mensalidades';
  }
  if (pagina === 'fin-cadastros' && !aba) {
    aba = document.querySelector('#pagina-fin-cadastros .aba-conteudo.active')?.id.replace('cadaba-', '') || 'planos';
  }

  document.querySelectorAll('.pagina').forEach(el => el.classList.remove('active'));
  const alvo = document.getElementById('pagina-' + pagina);
  if (!alvo) return;
  alvo.classList.add('active');

  document.querySelectorAll('.nav-item, .nav-submenu-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll(`[data-pagina="${pagina}"]`).forEach(el => {
    // Vários itens podem apontar para a mesma página (ex.: as subdivisões
    // de Recebimentos) — o data-aba decide qual deles fica marcado.
    if (el.dataset.aba && el.dataset.aba !== aba) return;
    el.classList.add('active');
    abrirSubmenusAncestrais(el);
  });

  paginaAtual = pagina;
  Atalhos.marcarAtiva();
  document.getElementById('main').scrollTop = 0;
  if (window.innerWidth <= 860) fecharMenuMobile();

  if (pagina === 'fin-recebimentos') {
    Financeiro.abrirAbaRecebimento(aba);
  } else if (pagina === 'fin-cadastros') {
    Financeiro.abrirAbaCadastro(aba);
  } else {
    const carregar = Carregadores[pagina];
    if (carregar) carregar();
  }
}

/** Fecha os demais grupos abertos no mesmo nível de `el` (menu em acordeão). */
function comprimirSubmenusIrmaos(el) {
  if (!el.parentElement) return;
  [...el.parentElement.children].forEach(irmao => {
    if (irmao !== el && irmao.classList.contains('has-submenu')) {
      irmao.classList.remove('aberto');
      irmao.nextElementSibling?.classList.remove('aberto');
    }
  });
}

/** Abre todos os submenus (e subdivisões) que contêm o item, comprimindo os demais. */
function abrirSubmenusAncestrais(el) {
  let no = el.parentElement;
  while (no) {
    if (no.classList && no.classList.contains('nav-submenu') && !no.classList.contains('aberto')) {
      const cabecalho = no.previousElementSibling;
      if (cabecalho) comprimirSubmenusIrmaos(cabecalho);
      no.classList.add('aberto');
      cabecalho?.classList.add('aberto');
    }
    no = no.parentElement;
  }
}

function alternarSubmenu(el) {
  const submenu = el.nextElementSibling;
  if (!submenu || !submenu.classList.contains('nav-submenu')) return;

  const abrindo = !submenu.classList.contains('aberto');
  if (abrindo) comprimirSubmenusIrmaos(el);

  el.classList.toggle('aberto', abrindo);
  submenu.classList.toggle('aberto', abrindo);
}

function alternarMenu() {
  document.getElementById('navMenu').classList.toggle('aberto');
  document.getElementById('navOverlay').classList.toggle('aberto');
}
function fecharMenuMobile() {
  document.getElementById('navMenu').classList.remove('aberto');
  document.getElementById('navOverlay').classList.remove('aberto');
}

// ─────────────────────────────────────────────────────────────
// GUIA DE ATALHOS (abas fixáveis, salvas no navegador)
// ─────────────────────────────────────────────────────────────
const Atalhos = {
  CHAVE: 'cem_atalhos',
  lista: [],

  iniciar() {
    try { this.lista = JSON.parse(localStorage.getItem(this.CHAVE) || 'null') || ['home', 'alunos', 'responsaveis']; }
    catch { this.lista = ['home', 'alunos']; }
    this.lista = this.lista.filter(id => {
      const p = PAGINAS_APP.find(x => x.id === id);
      return p && Sessao.pode(p.permissao);
    });
    this.render();
    this.ajustarAltura();
  },

  salvar() { localStorage.setItem(this.CHAVE, JSON.stringify(this.lista)); },

  render() {
    const tabs = document.getElementById('atalhosTabs');
    tabs.innerHTML = this.lista.map(id => {
      const p = PAGINAS_APP.find(x => x.id === id);
      if (!p) return '';
      return `
        <div class="atalho-tab ${id === paginaAtual ? 'active' : ''}" data-atalho="${id}" onclick="irPara('${id}')">
          <span>${p.ico}</span><span class="lbl">${escapar(p.rotulo)}</span>
          <button class="fechar" onclick="event.stopPropagation();Atalhos.remover('${id}')" title="Remover atalho">✕</button>
        </div>`;
    }).join('');
  },

  marcarAtiva() {
    document.querySelectorAll('.atalho-tab').forEach(el => {
      el.classList.toggle('active', el.dataset.atalho === paginaAtual);
    });
  },

  adicionar(id) {
    if (!this.lista.includes(id)) this.lista.push(id);
    this.salvar(); this.render();
  },

  remover(id) {
    this.lista = this.lista.filter(x => x !== id);
    this.salvar(); this.render(); this.renderMenu();
  },

  abrirMenu(ev) {
    const menu = document.getElementById('atalhosMenu');
    const aberto = menu.style.display === 'block';
    if (aberto) return this.fecharMenu();

    this.renderMenu();
    menu.style.display = 'block';
    const r = ev.currentTarget.getBoundingClientRect();
    menu.style.top = (r.bottom + 6) + 'px';
    menu.style.left = Math.max(10, Math.min(r.left - 260, window.innerWidth - 315)) + 'px';
    document.getElementById('atalhosBusca').focus();

    setTimeout(() => document.addEventListener('click', this._fechaFora), 0);
  },

  _fechaFora(e) {
    const menu = document.getElementById('atalhosMenu');
    if (!menu.contains(e.target) && e.target.id !== 'btnAddAtalho') Atalhos.fecharMenu();
  },

  fecharMenu() {
    document.getElementById('atalhosMenu').style.display = 'none';
    document.removeEventListener('click', this._fechaFora);
  },

  renderMenu() {
    const filtro = (document.getElementById('atalhosBusca').value || '').toLowerCase();
    document.getElementById('atalhosMenuLista').innerHTML = PAGINAS_APP
      .filter(p => Sessao.pode(p.permissao) && p.rotulo.toLowerCase().includes(filtro))
      .map(p => `
        <label class="atalhos-menu-item">
          <input type="checkbox" ${this.lista.includes(p.id) ? 'checked' : ''}
                 onchange="this.checked ? Atalhos.adicionar('${p.id}') : Atalhos.remover('${p.id}')">
          <span>${p.ico}</span><span>${escapar(p.rotulo)}</span>
        </label>`).join('');
  },

  /** A faixa fixa empurra menu e conteúdo para baixo. */
  ajustarAltura() {
    const faixa = document.getElementById('faixaAtalhos');
    const altura = faixa && getComputedStyle(faixa).display !== 'none' ? faixa.offsetHeight : 0;
    document.documentElement.style.setProperty('--faixas-altura', altura + 'px');
  },
};

window.addEventListener('resize', () => Atalhos.ajustarAltura());

// ─────────────────────────────────────────────────────────────
// TEMA
// ─────────────────────────────────────────────────────────────
function alternarTema() {
  const claro = document.body.classList.toggle('tema-claro');
  localStorage.setItem('cem_tema', claro ? 'claro' : 'escuro');
}
if (localStorage.getItem('cem_tema') === 'claro') document.body.classList.add('tema-claro');

// ─────────────────────────────────────────────────────────────
// TROCA DE SENHA
// ─────────────────────────────────────────────────────────────
function abrirTrocarSenha() {
  ['senhaAtual', 'senhaNova', 'senhaConfirma'].forEach(id => document.getElementById(id).value = '');
  abrirModal('modalSenha');
}

async function trocarSenha() {
  const atual = document.getElementById('senhaAtual').value;
  const nova = document.getElementById('senhaNova').value;
  const conf = document.getElementById('senhaConfirma').value;

  if (nova.length < 6) return toastErro('A nova senha precisa ter ao menos 6 caracteres.');
  if (nova !== conf) return toastErro('A confirmação não confere com a nova senha.');

  try {
    await Api.post('/api/auth/trocar-senha', { senha_atual: atual, senha_nova: nova });
    fecharModal('modalSenha');
    toast('Senha alterada com sucesso.');
  } catch (e) { toastErro(e.message); }
}

// ─────────────────────────────────────────────────────────────
// ABAS DOS MODAIS
// ─────────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const aba = e.target.closest('.aba');
  if (!aba || !aba.dataset.aba) return;
  const grupo = aba.closest('.modal-body');
  grupo.querySelectorAll('.aba').forEach(a => a.classList.remove('active'));
  grupo.querySelectorAll('.aba-conteudo').forEach(c => c.classList.remove('active'));
  aba.classList.add('active');
  grupo.querySelector('#aba-' + aba.dataset.aba)?.classList.add('active');
});

// ─────────────────────────────────────────────────────────────
// PERMISSÕES NO MENU
// ─────────────────────────────────────────────────────────────
function aplicarPermissoes() {
  document.querySelectorAll('[data-pagina]').forEach(el => {
    const meta = PAGINAS_APP.find(p => p.id === el.dataset.pagina);
    if (meta && !Sessao.pode(meta.permissao)) el.classList.add('oculto');
  });

  // Esconde cabeçalho de submenu que ficou sem itens visíveis. Processa do
  // mais aninhado para o mais externo, para uma subdivisão vazia (ex.:
  // Recebimentos sem nenhuma aba liberada) já refletir no submenu que a contém.
  [...document.querySelectorAll('.nav-submenu')].reverse().forEach(sub => {
    const visiveis = [...sub.children].filter(c => !c.classList.contains('oculto'));
    if (!visiveis.length) {
      sub.classList.add('oculto');
      sub.previousElementSibling?.classList.add('oculto');
    }
  });
}

/** Primeira página que o usuário pode abrir. */
function paginaInicial() {
  const preferida = PAGINAS_APP.find(p => Sessao.pode(p.permissao));
  return preferida ? preferida.id : 'home';
}

// ─────────────────────────────────────────────────────────────
// INICIALIZAÇÃO
// ─────────────────────────────────────────────────────────────
async function iniciar() {
  if (!USUARIO) return;

  // Identificação do usuário
  document.getElementById('navNome').textContent = USUARIO.nome;
  document.getElementById('navPerfil').textContent = USUARIO.perfil_nome || '—';
  document.getElementById('navAvatar').textContent = iniciais(USUARIO.nome);
  document.getElementById('atalhoNome').textContent = nomeCurto(USUARIO.nome);
  document.getElementById('atalhoAvatar').textContent = iniciais(USUARIO.nome);

  // Marca da escola
  try {
    const e = await fetch('/api/escola/publica').then(r => r.json());
    if (e.nome_fantasia) {
      document.getElementById('navNomeEscola').textContent = e.nome_fantasia;
      document.title = `${e.nome_fantasia} — Gestão Escolar`;
    }
    if (e.logo_url) document.getElementById('navLogo').src = e.logo_url;
  } catch {}

  // Aviso de teste beta (some sozinho quando BETA sair do .env do servidor)
  try {
    const r = await Api.get('/api/sistema/beta');
    window.SISTEMA_BETA = !!r.beta;
    document.getElementById('avisoBeta').classList.toggle('oculto', !r.beta);
  } catch { window.SISTEMA_BETA = false; }

  // Cliques do menu
  document.querySelectorAll('[data-pagina]').forEach(el => {
    el.addEventListener('click', () => irPara(el.dataset.pagina, el.dataset.aba));
  });

  aplicarPermissoes();
  aplicarMascaras();
  ativarVerSenha();
  Atalhos.iniciar();

  // Listas compartilhadas
  await Promise.all([
    Cache.recarregarTurmas(),
    Cache.recarregarFuncionarios(),
    Cache.recarregarResponsaveis(),
    Cache.recarregarAlunos(),
  ]);

  // Municípios (naturalidade) — em segundo plano, sem travar a tela
  Municipios.carregar().then(() => {
    if (document.getElementById('alunoNacionalidade')) Alunos.trocarNacionalidade();
  });

  // Seletores de ano letivo
  const anoAtual = new Date().getFullYear();
  const anos = [anoAtual + 1, anoAtual, anoAtual - 1, anoAtual - 2];
  ['painelAno', 'turmasAno'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = anos.map(a => `<option value="${a}" ${a === anoAtual ? 'selected' : ''}>${a}</option>`).join('');
  });

  irPara(paginaInicial());

  if (USUARIO.precisa_trocar_senha) {
    toast('Sua senha é provisória — troque no ícone 🔑 ao lado do seu nome.', 'aviso', 9);
  }
}

document.addEventListener('DOMContentLoaded', iniciar);

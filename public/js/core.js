/* ══════════════════════════════════════════════════════════════
   CEM — Núcleo do front-end
   Sessão, chamadas à API, formatação, toasts e modais.
   Carregado por index.html e portal.html.
   ══════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────────────
// SESSÃO
// ─────────────────────────────────────────────────────────────
// Espelha o catálogo do servidor (src/auth.js): páginas só do Master
const PAGINAS_SO_MASTER = ['sql-manager'];

const Sessao = {
  token()   { return sessionStorage.getItem('cem_token'); },
  usuario() {
    try { return JSON.parse(sessionStorage.getItem('cem_usuario') || 'null'); }
    catch { return null; }
  },
  salvar(token, usuario) {
    sessionStorage.setItem('cem_token', token);
    sessionStorage.setItem('cem_usuario', JSON.stringify(usuario));
  },
  /** Quem está no app volta para o login do app; o resto, para o do sistema. */
  telaLogin() {
    return location.pathname.startsWith('/app') ? '/app-login' : '/';
  },

  encerrar() {
    const destino = this.telaLogin();
    sessionStorage.removeItem('cem_token');
    sessionStorage.removeItem('cem_usuario');
    window.location.href = destino;
  },

  /** Exige sessão válida do tipo indicado ('funcionario' | 'responsavel' | null = qualquer). */
  exigir(tipo) {
    const t = this.token();
    const u = this.usuario();
    if (!t || !u) { window.location.href = this.telaLogin(); return null; }
    try {
      const p = JSON.parse(atob(t.split('.')[1]));
      if (p.exp * 1000 <= Date.now()) { this.encerrar(); return null; }
    } catch { this.encerrar(); return null; }

    if (tipo && u.tipo !== tipo) {
      window.location.href = u.tipo === 'responsavel' ? '/app' : '/sistema';
      return null;
    }
    return u;
  },
  /** É o perfil Master? (o único que enxerga o próprio Master e o SQL Manager) */
  ehMaster() {
    const u = this.usuario();
    return !!u && u.tipo === 'funcionario' && u.perfil_id === 'PERFIL-MASTER';
  },

  /** O usuário tem acesso à página informada? */
  pode(pagina) {
    const u = this.usuario();
    if (!u) return false;
    // Página exclusiva do Master não é liberada nem para a Direção
    if (PAGINAS_SO_MASTER.includes(pagina)) return this.ehMaster();
    if (['PERFIL-MASTER', 'PERFIL-DIRECAO'].includes(u.perfil_id)) return true;
    return Array.isArray(u.paginas) && u.paginas.includes(pagina);
  },
};

// ─────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────
const Api = {
  async requisitar(metodo, url, corpo) {
    const opcoes = {
      method: metodo,
      headers: { 'Authorization': 'Bearer ' + Sessao.token() },
    };
    if (corpo !== undefined) {
      opcoes.headers['Content-Type'] = 'application/json';
      opcoes.body = JSON.stringify(corpo);
    }

    let resp;
    try {
      resp = await fetch(url, opcoes);
    } catch {
      throw new Error('Sem conexão com o servidor.');
    }

    if (resp.status === 401) { Sessao.encerrar(); throw new Error('Sessão expirada.'); }

    const texto = await resp.text();
    let dados = null;
    try { dados = texto ? JSON.parse(texto) : null; } catch { dados = null; }

    if (!resp.ok) throw new Error((dados && dados.error) || 'Erro ao processar a solicitação.');
    return dados;
  },
  get(url, params) {
    if (params) {
      const q = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
      ).toString();
      if (q) url += (url.includes('?') ? '&' : '?') + q;
    }
    return this.requisitar('GET', url);
  },
  post(url, corpo)   { return this.requisitar('POST', url, corpo || {}); },
  put(url, corpo)    { return this.requisitar('PUT', url, corpo || {}); },
  excluir(url)       { return this.requisitar('DELETE', url); },
};

// ─────────────────────────────────────────────────────────────
// TOASTS
// ─────────────────────────────────────────────────────────────
function toast(mensagem, tipo = 'sucesso', segundos = 4) {
  let caixa = document.querySelector('.toasts');
  if (!caixa) {
    caixa = document.createElement('div');
    caixa.className = 'toasts';
    document.body.appendChild(caixa);
  }
  const icones = { sucesso: '✅', erro: '⚠️', aviso: '💡', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = 'toast ' + tipo;
  el.innerHTML = `<span class="ico">${icones[tipo] || 'ℹ️'}</span><span>${escapar(mensagem)}</span>`;
  caixa.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 250);
  }, segundos * 1000);
}

const toastErro = m => toast(m, 'erro', 6);

// ─────────────────────────────────────────────────────────────
// MODAIS
// ─────────────────────────────────────────────────────────────
function abrirModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('aberto');
}
function fecharModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('aberto');
}

/** O modal tem campos preenchíveis? Se tem, é cadastro. */
function ehFormulario(modal) {
  return !!modal.querySelector('input:not([type=checkbox]):not([type=radio]), textarea, select');
}

// Modal de cadastro não fecha sozinho — nem por clique fora, nem por ESC.
// Um toque acidental descartava o formulário inteiro. Fecha só pelo ✕,
// pelo Cancelar ou pelo botão de salvar. Modais de leitura (ficha, extrato,
// detalhe) continuam saindo com ESC, porque ali não há nada a perder.
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const abertos = document.querySelectorAll('.modal-overlay.aberto');
  if (!abertos.length) return;

  const topo = abertos[abertos.length - 1];
  if (ehFormulario(topo)) return;
  topo.classList.remove('aberto');
});

/** Confirmação em modal (substitui o confirm() do navegador). */
function confirmar(mensagem, { titulo = 'Confirmar', textoOk = 'Confirmar', perigo = true } = {}) {
  return new Promise(resolve => {
    const id = 'modalConfirmar_' + Date.now();
    const el = document.createElement('div');
    el.className = 'modal-overlay aberto';
    el.id = id;
    el.innerHTML = `
      <div class="modal" style="max-width:430px">
        <div class="modal-head"><h3>${escapar(titulo)}</h3></div>
        <div class="modal-body" style="font-size:13.5px;line-height:1.6">${escapar(mensagem)}</div>
        <div class="modal-foot">
          <button class="btn btn-ghost" data-acao="nao">Cancelar</button>
          <button class="btn ${perigo ? 'btn-danger' : 'btn-primary'}" data-acao="sim">${escapar(textoOk)}</button>
        </div>
      </div>`;
    document.body.appendChild(el);

    const responder = v => { el.remove(); resolve(v); };
    el.querySelector('[data-acao=sim]').onclick = () => responder(true);
    el.querySelector('[data-acao=nao]').onclick = () => responder(false);
    el.onclick = e => { if (e.target === el) responder(false); };
  });
}

/** Seleção única em lista, em modal (resolve o id escolhido, ou null se cancelar). */
function selecionarOpcao(titulo, opcoes, { rotulo = 'Selecione', textoOk = 'Confirmar' } = {}) {
  return new Promise(resolve => {
    const id = 'modalSelecionar_' + Date.now();
    const el = document.createElement('div');
    el.className = 'modal-overlay aberto';
    el.id = id;
    el.innerHTML = `
      <div class="modal" style="max-width:430px">
        <div class="modal-head"><h3>${escapar(titulo)}</h3></div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">${escapar(rotulo)}</label>
            <select class="form-select" data-sel>
              <option value="">Selecione…</option>
              ${opcoes.map(o => `<option value="${o.id}">${escapar(o.texto)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" data-acao="cancelar">Cancelar</button>
          <button class="btn btn-primary" data-acao="ok">${escapar(textoOk)}</button>
        </div>
      </div>`;
    document.body.appendChild(el);

    const responder = v => { el.remove(); resolve(v); };
    el.querySelector('[data-acao=ok]').onclick = () => {
      const v = el.querySelector('[data-sel]').value;
      if (v) responder(v);
    };
    el.querySelector('[data-acao=cancelar]').onclick = () => responder(null);
    el.onclick = e => { if (e.target === el) responder(null); };
  });
}

// ─────────────────────────────────────────────────────────────
// FORMATAÇÃO
// ─────────────────────────────────────────────────────────────
function escapar(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 'YYYY-MM-DD' → 'DD/MM/AAAA' */
function dataBR(v) {
  if (!v) return '—';
  const s = String(v).slice(0, 10);
  const [a, m, d] = s.split('-');
  return (a && m && d) ? `${d}/${m}/${a}` : v;
}

/** 'YYYY-MM-DD HH:MM:SS' → 'DD/MM/AAAA HH:MM' */
function dataHoraBR(v) {
  if (!v) return '—';
  const s = String(v).replace('T', ' ');
  return `${dataBR(s.slice(0, 10))} ${s.slice(11, 16)}`;
}

function moedaBR(v) {
  const n = Number(v);
  if (!isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function cpfBR(v) {
  const s = String(v || '').replace(/\D/g, '');
  if (s.length !== 11) return v || '—';
  return `${s.slice(0,3)}.${s.slice(3,6)}.${s.slice(6,9)}-${s.slice(9)}`;
}

function telefoneBR(v) {
  const s = String(v || '').replace(/\D/g, '');
  if (s.length === 11) return `(${s.slice(0,2)}) ${s.slice(2,7)}-${s.slice(7)}`;
  if (s.length === 10) return `(${s.slice(0,2)}) ${s.slice(2,6)}-${s.slice(6)}`;
  return v || '—';
}

function cepBR(v) {
  const s = String(v || '').replace(/\D/g, '');
  return s.length === 8 ? `${s.slice(0,5)}-${s.slice(5)}` : (v || '—');
}

/** Iniciais para o avatar. */
function iniciais(nome) {
  const p = String(nome || '?').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

/** Primeiro + último nome (listagens compactas). */
function nomeCurto(nome) {
  const p = String(nome || '').trim().split(/\s+/);
  return p.length > 2 ? `${p[0]} ${p[p.length - 1]}` : (nome || '');
}

const SITUACOES = {
  pre_matricula: { rotulo: 'Pré-matrícula', cor: 'badge-blue' },
  matriculado:   { rotulo: 'Matriculado',   cor: 'badge-green' },
  transferido:   { rotulo: 'Transferido',   cor: 'badge-cinza' },
  trancado:      { rotulo: 'Trancado',      cor: 'badge-gold' },
  desistente:    { rotulo: 'Desistente',    cor: 'badge-red' },
  egresso:       { rotulo: 'Egresso',       cor: 'badge-purple' },
};

const TURNOS = { manha: 'Manhã', tarde: 'Tarde', integral: 'Integral', noite: 'Noite' };

// Lista fechada de parentescos — evita "mae", "Mãe", "MAE" no mesmo banco
const PARENTESCOS = [
  'Mãe', 'Pai', 'Madrasta', 'Padrasto', 'Avó', 'Avô', 'Tia', 'Tio',
  'Irmã', 'Irmão', 'Madrinha', 'Padrinho', 'Tutor(a) legal',
  'Guardião(ã)', 'Responsável legal', 'Outro',
];

const TIPOS_VINCULO = {
  ambos: 'Financeiro e pedagógico',
  financeiro: 'Financeiro',
  pedagogico: 'Pedagógico',
};

const GRAVIDADES = {
  informativa: { rotulo: 'Informativa', cor: 'badge-blue' },
  atencao:     { rotulo: 'Atenção',     cor: 'badge-gold' },
  grave:       { rotulo: 'Grave',       cor: 'badge-red' },
};

const SITUACOES_FIN = {
  aberta:    { rotulo: 'Em aberto', cor: 'badge-blue' },
  vencida:   { rotulo: 'Vencida',   cor: 'badge-red' },
  paga:      { rotulo: 'Paga',      cor: 'badge-green' },
  cancelada: { rotulo: 'Cancelada', cor: 'badge-cinza' },
};

const FORMAS_PAGAMENTO = {
  dinheiro: 'Dinheiro', pix: 'PIX', transferencia: 'Transferência',
  cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito',
  boleto: 'Boleto', cheque: 'Cheque',
};

/** Competência 'AAAA-MM' → 'mês/AAAA' */
function competenciaBR(v) {
  if (!v) return '—';
  const [a, m] = String(v).split('-');
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${meses[Number(m) - 1] || m}/${a}`;
}

function badgeGravidade(g) {
  const c = GRAVIDADES[g] || GRAVIDADES.informativa;
  return `<span class="badge ${c.cor}">${c.rotulo}</span>`;
}

function badgeFinanceiro(s) {
  const c = SITUACOES_FIN[s] || SITUACOES_FIN.aberta;
  return `<span class="badge ${c.cor}">${c.rotulo}</span>`;
}

/** Preenche um <select> com as opções de parentesco. */
function opcoesParentesco(selecionado = '') {
  return '<option value="">Selecione…</option>' +
    PARENTESCOS.map(p => `<option ${p === selecionado ? 'selected' : ''}>${p}</option>`).join('');
}

// ─────────────────────────────────────────────────────────────
// MUNICÍPIOS (IBGE) — usado na naturalidade
// A lista é baixada uma vez e guardada no navegador.
// ─────────────────────────────────────────────────────────────
const Municipios = {
  CHAVE: 'cem_municipios_ibge',
  lista: null,

  async carregar() {
    if (this.lista) return this.lista;

    // 1) cache do navegador
    try {
      const cache = JSON.parse(localStorage.getItem(this.CHAVE) || 'null');
      if (cache && Array.isArray(cache.dados) && cache.dados.length > 1000) {
        this.lista = cache.dados;
        return this.lista;
      }
    } catch {}

    // 2) servidor (que busca no IBGE e guarda em disco)
    try {
      const d = await Api.get('/api/municipios');
      this.lista = d.municipios || [];
      if (this.lista.length) {
        try { localStorage.setItem(this.CHAVE, JSON.stringify({ dados: this.lista, em: Date.now() })); } catch {}
      }
    } catch {
      this.lista = [];   // sem lista: o campo segue aceitando digitação livre
    }
    return this.lista;
  },

  /** A autocompletar está disponível? */
  get disponivel() { return Array.isArray(this.lista) && this.lista.length > 0; },

  /** Municípios que começam pelo termo (máx. 30). */
  buscar(termo) {
    if (!this.lista || !termo || termo.length < 2) return [];
    const t = termo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const casa = m => m.n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').startsWith(t);
    return this.lista.filter(casa).slice(0, 30);
  },

  /** UF de um município pelo nome exato (null se ambíguo ou inexistente). */
  ufDe(nome) {
    if (!this.lista || !nome) return null;
    const t = nome.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const achados = this.lista.filter(m =>
      m.n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') === t);
    return achados.length === 1 ? achados[0].uf : null;
  },
};

// ─────────────────────────────────────────────────────────────
// ANEXOS — componente reutilizável (aluno, ocorrência, etc.)
// ─────────────────────────────────────────────────────────────
const Anexos = {
  categorias: [],

  async carregarCategorias() {
    if (this.categorias.length) return this.categorias;
    try { this.categorias = await Api.get('/api/anexos/categorias'); }
    catch { this.categorias = [{ id: 'documento', nome: 'Documento' }]; }
    return this.categorias;
  },

  async listar(entidade, entidadeId) {
    return Api.get('/api/anexos', { entidade, entidade_id: entidadeId });
  },

  async enviar(entidade, entidadeId, arquivo, categoria, descricao) {
    const fd = new FormData();
    fd.append('arquivo', arquivo);
    fd.append('entidade', entidade);
    fd.append('entidade_id', entidadeId);
    fd.append('categoria', categoria || 'documento');
    if (descricao) fd.append('descricao', descricao);

    const resp = await fetch('/api/anexos', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + Sessao.token() },
      body: fd,
    });
    const d = await resp.json().catch(() => null);
    if (!resp.ok) throw new Error((d && d.error) || 'Erro ao enviar o arquivo.');
    return d;
  },

  excluir(id) { return Api.excluir('/api/anexos/' + id); },

  /** Abre o arquivo numa nova aba (a rota exige token, então baixamos primeiro). */
  async abrir(id, nome) {
    try {
      const resp = await fetch(`/api/anexos/${id}/arquivo`, {
        headers: { Authorization: 'Bearer ' + Sessao.token() },
      });
      if (!resp.ok) throw new Error('Não foi possível abrir o arquivo.');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      if (blob.type.startsWith('image/') || blob.type === 'application/pdf') a.target = '_blank';
      else a.download = nome || 'arquivo';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { toastErro(e.message); }
  },

  /** Ícone por tipo de arquivo. */
  icone(mime) {
    if (!mime) return '📎';
    if (mime.startsWith('image/')) return '🖼️';
    if (mime === 'application/pdf') return '📄';
    return '📎';
  },

  tamanho(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  },
};

function badgeSituacao(s) {
  const c = SITUACOES[s] || { rotulo: s || '—', cor: 'badge-cinza' };
  return `<span class="badge ${c.cor}">${escapar(c.rotulo)}</span>`;
}

// ─────────────────────────────────────────────────────────────
// FORMULÁRIOS
// ─────────────────────────────────────────────────────────────
/** Lê os campos [data-campo] de um container e devolve um objeto. */
function lerFormulario(container) {
  const raiz = typeof container === 'string' ? document.getElementById(container) : container;
  const dados = {};
  raiz.querySelectorAll('[data-campo]').forEach(el => {
    const nome = el.dataset.campo;
    dados[nome] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value.trim();
  });
  return dados;
}

/** Preenche os campos [data-campo] a partir de um objeto. */
function preencherFormulario(container, dados = {}) {
  const raiz = typeof container === 'string' ? document.getElementById(container) : container;
  raiz.querySelectorAll('[data-campo]').forEach(el => {
    const v = dados[el.dataset.campo];
    if (el.type === 'checkbox') el.checked = !!Number(v);
    else el.value = (v === null || v === undefined) ? '' : v;
  });
}

/** Limpa os campos [data-campo]. */
function limparFormulario(container) {
  const raiz = typeof container === 'string' ? document.getElementById(container) : container;
  raiz.querySelectorAll('[data-campo]').forEach(el => {
    if (el.type === 'checkbox') el.checked = false;
    else el.value = '';
  });
}

/** Máscaras simples aplicadas conforme o atributo data-mascara. */
function aplicarMascaras(raiz = document) {
  raiz.querySelectorAll('[data-mascara]').forEach(el => {
    if (el._mascarado) return;
    el._mascarado = true;
    el.addEventListener('input', () => {
      const tipo = el.dataset.mascara;
      let v = el.value.replace(/\D/g, '');
      if (tipo === 'cpf') {
        v = v.slice(0, 11)
          .replace(/(\d{3})(\d)/, '$1.$2')
          .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
          .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
      } else if (tipo === 'telefone') {
        v = v.slice(0, 11);
        v = v.length > 10
          ? v.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3')
          : v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
        v = v.replace(/[-\s]*$/, '');
      } else if (tipo === 'cep') {
        v = v.slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
      } else if (tipo === 'cnpj') {
        v = v.slice(0, 14)
          .replace(/(\d{2})(\d)/, '$1.$2')
          .replace(/(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
          .replace(/\.(\d{3})(\d)/, '.$1/$2')
          .replace(/(\d{4})(\d)/, '$1-$2');
      }
      el.value = v;
    });
  });
}

/** Busca de CEP (ViaCEP) — preenche os campos de endereço do container. */
async function buscarCep(cep, container) {
  const s = String(cep || '').replace(/\D/g, '');
  if (s.length !== 8) return;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${s}/json/`);
    const d = await r.json();
    if (d.erro) return;
    const raiz = typeof container === 'string' ? document.getElementById(container) : container;
    const set = (campo, valor) => {
      const el = raiz.querySelector(`[data-campo="${campo}"]`);
      if (el && valor) el.value = valor;
    };
    set('logradouro', d.logradouro);
    set('bairro', d.bairro);
    set('cidade', d.localidade);
    set('estado', d.uf);
  } catch { /* offline: segue preenchimento manual */ }
}

// ─────────────────────────────────────────────────────────────
// UI — componentes reaproveitados por vários módulos
// ─────────────────────────────────────────────────────────────
const UI = {
  /**
   * Painel de anexos: lista os arquivos e oferece o envio de novos.
   * Usado na ficha do aluno e na ocorrência.
   */
  async painelAnexos(alvo, entidade, entidadeId, { titulo = 'Arquivos anexados' } = {}) {
    const el = typeof alvo === 'string' ? document.getElementById(alvo) : alvo;
    if (!el) return;

    const categorias = await Anexos.carregarCategorias();
    const idUpload = `up_${entidade}_${entidadeId}`;

    el.innerHTML = `
      <div class="filtros" style="margin-bottom:12px">
        <div class="campo">
          <label>Tipo do documento</label>
          <select class="form-select" id="${idUpload}_cat" style="min-width:210px">
            ${categorias.map(c => `<option value="${c.id}">${escapar(c.nome)}</option>`).join('')}
          </select>
        </div>
        <div class="campo busca">
          <label>Descrição (opcional)</label>
          <input class="form-input" id="${idUpload}_desc" placeholder="Ex.: validade até 2027">
        </div>
        <div class="campo">
          <label>&nbsp;</label>
          <input type="file" id="${idUpload}_file" class="oculto" accept="image/*,application/pdf" multiple>
          <button class="btn btn-primary" id="${idUpload}_btn">📎 Anexar arquivo</button>
        </div>
      </div>
      <div class="form-hint mb-3">Imagens (JPG, PNG, WEBP) ou PDF, até 12 MB por arquivo.</div>
      <div id="${idUpload}_lista"><div class="vazio" style="padding:20px"><span class="spinner"></span></div></div>`;

    const input = document.getElementById(`${idUpload}_file`);
    const botao = document.getElementById(`${idUpload}_btn`);

    botao.onclick = () => input.click();
    input.onchange = async () => {
      const arquivos = [...input.files];
      if (!arquivos.length) return;

      const categoria = document.getElementById(`${idUpload}_cat`).value;
      const descricao = document.getElementById(`${idUpload}_desc`).value.trim();

      botao.disabled = true;
      botao.textContent = 'Enviando...';
      let enviados = 0;
      for (const arq of arquivos) {
        try { await Anexos.enviar(entidade, entidadeId, arq, categoria, descricao); enviados++; }
        catch (e) { toastErro(`${arq.name}: ${e.message}`); }
      }
      botao.disabled = false;
      botao.textContent = '📎 Anexar arquivo';
      input.value = '';
      document.getElementById(`${idUpload}_desc`).value = '';
      if (enviados) toast(`${enviados} arquivo(s) anexado(s).`);
      this.listarAnexos(`${idUpload}_lista`, entidade, entidadeId);
    };

    this.listarAnexos(`${idUpload}_lista`, entidade, entidadeId);
  },

  async listarAnexos(alvoId, entidade, entidadeId) {
    const el = document.getElementById(alvoId);
    if (!el) return;

    let lista;
    try { lista = await Anexos.listar(entidade, entidadeId); }
    catch (e) {
      el.innerHTML = `<div class="form-hint c-red">${escapar(e.message)}</div>`;
      return;
    }

    if (!lista.length) {
      el.innerHTML = `<div class="vazio" style="padding:24px">
        <span class="ico">📂</span><div class="titulo">Nenhum documento anexado</div>
        <div class="sub">Use o botão acima para enviar fotos ou PDFs.</div></div>`;
      return;
    }

    const categorias = await Anexos.carregarCategorias();
    const nomeCat = id => categorias.find(c => c.id === id)?.nome || id;

    el.innerHTML = `
      <div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Documento</th><th>Tipo</th><th>Tamanho</th><th>Enviado em</th><th class="acoes">Ações</th></tr></thead>
        <tbody>
          ${lista.map(a => `
            <tr>
              <td>
                <div style="display:flex;align-items:center;gap:9px">
                  <span style="font-size:17px">${Anexos.icone(a.mime)}</span>
                  <div>
                    <div style="font-weight:600;font-size:12.5px">${escapar(a.nome_original)}</div>
                    ${a.descricao ? `<div style="font-size:11px;color:var(--txt3)">${escapar(a.descricao)}</div>` : ''}
                  </div>
                </div>
              </td>
              <td><span class="badge badge-cinza">${escapar(nomeCat(a.categoria))}</span></td>
              <td style="font-size:12px;color:var(--txt2)">${Anexos.tamanho(a.tamanho)}</td>
              <td style="font-size:12px;color:var(--txt2)">${dataHoraBR(a.criado_em)}</td>
              <td class="acoes">
                <button class="btn-ico" onclick="Anexos.abrir(${a.id}, '${escapar(a.nome_original).replace(/'/g, "\\'")}')" title="Abrir">👁️</button>
                <button class="btn-ico perigo" onclick="UI.excluirAnexo(${a.id}, '${alvoId}', '${entidade}', ${entidadeId})" title="Excluir">🗑️</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table></div>`;
  },

  async excluirAnexo(id, alvoId, entidade, entidadeId) {
    const ok = await confirmar('Excluir este anexo? O arquivo será removido do servidor.',
      { titulo: 'Excluir anexo', textoOk: 'Excluir' });
    if (!ok) return;
    try {
      await Anexos.excluir(id);
      toast('Anexo excluído.');
      this.listarAnexos(alvoId, entidade, entidadeId);
    } catch (e) { toastErro(e.message); }
  },
};

/**
 * Coloca o botão de "ver senha" ao lado de todo input[type=password].
 * Digitar senha às cegas é a maior fonte de erro de login — mostrar
 * o que foi digitado antes de confirmar resolve.
 */
function ativarVerSenha(raiz = document) {
  raiz.querySelectorAll('input[type=password]').forEach(campo => {
    if (campo._temOlho) return;
    campo._temOlho = true;

    const caixa = document.createElement('div');
    caixa.className = 'campo-senha';
    campo.parentNode.insertBefore(caixa, campo);
    caixa.appendChild(campo);

    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'ver-senha';
    botao.textContent = '👁';
    botao.title = 'Mostrar a senha';
    botao.setAttribute('aria-label', 'Mostrar a senha');
    caixa.appendChild(botao);

    botao.addEventListener('click', () => {
      const visivel = campo.type === 'text';
      campo.type = visivel ? 'password' : 'text';
      botao.textContent = visivel ? '👁' : '🙈';
      botao.title = visivel ? 'Mostrar a senha' : 'Ocultar a senha';
      botao.setAttribute('aria-label', botao.title);
      campo.focus();
    });
  });
}

/** Debounce para campos de busca. */
function debounce(fn, ms = 350) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

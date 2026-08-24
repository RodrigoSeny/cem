/* ══════════════════════════════════════════════════════════════
   CEM — Aplicativo (PWA)
   Uma única interface que se adapta ao perfil de quem entrou:
   responsável (consulta os próprios filhos) ou funcionário
   (consulta rápida de alunos, turmas e contatos).
   ══════════════════════════════════════════════════════════════ */

const USUARIO = Sessao.exigir();
let inicioDados = null;
let escolaDados = {};
let alunoSelecionado = null;  // filho cujo contexto está ativo no app
let comAtiva = 'mensagens';   // segmento ativo dentro da tela "Comunicações"
let ultimoNaoLidas = 0;       // pra recompor o selo combinado fora do carregarInicio
let ultimoOcorrPend = 0;

const AGD_ROTULOS_PT = {
  sono: { manha: 'Manhã', apos_almoco: 'Após o almoço', tarde: 'Tarde', nao_dormiu: 'Não dormiu' },
  disposicao: { normal: 'Normal', agitado: 'Agitado', quieto: 'Quieto' },
  evacuacao: { normal: 'Normal', pastosa: 'Pastosa', liquida: 'Líquida', nao_evacuou: 'Não evacuou' },
  refeicao: { bem: 'Bem', metade: 'Metade', menos_metade: 'Menos da metade', recusou: 'Recusou' },
};

// ── Tema ──────────────────────────────────────────────────────
function alternarTemaApp() {
  const claro = document.body.classList.toggle('tema-claro');
  localStorage.setItem('cem_tema', claro ? 'claro' : 'escuro');
}
if (localStorage.getItem('cem_tema') === 'claro') document.body.classList.add('tema-claro');

// ── Navegação inferior ────────────────────────────────────────
function irTela(tela, sub) {
  document.querySelectorAll('.tela').forEach(t => t.classList.remove('active'));
  document.getElementById('tela-' + tela)?.classList.add('active');

  document.querySelectorAll('.rodape button').forEach(b => {
    b.classList.toggle('active', b.dataset.tela === tela);
  });

  window.scrollTo({ top: 0 });
  if (tela === 'consulta') Portal.renderConsulta();
  if (tela === 'conta') Portal.renderConta();
  if (tela === 'comunicacoes') Portal.mudarComunicacao(sub || comAtiva);
  if (tela === 'financeiro') Portal.renderFinanceiro();
  if (tela === 'material') Portal.renderMaterial();
}

document.querySelectorAll('.rodape button').forEach(b => {
  b.addEventListener('click', () => irTela(b.dataset.tela));
});

// ── Botão "voltar" do celular ──────────────────────────────────
// Sem isso, voltar na tela principal cai no histórico do navegador — a
// tela de login, com usuário e senha ainda preenchidos. Em vez disso: com
// um modal aberto, fecha o modal; em qualquer tela que não seja a inicial,
// volta pra inicial; já na inicial, pergunta antes de sair do app.
history.pushState({ cemApp: true }, '', location.href);
let perguntandoSaida = false;
window.addEventListener('popstate', async () => {
  if (perguntandoSaida) return; // ignora "voltar" repetido enquanto o diálogo já está aberto

  const modalAberto = document.querySelector('.modal-overlay.aberto');
  if (modalAberto) {
    fecharModal(modalAberto.id);
    history.pushState({ cemApp: true }, '', location.href);
    return;
  }

  const telaAtual = document.querySelector('.tela.active')?.id?.replace('tela-', '') || 'inicio';
  if (telaAtual !== 'inicio') {
    history.pushState({ cemApp: true }, '', location.href);
    irTela('inicio');
    return;
  }

  perguntandoSaida = true;
  const sair = await confirmar('Deseja realmente sair do aplicativo?', { titulo: 'Sair do app', textoOk: 'Sair', perigo: false });
  perguntandoSaida = false;

  if (!sair) {
    // Só re-arma a armadilha se o usuário decidiu continuar no app — assim
    // o "voltar" mais uma vez tem histórico pra interceptar de novo.
    history.pushState({ cemApp: true }, '', location.href);
    return;
  }

  // Confirmou saída: tenta fechar direto (funciona em vários navegadores
  // instalados como app) e, sem re-armar a armadilha, deixa o histórico
  // esgotado — o próximo "voltar" físico já não encontra mais nada pra essa
  // página interceptar, e o próprio Android/navegador encerra o app.
  window.close();
});

// ── Instalação do PWA ─────────────────────────────────────────
let promptInstalacao = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  promptInstalacao = e;
  document.getElementById('barraInstalar').style.display = 'flex';
});
async function instalarApp() {
  if (!promptInstalacao) return;
  promptInstalacao.prompt();
  const { outcome } = await promptInstalacao.userChoice;
  promptInstalacao = null;
  document.getElementById('barraInstalar').style.display = 'none';

  // Aproveita a mesma interação (ainda "quente" pro navegador) pra já
  // pedir a permissão de notificação, sem precisar de outro toque depois.
  if (outcome === 'accepted') Portal.alternarNotificacoes();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
  // Toque numa notificação com o app já aberto: o sw manda a tela por aqui.
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.tipo === 'ir-tela' && e.data.tela) irTela(e.data.tela);
  });
}

/** Converte a chave pública VAPID (base64url) para o formato exigido pelo Push API. */
function urlBase64ParaUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const bruto = window.atob(base64);
  const saida = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; ++i) saida[i] = bruto.charCodeAt(i);
  return saida;
}

/** base64url → ArrayBuffer, pro WebAuthn (challenge, ids de credencial). */
function b64urlParaBuffer(base64url) {
  const padding = '='.repeat((4 - base64url.length % 4) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const bruto = window.atob(base64);
  const saida = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; ++i) saida[i] = bruto.charCodeAt(i);
  return saida.buffer;
}

/** ArrayBuffer → base64url, pra mandar a resposta do WebAuthn de volta ao servidor. */
function bufferParaB64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return window.btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ══════════════════════════════════════════════════════════════
const Portal = {
  alunosBusca: [],

  async iniciar() {
    if (!USUARIO) return;

    // Marca e contatos da escola
    try {
      escolaDados = await fetch('/api/escola/publica').then(r => r.json());
      if (escolaDados.nome_fantasia) {
        document.getElementById('appEscola').textContent = escolaDados.nome_fantasia;
        document.title = `${escolaDados.nome_fantasia} — App`;
      }
      if (escolaDados.logo_url) document.getElementById('appLogo').src = escolaDados.logo_url;
    } catch {}

    document.getElementById('appSub').textContent =
      USUARIO.tipo === 'responsavel' ? 'Portal dos responsáveis' : 'Consulta da equipe';
    document.getElementById('rotuloConsulta').textContent = 'Consultar';

    if (USUARIO.tipo === 'responsavel') {
      // Responsáveis usam Financeiro no lugar de Consultar no rodapé
      document.getElementById('btnConsulta').style.display = 'none';
      document.getElementById('btnFinanceiro').style.display = '';
    } else {
      // Funcionários não têm caixa de mensagens/ocorrências/agenda no app
      document.getElementById('btnComunicacoes').style.display = 'none';
    }

    await this.carregarInicio();
    this.atualizarSelo();

    // Reconfere o selo ao voltar para o app
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.atualizarSelo();
    });

    // Veio de um toque em notificação (app fechado) → já abre na tela certa
    const telaInicial = new URLSearchParams(location.search).get('tela');
    if (telaInicial) irTela(telaInicial);
  },

  /** Alerta visual de mensagens não lidas na barra inferior. */
  async atualizarSelo() {
    if (USUARIO.tipo !== 'responsavel') return;
    let d;
    try { d = await Api.get('/api/portal/mensagens/nao-lidas'); }
    catch { return; }

    ultimoNaoLidas = d.nao_lidas || 0;
    this._pintarSelo('seloSegMensagens', ultimoNaoLidas, d.aguardando_ciencia > 0);
    this._atualizarSeloComunicacoes();
  },

  /** Pinta um selo numérico (vermelho = novidade, dourado = aguarda ciência). */
  _pintarSelo(id, valor, urgente) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = valor > 9 ? '9+' : valor;
    el.classList.toggle('mostrar', valor > 0);
    el.style.background = urgente ? 'var(--gold)' : 'var(--red)';
    el.style.color = urgente ? '#1A1A1A' : '#fff';
  },

  /** Selo do botão "Comunicações" no rodapé = soma dos 3 segmentos. */
  _atualizarSeloComunicacoes(urgente = false) {
    this._pintarSelo('seloComunicacoes', ultimoNaoLidas + ultimoOcorrPend, urgente);
  },

  // ── Início ──────────────────────────────────────────────────
  async carregarInicio() {
    const alvo = document.getElementById('inicioConteudo');
    try { inicioDados = await Api.get('/api/portal/inicio'); }
    catch (e) {
      alvo.innerHTML = `<div class="vazio"><span class="ico">⚠️</span><div class="titulo">${escapar(e.message)}</div></div>`;
      return;
    }

    if (inicioDados.perfil === 'responsavel') {
      const alunos = inicioDados.alunos || [];
      // Filho único → seleciona automaticamente
      if (alunos.length === 1) {
        alunoSelecionado = alunos[0];
      } else if (alunoSelecionado) {
        // Garante que o filho ainda está vinculado
        if (!alunos.find(a => a.id === alunoSelecionado.id)) alunoSelecionado = null;
      }

      // Badges de Financeiro e Histórico
      const parcVenc = inicioDados.financeiro_vencido?.parcelas || 0;
      const seloFin = document.getElementById('seloFinanceiro');
      if (seloFin) {
        seloFin.textContent = parcVenc > 9 ? '9+' : parcVenc;
        seloFin.classList.toggle('mostrar', parcVenc > 0);
        seloFin.style.background = 'var(--red)';
        seloFin.style.color = '#fff';
      }
      ultimoOcorrPend = inicioDados.ocorr_pendentes || 0;
      ultimoNaoLidas = inicioDados.nao_lidas || 0;
      const urgente = (inicioDados.aguardando_ciencia || 0) > 0;
      this._pintarSelo('seloSegMensagens', ultimoNaoLidas, urgente);
      this._pintarSelo('seloSegOcorrencias', ultimoOcorrPend, urgente);
      this._atualizarSeloComunicacoes(urgente);
    }

    const hora = new Date().getHours();
    const parte = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

    const sugerirNotif = inicioDados.perfil === 'responsavel' ? await this.notificacoesPendentes() : false;
    const mostrarBotaoBiometria = inicioDados.perfil === 'responsavel' ? await this.podeOferecerBiometria() : false;

    alvo.innerHTML = inicioDados.perfil === 'responsavel'
      ? this.inicioResponsavel(inicioDados, parte, sugerirNotif, mostrarBotaoBiometria)
      : this.inicioFuncionario(inicioDados, parte);
  },

  /** Só oferece o atalho de "salvar acesso" se o aparelho suporta E o
   *  responsável ainda não tem nenhuma credencial salva (evita repetir o
   *  convite pra quem já configurou). */
  async podeOferecerBiometria() {
    if (!(await this.suportaBiometria())) return false;
    try {
      const credenciais = await Api.get('/api/auth/webauthn/credenciais');
      return credenciais.length === 0;
    } catch { return false; }
  },

  /** Vale a pena sugerir ativar notificações? (suportado, ainda não ativado, usuário não dispensou o aviso). */
  async notificacoesPendentes() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    if (Notification.permission === 'denied') return false;
    if (localStorage.getItem('cem_notif_dispensado')) return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      return !(await reg.pushManager.getSubscription());
    } catch { return false; }
  },

  ativarNotificacoesInicio() {
    this.alternarNotificacoes().then(() => this.carregarInicio());
  },

  dispensarAvisoNotif() {
    localStorage.setItem('cem_notif_dispensado', '1');
    this.carregarInicio();
  },

  inicioResponsavel(d, parte, sugerirNotif, biometriaOk) {
    const alunos = d.alunos || [];
    const venc = d.financeiro_vencido || { parcelas: 0, total: 0 };
    const temVarios = alunos.length > 1;
    const globais = d.mensagens_globais || [];

    return `
      <div class="ola">
        <h2>${parte}, ${escapar(nomeCurto(d.nome))}!</h2>
        <p>${alunos.length
            ? temVarios
              ? `Você acompanha ${alunos.length} filhos. Selecione um para ver os dados.`
              : `Você acompanha ${alunos.length} aluno no Centro Educacional Milezi.`
            : 'Ainda não há alunos vinculados ao seu cadastro. Procure a secretaria.'}</p>
      </div>

      ${sugerirNotif ? `
        <div class="cartao toque" style="border-color:var(--gold);background:var(--gold-soft)" onclick="Portal.ativarNotificacoesInicio()">
          <div class="aluno-linha">
            <div class="aluno-av">🔔</div>
            <div style="flex:1">
              <div class="aluno-nome">Ative as notificações</div>
              <div class="aluno-info">Receba avisos de mensagens e ocorrências, mesmo com o app fechado</div>
            </div>
            <button class="btn-ico" onclick="event.stopPropagation();Portal.dispensarAvisoNotif()" title="Não mostrar de novo">✕</button>
          </div>
        </div>` : ''}

      ${d.aguardando_ciencia_msgs > 0 ? `
        <div class="cartao toque" style="border-color:var(--gold);background:var(--gold-soft)" onclick="irTela('comunicacoes','mensagens')">
          <div class="aluno-linha">
            <div class="aluno-av">📣</div>
            <div style="flex:1">
              <div class="aluno-nome">${d.aguardando_ciencia_msgs} mensagem(ns) aguardando sua ciência</div>
              <div class="aluno-info">Toque para ver os comunicados</div>
            </div>
            <span class="seta">›</span>
          </div>
        </div>` : ''}
      ${d.aguardando_ciencia_ocorr > 0 ? `
        <div class="cartao toque" style="border-color:var(--gold);background:var(--gold-soft)" onclick="irTela('comunicacoes','ocorrencias')">
          <div class="aluno-linha">
            <div class="aluno-av">📌</div>
            <div style="flex:1">
              <div class="aluno-nome">${d.aguardando_ciencia_ocorr} ocorrência(s) aguardando sua ciência</div>
              <div class="aluno-info">Toque para ver o histórico</div>
            </div>
            <span class="seta">›</span>
          </div>
        </div>` : ''}
      ${!d.aguardando_ciencia && d.nao_lidas > 0 ? `
        <div class="cartao toque" onclick="irTela('comunicacoes','mensagens')">
          <div class="aluno-linha">
            <div class="aluno-av">✉️</div>
            <div style="flex:1">
              <div class="aluno-nome">${d.nao_lidas} mensagem(ns) não lida(s)</div>
              <div class="aluno-info">Da secretaria da escola</div>
            </div>
            <span class="seta">›</span>
          </div>
        </div>` : ''}

      ${venc.parcelas > 0 ? `
        <div class="cartao toque" onclick="irTela('financeiro')" style="border-color:rgba(255,94,94,.4)">
          <div class="aluno-linha">
            <div class="aluno-av" style="background:rgba(255,94,94,.15);color:var(--red)">💰</div>
            <div style="flex:1">
              <div class="aluno-nome">${venc.parcelas} parcela(s) em atraso</div>
              <div class="aluno-info">Total de ${moedaBR(venc.total)} — toque para ver</div>
            </div>
            <span class="seta">›</span>
          </div>
        </div>` : ''}

      ${globais.length ? `
        <div class="titulo-secao">Comunicados gerais</div>
        ${globais.map(m => `
          <div class="cartao toque" onclick="irTela('comunicacoes','mensagens')" style="border-left:3px solid var(--gold)">
            <div class="aluno-linha">
              <div class="aluno-av" style="background:var(--gold-soft)">📢</div>
              <div style="flex:1;min-width:0">
                <div class="aluno-nome">${escapar(m.titulo)}</div>
                <div class="aluno-info">${dataHoraBR(m.criado_em)} · comunicado geral</div>
              </div>
              <span class="seta">›</span>
            </div>
          </div>`).join('')}` : ''}

      ${alunos.length ? `
        <div class="cartao toque" onclick="irTela('material')">
          <div class="aluno-linha">
            <div class="aluno-av">🎒</div>
            <div style="flex:1"><div class="aluno-nome">Lista de material</div>
              <div class="aluno-info">Veja o que já foi entregue e o que ainda falta</div></div>
            <span class="seta">›</span>
          </div>
        </div>` : ''}

      ${biometriaOk ? `
        <div class="cartao toque" onclick="Portal.registrarBiometria()">
          <div class="aluno-linha">
            <div class="aluno-av">🔓</div>
            <div style="flex:1"><div class="aluno-nome">Salvar acesso com desbloqueio do celular</div>
              <div class="aluno-info">Entre com a digital, o rosto ou o PIN do aparelho, sem digitar a senha</div></div>
            <span class="seta">›</span>
          </div>
        </div>` : ''}

      <div class="titulo-secao">${temVarios ? 'Selecione um filho' : 'Meus filhos'}</div>
      ${alunos.length ? alunos.map(a => {
        const ativo = alunoSelecionado?.id === a.id;
        return `
          <div class="cartao toque${ativo ? ' cartao-ativo' : ''}" onclick="Portal.verAluno(${a.id})">
            <div class="aluno-linha">
              <div class="aluno-av">${iniciais(a.nome)}</div>
              <div style="flex:1;min-width:0">
                <div class="aluno-nome">${escapar(a.nome)}</div>
                <div class="aluno-info">
                  ${escapar(a.turma_nome || 'Turma a definir')}
                  ${a.turma_turno ? ' · ' + (TURNOS[a.turma_turno] || a.turma_turno) : ''}
                </div>
                <div class="chips">
                  ${badgeSituacao(a.situacao)}
                  ${a.idade != null ? `<span class="badge badge-cinza">${a.idade} anos</span>` : ''}
                  ${a.parentesco ? `<span class="badge badge-gold">${escapar(a.parentesco)}</span>` : ''}
                  ${ativo ? '<span class="badge badge-green">ativo</span>' : ''}
                </div>
              </div>
              <span class="seta">›</span>
            </div>
          </div>`;
      }).join('')
      : `<div class="vazio"><span class="ico">🎓</span><div class="titulo">Nenhum aluno vinculado</div>
           <div class="sub">A secretaria vincula os alunos ao seu cadastro.</div></div>`}

      <div class="titulo-secao">Precisa falar com a escola?</div>
      <div class="cartao">
        <div class="info-linha"><span class="rot">Secretaria</span><span class="val">
          ${this._linkSecretaria()}
          ${escolaDados.email ? `<br><a href="mailto:${escapar(escolaDados.email)}">✉️ ${escapar(escolaDados.email)}</a>` : ''}
        </span></div>
        <div class="info-linha"><span class="rot">Seus dados</span>
          <span class="val">${escapar(d.responsavel?.telefone ? telefoneBR(d.responsavel.telefone) : 'sem telefone')} ·
            ${escapar(d.responsavel?.email || 'sem e-mail')}</span></div>
        <div style="font-size:11.5px;color:var(--txt3);margin-top:9px">
          Dados desatualizados? Fale com a secretaria para corrigir o cadastro.
        </div>
      </div>`;
  },

  inicioFuncionario(d, parte) {
    const t = d.totais || {};
    return `
      <div class="ola">
        <h2>${parte}, ${escapar(nomeCurto(d.nome))}!</h2>
        <p>${d.funcionario ? escapar(d.funcionario.cargo) : 'Equipe'}${d.funcionario?.setor ? ' · ' + escapar(d.funcionario.setor) : ''}</p>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:6px">
        ${this.mini('🎓', t.alunos, 'alunos')}
        ${this.mini('🏫', t.turmas, 'turmas')}
        ${this.mini('👔', t.funcionarios, 'equipe')}
      </div>

      <div class="titulo-secao">Minhas turmas</div>
      ${(d.minhasTurmas || []).length ? d.minhasTurmas.map(t2 => `
        <div class="cartao toque" onclick="Portal.verTurma(${t2.id})">
          <div class="aluno-linha">
            <div class="aluno-av">${escapar(String(t2.qtd_alunos))}</div>
            <div style="flex:1;min-width:0">
              <div class="aluno-nome">${escapar(t2.nome)}</div>
              <div class="aluno-info">${TURNOS[t2.turno] || t2.turno}${t2.sala ? ' · Sala ' + escapar(t2.sala) : ''}</div>
            </div>
            <span class="seta">›</span>
          </div>
        </div>`).join('')
        : `<div class="vazio"><span class="ico">🏫</span><div class="titulo">Nenhuma turma sob sua responsabilidade</div>
             <div class="sub">Use a busca para consultar qualquer aluno.</div></div>`}

      <div class="titulo-secao">Atalhos</div>
      <div class="cartao toque" onclick="irTela('consulta')">
        <div class="aluno-linha">
          <div class="aluno-av">🔎</div>
          <div style="flex:1"><div class="aluno-nome">Consultar aluno</div>
            <div class="aluno-info">Ficha, turma e contatos dos responsáveis</div></div>
          <span class="seta">›</span>
        </div>
      </div>`;
  },

  mini(ico, valor, rotulo) {
    return `
      <div class="cartao" style="text-align:center;padding:14px 8px;margin:0">
        <div style="font-size:18px">${ico}</div>
        <div class="mono c-gold" style="font-size:19px;font-weight:700;margin-top:5px">${valor ?? '—'}</div>
        <div style="font-size:10.5px;color:var(--txt2);text-transform:uppercase;letter-spacing:.08em;margin-top:2px">${rotulo}</div>
      </div>`;
  },

  // ── Consulta ────────────────────────────────────────────────
  async renderConsulta() {
    const alvo = document.getElementById('consultaConteudo');

    if (USUARIO.tipo === 'responsavel') {
      const alunos = inicioDados?.alunos || [];
      alvo.innerHTML = `
        <div class="titulo-secao">Meus filhos</div>
        ${alunos.map(a => `
          <div class="cartao toque" onclick="Portal.verAluno(${a.id})">
            <div class="aluno-linha">
              <div class="aluno-av">${iniciais(a.nome)}</div>
              <div style="flex:1;min-width:0">
                <div class="aluno-nome">${escapar(a.nome)}</div>
                <div class="aluno-info">${escapar(a.turma_nome || 'Turma a definir')}</div>
              </div>
              <span class="seta">›</span>
            </div>
          </div>`).join('') ||
          '<div class="vazio"><span class="ico">🎓</span><div class="titulo">Nenhum aluno vinculado</div></div>'}`;
      return;
    }

    if (!alvo.dataset.pronto) {
      alvo.innerHTML = `
        <input type="search" class="busca-app" id="buscaAluno" placeholder="Buscar aluno por nome ou matrícula…">
        <div id="resultadoBusca"></div>`;
      alvo.dataset.pronto = '1';
      document.getElementById('buscaAluno').addEventListener('input', debounce(e => this.buscar(e.target.value), 350));
      this.buscar('');
    }
  },

  async buscar(termo) {
    const alvo = document.getElementById('resultadoBusca');
    alvo.innerHTML = '<div class="vazio"><span class="spinner"></span></div>';

    let lista;
    try { lista = await Api.get('/api/portal/alunos', { busca: termo }); }
    catch (e) {
      alvo.innerHTML = `<div class="vazio"><span class="ico">⚠️</span><div class="titulo">${escapar(e.message)}</div></div>`;
      return;
    }

    if (!lista.length) {
      alvo.innerHTML = '<div class="vazio"><span class="ico">🔎</span><div class="titulo">Nenhum aluno encontrado</div></div>';
      return;
    }

    alvo.innerHTML = lista.map(a => `
      <div class="cartao toque" onclick="Portal.verAluno(${a.id})">
        <div class="aluno-linha">
          <div class="aluno-av">${iniciais(a.nome)}</div>
          <div style="flex:1;min-width:0">
            <div class="aluno-nome">${escapar(a.nome)}</div>
            <div class="aluno-info">${escapar(a.turma_nome || 'sem turma')} · ${escapar(a.matricula)}</div>
          </div>
          <span class="seta">›</span>
        </div>
      </div>`).join('');
  },

  // ── Ficha do aluno ──────────────────────────────────────────
  async verAluno(id) {
    // Define o contexto per-child para Financeiro e Histórico
    if (USUARIO.tipo === 'responsavel' && inicioDados?.alunos) {
      const a = inicioDados.alunos.find(a => a.id === id);
      if (a) alunoSelecionado = a;
    }
    irTela('aluno');
    const alvo = document.getElementById('alunoConteudo');
    alvo.innerHTML = '<div class="vazio"><span class="spinner"></span></div>';

    let a, ocorrencias = [], financeiro = null;
    try {
      a = await Api.get('/api/portal/alunos/' + id);
      ocorrencias = await Api.get(`/api/portal/alunos/${id}/ocorrencias`).catch(() => []);
      if (USUARIO.tipo === 'responsavel') {
        financeiro = await Api.get(`/api/portal/alunos/${id}/financeiro`).catch(() => null);
      }
    } catch (e) {
      alvo.innerHTML = `<div class="vazio"><span class="ico">⚠️</span><div class="titulo">${escapar(e.message)}</div></div>`;
      return;
    }

    const li = (rot, val) => `<div class="info-linha"><span class="rot">${rot}</span><span class="val">${escapar(val || '—')}</span></div>`;
    const autorizacoes = [
      a.autoriza_imagem ? 'imagem' : null,
      a.autoriza_medicamento ? 'medicamentos' : null,
      a.autoriza_passeio ? 'passeios' : null,
    ].filter(Boolean).join(', ') || 'nenhuma';

    alvo.innerHTML = `
      <button class="btn-voltar" onclick="irTela('${USUARIO.tipo === 'responsavel' ? 'inicio' : 'consulta'}')"
        style="background:none;border:none;color:var(--gold);font-family:var(--font);font-size:13px;font-weight:600;cursor:pointer;padding:0 0 12px">‹ Voltar</button>

      <div class="cartao">
        <div class="aluno-linha">
          <div class="aluno-av">${iniciais(a.nome)}</div>
          <div style="flex:1;min-width:0">
            <div class="aluno-nome">${escapar(a.nome)}</div>
            <div class="aluno-info">Matrícula ${escapar(a.matricula)}</div>
            <div class="chips">
              ${badgeSituacao(a.situacao)}
              ${a.idade != null ? `<span class="badge badge-cinza">${a.idade} anos</span>` : ''}
            </div>
          </div>
        </div>
      </div>

      <div class="titulo-secao">Turma</div>
      <div class="cartao">
        ${li('Turma', a.turma_nome)}
        ${li('Turno', TURNOS[a.turma_turno || a.turno] || '')}
        ${li('Sala', a.turma_sala)}
        ${li('Professor(a)', a.professor_nome)}
      </div>

      <div class="titulo-secao">Dados do aluno</div>
      <div class="cartao">
        ${li('Nascimento', dataBR(a.data_nascimento))}
        ${li('Matriculado em', dataBR(a.data_matricula))}
      </div>

      <div class="titulo-secao">Saúde e autorizações</div>
      <div class="cartao">
        ${li('Tipo sanguíneo', a.tipo_sanguineo)}
        ${li('Alergias', a.alergias)}
        ${li('Medicamentos', a.medicamentos)}
        ${li('Restrições alimentares', a.restricoes_alimentares)}
        ${li('Necessidades especiais', a.necessidades_especiais)}
        ${li('Plano de saúde', a.plano_saude)}
        ${li('Emergência', [a.contato_emergencia, a.telefone_emergencia ? telefoneBR(a.telefone_emergencia) : null].filter(Boolean).join(' · '))}
        ${li('Autorizações', autorizacoes)}
      </div>

      ${financeiro ? this.blocoFinanceiro(financeiro) : ''}
      ${ocorrencias.length ? this.blocoOcorrencias(ocorrencias) : ''}

      <div class="titulo-secao">Responsáveis</div>
      ${(a.responsaveis || []).map(r => `
        <div class="cartao">
          <div style="font-size:14px;font-weight:700">
            ${escapar(r.nome)} ${r.principal ? '<span class="badge badge-gold">principal</span>' : ''}
          </div>
          <div style="font-size:12px;color:var(--txt2);margin:4px 0 9px">
            ${escapar(r.parentesco || 'parentesco não informado')}
            ${r.autorizado_retirar ? '' : ' · <span class="c-red">não autorizado a retirar</span>'}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${(r.whatsapp || r.telefone) ? `<a class="badge badge-green" style="text-decoration:none"
                href="tel:${escapar(String(r.whatsapp || r.telefone).replace(/\D/g, ''))}">📞 ${telefoneBR(r.whatsapp || r.telefone)}</a>` : ''}
            ${r.email ? `<a class="badge badge-blue" style="text-decoration:none" href="mailto:${escapar(r.email)}">✉️ e-mail</a>` : ''}
          </div>
        </div>`).join('') ||
        '<div class="cartao"><div style="font-size:12.5px;color:var(--txt2)">Nenhum responsável vinculado.</div></div>'}`;
  },

  /** Mensalidades do aluno — visão do responsável. */
  blocoFinanceiro(f) {
    if (!f.parcelas.length) return '';
    const abertas = f.parcelas.filter(p => p.situacao !== 'paga').slice(0, 6);

    return `
      <div class="titulo-secao">Mensalidades</div>
      <div class="cartao">
        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:12px">
          <div><div style="font-size:11px;color:var(--txt2)">PAGO</div>
            <div class="mono c-green" style="font-weight:700">${moedaBR(f.totais.pago)}</div></div>
          <div><div style="font-size:11px;color:var(--txt2)">EM ABERTO</div>
            <div class="mono" style="font-weight:700">${moedaBR(f.totais.em_aberto)}</div></div>
          ${f.totais.vencido > 0 ? `<div><div style="font-size:11px;color:var(--txt2)">VENCIDO</div>
            <div class="mono c-red" style="font-weight:700">${moedaBR(f.totais.vencido)}</div></div>` : ''}
        </div>

        ${abertas.length ? abertas.map(p => `
          <div class="fin-linha">
            <div>
              <div style="font-size:13px;font-weight:600">${escapar(p.descricao || competenciaBR(p.competencia))}</div>
              ${p.itens && p.itens.length > 1 ? `
                <div style="font-size:11px;color:var(--txt2);margin-top:2px">
                  ${p.itens.map(it => `${escapar(it.descricao)} (${moedaBR(it.valor)})`).join(' + ')}
                </div>` : ''}
              <div style="font-size:11px;color:var(--txt3)">vence em ${dataBR(p.vencimento)}</div>
            </div>
            <div class="fin-valor">
              <div class="v">${moedaBR(p.saldo)}</div>
              ${badgeFinanceiro(p.situacao)}
            </div>
          </div>`).join('')
          : '<div style="font-size:12.5px;color:var(--green)">✅ Nenhuma parcela em aberto.</div>'}

        <div style="font-size:11px;color:var(--txt3);margin-top:11px">
          Dúvidas sobre pagamento? Fale com a secretaria.
        </div>
      </div>`;
  },

  /** Ocorrências compartilhadas pela escola. */
  blocoOcorrencias(lista) {
    return `
      <div class="titulo-secao">Ocorrências compartilhadas</div>
      ${lista.map(o => `
        <div class="cartao" id="ocorr-card-${o.id}">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
            <span class="mono" style="font-size:11.5px;color:var(--txt2)">${dataBR(o.data_ocorrencia)}${o.hora_ocorrencia ? ' ' + escapar(o.hora_ocorrencia) : ''}</span>
            ${badgeGravidade(o.gravidade)}
          </div>
          <div style="font-size:14px;font-weight:700">${escapar(o.titulo)}</div>
          ${o.descricao ? `<div style="font-size:12.5px;color:var(--txt2);margin-top:5px;line-height:1.55">${escapar(o.descricao)}</div>` : ''}
          ${o.providencia ? `<div style="font-size:12px;color:var(--txt2);margin-top:7px"><strong>Providência:</strong> ${escapar(o.providencia)}</div>` : ''}
          ${o.registrado_nome ? `<div style="font-size:11px;color:var(--txt3);margin-top:7px">Registrado por ${escapar(o.registrado_nome)}</div>` : ''}
          ${(o.anexos || []).length ? `
            <div class="chips" style="margin-top:10px">
              ${o.anexos.map(an => `
                <button class="badge badge-blue" style="border:none;cursor:pointer"
                        onclick="Anexos.abrir(${an.id}, '${escapar(an.nome_original).replace(/'/g, "\\'")}')">
                  ${Anexos.icone(an.mime)} ver anexo
                </button>`).join('')}
            </div>` : ''}
          ${o.exige_ciencia ? (o.ciente_em
            ? `<button class="btn-ciente" style="margin-top:10px" disabled>✅ Ciência registrada em ${dataHoraBR(o.ciente_em)}</button>`
            : `<button class="btn-ciente" style="margin-top:10px" onclick="Portal.darCienciaOcorrencia(${o.id}, this)">Estou ciente</button>`)
            : ''}
        </div>`).join('')}`;
  },

  async darCienciaOcorrencia(id, botao) {
    botao.disabled = true;
    botao.textContent = 'Registrando...';
    try {
      const r = await Api.post(`/api/portal/ocorrencias/${id}/ciente`);
      botao.textContent = `✅ Ciência registrada em ${dataHoraBR(r.ciente_em)}`;
      const o = (this._ocorrencias || []).find(x => x.id === id);
      if (o) { o.ciente_em = r.ciente_em; o.lido_em = o.lido_em || r.ciente_em; }
      toast('Ciência registrada. Obrigado!');
      this.atualizarSelo();
      this.carregarInicio();
      this.desenharOcorrencias();
    } catch (e) {
      botao.disabled = false;
      botao.textContent = 'Estou ciente';
      toastErro(e.message);
    }
  },

  // ── Seleção de filho (contexto per-child) ───────────────────
  /** Define o filho ativo e re-renderiza a tela atual se for Financeiro/Histórico. */
  selecionarAluno(id) {
    alunoSelecionado = inicioDados?.alunos?.find(a => a.id === id) || null;
    const telAtiva = document.querySelector('.tela.active')?.id?.replace('tela-', '');
    if (telAtiva === 'financeiro') this.renderFinanceiro();
    else if (telAtiva === 'comunicacoes') this.mudarComunicacao(comAtiva);
    else if (telAtiva === 'material') this.renderMaterial();
  },

  /** Remove o filho ativo e mostra o picker na tela atual. */
  trocarFilho() {
    if ((inicioDados?.alunos?.length || 0) <= 1) return;
    alunoSelecionado = null;
    const telAtiva = document.querySelector('.tela.active')?.id?.replace('tela-', '');
    if (telAtiva === 'financeiro') this.renderFinanceiro();
    else if (telAtiva === 'comunicacoes') this.mudarComunicacao(comAtiva);
    else if (telAtiva === 'material') this.renderMaterial();
    else irTela('inicio');
  },

  /** Cabeçalho de contexto exibido no topo de Financeiro e Histórico. */
  _childHeader() {
    if (!alunoSelecionado) return '';
    const temVarios = (inicioDados?.alunos?.length || 0) > 1;
    return `
      <div style="background:var(--gold-soft);border:1px solid rgba(242,183,5,.4);border-radius:14px;
                  padding:11px 14px;margin-bottom:14px;display:flex;align-items:center;gap:12px">
        <div class="aluno-av" style="width:38px;height:38px;font-size:13px;flex-shrink:0">${iniciais(alunoSelecionado.nome)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700">${escapar(alunoSelecionado.nome)}</div>
          <div style="font-size:11px;color:var(--txt2)">${escapar(alunoSelecionado.turma_nome || 'Turma a definir')}</div>
        </div>
        ${temVarios
          ? `<button onclick="Portal.trocarFilho()"
               style="background:none;border:1px solid var(--gold);color:var(--gold);
                      font-family:var(--font);font-size:11.5px;font-weight:700;
                      cursor:pointer;border-radius:8px;padding:5px 10px">trocar</button>`
          : ''}
      </div>`;
  },

  /** Picker inline de filhos (usado quando nenhum está selecionado nas telas de detalhe). */
  _pickerFilhos(instrucao) {
    const alunos = inicioDados?.alunos || [];
    return `
      <div class="ola" style="margin-bottom:16px">
        <h2 style="font-size:15px">Selecione um filho</h2>
        <p>${instrucao || 'Escolha qual filho você deseja consultar.'}</p>
      </div>
      ${alunos.map(a => `
        <div class="cartao toque" onclick="Portal.selecionarAluno(${a.id})">
          <div class="aluno-linha">
            <div class="aluno-av">${iniciais(a.nome)}</div>
            <div style="flex:1;min-width:0">
              <div class="aluno-nome">${escapar(a.nome)}</div>
              <div class="aluno-info">${escapar(a.turma_nome || 'Turma a definir')}</div>
            </div>
            <span class="seta">›</span>
          </div>
        </div>`).join('')}`;
  },

  // ── Link da secretaria (WhatsApp ou tel:) ───────────────────
  _linkSecretaria() {
    const raw = escolaDados.whatsapp || escolaDados.telefone || '';
    const num = String(raw).replace(/\D/g, '');
    if (!num) return 'telefone não cadastrado';
    if (escolaDados.whatsapp) {
      const waNum = num.startsWith('55') ? num : '55' + num;
      const waMsg = encodeURIComponent(`Olá, ${escolaDados.nome_fantasia || 'escola'}!`);
      return `<a href="https://wa.me/${waNum}?text=${waMsg}" target="_blank" rel="noopener">💬 ${telefoneBR(raw)}</a>`;
    }
    return `<a href="tel:${num}">📞 ${telefoneBR(raw)}</a>`;
  },

  // ── Financeiro (tela dedicada — responsável) ─────────────────
  async renderFinanceiro() {
    const alvo = document.getElementById('financeiroConteudo');
    alvo.innerHTML = '<div class="vazio"><span class="spinner"></span></div>';

    const alunos = inicioDados?.alunos || [];
    if (!alunos.length) {
      alvo.innerHTML = '<div class="vazio"><span class="ico">💰</span><div class="titulo">Nenhum aluno vinculado</div></div>';
      return;
    }
    // Múltiplos filhos sem filho selecionado → mostra picker inline
    if (!alunoSelecionado && alunos.length > 1) {
      alvo.innerHTML = this._pickerFilhos('Escolha o filho para ver as mensalidades.');
      return;
    }
    try {
      const f = await Api.get(`/api/portal/alunos/${alunoSelecionado.id}/financeiro`);
      const bloco = this.blocoFinanceiro(f);
      alvo.innerHTML = this._childHeader()
        + (bloco || '<div class="cartao"><div style="font-size:12.5px;color:var(--green)">✅ Nenhuma parcela em aberto.</div></div>');
    } catch (e) {
      alvo.innerHTML = this._childHeader()
        + `<div class="vazio"><span class="ico">⚠️</span><div class="titulo">${escapar(e.message)}</div></div>`;
    }
  },

  // ── Comunicações: alterna o segmento ativo (mensagens/agenda/ocorrências) ──
  mudarComunicacao(seg) {
    comAtiva = seg;
    document.querySelectorAll('#comSegmentado .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.com === seg));
    document.querySelectorAll('#tela-comunicacoes .com-secao').forEach(s => s.classList.add('oculto'));
    const alvoId = { mensagens: 'mensagensConteudo', agenda: 'agendaConteudo', ocorrencias: 'ocorrenciasConteudo' }[seg];
    document.getElementById(alvoId)?.classList.remove('oculto');

    if (seg === 'mensagens') this.renderMensagens();
    else if (seg === 'agenda') this.renderAgenda();
    else if (seg === 'ocorrencias') this.renderOcorrencias();
  },

  // ── Agenda diária (segmento de Comunicações — responsável) ────
  async renderAgenda(data) {
    const alvo = document.getElementById('agendaConteudo');
    alvo.innerHTML = '<div class="vazio"><span class="spinner"></span></div>';

    const alunos = inicioDados?.alunos || [];
    if (!alunos.length) {
      alvo.innerHTML = '<div class="vazio"><span class="ico">📔</span><div class="titulo">Nenhum aluno vinculado</div></div>';
      return;
    }
    if (!alunoSelecionado && alunos.length > 1) {
      alvo.innerHTML = this._pickerFilhos('Escolha o filho para ver a agenda diária.');
      return;
    }

    this._agendaData = data || this._agendaData || new Date().toISOString().slice(0, 10);
    try {
      this._agenda = await Api.get(`/api/portal/alunos/${alunoSelecionado.id}/agenda`, { data: this._agendaData });
    } catch (e) {
      alvo.innerHTML = this._childHeader() + `<div class="vazio"><span class="ico">⚠️</span><div class="titulo">${escapar(e.message)}</div></div>`;
      return;
    }
    this._desenharAgenda();
  },

  _desenharAgenda() {
    const alvo = document.getElementById('agendaConteudo');
    const d = this._agenda;
    const hojeStr = new Date().toISOString().slice(0, 10);

    const navegador = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <button class="btn-ico" onclick="Portal.mudarDiaAgenda(-1)">‹</button>
        <div style="flex:1;text-align:center;font-weight:700;font-size:13px">
          ${dataBR(this._agendaData)}${this._agendaData === hojeStr ? ' (hoje)' : ''}
        </div>
        <button class="btn-ico" onclick="Portal.mudarDiaAgenda(1)" ${this._agendaData >= hojeStr ? 'disabled' : ''}>›</button>
      </div>`;

    const rot = (mapa, v) => v == null ? '—' : (mapa[v] || v);
    const linha = (rotulo, valor) => `<div class="info-linha"><span class="rot">${rotulo}</span><span class="val">${valor}</span></div>`;

    const rotina = `
      <div class="cartao">
        ${linha('Entrada', d.entrada ? d.entrada.slice(0, 5) : '—')}
        ${linha('Saída', d.saida ? d.saida.slice(0, 5) : '—')}
        ${linha('Sono', rot(AGD_ROTULOS_PT.sono, d.sono))}
        ${linha('Banho', d.banho === null ? '—' : (d.banho ? 'Sim' : 'Não'))}
        ${linha('Disposição', rot(AGD_ROTULOS_PT.disposicao, d.disposicao))}
        ${linha('Evacuação', rot(AGD_ROTULOS_PT.evacuacao, d.evacuacao))}
        ${linha('Colação', rot(AGD_ROTULOS_PT.refeicao, d.colacao))}
        ${linha('Almoço', rot(AGD_ROTULOS_PT.refeicao, d.almoco))}
        ${linha('Lanche', rot(AGD_ROTULOS_PT.refeicao, d.lanche))}
        ${linha('Jantar', rot(AGD_ROTULOS_PT.refeicao, d.jantar))}
      </div>`;

    const extra = [];
    if (d.observacoes) {
      extra.push(`<div class="titulo-secao">Observações</div><div class="cartao"><div style="font-size:13px;line-height:1.6">${escapar(d.observacoes)}</div></div>`);
    }
    if (d.trazer && d.trazer.length) {
      extra.push(`<div class="titulo-secao">Mamãe trazer</div><div class="cartao">${d.trazer.map(i => escapar(i)).join(', ')}</div>`);
    }
    if (d.teve_febre) {
      extra.push(`<div class="titulo-secao">Febre</div><div class="cartao">
        ${linha('Temperatura', escapar(d.temperatura || '—'))}
        ${linha('Horário', d.febre_hora ? d.febre_hora.slice(0, 5) : '—')}
        ${linha('Antifebril', escapar(d.antifebril || '—'))}
      </div>`);
    }
    if (d.medicamentos && d.medicamentos.length) {
      extra.push(`<div class="titulo-secao">Remédios administrados</div>` + d.medicamentos.map(m => `
        <div class="cartao">
          ${linha('Remédio', escapar(m.nome_remedio))}
          ${linha('Dosagem', escapar(m.dosagem || '—'))}
          ${linha('Horário', m.horario ? m.horario.slice(0, 5) : '—')}
          ${linha('Ministrado por', escapar(m.ministrado_por || '—'))}
        </div>`).join(''));
    }

    alvo.innerHTML = this._childHeader() + navegador + `<div class="titulo-secao">Rotina do dia</div>` + rotina + extra.join('');
  },

  mudarDiaAgenda(delta) {
    const d = new Date(this._agendaData + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    const novo = d.toISOString().slice(0, 10);
    const hojeStr = new Date().toISOString().slice(0, 10);
    if (novo > hojeStr) return;
    this.renderAgenda(novo);
  },

  // ── Ocorrências (tela dedicada — responsável, lista estilo caixa de entrada) ──
  async renderOcorrencias() {
    const alvo = document.getElementById('ocorrenciasConteudo');
    alvo.innerHTML = '<div class="vazio"><span class="spinner"></span></div>';

    const alunos = inicioDados?.alunos || [];
    if (!alunos.length) {
      alvo.innerHTML = '<div class="vazio"><span class="ico">📌</span><div class="titulo">Nenhum aluno vinculado</div></div>';
      return;
    }
    if (!alunoSelecionado && alunos.length > 1) {
      alvo.innerHTML = this._pickerFilhos('Escolha o filho para ver as ocorrências.');
      return;
    }
    try {
      this._ocorrencias = await Api.get(`/api/portal/alunos/${alunoSelecionado.id}/ocorrencias`);
    } catch (e) {
      alvo.innerHTML = this._childHeader()
        + `<div class="vazio"><span class="ico">⚠️</span><div class="titulo">${escapar(e.message)}</div></div>`;
      return;
    }
    this.desenharOcorrencias();
  },

  desenharOcorrencias() {
    const alvo = document.getElementById('ocorrenciasConteudo');
    const lista = this._ocorrencias || [];
    const pendentes = lista.filter(o => o.exige_ciencia && !o.ciente_em).length;
    const aviso = pendentes > 0
      ? `<div class="cartao" style="border-color:var(--gold);background:var(--gold-soft);margin-bottom:4px">
          <div class="aluno-nome">📣 ${pendentes} ocorrência(s) aguardando sua ciência</div>
          <div class="aluno-info" style="margin-top:4px">Toque para abrir e confirme com "Estou ciente".</div>
         </div>`
      : '';

    alvo.innerHTML = this._childHeader() + aviso + (lista.length
      ? lista.map(o => this.linhaOcorrencia(o)).join('')
      : `<div class="vazio"><span class="ico">📌</span>
          <div class="titulo">Nenhuma ocorrência compartilhada</div>
          <div class="sub">A escola compartilhará ocorrências relevantes aqui.</div></div>`);
  },

  /** Uma linha da caixa de entrada de ocorrências — toque abre o detalhe completo. */
  linhaOcorrencia(o) {
    const pendenteCiencia = o.exige_ciencia && !o.ciente_em;
    const naoLida = !o.lido_em;

    return `
      <div class="cartao toque lista-linha ${naoLida ? 'nao-lida' : ''}" onclick="Portal.abrirOcorrencia(${o.id})">
        <div class="aluno-linha">
          <div class="aluno-av" style="${pendenteCiencia ? 'background:rgba(255,94,94,.15);color:var(--red)' : ''}">📌</div>
          <div style="flex:1;min-width:0">
            <div class="aluno-nome" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapar(o.titulo)}</div>
            <div class="aluno-info">
              ${dataBR(o.data_ocorrencia)}${o.hora_ocorrencia ? ' ' + escapar(o.hora_ocorrencia) : ''} · ${badgeGravidade(o.gravidade)}
              ${(o.anexos || []).length ? ' · 📎' : ''}
            </div>
          </div>
          ${pendenteCiencia ? '<span class="badge badge-red">ciência</span>'
            : naoLida ? '<span class="badge badge-gold">nova</span>' : ''}
          <span class="seta">›</span>
        </div>
      </div>`;
  },

  // ── Material (tela dedicada — responsável) ───────────────────
  async renderMaterial() {
    const alvo = document.getElementById('materialConteudo');
    alvo.innerHTML = '<div class="vazio"><span class="spinner"></span></div>';

    const alunos = inicioDados?.alunos || [];
    if (!alunos.length) {
      alvo.innerHTML = '<div class="vazio"><span class="ico">🎒</span><div class="titulo">Nenhum aluno vinculado</div></div>';
      return;
    }
    if (!alunoSelecionado && alunos.length > 1) {
      alvo.innerHTML = this._pickerFilhos('Escolha o filho para ver a lista de material.');
      return;
    }
    try {
      this._material = await Api.get(`/api/portal/alunos/${alunoSelecionado.id}/material`);
    } catch (e) {
      alvo.innerHTML = this._childHeader()
        + `<div class="vazio"><span class="ico">⚠️</span><div class="titulo">${escapar(e.message)}</div></div>`;
      return;
    }
    this.desenharMaterial();
  },

  desenharMaterial() {
    const alvo = document.getElementById('materialConteudo');
    const dados = this._material;
    const itens = dados?.itens || [];

    if (!itens.length) {
      alvo.innerHTML = this._childHeader() + `<div class="vazio"><span class="ico">🎒</span>
        <div class="titulo">Nenhuma lista de material cadastrada</div>
        <div class="sub">A escola ainda não vinculou uma lista à turma do seu filho.</div></div>`;
      return;
    }

    const resumo = dados.faltando > 0
      ? `<div class="cartao" style="border-color:rgba(255,94,94,.4)">
          <div class="aluno-nome">⏳ ${dados.faltando} de ${dados.total} item(ns) ainda faltando</div>
        </div>`
      : `<div class="cartao" style="border-color:var(--green)">
          <div class="aluno-nome" style="color:var(--green)">✅ Tudo entregue!</div>
        </div>`;

    const aviso = `
      <div class="cartao" style="background:var(--gold-soft);border-color:rgba(242,183,5,.4);margin-top:8px">
        <div class="aluno-info" style="font-size:11.5px;line-height:1.5">
          ℹ️ Se você já entregou algum material e ele não aparece marcado aqui, entre em contato com a secretaria.
        </div>
      </div>`;

    const porLista = {};
    for (const it of itens) (porLista[it.lista_nome] ||= []).push(it);

    const listas = Object.entries(porLista).map(([nome, its]) => `
      <div class="titulo-secao">${escapar(nome)}</div>
      ${its.map(it => `
        <div class="cartao" style="padding:10px 14px;margin-bottom:6px">
          <div class="aluno-linha">
            <div class="aluno-av" style="${it.enviado ? 'background:rgba(47,212,143,.15);color:var(--green)' : 'background:rgba(255,94,94,.12);color:var(--red)'}">
              ${it.enviado ? '✅' : '⏳'}
            </div>
            <div style="flex:1;min-width:0">
              <div class="aluno-nome">${it.quantidade > 1 ? `${it.quantidade}x ` : ''}${escapar(it.descricao)}</div>
              ${it.observacao ? `<div class="aluno-info">${escapar(it.observacao)}</div>` : ''}
            </div>
          </div>
        </div>`).join('')}
    `).join('');

    alvo.innerHTML = this._childHeader() + resumo + aviso + listas;
  },

  /** Abre o detalhe da ocorrência em modal e marca como lida na hora. */
  /**
   * HTML dos anexos de uma mensagem/ocorrência: imagens viram prévia (clicável,
   * abre a imagem inteira); os demais formatos continuam como botão "ver anexo".
   * Chame `Portal._carregarPreviasAnexos(anexos)` depois de inserir esse HTML no DOM.
   */
  _blocoAnexos(anexos) {
    const lista = anexos || [];
    const imagens = lista.filter(a => (a.mime || '').startsWith('image/'));
    const outros = lista.filter(a => !(a.mime || '').startsWith('image/'));

    return `
      ${imagens.length ? `
        <div class="anexos-preview">
          ${imagens.map(an => `<img class="anexo-img" id="prev-${an.id}" alt="${escapar(an.nome_original)}">`).join('')}
        </div>` : ''}
      ${outros.length ? `
        <div class="chips" style="margin-top:10px">
          ${outros.map(an => `
            <button class="badge badge-blue" style="border:none;cursor:pointer"
                    onclick="Anexos.abrir(${an.id}, '${escapar(an.nome_original).replace(/'/g, "\\'")}')">
              ${Anexos.icone(an.mime)} ver anexo
            </button>`).join('')}
        </div>` : ''}`;
  },

  /** Busca as imagens e liga o clique pra abrir a imagem inteira numa aba nova. */
  _carregarPreviasAnexos(anexos) {
    for (const an of (anexos || [])) {
      if (!(an.mime || '').startsWith('image/')) continue;
      Anexos.obterUrl(an.id).then(url => {
        const img = document.getElementById('prev-' + an.id);
        if (!img) { URL.revokeObjectURL(url); return; }
        img.src = url;
        img.onclick = () => window.open(url, '_blank');
      }).catch(() => {});
    }
  },

  async abrirOcorrencia(id) {
    const o = (this._ocorrencias || []).find(x => x.id === id);
    if (!o) return;

    document.getElementById('ocorrAppTitulo').textContent = o.titulo;
    document.getElementById('ocorrAppSub').textContent =
      `${dataBR(o.data_ocorrencia)}${o.hora_ocorrencia ? ' ' + o.hora_ocorrencia : ''}`;
    document.getElementById('ocorrAppCorpo').innerHTML = `
      <div style="margin-bottom:10px">${badgeGravidade(o.gravidade)}</div>
      ${o.descricao ? `<div style="font-size:13px;color:var(--txt2);line-height:1.6">${escapar(o.descricao)}</div>` : ''}
      ${o.providencia ? `<div style="font-size:12.5px;color:var(--txt2);margin-top:10px"><strong>Providência:</strong> ${escapar(o.providencia)}</div>` : ''}
      ${o.registrado_nome ? `<div style="font-size:11px;color:var(--txt3);margin-top:10px">Registrado por ${escapar(o.registrado_nome)}</div>` : ''}
      ${this._blocoAnexos(o.anexos)}
      ${o.exige_ciencia ? (o.ciente_em
        ? `<button class="btn-ciente" disabled>✅ Ciência registrada em ${dataHoraBR(o.ciente_em)}</button>`
        : `<button class="btn-ciente" onclick="Portal.darCienciaOcorrencia(${o.id}, this)">Estou ciente</button>`)
        : ''}`;
    abrirModal('modalOcorrenciaApp');
    this._carregarPreviasAnexos(o.anexos);

    if (!o.lido_em) {
      try {
        await Api.post(`/api/portal/ocorrencias/${id}/lida`);
        o.lido_em = new Date().toISOString();
        this.desenharOcorrencias();
      } catch {}
    }
  },

  // ── Turma (funcionário) ─────────────────────────────────────
  async verTurma(id) {
    irTela('aluno');
    const alvo = document.getElementById('alunoConteudo');
    alvo.innerHTML = '<div class="vazio"><span class="spinner"></span></div>';

    let t;
    try { t = await Api.get('/api/portal/turmas/' + id); }
    catch (e) {
      alvo.innerHTML = `<div class="vazio"><span class="ico">⚠️</span><div class="titulo">${escapar(e.message)}</div></div>`;
      return;
    }

    alvo.innerHTML = `
      <button onclick="irTela('inicio')"
        style="background:none;border:none;color:var(--gold);font-family:var(--font);font-size:13px;font-weight:600;cursor:pointer;padding:0 0 12px">‹ Voltar</button>

      <div class="ola">
        <h2>${escapar(t.nome)}</h2>
        <p>${TURNOS[t.turno] || t.turno}${t.sala ? ' · Sala ' + escapar(t.sala) : ''} · ${t.alunos.length} aluno(s)</p>
      </div>

      ${t.alunos.map(a => `
        <div class="cartao toque" onclick="Portal.verAluno(${a.id})">
          <div class="aluno-linha">
            <div class="aluno-av">${iniciais(a.nome)}</div>
            <div style="flex:1;min-width:0">
              <div class="aluno-nome">${escapar(a.nome)}</div>
              <div class="aluno-info">${a.idade != null ? a.idade + ' anos · ' : ''}${escapar(a.matricula)}</div>
              ${(a.alergias || a.necessidades_especiais) ? `
                <div class="chips">
                  ${a.alergias ? '<span class="badge badge-red">alergia</span>' : ''}
                  ${a.necessidades_especiais ? '<span class="badge badge-purple">atenção especial</span>' : ''}
                </div>` : ''}
            </div>
            <span class="seta">›</span>
          </div>
        </div>`).join('') ||
        '<div class="vazio"><span class="ico">🎓</span><div class="titulo">Turma sem alunos</div></div>'}`;
  },

  // ── Mensagens (lista estilo caixa de entrada) ────────────────
  async renderMensagens() {
    const alvo = document.getElementById('mensagensConteudo');
    alvo.innerHTML = '<div class="vazio"><span class="spinner"></span></div>';

    try { this._mensagens = await Api.get('/api/portal/mensagens'); }
    catch (e) {
      alvo.innerHTML = `<div class="vazio"><span class="ico">⚠️</span><div class="titulo">${escapar(e.message)}</div></div>`;
      return;
    }
    this.desenharMensagens();
  },

  desenharMensagens() {
    const alvo = document.getElementById('mensagensConteudo');
    const lista = this._mensagens || [];

    if (!lista.length) {
      alvo.innerHTML = `<div class="vazio"><span class="ico">✉️</span>
        <div class="titulo">Nenhuma mensagem</div>
        <div class="sub">Os comunicados da escola aparecem aqui.</div></div>`;
      return;
    }

    const pendentes = lista.filter(m => m.exige_ciencia && !m.ciente_em).length;

    alvo.innerHTML = `
      ${pendentes ? `<div class="ola" style="background:var(--gold-soft);border-color:var(--gold)">
        <h2>${pendentes} comunicado(s) aguardando ciência</h2>
        <p>Toque para abrir e confirme com "Estou ciente".</p>
      </div>` : ''}
      ${lista.map(m => this.linhaMensagem(m)).join('')}`;
  },

  /** Uma linha da caixa de entrada — toque abre o detalhe completo. */
  linhaMensagem(m) {
    const pendenteCiencia = m.exige_ciencia && !m.ciente_em;
    const naoLida = !m.lido_em;

    return `
      <div class="cartao toque lista-linha ${naoLida ? 'nao-lida' : ''}" onclick="Portal.abrirMensagem(${m.id})">
        <div class="aluno-linha">
          <div class="aluno-av" style="${pendenteCiencia ? 'background:rgba(255,94,94,.15);color:var(--red)' : ''}">✉️</div>
          <div style="flex:1;min-width:0">
            <div class="aluno-nome" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapar(m.titulo)}</div>
            <div class="aluno-info">
              ${dataHoraBR(m.criado_em)} · ${escapar(m.criado_nome || 'Secretaria')}${m.aluno_nome ? ' · ' + escapar(m.aluno_nome) : ''}
              ${(m.anexos || []).length ? ' · 📎' : ''}
            </div>
          </div>
          ${pendenteCiencia ? '<span class="badge badge-red">ciência</span>'
            : naoLida ? '<span class="badge badge-gold">nova</span>' : ''}
          <span class="seta">›</span>
        </div>
      </div>`;
  },

  /** Abre o detalhe da mensagem em modal e marca como lida na hora. */
  async abrirMensagem(id) {
    const m = (this._mensagens || []).find(x => x.id === id);
    if (!m) return;

    document.getElementById('msgAppTitulo').textContent = m.titulo;
    document.getElementById('msgAppSub').textContent =
      `${dataHoraBR(m.criado_em)} · ${m.criado_nome || 'Secretaria'}${m.aluno_nome ? ' · ' + m.aluno_nome : ''}`;
    document.getElementById('msgAppCorpo').innerHTML = `
      <div class="msg-texto" style="margin-top:0">${escapar(m.conteudo)}</div>
      ${this._blocoAnexos(m.anexos)}
      ${m.exige_ciencia ? (m.ciente_em
        ? `<button class="btn-ciente" disabled>✅ Ciência registrada em ${dataHoraBR(m.ciente_em)}</button>`
        : `<button class="btn-ciente" onclick="Portal.darCiencia(${m.id}, this)">Estou ciente</button>`)
        : ''}`;
    abrirModal('modalMensagemApp');
    this._carregarPreviasAnexos(m.anexos);

    if (!m.lido_em) {
      try {
        await Api.post(`/api/portal/mensagens/${id}/lida`);
        m.lido_em = new Date().toISOString();
        this.desenharMensagens();
        this.atualizarSelo();
      } catch {}
    }
  },

  async darCiencia(id, botao) {
    botao.disabled = true;
    botao.textContent = 'Registrando...';
    try {
      const r = await Api.post(`/api/portal/mensagens/${id}/ciente`);
      botao.textContent = `✅ Ciência registrada em ${dataHoraBR(r.ciente_em)}`;
      const m = (this._mensagens || []).find(x => x.id === id);
      if (m) { m.ciente_em = r.ciente_em; m.lido_em = m.lido_em || r.ciente_em; }
      toast('Ciência registrada. Obrigado!');
      this.atualizarSelo();
      this.carregarInicio();
      this.desenharMensagens();
    } catch (e) {
      botao.disabled = false;
      botao.textContent = 'Estou ciente';
      toastErro(e.message);
    }
  },

  // ── Conta ───────────────────────────────────────────────────
  async renderConta() {
    const mostrarBiometria = USUARIO.tipo === 'responsavel' && await Portal.suportaBiometria();
    let credenciaisBiometria = [];
    if (mostrarBiometria) {
      try { credenciaisBiometria = await Api.get('/api/auth/webauthn/credenciais'); } catch {}
    }

    document.getElementById('contaConteudo').innerHTML = `
      <div class="cartao">
        <div class="aluno-linha">
          <div class="aluno-av">${iniciais(USUARIO.nome)}</div>
          <div style="flex:1;min-width:0">
            <div class="aluno-nome">${escapar(USUARIO.nome)}</div>
            <div class="aluno-info">${escapar(USUARIO.perfil_nome || (USUARIO.tipo === 'responsavel' ? 'Responsável' : 'Funcionário'))}</div>
          </div>
        </div>
      </div>

      <div class="titulo-secao">Segurança</div>
      <div class="cartao">
        <div class="info-linha"><span class="rot">Login</span><span class="val mono">${escapar(USUARIO.login)}</span></div>
        <div class="info-linha"><span class="rot">Senha</span><span class="val">
          <button onclick="Portal.trocarSenha()" style="background:var(--card2);border:1px solid var(--border);color:var(--txt);border-radius:8px;padding:6px 11px;font-family:var(--font);font-size:12px;font-weight:600;cursor:pointer">🔑 Trocar senha</button>
        </span></div>
      </div>

      ${mostrarBiometria ? `
      <div class="titulo-secao">Acesso rápido</div>
      <div class="cartao toque" onclick="Portal.registrarBiometria()">
        <div class="aluno-linha">
          <div class="aluno-av">🔓</div>
          <div style="flex:1"><div class="aluno-nome">Salvar acesso com desbloqueio do celular</div>
            <div class="aluno-info">Entre com a digital, o rosto ou o PIN do aparelho, sem digitar a senha</div></div>
          <span class="seta">›</span>
        </div>
      </div>
      ${credenciaisBiometria.map(c => `
        <div class="cartao">
          <div class="aluno-linha">
            <div class="aluno-av">📱</div>
            <div style="flex:1;min-width:0">
              <div class="aluno-nome">${escapar(c.nome_dispositivo || 'Aparelho')}</div>
              <div class="aluno-info">Ativado em ${dataBR(c.criado_em)}${c.ultimo_uso ? ' · último uso ' + dataBR(c.ultimo_uso) : ''}</div>
            </div>
            <button class="btn-ico perigo" onclick="event.stopPropagation();Portal.removerBiometria(${c.id})" title="Remover">🗑️</button>
          </div>
        </div>`).join('')}` : ''}
      </div>

      <div class="titulo-secao">Notificações</div>
      <div class="cartao toque" onclick="Portal.alternarNotificacoes()">
        <div class="aluno-linha">
          <div class="aluno-av">🔔</div>
          <div style="flex:1;min-width:0">
            <div class="aluno-nome">Notificações no aparelho</div>
            <div class="aluno-info" id="statusNotificacoes">Verificando…</div>
          </div>
          <span class="seta">›</span>
        </div>
      </div>

      ${USUARIO.tipo === 'funcionario' ? `
      <div class="titulo-secao">Sistema</div>
      <div class="cartao toque" onclick="window.location.href='/sistema'">
        <div class="aluno-linha">
          <div class="aluno-av">💻</div>
          <div style="flex:1"><div class="aluno-nome">Abrir o sistema completo</div>
            <div class="aluno-info">Cadastros, relatórios e configurações</div></div>
          <span class="seta">›</span>
        </div>
      </div>` : ''}

      <div class="titulo-secao">Sessão</div>
      <div class="cartao toque" onclick="Sessao.encerrar()">
        <div class="aluno-linha">
          <div class="aluno-av" style="background:rgba(255,94,94,.15);color:var(--red)">⏻</div>
          <div style="flex:1"><div class="aluno-nome">Sair da conta</div>
            <div class="aluno-info">Encerra a sessão neste aparelho</div></div>
        </div>
      </div>`;

    this.statusNotificacoes();
  },

  // ── Biometria/PIN do celular (WebAuthn) ──────────────────────
  async suportaBiometria() {
    if (!window.PublicKeyCredential) return false;
    try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
    catch { return false; }
  },

  async registrarBiometria() {
    let opcoesResp;
    try { opcoesResp = await Api.post('/api/auth/webauthn/registro-opcoes'); }
    catch (e) { return toastErro(e.message); }

    const opcoes = opcoesResp.opcoes;
    opcoes.challenge = b64urlParaBuffer(opcoes.challenge);
    opcoes.user.id = b64urlParaBuffer(opcoes.user.id);
    if (opcoes.excludeCredentials) {
      opcoes.excludeCredentials = opcoes.excludeCredentials.map(c => ({ ...c, id: b64urlParaBuffer(c.id) }));
    }

    let credential;
    try {
      credential = await navigator.credentials.create({ publicKey: opcoes });
    } catch (e) {
      if (e.name === 'NotAllowedError') return; // usuário cancelou o prompt — sem erro
      return toastErro('Não foi possível usar a biometria deste aparelho.');
    }

    const resposta = {
      id: credential.id,
      rawId: bufferParaB64url(credential.rawId),
      type: credential.type,
      clientExtensionResults: credential.getClientExtensionResults(),
      response: {
        clientDataJSON: bufferParaB64url(credential.response.clientDataJSON),
        attestationObject: bufferParaB64url(credential.response.attestationObject),
        transports: credential.response.getTransports ? credential.response.getTransports() : undefined,
      },
    };

    try {
      await Api.post('/api/auth/webauthn/registro', { flowId: opcoesResp.flowId, resposta });
      toast('Acesso rápido ativado! Da próxima vez, é só tocar e usar a biometria.');
      this.renderConta();
    } catch (e) { toastErro(e.message); }
  },

  async removerBiometria(id) {
    const ok = await confirmar('Remover este acesso rápido? Vai precisar cadastrar de novo pra usar biometria neste aparelho.',
      { titulo: 'Remover acesso', textoOk: 'Remover' });
    if (!ok) return;
    try {
      await Api.excluir(`/api/auth/webauthn/credenciais/${id}`);
      toast('Acesso removido.');
      this.renderConta();
    } catch (e) { toastErro(e.message); }
  },

  // ── Notificações push ───────────────────────────────────────
  async statusNotificacoes() {
    const el = document.getElementById('statusNotificacoes');
    if (!el) return;

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      el.textContent = 'Não suportado neste navegador.';
      return;
    }
    if (Notification.permission === 'denied') {
      el.textContent = 'Bloqueadas — libere nas configurações do navegador.';
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const inscricao = await reg.pushManager.getSubscription();
      el.textContent = inscricao
        ? 'Ativadas — toque para desativar'
        : 'Toque para avisar de novas mensagens e ocorrências';
    } catch {
      el.textContent = 'Toque para ativar';
    }
  },

  async alternarNotificacoes() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return toastErro('Este navegador não suporta notificações.');
    }

    const reg = await navigator.serviceWorker.ready;
    const atual = await reg.pushManager.getSubscription();

    if (atual) {
      try { await Api.post('/api/portal/push/unsubscribe', { endpoint: atual.endpoint }); } catch {}
      await atual.unsubscribe();
      toast('Notificações desativadas.');
      return this.statusNotificacoes();
    }

    if (Notification.permission === 'denied') {
      return toastErro('As notificações estão bloqueadas nas configurações do navegador.');
    }

    try {
      const { publicKey, ativo } = await Api.get('/api/portal/push/public-key');
      if (!ativo) return toastErro('A escola ainda não ativou as notificações.');

      const permissao = await Notification.requestPermission();
      if (permissao !== 'granted') return toastErro('Permissão de notificação negada.');

      const nova = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ParaUint8Array(publicKey),
      });
      await Api.post('/api/portal/push/subscribe', nova.toJSON());
      toast('Notificações ativadas!');
    } catch (e) { toastErro(e.message); }

    this.statusNotificacoes();
  },

  trocarSenha() {
    ['appSenhaAtual', 'appSenhaNova', 'appSenhaConfirma'].forEach(id => {
      const el = document.getElementById(id);
      el.value = '';
      el.type = 'password';
    });
    ativarVerSenha(document.getElementById('modalSenhaApp'));
    abrirModal('modalSenhaApp');
  },

  async salvarSenha() {
    const atual = document.getElementById('appSenhaAtual').value;
    const nova = document.getElementById('appSenhaNova').value;
    const conf = document.getElementById('appSenhaConfirma').value;

    if (nova.length < 6) return toastErro('A nova senha precisa ter ao menos 6 caracteres.');
    if (nova !== conf) return toastErro('A confirmação não confere com a nova senha.');

    try {
      await Api.post('/api/auth/trocar-senha', { senha_atual: atual, senha_nova: nova });
      fecharModal('modalSenhaApp');
      toast('Senha alterada com sucesso.');
    } catch (e) { toastErro(e.message); }
  },
};

document.addEventListener('DOMContentLoaded', () => Portal.iniciar());


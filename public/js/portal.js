/* ══════════════════════════════════════════════════════════════
   CEM — Aplicativo (PWA)
   Uma única interface que se adapta ao perfil de quem entrou:
   responsável (consulta os próprios filhos) ou funcionário
   (consulta rápida de alunos, turmas e contatos).
   ══════════════════════════════════════════════════════════════ */

const USUARIO = Sessao.exigir();
let inicioDados = null;
let escolaDados = {};

// ── Tema ──────────────────────────────────────────────────────
function alternarTemaApp() {
  const claro = document.body.classList.toggle('tema-claro');
  localStorage.setItem('cem_tema', claro ? 'claro' : 'escuro');
}
if (localStorage.getItem('cem_tema') === 'claro') document.body.classList.add('tema-claro');

// ── Navegação inferior ────────────────────────────────────────
function irTela(tela) {
  document.querySelectorAll('.tela').forEach(t => t.classList.remove('active'));
  document.getElementById('tela-' + tela)?.classList.add('active');

  document.querySelectorAll('.rodape button').forEach(b => {
    b.classList.toggle('active', b.dataset.tela === tela);
  });

  window.scrollTo({ top: 0 });
  if (tela === 'consulta') Portal.renderConsulta();
  if (tela === 'conta') Portal.renderConta();
  if (tela === 'mensagens') Portal.renderMensagens();
  if (tela === 'financeiro') Portal.renderFinanceiro();
  if (tela === 'ocorrencias') Portal.renderOcorrencias();
}

document.querySelectorAll('.rodape button').forEach(b => {
  b.addEventListener('click', () => irTela(b.dataset.tela));
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
  await promptInstalacao.userChoice;
  promptInstalacao = null;
  document.getElementById('barraInstalar').style.display = 'none';
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
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
      // Responsáveis usam Financeiro e Histórico no lugar de Consultar e Mensagens no rodapé
      document.getElementById('btnConsulta').style.display = 'none';
      document.getElementById('btnFinanceiro').style.display = '';
      document.getElementById('btnOcorrencias').style.display = '';
    } else {
      // Funcionários não têm caixa de mensagens
      document.getElementById('btnMensagens').style.display = 'none';
    }

    await this.carregarInicio();
    this.atualizarSelo();

    // Reconfere o selo ao voltar para o app
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.atualizarSelo();
    });
  },

  /** Alerta visual de mensagens não lidas na barra inferior. */
  async atualizarSelo() {
    if (USUARIO.tipo !== 'responsavel') return;
    let d;
    try { d = await Api.get('/api/portal/mensagens/nao-lidas'); }
    catch { return; }

    const selo = document.getElementById('seloMensagens');
    const total = d.nao_lidas || 0;
    selo.textContent = total > 9 ? '9+' : total;
    selo.classList.toggle('mostrar', total > 0);

    // Ciência pendente pinta o selo de dourado
    selo.style.background = d.aguardando_ciencia > 0 ? 'var(--gold)' : 'var(--red)';
    selo.style.color = d.aguardando_ciencia > 0 ? '#1A1A1A' : '#fff';
  },

  // ── Início ──────────────────────────────────────────────────
  async carregarInicio() {
    const alvo = document.getElementById('inicioConteudo');
    try { inicioDados = await Api.get('/api/portal/inicio'); }
    catch (e) {
      alvo.innerHTML = `<div class="vazio"><span class="ico">⚠️</span><div class="titulo">${escapar(e.message)}</div></div>`;
      return;
    }

    const hora = new Date().getHours();
    const parte = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

    alvo.innerHTML = inicioDados.perfil === 'responsavel'
      ? this.inicioResponsavel(inicioDados, parte)
      : this.inicioFuncionario(inicioDados, parte);
  },

  inicioResponsavel(d, parte) {
    const alunos = d.alunos || [];
    const venc = d.financeiro_vencido || { parcelas: 0, total: 0 };

    return `
      <div class="ola">
        <h2>${parte}, ${escapar(nomeCurto(d.nome))}!</h2>
        <p>${alunos.length
            ? `Você acompanha ${alunos.length} aluno${alunos.length === 1 ? '' : 's'} no Centro Educacional Milezi.`
            : 'Ainda não há alunos vinculados ao seu cadastro. Procure a secretaria.'}</p>
      </div>

      ${d.aguardando_ciencia > 0 ? `
        <div class="cartao toque" style="border-color:var(--gold);background:var(--gold-soft)" onclick="irTela('mensagens')">
          <div class="aluno-linha">
            <div class="aluno-av">📣</div>
            <div style="flex:1">
              <div class="aluno-nome">${d.aguardando_ciencia} item(ns) aguardando sua ciência</div>
              <div class="aluno-info">Toque para ver mensagens e ocorrências</div>
            </div>
            <span class="seta">›</span>
          </div>
        </div>` : d.nao_lidas > 0 ? `
        <div class="cartao toque" onclick="irTela('mensagens')">
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
        <div class="cartao" style="border-color:rgba(255,94,94,.4)">
          <div class="aluno-linha">
            <div class="aluno-av" style="background:rgba(255,94,94,.15);color:var(--red)">💰</div>
            <div style="flex:1">
              <div class="aluno-nome">${venc.parcelas} parcela(s) em atraso</div>
              <div class="aluno-info">Total de ${moedaBR(venc.total)} — procure a secretaria</div>
            </div>
          </div>
        </div>` : ''}

      <div class="titulo-secao">Meus filhos</div>
      ${alunos.length ? alunos.map(a => `
        <div class="cartao toque" onclick="Portal.verAluno(${a.id})">
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
              </div>
            </div>
            <span class="seta">›</span>
          </div>
        </div>`).join('')
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

  /** Histórico compartilhado pela escola. */
  blocoOcorrencias(lista) {
    return `
      <div class="titulo-secao">Histórico compartilhado</div>
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
      toast('Ciência registrada. Obrigado!');
      this.atualizarSelo();
      this.carregarInicio();
    } catch (e) {
      botao.disabled = false;
      botao.textContent = 'Estou ciente';
      toastErro(e.message);
    }
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
    try {
      const resultados = await Promise.all(
        alunos.map(a => Api.get(`/api/portal/alunos/${a.id}/financeiro`).catch(() => null))
      );
      let html = '';
      for (let i = 0; i < alunos.length; i++) {
        const a = alunos[i];
        const f = resultados[i];
        html += `<div class="titulo-secao">${escapar(a.nome)}</div>`;
        const bloco = f ? this.blocoFinanceiro(f) : '';
        html += bloco || '<div class="cartao"><div style="font-size:12.5px;color:var(--green)">✅ Nenhuma parcela em aberto.</div></div>';
      }
      alvo.innerHTML = html;
    } catch (e) {
      alvo.innerHTML = `<div class="vazio"><span class="ico">⚠️</span><div class="titulo">${escapar(e.message)}</div></div>`;
    }
  },

  // ── Ocorrências — histórico (tela dedicada — responsável) ────
  async renderOcorrencias() {
    const alvo = document.getElementById('ocorrenciasConteudo');
    alvo.innerHTML = '<div class="vazio"><span class="spinner"></span></div>';
    const alunos = inicioDados?.alunos || [];
    if (!alunos.length) {
      alvo.innerHTML = '<div class="vazio"><span class="ico">📌</span><div class="titulo">Nenhum aluno vinculado</div></div>';
      return;
    }
    try {
      const resultados = await Promise.all(
        alunos.map(a => Api.get(`/api/portal/alunos/${a.id}/ocorrencias`).catch(() => []))
      );
      let blocos = '';
      let pendentes = 0;
      for (let i = 0; i < alunos.length; i++) {
        const lista = resultados[i];
        if (!lista.length) continue;
        pendentes += lista.filter(o => o.exige_ciencia && !o.ciente_em).length;
        blocos += `<div class="titulo-secao">${escapar(alunos[i].nome)}</div>` + this.blocoOcorrencias(lista);
      }
      const aviso = pendentes > 0
        ? `<div class="cartao" style="border-color:var(--gold);background:var(--gold-soft);margin-bottom:4px">
            <div class="aluno-nome">📣 ${pendentes} ocorrência(s) aguardando sua ciência</div>
            <div class="aluno-info" style="margin-top:4px">Toque em "Estou ciente" abaixo para confirmar.</div>
           </div>`
        : '';
      alvo.innerHTML = aviso + (blocos || `<div class="vazio"><span class="ico">📌</span>
        <div class="titulo">Nenhuma ocorrência compartilhada</div>
        <div class="sub">A escola compartilhará ocorrências relevantes aqui.</div></div>`);
    } catch (e) {
      alvo.innerHTML = `<div class="vazio"><span class="ico">⚠️</span><div class="titulo">${escapar(e.message)}</div></div>`;
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

  // ── Mensagens ───────────────────────────────────────────────
  async renderMensagens() {
    const alvo = document.getElementById('mensagensConteudo');
    alvo.innerHTML = '<div class="vazio"><span class="spinner"></span></div>';

    let lista;
    try { lista = await Api.get('/api/portal/mensagens'); }
    catch (e) {
      alvo.innerHTML = `<div class="vazio"><span class="ico">⚠️</span><div class="titulo">${escapar(e.message)}</div></div>`;
      return;
    }

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
        <p>Leia e toque em "Estou ciente" para confirmar à escola.</p>
      </div>` : ''}
      ${lista.map(m => this.cartaoMensagem(m)).join('')}`;

    // Marca como lidas as que ainda não tinham sido abertas
    const naoLidas = lista.filter(m => !m.lido_em);
    for (const m of naoLidas) {
      try { await Api.post(`/api/portal/mensagens/${m.id}/lida`); } catch {}
    }
    if (naoLidas.length) this.atualizarSelo();
  },

  cartaoMensagem(m) {
    const pendente = m.exige_ciencia && !m.ciente_em;
    const nova = !m.lido_em;
    const classe = pendente ? 'pendente' : (nova ? 'nova' : '');

    return `
      <div class="cartao msg-card ${classe}">
        <div class="msg-topo">
          <div style="flex:1;min-width:0">
            <div class="msg-titulo">${escapar(m.titulo)}</div>
            <div class="msg-meta">
              ${dataHoraBR(m.criado_em)} · ${escapar(m.criado_nome || 'Secretaria')}
              ${m.aluno_nome ? ' · ' + escapar(m.aluno_nome) : ''}
            </div>
          </div>
          ${nova ? '<span class="badge badge-gold">nova</span>' : ''}
        </div>

        <div class="msg-texto">${escapar(m.conteudo)}</div>

        ${m.exige_ciencia ? (m.ciente_em
          ? `<button class="btn-ciente" disabled>✅ Ciência registrada em ${dataHoraBR(m.ciente_em)}</button>`
          : `<button class="btn-ciente" onclick="Portal.darCiencia(${m.id}, this)">Estou ciente</button>`)
          : ''}
      </div>`;
  },

  async darCiencia(id, botao) {
    botao.disabled = true;
    botao.textContent = 'Registrando...';
    try {
      const r = await Api.post(`/api/portal/mensagens/${id}/ciente`);
      botao.textContent = `✅ Ciência registrada em ${dataHoraBR(r.ciente_em)}`;
      botao.closest('.msg-card').classList.remove('pendente');
      toast('Ciência registrada. Obrigado!');
      this.atualizarSelo();
      this.carregarInicio();
    } catch (e) {
      botao.disabled = false;
      botao.textContent = 'Estou ciente';
      toastErro(e.message);
    }
  },

  // ── Conta ───────────────────────────────────────────────────
  renderConta() {
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
          <div class="aluno-av" style="background:rgba(255,94,94,.15);color:var(--red)">🚪</div>
          <div style="flex:1"><div class="aluno-nome">Sair da conta</div>
            <div class="aluno-info">Encerra a sessão neste aparelho</div></div>
        </div>
      </div>`;
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

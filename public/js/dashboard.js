/* ══════════════════════════════════════════════════════════════
   CEM — Painel inicial
   ══════════════════════════════════════════════════════════════ */

const Dashboard = {
  async carregar() {
    const alvo = document.getElementById('painelConteudo');
    alvo.innerHTML = '<div class="vazio"><span class="spinner"></span></div>';

    const ano = document.getElementById('painelAno').value || new Date().getFullYear();

    let d;
    try { d = await Api.get('/api/dashboard', { ano_letivo: ano }); }
    catch (e) {
      alvo.innerHTML = `<div class="vazio"><span class="ico">⚠️</span><div class="titulo">${escapar(e.message)}</div></div>`;
      return;
    }

    const hora = new Date().getHours();
    const parte = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    document.getElementById('painelSaudacao').textContent =
      `${parte}, ${nomeCurto(USUARIO.nome)} — ano letivo de ${d.ano_letivo}`;

    const c = d.cards;
    alvo.innerHTML = `
      <div class="stat-grid">
        ${this.card('Alunos matriculados', c.alunosAtivos, `${c.preMatricula} em pré-matrícula`, '🎓', 'c-gold', 'alunos')}
        ${this.card('Turmas ativas', c.turmas, `${d.ocupacaoTurmas.length} turmas no ano`, '🏫', 'c-blue', 'turmas')}
        ${this.card('Responsáveis', c.responsaveis, 'cadastros ativos', '👨‍👩‍👧', 'c-purple', 'responsaveis')}
        ${this.card('Funcionários', c.funcionarios, `${c.professores} professores`, '👔', 'c-green', 'funcionarios')}
      </div>

      ${(c.semTurma || c.semResponsavel) ? `
      <div class="card card-p mb-5" style="border-color:rgba(242,183,5,.35)">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <span style="font-size:22px">💡</span>
          <div style="flex:1;min-width:220px">
            <div style="font-weight:700;margin-bottom:3px">Pendências de cadastro</div>
            <div style="font-size:12.5px;color:var(--txt2)">
              ${c.semTurma ? `<b class="c-gold">${c.semTurma}</b> aluno(s) sem turma definida. ` : ''}
              ${c.semResponsavel ? `<b class="c-gold">${c.semResponsavel}</b> aluno(s) sem responsável vinculado.` : ''}
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="irPara('alunos')">Revisar alunos →</button>
        </div>
      </div>` : ''}

      <div style="display:grid;grid-template-columns:1.35fr 1fr;gap:16px;align-items:start" class="painel-colunas">
        <div class="card">
          <div class="card-head">Ocupação das turmas</div>
          <div class="card-p">${this.ocupacao(d.ocupacaoTurmas)}</div>
        </div>
        <div class="card">
          <div class="card-head">Aniversariantes do mês</div>
          <div class="card-p">${this.aniversariantes(d.aniversariantes)}</div>
        </div>
        <div class="card">
          <div class="card-head">Últimas matrículas</div>
          <div class="card-p">${this.ultimas(d.ultimasMatriculas)}</div>
        </div>
        <div class="card">
          <div class="card-head">Atenção em sala <span class="badge badge-red">saúde</span></div>
          <div class="card-p">${this.saude(d.alertasSaude)}</div>
        </div>
      </div>`;

    // Coluna única em telas estreitas
    if (window.innerWidth <= 980) {
      document.querySelector('.painel-colunas').style.gridTemplateColumns = '1fr';
    }
  },

  card(rotulo, valor, sub, ico, cor, pagina) {
    return `
      <div class="stat-card clicavel" onclick="irPara('${pagina}')">
        <div class="stat-label">${rotulo}</div>
        <div class="stat-val ${cor}">${valor}</div>
        <div class="stat-sub">${escapar(sub)}</div>
        <div class="stat-ico">${ico}</div>
      </div>`;
  },

  ocupacao(turmas) {
    if (!turmas.length) return '<div class="vazio"><span class="ico">🏫</span><div class="titulo">Nenhuma turma no ano letivo</div><div class="sub">Cadastre turmas para organizar os alunos.</div></div>';
    return turmas.map(t => {
      const cap = t.capacidade || 0;
      const pct = cap ? Math.min(100, Math.round(t.ocupacao / cap * 100)) : 0;
      return `
        <div style="margin-bottom:15px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:13px">
            <span style="font-weight:600">${escapar(t.nome)}
              <span class="c-txt3" style="font-weight:400">· ${TURNOS[t.turno] || t.turno}</span></span>
            <span class="mono c-txt2" style="font-size:12px">${t.ocupacao}${cap ? ' / ' + cap : ''}</span>
          </div>
          <div class="barra"><i style="width:${cap ? pct : 100}%;${!cap ? 'background:var(--border2)' : ''}"></i></div>
        </div>`;
    }).join('');
  },

  aniversariantes(lista) {
    if (!lista.length) return '<div class="vazio"><span class="ico">🎂</span><div class="titulo">Nenhum aniversário este mês</div></div>';
    return lista.map(p => {
      const dia = String(p.data_nascimento).slice(8, 10);
      return `
        <div style="display:flex;align-items:center;gap:11px;padding:7px 0;border-bottom:1px solid var(--border)">
          <div class="mono c-gold" style="font-size:16px;font-weight:700;min-width:26px">${dia}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapar(p.nome)}</div>
            <div style="font-size:11px;color:var(--txt3)">${p.tipo === 'aluno' ? '🎓 Aluno' : '👔 Funcionário'}</div>
          </div>
        </div>`;
    }).join('');
  },

  ultimas(lista) {
    if (!lista.length) return '<div class="vazio"><span class="ico">📋</span><div class="titulo">Nenhuma matrícula registrada</div></div>';
    return lista.map(a => `
      <div style="display:flex;align-items:center;gap:11px;padding:7px 0;border-bottom:1px solid var(--border);cursor:pointer"
           onclick="irPara('alunos');setTimeout(()=>Alunos.abrirEdicao(${a.id}),260)">
        <div class="pessoa"><div class="av">${iniciais(a.nome)}</div></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapar(a.nome)}</div>
          <div style="font-size:11px;color:var(--txt3)">${escapar(a.turma_nome || 'Sem turma')} · ${dataBR(a.data_matricula)}</div>
        </div>
        <span class="mono c-txt3" style="font-size:11px">${escapar(a.matricula)}</span>
      </div>`).join('');
  },

  saude(lista) {
    if (!lista.length) return '<div class="vazio"><span class="ico">✅</span><div class="titulo">Nenhum alerta registrado</div><div class="sub">Alergias e necessidades especiais aparecem aqui.</div></div>';
    return lista.map(a => `
      <div style="padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:13px;font-weight:600">${escapar(a.nome)}</div>
        <div style="font-size:11.5px;color:var(--txt2);margin-top:2px">
          ${a.alergias ? `🔸 ${escapar(a.alergias)}` : ''}
          ${a.necessidades_especiais ? `<br>🔹 ${escapar(a.necessidades_especiais)}` : ''}
        </div>
      </div>`).join('');
  },
};

Carregadores.home = () => Dashboard.carregar();

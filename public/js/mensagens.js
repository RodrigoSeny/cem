/* ══════════════════════════════════════════════════════════════
   CEM — Mensagens para o aplicativo dos responsáveis
   ══════════════════════════════════════════════════════════════ */

const Mensagens = {
  lista: [],
  tipos: [],

  async carregarTipos() {
    if (this.tipos.length) return this.tipos;
    try { this.tipos = await Api.get('/api/mensagens/tipos'); }
    catch { this.tipos = [{ id: 'comunicado', nome: 'Comunicado' }]; }
    return this.tipos;
  },

  async carregar() {
    await this.carregarTipos();
    const corpo = document.getElementById('msgCorpo');
    corpo.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:26px"><span class="spinner"></span></td></tr>`;

    try { this.lista = await Api.get('/api/mensagens'); }
    catch (e) {
      corpo.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:26px;color:var(--red)">${escapar(e.message)}</td></tr>`;
      return;
    }

    if (!this.lista.length) {
      corpo.innerHTML = `<tr><td colspan="7"><div class="vazio">
        <span class="ico">✉️</span><div class="titulo">Nenhuma mensagem enviada</div>
        <div class="sub">Envie comunicados que aparecem no aplicativo dos pais.</div></div></td></tr>`;
      document.getElementById('msgTotal').textContent = 'Nenhum registro';
      return;
    }

    const nomeTipo = id => this.tipos.find(t => t.id === id)?.nome || id;
    const pct = (n, t) => t ? Math.round(n / t * 100) : 0;

    corpo.innerHTML = this.lista.map(m => `
      <tr class="clicavel" ondblclick="Mensagens.verDetalhe(${m.id})">
        <td class="mono" style="font-size:12px;white-space:nowrap">${dataHoraBR(m.criado_em)}</td>
        <td>
          <div style="font-weight:600;font-size:12.5px">${escapar(m.titulo)}</div>
          <div style="font-size:11px;color:var(--txt3)">por ${escapar(m.criado_nome || '—')}</div>
        </td>
        <td><span class="badge badge-cinza">${escapar(nomeTipo(m.tipo))}</span></td>
        <td style="font-size:12.5px">
          ${m.alvo === 'todos' ? 'Todos os responsáveis'
            : m.alvo === 'turma' ? `Turma ${escapar(m.turma_nome || '')}`
            : `Aluno ${escapar(m.aluno_nome || '')}`}
          <div style="font-size:11px;color:var(--txt3)">${m.total} destinatário(s)</div>
        </td>
        <td style="min-width:110px">
          <div class="barra mb-2"><i style="width:${pct(m.lidos, m.total)}%"></i></div>
          <span class="mono" style="font-size:11px;color:var(--txt2)">${m.lidos}/${m.total}</span>
        </td>
        <td>
          ${m.exige_ciencia
            ? `<div class="barra mb-2"><i style="width:${pct(m.cientes, m.total)}%;background:var(--grad-green)"></i></div>
               <span class="mono" style="font-size:11px;color:var(--txt2)">${m.cientes}/${m.total}</span>`
            : '<span class="badge badge-cinza">não exige</span>'}
        </td>
        <td class="acoes">
          <button class="btn-ico" onclick="Mensagens.verDetalhe(${m.id})" title="Ver quem leu">👁️</button>
          <button class="btn-ico perigo" onclick="Mensagens.excluir(${m.id})" title="Excluir">🗑️</button>
        </td>
      </tr>`).join('');

    const pendentes = this.lista.filter(m => m.exige_ciencia && m.cientes < m.total).length;
    document.getElementById('msgTotal').textContent =
      `${this.lista.length} mensagem(ns)` + (pendentes ? ` · ${pendentes} aguardando ciência` : '');
  },

  // ── Envio ──────────────────────────────────────────────────
  async abrirNova() {
    await this.carregarTipos();
    limparFormulario('formMensagem');

    document.getElementById('msgTipo').innerHTML =
      this.tipos.map(t => `<option value="${t.id}">${escapar(t.nome)}</option>`).join('');
    document.getElementById('msgTurma').innerHTML = Cache.opcoesTurmas('', 'Selecione a turma');
    document.getElementById('msgAluno').innerHTML = Cache.opcoesAlunos('', 'Selecione o aluno');
    document.getElementById('msgAlvo').value = 'todos';
    document.getElementById('msgCiencia').checked = false;

    this.trocarAlvo();
    abrirModal('modalMensagem');
  },

  trocarAlvo() {
    const alvo = document.getElementById('msgAlvo').value;
    document.getElementById('msgGrupoTurma').classList.toggle('oculto', alvo !== 'turma');
    document.getElementById('msgGrupoAluno').classList.toggle('oculto', alvo !== 'aluno');
    this.previa();
  },

  previa() {
    const alvo = document.getElementById('msgAlvo').value;
    const el = document.getElementById('msgPrevia');
    if (alvo === 'todos') {
      el.textContent = `Será enviada aos responsáveis de todos os alunos matriculados.`;
    } else if (alvo === 'turma') {
      const t = Cache.turmas.find(x => String(x.id) === document.getElementById('msgTurma').value);
      el.textContent = t ? `Responsáveis dos alunos da turma ${t.nome}.` : 'Selecione a turma.';
    } else {
      const a = Cache.alunos.find(x => String(x.id) === document.getElementById('msgAluno').value);
      el.textContent = a ? `Responsáveis vinculados a ${a.nome}.` : 'Selecione o aluno.';
    }
  },

  async salvar() {
    const dados = lerFormulario('formMensagem');
    dados.alvo = document.getElementById('msgAlvo').value;
    dados.exige_ciencia = document.getElementById('msgCiencia').checked ? 1 : 0;
    if (dados.alvo === 'turma') dados.turma_id = document.getElementById('msgTurma').value;
    if (dados.alvo === 'aluno') dados.aluno_id = document.getElementById('msgAluno').value;

    if (!dados.titulo) return toastErro('Informe o título da mensagem.');
    if (!dados.conteudo) return toastErro('Escreva o conteúdo da mensagem.');

    try {
      const r = await Api.post('/api/mensagens', dados);
      fecharModal('modalMensagem');
      toast(`Mensagem enviada a ${r.destinatarios} responsável(is).`);
      this.carregar();
    } catch (e) { toastErro(e.message); }
  },

  // ── Acompanhamento ─────────────────────────────────────────
  async verDetalhe(id) {
    let m;
    try { m = await Api.get('/api/mensagens/' + id); }
    catch (e) { return toastErro(e.message); }

    document.getElementById('msgDetTitulo').textContent = m.titulo;
    document.getElementById('msgDetSub').textContent =
      `${dataHoraBR(m.criado_em)} · ${m.destinatarios.length} destinatário(s)` +
      (m.exige_ciencia ? ' · exige ciência' : '');

    const lidos = m.destinatarios.filter(d => d.lido_em).length;
    const cientes = m.destinatarios.filter(d => d.ciente_em).length;

    document.getElementById('msgDetCorpo').innerHTML = `
      <div class="card card-p mb-4" style="background:var(--surface)">
        <div style="font-size:13px;line-height:1.65;white-space:pre-wrap">${escapar(m.conteudo)}</div>
      </div>

      <div class="stat-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
        <div class="stat-card"><div class="stat-label">Enviadas</div><div class="stat-val">${m.destinatarios.length}</div></div>
        <div class="stat-card"><div class="stat-label">Lidas</div><div class="stat-val c-blue">${lidos}</div></div>
        ${m.exige_ciencia ? `<div class="stat-card"><div class="stat-label">Ciência</div><div class="stat-val c-green">${cientes}</div></div>` : ''}
      </div>

      <div class="secao-titulo">Destinatários</div>
      <div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Responsável</th><th>Aluno</th><th>Leitura</th>${m.exige_ciencia ? '<th>Ciência</th>' : ''}</tr></thead>
        <tbody>
          ${m.destinatarios.map(d => `
            <tr>
              <td style="font-weight:600">${escapar(d.responsavel_nome)}</td>
              <td style="font-size:12px;color:var(--txt2)">${escapar(d.aluno_nome || '—')}</td>
              <td style="font-size:12px">${d.lido_em
                  ? `<span class="c-blue">${dataHoraBR(d.lido_em)}</span>`
                  : '<span class="badge badge-cinza">não lida</span>'}</td>
              ${m.exige_ciencia ? `<td style="font-size:12px">${d.ciente_em
                  ? `<span class="c-green">✅ ${dataHoraBR(d.ciente_em)}</span>`
                  : '<span class="badge badge-gold">pendente</span>'}</td>` : ''}
            </tr>`).join('')}
        </tbody>
      </table></div>`;

    abrirModal('modalMensagemDetalhe');
  },

  async excluir(id) {
    const m = this.lista.find(x => x.id === id);
    const ok = await confirmar(
      `Excluir a mensagem "${m ? m.titulo : ''}"? Ela sairá do aplicativo dos responsáveis, junto com os registros de leitura e ciência.`,
      { titulo: 'Excluir mensagem', textoOk: 'Excluir' }
    );
    if (!ok) return;

    try {
      await Api.excluir('/api/mensagens/' + id);
      toast('Mensagem excluída.');
      this.carregar();
    } catch (e) { toastErro(e.message); }
  },
};

Carregadores.mensagens = () => Mensagens.carregar();

document.addEventListener('DOMContentLoaded', () => {
  ['msgTurma', 'msgAluno'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', () => Mensagens.previa()));
});

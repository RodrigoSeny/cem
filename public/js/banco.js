/* ══════════════════════════════════════════════════════════════
   CEM — Contas Bancárias e Importação OFX
   ══════════════════════════════════════════════════════════════ */

const Banco = {
  contas: [],
  editId: null,

  // ── Carregamento principal ─────────────────────────────────
  async carregar() {
    await this.carregarContas();
    await this.carregarImportacoes();
    this._popularFiltros();
  },

  async carregarContas() {
    try {
      this.contas = await Api.get('/api/banco/contas');
    } catch (e) {
      this.contas = [];
      toastErro(e.message);
    }
    this._renderContas();
  },

  async carregarImportacoes() {
    const contaId = document.getElementById('impFiltroConta')?.value || '';
    try {
      const lista = await Api.get('/api/banco/importacoes', contaId ? { conta_id: contaId } : {});
      this._renderImportacoes(lista);
    } catch (e) { toastErro(e.message); }
  },

  _popularFiltros() {
    const sel = document.getElementById('impFiltroConta');
    if (!sel) return;
    const atual = sel.value;
    sel.innerHTML = '<option value="">Todas</option>' +
      this.contas.map(c => `<option value="${c.id}" ${String(c.id) === atual ? 'selected' : ''}>${escapar(c.nome)}</option>`).join('');
  },

  // ── Render contas ──────────────────────────────────────────
  _renderContas() {
    const lista = document.getElementById('bancoContasLista');
    const vazio = document.getElementById('bancoContasVazio');
    if (!lista) return;

    if (!this.contas.length) {
      lista.innerHTML = '';
      vazio?.classList.remove('oculto');
      return;
    }
    vazio?.classList.add('oculto');

    const tipoLabel = { corrente: 'Corrente', poupanca: 'Poupança', investimento: 'Investimento', caixa: 'Caixa físico' };

    lista.innerHTML = this.contas.map(c => `
      <div class="card card-p" style="opacity:${c.ativa ? 1 : 0.6}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
          <div>
            <div style="font-weight:700;font-size:15px">${escapar(c.nome)}</div>
            <div style="font-size:12px;color:var(--txt2);margin-top:3px">
              ${escapar(c.banco)}${c.agencia ? ' · Ag: ' + escapar(c.agencia) : ''}${c.conta ? ' · CC: ' + escapar(c.conta) : ''}
            </div>
            <div style="font-size:11.5px;color:var(--txt3);margin-top:2px">${tipoLabel[c.tipo] || c.tipo}${c.ativa ? '' : ' · Inativa'}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-ghost btn-sm" onclick="Banco.abrirEditar(${c.id})">✏️</button>
            <button class="btn btn-ghost btn-sm perigo" onclick="Banco.excluir(${c.id})">🗑️</button>
          </div>
        </div>
        <div style="display:flex;gap:16px;margin-top:14px;flex-wrap:wrap">
          <div style="text-align:center">
            <div style="font-size:11px;color:var(--txt3);text-transform:uppercase;letter-spacing:.06em">Importações</div>
            <div style="font-size:18px;font-weight:700">${c.qtd_importacoes}</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:11px;color:var(--txt3);text-transform:uppercase;letter-spacing:.06em">Pendentes</div>
            <div style="font-size:18px;font-weight:700;color:${c.pendentes ? 'var(--amarelo,#d97706)' : 'inherit'}">${c.pendentes}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn-ghost btn-sm" onclick="Banco.abrirImportar(${c.id})">⬆️ Importar OFX</button>
          <button class="btn btn-ghost btn-sm" onclick="Banco.irConciliar(${c.id})">🔗 Conciliar</button>
        </div>
      </div>`).join('');
  },

  // ── Render importações ─────────────────────────────────────
  _renderImportacoes(lista) {
    const tbody = document.getElementById('impCorpo');
    const total = document.getElementById('impTotal');
    if (!tbody) return;

    if (!lista.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="vazio">Nenhuma importação encontrada.</td></tr>';
      if (total) total.textContent = '0 importações';
      return;
    }

    tbody.innerHTML = lista.map(i => {
      const pct = i.total ? Math.round(((i.conciliados + i.descartados) / i.total) * 100) : 0;
      return `<tr>
        <td>${escapar(i.conta_nome || '—')}</td>
        <td style="font-family:var(--mono);font-size:12px">${escapar(i.nome_arquivo || '—')}</td>
        <td>${i.periodo_inicio ? fmtData(i.periodo_inicio) + ' a ' + fmtData(i.periodo_fim) : '—'}</td>
        <td>${fmtDataHora(i.importado_em)}</td>
        <td style="text-align:center">${i.total}</td>
        <td style="text-align:center;color:${i.pendentes ? 'var(--amarelo,#d97706)' : 'inherit'};font-weight:${i.pendentes ? 700 : 400}">${i.pendentes}</td>
        <td style="text-align:center">
          <span style="color:var(--verde,#16a34a);font-weight:600">${i.conciliados}</span>
          <span style="color:var(--txt3);font-size:11px"> · ${pct}%</span>
        </td>
        <td class="acoes">
          <button class="btn btn-ghost btn-sm" onclick="Banco.irConciliarImportacao(${i.id},${i.conta_id || 0})">🔗 Conciliar</button>
          <button class="btn btn-ghost btn-sm perigo" onclick="Banco.excluirImportacao(${i.id})">🗑️</button>
        </td>
      </tr>`;
    }).join('');

    if (total) total.textContent = `${lista.length} importação(ões)`;
  },

  // ── Conta — abrir modais ───────────────────────────────────
  abrirNova() {
    this.editId = null;
    document.getElementById('modalContaTitulo').textContent = 'Nova conta bancária';
    limparFormulario('formContaBancaria');
    document.querySelector('#formContaBancaria [data-campo="tipo"]').value = 'corrente';
    document.querySelector('#formContaBancaria [data-campo="ativa"]').checked = true;
    abrirModal('modalContaBancaria');
  },

  abrirEditar(id) {
    const c = this.contas.find(x => x.id === id);
    if (!c) return;
    this.editId = id;
    document.getElementById('modalContaTitulo').textContent = 'Editar conta bancária';
    preencherFormulario('formContaBancaria', c);
    abrirModal('modalContaBancaria');
  },

  async salvar() {
    const d = lerFormulario('formContaBancaria');
    if (!d.nome) return toastErro('Informe o nome da conta.');
    if (!d.banco) return toastErro('Informe o banco.');
    try {
      if (this.editId) {
        await Api.put(`/api/banco/contas/${this.editId}`, d);
        toast('Conta atualizada.');
      } else {
        await Api.post('/api/banco/contas', d);
        toast('Conta cadastrada.');
      }
      fecharModal('modalContaBancaria');
      await this.carregarContas();
      this._popularFiltros();
    } catch (e) { toastErro(e.message); }
  },

  async excluir(id) {
    const c = this.contas.find(x => x.id === id);
    if (!confirmar(`Excluir a conta "${c?.nome}"?`)) return;
    try {
      await Api.delete(`/api/banco/contas/${id}`);
      toast('Conta excluída.');
      await this.carregarContas();
    } catch (e) { toastErro(e.message); }
  },

  // ── Importar OFX ──────────────────────────────────────────
  abrirImportar(contaId = null) {
    const sel = document.getElementById('ofxContaId');
    sel.innerHTML = '<option value="">Selecione…</option>' +
      this.contas.filter(c => c.ativa).map(c =>
        `<option value="${c.id}" ${c.id === contaId ? 'selected' : ''}>${escapar(c.nome)} — ${escapar(c.banco)}</option>`
      ).join('');
    document.getElementById('ofxArquivo').value = '';
    document.getElementById('ofxPreview').classList.add('oculto');
    document.getElementById('ofxPreview').textContent = '';
    abrirModal('modalImportarOFX');
  },

  async importar() {
    const contaId = document.getElementById('ofxContaId').value;
    const arquivo = document.getElementById('ofxArquivo').files[0];
    if (!contaId) return toastErro('Selecione a conta bancária.');
    if (!arquivo) return toastErro('Selecione o arquivo OFX.');

    const btn = document.getElementById('btnImportarOFX');
    btn.disabled = true;
    btn.textContent = 'Processando…';

    try {
      const conteudo = await arquivo.text();
      const res = await Api.post('/api/banco/importar', {
        conta_id: Number(contaId),
        nome_arquivo: arquivo.name,
        conteudo,
      });
      fecharModal('modalImportarOFX');
      toast(`${res.importadas} transação(ões) importada(s)${res.duplicadas ? ' · ' + res.duplicadas + ' duplicata(s) ignorada(s)' : ''}.`);
      await this.carregarImportacoes();
      await this.carregarContas();
      // Vai direto para a conciliação
      this.irConciliarImportacao(res.id, Number(contaId));
    } catch (e) {
      toastErro(e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '⬆️ Importar';
    }
  },

  // ── Navegação para conciliação ─────────────────────────────
  irConciliar(contaId) {
    Conciliacao.abrirComConta(contaId);
    irPara('fin-conciliacao');
  },

  irConciliarImportacao(importacaoId, contaId) {
    Conciliacao.abrirComImportacao(importacaoId, contaId);
    irPara('fin-conciliacao');
  },

  // ── Excluir importação ─────────────────────────────────────
  async excluirImportacao(id) {
    if (!confirmar('Excluir esta importação e todas as transações? Os vínculos já criados serão removidos.')) return;
    try {
      await Api.delete(`/api/banco/importacoes/${id}`);
      toast('Importação excluída.');
      await this.carregarImportacoes();
      await this.carregarContas();
    } catch (e) { toastErro(e.message); }
  },
};

// ── Abas da página de contas ───────────────────────────────────
document.addEventListener('click', e => {
  const aba = e.target.closest('.aba[data-bancoaba]');
  if (!aba) return;
  const pai = aba.closest('.abas');
  pai.querySelectorAll('.aba').forEach(a => a.classList.remove('active'));
  aba.classList.add('active');
  const id = aba.dataset.bancoaba;
  document.querySelectorAll('[id^="bancoaba-"]').forEach(el => el.classList.remove('active'));
  document.getElementById('bancoaba-' + id)?.classList.add('active');
});

// ── Preview do arquivo antes de importar ──────────────────────
document.addEventListener('change', e => {
  if (e.target.id !== 'ofxArquivo') return;
  const f = e.target.files[0];
  const prev = document.getElementById('ofxPreview');
  if (!f) { prev.classList.add('oculto'); return; }
  prev.classList.remove('oculto');
  prev.textContent = `Arquivo: ${f.name} · ${(f.size / 1024).toFixed(1)} KB`;
});

Carregadores['fin-banco'] = () => Banco.carregar();

// ── Helpers ───────────────────────────────────────────────────
function fmtData(d) {
  if (!d) return '—';
  const [a, m, dia] = String(d).split('-');
  return `${dia}/${m}/${a}`;
}

function fmtDataHora(d) {
  if (!d) return '—';
  const [data, hora] = String(d).split(' ');
  const [a, m, dia] = (data || '').split('-');
  return `${dia}/${m}/${a} ${(hora || '').slice(0, 5)}`;
}

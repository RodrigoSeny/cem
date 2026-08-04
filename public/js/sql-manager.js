/* ══════════════════════════════════════════════════════════════
   CEM — SQL Manager (exclusivo do perfil Master)
   ══════════════════════════════════════════════════════════════ */

const SqlManager = {
  tabelas: [],

  carregar() {
    this.carregarTabelas();
    if (window.innerWidth <= 980) {
      document.getElementById('sqlLayout').style.gridTemplateColumns = '1fr';
    }
  },

  async carregarTabelas() {
    const alvo = document.getElementById('sqlTabelas');
    alvo.innerHTML = '<div class="vazio" style="padding:20px"><span class="spinner"></span></div>';

    try { this.tabelas = await Api.get('/api/sql/tabelas'); }
    catch (e) {
      alvo.innerHTML = `<div class="form-hint c-red" style="padding:12px">${escapar(e.message)}</div>`;
      return;
    }

    alvo.innerHTML = this.tabelas.map(t => t.protegida ? `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;opacity:.55">
        <span>🔒</span>
        <span style="flex:1;font-size:12.5px;font-family:var(--mono)">${escapar(t.nome)}</span>
        <span class="badge badge-cinza">protegida</span>
      </div>` : `
      <div class="atalhos-menu-item" onclick="SqlManager.verDados('${escapar(t.nome)}')" title="Ver os dados">
        <span>📋</span>
        <span style="flex:1;font-family:var(--mono);font-size:12.5px">${escapar(t.nome)}</span>
        <span class="c-txt3" style="font-size:11px">${t.registros}</span>
        <button class="btn-ico" style="width:24px;height:24px;font-size:12px"
                onclick="event.stopPropagation();SqlManager.verEstrutura('${escapar(t.nome)}')"
                title="Ver a estrutura">🔧</button>
      </div>`).join('');
  },

  limpar() {
    document.getElementById('sqlConsulta').value = '';
    document.getElementById('sqlResultado').innerHTML = '';
  },

  verDados(tabela) {
    document.getElementById('sqlConsulta').value = `SELECT * FROM ${tabela} LIMIT 100`;
    this.executar();
  },

  async verEstrutura(tabela) {
    let d;
    try { d = await Api.get('/api/sql/schema/' + tabela); }
    catch (e) { return toastErro(e.message); }

    document.getElementById('sqlResultado').innerHTML = `
      <div class="card">
        <div class="card-head">Estrutura de <span class="mono">${escapar(d.tabela)}</span></div>
        <div class="card-p">
          <div class="tabela-scroll"><table class="tabela">
            <thead><tr><th>Coluna</th><th>Tipo</th><th>Obrigatória</th><th>Padrão</th><th>Chave</th></tr></thead>
            <tbody>
              ${d.colunas.map(c => `
                <tr>
                  <td class="mono" style="font-weight:600">${escapar(c.nome)}</td>
                  <td class="c-txt2">${escapar(c.tipo || '—')}</td>
                  <td>${c.obrigatoria ? '<span class="badge badge-gold">sim</span>' : '<span class="c-txt3">não</span>'}</td>
                  <td class="c-txt2" style="font-size:12px">${escapar(c.padrao || '—')}</td>
                  <td>${c.chave ? '🔑' : ''}</td>
                </tr>`).join('')}
            </tbody>
          </table></div>
          ${d.ddl ? `<div class="secao-titulo">DDL</div>
            <pre style="font-family:var(--mono);font-size:11.5px;color:var(--txt2);white-space:pre-wrap;line-height:1.5">${escapar(d.ddl)}</pre>` : ''}
        </div>
      </div>`;
  },

  async executar(confirmar = false) {
    const sql = document.getElementById('sqlConsulta').value.trim();
    if (!sql) return toast('Escreva a consulta.', 'aviso');

    const alvo = document.getElementById('sqlResultado');
    alvo.innerHTML = '<div class="vazio"><span class="spinner"></span></div>';

    let d;
    try {
      d = await Api.post('/api/sql/executar', { sql, confirmar });
    } catch (e) {
      // 428: comando de escrita aguardando confirmação
      if (/Confirme para executar/i.test(e.message)) {
        alvo.innerHTML = '';
        const ok = await confirmar_(sql);
        if (ok) return this.executar(true);
        return;
      }
      alvo.innerHTML = `
        <div class="card card-p" style="border-color:rgba(255,94,94,.4)">
          <div style="font-weight:700;color:var(--red);margin-bottom:6px">Erro na consulta</div>
          <div class="mono" style="font-size:12.5px;color:var(--txt2);white-space:pre-wrap">${escapar(e.message)}</div>
        </div>`;
      return;
    }

    if (d.tipo === 'escrita') {
      alvo.innerHTML = `
        <div class="card card-p" style="border-color:rgba(47,212,143,.4)">
          <div style="font-weight:700;color:var(--green);margin-bottom:6px">${escapar(d.comando)} executado</div>
          <div style="font-size:13px;color:var(--txt2)">
            ${d.alteradas} linha(s) alterada(s) · ${d.ms} ms
            ${d.ultimo_id ? ` · último id: ${d.ultimo_id}` : ''}
          </div>
        </div>`;
      this.carregarTabelas();
      return;
    }

    if (!d.total) {
      alvo.innerHTML = `<div class="card"><div class="card-p"><div class="vazio">
        <span class="ico">🔍</span><div class="titulo">Nenhum registro</div>
        <div class="sub">A consulta rodou em ${d.ms} ms e não retornou linhas.</div></div></div></div>`;
      return;
    }

    alvo.innerHTML = `
      <div class="tabela-wrap">
        <div class="tabela-scroll" style="max-height:58vh">
          <table class="tabela">
            <thead><tr>${d.colunas.map(c => `<th>${escapar(c)}</th>`).join('')}</tr></thead>
            <tbody>
              ${d.linhas.map(l => `<tr>${d.colunas.map(c => {
                const v = l[c];
                if (v === null || v === undefined) return '<td class="c-txt3">null</td>';
                const s = String(v);
                return `<td class="mono" style="font-size:12px;max-width:320px;overflow:hidden;text-overflow:ellipsis"
                          title="${escapar(s)}">${escapar(s.length > 120 ? s.slice(0, 120) + '…' : s)}</td>`;
              }).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="tabela-rodape">
          <span>${d.total} registro(s) · ${d.ms} ms</span>
          <button class="btn btn-ghost btn-sm" onclick="SqlManager.exportarCsv()">⬇️ CSV</button>
        </div>
      </div>`;

    this._ultimo = d;
  },

  /** Exporta o resultado da última consulta. */
  exportarCsv() {
    const d = this._ultimo;
    if (!d || !d.linhas?.length) return;

    const escapaCsv = v => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const csv = [
      d.colunas.join(';'),
      ...d.linhas.map(l => d.colunas.map(c => escapaCsv(l[c])).join(';')),
    ].join('\r\n');

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `consulta-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  },
};

/** Confirmação específica de comando que altera dados. */
function confirmar_(sql) {
  return confirmar(
    `Este comando ALTERA o banco e não tem desfazer:\n\n${sql.slice(0, 300)}\n\nTem backup recente?`,
    { titulo: 'Confirmar alteração no banco', textoOk: 'Executar mesmo assim' }
  );
}

Carregadores['sql-manager'] = () => SqlManager.carregar();

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sqlConsulta')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); SqlManager.executar(); }
  });
});

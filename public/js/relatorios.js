/* ══════════════════════════════════════════════════════════════
   CEM — Relatórios
   Abre uma janela de impressão com o timbre da escola (logotipo,
   nome, CNPJ e endereço) e a tabela de dados solicitada.
   ══════════════════════════════════════════════════════════════ */

const Relatorios = {
  escola: null,

  // ── Catálogo exibido na página de Relatórios ───────────────
  CATALOGO: [
    { id: 'alunos',       ico: '🎓', titulo: 'Relação de alunos',     desc: 'Lista completa com turma, idade e responsável principal.' },
    { id: 'turma',        ico: '🏫', titulo: 'Alunos por turma',      desc: 'Diário de classe: alunos matriculados em cada turma.' },
    { id: 'contatos',     ico: '📇', titulo: 'Agenda de contatos',    desc: 'Telefones e e-mails dos responsáveis por aluno.' },
    { id: 'medica',       ico: '🩺', titulo: 'Ficha médica da turma', desc: 'Alergias, medicamentos e restrições — uso pedagógico.' },
    { id: 'funcionarios', ico: '👔', titulo: 'Quadro de funcionários', desc: 'Equipe por setor, com cargo, admissão e contato.' },
    { id: 'turmas',       ico: '📋', titulo: 'Mapa de turmas',        desc: 'Turmas do ano com professor, sala e ocupação.' },
  ],

  render() {
    document.getElementById('relatoriosLista').innerHTML = this.CATALOGO.map(r => `
      <div class="stat-card clicavel" onclick="Relatorios.abrir('${r.id}')">
        <div style="font-size:26px;margin-bottom:11px">${r.ico}</div>
        <div style="font-size:14.5px;font-weight:700;margin-bottom:5px">${escapar(r.titulo)}</div>
        <div style="font-size:12.5px;color:var(--txt2);line-height:1.5">${escapar(r.desc)}</div>
        <div class="mt-4"><span class="btn btn-ghost btn-sm">🖨️ Gerar</span></div>
      </div>`).join('');
  },

  abrir(id) {
    const turmas = Cache.turmas;
    switch (id) {
      case 'alunos':       return this.imprimirListaAlunos({ situacao: 'matriculado' });
      case 'funcionarios': return this.imprimirFuncionarios();
      case 'contatos':     return this.imprimirContatos();
      case 'turmas':       return this.imprimirMapaTurmas();
      case 'turma':
        return this.escolherTurma('Alunos por turma', turmaId => this.imprimirListaAlunos({ turma_id: turmaId }));
      case 'medica':
        return this.escolherTurma('Ficha médica da turma', turmaId => this.imprimirFichaMedica(turmaId));
    }
  },

  /** Pequeno seletor de turma antes de gerar o relatório. */
  escolherTurma(titulo, aoConfirmar) {
    const el = document.createElement('div');
    el.className = 'modal-overlay aberto';
    el.innerHTML = `
      <div class="modal" style="max-width:430px">
        <div class="modal-head"><h3>${escapar(titulo)}</h3></div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Turma</label>
            <select class="form-select" id="_selTurmaRel">
              <option value="">Todas as turmas</option>
              ${Cache.turmas.map(t => `<option value="${t.id}">${escapar(t.nome)} · ${TURNOS[t.turno] || t.turno}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" data-acao="cancelar">Cancelar</button>
          <button class="btn btn-primary" data-acao="ok">🖨️ Gerar</button>
        </div>
      </div>`;
    document.body.appendChild(el);

    el.querySelector('[data-acao=cancelar]').onclick = () => el.remove();
    el.onclick = e => { if (e.target === el) el.remove(); };
    el.querySelector('[data-acao=ok]').onclick = () => {
      const v = el.querySelector('#_selTurmaRel').value;
      el.remove();
      aoConfirmar(v ? Number(v) : null);
    };
  },

  // ── Timbre e estrutura do documento ────────────────────────
  async carregarEscola() {
    if (this.escola) return this.escola;
    try { this.escola = await Api.get('/api/escola'); }
    catch { this.escola = { nome_fantasia: 'Centro Educacional Milezi', logo_url: '/img/LogoMilezi.jpg' }; }
    return this.escola;
  },

  cabecalho(e, titulo, subtitulo) {
    const endereco = [e.logradouro, e.numero, e.bairro, e.cidade, e.estado].filter(Boolean).join(', ');
    const contatos = [
      e.telefone ? `Tel.: ${telefoneBR(e.telefone)}` : null,
      e.email || null,
    ].filter(Boolean).join(' · ');

    return `
      <header class="timbre">
        <img src="${escapar(e.logo_url || '/img/LogoMilezi.jpg')}" alt="Logotipo da escola">
        <div class="timbre-txt">
          <h1>${escapar(e.nome_fantasia || 'Centro Educacional Milezi')}</h1>
          ${e.cnpj ? `<div class="linha">CNPJ ${escapar(e.cnpj)}${e.inep ? ` · INEP ${escapar(e.inep)}` : ''}</div>` : ''}
          ${endereco ? `<div class="linha">${escapar(endereco)}</div>` : ''}
          ${contatos ? `<div class="linha">${escapar(contatos)}</div>` : ''}
        </div>
      </header>
      <div class="doc-titulo">
        <h2>${escapar(titulo)}</h2>
        ${subtitulo ? `<p>${escapar(subtitulo)}</p>` : ''}
      </div>`;
  },

  ESTILO: `
    @page { size: A4; margin: 12mm 10mm 16mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      color: #1A1A1A; font-size: 11px; margin: 0; padding: 16px;
      background: #fff;
    }
    .timbre {
      display: flex; align-items: center; gap: 16px;
      padding-bottom: 12px; border-bottom: 3px solid #F2B705;
    }
    .timbre img { width: 74px; height: 74px; object-fit: contain; }
    .timbre-txt h1 { font-size: 17px; margin: 0 0 3px; letter-spacing: .01em; }
    .timbre-txt .linha { font-size: 10px; color: #555; line-height: 1.45; }
    .doc-titulo { margin: 16px 0 12px; }
    .doc-titulo h2 {
      font-size: 13.5px; margin: 0; text-transform: uppercase; letter-spacing: .07em;
      border-left: 4px solid #F2B705; padding-left: 9px;
    }
    .doc-titulo p { font-size: 10.5px; color: #666; margin: 4px 0 0 13px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    thead th {
      background: #FDF3D3; border-bottom: 1.5px solid #F2B705;
      padding: 6px 7px; text-align: left; font-size: 9.5px;
      text-transform: uppercase; letter-spacing: .05em; color: #4A3B00;
    }
    tbody td { padding: 5.5px 7px; border-bottom: .5px solid #E2E2E2; font-size: 10.5px; vertical-align: top; }
    tbody tr:nth-child(even) { background: #FAFAFA; }
    .ficha-secao {
      margin: 16px 0 7px; font-size: 10.5px; font-weight: 700;
      text-transform: uppercase; letter-spacing: .09em; color: #8A6A00;
      border-bottom: 1px solid #F0D98A; padding-bottom: 3px;
    }
    .ficha-linha { display: flex; gap: 10px; padding: 3.5px 0; font-size: 10.5px; }
    .ficha-linha .rotulo { min-width: 165px; color: #666; }
    .ficha-linha .valor { flex: 1; font-weight: 500; }
    .assinaturas { margin-top: 46px; display: flex; gap: 40px; }
    .assinaturas div { flex: 1; border-top: 1px solid #333; padding-top: 5px; text-align: center; font-size: 9.5px; color: #555; }
    footer {
      margin-top: 22px; padding-top: 7px; border-top: 1px solid #DDD;
      display: flex; justify-content: space-between; font-size: 8.5px; color: #888;
    }
    .vazio-doc { padding: 30px; text-align: center; color: #888; font-size: 11px; }
    @media print { body { padding: 0; } .nao-imprimir { display: none; } }
  `,

  /** Monta o HTML, abre em nova janela e dispara a impressão. */
  publicar(titulo, corpoHtml, subtitulo, e) {
    const agora = new Date().toLocaleString('pt-BR');
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
      <title>${escapar(titulo)} — ${escapar(e.nome_fantasia || 'CEM')}</title>
      <style>${this.ESTILO}</style></head><body>
      ${this.cabecalho(e, titulo, subtitulo)}
      ${corpoHtml}
      <footer><span>Emitido por ${escapar(USUARIO.nome)}</span><span>${agora}</span></footer>
      <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 350); };<\/script>
      </body></html>`;

    const janela = window.open('', '_blank', 'width=1000,height=760');
    if (!janela) return toastErro('Permita janelas pop-up para gerar o relatório.');
    janela.document.write(html);
    janela.document.close();
  },

  tabela(colunas, linhas) {
    if (!linhas.length) return '<div class="vazio-doc">Nenhum registro encontrado para os filtros selecionados.</div>';
    return `
      <table>
        <thead><tr>${colunas.map(c => `<th>${escapar(c)}</th>`).join('')}</tr></thead>
        <tbody>${linhas.map(l => `<tr>${l.map(c => `<td>${c === null || c === undefined || c === '' ? '—' : escapar(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`;
  },

  // ── Relatórios ─────────────────────────────────────────────
  async imprimirListaAlunos(filtros = {}) {
    const e = await this.carregarEscola();
    let dados;
    try { dados = await Api.get('/api/relatorios/alunos', filtros); }
    catch (err) { return toastErro(err.message); }

    const turma = filtros.turma_id ? Cache.turmas.find(t => t.id === Number(filtros.turma_id)) : null;
    const sub = [
      turma ? `Turma: ${turma.nome}` : 'Todas as turmas',
      filtros.situacao ? `Situação: ${SITUACOES[filtros.situacao]?.rotulo || filtros.situacao}` : null,
      `${dados.length} aluno(s)`,
    ].filter(Boolean).join(' · ');

    const corpo = this.tabela(
      ['#', 'Matrícula', 'Aluno', 'Nasc.', 'Idade', 'Turma', 'Turno', 'Responsável', 'Contato', 'Situação'],
      dados.map((a, i) => [
        i + 1, a.matricula, a.nome, dataBR(a.data_nascimento),
        a.idade != null ? a.idade : '',
        a.turma_nome, TURNOS[a.turno] || a.turno,
        a.responsavel_nome, telefoneBR(a.responsavel_contato),
        SITUACOES[a.situacao]?.rotulo || a.situacao,
      ])
    );

    this.publicar('Relação de Alunos', corpo, sub, e);
  },

  async imprimirFichaAluno(id) {
    const e = await this.carregarEscola();
    let a;
    try { a = await Api.get('/api/relatorios/ficha-aluno/' + id); }
    catch (err) { return toastErro(err.message); }

    const li = (rotulo, valor) => `
      <div class="ficha-linha"><span class="rotulo">${rotulo}</span><span class="valor">${escapar(valor || '—')}</span></div>`;

    const endereco = [a.logradouro, a.numero, a.complemento, a.bairro, a.cidade, a.estado]
      .filter(Boolean).join(', ');

    const autorizacoes = [
      a.autoriza_imagem ? 'uso de imagem' : null,
      a.autoriza_medicamento ? 'administrar medicamentos' : null,
      a.autoriza_passeio ? 'passeios e saídas' : null,
    ].filter(Boolean).join(', ') || 'nenhuma autorização registrada';

    const corpo = `
      <div class="ficha-secao">Identificação</div>
      ${li('Nome completo', a.nome)}
      ${li('Nome social', a.nome_social)}
      ${li('Matrícula', a.matricula)}
      ${li('Data de nascimento', `${dataBR(a.data_nascimento)}${a.idade != null ? ` (${a.idade} anos)` : ''}`)}
      ${li('Sexo', { F: 'Feminino', M: 'Masculino', O: 'Outro' }[a.sexo] || '')}
      ${li('CPF', a.cpf ? cpfBR(a.cpf) : '')}
      ${li('RG', a.rg)}
      ${li('Certidão de nascimento', a.certidao_nascimento)}
      ${li('NIS', a.nis)}
      ${li('Naturalidade', [a.naturalidade, a.uf_nascimento].filter(Boolean).join(' / '))}
      ${li('Nacionalidade', a.nacionalidade)}
      ${li('Cor / raça', a.cor_raca)}

      <div class="ficha-secao">Endereço</div>
      ${li('Logradouro', endereco)}
      ${li('CEP', a.cep ? cepBR(a.cep) : '')}

      <div class="ficha-secao">Vida escolar</div>
      ${li('Turma', a.turma_nome)}
      ${li('Turno', TURNOS[a.turma_turno || a.turno] || '')}
      ${li('Sala', a.turma_sala)}
      ${li('Professor(a)', a.professor_nome)}
      ${li('Ano letivo', a.ano_letivo)}
      ${li('Situação', SITUACOES[a.situacao]?.rotulo || a.situacao)}
      ${li('Data da matrícula', dataBR(a.data_matricula))}
      ${li('Escola anterior', a.escola_anterior)}

      <div class="ficha-secao">Saúde</div>
      ${li('Tipo sanguíneo', a.tipo_sanguineo)}
      ${li('Alergias', a.alergias)}
      ${li('Medicamentos de uso contínuo', a.medicamentos)}
      ${li('Restrições alimentares', a.restricoes_alimentares)}
      ${li('Necessidades especiais', a.necessidades_especiais)}
      ${li('Laudo / CID', a.laudo)}
      ${li('Plano de saúde', a.plano_saude)}
      ${li('Médico de referência', a.medico_referencia)}
      ${li('Contato de emergência', [a.contato_emergencia, a.telefone_emergencia ? telefoneBR(a.telefone_emergencia) : null].filter(Boolean).join(' · '))}
      ${li('Autorizações', autorizacoes)}

      <div class="ficha-secao">Responsáveis</div>
      ${(a.responsaveis || []).length ? this.tabela(
        ['Nome', 'Parentesco', 'Vínculo', 'CPF', 'Telefone', 'E-mail', 'Retira'],
        a.responsaveis.map(r => [
          `${r.nome}${r.principal ? ' (principal)' : ''}`,
          r.parentesco,
          { ambos: 'Financeiro e pedagógico', financeiro: 'Financeiro', pedagogico: 'Pedagógico' }[r.tipo_vinculo] || r.tipo_vinculo,
          r.cpf ? cpfBR(r.cpf) : '',
          telefoneBR(r.whatsapp || r.telefone),
          r.email,
          r.autorizado_retirar ? 'Sim' : 'Não',
        ])
      ) : '<div class="vazio-doc">Nenhum responsável vinculado.</div>'}

      ${a.observacoes ? `<div class="ficha-secao">Observações</div><div style="font-size:10.5px;line-height:1.6">${escapar(a.observacoes)}</div>` : ''}

      <div class="assinaturas">
        <div>Responsável legal</div>
        <div>Secretaria escolar</div>
      </div>`;

    this.publicar('Ficha de Matrícula do Aluno', corpo, a.nome, e);
  },

  async imprimirContatos(turmaId = null) {
    const e = await this.carregarEscola();
    let dados;
    try { dados = await Api.get('/api/relatorios/responsaveis', turmaId ? { turma_id: turmaId } : {}); }
    catch (err) { return toastErro(err.message); }

    const corpo = this.tabela(
      ['Aluno', 'Turma', 'Responsável', 'Parentesco', 'Telefone', 'WhatsApp', 'E-mail', 'Retira'],
      dados.map(r => [
        r.aluno_nome, r.turma_nome,
        `${r.responsavel_nome}${r.principal ? ' (principal)' : ''}`,
        r.parentesco,
        telefoneBR(r.telefone), telefoneBR(r.whatsapp), r.email,
        r.autorizado_retirar ? 'Sim' : 'Não',
      ])
    );

    this.publicar('Agenda de Contatos dos Responsáveis', corpo, `${dados.length} vínculo(s)`, e);
  },

  async imprimirFichaMedica(turmaId = null) {
    const e = await this.carregarEscola();
    let dados;
    try { dados = await Api.get('/api/relatorios/ficha-medica', turmaId ? { turma_id: turmaId } : {}); }
    catch (err) { return toastErro(err.message); }

    const turma = turmaId ? Cache.turmas.find(t => t.id === Number(turmaId)) : null;
    const corpo = this.tabela(
      ['Aluno', 'Turma', 'Nasc.', 'Sangue', 'Alergias', 'Medicamentos', 'Restrições alimentares', 'Necessidades especiais', 'Emergência'],
      dados.map(a => [
        a.nome, a.turma_nome, dataBR(a.data_nascimento), a.tipo_sanguineo,
        a.alergias, a.medicamentos, a.restricoes_alimentares, a.necessidades_especiais,
        [a.contato_emergencia, a.telefone_emergencia ? telefoneBR(a.telefone_emergencia) : null].filter(Boolean).join(' · '),
      ])
    );

    this.publicar('Ficha Médica — Uso Pedagógico', corpo,
      `${turma ? turma.nome + ' · ' : ''}${dados.length} aluno(s) · documento confidencial`, e);
  },

  async imprimirFuncionarios() {
    const e = await this.carregarEscola();
    let dados;
    try { dados = await Api.get('/api/relatorios/funcionarios', { ativo: 1 }); }
    catch (err) { return toastErro(err.message); }

    const contratos = { clt: 'CLT', pj: 'PJ', estagio: 'Estágio', temporario: 'Temporário', autonomo: 'Autônomo' };
    const corpo = this.tabela(
      ['#', 'Matrícula', 'Nome', 'Cargo', 'Setor', 'Contrato', 'Admissão', 'Turno', 'Telefone', 'E-mail'],
      dados.map((f, i) => [
        i + 1, f.matricula, f.nome, f.cargo, f.setor,
        contratos[f.tipo_contrato] || f.tipo_contrato,
        dataBR(f.data_admissao), TURNOS[f.turno] || f.turno,
        telefoneBR(f.whatsapp || f.telefone), f.email,
      ])
    );

    this.publicar('Quadro de Funcionários', corpo, `${dados.length} funcionário(s) ativo(s)`, e);
  },

  async imprimirMapaTurmas() {
    const e = await this.carregarEscola();
    const ano = document.getElementById('turmasAno')?.value || new Date().getFullYear();
    let dados;
    try { dados = await Api.get('/api/relatorios/turmas', { ano_letivo: ano }); }
    catch (err) { return toastErro(err.message); }

    const corpo = this.tabela(
      ['Turma', 'Etapa', 'Série', 'Turno', 'Sala', 'Professor(a)', 'Auxiliar', 'Matriculados', 'Capacidade'],
      dados.map(t => [
        t.nome, t.etapa, t.serie, TURNOS[t.turno] || t.turno, t.sala,
        t.professor_nome, t.auxiliar_nome, t.qtd_alunos, t.capacidade,
      ])
    );

    const total = dados.reduce((s, t) => s + t.qtd_alunos, 0);
    this.publicar('Mapa de Turmas', corpo, `Ano letivo ${ano} · ${dados.length} turma(s) · ${total} aluno(s)`, e);
  },
};

Carregadores.relatorios = () => Relatorios.render();

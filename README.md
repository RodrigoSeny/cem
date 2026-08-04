# CEM — Centro Educacional Milezi

ERP escolar em **Node.js + SQLite**, com sistema web para a equipe e **PWA** para
funcionários e responsáveis. O layout segue o padrão dos sistemas SuperPet e
CicleSystem (menu lateral com submenus, guia de atalhos fixáveis, modais de
cadastro), com a paleta derivada do logotipo da escola.

---

## Como rodar

```bash
npm install
npm start
```

Ou dê um duplo clique em `iniciar.bat` (instala as dependências, cria o `.env` e
abre o navegador automaticamente).

| Endereço | O que é |
|---|---|
| `http://localhost:3300/` | Tela de login (com o logotipo da escola) |
| `http://localhost:3300/sistema` | Sistema completo — equipe |
| `http://localhost:3300/app` | Aplicativo (PWA) — responsáveis e funcionários |

### Primeiro acesso

O `seed` roda sozinho na subida do servidor e cria o usuário master:

- **login:** `master`
- **senha:** `cem@2026`

Troque a senha no primeiro acesso (ícone 🔑 ao lado do nome, no rodapé do menu).
Os valores vêm de `MASTER_LOGIN` / `MASTER_SENHA` no `.env`.

> **Antes de publicar:** troque o `JWT_SECRET` no `.env` por um valor aleatório e
> altere a senha do master. O `.env` não vai para o Git.

---

## Estrutura

```
CEM/
├── server.js                 Servidor Express: segurança, rotas e estáticos
├── src/
│   ├── db.js                 Conexão SQLite + schema + auditoria
│   ├── auth.js               JWT, catálogo de páginas e controle de acesso
│   ├── seed.js               Escola, perfis padrão e usuário master
│   ├── util.js               Helpers de rota (filtros, INSERT/UPDATE, erros)
│   └── routes/               auth · alunos · responsáveis · funcionários ·
│                             turmas · dashboard · relatórios · portal ·
│                             usuários/perfis · escola
├── public/
│   ├── login.html            Login com o logotipo
│   ├── index.html            Sistema (menu + guia de atalhos + páginas)
│   ├── portal.html           PWA
│   ├── manifest.json  sw.js  Instalação e cache do app
│   ├── css/                  global.css (paleta) · main.css (componentes)
│   └── js/                   core · app · dashboard · alunos · responsaveis ·
│                             funcionarios · turmas · usuarios ·
│                             configuracoes · relatorios · portal
├── img/                      LogoMilezi.jpg · icone-cem.svg
└── dados/cem.db              Banco SQLite (criado na primeira execução)
```

---

## Paleta (do logotipo)

| Cor | Hex | Uso |
|---|---|---|
| Amarelo-lápis | `#F2B705` | Marca, destaques, botões primários |
| Amarelo claro | `#FFCE3D` | Gradientes e estados de foco |
| Grafite | `#0E1014` → `#1A1E27` | Fundos (tema escuro) |
| Borracha | `#F2A6A6` | Acento secundário |
| Madeira | `#F0C878` | Acento secundário |

Tema claro incluído — alterna pelo ícone 🌗 na barra de atalhos.

---

## Módulos

**Cadastros** — Alunos (ficha em 5 abas: dados pessoais, responsáveis, vida
escolar, endereço, saúde e documentos), Responsáveis, Funcionários e Turmas.

Detalhes do cadastro de aluno:
- **CEP** com busca automática (ViaCEP) em todos os endereços do sistema.
- **Endereço do responsável**: botão que copia logradouro, número, bairro,
  cidade, UF e CEP de um dos responsáveis vinculados.
- **Responsáveis** é a 2ª aba: vincula quem já existe ou abre o cadastro
  completo e volta vinculando. Depois de vinculado, há botões para editar o
  vínculo (parentesco, tipo, principal, autorização de retirada) e para abrir o
  cadastro do responsável. Parentesco é lista suspensa — sem digitação livre.
- **Naturalidade**: com nacionalidade "Brasileira", a cidade é autocompletada e
  a UF preenchida sozinha; "Estrangeira" libera cidade e UF.
- **Documentos**: anexo de carteirinha do plano, caderneta de vacinação,
  atestados, laudos e autorizações (imagem ou PDF, até 12 MB).

**Ocorrências** — histórico do aluno: faltas relevantes, atrasos, acidentes,
incidentes, saúde, comportamento, elogios e reuniões. Cada registro tem
gravidade, providências, anexos (fotos e documentos) e um interruptor de
**compartilhar com os responsáveis** — o que é interno não aparece no app.

**Mensagens** — comunicados enviados ao app dos pais, para todos, por turma ou
por aluno. Podem **exigir ciência**: o responsável toca em "Estou ciente" e o
sistema grava data e hora. A escola acompanha quem leu e quem confirmou.

**Financeiro** — planos de pagamento, contrato do aluno no ano letivo (com
desconto e bolsa), geração das parcelas, baixa total, parcial ou **em lote**,
estorno, extrato por aluno e painel de inadimplência com cobrança pelo WhatsApp.

**Cobranças variáveis** — taxas, eventos e serviços cobrados além da
mensalidade. Na criação escolhe-se:

- **alcance**: todos os alunos, uma turma, um turno ou individual;
- **periodicidade**: única, mensal, bimestral, trimestral, semestral ou anual,
  com número de repetições;
- **modo**: *somar na mensalidade* (entra no documento único do mês) ou
  *cobrança extra* (gera documento à parte, com vencimento próprio).

Antes de salvar, a tela mostra quantos alunos serão alcançados e o total
previsto. Depois de lançada, valor e alcance ficam travados — o histórico não
pode mudar debaixo de um recebimento já feito.

**Movimento mensal** — o gerador varre a competência, soma a mensalidade base
com as cobranças do mês de cada aluno e monta o documento único discriminado.
No exemplo: mensalidade R$ 800 + hora extra R$ 100 + material R$ 250 + festa
R$ 50 = **R$ 1.200 num documento só**, com cada linha apontando seu centro de
custo. A prévia não grava nada; só o botão *Gerar* efetiva.

**Planilha de cobrança** — enquanto o boleto sai pelo banco, esta é a lista de
trabalho: responsável financeiro, CPF, contato, endereço, alunos, detalhamento
e valor. Sai em CSV e em papel timbrado. A estrutura já é a de uma remessa —
quando virar arquivo bancário (CNAB), é daqui que os dados saem.

**Despesas e centros de custo** — todo lançamento, de receita ou de despesa,
carrega um centro de custo. É o que responde *"a Festa da Criança arrecadou
quanto, custou quanto, e quantos boletos ainda faltam entrar"*. Cada centro tem
orçamento previsto, receita prevista/recebida, despesas lançadas/pagas, saldo e
uma prestação de contas impressa com o timbre da escola. As despesas aceitam
anexo da nota fiscal.

**Painel** — matrículas, ocupação das turmas, aniversariantes do mês, últimas
matrículas, alertas de saúde e pendências de cadastro.

**Relatórios** (todos com o timbre e o logotipo da escola):
relação de alunos · alunos por turma · ficha de matrícula · agenda de contatos ·
ficha médica da turma · quadro de funcionários · mapa de turmas.

**Acessos** — usuários e perfis. Perfis padrão: Master, Direção, Secretaria,
Coordenação, Professor e Responsável. Cada perfil libera um conjunto de páginas,
validado no servidor e refletido no menu.

**SQL Manager** — acesso direto ao banco para suporte, no modelo do SuperPet:
lista de tabelas com contagem, estrutura e DDL, consultas livres e exportação
CSV. Exclusivo do Master. Mesmo para ele, as tabelas `usuarios` e `perfis` são
bloqueadas (evita ler hash de senha ou virar Master por `UPDATE`), comandos de
escrita exigem confirmação e toda execução vai para a auditoria.

## Controle de acesso

### O perfil Master é invisível para os demais

Quem não é Master não enxerga usuários Master na listagem, não vê o perfil
Master em Perfis de Acesso, não o encontra no seletor ao criar um acesso e não
consegue criar, editar, excluir nem redefinir a senha de um Master — inclusive
pela API. Nem a Direção. Também não é possível se autopromover a Master.

Duas travas adicionais: o sistema nunca fica sem Master ativo (desativar,
rebaixar ou excluir o último é recusado) e ninguém exclui o próprio acesso.

### Toda tela nova nasce restrita ao Master

O catálogo de páginas fica em `src/auth.js`, na constante `PAGINAS` — é a fonte
única de verdade. Ao acrescentar uma entrada ali:

1. na subida do servidor, o seed **libera a página para o Master
   automaticamente** e registra no log quais chegaram;
2. os demais perfis **não recebem nada**. A liberação para secretaria,
   coordenação etc. é decisão consciente, feita em *Sistema → Perfis de Acesso*;
3. marcar `master: true` na página a torna exclusiva do Master — ela nem aparece
   na montagem de perfis, e é removida de qualquer perfil que a tivesse.

O seed **não** sobrescreve as páginas de perfis já existentes: o que você ajustar
na tela permanece depois de cada deploy.

Para uma tela nova, o roteiro é: entrada em `PAGINAS`, prefixo da rota em
`ROTA_PAGINAS` (mesmo arquivo), item no menu com `data-pagina`, entrada em
`PAGINAS_APP` (`public/js/app.js`) e o `Carregadores['id']` do módulo.

---

## Aplicativo (PWA)

Um único app que se adapta a quem entrou:

- **Responsável** — vê apenas os filhos vinculados ao seu cadastro: turma,
  professor, ficha de saúde, autorizações, contatos, **mensalidades**,
  **ocorrências compartilhadas** (com os anexos) e a **caixa de mensagens**.
  Não acessa o sistema.
- **Funcionário** — consulta rápida de alunos, suas turmas e contatos dos
  responsáveis, respeitando as páginas do perfil.

**Mensagens não lidas** aparecem como selo vermelho na barra inferior; quando há
comunicado aguardando ciência, o selo fica dourado e um aviso surge na tela
inicial. Abrir a caixa marca as mensagens como lidas; a ciência é um toque.

Instalável pelo botão "Instalar" (ou "Adicionar à tela inicial"). O service
worker guarda só o shell do app — dados escolares vêm sempre da rede.

> A instalação como app exige **HTTPS**. Em rede local (http://IP:3300) o
> sistema funciona no navegador, mas o botão "Instalar" não aparece.

---

## Segurança

- Senhas com `bcrypt`; sessão por **JWT** (12 h, configurável em `JWT_EXPIRES`).
- Bloqueio temporário após 5 tentativas de login erradas.
- Autorização por página validada **no servidor**, não só no menu.
- Responsável fica restrito a `/api/portal/**` e apenas aos próprios filhos.
- `helmet`, `rate limit` no login e auditoria das ações na tabela `logs`.

---

## Cache

Arquivos estáticos são servidos com `max-age=0` + ETag: o navegador revalida a
cada carga e recebe `304` quando nada mudou. Ao publicar uma versão nova do PWA,
incremente `CACHE` em `public/sw.js` (`cem-app-v2` → `v3`) para que os
aparelhos já instalados descartem o cache antigo.

---

## Publicação na VPS

A VPS puxa do GitHub; quem roda os scripts é você, no servidor.

Primeira instalação:

```bash
bash deploy.sh
```

Atualizações (depois de cada `git push`):

```bash
bash /var/www/cem/update.sh
```

O app roda em `/var/www/cem` na porta **3300** sob PM2 (nome `cem`), ao lado do
SuperPet (3001) e do CicleSystem. Configure o Nginx com domínio e certificado —
sem HTTPS o PWA não instala.

Pastas que **não** vão para o Git e precisam existir no servidor:
`dados/` (banco SQLite) e `uploads/` (documentos anexados). O `deploy.sh` cria
as duas.

### Domínio e HTTPS

```bash
bash /var/www/cem/nginx-setup.sh cem.seudominio.com.br
```

O script confere se o DNS já aponta para a VPS, instala Nginx e Certbot se
faltarem, cria o proxy reverso para a porta 3300 e emite o certificado.

Dois detalhes que o proxy resolve: `client_max_body_size 15M` (o padrão do Nginx
é 1 MB e derrubaria o envio de documentos com erro 413) e `Cache-Control:
no-store` no `/sw.js`, para o celular não ficar preso na versão antiga do app.

**Sem HTTPS o PWA não instala.** No navegador funciona, mas não vira app na tela
inicial.

### Backup

```bash
bash /var/www/cem/backup.sh
```

Grava em `/var/backups/cem` (ou na pasta passada como argumento): o banco, os
documentos e uma cópia do `.env`. Mantém 30 dias.

O banco é copiado com **`VACUUM INTO`**, não com `cp`. Em modo WAL o arquivo
`cem.db` costuma ficar praticamente vazio — as gravações recentes vivem no
`cem.db-wal`. Copiar só o `.db` produz um backup **inútil**: num teste real, o
`cem.db` tinha 4 KB contra 1,6 MB de WAL, e a cópia simples abria sem nenhuma
tabela. O `VACUUM INTO` consolida tudo num arquivo único, e o script confere o
resultado com `integrity_check` antes de dar o backup por bom.

Para rodar todo dia às 2h:

```bash
(crontab -l 2>/dev/null; echo "0 2 * * * bash /var/www/cem/backup.sh >> /var/log/cem/backup.log 2>&1") | crontab -
```

Restauração: o próprio script imprime os comandos ao terminar.

## Naturalidade e a lista de municípios

A lista dos **5.590 municípios com UF vem embutida** em `src/municipios.json`
(~170 KB). Não depende de rede: funciona na primeira execução, offline e em
servidor sem acesso à API do IBGE.

Ao digitar a cidade, o campo sugere os municípios e preenche a UF sozinha.
Quando o nome existe em mais de um estado (*Bom Jesus* aparece em 4), a UF fica
em branco de propósito, para não chutar. Nacionalidade "Estrangeira" libera
cidade e UF para digitação livre.

Origem dos dados: IBGE, via pacote [brazilian-cities](https://github.com/rhases/brazilian-cities) (MIT).
Para sincronizar com o IBGE quando houver acesso à internet:

```
POST /api/municipios/atualizar
```

Isso grava `dados/municipios.json`, que passa a ter prioridade sobre a lista
embutida. Se o IBGE estiver fora do ar, nada quebra — a embutida continua valendo.

## Próximos passos sugeridos

Frequência/chamada, avaliações e boletins, boleto/PIX com baixa automática,
notificação push das mensagens, portal do professor.

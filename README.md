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
desconto e bolsa), geração automática das parcelas, baixa total ou parcial,
estorno, cobranças avulsas, extrato por aluno e painel de inadimplência com
botão de cobrança pelo WhatsApp.

**Painel** — matrículas, ocupação das turmas, aniversariantes do mês, últimas
matrículas, alertas de saúde e pendências de cadastro.

**Relatórios** (todos com o timbre e o logotipo da escola):
relação de alunos · alunos por turma · ficha de matrícula · agenda de contatos ·
ficha médica da turma · quadro de funcionários · mapa de turmas.

**Acessos** — usuários e perfis. Perfis padrão: Master, Direção, Secretaria,
Coordenação, Professor e Responsável. Cada perfil libera um conjunto de páginas,
validado no servidor e refletido no menu.

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
as duas. Inclua ambas na sua rotina de backup.

## Naturalidade e a lista de municípios

O autocompletar usa a lista de municípios do IBGE, buscada **pelo servidor** (o
navegador não fala direto com o IBGE por CORS) e guardada em
`dados/municipios.json`. Se o IBGE estiver inacessível, a rota devolve lista
vazia e o campo continua aceitando digitação livre, com a UF liberada. Para
tentar de novo depois: `POST /api/municipios/atualizar`.

## Próximos passos sugeridos

Frequência/chamada, avaliações e boletins, boleto/PIX com baixa automática,
notificação push das mensagens, portal do professor.

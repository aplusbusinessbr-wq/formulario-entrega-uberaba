# Formulário de Entrega — Uberaba Supermercados

Formulário de agendamento de entregas no centro de recebimento. Substitui o Jotform
`form.jotform.com/231706062379053`.

```
index.html            → o formulário (arquivo único, abre em qualquer navegador)
apps-script/Codigo.gs → recebe o envio, grava na planilha e dispara o e-mail
LEIA-ME.md            → este arquivo
```

---

## Parte 1 — Ligar o envio por e-mail (~10 min)

O formulário é HTML puro e, sozinho, não envia e-mail. Quem faz isso é um script
gratuito do Google, hospedado na conta Google de vocês. Ele grava cada agendamento
numa planilha **e** dispara o e-mail formatado.

### 1. Criar a planilha

1. Acesse [sheets.new](https://sheets.new) para criar uma planilha em branco.
2. Dê um nome: **Agendamento de Entregas — Uberaba**.

> A aba `Agendamentos`, com cabeçalho e tudo, é criada sozinha no primeiro envio.

### 2. Colar o script

1. Na planilha, menu **Extensões → Apps Script**.
2. Apague todo o conteúdo do arquivo `Código.gs` que abrir.
3. Cole todo o conteúdo de `apps-script/Codigo.gs`.
4. No topo do arquivo, em `CONFIG`, preencha o campo `destinatarios` com o
   **seu próprio e-mail** — é com ele que você vai testar antes de apontar
   para o setor de recebimento.
5. Salve (`Ctrl+S`).

### 3. Testar antes de publicar

1. Na barra de funções do editor, selecione **`testarEnvio`** e clique em **Executar**.
2. O Google vai pedir autorização na primeira vez:
   - **Revisar permissões** → escolha sua conta
   - aparece um aviso *"O Google não verificou este app"* → clique em
     **Avançado** → **Acessar Agendamento de Entregas (não seguro)**
   - **Permitir**

   Esse aviso é normal: o app é seu, não passou pela revisão pública do Google.
3. Confira: deve chegar um e-mail de teste e aparecer uma linha na planilha.

### 4. Publicar como app da web

1. Botão azul **Implantar → Nova implantação**.
2. No ícone de engrenagem, escolha o tipo **App da Web**.
3. Preencha assim:

   | Campo | Valor |
   |---|---|
   | Descrição | `Formulário de entrega` |
   | Executar como | **Eu** (sua conta) |
   | Quem pode acessar | **Qualquer pessoa** |

   > **"Qualquer pessoa" é obrigatório** — é o navegador do fornecedor que
   > chama a URL, e ele não está logado na conta de vocês. Isso não expõe a
   > planilha: o script só aceita gravar, ninguém consegue ler nada por ali.

4. **Implantar** → copie a **URL do app da Web**. Ela termina em `/exec`.

### 5. Colar a URL no formulário

Abra o `index.html` num editor de texto, procure o bloco `CONFIG` (perto do fim do
arquivo) e cole a URL:

```js
endpoint: "https://script.google.com/macros/s/AKfy...SUA_URL.../exec",
```

Pronto. Envie um agendamento de teste pelo formulário e confira o e-mail e a planilha.

### 6. Virar a chave para o e-mail deles

Quando os testes estiverem ok, no Apps Script troque:

```js
destinatarios: 'email-do-recebimento@dominio.com.br',
```

E — **este passo é o que mais gera confusão** — vá em **Implantar → Gerenciar
implantações**, clique no lápis (editar), mude a versão para **Nova versão** e
clique em **Implantar**. Sem isso, o app da web continua rodando a versão antiga
e o e-mail continua indo pro endereço de teste. A URL **não muda**.

> Dica: dá pra mandar para os dois de uma vez, separando por vírgula:
> `'recebimento@dominio.com.br, seu-email@exemplo.com'`

> Os endereços reais deste projeto ficam em `CONFIG-PRIVADO.md`, que não sobe
> para o Git — repositório público seria varrido por bot de spam.

---

## Parte 2 — Onde o projeto está publicado

| | |
|---|---|
| **Formulário no ar** | https://formulario-entrega-uberaba.vercel.app |
| **Código** | https://github.com/aplusbusinessbr-wq/formulario-entrega-uberaba |

O deploy é automático: qualquer `git push` para a branch `main` republica o site
em segundos. Para atualizar depois de editar um arquivo:

```bash
git add -A && git commit -m "descricao da mudanca" && git push
```

A Vercel também gera um link de pré-visualização para cada branch, útil para
mostrar uma alteração ao cliente sem mexer no link oficial.

### Domínio próprio (opcional)

Dá para apontar algo como `entregas.uberabasupermercados.com.br` no painel da
Vercel, em *Settings → Domains*. Precisa que alguém com acesso ao DNS do domínio
crie um registro CNAME apontando para `cname.vercel-dns.com`.

---

## O que ainda falta ajustar no `index.html`

Tudo fica no bloco `CONFIG`, no fim do arquivo:

| Item | Situação |
|---|---|
| `endpoint` | vazio — recebe a URL do Apps Script (Parte 1) |
| `whatsapp` | `5534000000000` é fictício — trocar pelo WhatsApp do recebimento |
| `produtos` | lista provisória — o Jotform carrega as opções por JavaScript e não deu pra extrair as originais |
| `logoUrl` | ✅ pronto — usa o `logo.png` oficial |
| Telefone `(34) 0000-0000` | fictício, aparece no painel lateral — está no HTML, não no `CONFIG` |

Taxas confirmadas: **R$ 30,00 por palete** e **R$ 1,00 por volume**
(`precoPalete` e `precoVolume` no `CONFIG`).

### O logo

O logo oficial já está no lugar, sobre uma placa branca — necessária porque o
selo do logo é vermelho e sumiria sobre o painel vermelho do formulário.

| Arquivo | Uso |
|---|---|
| `logo.png` | o que vai para o ar: 440×311, 27 KB |
| `logo-original.png` | o arquivo entregue pelo cliente: 1880×1330, 196 KB |

O `logo.png` é uma redução do original para o tamanho em que ele realmente
aparece na tela (220px, dobrado para telas de alta resolução). O arquivo cheio
pesava quatro vezes mais que a página inteira, o que conta num formulário
preenchido no celular, muitas vezes fora do Wi-Fi.

Para trocar o logo depois, substitua o `logo.png` mantendo o nome. Se um dia
aparecer a versão **vetorial** (`.svg`), é melhor ainda: salve como `logo.svg`,
ajuste `logoUrl: "logo.svg"` e pode apagar os PNGs.

Se nenhum arquivo de logo existir, o formulário não quebra — ele cai numa versão
desenhada em SVG, que fica no HTML como reserva.

---

## Limites e manutenção

- **Envios:** sem limite prático. A cota do Gmail gratuito é de 100 destinatários
  por dia; contas Google Workspace têm 1.500. Um agendamento = 1 destinatário.
- **Custo:** zero.
- **Backup:** a planilha guarda tudo, mesmo que algum e-mail se perca.
- **Erros:** se um envio falhar, o fornecedor vê a mensagem *"Não foi possível
  enviar agora"* e o botão volta a funcionar. Para investigar, abra o Apps Script
  e veja **Execuções** no menu lateral.

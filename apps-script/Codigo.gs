/**
 * =============================================================
 *  UBERABA SUPERMERCADOS — RECEBEDOR DO FORMULÁRIO DE ENTREGA
 * =============================================================
 *  O que este script faz, a cada envio do formulário:
 *   1. grava uma linha na planilha (aba "Agendamentos")
 *   2. dispara um e-mail formatado para os destinatários abaixo
 *
 *  Passo a passo de instalação: ver LEIA-ME.md
 * =============================================================
 */

/* ---------- CONFIGURAÇÃO — edite só este bloco ---------- */

const CONFIG = {
  // Quem recebe o e-mail. Separe vários com vírgula.
  // Nos testes, use o seu próprio e-mail. Depois troque pelo e-mail do
  // setor de recebimento e republique a implantação (ver LEIA-ME.md).
  destinatarios: 'seu-email@exemplo.com',

  // Cópia oculta (opcional). Deixe '' se não quiser.
  cco: '',

  // Nome que aparece como remetente
  remetente: 'Agendamento de Entregas — Uberaba',

  // Aba da planilha onde os agendamentos são gravados
  aba: 'Agendamentos',

  // Fuso para os carimbos de data/hora
  fuso: 'America/Sao_Paulo',

  // Regras de agendamento. PRECISAM ser iguais às do formulário
  // (bloco CONFIG do index.html) — aqui é a validação que vale, porque
  // a tela roda no celular do fornecedor e não é confiável.
  horarios: ['07:30', '09:30', '13:00', '15:00'],
  diasSemana: [1, 2, 3, 4, 5]   // 0=domingo ... 6=sábado
};

/* ---------- NÃO PRECISA MEXER DAQUI PRA BAIXO ---------- */

const COLUNAS = [
  'Recebido em', 'Protocolo', 'Empresa', 'CNPJ', 'Telefone', 'Responsável',
  'Data da entrega', 'Data (ISO)', 'Horário', 'Produto', 'Nota fiscal',
  'Paletes', 'Volumes', 'Total estimado (R$)', 'Observação'
];

// posições usadas na conferência de disponibilidade (base 0)
const COL_DATA_ISO = 7;
const COL_HORA = 8;

/**
 * O Sheets converte sozinho o que parece data ou hora: '20/08/2026' vira
 * um Date e '07:30' vira uma hora. Na leitura de volta, portanto, nem
 * sempre chega texto — estas duas funções normalizam os dois casos.
 */
function paraIso(valor) {
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, CONFIG.fuso, 'yyyy-MM-dd');
  }
  const s = String(valor === null || valor === undefined ? '' : valor).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);   // dd/MM/yyyy
  return m ? (m[3] + '-' + m[2] + '-' + m[1]) : '';
}

function paraHora(valor) {
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, CONFIG.fuso, 'HH:mm');
  }
  return String(valor === null || valor === undefined ? '' : valor).trim();
}

/** Todas as janelas já reservadas, agrupadas por data, dentro de um mês 'aaaa-mm'. */
function ocupadosDoMes(mes) {
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.aba);
  const mapa = {};
  if (!aba || aba.getLastRow() < 2) return mapa;

  const linhas = aba.getRange(2, 1, aba.getLastRow() - 1, COLUNAS.length).getValues();
  for (let i = 0; i < linhas.length; i++) {
    const dataIso = paraIso(linhas[i][COL_DATA_ISO]);
    if (dataIso.indexOf(mes) !== 0) continue;

    const hora = paraHora(linhas[i][COL_HORA]);
    if (!hora) continue;

    if (!mapa[dataIso]) mapa[dataIso] = [];
    if (mapa[dataIso].indexOf(hora) === -1) mapa[dataIso].push(hora);
  }
  return mapa;
}

/** Janelas já reservadas em uma data 'aaaa-mm-dd'. */
function horariosOcupadosEm(dataIso) {
  if (!dataIso) return [];
  const doMes = ocupadosDoMes(dataIso.slice(0, 7));
  return doMes[dataIso] || [];
}

/**
 * Confere se a data e a janela pedidas são aceitáveis.
 * Devolve '' quando está tudo certo, ou a mensagem do problema.
 *
 * O calendário do formulário já impede tudo isto, mas ele roda no celular
 * do fornecedor: relógio errado, página aberta desde ontem ou envio fora
 * do formulário passariam batido sem esta conferência.
 */
function validarAgendamento(dataIso, hora) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataIso || ''))) {
    return 'Data inválida.';
  }
  if (CONFIG.horarios.indexOf(hora) === -1) {
    return 'Esse horário não é uma janela de recebimento.';
  }

  const agora = new Date();
  const hojeIso = Utilities.formatDate(agora, CONFIG.fuso, 'yyyy-MM-dd');

  if (dataIso < hojeIso) {
    return 'Essa data já passou.';
  }

  const p = dataIso.split('-');
  const diaSemana = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0).getDay();
  if (CONFIG.diasSemana.indexOf(diaSemana) === -1) {
    return 'Não há recebimento nesse dia. Escolha de segunda a sexta.';
  }

  // 'HH:mm' com zero à esquerda compara certo como texto
  if (dataIso === hojeIso && hora <= Utilities.formatDate(agora, CONFIG.fuso, 'HH:mm')) {
    return 'Essa janela de hoje já começou.';
  }

  return '';
}

/**
 * Recebe o POST do formulário.
 * O formulário envia como text/plain de propósito: evita a requisição
 * de preflight (OPTIONS), que o Apps Script não responde e que
 * faria o navegador bloquear o envio por CORS.
 */
function doPost(e) {
  // Uma entrega por janela. A trava serializa os envios: sem ela, dois
  // fornecedores que clicassem no mesmo segundo passariam os dois pela
  // verificação antes de qualquer um gravar, e a janela sairia duplicada.
  const trava = LockService.getScriptLock();

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return responder({ ok: false, erro: 'Requisição sem corpo.' });
    }

    const d = JSON.parse(e.postData.contents);

    const dataIso = d.dataIso || paraIso(d.data);

    const problema = validarAgendamento(dataIso, d.hora);
    if (problema) {
      return responder({ ok: false, motivo: 'invalido', erro: problema });
    }

    trava.waitLock(20000);

    const jaOcupados = horariosOcupadosEm(dataIso);
    if (jaOcupados.indexOf(d.hora) !== -1) {
      return responder({ ok: false, motivo: 'ocupado', ocupados: jaOcupados });
    }

    gravarNaPlanilha(d);

    // o e-mail sai depois da gravação: se ele falhar, o agendamento
    // já está salvo e ninguém perde a janela
    enviarEmail(d);

    return responder({ ok: true, protocolo: d.protocolo });

  } catch (err) {
    // registra o erro no log de execuções para diagnóstico
    console.error(err);
    return responder({ ok: false, erro: String(err) });

  } finally {
    try { trava.releaseLock(); } catch (ignorado) {}
  }
}

/**
 * GET sem parâmetros: confere se o serviço está no ar.
 * GET com ?mes=2026-08: devolve as janelas já reservadas naquele mês, para
 * o formulário apagar os horários indisponíveis antes de a pessoa escolher.
 */
function doGet(e) {
  try {
    const mes = e && e.parameter ? e.parameter.mes : null;
    if (!mes) {
      return responder({ ok: true, servico: 'Agendamento de Entrega — Uberaba Supermercados' });
    }
    return responder({ ok: true, mes: mes, ocupados: ocupadosDoMes(mes) });
  } catch (err) {
    console.error(err);
    return responder({ ok: false, erro: String(err) });
  }
}

function responder(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- PLANILHA ---------- */

function gravarNaPlanilha(d) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName(CONFIG.aba);

  if (!aba) {
    aba = ss.insertSheet(CONFIG.aba);
  }

  // cria o cabeçalho na primeira execução
  if (aba.getLastRow() === 0) {
    aba.appendRow(COLUNAS);
    const head = aba.getRange(1, 1, 1, COLUNAS.length);
    head.setFontWeight('bold')
        .setBackground('#EB3439')
        .setFontColor('#FFFFFF');
    aba.setFrozenRows(1);

    // Tentativa de manter data ISO e horário como texto puro. Na prática o
    // Sheets converte assim mesmo — por isso paraIso() e paraHora() aceitam
    // tanto texto quanto Date na leitura. Fica aqui por não custar nada.
    aba.getRange(1, COL_DATA_ISO + 1, aba.getMaxRows(), 2).setNumberFormat('@');
  }

  aba.appendRow([
    Utilities.formatDate(new Date(), CONFIG.fuso, 'dd/MM/yyyy HH:mm:ss'),
    d.protocolo || '',
    d.empresa || '',
    d.cnpj || '',
    d.telefone || '',
    d.responsavel || '',
    d.data || '',
    d.dataIso || paraIso(d.data),
    d.hora || '',
    d.produto || '',
    d.nf || '',
    Number(d.paletes) || 0,
    Number(d.volumes) || 0,
    Number(d.total) || 0,
    d.observacao || ''
  ]);
}

/* ---------- E-MAIL ---------- */

function enviarEmail(d) {
  const assunto = `Nova entrega — ${d.empresa} — ${d.data} às ${d.hora}`;

  const opcoes = {
    to: CONFIG.destinatarios,
    subject: assunto,
    htmlBody: montarHtml(d),
    body: montarTextoSimples(d),
    name: CONFIG.remetente
  };

  if (CONFIG.cco) opcoes.bcc = CONFIG.cco;

  MailApp.sendEmail(opcoes);
}

function montarHtml(d) {
  const linhas = [
    ['Empresa', d.empresa],
    ['CNPJ', d.cnpj],
    ['Telefone', d.telefone],
    ['Responsável', d.responsavel],
    ['Data e horário da entrega', `${d.data} às ${d.hora}`],
    ['Qual produto será entregue?', d.produto],
    ['Nota fiscal', d.nf],
    ['Quantidade de paletes', d.paletes],
    ['Quantidade de volumes', d.volumes],
    ['Observação', d.observacao]
  ]
  .filter(([, v]) => v !== '' && v !== null && v !== undefined)
  .map(([k, v]) => `
      <tr>
        <td style="padding:11px 0;border-bottom:1px solid #EEE7DE;color:#6E635E;font-size:13px;width:45%;vertical-align:top">${escapar(k)}</td>
        <td style="padding:11px 0;border-bottom:1px solid #EEE7DE;color:#221E1C;font-size:14px;font-weight:600;text-align:right">${escapar(v)}</td>
      </tr>`)
  .join('');

  const total = (Number(d.total) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

  return `
<div style="background:#F1ECE5;padding:26px 12px;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#FFFDFB;border-radius:14px;overflow:hidden;border:1px solid #E6DED4">

    <div style="background:#EB3439;padding:22px 26px">
      <div style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:-.3px">Uberaba Supermercados</div>
      <div style="color:rgba(255,255,255,.9);font-size:11px;letter-spacing:3px;text-transform:uppercase;margin-top:3px">Centro de Recebimento</div>
    </div>

    <div style="padding:26px">
      <div style="font-size:19px;font-weight:bold;color:#221E1C;margin-bottom:4px">Nova entrega agendada</div>
      <div style="font-size:13px;color:#6E635E">Protocolo
        <span style="background:#151312;color:#FFD54D;padding:3px 9px;border-radius:5px;font-family:monospace;font-size:13px">${escapar(d.protocolo)}</span>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-top:20px">${linhas}</table>

      <table style="width:100%;border-collapse:collapse;margin-top:18px;border:2px solid #151312;border-radius:10px">
        <tr>
          <td style="padding:14px 16px;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#221E1C">Total estimado</td>
          <td style="padding:14px 16px;text-align:right;font-size:24px;font-weight:bold;color:#EB3439">R$ ${total}</td>
        </tr>
      </table>

      <div style="margin-top:16px;font-size:12px;color:#6E635E;line-height:1.5">
        ${escapar(d.paletes)} palete(s) × R$ 30,00 &nbsp;+&nbsp; ${escapar(d.volumes)} volume(s) × R$ 1,00.<br>
        Valor de refer&ecirc;ncia, sujeito &agrave; confer&ecirc;ncia no recebimento.
      </div>
    </div>

    <div style="background:#F1ECE5;padding:14px 26px;font-size:11px;color:#6E635E;text-align:center">
      Enviado automaticamente pelo formul&aacute;rio de agendamento em ${escapar(d.enviadoEm || '')}.
    </div>

  </div>
</div>`;
}

function montarTextoSimples(d) {
  return [
    'NOVA ENTREGA AGENDADA',
    'Protocolo: ' + d.protocolo,
    '',
    'Empresa: ' + d.empresa,
    'CNPJ: ' + d.cnpj,
    'Telefone: ' + d.telefone,
    d.responsavel ? 'Responsável: ' + d.responsavel : '',
    'Entrega: ' + d.data + ' às ' + d.hora,
    'Produto: ' + d.produto,
    d.nf ? 'Nota fiscal: ' + d.nf : '',
    'Paletes: ' + d.paletes,
    'Volumes: ' + d.volumes,
    'Total estimado: R$ ' + (Number(d.total) || 0).toFixed(2).replace('.', ','),
    d.observacao ? '' : null,
    d.observacao ? 'Observação: ' + d.observacao : ''
  ].filter(l => l !== null && l !== '').join('\n');
}

function escapar(v) {
  return String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------- ABA "AGENDA" ---------- */

/**
 * Cria (ou refaz) a aba "Agenda": a visão que o pessoal da doca abre de manhã.
 *
 * A aba "Agendamentos" é um log — ordem de chegada, 15 colunas, incluindo
 * coisas que só o sistema usa. Esta aqui mostra só o que interessa, das
 * entregas de hoje em diante, ordenadas por dia e janela.
 *
 * É uma fórmula viva: não precisa rodar de novo a cada agendamento.
 * Rode uma vez pelo editor, ou de novo se quiser recriar a aba do zero.
 */
function criarAbaAgenda() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let aba = ss.getSheetByName('Agenda');
  if (aba) {
    aba.clear();
  } else {
    aba = ss.insertSheet('Agenda', 0);   // primeira aba: é a que abre por padrão
  }

  const cabecalho = ['Data', 'Janela', 'Empresa', 'Produto', 'Paletes', 'Volumes', 'Telefone', 'Protocolo'];
  aba.getRange(1, 1, 1, cabecalho.length)
     .setValues([cabecalho])
     .setFontWeight('bold')
     .setBackground('#EB3439')
     .setFontColor('#FFFFFF');
  aba.setFrozenRows(1);

  // Duas armadilhas aprendidas na marra:
  //
  // 1. setFormula() NÃO converte o separador de argumentos para o idioma da
  //    planilha. Numa planilha em português é preciso ";" — com "," o Sheets
  //    devolve #ERROR!. Se um dia a planilha for recriada em inglês, troque
  //    o SEP abaixo por ",".
  //
  // 2. A comparação é feita na coluna G (data), não na H (ISO): apesar da
  //    formatação de texto, o Sheets converte "2026-08-20" em data, e a
  //    comparação com string não casava com nada.
  const SEP = ';';

  const formula =
    '=IFERROR(QUERY(' + CONFIG.aba + '!A2:O' + SEP + ' ' +
    '"select G, I, C, J, L, M, E, B ' +
    'where G >= date \'"&TEXT(TODAY()' + SEP + '"yyyy-mm-dd")&"\' ' +
    'order by G, I"' + SEP + ' 0)' + SEP + ' "Nenhuma entrega agendada a partir de hoje.")';

  aba.getRange('A2').setFormula(formula);

  // o QUERY devolve data e hora como número de série: sem formato,
  // a doca veria "46252" e "0,625" no lugar de 18/08/2026 e 15:00
  aba.getRange('A2:A').setNumberFormat('dd/MM/yyyy');
  aba.getRange('B2:B').setNumberFormat('HH:mm');

  const larguras = [110, 90, 260, 170, 90, 100, 150, 190];
  larguras.forEach(function (px, i) { aba.setColumnWidth(i + 1, px); });

  aba.getRange('E:F').setHorizontalAlignment('center');

  SpreadsheetApp.getActiveSpreadsheet().toast('Aba "Agenda" pronta.', 'Uberaba', 5);
}

/* ---------- MANUTENÇÃO ---------- */

/**
 * Apaga agendamentos pelo protocolo.
 *
 * É assim que se cancela uma entrega: a linha sai da planilha e a janela
 * volta a aparecer livre no formulário, sem precisar mexer em mais nada.
 * Devolve quantas linhas foram apagadas.
 */
function apagarPorProtocolo(protocolos) {
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.aba);
  if (!aba || aba.getLastRow() < 2) return 0;

  const alvo = {};
  protocolos.forEach(function (p) { alvo[String(p).trim()] = true; });

  const linhas = aba.getRange(2, 1, aba.getLastRow() - 1, COLUNAS.length).getValues();
  let apagadas = 0;

  // de baixo para cima: apagar uma linha de cima renumera todas as de baixo,
  // e o laço passaria a apontar para a linha errada
  for (let i = linhas.length - 1; i >= 0; i--) {
    if (alvo[String(linhas[i][1]).trim()]) {
      aba.deleteRow(i + 2);   // +2: a linha 1 é o cabeçalho
      apagadas++;
    }
  }

  Logger.log('Linhas apagadas: ' + apagadas);
  return apagadas;
}

/**
 * Remove os três agendamentos criados durante a instalação.
 * Rode uma vez, antes de entregar a planilha ao cliente.
 */
function limparAgendamentosDeTeste() {
  const n = apagarPorProtocolo([
    'UBE-TESTE-0001',       // função testarEnvio
    'UBE-20260817-5372',    // primeiro envio pelo formulário
    'UBE-TESTE-VALID'       // teste da validação no servidor
  ]);
  Logger.log(n + ' agendamento(s) de teste removido(s).');
}

/**
 * Importa reservas que já existiam no Jotform antigo, para que o formulário
 * novo não ofereça uma janela que já tem entrega marcada durante a transição.
 *
 * Não temos os dados do fornecedor — eles seguem no formulário antigo. A linha
 * entra só para ocupar a janela, identificada pelo protocolo "ANTIGO-...".
 *
 * Pode rodar de novo sem medo: janela que já consta é pulada. Se aparecerem
 * novas marcações no Jotform, acrescente aqui e rode outra vez.
 */
function importarDoFormularioAntigo() {
  const reservas = [
    ['2026-08-19', '09:30'],
    ['2026-08-19', '13:00'],
    ['2026-08-20', '09:30'],
    ['2026-08-24', '09:30']
  ];

  let criadas = 0, jaExistiam = 0;

  reservas.forEach(function (r) {
    const dataIso = r[0], hora = r[1];

    if (horariosOcupadosEm(dataIso).indexOf(hora) !== -1) {
      jaExistiam++;
      return;
    }

    const p = dataIso.split('-');
    gravarNaPlanilha({
      protocolo: 'ANTIGO-' + dataIso.replace(/-/g, '') + '-' + hora.replace(':', ''),
      empresa: 'Agendado no formulário antigo',
      cnpj: '',
      telefone: '',
      responsavel: '',
      data: p[2] + '/' + p[1] + '/' + p[0],
      dataIso: dataIso,
      hora: hora,
      produto: '—',
      nf: '',
      paletes: 0,
      volumes: 0,
      total: 0,
      observacao: 'Reserva vinda do Jotform. Os dados do fornecedor estão no formulário antigo.'
    });
    criadas++;
  });

  Logger.log('Janelas bloqueadas: ' + criadas + ' | já constavam: ' + jaExistiam);
}

/* ---------- TESTE ---------- */

/**
 * Rode esta função pelo editor (botão "Executar") para testar
 * o e-mail e a planilha sem precisar do formulário.
 */
function testarEnvio() {
  const exemplo = {
    protocolo: 'UBE-TESTE-0001',
    empresa: 'Distribuidora Boa Safra LTDA',
    cnpj: '11.222.333/0001-81',
    telefone: '(34) 99988-7766',
    responsavel: 'Carlos Almeida',
    data: '20/08/2026',
    dataIso: '2026-08-20',
    hora: '09:30',
    produto: 'Hortifrúti',
    nf: '128455',
    paletes: 6,
    volumes: 340,
    total: 520,
    observacao: 'Carga refrigerada, caminhão truck.',
    enviadoEm: Utilities.formatDate(new Date(), CONFIG.fuso, 'dd/MM/yyyy HH:mm:ss')
  };

  gravarNaPlanilha(exemplo);
  enviarEmail(exemplo);

  Logger.log('Teste enviado para: ' + CONFIG.destinatarios);
}

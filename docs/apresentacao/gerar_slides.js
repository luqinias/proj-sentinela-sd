// Gera docs/apresentacao/Sentinel_Apresentacao_Preliminar.pptx (5 slides, 05/11/2026).
// Uso: NODE_PATH=<pasta com pptxgenjs, react-icons, react, react-dom, sharp>/node_modules \
//        node docs/apresentacao/gerar_slides.js <caminho/apply_theme.js>
// Números vêm das evidências em evidencias/preliminar/ (02/11/2026).
const path = require("path");
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa");
const { applyTheme } = require(process.argv[2]);

const OUT = path.join(__dirname, "Sentinel_Apresentacao_Preliminar.pptx");

const THEME = {
  name: "Sentinel",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "17202A", lt1: "FFFFFF", dk2: "0B3C49", lt2: "EDF2F4",
    accent1: "12708A", // teal: observação / destaque
    accent2: "1E8449", // verde: ok / confirmado
    accent3: "C0392B", // vermelho: SPOF / falha
    accent4: "B9770E", // âmbar: pendente
    accent5: "5D6D7E", // cinza ardósia: texto secundário
    accent6: "A9CCE3",
    hlink: "12708A", folHlink: "5D6D7E",
  },
};
const HEX = THEME.colors;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in
pres.author = "Equipe Operação Sentinel";
pres.title = "Operação Sentinel — Apresentação preliminar";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

// ---------------------------------------------------------------- layout
pres.defineSlideMaster({
  title: "CONTEUDO",
  background: { color: C.background2 },
  margin: [0.4, 0.6, 0.6, 0.6],
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.4, w: 10.4, h: 0.8,
        fontSize: 32, bold: true, color: C.text2, valign: "middle", align: "left", margin: 0 }, text: "" } },
    { text: { text: "Operação Sentinel · FEELT31830 Sistemas Distribuídos · Apresentação preliminar 05/11/2026",
        options: { x: 0.6, y: 7.0, w: 9, h: 0.3, fontSize: 11, color: C.accent5, margin: 0 } } },
  ],
  slideNumber: { x: 12.33, y: 7.0, w: 0.4, h: 0.3, fontSize: 11, color: C.accent5, align: "right" },
});

// ---------------------------------------------------------------- helpers
async function icon(Comp, hex = "FFFFFF") {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: "#" + hex, size: 256 }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}
const shadow = () => ({ type: "outer", color: "000000", blur: 6, offset: 2, angle: 90, opacity: 0.12 });
function card(slide, x, y, w, h, name, opts = {}) {
  slide.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.08, objectName: name,
    fill: { color: opts.fill || C.background1 },
    line: opts.line ? { color: opts.line, width: opts.lineW || 2 } : { type: "none" },
    shadow: opts.noShadow ? undefined : shadow(),
  });
}
async function badgeIcon(slide, Comp, x, y, d, color, name) {
  slide.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color }, line: { type: "none" }, objectName: name + "-circulo" });
  const p = d * 0.25;
  slide.addImage({ data: await icon(Comp), x: x + p, y: y + p, w: d - 2 * p, h: d - 2 * p, objectName: name + "-icone" });
}
function pill(slide, text, x, y, w, color, name, h = 0.38) {
  slide.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: h / 2, fill: { color }, line: { type: "none" }, objectName: name });
  slide.addText(text, { x, y, w, h, isTextBox: true, fontSize: 12, bold: true, color: C.background1, align: "center", valign: "middle", margin: 0, objectName: name + "-texto" });
}
function arrow(slide, x1, y1, x2, y2, color, dashed, name) {
  slide.addShape(pres.ShapeType.line, {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001,
    flipV: y2 < y1, flipH: x2 < x1, objectName: name,
    line: { color, width: dashed ? 1.75 : 2.5, dashType: dashed ? "dash" : "solid", endArrowType: "triangle" },
  });
}
function tx(slide, text, o) { slide.addText(text, Object.assign({ isTextBox: true, margin: 0, color: C.text1, fontSize: 14, valign: "top" }, o)); }

(async () => {
  // ============================================================ SLIDE 1
  pres.addSection({ title: "Arquitetura" });
  let s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Arquitetura" });
  s.addText("1. Arquitetura e pontos únicos de falha", { placeholder: "title" });
  pill(s, "Entrega A", 11.35, 0.61, 1.38, C.accent1, "entrega");

  // moldura do host (também é SPOF)
  s.addShape(pres.ShapeType.roundRect, { x: 2.15, y: 1.35, w: 5.65, h: 5.45, rectRadius: 0.1, objectName: "host",
    fill: { color: C.background1 }, line: { color: C.accent3, width: 1.5, dashType: "dash" } });
  tx(s, "1 host WSL2 · 1 Docker Engine · rede \"sentinel\"", { x: 2.35, y: 6.42, w: 5.3, h: 0.3, fontSize: 12, color: C.accent3, italic: true });

  const box = (x, y, w, h, t1, t2, border, name) => {
    card(s, x, y, w, h, name, { line: border, lineW: border === C.accent3 ? 2.5 : 2 });
    s.addText([{ text: t1, options: { bold: true, fontSize: 15, breakLine: true } }, { text: t2, options: { fontSize: 11, color: C.accent5 } }],
      { x, y, w, h, isTextBox: true, align: "center", valign: "middle", margin: 0.04, color: C.text1, objectName: name + "-texto" });
  };
  box(0.6, 3.55, 1.3, 0.85, "Cliente", "curl :8080", C.accent5, "cliente");
  box(2.4, 3.42, 1.85, 1.1, "Nginx", "round-robin\ntimeouts 1s / 3s", C.accent3, "nginx");
  box(5.25, 2.55, 2.3, 0.85, "Rust A", "rust-a:8080", C.accent2, "rust-a");
  box(5.25, 4.55, 2.3, 0.85, "Rust B", "rust-b:8080", C.accent2, "rust-b");
  box(2.4, 1.55, 5.15, 0.7, "Watchdog", "sonda /health/ready · 5 s · timeout 2 s · DOWN após 3", C.accent3, "watchdog");
  box(2.4, 5.6, 5.15, 0.7, "Prometheus", "127.0.0.1:9090 · coleta 5 s · 8 alertas", C.accent3, "prometheus");

  arrow(s, 1.9, 3.97, 2.4, 3.97, HEX.dk2, false, "seta-cliente-nginx");
  arrow(s, 4.25, 3.7, 5.25, 3.05, HEX.dk2, false, "seta-nginx-a");
  arrow(s, 4.25, 4.25, 5.25, 4.9, HEX.dk2, false, "seta-nginx-b");
  arrow(s, 6.4, 2.25, 6.4, 2.55, HEX.accent1, true, "seta-wd-a");
  arrow(s, 3.3, 2.25, 3.3, 3.42, HEX.accent1, true, "seta-wd-sintetico");
  tx(s, "teste sintético", { x: 3.4, y: 2.62, w: 1.4, h: 0.28, fontSize: 11, color: C.accent1, italic: true });
  arrow(s, 6.4, 5.6, 6.4, 5.4, HEX.accent1, true, "seta-prom-b");
  s.addText([{ text: "──  usuário", options: { color: C.text2, breakLine: true } }, { text: "- - -  observação", options: { color: C.accent1, breakLine: true } }, { text: "contorno vermelho = SPOF", options: { color: C.accent3 } }],
    { x: 0.6, y: 4.7, w: 1.5, h: 0.9, isTextBox: true, margin: 0, fontSize: 11, valign: "top", objectName: "legenda" });

  tx(s, "Se cair…", { x: 8.2, y: 1.4, w: 4.5, h: 0.4, fontSize: 20, bold: true, color: C.text2, fontFace: "Cambria" });
  const spofs = [
    [fa.FaServer, "Nginx", "serviço inteiro fora; detecção: teste sintético", C.accent3],
    [fa.FaEye, "Watchdog", "ninguém declara DOWN; o Prometheus o vigia", C.accent3],
    [fa.FaChartLine, "Prometheus", "nenhum alerta, e ninguém avisa: SPOF residual", C.accent3],
    [fa.FaBug, "Bug comum a A e B", "balanceamento não ajuda; alerta de taxa de erro", C.accent3],
    [fa.FaDocker, "Host / Docker", "tudo cai junto: limite do laboratório", C.accent3],
    [fa.FaCheck, "Rust A e B", "não são SPOF: redundância 2×", C.accent2],
  ];
  for (let i = 0; i < spofs.length; i++) {
    const [I, n, d, col] = spofs[i]; const y = 1.95 + i * 0.8;
    await badgeIcon(s, I, 8.2, y + 0.05, 0.55, col, "spof-" + i);
    s.addText([{ text: n, options: { bold: true, fontSize: 15, breakLine: true } }, { text: d, options: { fontSize: 13, color: C.accent5 } }],
      { x: 8.95, y, w: 3.8, h: 0.68, isTextBox: true, margin: 0, valign: "middle", color: C.text1, objectName: "spof-texto-" + i });
  }
  s.addNotes(
    "Integrante 1 (Infra), ~60 s.\n" +
    "O cliente fala só com o Nginx, na porta 8080. O Nginx reparte em revezamento entre Rust A e Rust B. " +
    "O watchdog, independente, sonda o /health/ready de cada nó a cada 5 s e faz um teste sintético passando pelo Nginx, o caminho real do usuário. " +
    "O Prometheus coleta métricas de todos a cada 5 s. Em vermelho estão os pontos únicos de falha: se o Nginx cair, o serviço inteiro cai mesmo com os dois nós saudáveis. " +
    "O watchdog é SPOF do monitoramento, por isso o Prometheus tem um alerta sobre ele. O Prometheus não tem ninguém vigiando: é o SPOF que declaramos. " +
    "Tudo roda numa máquina só, então as falhas não são independentes.\nDetalhe: docs/A_arquitetura_e_spof.md");

  // ============================================================ SLIDE 2
  pres.addSection({ title: "O que já roda" });
  s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "O que já roda" });
  s.addText("2. O que já roda", { placeholder: "title" });
  pill(s, "Entregas B e C", 11.0, 0.61, 1.73, C.accent1, "entrega");

  card(s, 0.6, 1.45, 6.95, 2.95, "terminal", { fill: C.text2 });
  const term = [
    ["$ docker compose ps", "A9CCE3"],
    ["nginx       Up (healthy)  0.0.0.0:8080->80", "FFFFFF"],
    ["prometheus  Up (healthy)  127.0.0.1:9090->9090", "FFFFFF"],
    ["rust-a      Up (healthy)  8080/tcp (interna)", "FFFFFF"],
    ["rust-b      Up (healthy)  8080/tcp (interna)", "FFFFFF"],
    ["watchdog    Up (healthy)  9100/tcp (interna)", "FFFFFF"],
  ];
  s.addText(term.map(([t, c], i) => ({ text: t, options: { color: c, breakLine: i < term.length - 1 } })),
    { x: 0.85, y: 1.65, w: 6.5, h: 2.2, isTextBox: true, fontFace: "Courier New", fontSize: 14, margin: 0, valign: "top", paraSpaceAfter: 4, objectName: "terminal-texto" });
  tx(s, "evidência: 02/11/2026, ambiente limpo (down → up -d --build)", { x: 0.85, y: 3.95, w: 6.5, h: 0.3, fontSize: 11, color: "A9CCE3", italic: true });

  card(s, 0.6, 4.65, 6.95, 1.95, "log-nginx");
  tx(s, "Log do Nginx com rust-a não pronto", { x: 0.85, y: 4.8, w: 6.5, h: 0.35, fontSize: 15, bold: true, color: C.text2 });
  s.addText([{ text: "upstream_status=", options: { color: C.accent5 } }, { text: "503, 200", options: { color: C.accent3, bold: true } },
             { text: "  node=", options: { color: C.accent5 } }, { text: "rust-b", options: { color: C.accent2, bold: true } }],
    { x: 0.85, y: 5.2, w: 6.5, h: 0.4, isTextBox: true, fontFace: "Courier New", fontSize: 15, margin: 0, objectName: "log-linha" });
  tx(s, "Tentou A, recebeu 503, refez em B. O usuário viu 200 e nada foi reiniciado. O mesmo request_id aparece no log do Nginx e no do Rust.",
    { x: 0.85, y: 5.7, w: 6.5, h: 0.8, fontSize: 14 });

  const stats = [
    ["10 / 10", "20 requisições: A / B, todas 200", C.accent1],
    ["200 · 503", "rust-a não pronto: live / ready", C.accent1],
    ["10 de 10", "respostas 200 ao usuário com A fora", C.accent2],
    ["404", "/metrics e /admin pela porta 8080", C.accent1],
  ];
  stats.forEach(([n, l, col], i) => {
    const x = 7.9 + (i % 2) * 2.55, y = 1.45 + Math.floor(i / 2) * 2.7;
    card(s, x, y, 2.3, 2.45, "stat-" + i);
    tx(s, n, { x: x + 0.1, y: y + 0.35, w: 2.1, h: 0.85, fontSize: 30, bold: true, color: col, align: "center", valign: "middle", fontFace: "Cambria" });
    tx(s, l, { x: x + 0.2, y: y + 1.35, w: 1.9, h: 0.9, fontSize: 14, color: C.accent5, align: "center" });
  });
  s.addNotes(
    "Integrante 2 (Aplicação), ~75 s.\n" +
    "Saída real do docker compose ps de 02/11: cinco serviços saudáveis e só duas portas no host, a 8080 do Nginx e a 9090 do Prometheus presa em 127.0.0.1. " +
    "Vinte requisições: dez para cada nó. Cada requisição recebe um request_id do Nginx, que aparece também no log do Rust: é assim que correlacionamos. " +
    "Liveness e readiness são diferentes: quando desligamos a prontidão do A, o live continua 200, o ready vira 503, e o usuário continua recebendo 200. " +
    "O log do Nginx mostra 503, 200: tentou o A, foi recusado, refez no B. Nada foi reiniciado.\nEvidências: evidencias/preliminar/01 a 04.");

  // ============================================================ SLIDE 3
  pres.addSection({ title: "Métricas e alertas" });
  s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Métricas e alertas" });
  s.addText("3. Métricas e alertas planejados", { placeholder: "title" });
  pill(s, "Entrega D", 11.35, 0.61, 1.38, C.accent1, "entrega");

  const slis = [["SLI disponibilidade", "≥ 99% em 5 min"], ["SLI erro de usuário", "≤ 2% em 2 min"], ["SLI latência p95", "≤ 1 s"]];
  slis.forEach(([a, b], i) => {
    const x = 0.6 + i * 4.1;
    card(s, x, 1.4, 3.85, 0.75, "sli-" + i, { fill: C.text2, noShadow: true });
    s.addText([{ text: a + "  ", options: { color: "A9CCE3", fontSize: 14 } }, { text: b, options: { color: "FFFFFF", fontSize: 16, bold: true } }],
      { x: x + 0.2, y: 1.4, w: 3.5, h: 0.75, isTextBox: true, margin: 0, valign: "middle", objectName: "sli-texto-" + i });
  });

  tx(s, "5 métricas", { x: 0.6, y: 2.4, w: 5.2, h: 0.4, fontSize: 20, bold: true, color: C.text2, fontFace: "Cambria" });
  const mets = [
    [fa.FaHeartbeat, "watchdog_target_up", "disponibilidade vista de fora"],
    [fa.FaExclamationCircle, "app_requests_total{status}", "taxa de erro e tráfego por nó"],
    [fa.FaStopwatch, "app_request_duration_seconds", "latência p95"],
    [fa.FaTachometerAlt, "app_inflight_requests", "saturação"],
    [fa.FaClock, "watchdog_last_probe_timestamp", "o monitor está vivo?"],
  ];
  for (let i = 0; i < mets.length; i++) {
    const [I, m, d] = mets[i]; const y = 2.95 + i * 0.72;
    await badgeIcon(s, I, 0.6, y + 0.05, 0.5, C.accent1, "met-" + i);
    s.addText([{ text: m, options: { fontFace: "Courier New", fontSize: 13, bold: true, color: C.text2, breakLine: true } }, { text: d, options: { fontSize: 13, color: C.accent5 } }],
      { x: 1.25, y, w: 4.6, h: 0.65, isTextBox: true, margin: 0, valign: "middle", objectName: "met-texto-" + i });
  }

  tx(s, "3 alertas obrigatórios", { x: 6.3, y: 2.4, w: 6.4, h: 0.4, fontSize: 20, bold: true, color: C.text2, fontFace: "Cambria" });
  const alerts = [
    ["3 × 5 s", "NoDown", "alta · plantão", C.accent3, "Watchdog DOWN + 5 s. Uma perda isolada não alarma; medido: 14 s até DOWN."],
    ["> 2%", "TaxaErro5xxAlta", "alta · plantão", C.accent3, "5xx de usuário em 2 min, por 30 s. Abaixo é ruído; acima o usuário sente."],
    ["> 30 s", "MonitorParado", "média · equipe", C.accent4, "Idade da última sondagem: 6 intervalos sem sondar. Quem vigia o vigia."],
  ];
  alerts.forEach(([lim, nome, sev, col, why], i) => {
    const y = 2.95 + i * 1.3;
    card(s, 6.3, y, 6.43, 1.1, "alerta-" + i);
    tx(s, lim, { x: 6.45, y, w: 1.55, h: 1.1, fontSize: 24, bold: true, color: col, align: "center", valign: "middle", fontFace: "Cambria" });
    s.addText([{ text: nome + "   ", options: { bold: true, fontSize: 15, color: C.text1 } }, { text: sev, options: { fontSize: 12, color: col, bold: true, breakLine: true } },
               { text: why, options: { fontSize: 13, color: C.accent5 } }],
      { x: 8.15, y: y + 0.08, w: 4.45, h: 0.95, isTextBox: true, margin: 0, valign: "middle", objectName: "alerta-texto-" + i });
  });
  tx(s, "+ 5 complementares: teste sintético, p95, coleta, reinício em loop, flapping", { x: 0.6, y: 6.62, w: 6, h: 0.3, fontSize: 12, italic: true, color: C.accent5 });
  s.addNotes(
    "Integrante 3 (Observabilidade), ~60 s.\n" +
    "Seguimos a regra 1: SLI antes do alerta. Escolhemos 5 métricas que cobrem os quatro sinais clássicos e a saúde do próprio monitor. " +
    "Os três alertas obrigatórios: NoDown, que só dispara depois de três falhas de 5 s, para não alarmar por perda isolada; taxa de erro acima de 2% em 2 minutos; " +
    "e monitor parado, quando a última sondagem tem mais de 30 s, ou seja, seis intervalos. Cada alerta tem severidade, dono e procedimento escritos no arquivo de regras. " +
    "Sem Alertmanager: os alertas aparecem na página do Prometheus, limitação declarada.\nDetalhe: docs/D_plano_monitoramento.md, prometheus/alertas.yml");

  // ============================================================ SLIDE 4
  pres.addSection({ title: "Hipóteses e experimentos" });
  s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Hipóteses e experimentos" });
  s.addText("4. Hipóteses e experimentos", { placeholder: "title" });
  pill(s, "Início da E", 11.35, 0.61, 1.38, C.accent1, "entrega");

  card(s, 0.6, 1.45, 6.3, 3.05, "h1");
  tx(s, "H1 · Parar o Rust A", { x: 0.85, y: 1.6, w: 4, h: 0.4, fontSize: 18, bold: true, color: C.text2, fontFace: "Cambria" });
  pill(s, "CONFIRMADA", 5.2, 1.62, 1.5, C.accent2, "h1-status", 0.36);
  tx(s, "O serviço continua via B; 1 a 3 requisições levam ~1 s porque o Nginx espera o connect timeout antes de refazer.",
    { x: 0.85, y: 2.1, w: 5.85, h: 0.75, fontSize: 14 });
  [["20/20", "respostas 200"], ["1,09 s", "3 req. lentas"], ["14 s", "watchdog DOWN"], ["23 s", "alerta NoDown"]].forEach(([n, l], i) => {
    const x = 0.85 + i * 1.47;
    tx(s, n, { x, y: 3.0, w: 1.4, h: 0.6, fontSize: 26, bold: true, color: C.accent2, fontFace: "Cambria" });
    tx(s, l, { x, y: 3.6, w: 1.4, h: 0.5, fontSize: 13, color: C.accent5 });
  });

  const pend = [
    ["H2 · Rust A lento (2,5 s)", "Watchdog diz DOWN (timeout 2 s), mas o Nginx ainda usa A (read 3 s): os dois vão discordar."],
    ["H3 · Parar o watchdog", "Usuário não percebe; MonitorParado em ~35 s; queda real sem NoDown nesse intervalo."],
  ];
  pend.forEach(([t, d], i) => {
    const x = 0.6 + i * 3.2;
    card(s, x, 4.7, 3.1, 1.95, "h" + (i + 2));
    tx(s, t, { x: x + 0.2, y: 4.82, w: 2.7, h: 0.35, fontSize: 15, bold: true, color: C.text2 });
    tx(s, d, { x: x + 0.2, y: 5.2, w: 2.7, h: 1.0, fontSize: 13, color: C.text1 });
    pill(s, "Hora 6", x + 0.2, 6.2, 1.0, C.accent4, "h" + (i + 2) + "-status", 0.3);
  });

  card(s, 7.2, 1.45, 5.53, 5.2, "achado");
  tx(s, "Achado: o nó volta antes do tráfego", { x: 7.45, y: 1.6, w: 5.1, h: 0.4, fontSize: 18, bold: true, color: C.text2, fontFace: "Cambria" });
  s.addChart(pres.ChartType.bar, [
    { name: "Watchdog vê UP", labels: ["Rodada 1", "Rodada 2"], values: [2.2, 3.5] },
    { name: "Tráfego volta ao nó", labels: ["Rodada 1", "Rodada 2"], values: [10.5, 9.4] },
  ], {
    x: 7.4, y: 2.05, w: 5.15, h: 3.0, barDir: "bar", catAxisOrientation: "maxMin", objectName: "grafico-retorno",
    chartColors: [HEX.accent1, HEX.accent3], showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: '0.0" s"',
    dataLabelFontSize: 12, dataLabelColor: HEX.dk1, dataLabelFontFace: "+mn-lt",
    showLegend: true, legendPos: "b", legendFontSize: 12, legendFontFace: "+mn-lt", legendColor: HEX.dk1,
    catAxisLabelFontSize: 12, catAxisLabelColor: HEX.accent5, catAxisLabelFontFace: "+mn-lt",
    valAxisHidden: true, valAxisMaxVal: 12.5, valGridLine: { style: "none" }, catGridLine: { style: "none" },
    showTitle: true, title: "Segundos após docker compose start rust-a", titleFontSize: 12, titleColor: HEX.accent5, titleFontFace: "+mn-lt",
  });
  tx(s, "Monitor e balanceador discordam por ~8 s: o Nginx só re-resolve o DNS a cada 10 s. Próximo: E6 com valid=5s. Previstos também: E2b (retry amplifica carga) e E4 (500 sem retry).",
    { x: 7.45, y: 5.15, w: 5.1, h: 1.35, fontSize: 14 });
  s.addNotes(
    "Integrante 4 (Relator), ~60 s.\n" +
    "Hipótese 1: parar o A não derruba o serviço. Previmos de 1 a 3 requisições lentas de ~1 s, que é o connect timeout. " +
    "Observado: 20 de 20 com 200, três a 1,09 s, watchdog DOWN em 14 s, alerta em 23 s, e depois do start tudo resolvido, sem reinício. " +
    "Mas testar a recuperação mostrou algo que não prevíamos: o watchdog vê o A de volta em 2 a 3,5 s, e o Nginx só manda tráfego para ele depois de ~10 s, porque re-resolve o DNS a cada 10 s. " +
    "Monitor e balanceador discordam. Os próximos experimentos (nó lento, watchdog parado, erro 500) vão explorar essas discordâncias.\n" +
    "Evidências: 05_no_parado_e_recuperacao.txt, 11_tempo_retorno_trafego.txt");

  // ============================================================ SLIDE 5
  pres.addSection({ title: "Riscos e plano" });
  s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Riscos e plano" });
  s.addText("5. Riscos, dificuldades e plano até 12/11", { placeholder: "title" });

  tx(s, "Encontrado nos testes (antes/depois guardados)", { x: 0.6, y: 1.4, w: 6.2, h: 0.4, fontSize: 18, bold: true, color: C.text2, fontFace: "Cambria" });
  const fixes = [
    "Sonda passava do timeout por DNS (3,6 s > 2 s)",
    "Alerta de erro contava 503 que o usuário não viu",
    "Flapping falso por extrapolação de increase()",
    "Healthcheck do Nginx dependia dos nós",
  ];
  for (let i = 0; i < fixes.length; i++) {
    const y = 1.9 + i * 0.5;
    await badgeIcon(s, fa.FaCheck, 0.6, y + 0.04, 0.38, C.accent2, "fix-" + i);
    tx(s, fixes[i], { x: 1.15, y, w: 5.7, h: 0.46, fontSize: 14, valign: "middle" });
  }
  tx(s, "Riscos", { x: 0.6, y: 4.05, w: 6.2, h: 0.4, fontSize: 18, bold: true, color: C.text2, fontFace: "Cambria" });
  const risks = [
    "SLI de erro medido no nó, não na borda (Nginx)",
    "Prometheus sem vigia; tudo num só host",
    "Relógio do WSL2 salta −2,4 s / +5,1 s",
    "Build do Rust na máquina da aula (plano B: imagens salvas)",
  ];
  for (let i = 0; i < risks.length; i++) {
    const y = 4.55 + i * 0.5;
    await badgeIcon(s, fa.FaExclamationTriangle, 0.6, y + 0.04, 0.38, C.accent4, "risco-" + i);
    tx(s, risks[i], { x: 1.15, y, w: 5.7, h: 0.46, fontSize: 14, valign: "middle" });
  }

  card(s, 7.2, 1.4, 5.53, 5.25, "plano");
  tx(s, "Plano", { x: 7.45, y: 1.55, w: 5, h: 0.4, fontSize: 18, bold: true, color: C.text2, fontFace: "Cambria" });
  const plan = [
    ["06–08/11", "Hora 6: E2, E2b, E3, E4 e E6, com previsão e evidência"],
    ["Em aula", "Hora 7: incidente surpresa (checklist pronto)"],
    ["09–10/11", "Relatório F, README final, SLI de erro na borda"],
    ["11/11", "Ensaio cronometrado da demo + vídeo plano B"],
    ["12/11", "Entrega A–G e demonstração ao vivo"],
  ];
  s.addShape(pres.ShapeType.line, { x: 7.67, y: 2.3, w: 0, h: 3.7, line: { color: HEX.accent6, width: 2 }, objectName: "linha-tempo" });
  plan.forEach(([d, t], i) => {
    const y = 2.1 + i * 0.88; const last = i === plan.length - 1;
    s.addShape(pres.ShapeType.ellipse, { x: 7.5, y: y + 0.08, w: 0.34, h: 0.34, fill: { color: last ? C.accent2 : C.accent1 }, line: { color: C.background1, width: 2 }, objectName: "marco-" + i });
    s.addText([{ text: d, options: { bold: true, fontSize: 15, color: last ? C.accent2 : C.accent1, breakLine: true } }, { text: t, options: { fontSize: 13, color: C.text1 } }],
      { x: 8.05, y, w: 4.5, h: 0.78, isTextBox: true, margin: 0, valign: "top", objectName: "marco-texto-" + i });
  });
  s.addNotes(
    "Todos, ~45 s, uma frase cada.\n" +
    "1. Achamos problemas nos nossos testes (timeout que não cobria DNS, dois alertas com falso positivo, healthcheck dependente e relógio que salta) e guardamos o antes e o depois.\n" +
    "2. O maior risco técnico é medir a taxa de erro no nó: o que o usuário vê só o Nginx sabe.\n" +
    "3. Plano: experimentos da Hora 6 até 08/11, relatório e README até 10/11.\n" +
    "4. Ensaio cronometrado e vídeo de plano B em 11/11; entrega em 12/11.\nDetalhe: docs/achados.md");

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("gerado:", OUT);
})().catch((e) => { console.error(e); process.exit(1); });

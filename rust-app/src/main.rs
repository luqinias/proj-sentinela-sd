//! Operação Sentinel — nó de aplicação (rust-a / rust-b).
//!
//! Rotas (Apêndice B do enunciado):
//!   GET /                 -> "atendido por <NODE_NAME>" (aplica atraso artificial)
//!   GET /erro             -> 500 (experimento de taxa de erro)
//!   GET /health/live      -> 200 sempre que o processo responde (NUNCA aplica atraso)
//!   GET /health/ready     -> 200 ou 503 conforme prontidão (aplica atraso artificial)
//!   GET /metrics          -> texto Prometheus
//!   GET /admin/ready?v=0|1   -> liga/desliga prontidão   (só rede interna; Nginx bloqueia)
//!   GET /admin/atraso?ms=N   -> define latência artificial (só rede interna; Nginx bloqueia)
//!
//! Logs: uma linha por evento em stdout no formato
//!   <timestamp ISO-8601 UTC> <serviço> <NÍVEL> request_id=<id> chave=valor ...
//! O request_id vem do cabeçalho X-Request-Id gerado pelo Nginx, o que permite
//! correlacionar a mesma requisição no log do Nginx e no log do nó.

use axum::{
    extract::{Query, Request, State},
    http::{HeaderMap, HeaderValue, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use serde::Deserialize;
use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicBool, AtomicI64, AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

/// Limites dos buckets do histograma de latência (segundos).
const BUCKETS: [f64; 10] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0];
/// Teto do atraso artificial, para que um experimento não trave o nó indefinidamente.
const MAX_DELAY_MS: u64 = 10_000;

struct Metrics {
    /// (rota, status) -> contagem
    requests: Mutex<BTreeMap<(String, u16), u64>>,
    /// Histograma de latência só da rota de usuário "/" (cumulativo por bucket).
    hist_buckets: [AtomicU64; BUCKETS.len()],
    hist_count: AtomicU64,
    hist_sum_micros: AtomicU64,
    inflight: AtomicI64,
}

struct AppState {
    node: String,
    ready: AtomicBool,
    delay_ms: AtomicU64,
    started: Instant,
    start_unix: f64,
    metrics: Metrics,
}

type Shared = Arc<AppState>;

fn now_iso() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

fn log(node: &str, level: &str, msg: &str) {
    println!("{} {} {} {}", now_iso(), node, level, msg);
}

fn request_id(headers: &HeaderMap) -> String {
    headers
        .get("x-request-id")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("-")
        .to_string()
}

/// Normaliza a rota para o rótulo da métrica (evita explosão de cardinalidade).
fn route_label(path: &str) -> &'static str {
    match path {
        "/" => "/",
        "/erro" => "/erro",
        "/health/live" => "/health/live",
        "/health/ready" => "/health/ready",
        "/metrics" => "/metrics",
        p if p.starts_with("/admin/") => "/admin",
        _ => "outro",
    }
}

/// Middleware: mede tempo, conta requisições, registra o log com request_id
/// e devolve ao cliente os cabeçalhos X-Node e X-Request-Id.
async fn observe(State(st): State<Shared>, req: Request, next: Next) -> Response {
    let start = Instant::now();
    let path = req.uri().path().to_string();
    let query = req.uri().query().map(|q| format!("?{q}")).unwrap_or_default();
    let method = req.method().to_string();
    let rid = request_id(req.headers());
    let route = route_label(&path);

    st.metrics.inflight.fetch_add(1, Ordering::Relaxed);
    let mut resp = next.run(req).await;
    st.metrics.inflight.fetch_sub(1, Ordering::Relaxed);

    let elapsed = start.elapsed();
    let status = resp.status().as_u16();
    {
        let mut m = st.metrics.requests.lock().unwrap();
        *m.entry((route.to_string(), status)).or_insert(0) += 1;
    }
    if route == "/" {
        let secs = elapsed.as_secs_f64();
        for (i, b) in BUCKETS.iter().enumerate() {
            if secs <= *b {
                st.metrics.hist_buckets[i].fetch_add(1, Ordering::Relaxed);
            }
        }
        st.metrics.hist_count.fetch_add(1, Ordering::Relaxed);
        st.metrics
            .hist_sum_micros
            .fetch_add(elapsed.as_micros() as u64, Ordering::Relaxed);
    }

    // Sondas e coleta são frequentes: registramos em DEBUG-like só se falharem,
    // para que o log mostre o tráfego de usuário sem ruído.
    let noisy = matches!(route, "/health/live" | "/health/ready" | "/metrics");
    if !noisy || status >= 400 {
        let level = if status >= 500 { "ERROR" } else if status >= 400 { "WARN" } else { "INFO" };
        log(
            &st.node,
            level,
            &format!(
                "request_id={rid} method={method} path={path}{query} status={status} latency_ms={:.2}",
                elapsed.as_secs_f64() * 1000.0
            ),
        );
    }

    let h = resp.headers_mut();
    if let Ok(v) = HeaderValue::from_str(&st.node) {
        h.insert("x-node", v);
    }
    if let Ok(v) = HeaderValue::from_str(&rid) {
        h.insert("x-request-id", v);
    }
    resp
}

async fn artificial_delay(st: &AppState) {
    let ms = st.delay_ms.load(Ordering::Relaxed);
    if ms > 0 {
        tokio::time::sleep(Duration::from_millis(ms)).await;
    }
}

/// Rota de usuário. Se o nó se declarou NÃO PRONTO, recusa com 503: como o
/// Nginx OSS não sonda /health/ready, é essa recusa que faz o Nginx tentar o
/// outro nó (proxy_next_upstream http_503) e, após max_fails, retirá-lo do pool.
async fn root(State(st): State<Shared>, headers: HeaderMap) -> Response {
    artificial_delay(&st).await;
    if !st.ready.load(Ordering::Relaxed) {
        return (StatusCode::SERVICE_UNAVAILABLE, format!("{} nao pronto\n", st.node)).into_response();
    }
    format!("atendido por {} request_id={}\n", st.node, request_id(&headers)).into_response()
}

async fn erro(State(st): State<Shared>) -> impl IntoResponse {
    (StatusCode::INTERNAL_SERVER_ERROR, format!("erro simulado em {}\n", st.node))
}

/// Liveness: só responde. Não depende de prontidão, atraso ou dependências.
async fn live(State(st): State<Shared>) -> impl IntoResponse {
    format!("live {}\n", st.node)
}

/// Readiness: pode receber tráfego agora? Aplica o atraso artificial para que
/// um nó "lento" também seja visto como lento pelo watchdog (timeout de 2 s).
async fn ready(State(st): State<Shared>) -> impl IntoResponse {
    artificial_delay(&st).await;
    if st.ready.load(Ordering::Relaxed) {
        (StatusCode::OK, format!("ready {}\n", st.node))
    } else {
        (StatusCode::SERVICE_UNAVAILABLE, format!("not-ready {}\n", st.node))
    }
}

#[derive(Deserialize)]
struct ReadyParam {
    v: Option<u8>,
}

async fn admin_ready(State(st): State<Shared>, headers: HeaderMap, Query(p): Query<ReadyParam>) -> Response {
    match p.v {
        Some(v @ (0 | 1)) => {
            st.ready.store(v == 1, Ordering::Relaxed);
            log(&st.node, "WARN", &format!("request_id={} admin=ready valor={v}", request_id(&headers)));
            (StatusCode::OK, format!("{} ready={}\n", st.node, v)).into_response()
        }
        _ => (StatusCode::BAD_REQUEST, "use ?v=0 ou ?v=1\n").into_response(),
    }
}

#[derive(Deserialize)]
struct DelayParam {
    ms: Option<u64>,
}

async fn admin_atraso(State(st): State<Shared>, headers: HeaderMap, Query(p): Query<DelayParam>) -> Response {
    match p.ms {
        Some(ms) => {
            let ms = ms.min(MAX_DELAY_MS);
            st.delay_ms.store(ms, Ordering::Relaxed);
            log(&st.node, "WARN", &format!("request_id={} admin=atraso ms={ms}", request_id(&headers)));
            (StatusCode::OK, format!("{} atraso_ms={}\n", st.node, ms)).into_response()
        }
        None => (StatusCode::BAD_REQUEST, "use ?ms=N\n").into_response(),
    }
}

async fn metrics(State(st): State<Shared>) -> impl IntoResponse {
    let n = &st.node;
    let mut out = String::new();

    out.push_str("# HELP app_requests_total Requisicoes atendidas pelo no, por rota e status HTTP.\n");
    out.push_str("# TYPE app_requests_total counter\n");
    for ((route, status), c) in st.metrics.requests.lock().unwrap().iter() {
        out.push_str(&format!(
            "app_requests_total{{node=\"{n}\",route=\"{route}\",status=\"{status}\"}} {c}\n"
        ));
    }

    out.push_str("# HELP app_request_duration_seconds Latencia da rota de usuario / (inclui atraso artificial).\n");
    out.push_str("# TYPE app_request_duration_seconds histogram\n");
    for (i, b) in BUCKETS.iter().enumerate() {
        out.push_str(&format!(
            "app_request_duration_seconds_bucket{{node=\"{n}\",le=\"{b}\"}} {}\n",
            st.metrics.hist_buckets[i].load(Ordering::Relaxed)
        ));
    }
    let count = st.metrics.hist_count.load(Ordering::Relaxed);
    out.push_str(&format!("app_request_duration_seconds_bucket{{node=\"{n}\",le=\"+Inf\"}} {count}\n"));
    out.push_str(&format!(
        "app_request_duration_seconds_sum{{node=\"{n}\"}} {}\n",
        st.metrics.hist_sum_micros.load(Ordering::Relaxed) as f64 / 1e6
    ));
    out.push_str(&format!("app_request_duration_seconds_count{{node=\"{n}\"}} {count}\n"));

    out.push_str("# HELP app_inflight_requests Requisicoes em andamento (saturacao).\n");
    out.push_str("# TYPE app_inflight_requests gauge\n");
    // desconta a propria requisicao de /metrics
    out.push_str(&format!(
        "app_inflight_requests{{node=\"{n}\"}} {}\n",
        st.metrics.inflight.load(Ordering::Relaxed) - 1
    ));

    out.push_str("# HELP app_ready Estado de prontidao declarado pelo no (1 pronto, 0 nao pronto).\n");
    out.push_str("# TYPE app_ready gauge\n");
    out.push_str(&format!("app_ready{{node=\"{n}\"}} {}\n", st.ready.load(Ordering::Relaxed) as u8));

    out.push_str("# HELP app_artificial_delay_ms Atraso artificial configurado via /admin/atraso.\n");
    out.push_str("# TYPE app_artificial_delay_ms gauge\n");
    out.push_str(&format!("app_artificial_delay_ms{{node=\"{n}\"}} {}\n", st.delay_ms.load(Ordering::Relaxed)));

    out.push_str("# HELP app_start_time_seconds Instante (unix) em que o processo iniciou; muda a cada reinicio.\n");
    out.push_str("# TYPE app_start_time_seconds gauge\n");
    out.push_str(&format!("app_start_time_seconds{{node=\"{n}\"}} {:.3}\n", st.start_unix));

    out.push_str("# HELP app_uptime_seconds Tempo de vida do processo.\n");
    out.push_str("# TYPE app_uptime_seconds gauge\n");
    out.push_str(&format!("app_uptime_seconds{{node=\"{n}\"}} {:.3}\n", st.started.elapsed().as_secs_f64()));

    ([("content-type", "text/plain; version=0.0.4")], out)
}

async fn shutdown_signal(node: String) {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    let term = async {
        if let Ok(mut s) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            s.recv().await;
        }
    };
    tokio::select! { _ = ctrl_c => {}, _ = term => {} }
    log(&node, "WARN", "evento=shutdown motivo=sinal_recebido");
}

#[tokio::main]
async fn main() {
    let node = std::env::var("NODE_NAME").unwrap_or_else(|_| "rust-desconhecido".into());
    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);
    let start_unix = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs_f64();

    let st: Shared = Arc::new(AppState {
        node: node.clone(),
        ready: AtomicBool::new(true),
        delay_ms: AtomicU64::new(0),
        started: Instant::now(),
        start_unix,
        metrics: Metrics {
            requests: Mutex::new(BTreeMap::new()),
            hist_buckets: Default::default(),
            hist_count: AtomicU64::new(0),
            hist_sum_micros: AtomicU64::new(0),
            inflight: AtomicI64::new(0),
        },
    });

    let app = Router::new()
        .route("/", get(root))
        .route("/erro", get(erro))
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .route("/metrics", get(metrics))
        .route("/admin/ready", get(admin_ready))
        .route("/admin/atraso", get(admin_atraso))
        .layer(middleware::from_fn_with_state(st.clone(), observe))
        .with_state(st.clone());

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await.expect("bind");
    log(&node, "INFO", &format!("evento=startup porta={port} ready=1 atraso_ms=0"));
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal(node))
        .await
        .expect("server");
}

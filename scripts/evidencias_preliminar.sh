#!/usr/bin/env bash
# =============================================================================
# Coleta de evidências da apresentação preliminar (Horas 2 a 5).
# Cada seção grava um arquivo em evidencias/preliminar/ com horário (UTC).
# Ao final o ambiente volta ao estado normal (rust-a de pé, pronto, sem atraso).
# Uso: scripts/evidencias_preliminar.sh
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."
OUT=evidencias/preliminar
mkdir -p "$OUT"
NET=sentinel_sentinel
NGINX_IMG=nginx:1.27.5-alpine

ts()   { date -u +%Y-%m-%dT%H:%M:%S.%3NZ; }
sec()  { echo; echo "=== [$(ts)] $* ==="; }
run()  { echo "\$ $*"; "$@" 2>&1; echo; }
prom()    { python3 scripts/promq.py query "$1"; }
alertas() { python3 scripts/promq.py alerts; }
esperar() { sec "aguardando $1 s ($2)"; sleep "$1"; }

# Pré-condição: os 5 serviços precisam estar em execução (senão os "exec" travam)
rodando=$(docker compose ps --status running --services | wc -l)
if [ "$rodando" -lt 5 ]; then
  echo "ERRO: só $rodando/5 serviços em execução. Rode: docker compose up -d --build" >&2
  docker compose ps -a >&2; exit 1
fi

# Garante estado inicial limpo
scripts/admin.sh ready rust-a 1 >/dev/null 2>&1; scripts/admin.sh atraso rust-a 0 >/dev/null 2>&1
docker compose start rust-a >/dev/null 2>&1

# --------------------------------------------------------------------------- 01
{
  sec "HORA 2 — estado da topologia"
  run docker compose ps
  run docker compose images
  sec "Portas publicadas (só nginx:8080 e prometheus em 127.0.0.1:9090)"
  for s in nginx rust-a rust-b watchdog prometheus; do
    printf '%-11s ' "$s"; docker compose ps --format '{{.Publishers}}' "$s"
  done
  echo
  run docker network inspect $NET --format '{{range .Containers}}{{.Name}} {{.IPv4Address}}{{"\n"}}{{end}}'
} > "$OUT/01_compose_ps.txt"

# --------------------------------------------------------------------------- 02
{
  sec "HORA 2 — primeiras linhas de log de cada serviço"
  for s in nginx rust-a rust-b watchdog prometheus; do
    echo "--- $s ---"; docker compose logs --no-log-prefix "$s" 2>&1 | head -8; echo
  done
} > "$OUT/02_logs_iniciais.txt"

# --------------------------------------------------------------------------- 03
{
  sec "HORA 3 — health checks de um nó saudável (de dentro da rede, a partir de rust-b)"
  run scripts/admin.sh live  rust-a
  run scripts/admin.sh check rust-a
  sec "Tornando rust-a NÃO PRONTO (/admin/ready?v=0)"
  run scripts/admin.sh ready rust-a 0
  sec "rust-a: live continua 200 (processo vivo), ready vira 503 (não recebe tráfego)"
  run scripts/admin.sh live  rust-a
  run scripts/admin.sh check rust-a
  sec "Tráfego de usuário com rust-a não pronto: 10 requisições pelo Nginx"
  run scripts/teste_sintetico.sh 10
  sec "Log do Nginx: upstream_status '503, 200' = tentou A, recebeu 503, refez em B"
  docker compose logs --no-log-prefix --since 15s nginx 2>&1 | grep 'uri=/ ' | tail -10
  esperar 18 "watchdog precisa de 3 sondagens x 5 s para declarar DOWN"
  sec "Log do watchdog (falhas consecutivas e transição DOWN)"
  docker compose logs --no-log-prefix --since 25s watchdog 2>&1 | grep -v 'ciclo resumo' | tail -8
  sec "Restaurando prontidão de rust-a"
  run scripts/admin.sh ready rust-a 1
  esperar 7 "uma sondagem bem-sucedida basta para voltar a UP"
  docker compose logs --no-log-prefix --since 10s watchdog 2>&1 | grep -E 'UP|resumo' | tail -3
  sec "Tentativa de acessar /admin e /metrics pela porta pública (deve ser 404)"
  run curl -s -o /dev/null -w 'GET /admin/ready?v=0 -> %{http_code}\n' "http://localhost:8080/admin/ready?v=0"
  run curl -s -o /dev/null -w 'GET /metrics          -> %{http_code}\n' http://localhost:8080/metrics
} > "$OUT/03_health_checks.txt"

# --------------------------------------------------------------------------- 04
{
  sec "HORA 4 — 20 requisições com os dois nós de pé (round-robin)"
  run scripts/teste_sintetico.sh 20
  sec "Correlação: o mesmo request_id no Nginx e no Rust"
  rid=$(curl -s -D - -o /dev/null http://localhost:8080/ | tr -d '\r' | awk -F': ' 'tolower($1)=="x-request-id"{print $2}')
  echo "request_id escolhido: $rid"; sleep 1
  docker compose logs --no-log-prefix nginx rust-a rust-b 2>&1 | grep "$rid"
} > "$OUT/04_balanceamento_20req.txt"

# --------------------------------------------------------------------------- 05
{
  sec "HORA 4 — Falha de um nó: docker compose stop rust-a"
  echo "PREVISÃO: o serviço continua (200 via rust-b). A 1a requisição destinada a A"
  echo "falha na conexão e é refeita em B (retry limitado); após 3 falhas o Nginx tira A"
  echo "do pool por 10 s. O watchdog marca A como DOWN em ~15 s."
  run docker compose stop rust-a
  sec "20 requisições logo após parar rust-a"
  run scripts/teste_sintetico.sh 20
  sec "Log do Nginx (upstream com 2 endereços = retry) e error_log"
  echo "(só linhas com retry — 2 upstreams — e o error_log; as demais foram direto a rust-b)"
  docker compose logs --no-log-prefix --since 20s nginx 2>&1 | grep -E 'upstream=[0-9.:]+, |\[(error|warn)\]'
  esperar 28 "watchdog: 3 falhas consecutivas -> DOWN (~15 s); Prometheus: NoDown pending -> firing"
  sec "Log do watchdog"
  docker compose logs --no-log-prefix --since 40s watchdog 2>&1 | grep -v 'ciclo resumo' | grep rust-a | tail -6
  sec "Métricas no Prometheus"
  echo "watchdog_target_down:"; prom 'watchdog_target_down'
  echo "up{job=\"rust\"}:";     prom 'up{job="rust"}'
  sec "Alertas no Prometheus"; alertas
  sec "RECUPERAÇÃO: docker compose start rust-a"
  run docker compose start rust-a
  esperar 4 "rust-a sobe, watchdog vê UP na próxima sondagem"
  docker compose logs --no-log-prefix --since 10s watchdog 2>&1 | grep -E 'transicao' | tail -3
  docker compose logs --no-log-prefix --since 10s rust-a 2>&1 | grep startup
  sec "6 requisições ~4 s após o start: watchdog já vê UP, mas o Nginx ainda NÃO (janela do resolver valid=10s)"
  run scripts/teste_sintetico.sh 6
  esperar 10 "Nginx re-resolve rust-a (valid=10s) e o recoloca no pool"
  sec "20 requisições após a re-resolução (A volta a receber tráfego)"
  run scripts/teste_sintetico.sh 20
  sec "Sem reinício em loop: RestartCount do Docker e reinícios vistos pelo Prometheus"
  for s in rust-a rust-b; do
    printf '%s RestartCount=' "$s"; docker inspect -f '{{.RestartCount}}' "sentinel-$s-1"
  done
  echo "changes(app_start_time_seconds[10m]):"; prom 'changes(app_start_time_seconds[10m])'
  esperar 10 "alertas resolvem na próxima avaliação"
  sec "Alertas após recuperação"; alertas
} > "$OUT/05_no_parado_e_recuperacao.txt"

# --------------------------------------------------------------------------- 06
{
  sec "HORA 4 — Configuração quebrada de propósito (cópia; o Nginx em produção não é tocado)"
  tmpd=$(mktemp -d)
  sed 's/proxy_connect_timeout 1s;/proxy_connect_timeout 1s/' nginx/nginx.conf > "$tmpd/sem_ponto_virgula.conf"
  sed 's/server rust-b:8080 max_fails=3 fail_timeout=10s resolve;/server rust-c:8080 max_fails=3 fail_timeout=10s;/' nginx/nginx.conf > "$tmpd/host_inexistente.conf"
  sed 's/proxy_pass http:\/\/rust_pool;/proxy_pass http:\/\/pool_errado;/' nginx/nginx.conf > "$tmpd/upstream_errado.conf"
  for f in sem_ponto_virgula host_inexistente upstream_errado; do
    echo "--- $f: diff contra o original ---"
    diff nginx/nginx.conf "$tmpd/$f.conf" | sed 's/^/  /'
    echo "--- nginx -t ---"
    docker run --rm --network $NET -v "$tmpd/$f.conf:/etc/nginx/nginx.conf:ro" $NGINX_IMG nginx -t 2>&1 | grep -v docker-entrypoint | grep -v 'Configuration complete\|envsh\|\.sh'
    echo
  done
  rm -rf "$tmpd"
  sec "Configuração real continua válida"
  run docker compose exec -T nginx nginx -t
} > "$OUT/06_config_quebrada.txt"

# --------------------------------------------------------------------------- 07
{
  sec "HORA 5 — /metrics de um nó Rust (coletado de dentro da rede)"
  scripts/admin.sh metrics rust-b
  sec "HORA 5 — /metrics do watchdog"
  docker compose exec -T watchdog wget -q -O - http://127.0.0.1:9100/metrics
} > "$OUT/07_metricas_brutas.txt"

# --------------------------------------------------------------------------- 08
{
  sec "HORA 5 — Prometheus: alvos de coleta"
  python3 scripts/promq.py targets
  sec "Regras de alerta carregadas"
  python3 scripts/promq.py rules
  sec "As 5 métricas do plano (valores atuais)"
  echo "M1 disponibilidade por nó (watchdog_target_up):";  prom 'watchdog_target_up'
  echo "M2 taxa de erro 5xx de usuário (2m) — fórmula do alerta (sem 503 de readiness):"
  prom 'sum(rate(app_requests_total{route=~"/|/erro",status=~"5..",status!="503"}[2m]) or vector(0)) / sum(rate(app_requests_total{route=~"/|/erro"}[2m]))'
  echo "M2' mesma taxa CONTANDO os 503 de readiness (fórmula antiga, achado 5):"
  prom 'sum(rate(app_requests_total{route=~"/|/erro",status=~"5.."}[2m])) / sum(rate(app_requests_total{route=~"/|/erro"}[2m]))'
  echo "M3 latência p95 da rota / (2m), por nó:";          prom 'histogram_quantile(0.95, sum by (node,le)(rate(app_request_duration_seconds_bucket[2m])))'
  echo "M4 saturação (requisições em andamento):";         prom 'app_inflight_requests'
  echo "M5 idade da última sondagem do watchdog (s):";     prom 'time() - max(watchdog_last_probe_timestamp_seconds)'
  echo "Extra: tráfego por nó (req/s, 1m):";              prom 'sum by (node)(rate(app_requests_total{route="/"}[1m]))'
  sec "Alertas atuais"; alertas
} > "$OUT/08_prometheus_metricas_alertas.txt"

# --------------------------------------------------------------------------- 09
{
  sec "Exposição de portas no host (nenhuma porta administrativa exposta à rede)"
  run sh -c "ss -ltn | grep -E ':(8080|9090|9100) ' || true"
  echo "Esperado: 0.0.0.0:8080 (nginx) e 127.0.0.1:9090 (prometheus). 9100 e 8080 dos nós NÃO aparecem."
  sec "Tentativas a partir do host"
  for u in http://localhost:8080/metrics "http://localhost:8080/admin/atraso?ms=9999" http://localhost:9100/metrics; do
    printf '%-45s -> ' "$u"; c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$u"); [ "$c" = 000 ] && echo "sem conexão (porta não publicada)" || echo "$c"
  done
} > "$OUT/09_portas_expostas.txt"

echo "Evidências gravadas em $OUT/:"; ls -1 "$OUT"

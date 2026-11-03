#!/usr/bin/env bash
# Chamadas administrativas "de dentro da rede" (o Nginx bloqueia /admin e /metrics).
# A chamada parte do contêiner do OUTRO nó, ou do watchdog para métricas, nunca do host.
# Uso:
#   scripts/admin.sh ready  rust-a 0|1     -> liga/desliga prontidão
#   scripts/admin.sh atraso rust-a 2500    -> latência artificial (ms; 0 desliga)
#   scripts/admin.sh live   rust-a         -> GET /health/live
#   scripts/admin.sh check  rust-a         -> GET /health/ready (mostra status)
#   scripts/admin.sh metrics rust-a        -> GET /metrics
set -euo pipefail
cd "$(dirname "$0")/.."
acao=${1:?acao}; no=${2:?no}; valor=${3:-}
# executa a partir do outro nó (se o alvo for rust-a, usa rust-b e vice-versa)
de=$([ "$no" = "rust-a" ] && echo rust-b || echo rust-a)
c() { docker compose exec -T "$de" curl -sS -i --max-time 5 "$@"; }
case "$acao" in
  ready)   c "http://$no:8080/admin/ready?v=${valor:?0|1}" ;;
  atraso)  c "http://$no:8080/admin/atraso?ms=${valor:?ms}" ;;
  live)    c "http://$no:8080/health/live" ;;
  check)   c "http://$no:8080/health/ready" ;;
  metrics) docker compose exec -T "$de" curl -sS --max-time 5 "http://$no:8080/metrics" ;;
  *) echo "acao desconhecida: $acao" >&2; exit 2 ;;
esac

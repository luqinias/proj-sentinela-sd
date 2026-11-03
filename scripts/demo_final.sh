#!/usr/bin/env bash
# =============================================================================
# Roteiro da demonstração ao vivo (12/11, 5 min). Cada passo PAUSA: o narrador
# diz a previsão, aperta ENTER, e o comando roda. Ver docs/apresentacao/roteiro_demo_final.md
# Uso: scripts/demo_final.sh            (todos os passos)
#      scripts/demo_final.sh 3          (a partir do passo 3)
# =============================================================================
cd "$(dirname "$0")/.."
INICIO=${1:-1}
B=$'\e[1;36m'; Y=$'\e[1;33m'; N=$'\e[0m'
passo() { echo; echo "${B}━━━ PASSO $1 — $2 ━━━${N}"; echo "${Y}PREVISÃO: $3${N}"; read -rp "[ENTER para executar] " _; }
cmd()   { echo "${B}\$ $*${N}"; eval "$@"; }

if [ "$INICIO" -le 1 ]; then
passo 1 "Estado inicial (30 s)" "5 serviços Up (healthy); só 8080 e 127.0.0.1:9090 publicadas."
cmd "date -u +%T; docker compose ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}'"
fi

if [ "$INICIO" -le 2 ]; then
passo 2 "Fluxo normal (45 s)" "6 requisições alternando A,B,A,B…; o mesmo request_id no Nginx e no Rust."
cmd "scripts/teste_sintetico.sh 6"
cmd "rid=\$(curl -s -D - -o /dev/null localhost:8080/ | tr -d '\r' | awk -F': ' 'tolower(\$1)==\"x-request-id\"{print \$2}'); sleep 1; docker compose logs --no-log-prefix nginx rust-a rust-b | grep \$rid"
fi

if [ "$INICIO" -le 3 ]; then
passo 3 "Falha de um nó (90 s)" "Serviço continua 200 via B; 1-3 req ~1 s; watchdog DOWN em ~15 s; NoDown em ~20-25 s."
cmd "docker compose stop rust-a"
cmd "scripts/teste_sintetico.sh 10 | tail -6"
cmd "docker compose logs --no-log-prefix --since 30s nginx | grep -E 'upstream=[0-9.:]+, ' | tail -3"
echo "(aguardando 25 s pelo watchdog…)"; sleep 25
cmd "docker compose logs --no-log-prefix --since 40s watchdog | grep -v resumo | grep rust-a | tail -4"
cmd "python3 scripts/promq.py alerts"
fi

if [ "$INICIO" -le 4 ]; then
passo 4 "Vivo, mas não pronto (60 s)" "rust-b: live 200 e ready 503; usuário segue 200 (via A, que voltou)."
cmd "docker compose start rust-a; sleep 12"
cmd "scripts/admin.sh ready rust-b 0 | tail -1"
cmd "scripts/admin.sh live rust-b | head -1; scripts/admin.sh check rust-b | head -1"
cmd "scripts/teste_sintetico.sh 6 | tail -5"
cmd "scripts/admin.sh ready rust-b 1 | tail -1"
fi

if [ "$INICIO" -le 5 ]; then
passo 5 "Recuperação (45 s)" "A e B de volta ao revezamento; RestartCount 0; alertas resolvidos."
echo "(aguardando 12 s pela re-resolução do Nginx…)"; sleep 12
cmd "scripts/teste_sintetico.sh 10 | grep -A3 'por no'"
cmd "for s in rust-a rust-b; do echo \$s RestartCount=\$(docker inspect -f '{{.RestartCount}}' sentinel-\$s-1); done"
cmd "python3 scripts/promq.py alerts"
fi

if [ "$INICIO" -le 6 ]; then
passo 6 "Falha do monitor (30 s)" "Usuário não percebe; MonitorParado dispara após 30 s sem sondagem. Quem vigia o vigia: o Prometheus."
cmd "docker compose stop watchdog"
cmd "scripts/teste_sintetico.sh 3 | tail -4"
echo "(aguardando 35 s…)"; sleep 35
cmd "python3 scripts/promq.py query 'time() - max(max_over_time(watchdog_last_probe_timestamp_seconds[10m]))'"
cmd "python3 scripts/promq.py alerts"
cmd "docker compose start watchdog"
fi
echo; echo "${B}Fim da demonstração.${N}"

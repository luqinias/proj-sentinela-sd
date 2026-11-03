#!/usr/bin/env bash
# Mede quanto tempo o tráfego leva para voltar a um nó depois do "start".
# Para o nó, espera o watchdog marcar DOWN, sobe o nó e manda 1 req a cada 0,5 s
# (relógio monotônico via python), anotando quando o nó volta a atender.
# Uso: scripts/medir_retorno.sh [no=rust-a] [espera_parado_s=25]
cd "$(dirname "$0")/.."
NO=${1:-rust-a}; PARADO=${2:-25}
now() { python3 -c 'import time;print(f"{time.monotonic():.3f}")'; }
echo "[$(date -u +%T)] stop $NO e espera ${PARADO}s parado"; docker compose stop "$NO" >/dev/null 2>&1; sleep "$PARADO"
t0=$(now); echo "[$(date -u +%T)] start $NO (t=0)"; docker compose start "$NO" >/dev/null 2>&1
primeiro_live=""; primeiro_trafego=""
for i in $(seq 80); do
  t=$(python3 -c "print(f'{$(now)-$t0:.1f}')")
  no=$(curl -s --max-time 3 localhost:8080/ | sed -n 's/^atendido por \([a-z-]*\).*/\1/p')
  wd=$(docker compose logs --no-log-prefix --since 60s watchdog 2>/dev/null | grep -c "alvo=$NO.*transicao=UP")
  [ -z "$primeiro_live" ] && [ "$wd" -gt 0 ] && primeiro_live=$t && echo "  t=${t}s watchdog ja registrou $NO UP"
  printf '  t=%5ss atendido_por=%s\n' "$t" "${no:-ERRO}"
  if [ "$no" = "$NO" ]; then primeiro_trafego=$t; break; fi
  sleep 0.5
done
echo "RESULTADO: watchdog UP em ~${primeiro_live:-?}s; primeira requisicao de usuario em $NO em ${primeiro_trafego:-nao voltou em 40s}s apos o start"
echo "--- error_log do nginx no periodo:"
docker compose logs --no-log-prefix --since 70s nginx 2>&1 | grep -E '\[(error|warn)\]' | tail -6

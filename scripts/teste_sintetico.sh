#!/usr/bin/env bash
# Teste sintético: percorre o caminho REAL do usuário (host -> Nginx -> nó Rust).
# Uso: scripts/teste_sintetico.sh [N=20] [URL=http://localhost:8080/]
# Saída: uma linha por requisição + contagem por nó e por status.
N=${1:-20}; URL=${2:-http://localhost:8080/}
tmp=$(mktemp)
for i in $(seq "$N"); do
  # %{http_code} status, %{time_total} tempo total, cabeçalho X-Request-Id
  out=$(curl -s -o /tmp/.corpo.$$ -D - --max-time 10 -w '\nSTATUS=%{http_code} TEMPO=%{time_total}' "$URL")
  rid=$(printf '%s' "$out" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-request-id"{print $2}')
  st=$(printf '%s' "$out" | sed -n 's/.*STATUS=\([0-9]*\).*/\1/p')
  tt=$(printf '%s' "$out" | sed -n 's/.*TEMPO=\([0-9.]*\).*/\1/p')
  corpo=$(head -c 80 /tmp/.corpo.$$ | tr -d '\n')
  no=$(printf '%s' "$corpo" | sed -n 's/^atendido por \([a-z-]*\).*/\1/p'); no=${no:-nenhum}
  printf '%s #%02d status=%s tempo=%ss no=%s request_id=%s\n' "$(date -u +%H:%M:%S.%3N)" "$i" "$st" "$tt" "$no" "$rid" | tee -a "$tmp"
done
rm -f /tmp/.corpo.$$
echo "--- contagem por no ---";     grep -o 'no=[a-z-]*' "$tmp" | sort | uniq -c
echo "--- contagem por status ---"; grep -o 'status=[0-9]*' "$tmp" | sort | uniq -c
echo "--- 3 mais lentas ---"; awk '{t=$4; sub("tempo=","",t); sub("s$","",t); print t, $0}' "$tmp" | sort -rn | head -3 | cut -d' ' -f2-
rm -f "$tmp"

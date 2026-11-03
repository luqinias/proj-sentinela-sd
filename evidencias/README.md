# Evidências

Regra do enunciado: *evidência registrada na hora em que acontece; ninguém afirma sem prova.*
Todos os arquivos são saídas reais de comandos, com horário UTC no cabeçalho de cada seção.
Gerados por `scripts/evidencias_preliminar.sh` (01–09), `scripts/medir_relogio.py` (10),
`scripts/medir_retorno.sh` (11) e `scripts/demo_final.sh` (ensaio). Máquina: WSL2, Docker 29.3.

> Horários: o relógio do host salta alguns segundos (arquivo 10). Para ordenar eventos de
> serviços diferentes, prefira o `request_id` e a ordem dentro de cada log.

## `preliminar/` — Horas 2 a 5 (02/11/2026)

| Arquivo | Etapa | Prova que… |
|---|---|---|
| `00_up_build.log` | Hora 2 | a topologia constrói e sobe com `docker compose up -d --build` |
| `01_compose_ps.txt` | Hora 2 | 5 serviços `Up (healthy)`; só 8080 e 127.0.0.1:9090 publicadas; versões fixadas |
| `02_logs_iniciais.txt` | Hora 2 | primeiras linhas de log de cada serviço (formato com horário, serviço, nível) |
| `03_health_checks.txt` | Hora 3 | live 200 / ready 200 → ready=0 → live 200 / ready 503; usuário segue 200 (`503, 200` no Nginx); watchdog DOWN após 3 falhas e UP depois; `/admin` e `/metrics` → 404 pela porta pública |
| `04_balanceamento_20req.txt` | Hora 4 | 20 req → A 10 / B 10; mesmo `request_id` no Nginx e no Rust |
| `05_no_parado_e_recuperacao.txt` | Hora 4 / E1 | stop rust-a: 20/20 com 200, req lentas ~1,09 s, error log, watchdog DOWN, `NoDown` firing; start: janela até o tráfego voltar, 20 req balanceadas, `RestartCount=0`, alertas resolvidos |
| `05b_ANTES_correcao_watchdog_dns.txt` | achados 1, 2, 3 | **antes** das correções: sonda de 3,6 s com timeout 2 s; `WatchdogFlapping` falso |
| `05c_ANTES_correcao_sli_erro_e_janela_retorno.txt` | achados 4, 5 | **antes**: `TaxaErro5xxAlta` falso positivo; 20/20 ainda em B 10 s após o start |
| `06_config_quebrada.txt` | Hora 4 | `nginx -t` em 3 cópias quebradas: erro com arquivo e linha |
| `07_metricas_brutas.txt` | Hora 5 | texto Prometheus de um nó e do watchdog |
| `08_prometheus_metricas_alertas.txt` | Hora 5 | alvos `up`, 8 regras carregadas, valores das 5 métricas, alertas |
| `09_portas_expostas.txt` | Hora 5 passo 4 | nenhuma porta administrativa/métrica acessível de fora |
| `10_relogio_wsl.txt` | achado 7 | saltos de −2,4 s / +5,1 s no relógio, no host e no contêiner |
| `11_tempo_retorno_trafego.txt` | achados 4, 6 / E6 | watchdog UP em 2–3,5 s × tráfego de volta em 9,4–10,5 s (2 rodadas) |

## `ensaio_demo/`

Execução não interativa de `scripts/demo_final.sh` (ENTER automático) para conferir que o
roteiro de 12/11 roda do início ao fim.

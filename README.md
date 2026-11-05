# Operação Sentinel — Cluster Distribuído Resiliente

FEELT31830 Sistemas Distribuídos 2026/2 · Prof. Renato Carrijo

Nginx reparte o tráfego entre duas instâncias de uma aplicação Rust; um watchdog
independente sonda a saúde dos nós e o caminho do usuário; o Prometheus coleta
métricas e avalia alertas. Tudo em Docker Compose, numa única máquina.

> **Equipe:** José Lucas · Gabriel Azevedo · Alex Burdelis · **Líder:** _(preencher)_ · Papéis: Infra (Compose/Nginx),
> Aplicação (Rust/health checks), Observabilidade (watchdog/métricas/alertas), Relator.

## Estrutura

```
docker-compose.yml        topologia (entrega B)
nginx/nginx.conf          proxy reverso comentado (entrega C)
rust-app/                 nó da aplicação: Cargo.toml, src/main.rs, Dockerfile
watchdog/                 monitor independente (Python, só stdlib)
prometheus/               prometheus.yml (coleta) e alertas.yml (entrega D)
scripts/                  teste sintético, chamadas admin internas, coleta de evidências
docs/                     A–F, guia de logs, achados, apresentação
evidencias/               saídas de comandos e logs com horário
```

## Pré-requisitos

Docker Engine com Compose v2 (testado: Docker 29.3, Compose 5.1, WSL2), `curl`, `python3`.
Portas livres no host: `8080` e `127.0.0.1:9090`.

## 1. Inicialização

```bash
docker compose up -d --build      # primeira vez compila o Rust (~1-2 min)
docker compose ps                 # os 5 serviços "Up (healthy)" em ~20 s
```

| Serviço | Acesso | Observação |
|---|---|---|
| Aplicação (via Nginx) | http://localhost:8080/ | única porta de usuário |
| Prometheus | http://127.0.0.1:9090 (`/alerts`, `/targets`) | só local |
| rust-a, rust-b, watchdog | **sem acesso pelo host** | só rede interna `sentinel` |

## 2. Verificar estado e logs

```bash
docker compose ps                                   # estado + healthcheck (liveness)
docker compose logs --tail=100                      # últimas linhas de todos
docker compose logs -f nginx rust-a rust-b watchdog # seguir ao vivo
docker compose logs watchdog | grep -v resumo       # só falhas e transições do watchdog
```

Formato dos logs e como ler cada campo: [`docs/guia_de_logs.md`](docs/guia_de_logs.md).

## 3. Testes

```bash
curl -i http://localhost:8080/                 # cabeçalhos X-Request-Id e X-Upstream
scripts/teste_sintetico.sh 20                  # 20 requisições + contagem por nó/status
scripts/admin.sh live  rust-a                  # liveness  (parte de rust-b, dentro da rede)
scripts/admin.sh check rust-a                  # readiness (200 ou 503)
scripts/admin.sh metrics rust-a | head -30     # métricas do nó
python3 scripts/promq.py alerts                # alertas pendentes/disparados
python3 scripts/promq.py query 'watchdog_target_up'
```

Correlacionar uma requisição no Nginx e no nó:

```bash
rid=$(curl -s -D - -o /dev/null localhost:8080/ | tr -d '\r' | awk -F': ' 'tolower($1)=="x-request-id"{print $2}')
docker compose logs --no-log-prefix nginx rust-a rust-b | grep "$rid"
```

## 4. Falhas simuladas (uma de cada vez)

| Falha | Provocar | Observar |
|---|---|---|
| Nó fora do ar | `docker compose stop rust-a` | `scripts/teste_sintetico.sh 20` (tudo via B); `docker compose logs watchdog` (DOWN em ~15 s); `/alerts` (NoDown) |
| Vivo, mas não pronto | `scripts/admin.sh ready rust-a 0` | `live` 200 e `check` 503; log do Nginx com `upstream_status=503, 200` |
| Nó lento | `scripts/admin.sh atraso rust-a 2500` | tempos de ~2,5 s em metade das requisições; watchdog DOWN (sonda tem timeout 2 s) |
| Erro da aplicação | `curl -i localhost:8080/erro` (repetir) | 500 **sem** retry; alerta `TaxaErro5xxAlta` |
| Monitor parado | `docker compose stop watchdog` | alerta `MonitorParado` em ~35 s |
| Config Nginx quebrada | editar cópia e `docker run … nginx -t` (ver `scripts/evidencias_preliminar.sh`, seção 06) | mensagem de erro com arquivo e linha |

## 5. Recuperação

```bash
docker compose start rust-a            # nó volta; watchdog UP na próxima sondagem
scripts/admin.sh ready  rust-a 1       # volta a ficar pronto
scripts/admin.sh atraso rust-a 0       # remove o atraso
docker compose start watchdog
scripts/teste_sintetico.sh 20          # confirmar alternância A/B de novo
docker inspect -f '{{.RestartCount}}' sentinel-rust-a-1   # sem reinício em loop
```

## 6. Coleta de evidências

```bash
scripts/evidencias_preliminar.sh       # Horas 2-5 -> evidencias/preliminar/*.txt (~2 min)
python3 scripts/medir_relogio.py 60    # saltos do relógio do host (WSL2)
```

## 7. Limpeza

```bash
docker compose down                    # remove contêineres e rede
docker compose down --rmi local        # também remove as imagens construídas localmente
```

## Limitações conhecidas (declaradas)

* Rede simulada numa única máquina: falhas **não** são independentes (ver `docs/A_arquitetura_e_spof.md`).
* Sem Alertmanager: alertas só aparecem na UI/API do Prometheus.
* Nginx sem exporter de métricas; erros gerados pelo próprio Nginx são vistos pelo teste sintético e pelo log.
* Nginx OSS não faz health check ativo: a retirada de nó é passiva (falhas no tráfego real).
* Relógio do host WSL2 dá saltos de alguns segundos (`evidencias/preliminar/10_relogio_wsl.txt`): correlacionar por `request_id`, não só por horário.

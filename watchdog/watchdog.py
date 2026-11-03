#!/usr/bin/env python3
"""Operação Sentinel — watchdog (monitor independente). Só biblioteca padrão.

O que faz:
  * Sonda GET <alvo>/health/ready de cada nó a cada INTERVALO s, com TIMEOUT s.
  * Conta falhas consecutivas; marca DOWN só após LIMITE_FALHAS falhas seguidas
    (regra de ouro 6: não decidir com uma única amostra) e UP na primeira
    sondagem bem-sucedida depois disso.
  * (Opcional) Teste sintético: GET no caminho real do usuário via Nginx
    (variável SINTETICO). Mede a cadeia inteira, não um nó.
  * Escreve logs com horário: timestamp, serviço, nível, alvo, resultado.
  * Expõe :9100/metrics em texto Prometheus (somente na rede interna).

O que NÃO faz (de propósito): não reinicia contêineres. Ele observa e decide
DOWN/UP; a ação (retirar do balanceamento, reiniciar) é humana e registrada.

Variáveis: ALVOS ("nome=url,nome=url"), INTERVALO (5), TIMEOUT (2),
LIMITE_FALHAS (3), SINTETICO (url, opcional), PORTA_METRICAS (9100).
"""
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SERVICO = "watchdog"
ALVOS = os.environ.get("ALVOS", "rust-a=http://rust-a:8080,rust-b=http://rust-b:8080")
INTERVALO = float(os.environ.get("INTERVALO", "5"))
TIMEOUT = float(os.environ.get("TIMEOUT", "2"))
LIMITE_FALHAS = int(os.environ.get("LIMITE_FALHAS", "3"))
SINTETICO = os.environ.get("SINTETICO", "").strip()
PORTA = int(os.environ.get("PORTA_METRICAS", "9100"))

lock = threading.Lock()


def agora():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def log(nivel, msg):
    print(f"{agora()} {SERVICO} {nivel} {msg}", flush=True)


class Alvo:
    def __init__(self, nome, url, tipo):
        self.nome, self.url, self.tipo = nome, url, tipo
        self.up = 1                 # otimista até prova em contrário
        self.falhas_consec = 0
        self.ultima_latencia = 0.0
        self.ultimo_status = 0      # código HTTP (0 = sem resposta)
        self.ultima_sondagem = 0.0  # unix ts da última sondagem concluída
        self.sondagens = {"ok": 0, "falha": 0}
        self.transicoes = 0


def parse_alvos():
    alvos = []
    for item in filter(None, (p.strip() for p in ALVOS.split(","))):
        nome, url = item.split("=", 1)
        alvos.append(Alvo(nome, url.rstrip("/") + "/health/ready", "readiness"))
    if SINTETICO:
        alvos.append(Alvo("sintetico-nginx", SINTETICO, "sintetico"))
    return alvos


def _http_get(url, rid):
    """Uma requisição HTTP; devolve (status, erro)."""
    try:
        req = urllib.request.Request(url, headers={"X-Request-Id": rid})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            r.read()
            return r.status, None
    except urllib.error.HTTPError as e:
        return e.code, f"http_{e.code}"
    except Exception as e:  # timeout, conexão recusada, DNS...
        return 0, type(e).__name__ + ":" + str(getattr(e, "reason", e)).replace(" ", "_")[:80]


def sondar(alvo: Alvo):
    inicio = time.monotonic()
    # Prazo TOTAL da sonda. O timeout do urllib cobre conexão e leitura, mas NÃO
    # a resolução DNS: com o nó parado, o DNS do Docker levava ~3 s para dizer
    # "Name does not resolve" (evidência 05b). Rodamos a requisição numa thread
    # e desistimos ao fim de TIMEOUT, contando como falha por timeout.
    caixa = {}
    rid = f"wd-{alvo.nome}-{int(time.time()*1000)}"
    t = threading.Thread(target=lambda: caixa.update(r=_http_get(alvo.url, rid)), daemon=True)
    t.start()
    t.join(TIMEOUT)
    if "r" in caixa:
        status, erro = caixa["r"]
    else:
        status, erro = 0, f"prazo_total_{TIMEOUT:g}s_excedido(dns/conexao/leitura)"
    lat = time.monotonic() - inicio
    ok = status == 200

    with lock:
        alvo.ultima_latencia, alvo.ultimo_status, alvo.ultima_sondagem = lat, status, time.time()
        alvo.sondagens["ok" if ok else "falha"] += 1
        if ok:
            if alvo.up == 0:
                alvo.up, alvo.transicoes = 1, alvo.transicoes + 1
                log("WARN", f"alvo={alvo.nome} tipo={alvo.tipo} transicao=UP apos_falhas={alvo.falhas_consec} latencia_ms={lat*1000:.0f}")
            alvo.falhas_consec = 0
        else:
            alvo.falhas_consec += 1
            log("WARN", f"alvo={alvo.nome} tipo={alvo.tipo} resultado=falha status={status} erro={erro} falhas_consecutivas={alvo.falhas_consec}/{LIMITE_FALHAS} latencia_ms={lat*1000:.0f}")
            if alvo.up == 1 and alvo.falhas_consec >= LIMITE_FALHAS:
                alvo.up, alvo.transicoes = 0, alvo.transicoes + 1
                log("ERROR", f"alvo={alvo.nome} tipo={alvo.tipo} transicao=DOWN motivo={LIMITE_FALHAS}_falhas_consecutivas ultimo_erro={erro}")


def laco(alvos):
    log("INFO", f"evento=startup intervalo_s={INTERVALO} timeout_s={TIMEOUT} limite_falhas={LIMITE_FALHAS} alvos={[a.nome for a in alvos]}")
    while True:
        ciclo = time.monotonic()
        threads = [threading.Thread(target=sondar, args=(a,)) for a in alvos]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        # resumo periódico em INFO (um por ciclo) para provar que o monitor está vivo
        with lock:
            resumo = " ".join(f"{a.nome}={'UP' if a.up else 'DOWN'}" for a in alvos)
        log("INFO", f"ciclo resumo {resumo}")
        time.sleep(max(0.0, INTERVALO - (time.monotonic() - ciclo)))


def metricas(alvos):
    linhas = []

    def bloco(nome, tipo, ajuda, valores):
        linhas.append(f"# HELP {nome} {ajuda}")
        linhas.append(f"# TYPE {nome} {tipo}")
        linhas.extend(valores)

    with lock:
        lbl = lambda a: f'target="{a.nome}",kind="{a.tipo}"'
        bloco("watchdog_target_up", "gauge", "1 se o alvo esta UP na visao do watchdog, 0 se DOWN.",
              [f"watchdog_target_up{{{lbl(a)}}} {a.up}" for a in alvos])
        bloco("watchdog_target_down", "gauge", "1 se o alvo esta DOWN (3 falhas consecutivas).",
              [f"watchdog_target_down{{{lbl(a)}}} {1 - a.up}" for a in alvos])
        bloco("watchdog_consecutive_failures", "gauge", "Falhas consecutivas atuais.",
              [f"watchdog_consecutive_failures{{{lbl(a)}}} {a.falhas_consec}" for a in alvos])
        bloco("watchdog_probe_duration_seconds", "gauge", "Latencia da ultima sondagem.",
              [f"watchdog_probe_duration_seconds{{{lbl(a)}}} {a.ultima_latencia:.4f}" for a in alvos])
        bloco("watchdog_probe_http_status", "gauge", "Ultimo status HTTP (0 = sem resposta/timeout).",
              [f"watchdog_probe_http_status{{{lbl(a)}}} {a.ultimo_status}" for a in alvos])
        bloco("watchdog_last_probe_timestamp_seconds", "gauge", "Instante unix da ultima sondagem concluida.",
              [f"watchdog_last_probe_timestamp_seconds{{{lbl(a)}}} {a.ultima_sondagem:.3f}" for a in alvos])
        bloco("watchdog_probes_total", "counter", "Sondagens por resultado.",
              [f'watchdog_probes_total{{{lbl(a)},result="{r}"}} {n}' for a in alvos for r, n in a.sondagens.items()])
        bloco("watchdog_state_transitions_total", "counter", "Transicoes UP<->DOWN (detecta flapping).",
              [f"watchdog_state_transitions_total{{{lbl(a)}}} {a.transicoes}" for a in alvos])
    return "\n".join(linhas) + "\n"


def servidor_metricas(alvos):
    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/metrics":
                corpo, cod = metricas(alvos).encode(), 200
            elif self.path == "/health":
                corpo, cod = b"ok\n", 200
            else:
                corpo, cod = b"nao encontrado\n", 404
            self.send_response(cod)
            self.send_header("Content-Type", "text/plain; version=0.0.4")
            self.send_header("Content-Length", str(len(corpo)))
            self.end_headers()
            self.wfile.write(corpo)

        def log_message(self, *a):  # silencia o log de acesso (ruído das coletas)
            pass

    ThreadingHTTPServer(("0.0.0.0", PORTA), H).serve_forever()


if __name__ == "__main__":
    alvos = parse_alvos()
    threading.Thread(target=servidor_metricas, args=(alvos,), daemon=True).start()
    try:
        laco(alvos)
    except KeyboardInterrupt:
        sys.exit(0)

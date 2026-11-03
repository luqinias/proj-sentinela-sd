#!/usr/bin/env python3
"""Mede saltos do relógio de parede (time.time) em relação ao monotônico.
Em WSL2/VMs o relógio de parede pode ser corrigido aos saltos, o que bagunça a
correlação de logs por horário. Uso: medir_relogio.py [segundos=60]"""
import sys, time
dur = float(sys.argv[1]) if len(sys.argv) > 1 else 60
pw, pm = time.time(), time.monotonic(); fim = pm + dur; saltos = []
while time.monotonic() < fim:
    time.sleep(0.2)
    w, m = time.time(), time.monotonic()
    d = (w - pw) - (m - pm)
    if abs(d) > 0.05:
        saltos.append(d)
        print(f"{time.strftime('%H:%M:%S', time.gmtime(w))}Z salto={d:+.3f}s", flush=True)
    pw, pm = w, m
print(f"--- {len(saltos)} salto(s) em {dur:.0f} s; soma={sum(saltos):+.3f}s; maior={max(saltos, key=abs, default=0):+.3f}s")

#!/usr/bin/env python3
"""Consultas ao Prometheus (127.0.0.1:9090) formatadas para evidências.
Uso: promq.py query '<PromQL>' | alerts | targets | rules"""
import json, sys, urllib.parse, urllib.request
BASE = "http://127.0.0.1:9090/api/v1/"
def get(path, **q):
    url = BASE + path + ("?" + urllib.parse.urlencode(q) if q else "")
    with urllib.request.urlopen(url, timeout=5) as r:
        return json.load(r)["data"]
cmd = sys.argv[1]
if cmd == "query":
    res = get("query", query=sys.argv[2])["result"]
    if not res: print("  (vazio)")
    for r in res:
        lbl = ",".join(f'{k}="{v}"' for k, v in r["metric"].items())
        print(f"  {{{lbl}}} => {r['value'][1]}")
elif cmd == "alerts":
    al = get("alerts")["alerts"]
    if not al: print("  (nenhum alerta pendente/disparado)")
    for a in al:
        l = a["labels"]; alvo = l.get("target") or l.get("node") or l.get("instance") or "-"
        print(f"  {l['alertname']:24} estado={a['state']:8} alvo={alvo:16} sev={l.get('severidade','-'):7} desde={a['activeAt'][:23]}")
elif cmd == "targets":
    for t in get("targets")["activeTargets"]:
        print(f"  {t['labels']['job']:10} {t['scrapeUrl']:35} health={t['health']:5} ultima_coleta={t['lastScrape'][:23]}")
elif cmd == "rules":
    for g in get("rules")["groups"]:
        for r in g["rules"]:
            print(f"  [{g['name']}] {r['name']:22} sev={r['labels'].get('severidade','-'):7} estado={r['state']:8} for={r.get('duration',0)}s")

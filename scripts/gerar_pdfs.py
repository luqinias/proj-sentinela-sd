#!/usr/bin/env python3
"""Converte docs/*.md e docs/apresentacao/*.md em PDF (pandoc -> HTML -> Chromium headless).

Uso: python3 scripts/gerar_pdfs.py
Requisitos: pandoc e um Chromium headless (padrão: o do Playwright; outro via env CHROME).
Sem fonte de emoji nem mermaid-cli: emojis viram rótulos e diagramas Mermaid saem como fonte.
"""
import re, subprocess, sys, pathlib, tempfile

import os
CHROME = os.environ.get("CHROME") or str(pathlib.Path.home() / ".cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
DIR = pathlib.Path(__file__).resolve().parent.parent / "docs" / "apresentacao"
TMP = pathlib.Path(tempfile.mkdtemp())

BASE_CSS = """
body { font-family: 'DejaVu Sans', 'Liberation Sans', Arial, sans-serif; color:#1c2833; }
code, pre { font-family: 'DejaVu Sans Mono', 'Liberation Mono', monospace; }
pre { background:#f4f6f7; border:1px solid #d5dbdb; border-radius:4px; padding:8px 10px; white-space:pre; overflow:hidden; }
code { background:#f4f6f7; padding:0 3px; border-radius:3px; }
pre code { background:none; padding:0; }
table { border-collapse:collapse; width:100%; margin:8px 0; }
th, td { border:1px solid #aab7b8; padding:4px 6px; vertical-align:top; text-align:left; }
th { background:#d6eaf8; }
tr { page-break-inside:avoid; }
h1, h2, h3 { color:#1b4f72; }
.tag { background:#fdebd0; color:#935116; border-radius:3px; padding:0 4px; font-size:0.9em; }
.ok { color:#1e8449; font-weight:bold; }
.part { color:#b9770e; font-weight:bold; }
td code { white-space:normal; word-break:break-word; }
td { overflow-wrap:break-word; }
.tag, .part, .ok { white-space:nowrap; }
td:first-child { white-space:nowrap; }
"""

DOC_CSS = BASE_CSS + """
@page { size:A4; margin:16mm 14mm; }
body { font-size:10.5pt; line-height:1.4; }
h1 { font-size:17pt; border-bottom:2px solid #1b4f72; padding-bottom:4px; }
h2 { font-size:13pt; margin-top:18px; }
table { font-size:9pt; }
pre { font-size:8.5pt; }
"""

def EMOJI(md):
    # sem fonte de emoji no sistema: troca por glifos/rotulos que o DejaVu tem
    return (md.replace("⏳", "<span class='tag'>previsto</span>")
              .replace("✅", "<span class='ok'>✔</span>")
              .replace("🔶", "<span class='part'>◆ parcial</span>"))

def pandoc(md, extra=()):
    return subprocess.run(["pandoc", "-f", "gfm-strikeout", "-t", "html", *extra], input=EMOJI(md),
                          capture_output=True, text=True, check=True).stdout

def print_pdf(html, out):
    h = TMP / (out.stem + ".html")
    h.write_text(html, encoding="utf-8")
    subprocess.run([CHROME, "--headless", "--no-sandbox", "--disable-gpu",
                    "--no-pdf-header-footer", f"--print-to-pdf={out}", h.as_uri()],
                   check=True, capture_output=True)
    print("ok", out)

def wrap(title, css, body):
    return f"<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'><title>{title}</title><style>{css}</style></head><body>{body}</body></html>"

def slides(path):
    txt = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n", txt, re.S)
    front, body = m.group(1), txt[m.end():]
    title = re.search(r"^title:\s*(.+)$", front, re.M).group(1)
    style = re.search(r"^style:\s*\|\n((?:  .*\n?)+)", front, re.M)
    marp_css = re.sub(r"^  ", "", style.group(1), flags=re.M) if style else ""
    parts = [p.strip() for p in re.split(r"^---\s*$", body, flags=re.M) if p.strip()]
    secs = [f"<section>{pandoc(p)}<div class='pg'>{i}</div></section>" for i, p in enumerate(parts, 1)]
    css = BASE_CSS + """
@page { size:1280px 720px; margin:0; }
html, body { margin:0; }
section { width:1280px; height:720px; box-sizing:border-box; padding:40px 60px;
          page-break-after:always; overflow:hidden; position:relative; background:#fff; }
section h1 { margin:0 0 14px; }
.pg { position:absolute; right:30px; bottom:18px; font-size:14px; color:#7f8c8d; }
""" + marp_css
    print_pdf(wrap(title, css, "".join(secs)), path.with_suffix(".pdf"))

LANDSCAPE = {"E_matriz_experimentos.md"}   # tabela de 7 colunas

def doc(path):
    md = path.read_text(encoding="utf-8")
    # sem mermaid-cli offline: mostra a fonte do diagrama, rotulada
    md = md.replace("```mermaid", "*Diagrama (fonte Mermaid — renderizado no GitHub/VS Code):*\n\n```")
    title = re.search(r"^# (.+)$", md, re.M).group(1)
    css = DOC_CSS + ("@page { size:A4 landscape; } table { font-size:8.5pt; }" if path.name in LANDSCAPE else "")
    print_pdf(wrap(title, css, pandoc(md)), path.with_suffix(".pdf"))

for d in (DIR, DIR.parent):
    for p in sorted(d.glob("*.md")):
        (slides if p.name == "slides_preliminar.md" else doc)(p)

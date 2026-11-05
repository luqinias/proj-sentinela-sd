# Entrega F — Relatório de incidente (Hora 7) — PREPARAÇÃO

> O incidente surpresa acontece em aula entre 05 e 12/11, sem aviso. Este arquivo tem
> a estrutura exigida (Hora 8) e o que já sabemos que vamos precisar. **Nada aqui é
> conclusão sobre o incidente** — ele ainda não aconteceu.

## Eventos (versão do aluno, do enunciado)

| Horário | Evento |
|---|---|
| 09:41:00 | Watchdog marca Rust A DOWN após 3 verificações sem resposta |
| 09:41:10 | Nginx ainda registra respostas 200 de algumas requisições encaminhadas a Rust A |
| 09:41:20 | Latência global aumentou; Rust B recebe mais tráfego |
| 09:41:35 | O painel de métricas do watchdog deixa de atualizar, sem alerta sobre o monitor |

## O que nossa montagem já permite verificar (preparação)

| Pergunta-dica do enunciado | Como respondemos com o nosso sistema |
|---|---|
| Quem diz que o Rust A caiu, o nó ou o observador? | Watchdog: `docker compose logs watchdog \| grep rust-a`. Nó: `docker compose logs rust-a` (há requisições recentes?). Nginx: `grep 'node=rust-a'` no log de acesso |
| Nginx e watchdog veem o mesmo caminho de rede? | Não necessariamente. Testar de **mais de um ponto**: `scripts/admin.sh check rust-a` (parte de rust-b), `docker compose exec watchdog wget -qO- -T 2 http://rust-a:8080/health/ready`, `docker compose exec nginx wget …` |
| Qual a idade da última métrica? | `time() - max(watchdog_last_probe_timestamp_seconds)` e `up{job="watchdog"}`; alerta `MonitorParado` (que no cenário do professor **não existia** — no nosso existe) |

Já observamos situações parecidas nos nossos testes: watchdog e Nginx discordando por até ~8 s
na recuperação (achado 4) e sonda com prazo estourado por DNS (achado 1).

## Estrutura do relatório (a preencher na Hora 7–8)

1. **Resumo em 3 linhas.**
2. **Linha do tempo** com horários (cuidado: relógio do host salta — ordenar por `request_id`/monotônico quando possível).
3. **Fatos × inferências** (tabela; cada fato com a evidência: arquivo e linha).
4. **Hipóteses (≥ 3)** e como cada uma foi testada ou descartada. Candidatas a considerar:
   * H-a: rede/DNS entre watchdog e rust-a com perda ou atraso (Nginx ainda chega).
   * H-b: rust-a lento (> 2 s da sonda, < 3 s do Nginx) — o mesmo padrão do nosso E2.
   * H-c: o próprio watchdog degradado (travado/sobrecarregado) — painel parou às 09:41:35.
   * H-d: rust-a de fato instável (parte das requisições falha e é refeita em B).
5. **Decisão, riscos e por que é reversível** (ex.: retirar A via `/admin/ready?v=0` é reversível com `v=1`; reiniciar A apaga estado e pode derrubar um nó que atendia).
6. **Prevenção**: arquitetura, monitoramento e alertas.
7. **Limites da simulação.**

## Checklist para o dia (antes de qualquer ação)

- [ ] Anotar horário de início e quem é o operador
- [ ] `docker compose ps > evidencias/incidente/ps_$(date +%H%M%S).txt`
- [ ] `docker compose logs --since 10m > evidencias/incidente/logs_$(date +%H%M%S).txt`
- [ ] `python3 scripts/promq.py alerts` e `query 'watchdog_target_up'` e `query 'up'`
- [ ] Testar rust-a de 2 pontos diferentes **antes** de decidir
- [ ] Decisão provisória **reversível**; registrar justificativa
- [ ] Confirmar recuperação: 20 req balanceadas, alertas resolvidos, `RestartCount` estável

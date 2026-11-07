"""Registra, a partir do `git log`, como o trabalho entrou no repositório — a evidência de "commits
organizados" de uma entrega.

Organização se mostra com o histórico, e não com uma frase: quantos commits de cada tipo, em que semanas,
de que autores e coautores, e quais Pull Requests entraram. **Gerado, nunca escrito à mão** — o número que vai
para o documento é o que o git responde no momento da geração.

Lê a `main` do remoto por padrão (`origin/main`), que é o que o avaliador vê: um ramo local com trabalho ainda
não mesclado inflaria a contagem. Rode `git fetch origin` antes.

Uso:
    python scripts/registrar_commits.py [--pasta .] [--ref origin/main] [--desde 2026-09-01] [--ate 2026-09-30]
                                        [--saida docs/medicoes/registro-commits.md]
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import re
import subprocess
import sys
from pathlib import Path

TIPO = re.compile(r"^(feat|fix|docs|test|tests|refactor|perf|chore|ci|build|style|spike|revert)(\([^)]+\))?!?:", re.I)
PR_MERGE = re.compile(r"^Merge pull request #(\d+)")
PR_SQUASH = re.compile(r"\(#(\d+)\)\s*$")
COAUTOR = re.compile(r"(?im)^co-authored-by:\s*(.+?)\s*<")


def git(pasta: Path, *args: str) -> str:
    r = subprocess.run(["git", *args], cwd=pasta, capture_output=True)
    if r.returncode != 0:
        sys.exit(r.stderr.decode("utf-8", errors="replace").strip() or "git falhou")
    return r.stdout.decode("utf-8", errors="replace")


def ref_padrao(pasta: Path) -> str:
    r = subprocess.run(["git", "rev-parse", "--verify", "--quiet", "origin/main"], cwd=pasta, capture_output=True)
    return "origin/main" if r.returncode == 0 else "HEAD"


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser(description="Registra o histórico de commits como evidência de entrega.")
    p.add_argument("--pasta", type=Path, default=Path("."))
    p.add_argument("--ref", help="referência a ler (padrão: origin/main, ou HEAD se não houver)")
    p.add_argument("--desde", help="AAAA-MM-DD, inclusive")
    p.add_argument("--ate", help="AAAA-MM-DD, inclusive")
    p.add_argument("--saida", type=Path)
    a = p.parse_args()

    ref = a.ref or ref_padrao(a.pasta)
    filtros = []
    if a.desde:
        filtros.append(f"--since={a.desde} 00:00")
    if a.ate:
        filtros.append(f"--until={a.ate} 23:59")
    bruto = git(a.pasta, "log", ref, *filtros, "--format=%H%x1f%ad%x1f%an%x1f%P%x1f%s%x1f%b%x1e", "--date=short")
    commits = []
    for bloco in bruto.split("\x1e"):
        partes = bloco.strip("\n").split("\x1f")
        if len(partes) < 6:
            continue
        h, data, autor, pais, titulo, corpo = partes
        commits.append({"hash": h[:7], "data": data, "autor": autor, "merge": len(pais.split()) > 1,
                        "titulo": titulo, "corpo": corpo})
    if not commits:
        sys.exit(f"Nenhum commit em {ref} no período.")

    normais = [c for c in commits if not c["merge"]]
    merges = [c for c in commits if c["merge"]]
    prs = set()
    for c in commits:
        for rx in (PR_MERGE, PR_SQUASH):
            m = rx.search(c["titulo"])
            if m:
                prs.add(int(m.group(1)))

    por_tipo = collections.Counter(
        (TIPO.match(c["titulo"]).group(1).lower() if TIPO.match(c["titulo"]) else "sem tipo") for c in normais)
    por_semana = collections.Counter()
    for c in normais:
        ano, semana, _ = dt.date.fromisoformat(c["data"]).isocalendar()
        segunda = dt.date.fromisocalendar(ano, semana, 1)
        por_semana[segunda] += 1
    por_autor = collections.Counter(c["autor"] for c in normais)
    coautores = collections.Counter(n.strip() for c in normais for n in COAUTOR.findall(c["corpo"]))
    com_corpo = sum(1 for c in normais if len(re.sub(r"(?im)^[\w-]+-by:.*$", "", c["corpo"]).strip()) >= 20)

    datas = sorted(c["data"] for c in commits)
    linhas = [
        "# Registro de commits",
        "",
        f"> Gerado por `registrar_commits.py` em {dt.date.today():%d/%m/%Y}, a partir de `{ref}`. **Não edite à mão**:",
        "> rode de novo para atualizar.",
        "",
        f"- **Período:** {datas[0]} a {datas[-1]}",
        f"- **Commits:** {len(normais)} (sem contar {len(merges)} de merge)",
        f"- **Pull Requests identificados:** {len(prs)}",
        f"- **Commits com corpo explicando o porquê:** {com_corpo} de {len(normais)}",
        "",
        "## Por tipo",
        "",
        "| Tipo | Commits |",
        "|---|--:|",
    ]
    for tipo, qtd in por_tipo.most_common():
        linhas.append(f"| `{tipo}` | {qtd} |")

    linhas.extend([
        "",
        "## Por semana",
        "",
        "| Semana (segunda-feira) | Commits |",
        "|---|--:|",
    ])
    for sem in sorted(por_semana):
        linhas.append(f"| {sem:%d/%m/%Y} | {por_semana[sem]} |")

    linhas.extend([
        "",
        "## Por autor",
        "",
        "| Autor | Commits |",
        "|---|--:|",
    ])
    for aut, qtd in por_autor.most_common():
        linhas.append(f"| {aut} | {qtd} |")

    if coautores:
        linhas.extend([
            "",
            "## Coautores",
            "",
            "| Coautor | Commits |",
            "|---|--:|",
        ])
        for co, qtd in coautores.most_common():
            linhas.append(f"| {co} | {qtd} |")

    texto = "\n".join(linhas) + "\n"
    if a.saida:
        a.saida.parent.mkdir(parents=True, exist_ok=True)
        a.saida.write_text(texto, encoding="utf-8")
        print(f"Registro gravado em {a.saida} ({len(normais)} commits).")
    else:
        print(texto)
    return 0


if __name__ == "__main__":
    sys.exit(main())

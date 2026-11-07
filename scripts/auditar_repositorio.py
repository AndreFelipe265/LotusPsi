"""Audita a organização de um repositório e diz o que corrigir primeiro.

Confere, sem alterar nada:

- **Segurança** — `.env`, chave privada, arquivo de dados ou arquivo grande versionado; segredos aparentes no
  código (mostra só o arquivo, a linha e o tipo — **nunca o valor**).
- **Fundação** — README com "como executar", `.gitignore` com `.env`, `.gitattributes`, `.editorconfig`,
  `.env.example`, licença ou aviso.
- **Contrato para agentes** — AGENTS.md/CLAUDE.md, com regras e armadilhas; se há os dois, um aponta para o
  outro.
- **GitHub no repositório** — template de PR, de issue, CODEOWNERS, CI em PR, Dependabot, SECURITY.md.
- **Documentação** — `docs/`, identificadores de requisitos e regras, ADRs.
- **Histórico** — commits com tipo, com corpo explicando o porquê, títulos vagos, trailers de IA, nomes dos
  ramos.
- **Configuração do GitHub** (com `--github`, pelo `gh`) — proteção do ramo principal, labels, milestones,
  issues sem milestone, ramo apagado após o merge.

O relatório sai em markdown, em ordem de prioridade, com a referência da skill que explica cada correção.

Uso:
    python scripts/auditar_repositorio.py [pasta] [--github] [--saida relatorio.md] [--json]
"""
from __future__ import annotations

import argparse
import collections
import json
import re
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

PESOS = {"crítico": 5, "importante": 3, "recomendado": 1}
DADOS = re.compile(r"\.(csv|xlsx|xls|parquet|sqlite|sqlite3|db)$", re.I)
CHAVES = re.compile(r"\.(pem|key|p12|pfx)$", re.I)
TEXTO = re.compile(r"\.(py|js|jsx|ts|tsx|java|go|rb|php|cs|c|cpp|h|hpp|cu|sh|ps1|bat|yml|yaml|toml|ini|cfg|conf|json|env|md|txt|sql|tf)$", re.I)
SEGREDOS = {
    "atribuição de segredo literal": re.compile(
        r"(api[_-]?key|secret|token|password|passwd|senha)\s*[:=]\s*['\"][A-Za-z0-9_/+.\-]{16,}['\"]", re.I),
    "token do GitHub": re.compile(r"\b(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,})\b"),
    "chave de API (sk-…)": re.compile(r"\bsk-[A-Za-z0-9_\-]{20,}\b"),
    "chave de acesso AWS": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "token do Slack": re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}\b"),
    "chave privada": re.compile(r"-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
}
TIPO_COMMIT = re.compile(
    r"^(feat|fix|docs|test|tests|refactor|perf|chore|ci|build|style|spike|revert|merge)(\([^)]+\))?!?:\s", re.I)
VAGOS = {"update", "updates", "fix", "fixes", "wip", "changes", "ajuste", "ajustes", "teste", "commit", "misc",
         "atualiza", "atualização", "correção", ".", "..", "..."}
TRAILERS_IA = re.compile(
    r"(co-authored-by:\s*(claude|copilot|chatgpt|cursor|gemini)|noreply@anthropic\.com|generated with \[?claude"
    r"|🤖 generated)", re.I)
RAMO_BOM = re.compile(r"^(feat|fix|docs|spike|chore|test|refactor|ci|perf|release|hotfix)/")


TESTE = re.compile(r"(^|/)(tests?|e2e|fixtures?|spec|__tests__)(/|$)|(^|/)test_[^/]*$|\.(test|spec)\.[jt]sx?$", re.I)
DOCUMENTOS = re.compile(r"\.(pdf|docx|pptx)$", re.I)


@dataclass
class Achado:
    grupo: str
    peso: str
    ok: bool
    titulo: str
    detalhe: str = ""      # o que fazer, quando falha
    referencia: str = ""
    nota: str = ""         # o que mostrar quando está em ordem


class Auditoria:
    def __init__(self, pasta: Path):
        self.pasta = pasta
        self.achados: list[Achado] = []
        self.arquivos = self._arquivos()

    # --- utilitários ---------------------------------------------------------------------------------
    def git(self, *args: str) -> str | None:
        r = subprocess.run(["git", *args], cwd=self.pasta, capture_output=True)
        if r.returncode != 0:
            return None
        return r.stdout.decode("utf-8", errors="replace")

    def _arquivos(self) -> list[str]:
        saida = self.git("ls-files", "-z")
        if saida is None:
            return []
        return [f for f in saida.split("\0") if f]

    def existe(self, *nomes: str) -> str | None:
        for n in nomes:
            if (self.pasta / n).exists():
                return n
        return None

    def ler(self, rel: str) -> str:
        try:
            return (self.pasta / rel).read_bytes().decode("utf-8", errors="replace")
        except OSError:
            return ""

    def add(self, grupo, peso, ok, titulo, detalhe="", referencia="", nota=""):
        self.achados.append(Achado(grupo, peso, bool(ok), titulo, detalhe, referencia, nota))

    # --- grupos --------------------------------------------------------------------------------------
    def seguranca(self):
        g, ref = "Segurança", "references/seguranca-e-dados.md"
        envs = [f for f in self.arquivos
                if re.search(r"(^|/)\.env(\.|$)", f) and not f.endswith((".example", ".sample", ".template"))]
        self.add(g, "crítico", not envs, "Nenhum arquivo .env versionado",
                 ("Versionados: " + ", ".join(envs[:5]) + ". Revogue e troque os segredos antes de limpar o histórico.")
                 if envs else "", ref)

        chaves = [f for f in self.arquivos if CHAVES.search(f)]
        self.add(g, "crítico", not chaves, "Nenhuma chave privada ou certificado versionado",
                 ("Versionados: " + ", ".join(chaves[:5])) if chaves else "", ref)

        dados = [f for f in self.arquivos if DADOS.search(f) and "/exemplos/" not in f]
        self.add(g, "crítico", not dados, "Nenhum arquivo de dados versionado",
                 (f"{len(dados)} arquivo(s), ex.: " + ", ".join(dados[:5]) + ". Dados de exemplo vêm de um gerador sintético.")
                 if dados else "", ref)

        # Documento entregável (PDF) pode ser grande e legítimo; o limite dele é maior que o de outros binários.
        grandes = []
        for f in self.arquivos:
            p = self.pasta / f
            limite = 25 if DOCUMENTOS.search(f) else 5
            try:
                if p.is_file() and p.stat().st_size > limite * 1024 * 1024:
                    grandes.append(f"{f} ({p.stat().st_size / 1048576:.1f} MB)")
            except OSError:
                pass
        self.add(g, "importante", not grandes, "Nenhum arquivo grande versionado (5 MB; 25 MB para documentos)",
                 ("Grandes: " + ", ".join(grandes[:5]) + ". Versione só o entregável final; o resto vai para o .gitignore.")
                 if grandes else "", "references/git-e-pull-requests.md")

        suspeitos, em_teste = [], []
        for f in self.arquivos:
            if not TEXTO.search(f) or f.endswith((".example", ".sample", "package-lock.json", "yarn.lock", "poetry.lock")):
                continue
            p = self.pasta / f
            try:
                if not p.is_file() or p.stat().st_size > 1024 * 1024:
                    continue
            except OSError:
                continue
            destino = em_teste if TESTE.search(f) else suspeitos
            for n, linha in enumerate(self.ler(f).splitlines(), 1):
                for tipo, rx in SEGREDOS.items():
                    if rx.search(linha):
                        destino.append(f"{f}:{n} ({tipo})")
                        break
        self.add(g, "crítico", not suspeitos, "Nenhum segredo aparente no código de produção",
                 ("Suspeitos:\n" + "\n".join(f"  - {s}" for s in suspeitos[:5]) + "\nRevogue antes de limpar.")
                 if suspeitos else "", ref)
        self.add(g, "importante", not em_teste, "Nenhuma credencial literal no código de teste",
                 ("Em testes:\n" + "\n".join(f"  - {s}" for s in em_teste[:5]) + "\nUse geradores sintéticos.")
                 if em_teste else "", ref)

    def fundacao(self):
        g, ref = "Fundação", "references/fundacao.md"
        readme = self.existe("README.md", "readme.md")
        self.add(g, "crítico", bool(readme), "README na raiz", "Crie o README.md explicando o que é o projeto.", ref)
        if readme:
            txt = self.ler(readme).lower()
            tem_execucao = any(k in txt for k in ["como rodar", "como executar", "quickstart", "getting started",
                                                  "docker compose up", "npm run", "cargo run", "python -m"])
            self.add(g, "importante", tem_execucao, "README diz como executar",
                     "Acrescente uma seção rápida 'Como rodar' com os comandos necessários.", ref)

        gi = self.existe(".gitignore")
        self.add(g, "crítico", bool(gi), ".gitignore na raiz", "Crie o .gitignore para bloquear o que não entra.", ref)
        if gi:
            txt = self.ler(gi)
            tem_env = bool(re.search(r"(^|\n)\s*\.env(\s|$)", txt))
            self.add(g, "crítico", tem_env, ".gitignore bloqueia o .env",
                     "Adicione `.env` ao .gitignore para não subir segredos.", ref)

        ga = self.existe(".gitattributes")
        self.add(g, "importante", bool(ga), ".gitattributes fixa o fim de linha",
                 "Crie o .gitattributes fixando eol=lf para shell/python e text=auto.", ref)

        ed = self.existe(".editorconfig")
        self.add(g, "recomendado", bool(ed), ".editorconfig",
                 "Crie o .editorconfig para alinhar charset, indentação e fim de linha.", ref)

        ee = self.existe(".env.example", ".env.sample", ".env.template")
        self.add(g, "importante", bool(ee), ".env.example com as variáveis",
                 "Crie o .env.example listando as variáveis de ambiente necessárias.", ref)

        lic = self.existe("LICENSE", "LICENSE.md", "LICENCE", "COPYING")
        self.add(g, "recomendado", bool(lic), "Licença ou aviso de direitos",
                 "Adicione LICENSE (MIT, Apache-2.0, etc.) ou um aviso de direitos.", ref)

        cb = self.existe("CONTRIBUTING.md", "contributing.md", ".github/CONTRIBUTING.md")
        self.add(g, "recomendado", bool(cb), "CONTRIBUTING.md com ramos, commits e PRs",
                 "Crie o CONTRIBUTING.md com o formato dos commits e o fluxo de trabalho.",
                 "references/git-e-pull-requests.md")

        # Marcadores de modelo esquecidos
        marcadores = []
        for f in self.arquivos:
            if not f.endswith((".md", ".txt")):
                continue
            txt = self.ler(f)
            achou = re.findall(r"<!--\s*PREENCHA:.*?-->|\[nome do projeto\]|<seu-usuario>", txt, re.I)
            if achou:
                marcadores.append(f"{f} ({len(achou)})")
        self.add(g, "importante", not marcadores, "Nenhum marcador de modelo por preencher",
                 ("Marcadores em: " + ", ".join(marcadores[:5])) if marcadores else "", ref)

    def contrato(self):
        g, ref = "Contrato para agentes", "references/contrato-para-agentes.md"
        ag = self.existe("AGENTS.md", "CLAUDE.md", "GEMINI.md")
        self.add(g, "crítico", bool(ag), "Contrato para pessoas e agentes (AGENTS.md ou CLAUDE.md)",
                 "Crie o AGENTS.md com as regras inegociáveis, a arquitetura e as armadilhas.", ref)
        if ag:
            txt = self.ler(ag)
            self.add(g, "importante", bool(re.search(r"regras?\s+inegoci[aá]ve(l|is)", txt, re.I)),
                     "O contrato tem as regras inegociáveis",
                     "Adicione a seção 'Regras inegociáveis' no contrato.", ref)
            self.add(g, "importante", bool(re.search(r"armadilhas?|pitfalls?", txt, re.I)),
                     "O contrato tem a seção de armadilhas",
                     "Adicione a seção 'Armadilhas conhecidas' com sintoma, causa e solução.", ref)
            self.add(g, "importante", bool(re.search(r"responsabilidade|o que n[aã]o faz", txt, re.I)),
                     "O contrato tem o mapa de responsabilidades",
                     "Adicione a tabela com o que cada camada faz e o que NÃO faz.", ref)

        # Se existem os dois, um deve apontar para o outro
        tem_ag = bool(self.existe("AGENTS.md"))
        tem_cl = bool(self.existe("CLAUDE.md"))
        if tem_ag and tem_cl:
            aponta = "AGENTS.md" in self.ler("CLAUDE.md") or "CLAUDE.md" in self.ler("AGENTS.md")
            self.add(g, "importante", aponta, "CLAUDE.md aponta para o AGENTS.md (uma fonte só)",
                     "Faça o CLAUDE.md apenas apontar para o AGENTS.md, para não manter duas fontes.", ref)

    def github(self):
        g, ref = "GitHub no repositório", "references/fundacao.md"
        pr_tpl = self.existe(".github/pull_request_template.md", "pull_request_template.md")
        self.add(g, "importante", bool(pr_tpl), "Template de Pull Request",
                 "Crie `.github/pull_request_template.md` com o que muda, como testar e Closes #N.",
                 "references/git-e-pull-requests.md")

        it = [f for f in self.arquivos if f.startswith(".github/ISSUE_TEMPLATE/") and f.endswith((".md", ".yml", ".yaml"))]
        self.add(g, "importante", len(it) >= 2, "Templates de issue (história, defeito, decisão)",
                 "Crie templates em `.github/ISSUE_TEMPLATE/`.", "references/planejamento.md")

        co = self.existe(".github/CODEOWNERS", "CODEOWNERS")
        self.add(g, "recomendado", bool(co), "CODEOWNERS com o mapa de donos",
                 "Crie o `.github/CODEOWNERS` distribuindo as pastas pela equipe.", ref)

        ci = [f for f in self.arquivos if f.startswith(".github/workflows/") and f.endswith((".yml", ".yaml"))]
        self.add(g, "crítico", bool(ci), "CI configurada",
                 "Crie uma ação do GitHub em `.github/workflows/ci.yml` rodando linter e testes.",
                 "references/qualidade.md")
        if ci:
            txt = "\n".join(self.ler(f) for f in ci)
            em_pr = "pull_request:" in txt or "pull_request :" in txt
            self.add(g, "importante", em_pr, "A CI roda em cada Pull Request",
                     "Configure a CI para disparar em `pull_request` contra a branch principal.",
                     "references/qualidade.md")

        dep = self.existe(".github/dependabot.yml", ".github/dependabot.yaml")
        self.add(g, "recomendado", bool(dep), "Atualização de dependências automatizada",
                 "Crie `.github/dependabot.yml` para acompanhar correções de segurança.",
                 "references/seguranca-e-dados.md")

        sec = self.existe("SECURITY.md", ".github/SECURITY.md")
        self.add(g, "recomendado", bool(sec), "SECURITY.md",
                 "Crie o SECURITY.md com o canal de contato para vulnerabilidades.",
                 "references/seguranca-e-dados.md")

    def documentacao(self):
        g, ref = "Documentação", "references/documentacao.md"
        tem_docs = any(f.startswith("docs/") for f in self.arquivos)
        self.add(g, "importante", tem_docs, "Pasta docs/ com a documentação viva",
                 "Crie a pasta `docs/` com requisitos, casos de uso, arquitetura e riscos.", ref)

        # Identificadores de requisitos (RF, RNF, RN)
        tem_id = False
        for f in self.arquivos:
            if not f.startswith("docs/") or not f.endswith(".md"):
                continue
            if re.search(r"\b(RF\d+|RNF\d+|RN\d+)\b", self.ler(f)):
                tem_id = True
                break
        self.add(g, "importante", tem_id, "Requisitos e regras com identificadores (RF, RNF, RN)",
                 "Numere os requisitos e regras (ex.: RF01, RNF03, RN12) para rastreabilidade.", ref)

        # ADRs
        tem_adr = any(re.search(r"(^|/)ADR-?\d+|decis(oes|ao)|decisions?", f, re.I) for f in self.arquivos)
        self.add(g, "importante", tem_adr, "Decisões registradas como ADR",
                 "Registre decisões importantes em `docs/` como ADRs numeradas.", ref)

        # Riscos
        tem_risco = any(re.search(r"riscos?|matriz-de-riscos?", f, re.I) for f in self.arquivos)
        self.add(g, "importante", tem_risco, "Registro de riscos",
                 "Crie um registro de riscos com probabilidade, impacto, mitigação e desfecho.",
                 "references/planejamento.md")

    def historico(self):
        g, ref = "Histórico", "references/git-e-pull-requests.md"
        saida = self.git("log", "-n", "50", "--format=%s%x1f%b%x1e")
        if not saida:
            return
        commits = []
        for c in saida.split("\x1e"):
            partes = c.strip("\n").split("\x1f")
            if len(partes) >= 2:
                commits.append((partes[0].strip(), partes[1].strip()))
            elif partes and partes[0].strip():
                commits.append((partes[0].strip(), ""))
        if not commits:
            return

        total = len(commits)
        com_tipo = sum(1 for tit, _ in commits if TIPO_COMMIT.search(tit))
        fracao_tipo = com_tipo / total
        self.add(g, "importante", fracao_tipo >= 0.7, f"Commits com tipo (feat:, fix:, docs:…): {com_tipo}/{total}",
                 "Use tipos convencionais nos commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.", ref)

        com_corpo = sum(1 for _, corpo in commits if len(re.sub(r"(?im)^[\w-]+-by:.*$", "", corpo).strip()) >= 20)
        fracao_corpo = com_corpo / total
        self.add(g, "recomendado", fracao_corpo >= 0.3,
                 f"Commits com corpo explicando o porquê: {com_corpo}/{total}",
                 "O corpo guarda o motivo, que o diff não mostra.", ref)

        vagos = [tit for tit, _ in commits if tit.lower().strip() in VAGOS or len(tit.strip()) < 8]
        self.add(g, "importante", not vagos, "Nenhum título de commit vago",
                 ("Exemplos vagos: " + ", ".join(f"`{v}`" for v in vagos[:3])) if vagos else "", ref)

        ia = [tit for tit, corpo in commits if TRAILERS_IA.search(corpo) or TRAILERS_IA.search(tit)]
        self.add(g, "importante", not ia, "Nenhum trailer ou menção de ferramenta de IA nos commits",
                 f"{len(ia)} commit(s) com menção. No projeto profissional, autoria é da equipe humana.",
                 "references/trabalho-com-agentes.md")

        # Nomes dos ramos remotos
        ramos = self.git("branch", "-r", "--format=%(refname:short)")
        if ramos:
            lista = [r.replace("origin/", "") for r in ramos.splitlines() if r and "HEAD" not in r and r != "origin/main" and r != "origin/master"]
            if lista:
                ruins = [r for r in lista if not RAMO_BOM.search(r)]
                self.add(g, "recomendado", not ruins, f"Ramos com prefixo de tipo (feat/, fix/…): {len(lista)-len(ruins)}/{len(lista)}",
                         ("Fora do padrão: " + ", ".join(ruins[:3])) if ruins else "", ref)

    def executar(self):
        self.seguranca()
        self.fundacao()
        self.contrato()
        self.github()
        self.documentacao()
        self.historico()

    def nota(self) -> int:
        pontos, maximo = 0, 0
        for a in self.achados:
            p = PESOS.get(a.peso, 1)
            maximo += p
            if a.ok:
                pontos += p
        return round(100 * pontos / maximo) if maximo else 0

    def relatorio_markdown(self) -> str:
        grupos = collections.defaultdict(list)
        for a in self.achados:
            grupos[a.grupo].append(a)

        linhas = [
            f"# Auditoria de organização — `{self.pasta.resolve().name}`",
            "",
            f"**Nota: {self.nota()}/100**, ponderada: crítico vale 5, importante 3, recomendado 1.",
            "",
            "| Grupo | Em ordem |",
            "|---|--:|",
        ]
        for g, achados in grupos.items():
            oks = sum(1 for a in achados if a.ok)
            linhas.append(f"| {g} | {oks}/{len(achados)} |")

        pendentes = [a for a in self.achados if not a.ok]
        # Ordena por peso: crítico, importante, recomendado
        ordem = {"crítico": 0, "importante": 1, "recomendado": 2}
        pendentes.sort(key=lambda a: ordem.get(a.peso, 9))

        if pendentes:
            linhas.extend(["", "## O que corrigir (por prioridade)", ""])
            atual_peso = None
            for a in pendentes:
                if a.peso != atual_peso:
                    atual_peso = a.peso
                    linhas.extend([f"### Prioridade: {atual_peso.title()}", ""])
                ref_txt = f" *(ver `{a.referencia}`)*" if a.referencia else ""
                linhas.append(f"- [ ] **{a.titulo}**{ref_txt}")
                if a.detalhe:
                    for l in a.detalhe.splitlines():
                        linhas.append(f"  {l}")

        em_ordem = [a for a in self.achados if a.ok]
        if em_ordem:
            linhas.extend(["", "## O que já está em ordem", ""])
            for a in em_ordem:
                linhas.append(f"- ✅ {a.titulo}")

        linhas.extend([
            "",
            "---",
            "",
            "Corrija em PRs pequenos, um tema por PR. Segredo publicado se **revoga e troca antes** de limpar o histórico. "
            "Não reformate o repositório inteiro para padronizar.",
            "",
        ])
        return "\n".join(linhas)


def main():
    import collections  # usado no relatorio
    p = argparse.ArgumentParser(description="Audita a organização de um repositório.")
    p.add_argument("pasta", nargs="?", type=Path, default=Path("."), help="pasta do repositório (padrão: a atual)")
    p.add_argument("--github", action="store_true", help="conferir também a configuração do GitHub pelo gh")
    p.add_argument("--saida", type=Path, help="gravar o relatório neste arquivo")
    p.add_argument("--json", action="store_true", help="sair em JSON, em vez de markdown")
    args = p.parse_args()

    aud = Auditoria(args.pasta)
    aud.executar()

    if args.json:
        dados = {
            "pasta": str(args.pasta.resolve()),
            "nota": aud.nota(),
            "achados": [asdict(a) for a in aud.achados],
        }
        saida_str = json.dumps(dados, indent=2, ensure_ascii=False)
    else:
        saida_str = aud.relatorio_markdown()

    if args.saida:
        args.saida.write_text(saida_str, encoding="utf-8")
        print(f"Relatório gravado em {args.saida}")
    else:
        print(saida_str)


if __name__ == "__main__":
    main()

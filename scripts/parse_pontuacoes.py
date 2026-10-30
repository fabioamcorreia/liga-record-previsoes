"""Extrai as pontuações por ronda dos emails "Liga Record - Pontuações" (PDF) para JSON.

Uso: python parse_pontuacoes.py saida.json ficheiro1.pdf [ficheiro2.pdf ...]
"""
import sys, re, json
import pdfplumber

CLUBS = ["Académico Viseu", "Alverca", "Arouca", "Benfica", "Casa Pia", "E. Amadora", "Estoril", "Famalicão",
         "FC Porto", "Gil Vicente", "Marítimo", "Moreirense", "Nacional", "Rio Ave", "Santa Clara", "Sp. Braga",
         "Sporting", "V. Guimarães"]
# Nomes alternativos usados nalguns emails → nome canónico (os mais longos primeiro no regex)
ALIASES = {"Académico de Viseu": "Académico Viseu", "Académico": "Académico Viseu"}
NAMES = sorted(CLUBS + list(ALIASES), key=len, reverse=True)
PAT = re.compile(r"(.+?) (" + "|".join(re.escape(c) for c in NAMES) + r") (-?\d+)(?: |$)")

MONTHS = {"janeiro": 1, "fevereiro": 2, "março": 3, "abril": 4, "maio": 5, "junho": 6, "julho": 7,
          "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12}
# A Liga Record começa a contar na 6.ª jornada (13-set-2026). Antes disso há rondas experimentais
# numeradas pela jornada (2.ª a 5.ª); depois a numeração recomeça (1.ª ronda = 6.ª jornada).
OFFICIAL_START = (2026, 9, 12)
ROUND_OFFSET = 5

out = {"players": [], "coaches": [], "jds": []}
for f in sys.argv[2:]:
    with pdfplumber.open(f) as p:
        text = "\n".join(pg.extract_text() or "" for pg in p.pages)
    n = int(re.search(r"PONTOS NA (\d+)\.", text).group(1))
    d = re.search(r"(\d{1,2}) de (\w+) de (\d{4})", text)
    sent = (int(d.group(3)), MONTHS[d.group(2).lower()], int(d.group(1)))
    official = sent >= OFFICIAL_START
    rnd = n if official else None          # ronda oficial da Liga Record (None = experimental)
    j = n + ROUND_OFFSET if official else n  # jornada da Liga Portugal (chave única)
    jds = re.search(r"JOGADOR DA SEMANA (.+?) (\d+)", text)
    out["jds"].append({"r": rnd, "j": j, "txt": jds.group(0) if jds else None})
    section = None
    for line in text.splitlines():
        if line.startswith("Jogador Clube Pts"):
            section = "players"; continue
        if line.startswith("Treinador Clube Pts"):
            section = "coaches"; continue
        if line.startswith("Patrocinador"):
            section = None
        if not section:
            continue
        rest = line.strip()
        while rest:
            m = PAT.match(rest)
            if not m:
                break
            club = ALIASES.get(m.group(2), m.group(2))
            out[section].append({"r": rnd, "j": j, "n": m.group(1).strip(), "c": club, "p": int(m.group(3))})
            rest = rest[m.end():].strip()

with open(sys.argv[1], "w", encoding="utf-8") as fh:
    json.dump(out, fh, ensure_ascii=False)
print({k: len(v) for k, v in out.items()})

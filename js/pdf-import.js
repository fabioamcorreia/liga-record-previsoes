/*
 * Leitura dos emails "Liga Record - Pontuações" (PDF) diretamente no browser, com o pdf.js.
 * Mesma lógica de scripts/parse_pontuacoes.py: devolve {players, coaches, jds} com j (jornada da Liga)
 * e r (ronda oficial ou null nas rondas experimentais).
 */
const LRPdf = (() => {
  const CLUBS = ['Académico Viseu', 'Alverca', 'Arouca', 'Benfica', 'Casa Pia', 'E. Amadora', 'Estoril', 'Famalicão',
    'FC Porto', 'Gil Vicente', 'Marítimo', 'Moreirense', 'Nacional', 'Rio Ave', 'Santa Clara', 'Sp. Braga',
    'Sporting', 'V. Guimarães'];
  const ALIASES = { 'Académico de Viseu': 'Académico Viseu', 'Académico': 'Académico Viseu' };
  const NAMES = [...CLUBS, ...Object.keys(ALIASES)].sort((a, b) => b.length - a.length);
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const PAT = new RegExp('^(.+?) (' + NAMES.map(esc).join('|') + ') (-?\\d+)(?: |$)');
  const MONTHS = { janeiro: 1, fevereiro: 2, 'março': 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8,
    setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
  // A Liga Record começa a contar na 6.ª jornada (13-set-2026); antes há rondas experimentais (2.ª a 5.ª).
  const OFFICIAL_START = [2026, 9, 12];
  const ROUND_OFFSET = 5;

  // Reconstrói as linhas de texto a partir das posições que o pdf.js devolve.
  async function pdfLines(pdfjs, bytes) {
    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    const lines = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const items = (await page.getTextContent()).items.filter(it => it.str && it.str.trim() !== '' || it.str === ' ');
      items.sort((a, b) => (b.transform[5] - a.transform[5]) || (a.transform[4] - b.transform[4]));
      let cur = null;
      for (const it of items) {
        const x = it.transform[4], y = it.transform[5];
        if (!cur || Math.abs(y - cur.y) > 2) { cur = { y, parts: [] }; lines.push(cur); }
        cur.parts.push({ x, end: x + it.width, s: it.str });
      }
    }
    return lines.map(l => {
      l.parts.sort((a, b) => a.x - b.x);
      let s = '', prevEnd = null;
      for (const p of l.parts) { if (prevEnd != null && p.x - prevEnd > 1) s += ' '; s += p.s; prevEnd = p.end; }
      return s.replace(/\s+/g, ' ').trim();
    });
  }

  function parseLines(lines, out) {
    const text = lines.join('\n');
    const mRound = text.match(/PONTOS NA (\d+)\./);
    if (!mRound) return false;
    const n = +mRound[1];
    const d = text.match(/(\d{1,2}) de (\p{L}+) de (\d{4})/u);
    const sent = d ? [+d[3], MONTHS[d[2].toLowerCase()] || 0, +d[1]] : [0, 0, 0];
    const official = sent[0] > OFFICIAL_START[0] || (sent[0] === OFFICIAL_START[0] && (sent[1] > OFFICIAL_START[1] || (sent[1] === OFFICIAL_START[1] && sent[2] >= OFFICIAL_START[2])));
    const r = official ? n : null, j = official ? n + ROUND_OFFSET : n;
    // O pdf.js parte o bloco do Jogador da Semana: "<nome>" / "PONTOS" / "JOGADOR DA SEMANA <pts>"
    let jds = text.match(/JOGADOR DA SEMANA ([^\n\d]+?) (\d+)/);
    if (!jds) {
      const i = lines.findIndex(l => /^JOGADOR DA SEMANA \d+$/.test(l));
      const name = i > 0 ? lines.slice(0, i).reverse().find(l => l && !/^PONTOS/.test(l)) : null;
      if (name) jds = [null, name, lines[i].match(/\d+$/)[0]];
    }
    out.jds = out.jds.filter(x => x.j !== j);
    out.players = out.players.filter(x => x.j !== j);
    out.coaches = out.coaches.filter(x => x.j !== j);
    out.jds.push({ r, j, txt: jds ? `JOGADOR DA SEMANA ${jds[1].trim()} ${jds[2]}` : null });
    let section = null;
    for (const line of lines) {
      if (line.startsWith('Jogador Clube Pts')) { section = 'players'; continue; }
      if (line.startsWith('Treinador Clube Pts')) { section = 'coaches'; continue; }
      if (line.startsWith('Patrocinador')) section = null;
      if (!section) continue;
      let rest = line.trim();
      while (rest) {
        const m = rest.match(PAT);
        if (!m) break;
        out[section].push({ r, j, n: m[1].trim(), c: ALIASES[m[2]] || m[2], p: +m[3] });
        rest = rest.slice(m[0].length).trim();
      }
    }
    return true;
  }

  // files: [{name, bytes: Uint8Array}] → pontuações
  async function parseFiles(pdfjs, files) {
    const out = { players: [], coaches: [], jds: [] };
    const report = [];
    for (const f of files) {
      try {
        const ok = parseLines(await pdfLines(pdfjs, f.bytes), out);
        report.push({ name: f.name, ok });
      } catch (e) { report.push({ name: f.name, ok: false, error: String(e) }); }
    }
    out.jds.sort((a, b) => a.j - b.j);
    return { data: out, report };
  }

  return { parseFiles, pdfLines, parseLines };
})();
if (typeof module !== 'undefined') module.exports = LRPdf;

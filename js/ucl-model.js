/* Modelo da UEFA Champions League Fantasy: pontos esperados por jogador na próxima jornada.
   Regras (gaming.uefa.com/en/uclfantasy/rules, 2026/27) — só eventos objetivos, sem notas:
   todos: jogar +1, 60' +1, golo de fora da área +1, assistência +3, cada 3 bolas recuperadas +1, homem do jogo +3,
          penálti ganho +2, penálti cometido −1, penálti falhado −2, amarelo −1, vermelho −3, autogolo −2
   GR: golo +6, penálti defendido +5, baliza a zero +4 (60'+), cada 3 defesas +1, cada 2 golos sofridos −1
   DEF: golo +6, baliza a zero +4 (60'+), cada 2 golos sofridos −1 · MED: golo +5, baliza a zero +1 · AV: golo +4
   Plantel 15 (2 GR, 5 DEF, 5 MED, 3 AV), 100 M€, máx. 3 por clube; onze com 1 GR, ≥3 DEF, ≥2 MED, ≥1 AV; capitão ×2. */
const UCLModel = (() => {
  const GOAL = { G: 6, D: 6, M: 5, F: 4 }, CS = { G: 4, D: 4, M: 1, F: 0 };
  const NEED = { G: 2, D: 5, M: 5, F: 3 };
  const FORMATIONS = ['3-4-3', '3-5-2', '4-3-3', '4-4-2', '4-5-1', '5-2-3', '5-3-2', '5-4-1'];
  // Médias reais da época por 90' (jornadas 1-3, 1686 exibições), usadas quando o jogador tem poucos minutos.
  // A Champions 2026/27 tem 4,09 golos por jogo → LG = 2,05 golos por equipa.
  const LG = 2.05;
  const PRIOR = { g: { G: 0, D: 0.076, M: 0.21, F: 0.53 }, a: { G: 0.005, D: 0.083, M: 0.21, F: 0.26 },
    br: { G: 0.3, D: 5.1, M: 3.3, F: 1.4 }, y: { G: 0.02, D: 0.125, M: 0.116, F: 0.092 }, gob: { G: 0, D: 0.06, M: 0.21, F: 0.09 },
    svPts: 0.7 }; // pontos de defesas por jogo do GR (o ficheiro da UEFA não traz as defesas: deduzem-se dos pontos)
  const K = 2.5; // peso do prior, em jogos de 90'
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const pois = (l, k) => { let f = 1; for (let i = 2; i <= k; i++) f *= i; return Math.exp(-l) * Math.pow(l, k) / f; };
  // E[floor(X/n)] para X ~ Poisson(l): "cada n …" das regras
  const floorE = (l, n) => { let s = 0; for (let k = n; k < 40; k++) s += Math.floor(k / n) * pois(l, k); return s; };

  // Horas da UEFA ("MM/DD/AAAA HH:MM:SS") estão em hora da Europa Central
  function cetMs(dt) {
    const m = dt && dt.match(/(\d+)\/(\d+)\/(\d+) (\d+):(\d+)/); if (!m) return null;
    let [, mo, d, y, h, mi] = m.map(Number); if (y < 100) y += 2000;
    const lastSun = mon => { const t = new Date(Date.UTC(y, mon + 1, 0)); return t.getUTCDate() - t.getUTCDay(); };
    const utcGuess = Date.UTC(y, mo - 1, d, h - 1, mi);
    const dstStart = Date.UTC(y, 2, lastSun(2), 1), dstEnd = Date.UTC(y, 9, lastSun(9), 1);
    return utcGuess - (utcGuess >= dstStart && utcGuess < dstEnd ? 3600e3 : 0);
  }

  // Golos esperados (casa, fora) a partir das odds 1X2 (+ mais/menos 2,5 golos se houver)
  function lambdasFromOdds(o, over25, under25) {
    const ih = 1 / o.h, id = 1 / o.d, ia = 1 / o.a, s = ih + id + ia;
    const ph = ih / s, pd = id / s, pa = ia / s;
    const pOver = over25 && under25 ? (1 / over25) / (1 / over25 + 1 / under25) : null;
    let best = null;
    for (let lh = 0.2; lh <= 4.01; lh += 0.05) for (let la = 0.2; la <= 4.01; la += 0.05) {
      let w = 0, d = 0, under = 0;
      for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) { const p = pois(lh, i) * pois(la, j); if (i > j) w += p; else if (i === j) d += p; if (i + j <= 2) under += p; }
      const l = 1 - w - d;
      let e = (w - ph) ** 2 + (d - pd) ** 2 + (l - pa) ** 2;
      e += pOver != null ? 0.5 * (1 - under - pOver) ** 2 : 0.02 * (lh + la - 2 * LG) ** 2;
      if (!best || e < best.e) best = { e, lh, la, ph, pd, pa };
    }
    return best;
  }

  // Liga um jogo da UEFA ao evento do Sofascore (código da equipa e nome)
  function matchEvent(m, events) {
    const sc = (u, s) => (s.code && u.code && norm(s.code) === norm(u.code) ? 2 : 0)
      + ([s.name, s.short].some(n => n && (norm(n).includes(norm(u.name)) || norm(u.name).includes(norm(n)))) ? 1 : 0);
    let best = null;
    for (const e of events || []) { const v = sc(m.home, e.home) + sc(m.away, e.away); if (v >= 1 && (!best || v > best.v)) best = { v, e }; } // cada equipa joga uma vez por jornada
    return best?.e || null;
  }

  // Força de cada equipa sem odds: preço médio dos 11 jogadores mais caros (o mercado da Fantasy reflete a qualidade)
  function teamPower(data) {
    const by = {};
    for (const p of data.players) (by[p.tId] ||= []).push(p.price);
    const pw = {};
    for (const [t, a] of Object.entries(by)) { a.sort((x, y) => y - x); const top = a.slice(0, 11); pw[t] = top.reduce((s, v) => s + v, 0) / top.length; }
    const avg = Object.values(pw).reduce((s, v) => s + v, 0) / Math.max(1, Object.keys(pw).length);
    return { pw, avg };
  }

  // Jogos da jornada a prever, com probabilidades
  function games(data, sofaUcl) {
    const mdx = data.fixtures.find(f => f.md === data.meta.md) || data.fixtures.find(f => !f.locked);
    const tp = teamPower(data);
    const out = {};
    for (const m of mdx?.matches || []) {
      const ev = matchEvent(m, sofaUcl?.events);
      let lh, la, src;
      if (ev?.odds?.h) { const r = lambdasFromOdds(ev.odds, ev.over25, ev.under25); lh = r.lh; la = r.la; src = 'odds'; }
      else {
        const rh = (tp.pw[m.home.id] || tp.avg) / tp.avg, ra = (tp.pw[m.away.id] || tp.avg) / tp.avg;
        lh = LG * Math.pow(rh, 1.3) / Math.pow(ra, 0.9) * 1.1; la = LG * Math.pow(ra, 1.3) / Math.pow(rh, 0.9) * 0.9; src = 'preços';
      }
      let pw = 0, pd = 0;
      for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) { const p = pois(lh, i) * pois(la, j); if (i > j) pw += p; else if (i === j) pd += p; }
      const ts = ev?.ts ? ev.ts * 1000 : cetMs(m.dt);
      const g = { id: m.id, ts, home: m.home, away: m.away, lh, la, pHome: pw, pDraw: pd, pAway: 1 - pw - pd, src };
      out[m.home.id] = { ...g, me: m.home, opp: m.away, isHome: true, lf: lh, la_: la, pw, pl: 1 - pw - pd };
      out[m.away.id] = { ...g, me: m.away, opp: m.home, isHome: false, lf: la, la_: lh, pw: 1 - pw - pd, pl: pw };
    }
    return out;
  }

  // Pontos de um jogo pelas regras (sem as defesas, que o ficheiro não traz) — confirmado em 96,6% de 2175 exibições
  function basePts(x, pos) {
    return (x.min > 0 ? 1 : 0) + (x.min >= 60 ? 1 : 0) + x.g * GOAL[pos] + 3 * x.a + (x.cs ? CS[pos] : 0) + Math.floor(x.br / 3) + 3 * (x.mom || 0)
      + (x.gob || 0) - (x.y || 0) - 3 * (x.r || 0) - 2 * (x.og || 0) + 2 * (x.pe || 0) - (x.pc || 0) - 2 * (x.pm || 0) + 5 * (x.ps || 0)
      + (pos === 'G' || pos === 'D' ? -Math.floor(x.gc / 2) : 0);
  }

  // Disponibilidade da UEFA: pStatus I = lesionado, S = castigado, NIS = fora da convocatória, D = dúvida;
  // "Unlikely to start next game" = provável suplente (ainda pode entrar).
  const STATUS = { I: 'Lesionado', S: 'Castigado', NIS: 'Fora da convocatória', D: 'Dúvida' };
  function statusFactor(p) {
    if (['I', 'S', 'NIS'].includes(p.status)) return 0;
    let f = p.status === 'D' ? 0.5 : 1;
    if (/unlikely/i.test(p.trained)) f *= 0.35;
    return f;
  }

  function project(data, sofaUcl, opts = {}) {
    const G = games(data, sofaUcl), avail = opts.availOverride || {};
    const out = [];
    // jogos já disputados por cada equipa (para contar quem não jogou)
    const teamMds = {};
    for (const f of data.fixtures) for (const m of f.matches) if (m.hs != null && f.md < data.meta.md) { (teamMds[m.home.id] ||= []).push(f.md); (teamMds[m.away.id] ||= []).push(f.md); }
    for (const p of data.players) {
      const g = G[p.tId]; if (!g || !p.pos) continue;
      const h = (data.hist[p.id] || []);
      const mds = (teamMds[p.tId] || []).sort((a, b) => b - a);
      const byMd = Object.fromEntries(h.map(x => [x.md, x]));
      const last = mds.slice(0, 3).map(md => byMd[md]?.min || 0);
      // probabilidade de jogar: últimos 3 jogos da equipa (o mais recente pesa mais)
      const w = [0.5, 0.3, 0.2].slice(0, last.length), ws = w.reduce((s, v) => s + v, 0) || 1;
      // sem jogos da equipa (1.ª jornada): o preço da Fantasy indica quem é titular
      let pPlay = last.length ? last.reduce((s, m, i) => s + (m > 0 ? w[i] : 0), 0) / ws : clamp((p.price - 4) / 3, 0.25, 0.9);
      if (last.length && last[0] === 0) pPlay *= 0.7;
      pPlay = Math.min(pPlay, 0.92) * statusFactor(p); // backtest: titulares "certos" jogaram 81-89% das vezes
      if (avail[p.id] != null) pPlay = avail[p.id];
      const played = h.filter(x => x.min > 0), mins = played.reduce((s, x) => s + x.min, 0);
      const minIfPlay = played.length ? played.reduce((s, x) => s + x.min, 0) / played.length : (p.pos === 'G' ? 90 : pPlay > 0.6 ? 80 : 55);
      const p60c = minIfPlay >= 80 ? 0.92 : minIfPlay >= 70 ? 0.8 : minIfPlay >= 60 ? 0.62 : minIfPlay >= 45 ? 0.35 : 0.08;
      const p60 = pPlay * p60c, expMin = pPlay * minIfPlay;
      const sum = k => played.reduce((s, x) => s + (x[k] || 0), 0);
      const rate = (k, prior) => (sum(k) + K * prior) / (mins / 90 + K); // por 90'
      const attack = g.lf / LG, defence = g.la_ / LG;
      const eg = rate('g', PRIOR.g[p.pos]) * expMin / 90 * attack;
      const ea = rate('a', PRIOR.a[p.pos]) * expMin / 90 * attack;
      const Pg = 1 - Math.exp(-eg);
      const cs = Math.exp(-g.la_);
      let pts = pPlay * 1 + p60 * 1 + eg * GOAL[p.pos] + ea * 3 + p60 * cs * CS[p.pos];
      const brPts = floorE(rate('br', PRIOR.br[p.pos]) * minIfPlay / 90, 3) * pPlay;
      pts += brPts;
      pts += eg * (sum('g') + 2 * PRIOR.gob[p.pos]) / (sum('g') + 2); // golos de fora da área
      let gcPts = 0, svPts = 0;
      if (p.pos === 'G' || p.pos === 'D') gcPts = -floorE(g.la_ * Math.min(1, minIfPlay / 90), 2) * pPlay;
      if (p.pos === 'G') { // pontos de defesas = pontos reais − o que as outras regras explicam
        const sv = played.filter(x => x.pts != null).map(x => x.pts - basePts(x, 'G'));
        svPts = (sv.reduce((s, v) => s + v, 0) + K * PRIOR.svPts) / (sv.length + K) * defence * pPlay;
      }
      pts += gcPts + svPts;
      pts -= rate('y', PRIOR.y[p.pos]) * expMin / 90 + 3 * 0.005 * pPlay;
      // homem do jogo: quem decide (golo/assistência) em equipas que ganham; histórico conta
      const momRate = (sum('mom') + 0.03 * K) / (played.length + K);
      const pMom = clamp(0.35 * momRate * pPlay + 0.22 * Pg * (0.5 + g.pw) + 0.06 * (1 - Math.exp(-ea)), 0, 0.6);
      pts += 3 * pMom;
      const realPts = played.map(x => x.pts).filter(v => v != null);
      out.push({ id: p.id, name: p.name, short: p.short, team: p.team, teamId: p.tId, code: p.code, pos: p.pos, price: p.price,
        opp: (g.isHome ? 'vs ' : '@ ') + g.opp.name, home: g.isHome, ts: g.ts, pts, pPlay, p60, expMin, minIfPlay, last,
        eg, ea, Pg, cs, pw: g.pw, la: g.la_, pMom, status: STATUS[p.status] || (/unlikely/i.test(p.trained) ? 'Provável suplente' : ''), sel: p.sel, tot: p.tot,
        avgPts: realPts.length ? realPts.reduce((s, v) => s + v, 0) / realPts.length : null, games: played.length });
    }
    return { players: out, games: G };
  }

  // Onze ideal de um plantel de 15; banco: GR suplente + 3 por prioridade (pontos esperados)
  function bestXI(sq) {
    const by = { G: [], D: [], M: [], F: [] };
    sq.slice().sort((a, b) => b.pts - a.pts).forEach(p => by[p.pos]?.push(p));
    let best = null;
    for (const f of FORMATIONS) {
      const [d, m, fw] = f.split('-').map(Number);
      if (by.G.length < 1 || by.D.length < d || by.M.length < m || by.F.length < fw) continue;
      const xi = [by.G[0], ...by.D.slice(0, d), ...by.M.slice(0, m), ...by.F.slice(0, fw)];
      const tot = xi.reduce((s, p) => s + p.pts, 0);
      if (!best || tot > best.tot) best = { formation: f, xi, tot };
    }
    if (!best) return null;
    const inXI = new Set(best.xi.map(p => p.id));
    const rest = sq.filter(p => !inXI.has(p.id));
    const bench = [...rest.filter(p => p.pos === 'G'), ...rest.filter(p => p.pos !== 'G').sort((a, b) => b.pts - a.pts)];
    const captain = best.xi.reduce((a, b) => (b.pts > a.pts ? b : a));
    // dica da UEFA: capitão de um jogo do 1.º dia permite trocar depois; sugere-o se perder pouco
    const firstDay = Math.min(...best.xi.map(p => new Date(p.ts).toDateString() === new Date(Math.min(...sq.map(q => q.ts))).toDateString() ? p.ts : Infinity));
    const day1 = best.xi.filter(p => p.ts === firstDay || new Date(p.ts).toDateString() === new Date(firstDay).toDateString());
    const capDay1 = day1.length ? day1.reduce((a, b) => (b.pts > a.pts ? b : a)) : null;
    return { formation: best.formation, xi: best.xi, bench, captain, capDay1: capDay1 && capDay1.id !== captain.id && captain.pts - capDay1.pts < 1.5 ? capDay1 : null,
      total: best.tot + captain.pts };
  }

  // Melhores transferências: ganho no onze ideal, dentro do saldo e do limite por clube
  function transfers(all, squad, bank, maxPerClub = 3) {
    const base = bestXI(squad)?.total || 0;
    const ids = new Set(squad.map(p => p.id));
    const club = {}; squad.forEach(p => club[p.teamId] = (club[p.teamId] || 0) + 1);
    const out = [];
    for (const o of squad) {
      const money = bank + o.price;
      const cands = all.filter(p => p.pos === o.pos && !ids.has(p.id) && p.price <= money + 1e-9 && (club[p.teamId] || 0) - (o.teamId === p.teamId ? 1 : 0) < maxPerClub)
        .sort((a, b) => b.pts - a.pts).slice(0, 12);
      for (const i of cands) {
        const t = bestXI(squad.map(p => (p.id === o.id ? i : p)))?.total || 0;
        out.push({ out: o, in: i, gain: t - base, cost: i.price - o.price });
      }
    }
    return out.sort((a, b) => b.gain - a.gain);
  }

  // Plantel de raiz (Wildcard/Limitless ou equipa nova): melhora troca a troca o onze ideal (+10% do banco)
  // começando no plantel mais barato válido; respeita orçamento e máximo por clube.
  function buildSquad(all, budget = 100, maxPerClub = 3) {
    const pool = all.filter(p => p.pPlay > 0.2);
    const byPos = pos => pool.filter(p => p.pos === pos);
    const club = sq => { const c = {}; sq.forEach(p => c[p.teamId] = (c[p.teamId] || 0) + 1); return c; };
    let sq = [];
    for (const [pos, n] of Object.entries(NEED)) {
      for (const p of byPos(pos).sort((a, b) => a.price - b.price || b.pts - a.pts)) { if (sq.filter(q => q.pos === pos).length >= n) break; if ((club(sq)[p.teamId] || 0) < maxPerClub) sq.push(p); }
    }
    const score = s => { const b = bestXI(s); return b ? b.total + 0.1 * b.bench.reduce((a, p) => a + p.pts, 0) : -1e9; };
    const cands = Object.fromEntries(Object.keys(NEED).map(pos => [pos, byPos(pos).sort((a, b) => b.pts - a.pts).slice(0, 45)]));
    let cur = score(sq);
    for (let it = 0; it < 60; it++) {
      const cost = sq.reduce((a, p) => a + p.price, 0), c = club(sq), ids = new Set(sq.map(p => p.id));
      let bestMove = null;
      for (const o of sq) for (const i of cands[o.pos]) {
        if (ids.has(i.id) || cost - o.price + i.price > budget + 1e-9 || (c[i.teamId] || 0) - (i.teamId === o.teamId ? 1 : 0) >= maxPerClub) continue;
        const s = score(sq.map(p => (p.id === o.id ? i : p)));
        if (s > cur + 1e-6 && (!bestMove || s > bestMove.s)) bestMove = { o, i, s };
      }
      if (!bestMove) break;
      sq = sq.map(p => (p.id === bestMove.o.id ? bestMove.i : p)); cur = bestMove.s;
    }
    return { squad: sq, cost: sq.reduce((a, p) => a + p.price, 0), xi: bestXI(sq) };
  }

  return { project, bestXI, transfers, buildSquad, games, cetMs, basePts, STATUS, NEED, FORMATIONS, GOAL, norm };
})();
if (typeof module !== 'undefined') module.exports = UCLModel;

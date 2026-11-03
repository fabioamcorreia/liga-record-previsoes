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
  // As odds subestimam os golos desta Champions: jornadas 1-3 previam 186 golos e houve 221 (baliza a zero prevista 22,5%, real 16,7%).
  // Corrige-se o que cada equipa sofre (baliza a zero, golos sofridos, vitória/empate).
  const ODDS_K = 1.19;
  const PRIOR = { br: { G: 0.3, D: 5.1, M: 3.3, F: 1.4 }, y: { G: 0.02, D: 0.125, M: 0.116, F: 0.092 }, gob: { G: 0, D: 0.06, M: 0.21, F: 0.09 },
    svPts: 0.7 }; // pontos de defesas por jogo do GR (o ficheiro da UEFA não traz as defesas: deduzem-se dos pontos)
  // O preço da Fantasy prevê muito bem golos, assistências e homem do jogo (ajuste de Poisson nas jornadas 1-3):
  // taxa = base × e^(k × (preço − 6)). Ex.: AV de 11 M€ ≈ 1,3 golos/90', AV de 5 M€ ≈ 0,34.
  const PRICE = { g: { G: [0, 0], D: [0.133, 0.39], M: [0.206, 0.40], F: [0.423, 0.23] }, a: { G: [0.005, 0], D: [0.085, 0.02], M: [0.214, 0.28], F: [0.214, 0.21] },
    mom: { G: [0.007, 0.79], D: [0.042, 0.53], M: [0.039, 0.55], F: [0.021, 0.62] } }; // mom = por jogo
  const byPrice = (k, p) => PRICE[k][p.pos][0] * Math.exp(PRICE[k][p.pos][1] * (p.price - 6));
  // sem jogos da equipa (1.ª jornada): probabilidade de jogar pelo preço (observado nas jornadas 1-3)
  const PLAY = { G: [[6, 0.95], [5, 0.75], [0, 0.2]], D: [[6, 0.9], [5, 0.68], [4, 0.45], [0, 0.5]], M: [[8, 0.88], [7, 0.8], [6, 0.68], [5, 0.55], [0, 0.4]], F: [[8, 0.85], [6, 0.74], [5, 0.35], [0, 0.5]] };
  const K = 6; // peso do prior, em jogos de 90' (backtest J1-J3: 6 dá o menor erro)
  let FORM_W = 0; // peso da forma (pts/jogo nos últimos 3) misturada no esperado
  // xG/xA do Sofascore (jogos da Champions): contam como golos/assistências "de prova" com este peso (backtest J2-J3)
  // (golos e assistências da UEFA + XW × xG/xA). J2-J3: neutro para golos (log-veros. −400,3 → −400,1), ligeiro ganho nos AV; assist. ~0.
  let XW = { g: 1, a: 0.5 };
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
      if (ev?.odds?.h) { const r = lambdasFromOdds(ev.odds, ev.over25, ev.under25); lh = r.lh * ODDS_K; la = r.la * ODDS_K; src = 'odds'; }
      else {
        const rh = (tp.pw[m.home.id] || tp.avg) / tp.avg, ra = (tp.pw[m.away.id] || tp.avg) / tp.avg;
        lh = LG * Math.pow(rh, 1.3) / Math.pow(ra, 0.9) * 1.1; la = LG * Math.pow(ra, 1.3) / Math.pow(rh, 0.9) * 0.9; src = 'preços';
      }
      let pw = 0, pd = 0;
      for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) { const p = pois(lh, i) * pois(la, j); if (i > j) pw += p; else if (i === j) pd += p; }
      const ts = ev?.ts ? ev.ts * 1000 : cetMs(m.dt);
      const g = { id: m.id, ts, home: m.home, away: m.away, lh, la, pHome: pw, pDraw: pd, pAway: 1 - pw - pd, src };
      // typ = golos habituais da equipa (contra um adversário médio): o preço do jogador já os reflete
      const typ = id => LG * Math.pow((tp.pw[id] || tp.avg) / tp.avg, 1.3);
      // o ataque dos jogadores foi calibrado com os golos das odds sem a correção (P(golo) bate certo assim)
      const atk = src === 'odds' ? 1 / ODDS_K : 1;
      out[m.home.id] = { ...g, me: m.home, opp: m.away, isHome: true, lf: lh * atk, la_: la, pw, pl: 1 - pw - pd, typ: typ(m.home.id) };
      out[m.away.id] = { ...g, me: m.away, opp: m.home, isHome: false, lf: la * atk, la_: lh, pw: 1 - pw - pd, pl: pw, typ: typ(m.away.id) };
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

  // Índice das estatísticas do Sofascore por jogador: linhas [jornada, nome, nome curto, equipa, código, pos, min, xG, xA, …]
  function sofaIndex(rows) {
    const by = new Map(), byCode = new Map(), byName = new Map();
    for (const r of rows || []) {
      const [md, name, short, , code] = r, k = norm(code) + '|' + norm(name);
      let e = by.get(k);
      if (!e) {
        e = { name: norm(name), short: norm(short), code: norm(code), md: {} }; by.set(k, e);
        (byCode.get(e.code) || byCode.set(e.code, []).get(e.code)).push(e); (byName.get(e.name) || byName.set(e.name, []).get(e.name)).push(e);
      }
      const m = e.md[md] ||= { xg: 0, xa: 0 }; m.xg += r[7]; m.xa += r[8];
    }
    return { by, byCode, byName };
  }
  // os códigos das equipas diferem (UEFA "BAY", Sofascore "FCB"): liga-as pelos nomes dos jogadores em comum
  function sofaTeams(ix, players) {
    const votes = {};
    for (const p of players) for (const e of ix.byName.get(norm(p.name)) || []) { const v = (votes[p.tId] ||= {}); v[e.code] = (v[e.code] || 0) + 1; }
    return Object.fromEntries(Object.entries(votes).map(([t, v]) => [t, Object.entries(v).sort((a, b) => b[1] - a[1])[0][0]]));
  }
  function sofaFind(ix, p, code) {
    if (!ix || !code) return null;
    const n = norm(p.name), list = ix.byCode.get(code) || [];
    const last = n.split(' ').pop();
    return ix.by.get(code + '|' + n) || list.find(e => e.name.endsWith(' ' + last) && e.name[0] === n[0]) || list.find(e => e.name.includes(n) || n.includes(e.name))
      || (list.filter(e => e.name.split(' ').pop() === last).length === 1 ? list.find(e => e.name.split(' ').pop() === last) : null);
  }

  function project(data, sofaUcl, opts = {}) {
    const G = games(data, sofaUcl), avail = opts.availOverride || {};
    const six = sofaUcl?.stats?.length ? sofaIndex(sofaUcl.stats) : null, steam = six ? sofaTeams(six, data.players) : {};
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
      let pPlay = last.length ? last.reduce((s, m, i) => s + (m > 0 ? w[i] : 0), 0) / ws : PLAY[p.pos].find(([t]) => p.price >= t)[1];
      if (last.length && last[0] === 0) pPlay *= 0.7;
      pPlay = Math.min(pPlay, 0.86) * statusFactor(p); // backtest J1-J3: quem jogou os últimos jogos todos jogou 83% das vezes
      if (avail[p.id] != null) pPlay = avail[p.id];
      const played = h.filter(x => x.min > 0), mins = played.reduce((s, x) => s + x.min, 0);
      const minIfPlay = played.length ? played.reduce((s, x) => s + x.min, 0) / played.length : (p.pos === 'G' ? 90 : pPlay > 0.6 ? 80 : 55);
      const p60c = minIfPlay >= 80 ? 0.92 : minIfPlay >= 70 ? 0.8 : minIfPlay >= 60 ? 0.62 : minIfPlay >= 45 ? 0.35 : 0.08;
      const p60 = pPlay * p60c, expMin = pPlay * minIfPlay;
      const sum = k => played.reduce((s, x) => s + (x[k] || 0), 0);
      const rate = (k, prior) => (sum(k) + K * prior) / (mins / 90 + K); // por 90'
      // com xG/xA: (golos + XW·xG + K·prior) / ((1 + XW)·jogos de 90' + K)
      const sx = sofaFind(six, p, steam[p.tId]), xsum = k => played.reduce((s, x) => s + (sx?.md[x.md]?.[k] || 0), 0);
      const rateX = (k, xk, prior, w) => (sx && w ? (sum(k) + w * xsum(xk) + K * prior) / ((1 + w) * mins / 90 + K) : rate(k, prior));
      // ataque face ao habitual da equipa (não face à média da prova: senão a força da equipa contava duas vezes)
      const attack = g.lf / g.typ, defence = g.la_ / LG;
      const eg = rateX('g', 'xg', byPrice('g', p), XW.g) * expMin / 90 * attack;
      const ea = rateX('a', 'xa', byPrice('a', p), XW.a) * expMin / 90 * attack;
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
      // homem do jogo: taxa pelo preço + histórico, mais provável quando a equipa ganha
      const pMom = clamp((sum('mom') + K * byPrice('mom', p)) / (played.length + K) * pPlay * (0.55 + g.pw), 0, 0.6);
      pts += 3 * pMom;
      const realPts = played.map(x => x.pts).filter(v => v != null);
      // forma: pontos por jogo nos últimos 3 jogos em que jogou (só se mostra; o backtest não lhe dá peso, ver FORM_W)
      const recent = played.slice().sort((a, b) => b.md - a.md).slice(0, 3).map(x => x.pts).filter(v => v != null);
      const form = recent.length ? recent.reduce((s, v) => s + v, 0) / recent.length : null;
      if (FORM_W && form != null) pts = (1 - FORM_W) * pts + FORM_W * pPlay * form;
      const gobFrac = (sum('g') + 2 * PRIOR.gob[p.pos]) / (sum('g') + 2);
      // para a simulação jogo a jogo: o que vale cada evento se ele jogar
      const sim = pPlay > 0 ? { pp: pPlay, p60c, g: eg / pPlay, gv: GOAL[p.pos] + gobFrac, a: ea / pPlay, csv: CS[p.pos], gc: p.pos === 'G' || p.pos === 'D',
        rest: (brPts + svPts) / pPlay - rate('y', PRIOR.y[p.pos]) * minIfPlay / 90 - 0.015, mom: pMom / pPlay, match: g.id, home: g.isHome, lf: g.lf, la: g.la_ } : null;
      out.push({ id: p.id, name: p.name, short: p.short, team: p.team, teamId: p.tId, code: p.code, pos: p.pos, price: p.price,
        opp: (g.isHome ? 'vs ' : '@ ') + g.opp.name, home: g.isHome, ts: g.ts, pts, pPlay, p60, expMin, minIfPlay, last,
        eg, ea, Pg, Pa: 1 - Math.exp(-ea), xg90: sx && mins ? xsum('xg') / mins * 90 : null, xa90: sx && mins ? xsum('xa') / mins * 90 : null, cs, pCS: p.pos === 'F' ? 0 : p60 * cs, pw: g.pw, la: g.la_, lf: g.lf, pMom, form, formN: recent.length, sim,
        status: STATUS[p.status] || (/unlikely/i.test(p.trained) ? 'Provável suplente' : ''), sel: p.sel, tot: p.tot,
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

  // ---------- jornada simulada com as substituições entre dias ----------
  // Na UEFA contam os 11 que ACABAM a jornada no onze. Depois de cada dia podes tirar até 4 titulares (os que saem ficam
  // com 0) e pôr suplentes que ainda não jogaram, e passar a braçadeira a quem ainda não jogou. Sem mudanças manuais há
  // substituições automáticas (quem não jogou → 1.º suplente que jogou, sem estragar a tática). A tática não se escolhe:
  // é a que resultar das trocas (1 GR, ≥3 DEF, ≥2 MED, ≥1 AV). Monte Carlo com cenários fixos por jogador e por jogo
  // (números aleatórios comuns: comparar dois onzes usa os mesmos cenários).
  const NSIM = 800;
  const rng = seed => { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
  const hash = x => Math.imul((+x || 0) ^ 0x5bd1e995, 2654435761) >>> 0;
  const poisS = (l, u) => { let k = 0, p = Math.exp(-l), c = p; while (u > c && k < 12) { k++; p *= l / k; c += p; } return k; };
  const teamSim = new Map(), plSim = new WeakMap();
  function matchGoals(m) { // golos (casa, fora) do jogo em cada cenário
    const lh = m.home ? m.lf : m.la, la = m.home ? m.la : m.lf, key = `${m.match}|${lh.toFixed(3)}|${la.toFixed(3)}`;
    let t = teamSim.get(key);
    if (!t) { const r = rng(hash(m.match) ^ 0x2545f491); t = { h: new Uint8Array(NSIM), a: new Uint8Array(NSIM) }; for (let i = 0; i < NSIM; i++) { t.h[i] = poisS(lh, r()); t.a[i] = poisS(la, r()); } teamSim.set(key, t); }
    return t;
  }
  function samples(p) {
    const key = p.sim || p; let s = plSim.get(key); if (s) return s;
    s = { pts: new Float32Array(NSIM), plays: new Uint8Array(NSIM) };
    const m = p.sim;
    if (m) {
      const T = matchGoals(m), r = rng(hash(p.id));
      for (let i = 0; i < NSIM; i++) {
        const u = r(), full = r() < m.p60c, ug = r(), ua = r(), um = r();
        if (u >= m.pp) continue;
        const ga = m.home ? T.a[i] : T.h[i];
        let v = 1 + (full ? 1 : 0) + poisS(m.g, ug) * m.gv + 3 * poisS(m.a, ua) + m.rest + (um < m.mom ? 3 : 0);
        if (full && ga === 0) v += m.csv;
        if (m.gc) v -= Math.floor((full ? ga : Math.round(ga * 0.4)) / 2);
        s.pts[i] = v; s.plays[i] = 1;
      }
    }
    plSim.set(key, s); return s;
  }
  const dayKey = ts => new Date(ts).toDateString();

  // Prepara um plantel para simular: dia de cada jogador (0 = 1.º dia da jornada), valor esperado se jogar, cenários
  function prep(sq) {
    const days = [...new Set(sq.map(p => dayKey(p.ts)))].sort((a, b) => new Date(a) - new Date(b));
    const P = {};
    for (const p of sq) P[p.id] = { p, pos: p.pos, pts: p.pts, vPlay: p.pPlay > 0 ? p.pts / p.pPlay : 0, day: days.indexOf(dayKey(p.ts)), S: samples(p) };
    return { P, nDays: days.length, days };
  }
  const okSwap = (P, xi, o, b) => {
    if ((P[o].pos === 'G') !== (P[b].pos === 'G')) return false;
    if (P[o].pos === P[b].pos || P[o].pos === 'G') return true;
    let d = 0, m = 0, f = 0;
    for (const id of xi) { const k = id === o ? P[b].pos : P[id].pos; if (k === 'D') d++; else if (k === 'M') m++; else if (k === 'F') f++; }
    return d >= 3 && m >= 2 && f >= 1;
  };
  // Pontuação final de um onze (com os valores conhecidos `val` e quem jogou `plays`), com ou sem substituições automáticas
  function finalScore(P, xi, bench, cap, auto, val, plays) {
    let tot = 0, capOk = false;
    if (!auto) { for (const id of xi) tot += val(id); return tot + (cap != null && plays(cap) ? val(cap) : 0); }
    const used = new Set(), cur = xi.slice();
    for (let j = 0; j < cur.length; j++) {
      const id = cur[j]; if (plays(id)) continue;
      for (const b of bench) if (!used.has(b) && !cur.includes(b) && plays(b) && okSwap(P, cur, id, b)) { used.add(b); cur[j] = b; break; }
    }
    for (const id of cur) tot += val(id);
    capOk = cur.includes(cap) && plays(cap);
    return tot + (capOk ? val(cap) : 0);
  }
  // Um cenário: decisões em cada intervalo entre dias, com o que se sabe nesse momento
  function playScenario(i, sp, L, noSubs) {
    const { P, nDays } = sp;
    let xi = L.xi.slice(), cap = L.captain, auto = true;
    const real = id => P[id].S.pts[i], played = id => P[id].S.plays[i] === 1;
    const out = new Set(), bench = L.bench;
    if (!noSubs) for (let k = 0; k < nDays - 1; k++) {
      // no intervalo a seguir ao dia k: sabe-se o resultado de quem já jogou e (pelos onzes iniciais) quem joga no dia seguinte
      const val = id => (P[id].day <= k ? real(id) : P[id].day === k + 1 ? (played(id) ? P[id].vPlay : 0) : P[id].pts);
      const plays = id => (P[id].day <= k + 1 ? played(id) : true);
      const yet = id => P[id].day > k;
      const xi2 = xi.slice(), gone = []; let cap2 = cap, n = 0;
      const greedy = () => {
        while (n < 4) {
          let best = null;
          for (const o of xi2) {
            if (o === cap2) continue;
            const vo = val(o);
            for (const b of bench) if (yet(b) && !out.has(b) && !xi2.includes(b)) { const g = val(b) - vo; if (g > 0.01 && (!best || g > best.g) && okSwap(P, xi2, o, b)) best = { o, b, g }; }
          }
          if (!best) return;
          xi2[xi2.indexOf(best.o)] = best.b; out.add(best.o); gone.push(best.o); n++;
        }
      };
      greedy();
      // braçadeira: se o capitão já jogou (ou não vai jogar), passa para quem ainda não jogou se valer mais
      if (P[cap2].day <= k || !plays(cap2)) {
        const keep = P[cap2].day <= k ? real(cap2) : 0;
        let nc = null; for (const id of xi2) if (yet(id) && plays(id) && (!nc || val(id) > val(nc))) nc = id;
        if (nc && val(nc) > keep + 0.01) { cap2 = nc; greedy(); }
      }
      const changed = cap2 !== cap || xi2.some((id, j) => id !== xi[j]);
      if (changed && (!auto || finalScore(P, xi2, bench, cap2, false, val, plays) > finalScore(P, xi, bench, cap, true, val, plays) + 0.01)) { xi = xi2; cap = cap2; auto = false; }
      else gone.forEach(id => out.delete(id)); // não fez as trocas
    }
    return finalScore(P, xi, bench, cap, auto, real, played);
  }
  function evalLineup(sp, L, { noSubs = false, n = NSIM } = {}) {
    let s = 0; for (let i = 0; i < n; i++) s += playScenario(i, sp, L, noSubs); return s / n;
  }

  // Pontos que um onze faria com os resultados reais (rec(id) → {pts, min}), decidindo as trocas como o plano
  function realize(sq, L, rec, noSubs = false) {
    const sp = prep(sq), P = {};
    for (const [id, x] of Object.entries(sp.P)) { const r = rec(+id); P[id] = { ...x, S: { pts: [r?.pts ?? 0], plays: [(r?.min || 0) > 0 ? 1 : 0] } }; }
    return playScenario(0, { ...sp, P }, L, noSubs || sp.nDays < 2);
  }

  // Melhor onze inicial para a jornada com substituições: parte do melhor onze esperado e troca titular↔suplente
  // ou capitão enquanto a simulação melhorar. Devolve também as regras de troca para o intervalo.
  function plan(sq, opts = {}) {
    const b0 = bestXI(sq); if (!b0) return null;
    const sp = prep(sq), n = opts.n || NSIM, noSubs = opts.noSubs || sp.nDays < 2;
    const order = ids => [...ids.filter(id => sp.P[id].pos === 'G'), ...ids.filter(id => sp.P[id].pos !== 'G').sort((a, b) => sp.P[b].pts - sp.P[a].pts)];
    let L = opts.start ? { xi: opts.start.xi.slice(), bench: order(opts.start.bench), captain: opts.start.captain }
      : { xi: b0.xi.map(p => p.id), bench: b0.bench.map(p => p.id), captain: b0.captain.id };
    let ev = evalLineup(sp, L, { noSubs, n });
    if (!opts.fixed) for (let it = 0; it < (opts.iters ?? 8); it++) {
      let best = null;
      const tryL = c => { const v = evalLineup(sp, c, { noSubs, n }); if (v > ev + 0.05 && (!best || v > best.v)) best = { v, c }; };
      for (const o of L.xi) for (const b of L.bench) if (okSwap(sp.P, L.xi, o, b)) {
        const xi = L.xi.map(id => (id === o ? b : id));
        tryL({ xi, bench: order(L.bench.map(id => (id === b ? o : id))), captain: L.captain === o ? b : L.captain });
      }
      for (const c of L.xi) if (c !== L.captain) tryL({ ...L, captain: c });
      if (!best) break;
      L = best.c; ev = best.v;
    }
    const evAuto = evalLineup(sp, L, { noSubs: true, n });
    const P = sp.P, pl = id => P[id].p;
    // regras para o intervalo depois do 1.º dia
    const later = L.bench.filter(id => P[id].day > 0).map(id => ({ p: pl(id), v: P[id].vPlay })).sort((a, b) => b.v - a.v);
    const capP = pl(L.captain);
    let capSwitch = null;
    if (P[L.captain].day === 0) for (const id of L.xi) if (P[id].day > 0 && (!capSwitch || P[id].vPlay > capSwitch.v)) capSwitch = { p: pl(id), v: P[id].vPlay };
    const xiP = L.xi.map(pl), cnt = k => xiP.filter(p => p.pos === k).length;
    return { xi: xiP, bench: L.bench.map(pl), captain: capP, formation: `${cnt('D')}-${cnt('M')}-${cnt('F')}`, ev, evAuto, evStatic: xiP.reduce((s, p) => s + p.pts, 0) + capP.pts,
      days: sp.days, nDays: sp.nDays, dayOf: id => P[id]?.day, later, capSwitch, noSubs };
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
  // As melhores pelo onze esperado, reordenadas pela jornada simulada (com substituições entre dias)
  function transfersPlan(all, squad, bank, maxPerClub = 3, top = 12, { n = 400, iters = 3 } = {}) {
    const base = plan(squad, { n, iters })?.ev || 0;
    const seen = new Set(), list = transfers(all, squad, bank, maxPerClub).filter(t => { const k = t.out.id + '|' + t.in.id; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, top);
    return list.map(t => ({ ...t, gainStatic: t.gain, gain: (plan(squad.map(p => (p.id === t.out.id ? t.in : p)), { n, iters })?.ev || 0) - base })).sort((a, b) => b.gain - a.gain);
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

  // Transferências da jornada uma a uma (a seguinte calculada depois da anterior), até maxT; as que passam das
  // grátis custam −4 e só se fazem se o ganho na jornada simulada for maior do que isso.
  function improveSquad(all, squad, bank, { maxT = 2, freeT = 2, hit = 4, maxPerClub = 3 } = {}) {
    let sq = squad.slice(), money = bank; const moves = [];
    for (let k = 0; k < maxT; k++) {
      const t = transfersPlan(all, sq, money, maxPerClub, 6, { n: 250, iters: 2 })[0];
      const cost = k >= freeT ? hit : 0;
      if (!t || t.gain - cost <= 0.05) break;
      moves.push({ ...t, hit: cost }); sq = sq.map(p => (p.id === t.out.id ? t.in : p)); money -= t.cost;
    }
    const hits = moves.reduce((s, m) => s + m.hit, 0);
    return { squad: sq, moves, bank: money, hits, ev: plan(sq, { n: 400, iters: 3 }).ev - hits };
  }

  // De um plantel para outro, troca a troca: emparelha por posição (o melhor que sai com o melhor que entra), ordena
  // pelo ganho esperado de cada par e simula a jornada depois de cada troca → ganho de cada jogador e total acumulado.
  function explainChanges(oldSq, newSq, { n = 300 } = {}) {
    const keep = new Set(newSq.map(p => p.id)), had = new Set(oldSq.map(p => p.id));
    const pairs = [];
    for (const pos of ['G', 'D', 'M', 'F']) {
      const outs = oldSq.filter(p => p.pos === pos && !keep.has(p.id)).sort((a, b) => b.pts - a.pts);
      const ins = newSq.filter(p => p.pos === pos && !had.has(p.id)).sort((a, b) => b.pts - a.pts);
      outs.forEach((o, i) => ins[i] && pairs.push({ out: o, in: ins[i] }));
    }
    pairs.sort((a, b) => (b.in.pts - b.out.pts) - (a.in.pts - a.out.pts));
    let sq = oldSq.slice(), prev = plan(sq, { n, iters: 2 }).ev; const base = prev, steps = [];
    for (const t of pairs) {
      sq = sq.map(p => (p.id === t.out.id ? t.in : p));
      const ev = plan(sq, { n, iters: 2 }).ev;
      steps.push({ ...t, gain: ev - prev, ev, cost: t.in.price - t.out.price }); prev = ev;
    }
    return { base, steps, ev: prev };
  }

  // Projeção de uma jornada futura da fase de liga (sem odds: força das equipas pelos preços; o xG/xA conta na mesma)
  const projectMd = (data, md, sofaUcl) => project({ ...data, meta: { ...data.meta, md } }, md === data.meta.md ? sofaUcl : sofaUcl?.stats ? { stats: sofaUcl.stats } : null);
  // jogadores com os pontos somados de várias jornadas (para escolher um plantel para um período)
  function combine(projs) {
    const by = {};
    for (const pr of projs) for (const p of pr.players) { const c = by[p.id] ||= { ...p, pts: 0, pPlay: 0 }; c.pts += p.pts; c.pPlay = Math.max(c.pPlay, p.pPlay); }
    return Object.values(by);
  }

  // Plano dos jokers até ao fim da fase de liga (jornada 8): por jornada, o que daria o Limitless (só nessa jornada,
  // sem orçamento) e o Wildcard (plantel novo dessa jornada até à 8, com o orçamento atual) face a ficar com o plantel
  // e usar as transferências grátis (2 por jornada, guloso pelo onze esperado).
  function seasonPlan(data, sofaUcl, squadIds, bank, { lastMd = 8, maxPerClub = 3, onStep } = {}) {
    const mds = data.fixtures.filter(f => f.md >= data.meta.md && f.md <= lastMd && f.matches.length).map(f => f.md).sort((a, b) => a - b);
    const P = {}; for (const md of mds) { P[md] = projectMd(data, md, sofaUcl); P[md].byId = Object.fromEntries(P[md].players.map(p => [p.id, p])); }
    const at = (ids, md) => ids.map(id => P[md].byId[id]).filter(Boolean);
    const ev = (ids, md) => { const sq = at(ids, md); return sq.length === 15 ? plan(sq, { n: 300, iters: 2 }).ev : 0; };
    const value = ids => at(ids, mds[0]).reduce((s, p) => s + p.price, 0);
    // sem jokers: o plantel evolui com 2 transferências grátis por jornada (só as que ganham ≥ 0,5 no onze esperado)
    const base = {}; let ids = squadIds.slice(), money = bank;
    for (const md of mds) {
      for (let k = 0; k < 2; k++) {
        const t = transfers(P[md].players, at(ids, md), money, maxPerClub)[0];
        if (!t || t.gain < 0.5) break;
        ids = ids.map(id => (id === t.out.id ? t.in.id : id)); money -= t.cost;
      }
      base[md] = { ids: ids.slice(), ev: ev(ids, md), money };
      onStep && onStep(`sem jokers: jornada ${md}`);
    }
    const rows = [];
    for (const md of mds) {
      const lim = buildSquad(P[md].players, 999, maxPerClub);
      const limEv = ev(lim.squad.map(p => p.id), md);
      // Wildcard: plantel para as jornadas md..8 (pesa mais a 1.ª), com o dinheiro todo do plantel atual
      const win = mds.filter(m => m >= md);
      const wc = buildSquad(combine(win.map((m, i) => ({ players: P[m].players.map(p => ({ ...p, pts: p.pts * (i === 0 ? 1.3 : 1) })) }))), value(base[md].ids) + base[md].money, maxPerClub);
      const wcIds = wc.squad.map(p => p.id);
      const wcGain = win.reduce((s, m) => s + ev(wcIds, m) - base[m].ev, 0);
      rows.push({ md, deadline: Math.min(...P[md].players.map(p => p.ts)), base: base[md].ev, limitless: limEv, limGain: limEv - base[md].ev,
        wcGain, wcSquad: wc.squad, limSquad: lim.squad, window: win.length, oneDay: new Set(P[md].players.map(p => dayKey(p.ts))).size < 2 });
      onStep && onStep(`jokers: jornada ${md}`);
    }
    const bestL = rows.reduce((a, r) => (!a || r.limGain > a.limGain ? r : a), null);
    const bestW = rows.reduce((a, r) => (!a || r.wcGain > a.wcGain ? r : a), null);
    return { rows, bestL, bestW };
  }

  return { project, projectMd, bestXI, plan, evalLineup, prep, realize, transfers, transfersPlan, improveSquad, explainChanges, seasonPlan, buildSquad, games, cetMs, basePts, STATUS, NEED, FORMATIONS, GOAL, norm,
    setFormW: w => { FORM_W = w; }, setXW: (g, a) => { XW = { g, a }; } };
})();
if (typeof module !== 'undefined') module.exports = UCLModel;

/*
 * Modelo de pontos esperados da Liga Record.
 * Usa os dados do coletor do Sofascore (ver collector/) e, se existirem, as pontuações oficiais
 * da Liga Record (data/pontuacoes.json) para calibrar a nota dos jornalistas e as posições.
 */
const LRModel = (() => {
  const POS_GOAL = { G: 20, D: 4, M: 3, F: 2 };
  const FORMATIONS = ['3-4-3', '3-5-2', '4-3-3', '4-4-2', '4-5-1', '5-3-2', '5-4-1'];
  const VALID_GRADE = new Set([0, 1, 2, 3, 4, 7]);
  // Ronda 1 da Liga Record = 6.ª jornada da Liga.
  const ROUND_OFFSET = 5;
  // Pesos escolhidos no backtest das jornadas 3-9 (ver CLAUDE.md): o desvio LR da equipa ajuda um pouco;
  // misturar a média LR do jogador não melhora (piora a ordenação), por isso fica a 0.
  const LR_FORM_WEIGHT = 0;
  const TEAM_LR_WEIGHT = 0.25;
  // Coeficientes da nota Record (calibrados com 2086 exibições das jornadas 2-9; a app recalibra com os PDFs).
  const DEFAULT_GRADE = { c: 1.75, m60: 0.99, m30: 0.60, rating: 0.37, goal: 0.47, assist: 0.39, win: 0.15, loss: -0.27, gk: 0.29 };
  const CLUB_KEYS = {
    'Académico Viseu': 'academico', 'Alverca': 'alverca', 'Arouca': 'arouca', 'Benfica': 'benfica', 'Casa Pia': 'casa pia',
    'E. Amadora': 'estrela', 'Estoril': 'estoril', 'Famalicão': 'famalicao', 'FC Porto': 'porto', 'Gil Vicente': 'gil vicente',
    'Marítimo': 'maritimo', 'Moreirense': 'moreirense', 'Nacional': 'nacional', 'Rio Ave': 'rio ave', 'Santa Clara': 'santa clara',
    'Sp. Braga': 'braga', 'Sporting': 'sporting cp', 'V. Guimarães': 'vitoria'
  };

  const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const pois = (l, k) => { let f = 1; for (let i = 2; i <= k; i++) f *= i; return Math.exp(-l) * Math.pow(l, k) / f; };

  function teamIdForClub(data, club) {
    const key = CLUB_KEYS[club] || norm(club);
    const hit = Object.values(data.teams).find(t => norm(t.name).includes(key));
    return hit ? hit.id : null;
  }

  // ---------- Força das equipas ----------
  function teamStrength(data) {
    const out = {};
    for (const t of Object.values(data.teams)) {
      const ev = (data.teamEvents[t.id] || []).filter(e => e.league).slice(0, 4);
      let xg = 0, xga = 0, n = 0;
      for (const e of ev) {
        const s = data.leagueStats[e.id]; if (!s || s.home.xg == null) continue;
        const me = e.home ? s.home : s.away, op = e.home ? s.away : s.home;
        xg += me.xg; xga += op.xg; n++;
      }
      const gfpg = t.gf / Math.max(1, t.played), gapg = t.ga / Math.max(1, t.played);
      out[t.id] = {
        att: n ? 0.5 * gfpg + 0.5 * xg / n : gfpg,
        def: n ? 0.5 * gapg + 0.5 * xga / n : gapg,
        form: (data.teamEvents[t.id] || []).filter(e => e.league).slice(0, 5).map(e => e.gf > e.ga ? 'V' : e.gf < e.ga ? 'D' : 'E').join(''),
        xg4: n ? xg / n : null, xga4: n ? xga / n : null
      };
    }
    const avg = Object.values(out).reduce((s, x) => s + x.att, 0) / Math.max(1, Object.keys(out).length);
    return { teams: out, avg };
  }

  function matchProbs(data, ts, teamId) {
    const n = data.next[teamId]; if (!n) return null;
    const me = ts.teams[teamId], op = ts.teams[n.oppId]; if (!me || !op) return null;
    const hf = n.home ? 1.1 : 0.9;
    const lf = me.att * op.def / ts.avg * hf, la = op.att * me.def / ts.avg * (2 - hf);
    // Poisson para margens; odds (se houver) para vitória/empate/derrota
    let pw = 0, pd = 0, pl = 0, win3 = 0, lose3 = 0;
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
      const p = pois(lf, i) * pois(la, j);
      if (i > j) pw += p; else if (i === j) pd += p; else pl += p;
      if (i - j >= 3) win3 += p; if (j - i >= 3) lose3 += p;
    }
    const o = data.odds[n.eventId];
    if (o && o.h && o.d && o.a) {
      const ih = 1 / o.h, id = 1 / o.d, ia = 1 / o.a, s = ih + id + ia;
      const h = ih / s, d = id / s, a = ia / s;
      pw = n.home ? h : a; pd = d; pl = n.home ? a : h;
    }
    return { lf, la, pw, pd, pl, cs: Math.exp(-la), fts: Math.exp(-lf), win3, lose3, oddsUsed: !!o };
  }

  // ---------- Correspondência Liga Record ↔ Sofascore ----------
  function buildNameIndex(data) {
    const byTeam = {};
    const add = (pid, name, short, teamId, pos) => {
      if (!teamId) return;
      const m = (byTeam[teamId] ||= new Map());
      if (!m.has(pid)) m.set(pid, { pid, name, short, pos });
    };
    for (const [pid, p] of Object.entries(data.positions || {})) add(+pid, p.name, p.short, p.teamId, p.pos);
    for (const p of data.players) add(p.id, p.name, null, p.teamId, (data.positions[p.id] || {}).pos);
    for (const rd of Object.values(data.rounds || {})) for (const e of rd) for (const r of e.players) add(r.pid, r.name, r.short, r.tid, r.pos);
    return byTeam;
  }

  function matchLR(data, lr) {
    // lr.players: [{r, j, n, c, p}] → mapa "nome|clube" → {pid, pts por jornada da Liga}
    // j = jornada da Liga (inclui as rondas experimentais 2-5); r = ronda oficial (null nas experimentais).
    const byTeam = buildNameIndex(data);
    const lrPlayers = {};
    for (const x of lr.players) {
      const k = x.n + '|' + x.c;
      const j = x.j ?? x.r + ROUND_OFFSET;
      const e = (lrPlayers[k] ||= { n: x.n, c: x.c, pts: {}, official: {} });
      e.pts[j] = x.p; e.official[j] = x.r != null;
    }
    // Jogo adiado: TODOS os jogadores da equipa com 0 nessa jornada → não houve jogo, retira esses zeros.
    const byClubJ = {};
    for (const x of lr.players) { const k = x.c + '|' + (x.j ?? x.r + ROUND_OFFSET); const a = (byClubJ[k] ||= { n: 0, zeros: 0 }); a.n++; if (x.p === 0) a.zeros++; }
    for (const e of Object.values(lrPlayers)) for (const j of Object.keys(e.pts)) {
      const a = byClubJ[e.c + '|' + j]; if (a && a.n >= 10 && a.zeros === a.n) { delete e.pts[j]; delete e.official[j]; }
    }
    // O mesmo jogador pode aparecer com dois clubes (transferência entre as rondas experimentais e as oficiais):
    // a correspondência é feita por clube, por isso o mesmo pid pode servir a entradas de clubes diferentes.
    const used = new Set();
    const list = Object.values(lrPlayers);
    const tryMatch = (pass) => {
      for (const l of list) {
        if (l.pid) continue;
        const tid = teamIdForClub(data, l.c); l.teamId = tid;
        const cands = [...(byTeam[tid]?.values() || [])].filter(c => !used.has(tid + ':' + c.pid));
        const ln = norm(l.n), toks = ln.split(' ');
        let best = null;
        if (pass === 1) {
          best = cands.find(c => norm(c.name) === ln) || cands.find(c => norm(c.short) === ln)
            || cands.find(c => toks.every(t => norm(c.name).split(' ').includes(t)))
            || (toks.length === 1 ? cands.find(c => norm(c.name).split(' ').includes(toks[0])) : null)
            || cands.find(c => norm(c.name).includes(ln));
        } else {
          const ts = toks.filter(t => t.length >= 3);
          const hits = cands.filter(c => { const nt = norm(c.name + ' ' + (c.short || '')).split(' ');
            return ts.some(t => nt.some(x => x === t || (t.length >= 4 && x.startsWith(t.slice(0, 4))))); });
          if (hits.length === 1) best = hits[0];
        }
        if (best) { l.pid = best.pid; l.sofaPos = best.pos; used.add(tid + ':' + best.pid); }
      }
    };
    tryMatch(1); tryMatch(2);
    return list;
  }

  // Junta as entradas do mesmo jogador (clubes diferentes) numa só, com o nome/clube da jornada mais recente.
  function mergeByPid(list) {
    const out = {};
    for (const l of list) {
      if (!l.pid) continue;
      const m = (out[l.pid] ||= { pid: l.pid, pts: {}, official: {}, lastJ: -1 });
      Object.assign(m.pts, l.pts); Object.assign(m.official, l.official);
      const lastJ = Math.max(...Object.keys(l.pts).map(Number), -1);
      // clube atual = o da jornada mais recente; curPts = só os pontos feitos nesse clube
      if (lastJ >= m.lastJ) Object.assign(m, { n: l.n, c: l.c, teamId: l.teamId, sofaPos: l.sofaPos, lastJ, curPts: l.pts });
    }
    return Object.values(out);
  }

  // ---------- Pontos de "eventos" (tudo menos a nota) ----------
  function eventPoints(m, pos, isJDS) {
    let x = 0;
    if (m.gf > m.ga) x += 1;
    const np = m.g - m.pens;
    x += np * POS_GOAL[pos] + m.pens * 2 - m.missPen * 2 - m.og * 2;
    if (m.g >= 3) x += 5;
    if (m.red === 'red') x -= 3; if (m.red === 'yellowRed') x -= 1;
    if (pos === 'G') x += m.ga === 0 ? 2 : -2 * m.ga;
    if (pos === 'D') x += m.ga === 0 ? 1 : -m.ga;
    if (pos === 'F' && m.g === 0 && m.min >= 75) x -= 1;
    if (isJDS) x += 5;
    return x;
  }

  function solveOLS(X, y) {
    const k = X[0].length;
    const A = Array.from({ length: k }, () => Array(k + 1).fill(0));
    X.forEach((r, i) => { for (let a = 0; a < k; a++) { A[a][k] += r[a] * y[i]; for (let b = 0; b < k; b++) A[a][b] += r[a] * r[b]; } });
    for (let i = 0; i < k; i++) {
      let p = i; for (let j = i + 1; j < k; j++) if (Math.abs(A[j][i]) > Math.abs(A[p][i])) p = j;
      [A[i], A[p]] = [A[p], A[i]];
      if (Math.abs(A[i][i]) < 1e-9) return null;
      for (let j = 0; j < k; j++) if (j !== i) { const f = A[j][i] / A[i][i]; for (let c = i; c <= k; c++) A[j][c] -= f * A[i][c]; }
    }
    return A.map((r, i) => r[k] / r[i]);
  }

  // ---------- Calibração com os PDFs ----------
  function calibrate(data, lr) {
    const res = { grade: { ...DEFAULT_GRADE }, lrPos: {}, lrByPid: {}, rows: [], validPct: null, dist: {}, n: 0, fitted: false };
    if (!lr || !lr.players || !lr.players.length) return res;
    const list = matchLR(data, lr);
    const jds = {};
    for (const j of (lr.jds || [])) { const m = j.txt && j.txt.match(/JOGADOR DA SEMANA (.+?) (\d+)$/); if (m) jds[j.j ?? j.r + ROUND_OFFSET] = m[1]; }
    const rowsByPid = {};
    for (const [rd, evs] of Object.entries(data.rounds || {})) for (const e of evs) for (const r of e.players) {
      const home = r.tid === e.homeId;
      rowsByPid[r.pid + '|' + rd] = { ...r, gf: home ? e.hs : e.as, ga: home ? e.as : e.hs };
    }
    const all = [];
    for (const l of mergeByPid(list)) {
      // total = só rondas oficiais (o que conta na classificação); média = todas as rondas (forma)
      const tot = Object.entries(l.pts).filter(([j]) => l.official[j]).reduce((s, [, v]) => s + v, 0);
      // forma = média no clube atual (o contexto da equipa conta); se lá tiver menos de 2 jornadas, usa tudo
      const cur = Object.values(l.curPts || {});
      const vals = cur.length >= 2 ? cur : Object.values(l.pts);
      res.lrByPid[l.pid] = { n: l.n, c: l.c, tot, avg: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0, pts: l.pts };
      const games = [];
      for (const [j, p] of Object.entries(l.pts)) {
        const m = rowsByPid[l.pid + '|' + j];
        if (m && m.min > 0) games.push({ r: +j, lp: p, m, jds: jds[j] === l.n });
      }
      if (!games.length) continue;
      const order = [l.sofaPos, 'D', 'M', 'F', 'G'].filter((v, i, a) => v && a.indexOf(v) === i);
      let best = order[0], bs = -1;
      for (const p of order) { const s = games.filter(g => VALID_GRADE.has(g.lp - eventPoints(g.m, p, g.jds))).length; if (s > bs) { bs = s; best = p; } }
      res.lrPos[l.pid] = best;
      for (const g of games) all.push({ pid: l.pid, n: l.n, pos: best, sofaPos: l.sofaPos, r: g.r, lp: g.lp, m: g.m, res: g.lp - eventPoints(g.m, best, g.jds) });
    }
    res.rows = all;
    const valid = all.filter(x => VALID_GRADE.has(x.res));
    res.n = all.length; res.validPct = all.length ? valid.length / all.length : null;
    for (const v of valid) res.dist[v.res] = (res.dist[v.res] || 0) + 1;
    const fit = valid.filter(x => x.m.r);
    if (fit.length >= 150) {
      const X = fit.map(x => [1, x.m.min >= 60 ? 1 : 0, x.m.min >= 30 && x.m.min < 60 ? 1 : 0, x.m.r - 6.8, x.m.g > 0 ? 1 : 0, x.m.a > 0 ? 1 : 0, x.m.gf > x.m.ga ? 1 : 0, x.m.gf < x.m.ga ? 1 : 0, x.pos === 'G' ? 1 : 0]);
      const b = solveOLS(X, fit.map(x => x.res));
      if (b) {
        res.grade = { c: b[0], m60: b[1], m30: b[2], rating: b[3], goal: b[4], assist: b[5], win: b[6], loss: b[7], gk: b[8] };
        const pred = X.map(r => r.reduce((s, v, i) => s + v * b[i], 0)); const y = fit.map(x => x.res);
        const my = y.reduce((s, v) => s + v, 0) / y.length;
        res.r2 = 1 - pred.reduce((s, p, i) => s + (p - y[i]) ** 2, 0) / y.reduce((s, v) => s + (v - my) ** 2, 0);
        res.fitted = true; res.nFit = fit.length;
      }
    }
    // Pontos por ronda de cada equipa (todos os jogadores)
    res.teamAvg = {};
    for (const l of list) { const tid = l.teamId; if (!tid) continue; const nr = Math.max(1, Object.keys(l.pts).length);
      res.teamAvg[tid] = (res.teamAvg[tid] || 0) + Object.values(l.pts).reduce((s, v) => s + v, 0) / nr; }
    // Desvio de cada equipa face à média, em pontos LR por exibição (ignora os −1 de não utilizados)
    const acc = {}; let gs = 0, gn = 0;
    for (const l of list) { if (!l.teamId) continue; for (const v of Object.values(l.pts)) { if (v === -1) continue;
      const a = (acc[l.teamId] ||= { s: 0, n: 0 }); a.s += v; a.n++; gs += v; gn++; } }
    res.teamLRdev = {};
    for (const [tid, a] of Object.entries(acc)) res.teamLRdev[tid] = a.s / a.n - gs / Math.max(1, gn);
    res.coaches = (lr.coaches || []);
    return res;
  }

  // ---------- Projeção por jogador ----------
  function project(data, cal, opts = {}) {
    const ts = teamStrength(data);
    const posOverride = opts.posOverride || {};
    const availOverride = opts.availOverride || {};
    const g = cal.grade;
    const out = [];
    const missingSet = {};
    for (const [t, arr] of Object.entries(data.missing || {})) for (const m of arr) missingSet[m.id] = m.reason || 'ausente';
    for (const x of data.players) {
      const t = x.teamId; const n = data.next[t]; if (!n) continue;
      const mp = matchProbs(data, ts, t); if (!mp) continue;
      const pos = posOverride[x.id] || cal.lrPos[x.id] || (data.positions[x.id] || {}).pos; if (!pos) continue;
      const team = data.teams[t];
      // minutos: últimos 3 jogos da liga da equipa
      const lgEv = (data.teamEvents[t] || []).filter(e => e.league).slice(0, 3);
      const rec = data.recent[x.id] || [];
      const lgMin = lgEv.map(e => { const q = rec.find(z => z.ts === e.ts); return q ? q.min : 0; });
      const played = lgMin.filter(m => m > 0);
      const share = lgEv.length ? played.length / lgEv.length : x.app / Math.max(1, team.played);
      // Backtest rondas 1-4: os últimos jogos pesam mais e quem não jogou o último jogo da liga perde 40%
      // (evita escolher suplentes/rodados que acabam com −1).
      let pPlay = clamp(0.85 * share + 0.15 * x.app / Math.max(1, team.played), 0, 1) * (lgEv.length && lgMin[0] === 0 ? 0.6 : 1);
      const minIfPlay = played.length ? 0.6 * played.reduce((s, v) => s + v, 0) / played.length + 0.4 * (x.app ? x.min / x.app : 0) : (x.app ? x.min / x.app : 0);
      const missing = missingSet[x.id];
      if (missing) pPlay = 0;
      if (availOverride[x.id] != null) pPlay = availOverride[x.id];
      const p60c = minIfPlay >= 80 ? 0.92 : minIfPlay >= 70 ? 0.8 : minIfPlay >= 60 ? 0.65 : minIfPlay >= 45 ? 0.4 : 0.12;
      const p60 = pPlay * p60c;
      const p30 = pPlay * clamp((1 - p60c) * (minIfPlay >= 30 ? 0.6 : 0.3), 0, 1);
      const expMin = pPlay * minIfPlay;
      const k = mp.lf / ts.teams[t].att;
      const mins = Math.max(1, x.min), npg = x.g - x.pen;
      const g90 = (0.6 * npg + 0.4 * Math.max(0, x.xg - 0.76 * x.pen)) / mins * 90;
      const a90 = (0.5 * x.a + 0.5 * x.xa) / mins * 90;
      const eg = g90 * expMin / 90 * k, ea = a90 * expMin / 90 * k;
      const pen = x.pen / Math.max(1, team.played) * k * pPlay * clamp(minIfPlay / 70, 0, 1);
      const Pg = 1 - Math.exp(-(eg + pen)), Pa = 1 - Math.exp(-ea);
      // forma: nota média recente (todas as competições)
      const rr = rec.filter(z => z.r).slice(0, 5).map(z => z.r);
      const rating = rr.length ? 0.5 * (x.rating || 6.8) + 0.5 * rr.reduce((s, v) => s + v, 0) / rr.length : (x.rating || 6.8);
      const grade = pPlay * (g.c + (pos === 'G' ? g.gk : 0) + g.rating * (rating - 6.8) + g.win * mp.pw + g.loss * mp.pl) + p60 * g.m60 + p30 * g.m30 + g.goal * Pg + g.assist * Pa;
      let defPts = 0;
      if (pos === 'G') defPts = pPlay * (2 * mp.cs - 2 * mp.la);
      if (pos === 'D') defPts = pPlay * (mp.cs - mp.la);
      const p75 = pPlay * (minIfPlay >= 80 ? 0.85 : minIfPlay >= 70 ? 0.5 : 0.15);
      const fwd = pos === 'F' ? -Math.exp(-(eg + pen) / Math.max(pPlay, 0.01)) * p75 : 0;
      const red = -x.rc / Math.max(1, team.played) * 3 * pPlay;
      const notUsed = -(1 - pPlay);
      const ptsModel = grade + eg * POS_GOAL[pos] + pen * 2 + mp.pw * pPlay + defPts + fwd + red + notUsed;
      const lrInfo = cal.lrByPid[x.id];
      // Ajustes validados no backtest (rondas 1-4: +5 pontos/ronda no onze escolhido):
      // equipas que rendem acima/abaixo da média na Liga Record + 30% da média real de pontos LR do jogador.
      const teamAdj = TEAM_LR_WEIGHT * (cal.teamLRdev?.[t] ?? 0) * pPlay;
      const pts = lrInfo && availOverride[x.id] == null && !missing
        ? (1 - LR_FORM_WEIGHT) * (ptsModel + teamAdj) + LR_FORM_WEIGHT * lrInfo.avg
        : ptsModel + teamAdj;
      out.push({ id: x.id, name: x.name, teamId: t, team: team.short || team.name, pos, sofaPos: (data.positions[x.id] || {}).pos,
        opp: (n.home ? 'vs ' : '@ ') + (data.teams[n.oppId]?.short || data.teams[n.oppId]?.name || '?'), home: n.home, ts: n.ts,
        pts, ptsModel, pPlay, expMin, minIfPlay, lgMin, Pg, Pa, pw: mp.pw, cs: mp.cs, la: mp.la, rating, missing,
        lrTot: lrInfo ? lrInfo.tot : null, lrAvg: lrInfo ? lrInfo.avg : null, lrName: lrInfo ? lrInfo.n : null,
        season: { app: x.app, min: x.min, g: x.g, a: x.a, xg: x.xg, xa: x.xa, yc: x.yc, rc: x.rc, rating: x.rating } });
    }
    return { players: out, ts };
  }

  // ---------- Treinadores ----------
  // Regulamento 14: nota dos jornalistas (como os jogadores) + vitória +1 / derrota −1 + não marcar −1 + não sofrer +1
  // + ganhar/perder por mais de 2 ±1 + 1 por golo de suplente (+ recuperações, −3 expulsão).
  // Nota média observada por resultado (135 casos, jornadas 2-9, reviravolta = +1 vitória + 2×N):
  // vitória 3,78 · empate 2,85 · derrota 2,29.
  const COACH_GRADE = { win: 3.78, draw: 2.85, loss: 2.29 };
  const SUB_GOAL_SHARE = 0.2; // ~20% dos golos são de suplentes (estimativa)
  function coaches(data) {
    const ts = teamStrength(data);
    return Object.values(data.teams).map(t => {
      const mp = matchProbs(data, ts, t.id); if (!mp) return null;
      const grade = mp.pw * COACH_GRADE.win + mp.pd * COACH_GRADE.draw + mp.pl * COACH_GRADE.loss;
      const events = mp.pw - mp.pl + mp.cs - mp.fts + mp.win3 - mp.lose3 + SUB_GOAL_SHARE * mp.lf;
      const n = data.next[t.id];
      return { teamId: t.id, team: t.short || t.name, opp: (n.home ? 'vs ' : '@ ') + (data.teams[n.oppId]?.short || '?'),
        pts: grade + events, grade, events, pw: mp.pw, cs: mp.cs };
    }).filter(Boolean).sort((a, b) => b.pts - a.pts);
  }

  // ---------- Onze ideal ----------
  function bestXI(squadPlayers) {
    const by = { G: [], D: [], M: [], F: [] };
    for (const p of squadPlayers) by[p.pos]?.push(p);
    for (const k in by) by[k].sort((a, b) => b.pts - a.pts);
    let best = null;
    for (const f of FORMATIONS) {
      const [d, m, fw] = f.split('-').map(Number);
      if (by.G.length < 1 || by.D.length < d || by.M.length < m || by.F.length < fw) continue;
      const xi = [by.G[0], ...by.D.slice(0, d), ...by.M.slice(0, m), ...by.F.slice(0, fw)];
      const cap = xi.reduce((a, b) => (b.pts > a.pts ? b : a));
      const total = xi.reduce((s, p) => s + p.pts, 0) + cap.pts;
      if (!best || total > best.total) best = { formation: f, xi, captain: cap, total };
    }
    if (!best) return null;
    // Banco: 4 suplentes, só 3 entram, só substituem a mesma posição, pela ordem do banco.
    const inXI = new Set(best.xi.map(p => p.id));
    const rest = squadPlayers.filter(p => !inXI.has(p.id)).sort((a, b) => b.pts - a.pts);
    const risk = pos => best.xi.filter(p => p.pos === pos).reduce((s, p) => s + (1 - p.pPlay), 0);
    const bench = [];
    for (const pos of ['D', 'M', 'F']) { const c = rest.find(p => p.pos === pos && !bench.includes(p)); if (c) bench.push(c); }
    const gk = rest.find(p => p.pos === 'G');
    const extra = rest.filter(p => !bench.includes(p) && p.pos !== 'G');
    if (gk && risk('G') > 0.25) bench.push(gk); else if (extra[0]) bench.push(extra[0]); else if (gk) bench.push(gk);
    bench.sort((a, b) => risk(b.pos) - risk(a.pos) || b.pts - a.pts);
    best.bench = bench.slice(0, 4);
    return best;
  }

  // ---------- Transferências ----------
  function transfers(allPlayers, squadIds, prices, saldo, limitPerPos = 40) {
    const byId = Object.fromEntries(allPlayers.map(p => [p.id, p]));
    const squad = squadIds.map(id => byId[id]).filter(Boolean);
    const base = bestXI(squad); if (!base) return [];
    const inSquad = new Set(squadIds);
    const cands = {};
    for (const pos of ['G', 'D', 'M', 'F']) cands[pos] = allPlayers.filter(p => p.pos === pos && !inSquad.has(p.id)).sort((a, b) => b.pts - a.pts).slice(0, limitPerPos);
    const out = [];
    for (const o of squad) {
      const sell = prices[o.id] ?? null;
      for (const c of cands[o.pos]) {
        const buy = prices[c.id] ?? null;
        const affordable = sell != null && buy != null ? buy <= sell + saldo + 1e-9 : null;
        const xi = bestXI(squad.map(p => (p.id === o.id ? c : p)));
        if (!xi) continue;
        out.push({ out: o, in: c, gain: xi.total - base.total, sell, buy, affordable, newSaldo: sell != null && buy != null ? saldo + sell - buy : null, lrAvgDiff: (c.lrAvg ?? 0) - (o.lrAvg ?? 0) });
      }
    }
    // empate no ganho (ex.: sai um suplente): prefere vender quem rende menos
    return out.sort((a, b) => b.gain - a.gain || a.out.pts - b.out.pts);
  }

  return { project, calibrate, coaches, bestXI, transfers, teamStrength, matchProbs, norm, teamIdForClub, FORMATIONS, DEFAULT_GRADE, ROUND_OFFSET };
})();
if (typeof module !== 'undefined') module.exports = LRModel;

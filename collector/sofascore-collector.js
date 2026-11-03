/*
 * Coletor de dados do Sofascore para a app "Liga Record – Previsões".
 *
 * Como usar (o mais simples): na app, botão "Atualizar Sofascore" → abre o sofascore.com → clica no
 * marcador "Liga Record ⚽" da barra de favoritos. Os dados voltam sozinhos para a app.
 * Alternativa: F12 → Consola em sofascore.com → colar este ficheiro → Enter (descarrega um .json).
 *
 * Os pedidos são feitos um a um, com uma pequena pausa, a partir da tua sessão normal do browser.
 * A app (index.html) também carrega este ficheiro, só para gerar o marcador: fora do sofascore.com não corre.
 */
async function ligaRecordCollector() {
  if (window.__ligaRecordRunning) return;
  window.__ligaRecordRunning = true;
  // Caixa de progresso visível na página (quem usa o marcador não vê a consola)
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:360px;padding:14px 16px;border-radius:10px;background:#c8102e;color:#fff;font:14px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.3)';
  box.textContent = 'Liga Record: a recolher dados…';
  document.body.appendChild(box);
  const PAUSE_MS = 120;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let calls = 0;
  // Envia para a app que abriu este separador; sem app ligada, descarrega o ficheiro.
  const deliver = (type, data, file) => {
    window.__ligaRecordRunning = false;
    try { if (window.opener && !window.opener.closed) { window.opener.postMessage({ type, data }, '*'); box.textContent = 'Concluído: dados enviados para a app. Podes fechar este separador.'; box.style.background = '#1a7f37'; return data; } } catch (e) { /* sem app */ }
    if (!window.__LR_NO_DOWNLOAD) {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
      a.download = `${file}-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove();
    }
    box.textContent = 'Concluído: ficheiro descarregado. Carrega-o na app.'; box.style.background = '#1a7f37';
    return data;
  };

  // ---------- UEFA Champions League Fantasy (gaming.uefa.com): jogadores, preços, estatísticas e pontos por jornada ----------
  if (/(^|\.)uefa\.com$/.test(location.hostname)) {
    box.style.background = '#0b1f6b';
    const feedNo = (performance.getEntriesByType('resource').map(e => e.name.match(/players_(\d+)_en/)).find(Boolean) || [])[1] || '90';
    const feed = async p => { await sleep(PAUSE_MS); calls++; try { const r = await fetch('/en/uclfantasy/services/feeds/' + p); return r.ok ? r.json() : null; } catch (e) { return null; } };
    const say = t => { box.textContent = 'Champions: ' + t + ' (' + calls + ' pedidos)'; };
    say('a ler jornadas…');
    const fx = (await feed(`fixtures/fixtures_${feedNo}_en.json`))?.data?.value || [];
    const cur = fx.find(m => m.mdIsCurrent === 1) || fx.find(m => !m.mdIsLocked) || fx[fx.length - 1];
    const md = cur.mdId;
    const fixtures = fx.map(m => ({ md: m.mdId, deadline: m.deadline, locked: m.mdIsLocked, matches: (m.match || []).map(x => ({ id: x.mId, dt: x.dateTime,
      home: { id: x.htId, name: x.htName, code: x.htCCode }, away: { id: x.atId, name: x.atName, code: x.atCCode },
      hs: x.htScore === '' ? null : +x.htScore, as: x.atScore === '' ? null : +x.atScore, status: x.matchStatus })) }));
    const list = (await feed(`players/players_${feedNo}_en_${md}.json`))?.data?.value?.playerList || [];
    const players = list.map(p => ({ id: +p.id, name: p.pFName || p.pDName, short: p.pDName, tId: +p.tId, team: p.tName, code: p.cCode, pos: 'GDMF'[p.skill - 1],
      price: p.value, status: p.pStatus || '', trained: p.trained || '', active: p.isActive, sel: p.selPer, tot: p.totPts, min: p.minsPlyd }));
    // jogo a jogo, só para quem já jogou (o resto não tem histórico)
    const hist = {}; const withMin = list.filter(p => p.minsPlyd > 0);
    for (let i = 0; i < withMin.length; i++) {
      if (i % 25 === 0) say(`jogadores ${i}/${withMin.length}…`);
      const v = (await feed(`popupstats/popupstats_${feedNo}_${withMin[i].id}.json`))?.data?.value;
      if (!v) continue;
      const pts = Object.fromEntries((v.points || []).map(x => [x.mdId, x.tPoints]));
      hist[withMin[i].id] = (v.stats || []).filter(s => s.mdId < md).map(s => ({ md: s.mdId, min: s.oF, g: s.gS, a: s.gA, cs: s.cS, gc: s.gC, y: s.yC, r: s.rC,
        og: s.oG, br: s.bR, sv: s.saves, gob: s.gOB, pe: s.pE, pc: s.pC, pm: s.pM, ps: s.pS, mom: s.mOM, pts: pts[s.mdId] ?? null }));
    }
    const data = { meta: { created: new Date().toISOString(), md, deadline: cur.deadline, feedNo, calls }, fixtures, players, hist };
    window.__uclData = data;
    return deliver('ucl-data', data, 'uefa-fantasy');
  }

  const TOURNAMENT = 238; // Liga Portugal Betclic
  const api = async path => {
    await sleep(PAUSE_MS);
    calls++;
    try {
      const r = await fetch('/api/v1/' + path);
      return r.ok ? r.json() : null;
    } catch (e) { return null; }
  };
  const log = (...a) => { console.log('%c[Liga Record]', 'color:#c00;font-weight:bold', ...a); box.textContent = 'Liga Record: ' + a.join(' ') + ' (' + calls + ' pedidos)'; };
  log('A recolher dados (2-4 min). Erros "404 (Not Found)" em /lineups são normais: são jogos de taça contra equipas sem fichas de jogo no Sofascore. O coletor ignora-os e continua.');

  // 1. Época atual
  const seasons = await api(`unique-tournament/${TOURNAMENT}/seasons`);
  const season = seasons.seasons[0];
  log('Época', season.name, season.id);

  // 2. Classificação (golos marcados/sofridos)
  const st = await api(`unique-tournament/${TOURNAMENT}/season/${season.id}/standings/total`);
  const teams = {};
  for (const row of st.standings[0].rows) {
    teams[row.team.id] = { id: row.team.id, name: row.team.name, short: row.team.shortName || row.team.name,
      played: row.matches, w: row.wins, d: row.draws, l: row.losses, gf: row.scoresFor, ga: row.scoresAgainst, pts: row.points };
  }
  const teamIds = Object.keys(teams).map(Number);
  log('Equipas', teamIds.length);

  // 3. Estatísticas de época de todos os jogadores
  const fields = 'goals,assists,minutesPlayed,appearances,matchesStarted,rating,expectedGoals,expectedAssists,yellowCards,redCards,totalShots,shotsOnTarget,keyPasses,bigChancesCreated,penaltyGoals,cleanSheet,goalsConceded,saves';
  const players = [];
  for (let off = 0; off < 2000; off += 100) {
    const j = await api(`unique-tournament/${TOURNAMENT}/season/${season.id}/statistics?limit=100&offset=${off}&order=-minutesPlayed&accumulation=total&fields=${fields}`);
    if (!j || !j.results || !j.results.length) break;
    for (const x of j.results) {
      players.push({ id: x.player.id, name: x.player.name, teamId: x.team.id,
        app: x.appearances || 0, starts: x.matchesStarted || 0, min: x.minutesPlayed || 0, g: x.goals || 0, a: x.assists || 0,
        xg: x.expectedGoals || 0, xa: x.expectedAssists || 0, pen: x.penaltyGoals || 0, rating: x.rating || null,
        yc: x.yellowCards || 0, rc: x.redCards || 0, shots: x.totalShots || 0, kp: x.keyPasses || 0, bcc: x.bigChancesCreated || 0,
        saves: x.saves || 0 });
    }
  }
  log('Jogadores', players.length);

  // 4. Posições (plantel de cada equipa)
  const positions = {};
  for (const t of teamIds) {
    const p = await api(`team/${t}/players`);
    for (const x of (p?.players || [])) positions[x.player.id] = { pos: x.player.position, name: x.player.name, short: x.player.shortName, teamId: t };
  }

  // 5. Últimos jogos de cada equipa (todas as competições) + fichas de jogo
  const eventCache = {};
  const lineupOf = async id => (eventCache[id] ||= await api(`event/${id}/lineups`));
  const teamEvents = {};
  const recent = {}; // playerId -> [{ts, comp, league, min, r, g, a, sub}]
  const leagueStats = {}; // eventId -> {home:{xg,pos,shots}, away:{...}}
  for (const t of teamIds) {
    const ev = await api(`team/${t}/events/last/0`);
    const fin = (ev?.events || []).filter(e => e.status?.type === 'finished').sort((a, b) => b.startTimestamp - a.startTimestamp);
    teamEvents[t] = [];
    // 8 jogos para garantir pelo menos 3-4 da liga mesmo com jogos europeus/taças pelo meio
    for (const e of fin.slice(0, 8)) {
      const home = e.homeTeam.id === t; const side = home ? 'home' : 'away';
      const league = e.tournament.uniqueTournament?.id === TOURNAMENT;
      const comp = e.tournament.uniqueTournament?.name || e.tournament.name;
      teamEvents[t].push({ id: e.id, ts: e.startTimestamp, comp, league, home, oppId: (home ? e.awayTeam : e.homeTeam).id,
        opp: (home ? e.awayTeam : e.homeTeam).name, gf: home ? e.homeScore.current : e.awayScore.current, ga: home ? e.awayScore.current : e.homeScore.current, round: e.roundInfo?.round || null });
      const l = await lineupOf(e.id);
      for (const p of (l?.[side]?.players || [])) {
        const s = p.statistics || {};
        (recent[p.player.id] ||= []).push({ ts: e.startTimestamp, league, comp, min: s.minutesPlayed || 0, r: s.rating || null, g: s.goals || 0, a: s.goalAssist || 0, sub: !!p.substitute });
      }
      for (const m of (l?.[side]?.missingPlayers || [])) {
        (recent[m.player.id] ||= []).push({ ts: e.startTimestamp, league, comp, min: 0, r: null, g: 0, a: 0, missing: m.reason ?? m.type });
      }
      if (league && !leagueStats[e.id]) {
        const s = await api(`event/${e.id}/statistics`);
        const all = s?.statistics?.find(p => p.period === 'ALL');
        const items = all ? all.groups.flatMap(g => g.statisticsItems) : [];
        const it = k => items.find(i => i.key === k);
        const v = (k, side) => { const x = it(k); return x ? +(side === 'home' ? x.homeValue : x.awayValue) : null; };
        leagueStats[e.id] = { home: { xg: v('expectedGoals', 'home'), poss: v('ballPossession', 'home'), shots: v('totalShotsOnGoal', 'home') },
          away: { xg: v('expectedGoals', 'away'), poss: v('ballPossession', 'away'), shots: v('totalShotsOnGoal', 'away') } };
      }
    }
  }
  log('Jogos recentes processados', Object.keys(eventCache).length);

  // 6. Próximo jogo da liga, odds e ausências
  const next = {}; const odds = {}; const missing = {};
  for (const t of teamIds) {
    const n = await api(`team/${t}/events/next/0`);
    const e = (n?.events || []).find(e => e.tournament.uniqueTournament?.id === TOURNAMENT);
    if (!e) continue;
    const home = e.homeTeam.id === t;
    next[t] = { eventId: e.id, ts: e.startTimestamp, home, oppId: (home ? e.awayTeam : e.homeTeam).id, round: e.roundInfo?.round || null };
    const l = await api(`event/${e.id}/lineups`);
    missing[t] = (l?.[home ? 'home' : 'away']?.missingPlayers || []).map(m => ({ id: m.player.id, name: m.player.name, reason: m.description || m.reason || m.type }));
    if (!odds[e.id]) {
      const o = await api(`event/${e.id}/odds/1/all`);
      const m = o?.markets?.find(m => m.marketName === 'Full time');
      if (m) {
        const dec = s => { const [a, b] = s.split('/').map(Number); return 1 + a / b; };
        const c = Object.fromEntries(m.choices.map(c => [c.name, dec(c.fractionalValue)]));
        odds[e.id] = { h: c['1'], d: c['X'], a: c['2'] };
      }
    }
  }

  // 7. Jornadas já jogadas (para calibrar com os PDFs da Liga Record)
  const currentRound = Math.max(...Object.values(next).map(n => n.round || 0));
  const rounds = {};
  for (let rd = 1; rd < currentRound; rd++) {
    const ev = await api(`unique-tournament/${TOURNAMENT}/season/${season.id}/events/round/${rd}`);
    rounds[rd] = [];
    for (const e of (ev?.events || [])) {
      if (e.status?.type !== 'finished') continue;
      const l = await lineupOf(e.id);
      const inc = (await api(`event/${e.id}/incidents`))?.incidents || [];
      const rows = [];
      for (const side of ['home', 'away']) {
        const tid = side === 'home' ? e.homeTeam.id : e.awayTeam.id;
        for (const p of (l?.[side]?.players || [])) {
          const s = p.statistics || {}; const pid = p.player.id;
          const mine = i => i.player?.id === pid;
          rows.push({ pid, tid, name: p.player.name, short: p.player.shortName, pos: p.player.position || p.position,
            min: s.minutesPlayed || 0, r: s.rating || null, g: s.goals || 0, a: s.goalAssist || 0,
            pens: inc.filter(i => i.incidentType === 'goal' && i.incidentClass === 'penalty' && mine(i)).length,
            og: inc.filter(i => i.incidentType === 'goal' && i.incidentClass === 'ownGoal' && mine(i)).length,
            red: (inc.find(i => i.incidentType === 'card' && mine(i) && (i.incidentClass === 'red' || i.incidentClass === 'yellowRed')) || {}).incidentClass || null,
            missPen: inc.filter(i => i.incidentType === 'inGamePenalty' && mine(i) && i.description !== 'Scored').length });
        }
      }
      rounds[rd].push({ eventId: e.id, homeId: e.homeTeam.id, awayId: e.awayTeam.id, hs: e.homeScore.current, as: e.awayScore.current, players: rows });
    }
    log('Jornada', rd, 'ok');
  }

  // 8. Champions: odds da próxima jornada (para o modo UEFA Champions League Fantasy)
  const ucl = await uclOdds(api);
  log('Champions: odds de', ucl.events.length, 'jogos');

  const data = { meta: { created: new Date().toISOString(), seasonId: season.id, seasonName: season.name, nextRound: currentRound, calls },
    teams, players, positions, teamEvents, leagueStats, recent, next, odds, missing, rounds, ucl };
  window.__ligaRecordData = data;
  return deliver('liga-record-data', data, 'sofascore');

  async function uclOdds(api) {
    const out = { created: new Date().toISOString(), events: [] };
    try {
      const s = (await api('unique-tournament/7/seasons'))?.seasons?.[0];
      const nx = s && await api(`unique-tournament/7/season/${s.id}/events/next/0`);
      const r0 = nx?.events?.[0]?.roundInfo?.round;
      const dec = f => { const [a, b] = f.split('/').map(Number); return 1 + a / b; };
      for (const e of (nx?.events || []).filter(e => e.roundInfo?.round === r0)) {
        const o = await api(`event/${e.id}/odds/1/all`);
        const ft = o?.markets?.find(m => m.marketName === 'Full time');
        const goals = o?.markets?.find(m => m.marketName === 'Match goals' && +m.choiceGroup === 2.5);
        const c = ft ? Object.fromEntries(ft.choices.map(c => [c.name, dec(c.fractionalValue)])) : {};
        const g = goals ? Object.fromEntries(goals.choices.map(c => [c.name, dec(c.fractionalValue)])) : {};
        const t = x => ({ name: x.name, short: x.shortName, code: x.nameCode });
        out.events.push({ id: e.id, ts: e.startTimestamp, round: r0, home: t(e.homeTeam), away: t(e.awayTeam),
          odds: ft ? { h: c['1'], d: c['X'], a: c['2'] } : null, over25: g.Over || null, under25: g.Under || null });
      }
    } catch (e) { /* sem Champions: o modo Liga Record funciona na mesma */ }
    return out;
  }
}

// Corre sozinho só no sofascore.com ou no site da UEFA Fantasy (consola ou marcador); na app serve só para gerar o marcador.
if (typeof location !== 'undefined' && /(^|\.)(sofascore|uefa)\.com$/.test(location.hostname)) ligaRecordCollector();

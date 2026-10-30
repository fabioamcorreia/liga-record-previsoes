/* Interface da app "Liga Record – Previsões". */
(() => {
  const $ = s => document.querySelector(s);
  const fmt = (x, d = 1) => (x == null || Number.isNaN(x) ? '–' : (+x).toFixed(d).replace('.', ','));
  const pct = x => (x == null ? '–' : Math.round(x * 100) + '%');
  const eur = x => (x == null || x === '' ? '' : (+x).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' M€');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const posTag = p => `<span class="pos ${p}">${{ G: 'GR', D: 'DEF', M: 'MED', F: 'AV' }[p] || p}</span>`;
  const NEED = { G: 3, D: 8, M: 8, F: 4 };

  // Plantel inicial (MAN. CITY DA TEMU, 30-out-2026). Preços = valor atual (M€).
  const SEED = [
    ['Diogo Costa', 'Porto', 5.6], ['Lucão', 'Gil Vicente', 0.6], ['Lucas França', 'Santa Clara', 0.55],
    ['Jan Bednarek', 'Porto', 4.7], ['Jonathan Buatu', 'Gil Vicente', 0.75], ['Finn van Breemen', 'Famalicão', 0.5],
    ['Francisco Moura', 'Porto', 1.4], ['Javi Sánchez', 'Arouca', 0.6], ['Jose Fontán', 'Arouca', 0.9],
    ['Gustaf Lagerbielke', 'Braga', 1.35], ['Paulo Henrique', 'Marítimo', 0.5],
    ['Sergi Altimira', 'Sporting', 3.05], ['Taichi Fukui', 'Arouca', 0.9], ['Gabri Veiga', 'Porto', 5.15],
    ['Gil Martins', 'Gil Vicente', 0.5], ['Miguel Nogueira', 'Vitória', 0.5], ['Raphael Guzzo', 'Marítimo', 0.75],
    ['Samu', 'Vitória', 1.05], ['Cihan Kahraman', 'Académico', 0.75],
    ['Ivan Barbero', 'Arouca', 0.9], ['Flávio Gonçalves', 'Sporting', 0.65], ['Gonçalo Paciência', 'Santa Clara', 1.0],
    ['Vangelis Pavlidis', 'Benfica', 6.25]
  ];
  const SEED_SALDO = 2.5;
  // Posições confirmadas na Liga Record que o Sofascore/inferência podem trocar
  const SEED_POS = { 'Gianluca Prestianni': 'F', 'Flávio Gonçalves': 'F', 'Miguel Nogueira': 'M', 'João Guilherme': 'F', 'Óscar Aranda': 'F' };
  const SEED_PRICES = [['Gianluca Prestianni', 'Benfica', 3.3], ['Alberto Costa', 'Porto', 3.0]];

  // ---------- armazenamento ----------
  const idb = (() => {
    const open = () => new Promise((res, rej) => { const r = indexedDB.open('liga-record', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('kv', mode); const st = t.objectStore('kv'); const r = fn(st); t.oncomplete = () => res(r?.result); t.onerror = () => rej(t.error); }); };
    return { get: k => tx('readonly', s => s.get(k)).catch(() => null), set: (k, v) => tx('readwrite', s => s.put(v, k)).catch(() => null) };
  })();
  const ls = {
    get(k, d) { try { const v = localStorage.getItem('lr.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('lr.' + k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } }
  };

  const S = {
    data: null, lr: null, cal: null, proj: null, byId: {},
    squad: ls.get('squad', null), seedPending: ls.get('squad', null) == null,
    prices: ls.get('prices', {}), saldo: ls.get('saldo', SEED_SALDO),
    posOverride: ls.get('posOverride', {}), availOverride: ls.get('availOverride', {}),
    rank: { pos: 'all', team: 'all', q: '', sort: 'pts', dir: -1 }, onlyAffordable: false,
    // onze personalizado: null = usar o melhor onze calculado
    lineup: ls.get('lineup', null), allCols: ls.get('allCols', false)
  };
  const save = () => { ls.set('squad', S.squad); ls.set('prices', S.prices); ls.set('saldo', S.saldo); ls.set('posOverride', S.posOverride); ls.set('availOverride', S.availOverride); ls.set('lineup', S.lineup); };

  function findPlayer(name, teamHint) {
    const n = LRModel.norm(name), th = LRModel.norm(teamHint || '');
    // "Sporting" tem de dar Sporting CP e não Sporting Braga: primeiro nome curto exato, depois parcial
    const teams = Object.values(S.data.teams);
    const team = teams.find(t => LRModel.norm(t.short) === th) || teams.find(t => LRModel.norm(t.name) === th)
      || teams.find(t => LRModel.norm(t.short).includes(th)) || teams.find(t => LRModel.norm(t.name).includes(th));
    const pool = S.data.players.filter(p => !team || p.teamId === team.id);
    return pool.find(p => LRModel.norm(p.name) === n) || pool.find(p => LRModel.norm(p.name).includes(n)) || null;
  }

  function applySeed() {
    if (!S.data) return;
    if (S.seedPending) {
      S.squad = []; S.prices = S.prices || {};
      for (const [n, t, price] of SEED) { const p = findPlayer(n, t); if (p) { S.squad.push(p.id); S.prices[p.id] = price; } }
      for (const [n, t, price] of SEED_PRICES) { const p = findPlayer(n, t); if (p) S.prices[p.id] = price; }
      S.seedPending = false;
    }
    for (const [n, pos] of Object.entries(SEED_POS)) { const p = S.data.players.find(x => x.name === n); if (p && !S.posOverride[p.id]) S.posOverride[p.id] = pos; }
    save();
  }

  function recompute() {
    if (!S.data) return;
    applySeed();
    S.cal = LRModel.calibrate(S.data, S.lr);
    S.proj = LRModel.project(S.data, S.cal, { posOverride: S.posOverride, availOverride: S.availOverride });
    S.byId = Object.fromEntries(S.proj.players.map(p => [p.id, p]));
    renderHeader();
    renderAll();
  }

  // ---------- topo: estado dos dados e fecho da jornada ----------
  const ago = d => { const h = (Date.now() - new Date(d)) / 36e5; return h < 1 ? 'há minutos' : h < 24 ? `há ${Math.round(h)} h` : `há ${Math.round(h / 24)} dia${h >= 36 ? 's' : ''}`; };
  function renderHeader() {
    if (S.data) {
      const m = S.data.meta, h = (Date.now() - new Date(m.created)) / 36e5;
      $('#dotSofa').className = 'dot ' + (h < 48 ? 'ok' : 'old');
      $('#subSofa').textContent = `jornada ${m.nextRound} · ${ago(m.created)}`;
    }
    if (S.lr && S.lr.jds?.length) {
      const last = S.lr.jds.reduce((a, b) => (b.j > a.j ? b : a));
      $('#dotLR').className = 'dot ' + (S.data && last.j < S.data.meta.nextRound - 1 ? 'old' : 'ok');
      $('#subLR').textContent = `até à jornada ${last.j}` + (last.r ? ` (ronda ${last.r})` : '');
    }
    tickDeadline();
  }
  function tickDeadline() {
    const el = $('#deadline'); if (!S.data) { el.hidden = true; return; }
    const first = Math.min(...Object.values(S.data.next).map(n => n.ts)); const close = (first - 15 * 60) * 1000; const ms = close - Date.now();
    el.hidden = false;
    if (ms <= 0) { el.textContent = 'Jornada a decorrer · atualiza os dados'; el.className = 'deadline far'; return; }
    const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), mi = Math.floor(ms % 36e5 / 6e4);
    el.textContent = `Fecha em ${d ? d + 'd ' : ''}${h}h ${String(mi).padStart(2, '0')}m · ${new Date(close).toLocaleString('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
    el.className = 'deadline' + (ms > 2 * 864e5 ? ' far' : '');
  }
  setInterval(tickDeadline, 30000);

  // ---------- render ----------
  function squadPlayers() { return (S.squad || []).map(id => S.byId[id]).filter(Boolean); }

  // ---------- onze (ideal ou personalizado) ----------
  const FORMATION_COUNTS = f => { const [d, m, fw] = f.split('-').map(Number); return { G: 1, D: d, M: m, F: fw }; };

  // Preenche um onze para a tática dada, mantendo os jogadores escolhidos e completando com os melhores disponíveis.
  function fillLineup(formation, keepIds, sq) {
    const need = FORMATION_COUNTS(formation);
    const byPos = { G: [], D: [], M: [], F: [] };
    sq.slice().sort((a, b) => b.pts - a.pts).forEach(p => byPos[p.pos]?.push(p));
    const xi = [];
    for (const pos of ['G', 'D', 'M', 'F']) {
      const kept = keepIds.map(id => S.byId[id]).filter(p => p && p.pos === pos).slice(0, need[pos]);
      const rest = byPos[pos].filter(p => !kept.includes(p)).slice(0, need[pos] - kept.length);
      xi.push(...kept, ...rest);
    }
    return xi.map(p => p.id);
  }

  function lineupFromBest(best, coachList) {
    return { formation: best.formation, xi: best.xi.map(p => p.id), captain: best.captain.id, bench: best.bench.map(p => p.id), coach: coachList[0]?.teamId };
  }

  // Garante que o onze guardado continua válido (jogadores ainda no plantel, contagens certas, sem repetidos).
  function sanitizeLineup(L, sq, coachList) {
    const inSq = new Set(sq.map(p => p.id));
    const formation = LRModel.FORMATIONS.includes(L.formation) ? L.formation : '3-4-3';
    let xi = [...new Set((L.xi || []).filter(id => inSq.has(id)))];
    const need = FORMATION_COUNTS(formation);
    const ok = ['G', 'D', 'M', 'F'].every(pos => xi.filter(id => S.byId[id].pos === pos).length === need[pos]);
    if (!ok) xi = fillLineup(formation, xi, sq);
    const inXI = new Set(xi);
    const bench = [...new Set((L.bench || []).filter(id => inSq.has(id) && !inXI.has(id)))].slice(0, 4);
    const captain = inXI.has(L.captain) ? L.captain : xi.reduce((a, b) => (S.byId[b].pts > S.byId[a].pts ? b : a));
    const coach = coachList.some(c => c.teamId === L.coach) ? L.coach : coachList[0]?.teamId;
    return { formation, xi, captain, bench, coach };
  }

  function lineupTotal(L, coachList) {
    const xi = L.xi.reduce((s, id) => s + S.byId[id].pts, 0) + (S.byId[L.captain]?.pts || 0);
    const coach = coachList.find(c => c.teamId === L.coach)?.pts || 0;
    return { xi, coach, total: xi + coach };
  }

  // Avisos sobre o banco: posições do onze com risco de não jogar e sem suplente da mesma posição.
  function benchWarnings(L) {
    const out = [];
    for (const pos of ['G', 'D', 'M', 'F']) {
      const risky = L.xi.map(id => S.byId[id]).filter(p => p.pos === pos && p.pPlay < 0.9);
      const cover = L.bench.slice(0, 4).map(id => S.byId[id]).filter(p => p && p.pos === pos);
      if (risky.length && !cover.length) out.push(`${risky.map(p => p.name).join(', ')} (${pct(Math.min(...risky.map(p => p.pPlay)))} de jogar) sem suplente ${{ G: 'GR', D: 'DEF', M: 'MED', F: 'AV' }[pos]} no banco.`);
    }
    if (L.bench.length < 4) out.push('Faltam suplentes: são obrigatórios 4 (senão a equipa fica com 0 pontos).');
    return out;
  }

  function renderOnze() {
    const el = $('#onze');
    if (!S.data) { el.innerHTML = `<div class="card empty">Carrega o ficheiro de dados do Sofascore (ver "Como usar").</div>`; return; }
    const sq = squadPlayers();
    const best = LRModel.bestXI(sq);
    if (!best) { el.innerHTML = `<div class="card empty">Plantel incompleto — confirma os jogadores no separador Plantel.</div>`; return; }
    const coach = LRModel.coaches(S.data);
    const bestL = lineupFromBest(best, coach);
    // o onze personalizado vale só para os dados (jornada) em que foi feito
    const stamp = S.data.meta.created;
    const custom = !!S.lineup && S.lineup.stamp === stamp;
    const L = custom ? sanitizeLineup(S.lineup, sq, coach) : bestL;
    if (custom) S.lineup = { ...L, stamp };
    const tot = lineupTotal(L, coach), bestTot = lineupTotal(bestL, coach);
    const diff = tot.total - bestTot.total;
    const inXI = new Set(L.xi);
    const xiP = L.xi.map(id => S.byId[id]);
    const POSN = { G: 'GR', D: 'DEF', M: 'MED', F: 'AV' };
    // nome curto para as fichas: apelido; se dois jogadores do mesmo campo têm o mesmo apelido → "D. Costa"
    const shortName = (p, list) => { const parts = p.name.split(' '), last = parts.slice(-1)[0];
      if (parts.length < 2 || last.length <= 3) return esc(p.name);
      const dup = list.filter(q => q.name.split(' ').slice(-1)[0] === last).length > 1;
      return esc(dup ? parts[0][0] + '. ' + last : last); };
    const optLabel = p => `${esc(p.name)} · ${fmt(p.pts)} pts · ${pct(p.pPlay)} joga`;
    const shirt = p => `var(--${p.pos})`;
    const riskCls = p => (p.missing || p.pPlay < 0.4 ? 'out' : p.pPlay < 0.8 ? 'risk' : '');
    // ficha de jogador no campo; o <select> invisível por cima permite trocar com um clique
    const token = p => {
      const opts = sq.filter(q => q.pos === p.pos).sort((a, b) => b.pts - a.pts)
        .map(q => `<option value="${q.id}" ${q.id === p.id ? 'selected' : ''}>${optLabel(q)}${inXI.has(q.id) && q.id !== p.id ? ' (no onze)' : ''}</option>`).join('');
      const isCap = p.id === L.captain;
      return `<div class="tok" title="${esc(p.name)} · ${esc(p.team)} ${esc(p.opp)} · ${pct(p.pPlay)} de jogar · clica para trocar">
        <div class="shirt ${riskCls(p)}" style="--c:${shirt(p)}">${POSN[p.pos]}${isCap ? '<span class="cap">C</span>' : ''}</div>
        <div class="nm">${shortName(p, xiP)}</div>
        <div class="op">${esc(p.team)} ${esc(p.opp)}</div>
        <div class="pt">${fmt(isCap ? 2 * p.pts : p.pts)}${isCap ? ' ×2' : ''}</div>
        <select class="slotSel" data-old="${p.id}" aria-label="Trocar ${esc(p.name)}">${opts}</select></div>`;
    };
    const lanes = ['F', 'M', 'D', 'G'].map(pos => xiP.filter(p => p.pos === pos));

    // ---- comparação com o melhor onze possível da liga (qualquer jogador, sem orçamento) ----
    let compareHtml = '';
    if (S.compare) {
      const pool = S.proj.players.filter(p => !p.missing);
      const lb = LRModel.bestXI(pool);
      const lbCoach = coach[0];
      const lbTot = lb.total + (lbCoach?.pts || 0);
      const mineSet = new Set(S.squad || []);
      const have = lb.xi.filter(p => mineSet.has(p.id)).length;
      const nm = p => shortName(p, lb.xi);
      const roToken = p => { const isCap = p.id === lb.captain.id, mine = mineSet.has(p.id);
        return `<div class="tok" style="cursor:default" title="${esc(p.name)} · ${esc(p.team)} ${esc(p.opp)}${mine ? ' · já está no teu plantel' : ''}">
          <div class="shirt" style="--c:var(--${p.pos})">${POSN[p.pos]}${isCap ? '<span class="cap">C</span>' : ''}${mine ? '<span class="mine" title="No teu plantel">✓</span>' : ''}</div>
          <div class="nm">${nm(p)}</div><div class="op">${esc(p.team)} ${esc(p.opp)}</div><div class="pt">${fmt(isCap ? 2 * p.pts : p.pts)}${isCap ? ' ×2' : ''}</div></div>`; };
      const lbLanes = ['F', 'M', 'D', 'G'].map(pos => lb.xi.filter(p => p.pos === pos));
      const missingP = lb.xi.filter(p => !mineSet.has(p.id)).sort((a, b) => b.pts - a.pts);
      const price = id => S.prices[id] != null ? eur(S.prices[id]) : '';
      compareHtml = `
        <div class="card" id="compareCard">
          <h2>Melhor onze possível da jornada <span class="sub">qualquer jogador da liga, sem limite de orçamento · ${lb.formation}</span></h2>
          <div class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))">
            <div class="kpi"><div class="l">Melhor onze da liga</div><div class="v">${fmt(lbTot)}</div><div class="s">onze ${fmt(lb.total)} · treinador ${esc(lbCoach?.team || '')} ${fmt(lbCoach?.pts)}</div></div>
            <div class="kpi"><div class="l">O teu onze</div><div class="v">${fmt(tot.total)}</div><div class="s">${L.formation}${custom ? ' · personalizado' : ''}</div></div>
            <div class="kpi"><div class="l">Diferença</div><div class="v bad">${fmt(tot.total - lbTot)}</div><div class="s">${pct(tot.total / lbTot)} do máximo possível</div></div>
            <div class="kpi"><div class="l">Já tens</div><div class="v">${have} de 11</div><div class="s">jogadores do melhor onze</div></div>
          </div>
          <div class="grid2">
            <div class="field"><div class="mid"></div><div class="circle"></div>
              <div class="lineup">${lbLanes.map(l => `<div class="lane">${l.map(roToken).join('')}</div>`).join('')}</div></div>
            <div>
              <h2 style="margin:0 0 8px">Os que te faltam <span class="sub">por pontos esperados</span></h2>
              ${missingP.length ? `<div class="list">${missingP.map(p => `<div class="li">${posTag(p.pos)}<div class="grow"><b>${esc(p.name)}</b><span>${esc(p.team)} ${esc(p.opp)} · ${pct(p.pPlay)} joga${price(p.id) ? ' · ' + price(p.id) : ''}</span></div><span class="pts hi">${fmt(p.pts)}</span></div>`).join('')}</div>`
                : '<p class="good">Tens todos os jogadores do melhor onze!</p>'}
              <p class="note" style="margin-top:10px">Usa o separador <b>Transferências</b> para ver quais destas trocas cabem no teu saldo (1 por jornada).</p>
            </div>
          </div>
        </div>`;
    }

    const benchOpts = cur => sq.filter(q => !inXI.has(q.id)).sort((a, b) => 'GDMF'.indexOf(a.pos) - 'GDMF'.indexOf(b.pos) || b.pts - a.pts)
      .map(q => `<option value="${q.id}" ${q.id === cur ? 'selected' : ''}>${POSN[q.pos]} · ${optLabel(q)}</option>`).join('');
    const bslot = i => { const p = S.byId[L.bench[i]];
      return `<div class="bslot" title="Suplente ${i + 1}${p ? ': ' + esc(p.name) : ''} · clica para mudar"><span class="n" style="${p ? `background:var(--${p.pos});color:#fff` : ''}">${i + 1}</span><div class="t">${p ? `<b>${esc(p.name)}</b><span>${POSN[p.pos]} · ${esc(p.team)} ${esc(p.opp)} · ${fmt(p.pts)} pts</span>` : '<b class="muted">Escolher suplente</b>'}</div>
        <select class="benchSel" data-i="${i}" aria-label="Suplente ${i + 1}"><option value="">— nenhum —</option>${benchOpts(L.bench[i])}</select></div>`; };
    const warns = benchWarnings(L);
    const alerts = sq.filter(p => p.missing || p.pPlay < 0.5);
    const cSel = coach.find(c => c.teamId === L.coach) || coach[0];
    const capP = S.byId[L.captain];
    const capOpts = xiP.slice().sort((a, b) => b.pts - a.pts);
    el.innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="l">Pontos esperados</div><div class="v">${fmt(tot.total)}</div><div class="s">onze ${fmt(tot.xi)} · treinador ${fmt(tot.coach)}</div></div>
        <div class="kpi"><div class="l">${custom ? 'Diferença para o melhor onze' : 'Tática recomendada'}</div>
          <div class="v ${custom ? (diff >= -0.05 ? 'good' : 'bad') : ''}">${custom ? (diff >= 0 ? '+' : '') + fmt(diff) : L.formation}</div>
          <div class="s">${custom ? 'melhor onze: ' + fmt(bestTot.total) : 'a que dá mais pontos esperados'}</div></div>
        <div class="kpi"><div class="l">Capitão</div><div class="v" style="font-size:19px">${esc(capP?.name || '–')}</div><div class="s">${capP ? esc(capP.team + ' ' + capP.opp) + ' · ' + fmt(2 * capP.pts) + ' pts' : ''}</div></div>
        <div class="kpi"><div class="l">Treinador</div><div class="v" style="font-size:19px">${esc(cSel?.team || '–')}</div><div class="s">${cSel ? esc(cSel.opp) + ' · ' + fmt(cSel.pts) + ' pts · ' + pct(cSel.pw) + ' vitória' : ''}</div></div>
      </div>
      <div class="grid2">
        <div class="card">
          <div class="pitch-head">
            <div class="seg" role="group" aria-label="Tática">${LRModel.FORMATIONS.map(f => `<button data-f="${f}" class="${f === L.formation ? 'on' : ''}">${f}</button>`).join('')}</div>
            <div class="row">
              ${custom ? '<button class="btn primary" id="resetXI">↺ Repor melhor onze</button>' : '<span class="note">Clica num jogador para o trocar</span>'}
              <button class="btn" id="cmpBtn" aria-pressed="${!!S.compare}">${S.compare ? '✕ Fechar comparação' : '⚖ Comparar com o melhor da liga'}</button>
            </div>
          </div>
          <div class="field"><div class="mid"></div><div class="circle"></div>
            <div class="lineup">${lanes.map(l => `<div class="lane">${l.map(token).join('')}</div>`).join('')}</div>
          </div>
          <h2 style="margin:16px 0 0">Suplentes <span class="sub">por esta ordem · só entram 3, para a mesma posição</span></h2>
          <div class="bench">${[0, 1, 2, 3].map(bslot).join('')}</div>
          ${warns.length ? `<div class="warnbox">⚠ ${warns.join('<br>⚠ ')}</div>` : ''}
        </div>
        <div>
          <div class="card"><h2>Capitão e treinador</h2>
            <div class="list">
              <label class="coach"><span class="ic">C</span><div><b>${esc(capP?.name || '')}</b><div class="note">Capitão · conta a dobrar · clica para mudar</div></div>
                <select id="capSel">${capOpts.map(p => `<option value="${p.id}" ${p.id === L.captain ? 'selected' : ''}>${optLabel(p)}</option>`).join('')}</select></label>
              <label class="coach"><span class="ic">T</span><div><b>${esc(cSel?.team || '')} <span class="muted" style="font-weight:400">${esc(cSel?.opp || '')}</span></b><div class="note">Treinador · ${fmt(cSel?.pts)} pts esperados · clica para mudar</div></div>
                <select id="coachSel">${coach.map(c => `<option value="${c.teamId}" ${c.teamId === L.coach ? 'selected' : ''}>${esc(c.team)} ${esc(c.opp)} · ${fmt(c.pts)} pts · ${pct(c.pw)} vitória</option>`).join('')}</select></label>
            </div>
            <h2 style="margin:16px 0 8px">Melhores treinadores <span class="sub">esta jornada</span></h2>
            <div class="list">${coach.slice(0, 4).map(c => `<div class="li"><div class="grow"><b>${esc(c.team)}</b><span>${esc(c.opp)} · ${pct(c.pw)} vitória · ${pct(c.cs)} baliza a zero</span></div><span class="pts ${c.teamId === L.coach ? 'hi' : ''}">${fmt(c.pts)}</span></div>`).join('')}</div>
          </div>
          <div class="card"><h2>Alertas do plantel</h2>
            ${alerts.length ? `<div class="list">${alerts.map(p => `<div class="li">${posTag(p.pos)}<div class="grow"><b>${esc(p.name)}</b><span class="${p.missing ? 'bad' : 'warn'}">${p.missing ? 'Ausente: ' + esc(p.missing) : pct(p.pPlay) + ' de jogar · últimos jogos ' + p.lgMin.join('/') + "'"}</span></div></div>`).join('')}</div>` : '<p class="muted">Sem alertas: todos os jogadores devem jogar.</p>'}
          </div>
        </div>
      </div>
      ${compareHtml}
      <div class="card"><h2>Plantel completo <span class="sub">pontos esperados nesta jornada</span></h2>${playerTable(sq.sort((a, b) => 'GDMF'.indexOf(a.pos) - 'GDMF'.indexOf(b.pos) || b.pts - a.pts), { showPrice: true })}</div>`;

    // Qualquer alteração passa o onze a "personalizado"
    const commit = nl => { S.lineup = { ...nl, stamp }; save(); renderOnze(); };
    const cur = () => ({ ...L, xi: [...L.xi], bench: [...L.bench] });
    el.querySelectorAll('.seg button[data-f]').forEach(b => b.onclick = () => { if (b.dataset.f === L.formation) return;
      const nl = cur(); nl.formation = b.dataset.f; nl.xi = fillLineup(nl.formation, nl.xi, sq);
      const inNew = new Set(nl.xi); nl.bench = nl.bench.filter(id => !inNew.has(id)); commit(nl); });
    el.querySelectorAll('.slotSel').forEach(s => s.onchange = () => {
      const nl = cur(); const oldId = +s.dataset.old, newId = +s.value;
      const iOld = nl.xi.indexOf(oldId), iNew = nl.xi.indexOf(newId);
      if (iNew >= 0) [nl.xi[iOld], nl.xi[iNew]] = [newId, oldId]; // troca de lugar dentro do onze
      else { nl.xi[iOld] = newId; const b = nl.bench.indexOf(newId); if (b >= 0) nl.bench[b] = oldId; } // vem do banco: o que sai vai para o lugar dele
      if (nl.captain === oldId && iNew < 0) nl.captain = newId;
      commit(nl); });
    $('#capSel').onchange = e => { const nl = cur(); nl.captain = +e.target.value; commit(nl); };
    $('#coachSel').onchange = e => { const nl = cur(); nl.coach = +e.target.value; commit(nl); };
    el.querySelectorAll('.benchSel').forEach(s => s.onchange = () => {
      const nl = cur(); const i = +s.dataset.i; const v = s.value ? +s.value : null;
      const j = v != null ? nl.bench.indexOf(v) : -1;
      if (j >= 0 && j !== i) nl.bench[j] = nl.bench[i]; // troca de ordem no banco
      nl.bench[i] = v; nl.bench = nl.bench.filter(x => x != null);
      commit(nl); });
    const rb = $('#resetXI'); if (rb) rb.onclick = () => { S.lineup = null; save(); renderOnze(); };
    $('#cmpBtn').onclick = () => { S.compare = !S.compare; renderOnze(); if (S.compare) $('#compareCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  }

  // Tabela de jogadores: colunas essenciais por defeito; "Mais colunas" mostra o resto (fica memorizado).
  const meter = v => `<span class="meter ${v < 0.5 ? 'low' : v < 0.8 ? 'mid' : ''}"><i style="width:${Math.round((v || 0) * 100)}%"></i></span>${pct(v)}`;
  function playerTable(list, { sortable = false, limit = 400 } = {}) {
    const all = !!S.allCols;
    const cols = [
      ['pos', 'Pos', c => `${posTag(c.pos)}${c.sofaPos && c.sofaPos !== c.pos ? ` <span class="chip" title="No Sofascore: ${c.sofaPos}">≠</span>` : ''}`],
      ['name', 'Jogador', c => `<b>${esc(c.name)}</b>${c.missing ? ' <span class="bad" title="' + esc(c.missing) + '">✚ ausente</span>' : ''}`],
      ['opp', 'Jogo', c => `${esc(c.team)} <span class="muted">${esc(c.opp)}</span>`],
      ['pts', 'Pts esp.', c => `<span class="pts ${c.pts >= 4.5 ? 'hi' : ''}">${fmt(c.pts)}</span>`, 'num'],
      ['pPlay', 'Joga', c => meter(c.pPlay), 'num'],
      ['minIfPlay', 'Min.', c => fmt(c.minIfPlay, 0), 'num', 1],
      ['lgMin', 'Últ. 3 liga', c => c.lgMin.join('/'), '', 1],
      ['Pg', 'P(golo)', c => pct(c.Pg), 'num'],
      ['pw', 'Vitória', c => pct(c.pw), 'num'],
      ['cs', 'Baliza 0', c => pct(c.cs), 'num'],
      ['rating', 'Nota', c => fmt(c.rating, 2), 'num', 1],
      ['lrTot', 'LR total', c => c.lrTot ?? '–', 'num', 1],
      ['lrAvg', 'LR/ronda', c => fmt(c.lrAvg), 'num'],
      ['g', 'G', c => c.season.g, 'num', 1], ['a', 'A', c => c.season.a, 'num', 1], ['xg', 'xG', c => fmt(c.season.xg), 'num', 1],
      ['price', 'Preço', c => `<input type="number" step="0.05" class="small price" data-id="${c.id}" value="${S.prices[c.id] ?? ''}" placeholder="M€">`, 'num']
    ].filter(c => all || !c[4]);
    const head = cols.map(([k, l, , cls]) => `<th class="${cls || ''}" ${sortable ? `data-sort="${k}"` : ''}>${l}${sortable && S.rank.sort === k ? (S.rank.dir < 0 ? ' ▼' : ' ▲') : ''}</th>`).join('');
    const body = list.slice(0, limit).map(p => `<tr>${cols.map(([, , f, cls]) => `<td class="${cls || ''}">${f(p)}</td>`).join('')}</tr>`).join('');
    return `<div class="row" style="justify-content:flex-end;margin:-6px 0 6px"><button class="btn colsToggle" style="padding:4px 10px;font-size:12px">${all ? 'Menos colunas' : 'Mais colunas'}</button></div>
      <div class="tbl"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }
  document.addEventListener('click', e => { if (e.target.classList?.contains('colsToggle')) { S.allCols = !S.allCols; ls.set('allCols', S.allCols); renderAll(); } });

  function renderPlantel() {
    const el = $('#plantel');
    if (!S.data) { el.innerHTML = `<div class="card empty">Carrega primeiro os dados do Sofascore.</div>`; return; }
    const sq = (S.squad || []).map(id => S.byId[id] || { id, name: '(jogador sem jogo/dados)', pos: S.posOverride[id] || '?', team: '' });
    const count = { G: 0, D: 0, M: 0, F: 0 }; sq.forEach(p => count[p.pos] = (count[p.pos] || 0) + 1);
    const value = sq.reduce((s, p) => s + (+S.prices[p.id] || 0), 0);
    const opts = S.proj.players.slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => `<option value="${esc(p.name)} · ${esc(p.team)} · #${p.id}">`).join('');
    el.innerHTML = `
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <h2>O meu plantel (${sq.length}/23)</h2>
          <div class="row">
            ${Object.entries(NEED).map(([k, n]) => `<span class="chip ${count[k] === n ? 'good' : 'bad'}">${posTag(k)} ${count[k] || 0}/${n}</span>`).join('')}
            <span class="chip">Valor ${eur(value)}</span>
            <label>Saldo <input type="number" step="0.05" class="small" id="saldo" value="${S.saldo}"> M€</label>
          </div>
        </div>
        <div class="row" style="margin:8px 0 12px">
          <input type="text" id="addP" list="allP" placeholder="Adicionar jogador… (escreve o nome)" style="min-width:320px">
          <datalist id="allP">${opts}</datalist>
          <button class="btn primary" id="addBtn">Adicionar</button>
          <button class="btn" id="expBtn">Exportar plantel</button>
          <label class="btn">Importar plantel<input type="file" id="impF" accept=".json" style="display:none"></label>
        </div>
        <table><tr><th>Pos. Liga Record</th><th>Jogador</th><th>Equipa</th><th>Jogo</th><th class="num">Pts esp.</th><th>Disponibilidade</th><th class="num">Preço (V.A.)</th><th></th></tr>
        ${sq.sort((a, b) => 'GDMF'.indexOf(a.pos) - 'GDMF'.indexOf(b.pos)).map(p => `<tr>
          <td><select class="posSel" data-id="${p.id}">${['G', 'D', 'M', 'F'].map(k => `<option value="${k}" ${p.pos === k ? 'selected' : ''}>${{ G: 'GR', D: 'DEF', M: 'MED', F: 'AV' }[k]}</option>`).join('')}</select></td>
          <td>${esc(p.name)}</td><td>${esc(p.team)}</td><td>${esc(p.opp || '')}</td><td class="num">${fmt(p.pts)}</td>
          <td><select class="avSel" data-id="${p.id}">${[['', 'Automática' + (p.pPlay != null ? ' (' + pct(p.pPlay) + ')' : '')], ['1', 'Joga de certeza'], ['0.75', 'Provável'], ['0.5', 'Dúvida'], ['0.25', 'Pouco provável'], ['0', 'Não joga']].map(([v, l]) => `<option value="${v}" ${String(S.availOverride[p.id] ?? '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
          <td class="num"><input type="number" step="0.05" class="small price" data-id="${p.id}" value="${S.prices[p.id] ?? ''}"></td>
          <td><button class="x rm" data-id="${p.id}" title="Remover">✕</button></td></tr>`).join('')}
        </table>
        <p class="note">A posição é a da Liga Record (inferida dos PDFs quando possível). A disponibilidade manual sobrepõe-se ao cálculo automático (usa-a para lesões/dúvidas que o Sofascore ainda não mostra).</p>
      </div>`;
    $('#saldo').onchange = e => { S.saldo = +e.target.value || 0; save(); renderTrocas(); renderPlantel(); };
    $('#addBtn').onclick = () => { const m = $('#addP').value.match(/#(\d+)$/); if (!m) return; const id = +m[1]; if (!S.squad.includes(id)) S.squad.push(id); save(); recompute(); };
    el.querySelectorAll('.rm').forEach(b => b.onclick = () => { S.squad = S.squad.filter(id => id !== +b.dataset.id); save(); recompute(); });
    el.querySelectorAll('.posSel').forEach(s => s.onchange = () => { S.posOverride[+s.dataset.id] = s.value; save(); recompute(); });
    el.querySelectorAll('.avSel').forEach(s => s.onchange = () => { if (s.value === '') delete S.availOverride[+s.dataset.id]; else S.availOverride[+s.dataset.id] = +s.value; save(); recompute(); });
    $('#expBtn').onclick = () => {
      const blob = new Blob([JSON.stringify({ squad: S.squad, prices: S.prices, saldo: S.saldo, posOverride: S.posOverride, availOverride: S.availOverride }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'plantel-liga-record.json'; a.click();
    };
    $('#impF').onchange = async e => { const j = JSON.parse(await e.target.files[0].text()); Object.assign(S, { squad: j.squad, prices: j.prices || {}, saldo: j.saldo ?? 0, posOverride: j.posOverride || {}, availOverride: j.availOverride || {} }); save(); recompute(); };
  }

  function renderTrocas() {
    const el = $('#trocas');
    if (!S.data) { el.innerHTML = `<div class="card empty">Carrega primeiro os dados do Sofascore.</div>`; return; }
    let list = LRModel.transfers(S.proj.players, S.squad || [], S.prices, +S.saldo || 0);
    // uma linha por jogador que entra (a melhor saída para ele)
    const seen = new Set(); list = list.filter(t => { if (seen.has(t.in.id)) return false; seen.add(t.in.id); return true; });
    if (S.onlyAffordable) list = list.filter(t => t.affordable);
    const fit = t => (t.affordable == null ? '<span class="tag q">preço?</span>' : t.affordable ? '<span class="tag ok">cabe no saldo</span>' : '<span class="tag no">não cabe</span>');
    const card = t => `<div class="swap"><span class="gain" title="pontos esperados a mais nesta jornada">${t.gain > 0 ? '+' : ''}${fmt(t.gain)} pts</span>${posTag(t.out.pos)} <span class="note">ganho esperado</span>
      <div class="who"><div><span>Sai</span><b>${esc(t.out.name)}</b><span>${esc(t.out.team)} · ${eur(t.sell) || '?'}</span></div><div class="arrow">→</div>
        <div><span>Entra</span><b>${esc(t.in.name)}</b><span>${esc(t.in.team)} ${esc(t.in.opp)} · ${pct(t.in.pPlay)} joga</span></div></div>
      <div class="foot"><span>Preço <input type="number" step="0.05" class="small price" data-id="${t.in.id}" value="${S.prices[t.in.id] ?? ''}" placeholder="M€"></span>${fit(t)}</div></div>`;
    el.innerHTML = `
      <div class="row" style="justify-content:space-between;margin-bottom:12px"><h2 style="margin:0;font-size:16px">Melhores trocas para a próxima jornada <span class="sub note">saldo ${eur(+S.saldo || 0)}</span></h2>
        <label class="chip" style="cursor:pointer;padding:6px 12px"><input type="checkbox" id="onlyAff" ${S.onlyAffordable ? 'checked' : ''}> Só as que cabem no saldo</label></div>
      ${list.length ? `<div class="swaps">${list.slice(0, 6).map(card).join('')}</div>` : '<div class="card empty"><span class="ic">🔍</span>Nenhuma troca com estes filtros. Escreve os preços de quem entra para validar o saldo.</div>'}
      <div class="card"><h2>Todas as opções <span class="sub">"Ganho" = pontos esperados a mais no onze ideal (com capitão) nesta jornada · escreve o preço de quem entra para validar o saldo</span></h2>
        <div class="tbl"><table><tr><th>Pos</th><th>Sai</th><th class="num">Preço</th><th>Entra</th><th>Jogo</th><th class="num">Preço</th><th class="num">Ganho jornada</th><th class="num">Δ LR/ronda</th><th class="num">Joga</th><th class="num">Saldo final</th><th>Orçamento</th></tr>
        ${list.slice(0, 60).map(t => `<tr><td>${posTag(t.out.pos)}</td><td>${esc(t.out.name)}</td><td class="num">${eur(t.sell)}</td>
          <td><b>${esc(t.in.name)}</b> <span class="muted">${esc(t.in.team)}</span></td><td>${esc(t.in.opp)}</td>
          <td class="num"><input type="number" step="0.05" class="small price" data-id="${t.in.id}" value="${S.prices[t.in.id] ?? ''}" placeholder="M€"></td>
          <td class="num ${t.gain > 0 ? 'good' : 'bad'}"><b>${t.gain > 0 ? '+' : ''}${fmt(t.gain)}</b></td><td class="num">${t.in.lrAvg != null || t.out.lrAvg != null ? (t.lrAvgDiff > 0 ? '+' : '') + fmt(t.lrAvgDiff) : '–'}</td>
          <td class="num">${pct(t.in.pPlay)}</td><td class="num">${eur(t.newSaldo)}</td>
          <td>${t.affordable == null ? '<span class="muted">preço?</span>' : t.affordable ? '<span class="good">✔ cabe</span>' : '<span class="bad">✘ não cabe</span>'}</td></tr>`).join('')}
        </table></div>
      </div>`;
    $('#onlyAff').onchange = e => { S.onlyAffordable = e.target.checked; renderTrocas(); };
  }

  function renderRanking() {
    const el = $('#ranking');
    if (!S.data) { el.innerHTML = `<div class="card empty">Carrega primeiro os dados do Sofascore.</div>`; return; }
    const r = S.rank;
    let list = S.proj.players.filter(p => (r.pos === 'all' || p.pos === r.pos) && (r.team === 'all' || p.teamId === +r.team) && (!r.q || LRModel.norm(p.name).includes(LRModel.norm(r.q))));
    const key = p => { const k = r.sort; if (k === 'g' || k === 'a' || k === 'xg') return p.season[k]; if (k === 'price') return S.prices[p.id] ?? -1; if (k === 'lgMin') return p.lgMin.reduce((s, v) => s + v, 0); const v = p[k]; return v == null ? -999 : v; };
    list.sort((a, b) => { const ka = key(a), kb = key(b); return typeof ka === 'string' ? r.dir * ka.localeCompare(kb) : r.dir * (ka - kb); });
    const teams = Object.values(S.data.teams).sort((a, b) => a.name.localeCompare(b.name));
    el.innerHTML = `<div class="card">
      <div class="row" style="margin-bottom:10px">
        <select id="rPos">${[['all', 'Todas as posições'], ['G', 'Guarda-redes'], ['D', 'Defesas'], ['M', 'Médios'], ['F', 'Avançados']].map(([v, l]) => `<option value="${v}" ${r.pos === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select id="rTeam"><option value="all">Todas as equipas</option>${teams.map(t => `<option value="${t.id}" ${String(r.team) === String(t.id) ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
        <input type="text" id="rQ" placeholder="Procurar jogador" value="${esc(r.q)}">
        <span class="note">Clica nos títulos das colunas para ordenar. ✚ = ausente (lesão/castigo). ≠ = posição diferente do Sofascore.</span>
      </div>${playerTable(list, { sortable: true, limit: 300 })}</div>`;
    $('#rPos').onchange = e => { r.pos = e.target.value; renderRanking(); };
    $('#rTeam').onchange = e => { r.team = e.target.value; renderRanking(); };
    $('#rQ').oninput = e => { r.q = e.target.value; clearTimeout(S._qt); S._qt = setTimeout(() => { renderRanking(); const i = $('#rQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); };
    el.querySelectorAll('th[data-sort]').forEach(th => th.onclick = () => { const k = th.dataset.sort; if (r.sort === k) r.dir *= -1; else { r.sort = k; r.dir = ['name', 'team', 'opp', 'pos'].includes(k) ? 1 : -1; } renderRanking(); });
  }

  function renderJogos() {
    const el = $('#jogos');
    if (!S.data) { el.innerHTML = `<div class="card empty">Carrega primeiro os dados do Sofascore.</div>`; return; }
    const ts = S.proj.ts; const seen = new Set(); const games = [];
    for (const [tid, n] of Object.entries(S.data.next)) { if (seen.has(n.eventId)) continue; seen.add(n.eventId);
      const homeId = n.home ? +tid : n.oppId, awayId = n.home ? n.oppId : +tid;
      games.push({ n, homeId, awayId, ph: LRModel.matchProbs(S.data, ts, homeId), pa: LRModel.matchProbs(S.data, ts, awayId) }); }
    games.sort((a, b) => a.n.ts - b.n.ts);
    const T = id => S.data.teams[id] || {};
    const miss = id => (S.data.missing[id] || []).map(m => esc(m.name) + ' <span class="muted">(' + esc(m.reason) + ')</span>').join(', ') || '<span class="muted">—</span>';
    const coach = LRModel.coaches(S.data);
    const myIn = tid => squadPlayers().filter(p => p.teamId === tid);
    const form = s => (s || '').split('').map(c => `<span class="tag ${c === 'V' ? 'ok' : c === 'D' ? 'no' : 'q'}" style="padding:1px 6px">${c}</span>`).join(' ');
    const gameCard = g => { const o = S.data.odds[g.n.eventId]; const h = g.ph || {}, mineH = myIn(g.homeId), mineA = myIn(g.awayId);
      const w = v => Math.max(0, Math.round((v || 0) * 100));
      return `<div class="game">
        <div class="when">${new Date(g.n.ts * 1000).toLocaleString('pt-PT', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}${o ? ` · odds ${fmt(o.h, 2)} / ${fmt(o.d, 2)} / ${fmt(o.a, 2)}` : ''}</div>
        <div class="teams"><span>${esc(T(g.homeId).short)}</span><span class="muted" style="font-weight:400">${fmt(h.lf)} – ${fmt(h.la)} golos esp.</span><span>${esc(T(g.awayId).short)}</span></div>
        <div class="prob" title="Vitória casa / empate / vitória fora"><div class="h" style="width:${w(h.pw)}%">${w(h.pw)}%</div><div class="d" style="width:${w(h.pd)}%">${w(h.pd) >= 12 ? w(h.pd) + '%' : ''}</div><div class="a" style="width:${w(h.pl)}%">${w(h.pl)}%</div></div>
        <div class="facts"><span>Baliza a zero <b>${pct(h.cs)}</b></span><span style="text-align:right">Baliza a zero <b>${pct(g.pa?.cs)}</b></span>
          <span>Forma ${form(ts.teams[g.homeId]?.form)}</span><span style="text-align:right">${form(ts.teams[g.awayId]?.form)}</span>
          <span>xG/xGA ${fmt(ts.teams[g.homeId]?.xg4)} / ${fmt(ts.teams[g.homeId]?.xga4)}</span><span style="text-align:right">${fmt(ts.teams[g.awayId]?.xg4)} / ${fmt(ts.teams[g.awayId]?.xga4)}</span></div>
        <div class="miss"><span class="muted">Ausentes:</span> ${esc(T(g.homeId).short)}: ${miss(g.homeId)} · ${esc(T(g.awayId).short)}: ${miss(g.awayId)}</div>
        ${mineH.length + mineA.length ? `<div class="miss"><span class="muted">Os teus:</span> ${[...mineH, ...mineA].map(p => `<span class="chip">${esc(p.name)}</span>`).join(' ')}</div>` : ''}
      </div>`; };
    el.innerHTML = `
      <h2 style="margin:0 0 12px;font-size:16px">Jogos da jornada ${S.data.meta.nextRound} <span class="sub note">barra: vitória casa · empate · vitória fora</span></h2>
      <div class="games" style="margin-bottom:16px">${games.map(gameCard).join('')}</div>
      <div class="card"><h2>Treinadores – pontos esperados</h2><table><tr><th>Equipa</th><th>Jogo</th><th class="num">Pts esp.</th><th class="num">Vitória</th><th class="num">Baliza 0</th></tr>
      ${coach.map(c => `<tr><td>${esc(c.team)}</td><td>${esc(c.opp)}</td><td class="num">${fmt(c.pts, 2)}</td><td class="num">${pct(c.pw)}</td><td class="num">${pct(c.cs)}</td></tr>`).join('')}</table>
      <p class="note">Treinador = nota dos jornalistas (média real: vitória 3,8 · empate 2,9 · derrota 2,3) + vitória +1 / derrota −1, sem sofrer +1, sem marcar −1, ganhar/perder por mais de 2 ±1, +1 por golo de suplente. Não inclui reviravoltas nem expulsões.</p></div>`;
  }

  function renderCalib() {
    const el = $('#calib');
    if (!S.data) { el.innerHTML = `<div class="card empty">Carrega primeiro os dados do Sofascore.</div>`; return; }
    const c = S.cal; const g = c.grade;
    if (!S.lr) { el.innerHTML = `<div class="card empty">Carrega <code>data/pontuacoes.json</code> (gerado a partir dos PDFs da Liga Record) para calibrar a nota Record e as posições.</div>`; return; }
    const diffs = Object.entries(c.lrPos).filter(([pid, pos]) => (S.data.positions[pid] || {}).pos && S.data.positions[pid].pos !== pos)
      .map(([pid, pos]) => ({ name: (S.data.positions[pid] || {}).name, team: S.data.teams[(S.data.positions[pid] || {}).teamId]?.short, sofa: S.data.positions[pid].pos, lr: pos, tot: c.lrByPid[pid]?.tot }));
    const tops = ['G', 'D', 'M', 'F'].map(pos => ({ pos, list: Object.entries(c.lrByPid).filter(([pid]) => (S.posOverride[pid] || c.lrPos[pid] || (S.data.positions[pid] || {}).pos) === pos).map(([pid, x]) => ({ ...x, team: S.data.teams[(S.data.positions[pid] || {}).teamId]?.short })).sort((a, b) => b.tot - a.tot).slice(0, 10) }));
    const teamAvg = Object.entries(c.teamAvg || {}).map(([t, v]) => [S.data.teams[t]?.short, v]).sort((a, b) => b[1] - a[1]);
    const total = Object.values(c.dist).reduce((s, v) => s + v, 0);
    el.innerHTML = `
      <div class="grid2">
        <div class="card"><h2>Validação das regras</h2>
          <p><span class="big">${pct(c.validPct)}</span> das ${c.n} exibições batem certo com as regras (o resto = nota fora de 0-4/7 → posição diferente ou caso especial).</p>
          <h2>Distribuição da nota Record (pontos)</h2>
          <table>${Object.entries(c.dist).sort().map(([k, v]) => `<tr><td>${k} pts</td><td class="num">${v}</td><td style="width:60%"><div class="bar"><i style="width:${100 * v / total}%"></i></div></td><td class="num">${pct(v / total)}</td></tr>`).join('')}</table>
        </div>
        <div class="card"><h2>Fórmula da nota Record ${c.fitted ? `(calibrada, n=${c.nFit}, R²=${fmt(c.r2, 2)})` : '(valores por defeito)'}</h2>
          <table>
            <tr><td>Base (jogou)</td><td class="num">${fmt(g.c, 2)}</td></tr><tr><td>+ jogou 60'+</td><td class="num">${fmt(g.m60, 2)}</td></tr><tr><td>+ jogou 30-59'</td><td class="num">${fmt(g.m30, 2)}</td></tr>
            <tr><td>× (nota Sofascore − 6,8)</td><td class="num">${fmt(g.rating, 2)}</td></tr><tr><td>+ marcou</td><td class="num">${fmt(g.goal, 2)}</td></tr><tr><td>+ assistiu</td><td class="num">${fmt(g.assist, 2)}</td></tr>
            <tr><td>+ vitória</td><td class="num">${fmt(g.win, 2)}</td></tr><tr><td>+ derrota</td><td class="num">${fmt(g.loss, 2)}</td></tr><tr><td>+ guarda-redes</td><td class="num">${fmt(g.gk, 2)}</td></tr>
          </table></div>
      </div>
      <div class="grid2">
        <div class="card"><h2>Mais pontos na Liga Record (época)</h2>
          ${tops.map(t => `<p>${posTag(t.pos)} ${t.list.map(x => `${esc(x.n)} <span class="muted">(${esc(x.team)})</span> <b>${x.tot}</b>`).join(' · ')}</p>`).join('')}</div>
        <div class="card"><h2>Pontos Liga Record por ronda (soma da equipa)</h2>
          <table>${teamAvg.map(([t, v]) => `<tr><td>${esc(t)}</td><td class="num">${fmt(v)}</td><td style="width:60%"><div class="bar"><i style="width:${Math.max(0, 100 * v / (teamAvg[0][1] || 1))}%"></i></div></td></tr>`).join('')}</table></div>
      </div>
      <div class="card"><h2>Posição diferente entre Sofascore e Liga Record</h2>
        <table><tr><th>Jogador</th><th>Equipa</th><th>Sofascore</th><th>Liga Record</th><th class="num">LR total</th></tr>
        ${diffs.map(d => `<tr><td>${esc(d.name)}</td><td>${esc(d.team)}</td><td>${posTag(d.sofa)}</td><td>${posTag(d.lr)}</td><td class="num">${d.tot ?? '–'}</td></tr>`).join('')}</table></div>`;
  }

  function renderAll() { renderOnze(); renderPlantel(); renderTrocas(); renderRanking(); renderJogos(); renderCalib(); }

  // preços editáveis em qualquer tabela
  document.addEventListener('change', e => {
    if (e.target.classList?.contains('price')) {
      const id = +e.target.dataset.id; const v = e.target.value;
      if (v === '') delete S.prices[id]; else S.prices[id] = +v;
      save(); if (!e.target.closest('#ranking')) { renderTrocas(); }
    }
  });

  // separadores
  $('#tabs').onclick = e => { const b = e.target.closest('button'); if (!b) return;
    document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('main section').forEach(s => s.classList.toggle('on', s.id === b.dataset.t)); };

  // ---------- atualizações ----------
  // mensagens: as de sucesso desaparecem sozinhas; erros e instruções ficam até à próxima
  const notice = (html, kind = '') => { const n = $('#notice'); clearTimeout(S._nt); n.hidden = !html; n.className = 'notice ' + kind; n.innerHTML = html;
    if (kind === 'ok') S._nt = setTimeout(() => { n.hidden = true; }, 8000); };
  const setSofa = async (data, origem) => {
    if (!data || !data.meta || !Array.isArray(data.players) || !data.teams) throw new Error('ficheiro sem o formato do coletor');
    S.data = data; await idb.set('data', data); recompute();
    notice(`✅ Dados do Sofascore atualizados (${origem}): ${data.players.length} jogadores, jornada ${data.meta.nextRound}.`, 'ok');
  };
  const setLR = async (lr, origem) => {
    S.lr = lr; await idb.set('lr', lr); recompute();
    const js = lr.jds.map(x => x.j).sort((a, b) => a - b);
    notice(`✅ Pontuações atualizadas (${origem}): ${lr.players.length} pontuações, jornadas ${js.join(', ')}.`, 'ok');
  };

  // Marcador (bookmarklet) gerado a partir do próprio coletor
  if (typeof ligaRecordCollector === 'function') {
    const href = 'javascript:' + encodeURIComponent('(' + ligaRecordCollector.toString() + ')()');
    document.querySelectorAll('#bm').forEach(a => { a.href = href; a.onclick = e => { e.preventDefault(); alert('Arrasta este botão para a barra de favoritos do Chrome (Ctrl+Shift+B para a mostrar). Depois usa-o na página do Sofascore.'); }; });
  }

  // Botão Sofascore: abre o site; o marcador corre lá e devolve os dados por postMessage
  $('#btnSofa').onclick = () => {
    window.open('https://www.sofascore.com/pt-pt/football/tournament/portugal/liga-portugal-betclic/238', 'ligarecord-sofascore');
    notice('Abri o Sofascore num separador novo. Lá, clica no marcador <b>Liga Record ⚽</b> da barra de favoritos e espera 2-4 minutos (caixa vermelha → verde). Os dados aparecem aqui sozinhos. Ainda não tens o marcador? Vê o separador <b>Como usar</b>.');
  };
  window.addEventListener('message', async e => {
    if (e.origin !== 'https://www.sofascore.com' || e.data?.type !== 'liga-record-data') return;
    try { await setSofa(e.data.data, 'Sofascore'); } catch (err) { notice('❌ Os dados recebidos não são válidos: ' + esc(err.message), 'err'); }
  });

  // Botão PDFs: lê a pasta escolhida (fica memorizada) e extrai as pontuações com o pdf.js
  const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('não consegui carregar ' + src)); document.head.appendChild(s); });
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  async function pdfjs() {
    if (!window.pdfjsLib) await loadScript(PDFJS + 'pdf.min.js');
    // o worker corre na própria página (funciona com a app aberta a partir de um ficheiro local)
    if (!window.pdfjsWorker) await loadScript(PDFJS + 'pdf.worker.min.js');
    return window.pdfjsLib;
  }
  async function importPdfs(files, origem) {
    if (!files.length) { notice('Não encontrei PDFs "Liga Record - Pontuações" nessa pasta.', 'err'); return; }
    notice(`A ler ${files.length} PDF(s)…`);
    const { data, report } = await LRPdf.parseFiles(await pdfjs(), files);
    const bad = report.filter(r => !r.ok);
    if (!data.players.length) { notice('❌ Não consegui ler pontuações desses PDFs.', 'err'); return; }
    await setLR(data, origem + (bad.length ? ` · ${bad.length} PDF(s) ignorados: ${bad.map(b => esc(b.name)).join(', ')}` : ''));
  }
  const isScorePdf = name => /\.pdf$/i.test(name) && /pontua/i.test(name);
  $('#btnPdfs').onclick = async () => {
    if (!window.showDirectoryPicker) { $('#fPdfs').click(); return; } // browsers sem acesso a pastas: escolher os ficheiros
    try {
      let dir = await idb.get('pdfDir');
      if (dir && (await dir.queryPermission({ mode: 'read' })) !== 'granted' && (await dir.requestPermission({ mode: 'read' })) !== 'granted') dir = null;
      if (!dir) { dir = await window.showDirectoryPicker({ id: 'liga-record-pdfs', mode: 'read' }); await idb.set('pdfDir', dir); }
      const files = [];
      for await (const [name, h] of dir.entries()) if (h.kind === 'file' && isScorePdf(name)) files.push({ name, bytes: new Uint8Array(await (await h.getFile()).arrayBuffer()) });
      await importPdfs(files, 'pasta ' + dir.name);
    } catch (err) { if (err.name !== 'AbortError') notice('❌ ' + esc(err.message), 'err'); }
  };
  $('#fPdfs').onchange = async e => {
    const files = await Promise.all([...e.target.files].filter(f => isScorePdf(f.name)).map(async f => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
    await importPdfs(files, 'ficheiros escolhidos'); e.target.value = '';
  };

  // ---------- sincronização PC → telemóvel ----------
  // PC: "Publicar" grava data/sync.json na pasta do projeto; depois publicar.bat envia para o GitHub Pages.
  // Telemóvel (site): ao abrir, vai buscar data/sync.json e aplica-o se for mais recente do que o que tem.
  const onWeb = /^https?:$/.test(location.protocol) && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const bundle = () => ({ v: 1, created: new Date().toISOString(), data: S.data, lr: S.lr, squad: S.squad, prices: S.prices, saldo: S.saldo,
    posOverride: S.posOverride, availOverride: S.availOverride, lineup: S.lineup });
  function renderSync() {
    const st = ls.get('syncStamp', null);
    $('#dotSync').className = 'dot ' + (st ? (Date.now() - new Date(st) < 2 * 864e5 ? 'ok' : 'old') : 'none');
    $('#subSync').textContent = st ? (onWeb ? 'sincronizado ' : 'publicado ') + ago(st) : (onWeb ? 'sem dados do PC' : 'não publicado');
    $('#btnSync').hidden = onWeb; // no telemóvel não há nada para publicar
  }
  $('#btnSync').onclick = async () => {
    if (!S.data) { notice('Atualiza primeiro os dados do Sofascore.', 'err'); return; }
    const b = bundle(); const json = JSON.stringify(b);
    try {
      if (!window.showDirectoryPicker) throw new Error('nofs');
      let dir = await idb.get('projDir');
      if (dir && (await dir.queryPermission({ mode: 'readwrite' })) !== 'granted' && (await dir.requestPermission({ mode: 'readwrite' })) !== 'granted') dir = null;
      if (!dir) {
        notice('Escolhe a pasta do projeto <b>liga-record-previsoes</b> (a que tem o index.html).');
        dir = await window.showDirectoryPicker({ id: 'liga-record-projeto', mode: 'readwrite' });
        try { await dir.getFileHandle('index.html'); } catch (e) { notice('❌ Essa pasta não tem o index.html. Escolhe a pasta do projeto.', 'err'); return; }
        await idb.set('projDir', dir);
      }
      const dataDir = await dir.getDirectoryHandle('data', { create: true });
      const w = await (await dataDir.getFileHandle('sync.json', { create: true })).createWritable();
      await w.write(json); await w.close();
    } catch (err) {
      if (err.name === 'AbortError') return;
      // sem acesso a pastas: descarrega o ficheiro para o pores em data/
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = 'sync.json'; a.click();
      notice('Descarreguei <code>sync.json</code>: põe-no na pasta <code>data/</code> do projeto e corre <b>publicar.bat</b>.');
      ls.set('syncStamp', b.created); renderSync(); return;
    }
    ls.set('syncStamp', b.created); renderSync();
    notice(`✅ Dados gravados em <code>data/sync.json</code> (${(json.length / 1e6).toFixed(1).replace('.', ',')} MB). Agora faz duplo clique em <b>publicar.bat</b> na pasta do projeto — em 1-2 minutos o telemóvel fica atualizado.`, 'ok');
  };
  async function loadSync() {
    if (!/^https?:$/.test(location.protocol)) return false;
    try {
      const r = await fetch('data/sync.json', { cache: 'no-store' }); if (!r.ok) return false;
      const b = await r.json(); const mine = ls.get('syncStamp', null);
      if (!b.created || (mine && new Date(b.created) <= new Date(mine))) return false;
      // só substitui o plantel/preços se o PC os enviou (um ficheiro só com dados não apaga o plantel do telemóvel)
      Object.assign(S, { data: b.data || S.data, lr: b.lr || S.lr });
      if (Array.isArray(b.squad) && b.squad.length) Object.assign(S, { squad: b.squad, prices: b.prices || {}, saldo: b.saldo ?? S.saldo,
        posOverride: b.posOverride || {}, availOverride: b.availOverride || {}, lineup: b.lineup || null, seedPending: false });
      await idb.set('data', S.data); if (S.lr) await idb.set('lr', S.lr);
      ls.set('syncStamp', b.created); save();
      notice(`✅ Dados sincronizados do PC (publicados ${ago(b.created)}).`, 'ok');
      return true;
    } catch (e) { return false; }
  }

  // ficheiros à mão
  $('#fSofa').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { await setSofa(JSON.parse(await f.text()), f.name); } catch (err) { notice('❌ ' + esc(err.message), 'err'); } };
  $('#fLR').onchange = async e => { const f = e.target.files[0]; if (!f) return; await setLR(JSON.parse(await f.text()), f.name); };

  (async () => {
    S.data = window.__LR_PRELOAD?.data || await idb.get('data');
    S.lr = window.__LR_PRELOAD?.lr || await idb.get('lr');
    await loadSync(); // no site (telemóvel): dados mais recentes publicados a partir do PC
    renderSync();
    if (S.data) recompute(); else renderAll();
    if (onWeb) $('#btnSofa').closest('.src').title += ' · no telemóvel: usa o marcador escrevendo "Liga Record" na barra de endereço';
  })();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
})();

/* Modo "Champions": UEFA Champions League Fantasy. Usa os mesmos separadores e estilos da Liga Record.
   Dados: marcador "Liga Record ⚽" no site da UEFA Fantasy (jogadores, preços, jogo a jogo) + odds do Sofascore. */
const UCLApp = (() => {
  const A = () => window.LRApp; // utilitários da app principal (S, ls, idb, fmt, …)
  const $ = s => document.querySelector(s);
  const POSN = { G: 'GR', D: 'DEF', M: 'MED', F: 'AV' };
  const SITE = 'https://gaming.uefa.com/en/uclfantasy/create-team';
  const U = { data: null, proj: null, byId: {}, compare: false };
  // Plantel de 3-nov-2026 (depois da jornada 3): Raya, Lammens · Gabriel, Calafiori, Hakimi, Dimarco, N. Brown ·
  // Vitinha, Yamal, Enzo Fernández, Gravenberch, Barcola · Kane, Ferran Torres, Mbeumo. Saldo estimado (100 − valor atual).
  const SEED_SQUAD = [250171278, 250118908, 250131901, 250113392, 250088061, 250056189, 250190350, 250101444, 250176450, 250174838, 250113001, 250134138, 250016833, 250088320, 250137260];
  const st = () => {
    const { ls } = A();
    return { squad: ls.get('ucl.squad', SEED_SQUAD), bank: ls.get('ucl.bank', 1.3), avail: ls.get('ucl.avail', {}), lineup: ls.get('ucl.lineup', null),
      freeT: ls.get('ucl.freeT', 2), extraT: ls.get('ucl.extraT', 0), chips: ls.get('ucl.chips', { wc: null, lim: null }), name: ls.get('ucl.name', ''),
      // histórico: o guardado + as jornadas importadas (js/ucl-history-seed.js) que faltem
      history: { ...(window.UCL_HISTORY_SEED || {}), ...ls.get('ucl.history', {}) } };
  };
  const put = (k, v) => A().ls.set('ucl.' + k, v);
  const m1 = x => (x == null ? '–' : (+x).toFixed(1).replace('.', ',') + ' M€');

  async function init() { U.data = await A().idb.get('ucl'); }
  async function setData(d, origem) {
    if (!d?.players?.length) throw new Error('sem jogadores');
    U.data = d; await A().idb.set('ucl', d);
    A().notice(`✅ Dados da UEFA Fantasy atualizados (${origem}): ${d.players.length} jogadores, jornada ${d.meta.md}.`, 'ok');
    recompute();
  }
  function recompute() {
    if (!U.data) { renderAll(); return; }
    const s = st();
    // correções da análise da IA (js/analise.js); as escolhas manuais ganham. projBase = só o modelo, para comparar
    const aiAvail = AnaliseUI.avail('ucl', U.data.meta.md);
    U.projBase = Object.keys(aiAvail).length ? UCLModel.project(U.data, A().S.data?.ucl, { availOverride: s.avail }) : null;
    U.baseById = U.projBase ? Object.fromEntries(U.projBase.players.map(p => [p.id, p])) : null;
    U.proj = UCLModel.project(U.data, A().S.data?.ucl, { availOverride: { ...aiAvail, ...s.avail } });
    U.byId = Object.fromEntries(U.proj.players.map(p => [p.id, p]));
    renderAll();
  }
  const squadP = () => st().squad.map(id => U.byId[id]).filter(Boolean);

  // ---------- topo ----------
  const deadlineMs = () => { if (!U.proj) return null; const ts = Object.values(U.proj.games).map(g => g.ts).filter(Boolean); return ts.length ? Math.min(...ts) : null; };
  function header() {
    const { ago } = A(), d = U.data;
    $('#teamName').textContent = st().name || 'Champions Fantasy';
    $('#dotUefa').className = 'dot ' + (d ? ((Date.now() - new Date(d.meta.created)) / 36e5 < 48 ? 'ok' : 'old') : 'none');
    $('#subUefa').textContent = d ? `jornada ${d.meta.md} · ${ago(d.meta.created)}` : 'sem dados';
    const o = A().S.data?.ucl;
    $('#subSofa').textContent = o?.events?.length ? `odds de ${o.events.length} jogos · ${ago(o.created)}` : 'sem odds da Champions';
    $('#dotSofa').className = 'dot ' + (o?.events?.length ? 'ok' : 'none');
    tick();
  }
  function tick() {
    const el = $('#deadline'), dl = deadlineMs(); if (!dl) { el.hidden = true; return; }
    const ms = dl - Date.now(); el.hidden = false;
    if (ms <= 0) { el.textContent = 'Jornada a decorrer · atualiza os dados'; el.className = 'deadline far'; return; }
    const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), mi = Math.floor(ms % 36e5 / 6e4);
    el.textContent = `Fecha em ${d ? d + 'd ' : ''}${h}h ${String(mi).padStart(2, '0')}m · ${new Date(dl).toLocaleString('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
    el.className = 'deadline' + (ms > 2 * 864e5 ? ' far' : '');
  }

  const empty = html => `<div class="card empty"><span class="ic">⭐</span>${html}</div>`;
  const noData = () => empty(`Sem dados da Champions ainda.<br>Carrega em <b>UEFA Fantasy → Atualizar</b> no topo e, no site da UEFA, clica no marcador <b>Liga Record ⚽</b> (1-2 minutos).<br><span class="note">Para as odds dos jogos, atualiza também o <b>Sofascore</b> (o mesmo marcador, no sofascore.com).</span>`);
  const day = ts => new Date(ts).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const hour = ts => new Date(ts).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

  // ---------- onze ----------
  // O onze recomendado vem da jornada simulada com as trocas entre dias (UCLModel.plan): ~1 s, guarda-se em cache
  const planCache = new Map();
  const cached = (key, f) => { if (!planCache.has(key)) { if (planCache.size > 40) planCache.clear(); planCache.set(key, f()); } return planCache.get(key); };
  const sqKey = sq => U.data.meta.created + '|' + JSON.stringify(st().avail) + '|' + (U.projBase ? 'ia' : '') + '|' + sq.map(p => p.id).sort().join(',');
  const planOf = sq => cached('plan|' + sqKey(sq), () => UCLModel.plan(sq));
  function lineupOf(sq) {
    const best = planOf(sq); if (!best) return null;
    const s = st(), stamp = U.data.meta.created;
    const custom = s.lineup && s.lineup.stamp === stamp;
    let L = { formation: best.formation, xi: best.xi.map(p => p.id), bench: best.bench.map(p => p.id), captain: best.captain.id };
    if (custom) {
      const inSq = new Set(sq.map(p => p.id)), c = s.lineup;
      const xi = [...new Set(c.xi.filter(id => inSq.has(id)))];
      const cnt = pos => xi.filter(id => U.byId[id].pos === pos).length;
      const valid = xi.length === 11 && cnt('G') === 1 && cnt('D') >= 3 && cnt('M') >= 2 && cnt('F') >= 1;
      if (valid) {
        const inXI = new Set(xi);
        const bench = [...new Set([...c.bench.filter(id => inSq.has(id) && !inXI.has(id)), ...sq.filter(p => !inXI.has(p.id)).map(p => p.id)])];
        L = { formation: `${cnt('D')}-${cnt('M')}-${cnt('F')}`, xi, bench, captain: inXI.has(c.captain) ? c.captain : L.captain };
      }
    }
    // o teu onze avaliado da mesma forma (com as trocas ao intervalo)
    const mine = custom ? cached('mine|' + sqKey(sq) + JSON.stringify(L), () => UCLModel.plan(sq, { start: L, fixed: true })) : best;
    return { L, best, custom, mine };
  }
  const total = L => L.xi.reduce((s, id) => s + U.byId[id].pts, 0) + (U.byId[L.captain]?.pts || 0);

  // O que fazer durante a jornada: trocas no intervalo entre dias e mudança de capitão
  function planHtml(P, L) {
    const { fmt, esc } = A();
    if (P.noSubs) return `<div class="card"><h2>Plano da jornada</h2><p class="note">${P.nDays < 2 ? 'Todos os teus jogadores jogam no mesmo dia' : 'Nesta jornada não há trocas a meio'}: o onze no fecho é o que conta (com substituições automáticas para quem não jogar).</p></div>`;
    const d0 = day(new Date(P.days[0])), d1 = day(new Date(P.days[1]));
    const first = Object.values(U.proj.games).filter(g => new Date(g.ts).toDateString() === P.days[1]).map(g => g.ts);
    const t1 = first.length ? Math.min(...first) : null;
    const cap = U.byId[L.captain], capDay = P.dayOf(L.captain);
    const benchLater = L.bench.map(id => U.byId[id]).filter(p => P.dayOf(p.id) > 0).map(p => ({ p, v: p.pPlay > 0 ? p.pts / p.pPlay : 0 })).sort((a, b) => b.v - a.v);
    let cs = null; if (capDay === 0) for (const id of L.xi) { const p = U.byId[id]; const v = p.pPlay > 0 ? p.pts / p.pPlay : 0; if (P.dayOf(id) > 0 && (!cs || v > cs.v)) cs = { p, v }; }
    const xiDay = k => L.xi.map(id => U.byId[id]).filter(p => P.dayOf(p.id) === k);
    return `<div class="card"><h2>Plano da jornada <span class="sub">contam os 11 que acabam a jornada no onze</span></h2>
      <div class="list">
        <div class="li"><span class="tag ok">1</span><div class="grow"><b>Até ao fecho</b><span>Guarda este onze com o capitão <b>${esc(cap.name)}</b>. Jogam ${d0}: ${xiDay(0).map(p => esc(p.name)).join(', ') || '–'}${xiDay(1).length ? ` · ${d1}: ${xiDay(1).map(p => esc(p.name)).join(', ')}` : ''}.</span></div></div>
        ${benchLater.length ? `<div class="li"><span class="tag ok">2</span><div class="grow"><b>Depois dos jogos de ${d0}${t1 ? ` (até às ${hour(t1)} de ${d1})` : ''}</b>
          <span>Espera pelos onzes iniciais de ${d1} (saem 1 h antes) e faz até 4 trocas: um suplente que seja <b>titular</b> entra para o lugar do titular que fez menos pontos, se esse fez menos do que o valor indicado:</span>
          <span>${benchLater.map(({ p, v }) => `<b>${esc(p.name)}</b> (${POSN[p.pos]}) entra se alguém fez menos de <b>${Math.max(1, Math.round(v))}</b>`).join(' · ')}</span>
          <span class="muted">GR só troca com GR; o onze tem de ficar com ≥3 DEF, ≥2 MED e ≥1 AV. Quem sai fica com 0. Se um titular teu de ${d1} ficar no banco da equipa dele, tira-o também.</span></div></div>` : ''}
        ${cs ? `<div class="li"><span class="tag ok">3</span><div class="grow"><b>Capitão</b><span>Se o ${esc(cap.name)} fizer menos de <b>${Math.round(cs.v)}</b> pts, passa a braçadeira ao <b>${esc(cs.p.name)}</b> (${day(cs.p.ts)}, se for titular). Não dá para voltar atrás.</span></div></div>` : ''}
      </div>
      <p class="note">Esperado com estas trocas <b>${fmt(P.ev)}</b> pts · sem mexer (só substituições automáticas) ${fmt(P.evAuto)} · ${P.nDays} dias de jogos no teu plantel.
      Por isso o onze começa com quem joga no 1.º dia e guarda no banco bons jogadores do 2.º: dá para trocar quem correr mal.</p></div>`;
  }

  function renderOnze() {
    const el = $('#onze'), { fmt, pct, esc } = A();
    if (!U.data) { el.innerHTML = noData(); return; }
    const sq = squadP();
    if (sq.length < 15) { el.innerHTML = empty(`O teu plantel da Champions tem ${sq.length} de 15 jogadores.<br>Adiciona-os no separador <b>Plantel</b> (2 GR, 5 DEF, 5 MED, 3 AV).`); return; }
    const r = lineupOf(sq); if (!r) { el.innerHTML = empty('Plantel incompleto para formar um onze válido.'); return; }
    const { L, best, custom, mine } = r;
    const tot = mine.ev, bestTot = best.ev, diff = tot - bestTot;
    saveSnapshot(L, best, tot);
    const inXI = new Set(L.xi), xiP = L.xi.map(id => U.byId[id]);
    const cap = U.byId[L.captain];
    const riskCls = p => (p.pPlay < 0.4 ? 'out' : p.pPlay < 0.75 ? 'risk' : '');
    const last = p => (p.name.split(' ').length > 1 && p.short ? p.short : p.name);
    const optLabel = p => `${esc(p.name)} · ${fmt(p.pts)} pts · ${pct(p.pPlay)} joga · ${day(p.ts)}`;
    const token = p => {
      const opts = sq.filter(q => q.pos === p.pos).sort((a, b) => b.pts - a.pts)
        .map(q => `<option value="${q.id}" ${q.id === p.id ? 'selected' : ''}>${optLabel(q)}${inXI.has(q.id) && q.id !== p.id ? ' (no onze)' : ''}</option>`).join('');
      const isCap = p.id === L.captain;
      return `<div class="tok" title="${esc(p.name)} · ${esc(p.team)} ${esc(p.opp)} · ${day(p.ts)} ${hour(p.ts)} · ${pct(p.pPlay)} de jogar · clica para trocar">
        <div class="shirt ${riskCls(p)}" style="--c:var(--${p.pos})">${POSN[p.pos]}${isCap ? '<span class="cap">C</span>' : ''}</div>
        <div class="nm">${esc(last(p))}</div><div class="op">${esc(p.team)} ${esc(p.opp)}</div>
        <div class="pt">${fmt(isCap ? 2 * p.pts : p.pts)}${isCap ? ' ×2' : ''}</div>
        <select class="slotSel" data-old="${p.id}" aria-label="Trocar ${esc(p.name)}">${opts}</select></div>`;
    };
    const lanes = ['F', 'M', 'D', 'G'].map(pos => xiP.filter(p => p.pos === pos));
    const benchP = L.bench.map(id => U.byId[id]);
    const bslot = (p, i) => `<div class="bslot" title="Suplente ${i + 1}: ${esc(p.name)}"><span class="n" style="background:var(--${p.pos});color:#fff">${i + 1}</span>
      <div class="t"><b>${esc(p.name)}</b><span>${POSN[p.pos]} · ${esc(p.team)} ${esc(p.opp)} · ${day(p.ts)} · ${fmt(p.pts)} pts</span></div>
      ${i > 0 && p.pos !== 'G' && benchP[i - 1].pos !== 'G' ? `<button class="x up" data-i="${i}" title="Subir na prioridade" style="margin-left:auto">↑</button>` : ''}</div>`;
    const alerts = sq.filter(p => p.pPlay < 0.6);
    const capOpts = xiP.slice().sort((a, b) => b.pts - a.pts);
    el.innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="l">Pontos esperados</div><div class="v">${fmt(tot)}</div><div class="s">jornada ${U.data.meta.md} · com as trocas ao intervalo e o capitão ×2</div></div>
        <div class="kpi"><div class="l">${custom ? 'Diferença para o plano do modelo' : 'Sem mexer durante a jornada'}</div>
          <div class="v ${custom ? (diff >= -0.05 ? 'good' : 'bad') : ''}">${custom ? (diff >= 0 ? '+' : '') + fmt(diff) : fmt(mine.evAuto)}</div><div class="s">${custom ? 'plano do modelo: ' + fmt(bestTot) : 'só com substituições automáticas'}</div></div>
        <div class="kpi"><div class="l">Capitão</div><div class="v" style="font-size:19px">${esc(cap?.name || '–')}</div><div class="s">${cap ? esc(cap.team + ' ' + cap.opp) + ' · ' + day(cap.ts) + ' · ' + fmt(2 * cap.pts) + ' pts' : ''}</div></div>
        <div class="kpi"><div class="l">Plantel</div><div class="v">${m1(sq.reduce((s, p) => s + p.price, 0))}</div><div class="s">saldo ${m1(st().bank)} · ${st().freeT} transferência${st().freeT === 1 ? '' : 's'} grátis</div></div>
      </div>
      ${AnaliseUI.card('ucl', U.data.meta.md, { base: id => U.baseById?.[id] || U.byId[id] })}
      <div class="grid2">
        <div class="card">
          <div class="pitch-head">
            <span class="chip" title="Não há tática fixa: muda com as substituições (1 GR, ≥3 DEF, ≥2 MED, ≥1 AV)">começa em ${esc(L.formation)}</span>
            <div class="row">${custom ? '<button class="btn primary" id="uResetXI">↺ Repor plano do modelo</button>' : '<span class="note">Clica num jogador para o trocar</span>'}
              <button class="btn" id="uCmpBtn" aria-pressed="${U.compare}">${U.compare ? '✕ Fechar comparação' : '⚖ Comparar com o melhor da Champions'}</button></div>
          </div>
          <div class="field"><div class="mid"></div><div class="circle"></div>
            <div class="lineup">${lanes.map(l => `<div class="lane">${l.map(token).join('')}</div>`).join('')}</div></div>
          <h2 style="margin:16px 0 0">Suplentes <span class="sub">os do 2.º dia são para trocar no intervalo; a ordem só conta nas substituições automáticas (se não fizeres trocas)</span></h2>
          <div class="bench">${benchP.map(bslot).join('')}</div>
        </div>
        <div>
          ${planHtml(mine, L)}
          <div class="card"><h2>Capitão</h2>
            <div class="list"><label class="coach"><span class="ic">C</span><div><b>${esc(cap?.name || '')}</b><div class="note">Conta a dobrar · clica para mudar</div></div>
              <select id="uCapSel">${capOpts.map(p => `<option value="${p.id}" ${p.id === L.captain ? 'selected' : ''}>${optLabel(p)}</option>`).join('')}</select></label></div>
            <h2 style="margin:16px 0 8px">Melhores capitães <span class="sub">do teu onze</span></h2>
            <div class="list">${capOpts.slice(0, 4).map(p => `<div class="li">${A().posTag(p.pos)}<div class="grow"><b>${esc(p.name)}</b><span>${esc(p.team)} ${esc(p.opp)} · ${day(p.ts)} ${hour(p.ts)} · P(golo) ${pct(p.Pg)}</span></div><span class="pts ${p.id === L.captain ? 'hi' : ''}">${fmt(2 * p.pts)}</span></div>`).join('')}</div>
          </div>
          <div class="card"><h2>Alertas do plantel</h2>
            ${alerts.length ? `<div class="list">${alerts.map(p => `<div class="li">${A().posTag(p.pos)}<div class="grow"><b>${esc(p.name)}</b><span class="${p.pPlay < 0.2 ? 'bad' : 'warn'}">${p.status ? esc(p.status) + ' · ' : ''}${pct(p.pPlay)} de jogar · últimos jogos ${p.last.join('/')}'</span></div></div>`).join('')}</div>` : '<p class="muted">Sem alertas: todos os jogadores devem jogar.</p>'}
          </div>
        </div>
      </div>
      ${onzeSuggestHtml(sq)}
      ${U.compare ? compareHtml(sq) : ''}
      <div class="card"><h2>Plantel completo <span class="sub">pontos esperados nesta jornada</span></h2>${table(sq.sort((a, b) => 'GDMF'.indexOf(a.pos) - 'GDMF'.indexOf(b.pos) || b.pts - a.pts))}</div>`;
    AnaliseUI.bind(el, recompute);
    const commit = nl => { put('lineup', { ...nl, stamp: U.data.meta.created }); renderOnze(); };
    const cur = () => ({ ...L, xi: [...L.xi], bench: [...L.bench] });
    el.querySelectorAll('.slotSel').forEach(s => s.onchange = () => {
      const nl = cur(), oldId = +s.dataset.old, newId = +s.value, iOld = nl.xi.indexOf(oldId), iNew = nl.xi.indexOf(newId);
      if (iNew >= 0) return renderOnze();
      nl.xi[iOld] = newId; const b = nl.bench.indexOf(newId); if (b >= 0) nl.bench[b] = oldId;
      if (nl.captain === oldId) nl.captain = newId;
      commit(nl); });
    el.querySelectorAll('.up').forEach(b => b.onclick = () => { const nl = cur(), i = +b.dataset.i; [nl.bench[i - 1], nl.bench[i]] = [nl.bench[i], nl.bench[i - 1]]; commit(nl); });
    $('#uCapSel').onchange = e => { const nl = cur(); nl.captain = +e.target.value; commit(nl); };
    const rb = $('#uResetXI'); if (rb) rb.onclick = () => { put('lineup', null); renderOnze(); };
    $('#uCmpBtn').onclick = () => { U.compare = !U.compare; renderOnze(); };
  }

  // Guarda o onze como a aposta da jornada (até ao fecho), com o onze do modelo para comparar
  const altOf = P => ({ formation: P.formation, xi: P.xi.map(p => p.id), bench: P.bench.map(p => p.id), captain: P.captain.id, exp: +P.ev.toFixed(2) });
  function saveSnapshot(L, best, tot) {
    const md = U.data.meta.md, close = deadlineMs(); if (!close || new Date(U.data.meta.created) >= close || Date.now() >= close) return;
    const pl = id => { const p = U.byId[id]; return { id, n: p.name, t: p.team, pos: p.pos, pts: +p.pts.toFixed(2) }; };
    const h = A().ls.get('ucl.history', {}), old = h[md];
    const snap = { md, close, xi: L.xi.map(pl), bench: L.bench.map(pl), captain: L.captain, exp: +tot.toFixed(2),
      alt: altOf(best) };
    // com a análise da IA: alt = plano só com o modelo, altIA = plano com as correções
    if (U.baseById) { const sq = st().squad.map(id => U.baseById[id]).filter(Boolean); snap.alt = altOf(cached('planBase|' + sqKey(sq), () => UCLModel.plan(sq))); snap.altIA = altOf(best); }
    // league = melhor plantel que o modelo escolhe sem limite de orçamento (como no Limitless), jogado com as mesmas regras
    snap.league = cached(`league|${U.data.meta.created}|${JSON.stringify(st().avail)}`, () => {
      const P = UCLModel.plan(UCLModel.buildSquad((U.projBase || U.proj).players, 999, 3).squad);
      return { ...altOf(P), pts: Object.fromEntries([...P.xi, ...P.bench].map(p => [p.id, +p.pts.toFixed(2)])) };
    });
    if (old && JSON.stringify({ ...old, official: undefined }) === JSON.stringify(snap)) return;
    h[md] = { ...snap, official: old?.official ?? null }; put('history', h);
  }

  // Pontos reais de uma jornada já jogada, pelo ficheiro da UEFA: onze guardado + substituições automáticas
  // (as substituições manuais entre dias não se sabem → o "Oficial" é o que conta)
  function realOf(md, xiIds, benchIds, captain) {
    const rec = id => (U.data?.hist[id] || []).find(x => x.md === md);
    if (!U.data || !xiIds.some(id => rec(id))) return null;
    const pos = id => U.data.players.find(p => p.id === id)?.pos;
    const xi = [...xiIds], used = new Set(), cnt = (a, k) => a.filter(id => pos(id) === k).length;
    for (let i = 0; i < xi.length; i++) {
      if ((rec(xi[i])?.min || 0) > 0) continue;
      const s = benchIds.find(b => !used.has(b) && (rec(b)?.min || 0) > 0 && (pos(xi[i]) === 'G') === (pos(b) === 'G')
        && (() => { const t = xi.map((x, k) => (k === i ? b : x)); return cnt(t, 'G') === 1 && cnt(t, 'D') >= 3 && cnt(t, 'M') >= 2 && cnt(t, 'F') >= 1; })());
      if (s) { used.add(s); xi[i] = s; }
    }
    const pts = id => rec(id)?.pts ?? 0;
    return xi.reduce((a, id) => a + pts(id), 0) + (xi.includes(captain) ? pts(captain) : 0);
  }

  // Pontos reais do plano do modelo numa jornada guardada, com as trocas ao intervalo e o capitão (como nas jornadas simuladas).
  // As decisões usam os pontos esperados da fotografia; a probabilidade de jogar é reconstruída só com os jogos anteriores.
  function planReal(h, alt) {
    if (!U.data) return null;
    const md = h.md, rec = id => (U.data.hist[id] || []).find(x => x.md === md);
    if (!alt.xi.some(id => rec(id))) return null;
    return cached(`planReal|${md}|${U.data.meta.created}|${alt.xi.join()}|${alt.captain}`, () => {
      const hist = {}; for (const [id, l] of Object.entries(U.data.hist)) hist[id] = l.filter(x => x.md < md);
      const players = U.data.players.map(p => ({ ...p, status: '', trained: '' }));
      const by = Object.fromEntries(UCLModel.project({ meta: { ...U.data.meta, md }, fixtures: U.data.fixtures, players, hist }, null).players.map(p => [p.id, p]));
      const snap = { ...Object.fromEntries([...h.xi, ...h.bench].map(p => [p.id, p.pts])), ...alt.pts };
      const ids = [...new Set([...alt.xi, ...(alt.bench || []), ...Object.keys(snap).map(Number)])];
      if (ids.some(id => !by[id])) return realOf(md, alt.xi, alt.bench || [], alt.captain);
      const sq = ids.map(id => ({ ...by[id], pts: snap[id] ?? by[id].pts }));
      const rest = sq.filter(p => !alt.xi.includes(p.id));
      const bench = alt.bench?.length ? alt.bench : [...rest.filter(p => p.pos === 'G'), ...rest.filter(p => p.pos !== 'G').sort((a, b) => b.pts - a.pts)].map(p => p.id);
      return UCLModel.realize(sq, { xi: alt.xi, bench, captain: alt.captain }, rec);
    });
  }

  function renderHistorico() {
    const el = $('#historico'), { fmt, esc, posTag } = A();
    const H = Object.values(st().history).sort((a, b) => b.md - a.md);
    if (!H.length) { el.innerHTML = empty('Ainda sem jornadas guardadas. O teu onze fica guardado sozinho antes do fecho de cada jornada.'); return; }
    const rows = H.map(h => {
      const calc = h.real ?? realOf(h.md, h.xi.map(p => p.id), h.bench.map(p => p.id), h.captain);
      const altReal = h.alt ? (h.alt.real ?? planReal(h, h.alt)) : null;
      const iaReal = h.altIA ? planReal(h, h.altIA) : null;
      const lg = h.league || window.LEAGUE_SEED?.ucl?.[h.md] || null, lgReal = lg ? (lg.real ?? planReal(h, lg)) : null;
      return { h, real: h.official ?? calc, altReal, iaReal, lg, lgReal };
    });
    const showLg = A().ls.get('histLeague', false), { thI } = A();
    const anyIA = rows.some(r => r.h.altIA), showIA = anyIA && A().ls.get('histIA', false);
    const done = rows.filter(r => r.real != null), sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
    const withAlt = done.filter(r => r.altReal != null);
    const sg = d => (d > 0 ? '+' : '') + fmt(d, Number.isInteger(d) ? 0 : 1);
    const tag = d => (d == null ? '–' : `<span class="tag ${d >= 0 ? 'ok' : 'no'}">${sg(d)}</span>`);
    const star = h => (h.sim ? '<sup class="muted">*</sup>' : '');
    const nameOf = id => { for (const h of H) for (const p of [...h.xi, ...h.bench]) if (p.id === id) return p.n; return U.byId[id]?.name || U.data?.players.find(p => p.id === id)?.name || '#' + id; };
    const detail = ({ h, lg, lgReal }) => {
      const subs = (h.subs || []).map(([o, i]) => `${esc(nameOf(o))} → ${esc(nameOf(i))}`);
      const a = h.alt, mine = new Set(h.xi.map(p => p.id));
      const out = a ? h.xi.filter(p => !a.xi.includes(p.id)).map(p => esc(p.n)) : [], inn = a ? a.xi.filter(id => !mine.has(id)).map(id => esc(nameOf(id))) : [];
      return `<table><tr><th>Pos.</th><th>Jogador (onze no fecho)</th><th class="num">Esperado</th><th class="num">Real</th></tr>
        ${h.xi.slice().sort((x, y) => 'GDMF'.indexOf(x.pos) - 'GDMF'.indexOf(y.pos)).map(p => `<tr><td>${posTag(p.pos)}</td><td>${esc(p.n)}${p.id === h.captain ? ' <span class="tag ok">C ×2</span>' : ''} <span class="muted">${esc(p.t)}</span></td>
          <td class="num">${fmt(p.pts * (p.id === h.captain ? 2 : 1))}</td><td class="num">${p.real == null ? '–' : p.real * (p.id === h.captain ? 2 : 1)}</td></tr>`).join('')}</table>
        <p class="note">Banco: ${h.bench.map(p => `${esc(p.n)} (${p.real ?? '–'})`).join(' · ')}${subs.length ? `<br>Substituições durante a jornada: ${subs.join(' · ')}` : ''}</p>
        ${a ? `<p class="note"><b>Plano do modelo</b> (começa em ${esc(a.formation)}, capitão ${esc(nameOf(a.captain))}): esperado ${fmt(a.exp)}${a.real != null ? `, real <b>${a.real}</b>` : ''}${a.autoSubs?.length ? ` (substituições automáticas: ${a.autoSubs.map(esc).join(', ')})` : ''}.
          ${out.length ? `Mudava: sai ${out.join(', ')} · entra ${inn.join(', ')}.` : 'Os mesmos 11.'}</p>` : ''}
        ${showLg && lg ? `<p class="note"><b>Melhor plantel sem orçamento</b> (começa em ${esc(lg.formation)}, capitão ${esc(nameOf(lg.captain))}): esperado ${fmt(lg.exp)}${lgReal != null ? `, real <b>${lgReal}</b>` : ''}. ${lg.xi.map(id => esc(nameOf(id))).join(', ')}.</p>` : ''}`;
    };
    el.innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="l">Os teus pontos</div><div class="v">${done.length ? sum(done, r => r.real) : '–'}</div><div class="s">${done.length} jornada${done.length === 1 ? '' : 's'}${done.length ? ' · ' + fmt(sum(done, r => r.real) / done.length) + ' por jornada' : ''}</div></div>
        <div class="kpi"><div class="l">Esperado (o teu onze)</div><div class="v">${done.length ? fmt(sum(done, r => r.h.exp)) : '–'}</div><div class="s">${done.length ? 'real − esperado: ' + sg(sum(done, r => r.real) - sum(done, r => r.h.exp)) : ''}</div></div>
        <div class="kpi"><div class="l">Plano do modelo (real)</div><div class="v">${withAlt.length ? sum(withAlt, r => r.altReal) : '–'}</div><div class="s">${withAlt.length ? `vs. os teus ${sum(withAlt, r => r.real)}: ${sg(sum(withAlt, r => r.altReal) - sum(withAlt, r => r.real))}` : ''}</div></div>
        <div class="kpi"><div class="l">Esperado do modelo</div><div class="v">${withAlt.length ? fmt(sum(withAlt, r => r.h.alt.exp)) : '–'}</div><div class="s">no papel, o onze do modelo</div></div>
      </div>
      <div class="card"><h2>Histórico da Champions</h2>
        <p class="note">O onze fica guardado sozinho até ao fecho, com o onze que o modelo escolheria. "Real" = pontos da UEFA: o esperado é o do onze no fecho jogado com as trocas ao intervalo (as regras do plano). Em <b>Oficial</b> escreve o total da jornada.
        ${H.some(h => h.sim) ? '<br><sup>*</sup> simulado: modelo atual com os dados e as odds da véspera; o plano do modelo usa os mesmos 15 jogadores (onze inicial, trocas ao intervalo pelas regras do plano e capitão).' : ''}</p>
        <p><label class="chip" style="cursor:pointer;padding:6px 12px"><input type="checkbox" id="uLeague" ${showLg ? 'checked' : ''}> Mostrar o melhor plantel sem limite de orçamento</label>
          ${anyIA ? `<label class="chip" style="cursor:pointer;padding:6px 12px"><input type="checkbox" id="uIA" ${showIA ? 'checked' : ''}> Mostrar Modelo + IA</label>` : ''}</p>
        <div style="overflow-x:auto"><table><tr>${thI('Jornada', 'A jornada da Champions. Clica no resumo da jornada, em baixo, para ver os jogadores.', '')}
          ${thI('Esperado', 'Pontos que o modelo previa para o teu onze no fecho, já com as trocas ao intervalo, as substituições automáticas e o capitão a dobrar, pelas regras do plano.')}
          ${thI('Real', 'Pontos que fizeste. Conta o Oficial, se o escreveste, com as tuas substituições. Sem Oficial, é o onze no fecho com as substituições automáticas.')}
          ${thI('Real − esp.', 'Real menos Esperado. Verde: fizeste mais do que o previsto. Vermelho: fizeste menos.')}
          ${thI('Modelo esp.', 'Pontos esperados do melhor onze que o modelo escolhe do teu plantel, com as trocas ao intervalo e o capitão.')}
          ${thI('Modelo real', 'Pontos que o onze do modelo teria feito de verdade, decidindo as trocas e o capitão pelas regras do plano.')}
          ${thI('Modelo − teu', 'Modelo real menos Real. Verde: o modelo teria feito mais do que tu. Vermelho: fizeste mais do que o modelo.')}
          ${showIA ? thI('Modelo + IA esp.', 'Como o Modelo esp., mas com as correções da análise da IA à probabilidade de jogar.') + thI('Modelo + IA real', 'Pontos que o plano com as correções da IA teria feito de verdade.') + thI('IA − modelo', 'Modelo + IA real menos Modelo real. Verde: as correções da IA ajudaram. Vermelho: pioraram.') : ''}
          ${showLg ? thI('Liga esp.', 'Pontos esperados do melhor plantel de 15 que o modelo escolhe entre todos os jogadores, sem limite de orçamento e com máximo de 3 por clube, como no Limitless. O asterisco indica uma simulação feita depois, com os dados da véspera.') + thI('Liga real', 'Pontos que esse plantel teria feito de verdade, com as trocas ao intervalo. É o melhor na previsão, não o melhor possível depois de saber os resultados.') : ''}
          ${thI('Oficial', 'Pontos que a UEFA te atribuiu. Escreve-os aqui: passam a contar como o teu Real.')}</tr>
        ${rows.map(({ h, real, altReal, iaReal, lg, lgReal }) => `<tr><td><b>J${h.md}</b></td><td class="num">${fmt(h.exp)}${star(h)}${h.expFinal != null ? `<br><span class="muted" title="esperado do onze no fim da jornada, depois das tuas substituições">final ${fmt(h.expFinal)}</span>` : ''}</td>
          <td class="num">${real != null ? `<span class="pts hi">${real}</span>` : `<span class="tag q">${Date.now() < h.close ? 'por jogar' : 'atualiza a UEFA'}</span>`}</td>
          <td class="num">${tag(real != null ? real - h.exp : null)}</td><td class="num">${h.alt ? fmt(h.alt.exp) + star(h) : '–'}</td><td class="num">${altReal ?? '–'}</td>
          <td class="num">${tag(real != null && altReal != null ? altReal - real : null)}</td>
          ${showIA ? `<td class="num">${h.altIA ? fmt(h.altIA.exp) : '–'}</td><td class="num">${iaReal ?? '–'}</td><td class="num">${tag(iaReal != null && altReal != null ? iaReal - altReal : null)}</td>` : ''}
          ${showLg ? `<td class="num">${lg ? fmt(lg.exp) + (h.league ? '' : '<sup class="muted">*</sup>') : '–'}</td><td class="num">${lgReal ?? '–'}</td>` : ''}
          <td class="num"><input class="uOff" data-md="${h.md}" type="number" step="1" value="${h.official ?? ''}" placeholder="–" style="width:64px"></td></tr>`).join('')}
        </table></div></div>
      ${rows.map(r => `<details class="card"><summary><b>J${r.h.md}</b> · esperado ${fmt(r.h.exp)}${r.h.sim ? ' (simulado)' : ''}${r.real != null ? ` · real ${r.real}` : ''}${r.altReal != null ? ` · modelo ${r.altReal}` : ''}</summary>${detail(r)}</details>`).join('')}`;
    $('#uLeague').onchange = e => { A().ls.set('histLeague', e.target.checked); renderHistorico(); };
    const uIA = $('#uIA'); if (uIA) uIA.onchange = e => { A().ls.set('histIA', e.target.checked); renderHistorico(); };
    el.querySelectorAll('.uOff').forEach(i => i.onchange = () => {
      const h = A().ls.get('ucl.history', {}), md = +i.dataset.md;
      h[md] = { ...(st().history[md]), official: i.value === '' ? null : Math.round(+i.value) }; put('history', h); renderHistorico();
    });
  }

  // melhor onze possível da Champions, respeitando 100 M€ e 3 por clube (escolha gulosa por pontos/preço)
  function compareHtml(sq) {
    const { fmt, esc, posTag } = A();
    const pool = U.proj.players.filter(p => p.pPlay > 0.3).sort((a, b) => b.pts - a.pts);
    const lb = UCLModel.bestXI(pool.slice(0, 200).reduce((acc, p) => { const n = acc.filter(q => q.pos === p.pos).length; if (n < UCLModel.NEED[p.pos] + 2) acc.push(p); return acc; }, []));
    const mine = new Set(sq.map(p => p.id));
    return `<div class="card"><h2>Melhor onze da Champions <span class="sub">qualquer jogador, sem orçamento</span></h2>
      <p class="note">Esperado ${fmt(lb.total)} pts (o teu: ${fmt(total(lineupOf(sq).L))}). ✓ = já tens.</p>
      <div class="list">${lb.xi.map(p => `<div class="li">${posTag(p.pos)}<div class="grow"><b>${esc(p.name)}</b>${mine.has(p.id) ? ' <span class="good">✓</span>' : ''}<span>${esc(p.team)} ${esc(p.opp)} · ${m1(p.price)}</span></div><span class="pts ${p.id === lb.captain.id ? 'hi' : ''}">${fmt(p.pts)}${p.id === lb.captain.id ? ' ©' : ''}</span></div>`).join('')}</div></div>`;
  }

  // ---------- tabela de jogadores ----------
  function table(list, { add = false } = {}) {
    const { fmt, pct, esc, posTag } = A();
    const mine = new Set(st().squad);
    return `<div style="overflow-x:auto"><table><tr><th>Pos</th><th>Jogador</th><th>Jogo</th><th class="num">Pts esp.</th><th class="num" title="probabilidade de jogar">Joga</th><th class="num">P(golo)</th><th class="num">P(assist.)</th><th class="num" title="probabilidade de ter os pontos de baliza a zero (60'+ sem sofrer)">P(baliza 0)</th><th class="num" title="pontos por jogo nos últimos 3 jogos em que jogou">Forma</th><th class="num" title="golos esperados por 90' na Champions (Sofascore)">xG/90</th><th class="num" title="assistências esperadas por 90' na Champions (Sofascore)">xA/90</th><th class="num" title="pontos por jogo na Champions (jogos)">Méd. real</th><th class="num" title="pontos totais na Champions">Total</th><th class="num" title="% de equipas da UEFA Fantasy que o escolheram">Escolhido</th><th class="num">Preço</th>${add ? '<th></th>' : ''}</tr>
      ${list.map(p => `<tr><td>${posTag(p.pos)}</td><td><b>${esc(p.name)}</b>${p.status ? ` <span class="${p.pPlay < 0.2 ? 'bad' : 'warn'}">${esc(p.status)}</span>` : ''}</td>
        <td>${esc(p.team)} <span class="muted">${esc(p.opp)} · ${day(p.ts)}</span></td><td class="num"><span class="pts ${p.pts >= 5 ? 'hi' : ''}">${fmt(p.pts)}</span></td>
        <td class="num">${pct(p.pPlay)}</td><td class="num">${pct(p.Pg)}</td><td class="num">${pct(p.Pa)}</td><td class="num">${p.pos === 'F' ? '–' : pct(p.pCS)}</td>
        <td class="num">${p.form == null ? '–' : fmt(p.form)}</td><td class="num">${p.xg90 == null ? '–' : fmt(p.xg90, 2)}</td><td class="num">${p.xa90 == null ? '–' : fmt(p.xa90, 2)}</td>
        <td class="num">${p.avgPts == null ? '–' : fmt(p.avgPts)}<span class="muted"> (${p.games})</span></td><td class="num">${p.tot ?? '–'}</td><td class="num">${p.sel == null ? '–' : fmt(p.sel, 0) + '%'}</td><td class="num">${m1(p.price)}</td>
        ${add ? `<td>${mine.has(p.id) ? '<span class="good">✓</span>' : `<button class="btn uAdd" data-id="${p.id}">+</button>`}</td>` : ''}</tr>`).join('')}</table></div>`;
  }

  // ---------- transferências ----------
  function renderTrocas() {
    const el = $('#trocas'), { fmt, esc, posTag } = A();
    if (!U.data) { el.innerHTML = noData(); return; }
    const sq = squadP(), s = st();
    if (sq.length < 15) { el.innerHTML = empty('Completa primeiro o plantel (15 jogadores) no separador <b>Plantel</b>.'); return; }
    // ganho medido na jornada simulada (com as trocas ao intervalo); leva alguns segundos → calcula depois de mostrar
    const key = 'tr|' + sqKey(sq) + '|' + s.bank;
    if (!planCache.has(key)) {
      el.innerHTML = '<div class="card empty"><span class="ic">⏳</span>A simular as transferências (com as trocas entre dias)…</div>';
      if (!el.classList.contains('on')) return; // só quando o separador está aberto
      setTimeout(() => { cached(key, () => {
        const list = UCLModel.transfersPlan(U.proj.players, sq, +s.bank || 0);
        // melhor par de transferências (a 2.ª calculada depois da 1.ª)
        const one = list[0]; let pair = null;
        if (one) { const two = UCLModel.transfersPlan(U.proj.players, sq.map(p => (p.id === one.out.id ? one.in : p)), (+s.bank || 0) - one.cost)[0]; if (two) pair = { a: one, b: two, gain: one.gain + two.gain }; }
        return { list, pair };
      }); renderTrocas(); }, 50);
      return;
    }
    const { list, pair } = planCache.get(key);
    const seen = new Set(), top = list.filter(t => { if (seen.has(t.out.id)) return false; seen.add(t.out.id); return t.gain > 0.05; }).slice(0, 8);
    const card = t => `<div class="swap"><div class="li">${posTag(t.out.pos)}<div class="grow"><span class="muted">Sai</span><b>${esc(t.out.name)}</b><span>${esc(t.out.team)} ${esc(t.out.opp)} · ${fmt(t.out.pts)} pts · ${m1(t.out.price)}</span></div></div>
      <div class="li">${posTag(t.in.pos)}<div class="grow"><span class="muted">Entra</span><b>${esc(t.in.name)}</b><span>${esc(t.in.team)} ${esc(t.in.opp)} · ${fmt(t.in.pts)} pts · ${m1(t.in.price)}</span></div><span class="pts hi">+${fmt(t.gain)}</span></div></div>`;
    el.innerHTML = `
      <div class="card"><div class="row" style="justify-content:space-between"><h2>Transferências <span class="sub">ganho = pontos esperados a mais nesta jornada, já com as trocas ao intervalo</span></h2>
        <div class="row"><label>Saldo <input type="number" step="0.1" class="small" id="uBank" value="${s.bank}"> M€</label>
        <label>Grátis <input type="number" step="1" min="0" max="5" class="small" id="uFree" value="${s.freeT}"></label></div></div>
        <p class="note">Fase de liga: 2 transferências grátis por jornada (só 1 passa para a seguinte); cada transferência a mais custa −4 pts. Máximo 3 jogadores por clube. Preço de venda = preço atual.</p>
        ${pair ? `<h2 style="margin-top:12px">Melhor par de transferências <span class="pts hi">+${fmt(pair.gain)}</span></h2><div class="swaps">${card(pair.a)}${card(pair.b)}</div>
          ${s.freeT < 2 ? `<p class="warn">Só tens ${s.freeT} grátis: a 2.ª custa −4 pts${pair.b.gain > 4 ? ', e mesmo assim compensa' : ', e não compensa'}.</p>` : ''}` : '<p class="muted">Sem transferências que melhorem o onze dentro do saldo.</p>'}
        <h2 style="margin-top:16px">Melhor troca para cada jogador</h2>
        <div class="swaps">${top.map(card).join('') || '<p class="muted">Nenhuma troca melhora o onze.</p>'}</div>
        <p class="note">Olha só para esta jornada. Antes de vender alguém pensa nas jornadas seguintes, e no teu plantel convém ter jogadores que joguem em dias diferentes.</p></div>`;
    $('#uBank').onchange = e => { put('bank', +e.target.value || 0); renderTrocas(); renderOnze(); };
    $('#uFree').onchange = e => { put('freeT', +e.target.value || 0); renderTrocas(); renderOnze(); };
  }

  // ---------- jogos ----------
  function renderJogos() {
    const el = $('#jogos'), { fmt, pct, esc } = A();
    if (!U.data) { el.innerHTML = noData(); return; }
    const gs = [...new Map(Object.values(U.proj.games).map(g => [g.id, g])).values()].sort((a, b) => a.ts - b.ts);
    const mine = squadP();
    el.innerHTML = `<div class="card"><h2 style="margin:0 0 12px">Jogos da jornada ${U.data.meta.md} <span class="sub note">barra: vitória casa · empate · vitória fora</span></h2>
      <div class="games">${gs.map(g => { const mineHere = mine.filter(p => p.teamId === g.home.id || p.teamId === g.away.id);
        return `<div class="game"><div class="row" style="justify-content:space-between"><b>${esc(g.home.name)} – ${esc(g.away.name)}</b><span class="muted">${day(g.ts)} ${hour(g.ts)}</span></div>
          <div class="prob"><i style="width:${g.pHome * 100}%;background:var(--good)"></i><i style="width:${g.pDraw * 100}%;background:var(--muted)"></i><i style="width:${g.pAway * 100}%;background:var(--bad)"></i></div>
          <div class="note">${pct(g.pHome)} · ${pct(g.pDraw)} · ${pct(g.pAway)} · golos esperados ${fmt(g.lh)}–${fmt(g.la)} · baliza a zero ${pct(Math.exp(-g.la))} / ${pct(Math.exp(-g.lh))} <span class="tag q">${g.src}</span></div>
          ${mineHere.length ? `<div class="note">Os teus: ${mineHere.map(p => esc(p.name)).join(', ')}</div>` : ''}</div>`; }).join('')}</div>
      ${gs.some(g => g.src !== 'odds') ? '<p class="note">"preços" = sem odds do Sofascore para esse jogo: a força das equipas vem dos preços dos jogadores na Fantasy. Atualiza o Sofascore para usar as odds.</p>' : ''}</div>
      ${teamsHtml(mine)}`;
  }
  // Equipas por probabilidade de baliza a zero (defesas e GR) e por golos esperados (ataque)
  function teamsHtml(mine) {
    const { fmt, pct, esc } = A();
    const T = Object.values(U.proj.games).map(g => ({ g, cs: Math.exp(-g.la_), gf: g.isHome ? g.lh : g.la, ga: g.la_, n: mine.filter(p => p.teamId === g.me.id).length }));
    const tbl = (list, hi) => `<table><tr><th>Equipa</th><th>Jogo</th><th class="num">P(baliza 0)</th><th class="num">Golos marcados</th><th class="num">Golos sofridos</th><th class="num">Vitória</th></tr>
      ${list.map(t => `<tr><td><b>${esc(t.g.me.name)}</b>${t.n ? ` <span class="tag ok">${t.n} teu${t.n > 1 ? 's' : ''}</span>` : ''}</td><td><span class="muted">${t.g.isHome ? 'vs' : '@'} ${esc(t.g.opp.name)} · ${day(t.g.ts)} ${hour(t.g.ts)}</span></td>
        <td class="num">${hi === 'cs' ? `<b>${pct(t.cs)}</b>` : pct(t.cs)}</td><td class="num">${hi === 'gf' ? `<b>${fmt(t.gf)}</b>` : fmt(t.gf)}</td><td class="num">${fmt(t.ga)}</td><td class="num">${pct(t.g.pw)}</td></tr>`).join('')}</table>`;
    return `<div class="grid2"><div class="card"><h2>Defesas: baliza a zero <span class="sub">GR e DEF ganham +4 (60'+), −1 por cada 2 sofridos</span></h2>
        <div style="overflow-x:auto">${tbl(T.slice().sort((a, b) => b.cs - a.cs).slice(0, 12), 'cs')}</div></div>
      <div class="card"><h2>Ataque: golos esperados <span class="sub">golo: AV +4, MED +5, DEF +6; assistência +3</span></h2>
        <div style="overflow-x:auto">${tbl(T.slice().sort((a, b) => b.gf - a.gf).slice(0, 12), 'gf')}</div></div></div>`;
  }

  // ---------- ranking ----------
  function renderRanking() {
    const el = $('#ranking'); if (!U.data) { el.innerHTML = noData(); return; }
    const r = U.rank ||= { pos: 'all', q: '', max: '', by: 'pts' };
    const SORT = { pts: ['Pts esp.', p => p.pts], pPlay: ['Joga', p => p.pPlay], Pg: ['P(golo)', p => p.Pg], pCS: ['P(baliza 0)', p => p.pCS], form: ['Forma', p => p.form ?? -9], xg90: ['xG/90', p => p.xg90 ?? -9], xa90: ['xA/90', p => p.xa90 ?? -9], tot: ['Pontos totais', p => p.tot ?? -9], sel: ['Escolhido %', p => p.sel ?? -9] };
    const { norm } = UCLModel;
    const list = U.proj.players.filter(p => (r.pos === 'all' || p.pos === r.pos) && (!r.q || norm(p.name + ' ' + p.team).includes(norm(r.q))) && (!r.max || p.price <= +r.max))
      .sort((a, b) => SORT[r.by || 'pts'][1](b) - SORT[r.by || 'pts'][1](a) || b.pts - a.pts).slice(0, 150);
    el.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between"><h2>Ranking da Champions <span class="sub">pontos esperados na jornada ${U.data.meta.md}</span></h2>
      <div class="row"><div class="seg">${['all', 'G', 'D', 'M', 'F'].map(k => `<button data-p="${k}" class="${r.pos === k ? 'on' : ''}">${k === 'all' ? 'Todos' : POSN[k]}</button>`).join('')}</div>
      <label>Ordenar <select id="uBy">${Object.entries(SORT).map(([k, [l]]) => `<option value="${k}" ${r.by === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <input id="uQ" placeholder="Procurar jogador/equipa" value="${A().esc(r.q)}"><label>Até <input id="uMax" type="number" step="0.5" class="small" value="${r.max}"> M€</label></div></div>
      ${table(list, { add: true })}</div>`;
    el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { r.pos = b.dataset.p; renderRanking(); });
    $('#uQ').onchange = e => { r.q = e.target.value; renderRanking(); };
    $('#uBy').onchange = e => { r.by = e.target.value; renderRanking(); };
    $('#uMax').onchange = e => { r.max = e.target.value; renderRanking(); };
    el.querySelectorAll('.uAdd').forEach(b => b.onclick = () => addPlayer(+b.dataset.id));
  }

  // ---------- plantel ----------
  function addPlayer(id) {
    const s = st(), p = U.byId[id] || U.data.players.find(x => x.id === id); if (!p) return;
    if (s.squad.includes(id)) return;
    if (s.squad.filter(x => (U.byId[x]?.pos) === p.pos).length >= UCLModel.NEED[p.pos]) { A().notice(`Já tens ${UCLModel.NEED[p.pos]} ${POSN[p.pos]} no plantel: remove um primeiro.`, 'err'); return; }
    put('squad', [...s.squad, id]); recompute();
  }
  // ---------- sugestões: plantel, jornada e jokers ----------
  // Os cálculos levam segundos: correm depois de mostrar a página e só com o separador Plantel aberto
  const busy = new Set();
  function later(key, f, tab = '#plantel', rerender = () => renderPlantel()) {
    if (planCache.has(key)) return planCache.get(key);
    if ($(tab).classList.contains('on') && !busy.has(key)) {
      busy.add(key);
      setTimeout(() => { try { cached(key, f); } finally { busy.delete(key); } rerender(); }, 60);
    }
    return null;
  }
  const wait = txt => `<div class="card empty"><span class="ic">⏳</span>${txt}</div>`;
  const sqValue = sq => sq.reduce((a, p) => a + p.price, 0);
  const evOf = sq => UCLModel.plan(sq, { n: 400, iters: 3 }).ev;

  // Opções da jornada: ficar, usar as transferências (grátis + as que aceitas a −4), Wildcard, Limitless
  function suggestion(sq, tab, rerender) {
    const s = st(), free = +s.freeT || 0, extra = +s.extraT || 0, bank = +s.bank || 0;
    return later(`sug|${sqKey(sq)}|${bank}|${free}|${extra}`, () => {
      const imp = UCLModel.improveSquad(U.proj.players, sq, bank, { maxT: free + extra, freeT: free });
      const wc = UCLModel.buildSquad(U.proj.players, sqValue(sq) + bank, 3), lim = UCLModel.buildSquad(U.proj.players, 999, 3);
      return { base: planOf(sq).ev, imp, wc: { ...wc, ev: evOf(wc.squad) }, lim: { ...lim, ev: evOf(lim.squad) } };
    }, tab, rerender);
  }
  // Resumo para "O meu onze": o que fazer antes do fecho
  function onzeSuggestHtml(sq) {
    const { fmt, esc } = A(), s = st();
    const g = suggestion(sq, '#onze', () => renderOnze());
    if (!g) return `<div class="card"><h2>Antes do fecho: transferências e jokers</h2><p class="muted">⏳ A simular as transferências…</p></div>`;
    const sp = planCache.get(seasonKey(sq)), mdNow = U.data.meta.md, chips = s.chips;
    const tag = x => `<span class="pts ${x >= 0.05 ? 'hi' : ''}">${x >= 0 ? '+' : ''}${fmt(x)}</span>`;
    const left = +s.bank - g.imp.moves.reduce((a, m) => a + m.cost, 0);
    return `<div class="card"><h2>Antes do fecho: transferências e jokers <span class="sub">${s.freeT} grátis${+s.extraT ? ` + até ${s.extraT} a −4` : ''} · saldo ${m1(s.bank)} · máx. 3 por clube</span></h2>
      <div class="list">
        ${g.imp.moves.length ? g.imp.moves.map((m, i) => `<div class="li">${A().posTag(m.in.pos)}<div class="grow"><b>${i + 1}. ${esc(m.out.name)} → ${esc(m.in.name)}</b><span>${esc(m.in.team)} ${esc(m.in.opp)} · ${day(m.in.ts)} · ${m1(m.out.price)} → ${m1(m.in.price)}${m.hit ? ' · <span class="bad">custa −4</span>' : ' · grátis'}</span></div>${tag(m.gain - m.hit)}</div>`).join('')
          : '<p class="muted">Nenhuma transferência compensa nesta jornada.</p>'}
      </div>
      <p class="note">Com ${g.imp.moves.length ? 'estas transferências' : 'o plantel atual'}: <b>${fmt(g.imp.ev)}</b> pts esperados (agora ${fmt(g.base)}, ${g.imp.ev - g.base >= 0 ? '+' : ''}${fmt(g.imp.ev - g.base)})${g.imp.moves.length ? ` · sobra ${m1(left)}` : ''}.
        ${!chips.wc ? `Wildcard ${fmt(g.wc.ev)} (${g.wc.ev - g.imp.ev >= 0 ? '+' : ''}${fmt(g.wc.ev - g.imp.ev)} nesta jornada${sp ? `; plano da época: melhor na J${chipPick(sp, chips).w?.md}, +${fmt(sp.bestW.wcGain)} até à J8` : ''}).` : ''}
        ${!chips.lim ? `Limitless ${fmt(g.lim.ev)} (${g.lim.ev - g.imp.ev >= 0 ? '+' : ''}${fmt(g.lim.ev - g.imp.ev)}${sp ? `; melhor na J${chipPick(sp, chips).l?.md}` : ''}).` : ''}
        Detalhes e "Usar este plantel" no separador <b>Plantel</b>.</p>
      ${sp && !chips.wc && sp.bestW.md === mdNow && sp.bestW.wcGain > 12 ? `<p>💡 <b>O plano da época recomenda usar o Wildcard nesta jornada.</b></p>` : ''}</div>`;
  }
  function suggestHtml(sq) {
    const { fmt, esc } = A(), s = st();
    if (sq.length < 15) return '';
    const g = suggestion(sq);
    const head = `<div class="row" style="justify-content:space-between"><h2>Sugestão da jornada ${U.data.meta.md} <span class="sub">pontos esperados com as trocas ao intervalo</span></h2>
      <div class="row"><label>Transferências grátis <input type="number" min="0" max="5" step="1" class="small" id="uFree2" value="${s.freeT}"></label>
      <label title="cada uma custa −4 pts; só se faz se ganhar mais do que isso">+ a −4 até <input type="number" min="0" max="5" step="1" class="small" id="uExtra" value="${s.extraT}"></label></div></div>`;
    if (!g) return `<div class="card">${head}${wait('A simular as transferências, o Wildcard e o Limitless…')}</div>`;
    const gain = x => `<span class="tag ${x >= 0.05 ? 'ok' : 'q'}">${x >= 0 ? '+' : ''}${fmt(x)}</span>`;
    const moves = g.imp.moves.length ? g.imp.moves.map(m => `${esc(m.out.name)} → <b>${esc(m.in.name)}</b> (${esc(m.in.team)}, ${m1(m.in.price)}) ${gain(m.gain)}${m.hit ? ' <span class="bad">−4</span>' : ''}`).join('<br>') : 'nenhuma compensa';
    const wcG = g.wc.ev - g.imp.ev, limG = g.lim.ev - g.imp.ev, chips = s.chips;
    const sp = planCache.get(seasonKey(sq));
    const pk = sp ? chipPick(sp, chips) : {};
    const wcNow = pk.w && pk.w.md === U.data.meta.md && pk.w.wcGain > 12;
    const limNow = pk.l && pk.l.md === U.data.meta.md && pk.l.limGain > 20;
    const verdict = wcNow ? `<b>Usa o Wildcard nesta jornada</b>: o plano da época dá +${fmt(pk.w.wcGain)} pts até à jornada 8 face a ficar com o plantel.`
      : limNow ? `<b>Esta é a melhor jornada para o Limitless</b> (+${fmt(pk.l.limGain)} pts).`
      : g.imp.moves.length ? `<b>Faz ${g.imp.moves.length === 1 ? 'a transferência' : `as ${g.imp.moves.length} transferências`}</b> e guarda os jokers${sp ? '' : ' (calcula o plano da época, em baixo, para saber quando os usar)'}.`
      : `Fica com o plantel e guarda os jokers${sp ? '' : ' (calcula o plano da época, em baixo)'}.`;
    const row = (label, ev, extraTxt, mode, used) => `<tr><td><b>${label}</b>${used ? ' <span class="tag q">já usado</span>' : ''}</td><td class="num">${fmt(ev)}</td><td class="num">${gain(ev - g.base)}</td><td>${extraTxt}</td><td>${mode && !used ? `<button class="btn uSee" data-m="${mode}">Ver plantel</button>` : ''}</td></tr>`;
    return `<div class="card">${head}
      <div style="overflow-x:auto"><table><tr><th>Opção</th><th class="num">Esperado</th><th class="num">vs ficar</th><th>O que muda</th><th></th></tr>
        ${row('Ficar com o plantel', g.base, '—', '')}
        ${row(`Transferências (${s.freeT} grátis${+s.extraT ? ` + até ${s.extraT} a −4` : ''})`, g.imp.ev, moves + (g.imp.hits ? `<br><span class="muted">já desconta −${g.imp.hits}</span>` : ''), 'imp')}
        ${row('Wildcard', g.wc.ev, `plantel novo com ${m1(sqValue(sq) + (+s.bank || 0))} (fica para as jornadas seguintes) · ${gain(wcG)} vs as transferências nesta jornada`, 'wc', chips.wc)}
        ${row('Limitless', g.lim.ev, `só nesta jornada, sem orçamento · ${gain(limG)} vs as transferências`, 'lim', chips.lim)}
      </table></div>
      <p style="margin-top:10px">💡 ${verdict}</p>
      <p class="note">O Wildcard paga-se ao longo de várias jornadas e o Limitless só numa: compara-os no plano da época. Jokers usados:
        <label><input type="checkbox" id="uChipWc" ${chips.wc ? 'checked' : ''}> Wildcard</label> <label><input type="checkbox" id="uChipLim" ${chips.lim ? 'checked' : ''}> Limitless</label></p></div>`;
  }

  // Plano dos jokers até à jornada 8 (as jornadas futuras usam a força das equipas pelos preços, sem odds)
  const seasonKey = sq => `season|${sqKey(sq)}|${st().bank}`;
  // melhores jornadas para cada joker, sem os dois na mesma jornada (o Wildcard escolhe primeiro: rende em várias)
  function chipPick(sp, chips) {
    const w = chips.wc ? null : sp.bestW;
    const rows = sp.rows.filter(r => !w || w.wcGain <= 12 || r.md !== w.md);
    const l = chips.lim ? null : rows.reduce((a, r) => (!a || r.limGain > a.limGain ? r : a), null);
    return { w, l };
  }
  function seasonHtml(sq) {
    const { fmt, esc } = A(), s = st(), key = seasonKey(sq);
    const sp = planCache.get(key) || (U.wantSeason ? later(key, () => UCLModel.seasonPlan(U.data, A().S.data?.ucl, sq.map(p => p.id), +s.bank || 0)) : null);
    const ko = `<p class="note"><b>Depois da fase de liga</b>: transferências ilimitadas antes da J9 (play-off) e da J11 (oitavos), 5 grátis antes dos quartos, das meias e da final, e 2-3 nas 2.as mãos (J10, J12, J14, J16); máximo por clube 4 → 5 → 6 → 8.
      Por isso o <b>Wildcard</b> rende sobretudo na fase de liga (só 2 grátis por jornada). O <b>Limitless</b> pode esperar por uma 2.ª mão das eliminatórias (poucas trocas grátis) ou pela final (até 8 por clube), se não houver uma jornada da fase de liga claramente melhor. Não se podem usar jokers nas J1, J9 e J11.</p>`;
    if (!sp) return `<div class="card"><div class="row" style="justify-content:space-between"><h2>Plano da época: quando usar os jokers</h2>
      <button class="btn primary" id="uSeason" ${U.wantSeason ? 'disabled' : ''}>${U.wantSeason ? '⏳ A calcular… (10-20 s)' : 'Calcular plano'}</button></div>
      <p class="note">Simula as jornadas que faltam da fase de liga com o teu plantel (com 2 transferências grátis por jornada), com o Wildcard em cada jornada e com o Limitless em cada jornada.</p>${ko}</div>`;
    const chips = s.chips, mdNow = U.data.meta.md, pk = chipPick(sp, chips);
    const recW = chips.wc ? 'Wildcard já usado.' : pk.w.wcGain > 12 ? `<b>Wildcard na jornada ${pk.w.md}</b>${pk.w.md === mdNow ? ' (já, nesta)' : ''}: +${fmt(pk.w.wcGain)} pts até à jornada 8.` : `Wildcard: nenhuma jornada da fase de liga ganha mais de 12 pts (máx. +${fmt(pk.w.wcGain)} na J${pk.w.md}); guarda-o para quando o plantel tiver muitos lesionados.`;
    const recL = chips.lim ? 'Limitless já usado.' : `<b>Limitless</b>: na fase de liga, a melhor é a jornada ${pk.l.md} (+${fmt(pk.l.limGain)})${pk.w && pk.w.wcGain > 12 && sp.bestL.md === pk.w.md ? ` (a J${pk.w.md} fica para o Wildcard: não dá para usar os dois na mesma jornada)` : ''}. ${pk.l.limGain > 20 ? 'Ganho grande: vale a pena usá-lo aí.' : 'Ganho moderado: também pode ficar para as eliminatórias.'}
      <br><span class="muted">O ganho do Limitless nas jornadas seguintes foi calculado sem o Wildcard; depois de o usares, recalcula.</span>`;
    return `<div class="card"><div class="row" style="justify-content:space-between"><h2>Plano da época: quando usar os jokers <span class="sub">fase de liga, jornadas ${sp.rows[0].md}-${sp.rows[sp.rows.length - 1].md}</span></h2>
      <button class="btn" id="uSeasonRe">↻ Recalcular</button></div>
      <div style="overflow-x:auto"><table><tr><th>Jornada</th><th>Fecho</th><th class="num">Sem jokers</th><th class="num">Limitless</th><th class="num">Ganho Limitless</th><th class="num">Ganho Wildcard <span class="muted">(até à J8)</span></th></tr>
        ${sp.rows.map(r => `<tr><td><b>J${r.md}</b>${r.oneDay ? ' <span class="tag q" title="todos os jogos à mesma hora: sem trocas a meio">1 dia</span>' : ''}</td><td>${day(r.deadline)}</td><td class="num">${fmt(r.base)}</td><td class="num">${fmt(r.limitless)}</td>
          <td class="num">${r.md === pk.l?.md ? `<b>+${fmt(r.limGain)}</b>` : '+' + fmt(r.limGain)}</td><td class="num">${r.md === pk.w?.md ? `<b>+${fmt(r.wcGain)}</b>` : '+' + fmt(r.wcGain)} <span class="muted">(${r.window} j.)</span></td></tr>`).join('')}</table></div>
      <p style="margin-top:10px">💡 ${recW}<br>💡 ${recL}</p>
      <p class="note">Jornadas futuras sem odds (força das equipas pelos preços) e com os lesionados de hoje: refaz o cálculo em cada jornada. Diferenças de poucos pontos são ruído.</p>${ko}</div>`;
  }
  function bindSuggest(sq) {
    const s = $('#plantel');
    const f2 = $('#uFree2'); if (f2) f2.onchange = e => { put('freeT', Math.max(0, +e.target.value || 0)); renderPlantel(); renderTrocas(); };
    const ex = $('#uExtra'); if (ex) ex.onchange = e => { put('extraT', Math.max(0, +e.target.value || 0)); renderPlantel(); };
    const cw = $('#uChipWc'); if (cw) cw.onchange = e => { put('chips', { ...st().chips, wc: e.target.checked ? U.data.meta.md : null }); renderPlantel(); };
    const cl = $('#uChipLim'); if (cl) cl.onchange = e => { put('chips', { ...st().chips, lim: e.target.checked ? U.data.meta.md : null }); renderPlantel(); };
    const b = $('#uSeason'); if (b) b.onclick = () => { U.wantSeason = true; renderPlantel(); };
    const r = $('#uSeasonRe'); if (r) r.onclick = () => { planCache.delete(seasonKey(sq)); U.wantSeason = true; renderPlantel(); };
    s.querySelectorAll('.uSee').forEach(x => x.onclick = () => buildFor(sq, x.dataset.m));
  }
  // "Sugerir plantel": com as transferências disponíveis, Wildcard, Limitless ou equipa nova
  function buildFor(sq, mode) {
    if (!mode) return;
    const g = planCache.get(`sug|${sqKey(sq)}|${+st().bank || 0}|${+st().freeT || 0}|${+st().extraT || 0}`);
    const label = { imp: 'com as tuas transferências', wc: 'Wildcard', lim: 'Limitless (só esta jornada)', new: 'equipa nova (100 M€)' }[mode];
    $('#plantel').querySelector('.card').insertAdjacentHTML('afterend', wait(`A calcular o plantel: ${label}…`));
    setTimeout(() => {
      let squad, moves = null;
      if (mode === 'imp') { const imp = g?.imp || UCLModel.improveSquad(U.proj.players, sq, +st().bank || 0, { maxT: (+st().freeT || 0) + (+st().extraT || 0), freeT: +st().freeT || 0 }); squad = imp.squad; moves = imp.moves; }
      else if (mode === 'wc' && planCache.get(seasonKey(sq))?.rows[0]?.md === U.data.meta.md) squad = planCache.get(seasonKey(sq)).rows[0].wcSquad.map(p => U.byId[p.id] || p);
      else if (mode === 'wc' && g) squad = g.wc.squad;
      else if (mode === 'lim' && g) squad = g.lim.squad;
      else squad = UCLModel.buildSquad(U.proj.players, mode === 'lim' ? 999 : mode === 'wc' ? sqValue(sq) + (+st().bank || 0) : 100, 3).squad;
      U.built = { squad, cost: sqValue(squad), pl: UCLModel.plan(squad), moves, label, mode, ex: UCLModel.explainChanges(sq, squad), bank0: +st().bank || 0, value0: sqValue(sq) };
      renderPlantel();
    }, 60);
  }
  // Simulação jogador a jogador: cada troca aplicada por ordem, com a jornada simulada depois de cada uma
  function changesHtml(b) {
    const { esc, fmt, pct, posTag } = A(), ex = b.ex;
    if (!ex.steps.length) return '<p class="muted">É o teu plantel atual: nenhuma troca.</p>';
    const hits = b.mode === 'imp' ? Math.max(0, ex.steps.length - (+st().freeT || 0)) * 4 : 0;
    const sg = x => `<span class="${x >= 0.05 ? 'good' : x <= -0.05 ? 'bad' : 'muted'}">${x >= 0 ? '+' : ''}${fmt(x)}</span>`;
    const info = p => `${esc(p.team)} ${esc(p.opp)} · ${day(p.ts)} · joga ${pct(p.pPlay)} · ${p.pos === 'G' || p.pos === 'D' ? 'baliza 0 ' + pct(p.pCS) : 'golo ' + pct(p.Pg)}${p.form != null ? ' · forma ' + fmt(p.form) : ''}`;
    const money = b.mode === 'lim' ? null : b.value0 + b.bank0 - b.cost;
    return `<h2 style="margin:12px 0 6px">Jogador a jogador <span class="sub">cada troca simulada por ordem (jornada com as trocas ao intervalo); o ganho de um jogador depende dos que já entraram</span></h2>
      <div style="overflow-x:auto"><table><tr><th>#</th><th>Sai</th><th class="num">Pts</th><th>Entra</th><th class="num">Pts</th><th class="num">Δ preço</th><th class="num">Ganho</th><th class="num">Total</th></tr>
        <tr><td></td><td colspan="5" class="muted">Plantel atual</td><td></td><td class="num">${fmt(ex.base)}</td></tr>
        ${ex.steps.map((t, i) => `<tr><td>${i + 1}</td><td>${posTag(t.out.pos)} ${esc(t.out.name)}<br><span class="muted">${info(t.out)}</span></td><td class="num">${fmt(t.out.pts)}</td>
          <td><b>${esc(t.in.name)}</b><br><span class="muted">${info(t.in)}</span></td><td class="num">${fmt(t.in.pts)}</td>
          <td class="num">${t.cost >= 0 ? '+' : ''}${fmt(t.cost)} M€</td><td class="num"><b>${sg(t.gain)}</b></td><td class="num">${fmt(t.ev)}</td></tr>`).join('')}
      </table></div>
      <p class="note">Total: <b>${sg(ex.ev - ex.base)}</b> pts esperados nesta jornada${hits ? ` (−${hits} pelas transferências a mais → ${sg(ex.ev - ex.base - hits)})` : ''} · ${ex.steps.length} troca${ex.steps.length === 1 ? '' : 's'}${money != null ? ` · saldo final ${m1(money)}` : ' · Limitless: sem orçamento'}.
        "Pts" = pontos esperados do jogador nesta jornada; o ganho é a diferença no total do plantel (conta quem fica no banco e as trocas ao intervalo).
        ${ex.steps.some(t => t.gain < -0.05) ? 'As trocas com ganho negativo servem para libertar dinheiro para as outras' + (b.mode === 'wc' ? ' ou rendem nas jornadas seguintes (o Wildcard é para várias jornadas)' : '') + '.' : ''}</p>`;
  }
  function builtHtml() {
    const { esc, fmt, posTag } = A(), b = U.built, mine = new Set(st().squad), inXI = new Set(b.pl.xi.map(p => p.id));
    return `<div class="card" style="background:var(--soft)"><div class="row" style="justify-content:space-between"><h2>Plantel sugerido: ${esc(b.label)} <span class="sub">${m1(b.cost)} · ${fmt(b.pl.ev)} pts esperados nesta jornada (com as trocas ao intervalo)</span></h2>
      <div class="row"><button class="btn primary" id="uUseBuilt">Usar este plantel</button><button class="btn" id="uCloseBuilt">Fechar</button></div></div>
      ${changesHtml(b)}
      <div class="list">${b.squad.slice().sort((x, y) => 'GDMF'.indexOf(x.pos) - 'GDMF'.indexOf(y.pos) || y.pts - x.pts).map(p => `<div class="li">${posTag(p.pos)}<div class="grow"><b>${esc(p.name)}</b>${mine.has(p.id) ? ' <span class="good">✓ já tens</span>' : ''}<span>${esc(p.team)} ${esc(p.opp)} · ${day(p.ts)} · ${m1(p.price)}${inXI.has(p.id) ? '' : ' · banco'}</span></div><span class="pts ${p.id === b.pl.captain.id ? 'hi' : ''}">${fmt(p.pts)}${p.id === b.pl.captain.id ? ' ©' : ''}</span></div>`).join('')}</div>
      <p class="note">${b.mode === 'lim' ? 'Limitless: o plantel volta ao teu depois desta jornada.' : b.mode === 'wc' ? (planCache.get(seasonKey(squadP()))?.rows[0]?.md === U.data.meta.md ? 'Wildcard: plantel escolhido para as jornadas que faltam da fase de liga (plano da época).' : 'Wildcard: escolhido só por esta jornada; calcula o plano da época para um plantel pensado para várias jornadas.') : 'Escolhido pelos pontos desta jornada.'}</p></div>`;
  }
  function renderPlantel() {
    const el = $('#plantel'), { esc, fmt, pct, posTag } = A();
    if (!U.data) { el.innerHTML = noData(); return; }
    const s = st(), sq = squadP();
    const count = { G: 0, D: 0, M: 0, F: 0 }; sq.forEach(p => count[p.pos]++);
    const clubs = {}; sq.forEach(p => clubs[p.team] = (clubs[p.team] || 0) + 1);
    const over = Object.entries(clubs).filter(([, n]) => n > 3);
    const value = sq.reduce((a, p) => a + p.price, 0);
    const opts = U.proj.players.slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => `<option value="${esc(p.name)} · ${esc(p.team)} · ${POSN[p.pos]} · #${p.id}">`).join('');
    el.innerHTML = `<div class="card">
      <div class="row" style="justify-content:space-between"><h2>O meu plantel da Champions (${sq.length}/15)</h2>
        <div class="row">${Object.entries(UCLModel.NEED).map(([k, n]) => `<span class="chip ${count[k] === n ? 'good' : 'bad'}">${posTag(k)} ${count[k]}/${n}</span>`).join('')}
          <span class="chip ${value + (+s.bank || 0) > 105 ? 'bad' : ''}">Valor ${m1(value)}</span>
          <label>Saldo <input type="number" step="0.1" class="small" id="uBank2" value="${s.bank}"> M€</label>
          <label>Nome <input id="uName" value="${esc(s.name)}" placeholder="Nome da equipa" style="width:140px"></label></div></div>
      ${over.length ? `<p class="bad">Mais de 3 jogadores de: ${over.map(([t, n]) => `${esc(t)} (${n})`).join(', ')}.</p>` : ''}
      <div class="row" style="margin:8px 0 12px"><input type="text" id="uAddP" list="uAllP" placeholder="Adicionar jogador… (escreve o nome)" style="min-width:320px">
        <datalist id="uAllP">${opts}</datalist><button class="btn primary" id="uAddBtn">Adicionar</button>
        <span class="note">ou carrega em <b>+</b> no separador Ranking</span>
        <span class="grow"></span>
        <label>Sugerir plantel <select id="uBuildMode"><option value="">escolhe…</option><option value="imp">com as minhas transferências</option><option value="wc">Wildcard (orçamento atual)</option><option value="lim">Limitless (sem orçamento)</option><option value="new">equipa nova (100 M€)</option></select></label></div>
      ${U.built ? builtHtml() : ''}
      <table><tr><th>Pos</th><th>Jogador</th><th>Jogo</th><th class="num">Pts esp.</th><th>Disponibilidade</th><th class="num">Preço</th><th></th></tr>
      ${sq.sort((a, b) => 'GDMF'.indexOf(a.pos) - 'GDMF'.indexOf(b.pos) || b.pts - a.pts).map(p => `<tr><td>${posTag(p.pos)}</td><td><b>${esc(p.name)}</b>${p.status ? ` <span class="warn">${esc(p.status)}</span>` : ''}</td>
        <td>${esc(p.team)} <span class="muted">${esc(p.opp)} · ${day(p.ts)}</span></td><td class="num">${fmt(p.pts)}</td>
        <td><select class="uAv" data-id="${p.id}">${[['', 'Automática (' + pct(p.pPlay) + ')'], ['1', 'Joga de certeza'], ['0.75', 'Provável'], ['0.5', 'Dúvida'], ['0.25', 'Pouco provável'], ['0', 'Não joga']].map(([v, l]) => `<option value="${v}" ${String(s.avail[p.id] ?? '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td class="num">${m1(p.price)}</td><td><button class="x uRm" data-id="${p.id}" title="Remover">✕</button></td></tr>`).join('')}</table>
      <p class="note">Preços e posições vêm da UEFA. Plantel: 2 GR, 5 DEF, 5 MED, 3 AV; 100 M€ na fase de liga (105 M€ depois); máximo 3 por clube.</p></div>
      ${suggestHtml(sq)}
      ${seasonHtml(sq)}`;
    bindSuggest(sq);
    $('#uBuildMode').onchange = e => buildFor(sq, e.target.value);
    const ub = $('#uUseBuilt'); if (ub) ub.onclick = () => { if (!confirm('Substituir o teu plantel por este?')) return; put('squad', U.built.squad.map(p => p.id)); put('lineup', null); U.built = null; recompute(); };
    const uc = $('#uCloseBuilt'); if (uc) uc.onclick = () => { U.built = null; renderPlantel(); };
    $('#uBank2').onchange = e => { put('bank', +e.target.value || 0); recompute(); };
    $('#uName').onchange = e => { put('name', e.target.value); header(); };
    $('#uAddBtn').onclick = () => { const m = $('#uAddP').value.match(/#(\d+)$/); if (m) addPlayer(+m[1]); };
    el.querySelectorAll('.uRm').forEach(b => b.onclick = () => { put('squad', st().squad.filter(id => id !== +b.dataset.id)); recompute(); });
    el.querySelectorAll('.uAv').forEach(x => x.onchange = () => { const a = st().avail; if (x.value === '') delete a[+x.dataset.id]; else a[+x.dataset.id] = +x.value; put('avail', a); recompute(); });
  }

  function renderAll() {
    header();
    renderOnze(); renderTrocas(); renderJogos(); renderRanking(); renderPlantel(); renderHistorico();
  }

  // sincronização PC → telemóvel
  const bundle = () => { const s = st(); return { data: U.data, squad: s.squad, bank: s.bank, avail: s.avail, lineup: s.lineup, freeT: s.freeT, extraT: s.extraT, chips: s.chips, name: s.name, history: A().ls.get('ucl.history', {}) }; };
  async function applyBundle(b) {
    if (!b) return;
    if (b.data) { U.data = b.data; await A().idb.set('ucl', b.data); }
    if (Array.isArray(b.squad) && b.squad.length) for (const k of ['squad', 'bank', 'avail', 'lineup', 'freeT', 'extraT', 'chips', 'name', 'history']) if (b[k] !== undefined) put(k, b[k]);
  }

  return { init, setData, recompute, renderAll, renderTrocas, renderPlantel, header, tick, bundle, applyBundle, SITE };
})();

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
      freeT: ls.get('ucl.freeT', 2), name: ls.get('ucl.name', ''),
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
    U.proj = UCLModel.project(U.data, A().S.data?.ucl, { availOverride: s.avail });
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
  function lineupOf(sq) {
    const best = UCLModel.bestXI(sq); if (!best) return null;
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
    return { L, best, custom };
  }
  const total = L => L.xi.reduce((s, id) => s + U.byId[id].pts, 0) + (U.byId[L.captain]?.pts || 0);

  function renderOnze() {
    const el = $('#onze'), { fmt, pct, esc } = A();
    if (!U.data) { el.innerHTML = noData(); return; }
    const sq = squadP();
    if (sq.length < 15) { el.innerHTML = empty(`O teu plantel da Champions tem ${sq.length} de 15 jogadores.<br>Adiciona-os no separador <b>Plantel</b> (2 GR, 5 DEF, 5 MED, 3 AV).`); return; }
    const r = lineupOf(sq); if (!r) { el.innerHTML = empty('Plantel incompleto para formar um onze válido.'); return; }
    const { L, best, custom } = r;
    const tot = total(L), bestTot = best.total, diff = tot - bestTot;
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
    const days = [...new Set(xiP.map(p => new Date(p.ts).toDateString()))];
    const alerts = sq.filter(p => p.pPlay < 0.6);
    const capOpts = xiP.slice().sort((a, b) => b.pts - a.pts);
    el.innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="l">Pontos esperados</div><div class="v">${fmt(tot)}</div><div class="s">jornada ${U.data.meta.md} · com o capitão ×2</div></div>
        <div class="kpi"><div class="l">${custom ? 'Diferença para o melhor onze' : 'Tática recomendada'}</div>
          <div class="v ${custom ? (diff >= -0.05 ? 'good' : 'bad') : ''}">${custom ? (diff >= 0 ? '+' : '') + fmt(diff) : L.formation}</div><div class="s">${custom ? 'melhor onze: ' + fmt(bestTot) : 'a que dá mais pontos esperados'}</div></div>
        <div class="kpi"><div class="l">Capitão</div><div class="v" style="font-size:19px">${esc(cap?.name || '–')}</div><div class="s">${cap ? esc(cap.team + ' ' + cap.opp) + ' · ' + day(cap.ts) + ' · ' + fmt(2 * cap.pts) + ' pts' : ''}</div></div>
        <div class="kpi"><div class="l">Plantel</div><div class="v">${m1(sq.reduce((s, p) => s + p.price, 0))}</div><div class="s">saldo ${m1(st().bank)} · ${st().freeT} transferência${st().freeT === 1 ? '' : 's'} grátis</div></div>
      </div>
      <div class="grid2">
        <div class="card">
          <div class="pitch-head">
            <span class="chip">${esc(L.formation)}</span>
            <div class="row">${custom ? '<button class="btn primary" id="uResetXI">↺ Repor melhor onze</button>' : '<span class="note">Clica num jogador para o trocar</span>'}
              <button class="btn" id="uCmpBtn" aria-pressed="${U.compare}">${U.compare ? '✕ Fechar comparação' : '⚖ Comparar com o melhor da Champions'}</button></div>
          </div>
          <div class="field"><div class="mid"></div><div class="circle"></div>
            <div class="lineup">${lanes.map(l => `<div class="lane">${l.map(token).join('')}</div>`).join('')}</div></div>
          <h2 style="margin:16px 0 0">Suplentes <span class="sub">GR primeiro; os outros por prioridade (entram automaticamente se um titular não jogar, sem estragar a tática)</span></h2>
          <div class="bench">${benchP.map(bslot).join('')}</div>
          ${days.length > 1 ? `<div class="warnbox" style="background:var(--soft);border-color:var(--line)">📅 O teu onze joga em ${days.length} dias (${days.map(d => day(new Date(d))).join(', ')}). Depois do 1.º dia podes fazer até 4 substituições e trocar de capitão para quem ainda não jogou.</div>` : ''}
        </div>
        <div>
          <div class="card"><h2>Capitão</h2>
            <div class="list"><label class="coach"><span class="ic">C</span><div><b>${esc(cap?.name || '')}</b><div class="note">Conta a dobrar · clica para mudar</div></div>
              <select id="uCapSel">${capOpts.map(p => `<option value="${p.id}" ${p.id === L.captain ? 'selected' : ''}>${optLabel(p)}</option>`).join('')}</select></label></div>
            ${best.capDay1 ? `<p class="note" style="margin-top:8px">💡 Alternativa: <b>${esc(best.capDay1.name)}</b> (${fmt(best.capDay1.pts)} pts, joga ${day(best.capDay1.ts)}). Perde pouco e, se correr mal, podes passar a braçadeira a quem joga depois.</p>` : ''}
            <h2 style="margin:16px 0 8px">Melhores capitães <span class="sub">do teu onze</span></h2>
            <div class="list">${capOpts.slice(0, 4).map(p => `<div class="li">${A().posTag(p.pos)}<div class="grow"><b>${esc(p.name)}</b><span>${esc(p.team)} ${esc(p.opp)} · ${day(p.ts)} ${hour(p.ts)} · P(golo) ${pct(p.Pg)}</span></div><span class="pts ${p.id === L.captain ? 'hi' : ''}">${fmt(2 * p.pts)}</span></div>`).join('')}</div>
          </div>
          <div class="card"><h2>Alertas do plantel</h2>
            ${alerts.length ? `<div class="list">${alerts.map(p => `<div class="li">${A().posTag(p.pos)}<div class="grow"><b>${esc(p.name)}</b><span class="${p.pPlay < 0.2 ? 'bad' : 'warn'}">${p.status ? esc(p.status) + ' · ' : ''}${pct(p.pPlay)} de jogar · últimos jogos ${p.last.join('/')}'</span></div></div>`).join('')}</div>` : '<p class="muted">Sem alertas: todos os jogadores devem jogar.</p>'}
          </div>
        </div>
      </div>
      ${U.compare ? compareHtml(sq) : ''}
      <div class="card"><h2>Plantel completo <span class="sub">pontos esperados nesta jornada</span></h2>${table(sq.sort((a, b) => 'GDMF'.indexOf(a.pos) - 'GDMF'.indexOf(b.pos) || b.pts - a.pts))}</div>`;
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
  function saveSnapshot(L, best, tot) {
    const md = U.data.meta.md, close = deadlineMs(); if (!close || new Date(U.data.meta.created) >= close || Date.now() >= close) return;
    const pl = id => { const p = U.byId[id]; return { id, n: p.name, t: p.team, pos: p.pos, pts: +p.pts.toFixed(2) }; };
    const h = A().ls.get('ucl.history', {}), old = h[md];
    const snap = { md, close, xi: L.xi.map(pl), bench: L.bench.map(pl), captain: L.captain, exp: +tot.toFixed(2),
      alt: { formation: best.formation, xi: best.xi.map(p => p.id), captain: best.captain.id, exp: +best.total.toFixed(2) } };
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

  function renderHistorico() {
    const el = $('#historico'), { fmt, esc, posTag } = A();
    const H = Object.values(st().history).sort((a, b) => b.md - a.md);
    if (!H.length) { el.innerHTML = empty('Ainda sem jornadas guardadas. O teu onze fica guardado sozinho antes do fecho de cada jornada.'); return; }
    const rows = H.map(h => {
      const calc = h.real ?? realOf(h.md, h.xi.map(p => p.id), h.bench.map(p => p.id), h.captain);
      const altReal = h.alt ? (h.alt.real ?? realOf(h.md, h.alt.xi, [], h.alt.captain)) : null;
      return { h, real: h.official ?? calc, altReal };
    });
    const done = rows.filter(r => r.real != null), sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
    const withAlt = done.filter(r => r.altReal != null);
    const sg = d => (d > 0 ? '+' : '') + fmt(d, Number.isInteger(d) ? 0 : 1);
    const tag = d => (d == null ? '–' : `<span class="tag ${d >= 0 ? 'ok' : 'no'}">${sg(d)}</span>`);
    const star = h => (h.sim ? '<sup class="muted">*</sup>' : '');
    const nameOf = id => { for (const h of H) for (const p of [...h.xi, ...h.bench]) if (p.id === id) return p.n; return U.byId[id]?.name || '#' + id; };
    const detail = ({ h }) => {
      const subs = (h.subs || []).map(([o, i]) => `${esc(nameOf(o))} → ${esc(nameOf(i))}`);
      const a = h.alt, mine = new Set(h.xi.map(p => p.id));
      const out = a ? h.xi.filter(p => !a.xi.includes(p.id)).map(p => esc(p.n)) : [], inn = a ? a.xi.filter(id => !mine.has(id)).map(id => esc(nameOf(id))) : [];
      return `<table><tr><th>Pos.</th><th>Jogador (onze no fecho)</th><th class="num">Esperado</th><th class="num">Real</th></tr>
        ${h.xi.slice().sort((x, y) => 'GDMF'.indexOf(x.pos) - 'GDMF'.indexOf(y.pos)).map(p => `<tr><td>${posTag(p.pos)}</td><td>${esc(p.n)}${p.id === h.captain ? ' <span class="tag ok">C ×2</span>' : ''} <span class="muted">${esc(p.t)}</span></td>
          <td class="num">${fmt(p.pts * (p.id === h.captain ? 2 : 1))}</td><td class="num">${p.real == null ? '–' : p.real * (p.id === h.captain ? 2 : 1)}</td></tr>`).join('')}</table>
        <p class="note">Banco: ${h.bench.map(p => `${esc(p.n)} (${p.real ?? '–'})`).join(' · ')}${subs.length ? `<br>Substituições durante a jornada: ${subs.join(' · ')}` : ''}</p>
        ${a ? `<p class="note"><b>Onze do modelo</b> (${esc(a.formation)}, capitão ${esc(nameOf(a.captain))}): esperado ${fmt(a.exp)}${a.real != null ? `, real <b>${a.real}</b>` : ''}${a.autoSubs?.length ? ` (substituições automáticas: ${a.autoSubs.map(esc).join(', ')})` : ''}.
          ${out.length ? `Mudava: sai ${out.join(', ')} · entra ${inn.join(', ')}.` : 'Os mesmos 11.'}</p>` : ''}`;
    };
    el.innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="l">Os teus pontos</div><div class="v">${done.length ? sum(done, r => r.real) : '–'}</div><div class="s">${done.length} jornada${done.length === 1 ? '' : 's'}${done.length ? ' · ' + fmt(sum(done, r => r.real) / done.length) + ' por jornada' : ''}</div></div>
        <div class="kpi"><div class="l">Esperado (onze no fecho)</div><div class="v">${done.length ? fmt(sum(done, r => r.h.exp)) : '–'}</div><div class="s">${done.length ? 'real − esperado: ' + sg(sum(done, r => r.real) - sum(done, r => r.h.exp)) : ''}</div></div>
        <div class="kpi"><div class="l">Onze do modelo (real)</div><div class="v">${withAlt.length ? sum(withAlt, r => r.altReal) : '–'}</div><div class="s">${withAlt.length ? `vs. os teus ${sum(withAlt, r => r.real)}: ${sg(sum(withAlt, r => r.altReal) - sum(withAlt, r => r.real))}` : ''}</div></div>
        <div class="kpi"><div class="l">Esperado do modelo</div><div class="v">${withAlt.length ? fmt(sum(withAlt, r => r.h.alt.exp)) : '–'}</div><div class="s">no papel, o onze do modelo</div></div>
      </div>
      <div class="card"><h2>Histórico da Champions</h2>
        <p class="note">O onze fica guardado sozinho até ao fecho, com o onze que o modelo escolheria. "Real" = pontos da UEFA: as tuas substituições entre dias contam no real; o esperado é o do onze no fecho. Em <b>Oficial</b> escreve o total da jornada.
        ${H.some(h => h.sim) ? '<br><sup>*</sup> simulado: modelo atual com os dados e as odds da véspera; o onze do modelo usa os mesmos 15 jogadores, só com substituições automáticas.' : ''}</p>
        <div style="overflow-x:auto"><table><tr><th>Jornada</th><th class="num">Esperado</th><th class="num">Real</th><th class="num">Real − esp.</th><th class="num">Modelo esp.</th><th class="num">Modelo real</th><th class="num">Modelo − teu</th><th class="num">Oficial</th></tr>
        ${rows.map(({ h, real, altReal }) => `<tr><td><b>J${h.md}</b></td><td class="num">${fmt(h.exp)}${star(h)}</td>
          <td class="num">${real != null ? `<span class="pts hi">${real}</span>` : `<span class="tag q">${Date.now() < h.close ? 'por jogar' : 'atualiza a UEFA'}</span>`}</td>
          <td class="num">${tag(real != null ? real - h.exp : null)}</td><td class="num">${h.alt ? fmt(h.alt.exp) + star(h) : '–'}</td><td class="num">${altReal ?? '–'}</td>
          <td class="num">${tag(real != null && altReal != null ? altReal - real : null)}</td>
          <td class="num"><input class="uOff" data-md="${h.md}" type="number" step="1" value="${h.official ?? ''}" placeholder="–" style="width:64px"></td></tr>`).join('')}
        </table></div></div>
      ${rows.map(r => `<details class="card"><summary><b>J${r.h.md}</b> · esperado ${fmt(r.h.exp)}${r.h.sim ? ' (simulado)' : ''}${r.real != null ? ` · real ${r.real}` : ''}${r.altReal != null ? ` · modelo ${r.altReal}` : ''}</summary>${detail(r)}</details>`).join('')}`;
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
    return `<div style="overflow-x:auto"><table><tr><th>Pos</th><th>Jogador</th><th>Jogo</th><th class="num">Pts esp.</th><th class="num">Joga</th><th class="num">P(golo)</th><th class="num">Baliza 0</th><th class="num">Méd. real</th><th class="num">Preço</th>${add ? '<th></th>' : ''}</tr>
      ${list.map(p => `<tr><td>${posTag(p.pos)}</td><td><b>${esc(p.name)}</b>${p.status ? ` <span class="${p.pPlay < 0.2 ? 'bad' : 'warn'}">${esc(p.status)}</span>` : ''}</td>
        <td>${esc(p.team)} <span class="muted">${esc(p.opp)} · ${day(p.ts)}</span></td><td class="num"><span class="pts ${p.pts >= 5 ? 'hi' : ''}">${fmt(p.pts)}</span></td>
        <td class="num">${pct(p.pPlay)}</td><td class="num">${pct(p.Pg)}</td><td class="num">${p.pos === 'F' ? '–' : pct(p.cs)}</td>
        <td class="num">${p.avgPts == null ? '–' : fmt(p.avgPts)}<span class="muted"> (${p.games})</span></td><td class="num">${m1(p.price)}</td>
        ${add ? `<td>${mine.has(p.id) ? '<span class="good">✓</span>' : `<button class="btn uAdd" data-id="${p.id}">+</button>`}</td>` : ''}</tr>`).join('')}</table></div>`;
  }

  // ---------- transferências ----------
  function renderTrocas() {
    const el = $('#trocas'), { fmt, esc, posTag } = A();
    if (!U.data) { el.innerHTML = noData(); return; }
    const sq = squadP(), s = st();
    if (sq.length < 15) { el.innerHTML = empty('Completa primeiro o plantel (15 jogadores) no separador <b>Plantel</b>.'); return; }
    const list = UCLModel.transfers(U.proj.players, sq, +s.bank || 0);
    // melhor par de transferências (a 2.ª calculada depois da 1.ª)
    const one = list[0];
    let pair = null;
    if (one) {
      const sq2 = sq.map(p => (p.id === one.out.id ? one.in : p));
      const two = UCLModel.transfers(U.proj.players, sq2, (+s.bank || 0) - one.cost)[0];
      if (two) pair = { a: one, b: two, gain: one.gain + two.gain };
    }
    const seen = new Set(), top = list.filter(t => { if (seen.has(t.out.id)) return false; seen.add(t.out.id); return t.gain > 0.05; }).slice(0, 8);
    const card = t => `<div class="swap"><div class="li">${posTag(t.out.pos)}<div class="grow"><span class="muted">Sai</span><b>${esc(t.out.name)}</b><span>${esc(t.out.team)} ${esc(t.out.opp)} · ${fmt(t.out.pts)} pts · ${m1(t.out.price)}</span></div></div>
      <div class="li">${posTag(t.in.pos)}<div class="grow"><span class="muted">Entra</span><b>${esc(t.in.name)}</b><span>${esc(t.in.team)} ${esc(t.in.opp)} · ${fmt(t.in.pts)} pts · ${m1(t.in.price)}</span></div><span class="pts hi">+${fmt(t.gain)}</span></div></div>`;
    el.innerHTML = `
      <div class="card"><div class="row" style="justify-content:space-between"><h2>Transferências <span class="sub">ganho = pontos esperados a mais no teu melhor onze desta jornada</span></h2>
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
      ${gs.some(g => g.src !== 'odds') ? '<p class="note">"preços" = sem odds do Sofascore para esse jogo: a força das equipas vem dos preços dos jogadores na Fantasy. Atualiza o Sofascore para usar as odds.</p>' : ''}</div>`;
  }

  // ---------- ranking ----------
  function renderRanking() {
    const el = $('#ranking'); if (!U.data) { el.innerHTML = noData(); return; }
    const r = U.rank ||= { pos: 'all', q: '', max: '' };
    const { norm } = UCLModel;
    const list = U.proj.players.filter(p => (r.pos === 'all' || p.pos === r.pos) && (!r.q || norm(p.name + ' ' + p.team).includes(norm(r.q))) && (!r.max || p.price <= +r.max))
      .sort((a, b) => b.pts - a.pts).slice(0, 150);
    el.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between"><h2>Ranking da Champions <span class="sub">pontos esperados na jornada ${U.data.meta.md}</span></h2>
      <div class="row"><div class="seg">${['all', 'G', 'D', 'M', 'F'].map(k => `<button data-p="${k}" class="${r.pos === k ? 'on' : ''}">${k === 'all' ? 'Todos' : POSN[k]}</button>`).join('')}</div>
      <input id="uQ" placeholder="Procurar jogador/equipa" value="${A().esc(r.q)}"><label>Até <input id="uMax" type="number" step="0.5" class="small" value="${r.max}"> M€</label></div></div>
      ${table(list, { add: true })}</div>`;
    el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { r.pos = b.dataset.p; renderRanking(); });
    $('#uQ').onchange = e => { r.q = e.target.value; renderRanking(); };
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
  function builtHtml() {
    const { esc, fmt, posTag } = A(), b = U.built, mine = new Set(st().squad);
    return `<div class="card" style="background:var(--soft)"><div class="row" style="justify-content:space-between"><h2>Plantel sugerido <span class="sub">${m1(b.cost)} · onze ${esc(b.xi.formation)} · ${fmt(b.xi.total)} pts esperados nesta jornada</span></h2>
      <div class="row"><button class="btn primary" id="uUseBuilt">Usar este plantel</button><button class="btn" id="uCloseBuilt">Fechar</button></div></div>
      <div class="list">${b.squad.slice().sort((x, y) => 'GDMF'.indexOf(x.pos) - 'GDMF'.indexOf(y.pos) || y.pts - x.pts).map(p => `<div class="li">${posTag(p.pos)}<div class="grow"><b>${esc(p.name)}</b>${mine.has(p.id) ? ' <span class="good">✓ já tens</span>' : ''}<span>${esc(p.team)} ${esc(p.opp)} · ${m1(p.price)}${b.xi.xi.some(q => q.id === p.id) ? '' : ' · banco'}</span></div><span class="pts ${p.id === b.xi.captain.id ? 'hi' : ''}">${fmt(p.pts)}${p.id === b.xi.captain.id ? ' ©' : ''}</span></div>`).join('')}</div>
      <p class="note">Só olha para esta jornada. Para uma equipa de raiz pensa também nas jornadas seguintes.</p></div>`;
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
        <button class="btn" id="uBuild" title="Os 15 que dão mais pontos esperados nesta jornada dentro do orçamento (equipa nova, Wildcard ou Limitless)">✨ Sugerir plantel</button></div>
      ${U.built ? builtHtml() : ''}
      <table><tr><th>Pos</th><th>Jogador</th><th>Jogo</th><th class="num">Pts esp.</th><th>Disponibilidade</th><th class="num">Preço</th><th></th></tr>
      ${sq.sort((a, b) => 'GDMF'.indexOf(a.pos) - 'GDMF'.indexOf(b.pos) || b.pts - a.pts).map(p => `<tr><td>${posTag(p.pos)}</td><td><b>${esc(p.name)}</b>${p.status ? ` <span class="warn">${esc(p.status)}</span>` : ''}</td>
        <td>${esc(p.team)} <span class="muted">${esc(p.opp)} · ${day(p.ts)}</span></td><td class="num">${fmt(p.pts)}</td>
        <td><select class="uAv" data-id="${p.id}">${[['', 'Automática (' + pct(p.pPlay) + ')'], ['1', 'Joga de certeza'], ['0.75', 'Provável'], ['0.5', 'Dúvida'], ['0.25', 'Pouco provável'], ['0', 'Não joga']].map(([v, l]) => `<option value="${v}" ${String(s.avail[p.id] ?? '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td class="num">${m1(p.price)}</td><td><button class="x uRm" data-id="${p.id}" title="Remover">✕</button></td></tr>`).join('')}</table>
      <p class="note">Preços e posições vêm da UEFA. Plantel: 2 GR, 5 DEF, 5 MED, 3 AV; 100 M€ na fase de liga (105 M€ depois); máximo 3 por clube.</p></div>`;
    $('#uBuild').onclick = () => { const b = +prompt('Orçamento total (M€)? 100 na fase de liga, 105 depois. Para o Limitless escreve 999.', '100'); if (!b) return;
      U.built = UCLModel.buildSquad(U.proj.players, b, 3); renderPlantel(); };
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
  const bundle = () => { const s = st(); return { data: U.data, squad: s.squad, bank: s.bank, avail: s.avail, lineup: s.lineup, freeT: s.freeT, name: s.name, history: A().ls.get('ucl.history', {}) }; };
  async function applyBundle(b) {
    if (!b) return;
    if (b.data) { U.data = b.data; await A().idb.set('ucl', b.data); }
    if (Array.isArray(b.squad) && b.squad.length) for (const k of ['squad', 'bank', 'avail', 'lineup', 'freeT', 'name', 'history']) if (b[k] !== undefined) put(k, b[k]);
  }

  return { init, setData, recompute, renderAll, header, tick, bundle, applyBundle, SITE };
})();

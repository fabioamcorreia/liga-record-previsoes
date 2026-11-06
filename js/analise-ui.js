/* Análise da jornada feita pela IA (js/analise.js): cartão no "O meu onze" e correções à probabilidade de jogar.
   As correções só contam na jornada para que foram feitas; as escolhas manuais do plantel ganham sempre às da IA. */
const AnaliseUI = (() => {
  const on = () => window.LRApp?.ls.get('useAI', true) ?? true;
  // state: 'ok' = é desta jornada · 'ahead' = os dados da app estão atrasados · null = sem análise para esta jornada
  function status(kind, round) {
    const a = window.ANALISE?.[kind];
    if (!a || a.round == null || round == null || a.round < round) return { a: null, state: null };
    return { a, state: a.round === round ? 'ok' : 'ahead' };
  }
  function avail(kind, round) {
    const { a, state } = status(kind, round);
    if (state !== 'ok' || !on()) return {};
    return Object.fromEntries((a.adjust || []).map(x => [x.id, x.pPlay]));
  }
  const link = (x, esc) => (/^https?:\/\//.test(x.url || '') ? `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.source || 'fonte')}</a>` : esc(x.source || ''));
  // base(id) = jogador sem as correções (para mostrar a probabilidade do modelo) · effect = { base, ia } do teu onze
  function card(kind, round, { base, effect } = {}) {
    const { a, state } = status(kind, round);
    if (!a) return '';
    const { esc, pct, fmt, ago } = window.LRApp;
    const rows = (a.adjust || []).map(x => { const b = base?.(x.id);
      return `<tr><td><b>${esc(x.name)}</b> <span class="muted">${esc(x.team || '')}</span></td><td class="num">${b ? pct(b.pPlay) : '–'}</td><td class="num"><b>${pct(x.pPlay)}</b></td><td>${esc(x.reason)}</td><td class="muted">${link(x, esc)}</td></tr>`; }).join('');
    const list = (t, l) => (l?.length ? `<h2 style="margin:14px 0 6px">${t}</h2><ul style="margin:0;padding-left:18px">${l.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : '');
    return `<div class="card" id="aiCard"><div class="row" style="justify-content:space-between"><h2>🤖 Análise da jornada ${esc(a.label || round)} <span class="sub">feita ${ago(a.created)} · notícias + modelo</span></h2>
        <label class="chip" style="cursor:pointer;padding:6px 12px"><input type="checkbox" class="aiToggle" ${on() ? 'checked' : ''}> Aplicar as correções ao modelo</label></div>
      ${state === 'ahead' ? `<p class="warn">Esta análise é da jornada ${esc(a.label || a.round)} e os dados da app ainda estão numa jornada anterior: atualiza os dados para ela contar.</p>` : ''}
      <p>${esc(a.summary || '')}</p>
      ${list('Recomendação', a.recommendation)}
      ${list('Riscos', a.risks)}
      ${rows ? `<h2 style="margin:14px 0 6px">Correções à probabilidade de jogar</h2><div style="overflow-x:auto"><table><tr><th>Jogador</th><th class="num">Modelo</th><th class="num">IA</th><th>Porquê</th><th>Fonte</th></tr>${rows}</table></div>` : ''}
      ${effect && effect.base != null ? `<p class="note">O teu onze: ${fmt(effect.base)} pts esperados só com o modelo → <b>${fmt(effect.ia)}</b> com as correções.</p>` : ''}
      ${a.sources?.length ? `<p class="note">Outras fontes: ${a.sources.map(x => link(x, esc)).join(' · ')}</p>` : ''}
      <p class="note">A IA só corrige quem joga e dá contexto; os pontos continuam a vir do modelo. As tuas escolhas de disponibilidade no Plantel ganham às da IA. O Histórico compara modelo e modelo + IA.</p></div>`;
  }
  function bind(el, rerun) { el.querySelectorAll('.aiToggle').forEach(c => c.onchange = () => { window.LRApp.ls.set('useAI', c.checked); rerun(); }); }
  return { status, avail, card, bind };
})();

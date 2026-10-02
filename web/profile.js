import { normalizeSearch } from './search.js';
import { sectionOf, statusesFor } from './collection-model.js';
import { physicalCopies, editionGroup } from './physical.js';
export const favoriteCategories = {story:'Favorite story',gameplay:'Favorite gameplay',soundtrack:'Favorite soundtrack',artstyle:'Favorite artstyle',cast:'Favorite cast'};
export const defaultGuide = `10 — A personal favourite. Something I’ll remember for years.
9 — Excellent. Very little held it back for me.
8 — Great. I enjoyed it a lot despite a few issues.
7 — Good. Worth playing, with some clear weaknesses.
6 — Decent. More good than bad, but not especially memorable.
5 — Mixed. About as much worked for me as didn’t.
4 — Disappointing. The problems outweighed the good parts.
3 — Poor. I struggled to enjoy it.
2 — Very poor. Almost nothing worked for me.
1 — One of my least favourite experiences.`;
export function playtimeSeconds(value) {
  const match = String(value || '').trim().match(/^(\d+):([0-5]\d)(?::([0-5]\d))?$/);
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] || 0) : null;
}
export function statistics(games) {
  const times = games.map(g => playtimeSeconds(g.playtime)).filter(t => t != null);
  const ratings = games.map(g => g.rating).filter(r => typeof r === 'number' && Number.isFinite(r));
  const platforms = new Map();
  for (const g of games) { const p = g.platform?.trim() || 'Not recorded'; platforms.set(p, (platforms.get(p) || 0) + 1); }
  return { total: games.length, seconds: times.reduce((a,b)=>a+b,0), timed: times.length, rated: ratings.length,
    mean: ratings.length ? ratings.reduce((a,b)=>a+b,0) / ratings.length : null,
    platforms: [...platforms].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0])),
    scores: Array.from({length:10},(_,i)=>[i+1,ratings.filter(r=>Math.round(r)===i+1).length]) };
}
export function physicalStatistics(data) {
  const rows = physicalCopies(data.games, data.bundles), platforms = new Map();
  for (const {copy} of rows) {
    const platform = copy.platform?.trim() || 'Not recorded';
    platforms.set(platform, (platforms.get(platform) || 0) + 1);
  }
  const limited = rows.filter(({copy}) => editionGroup(copy) === 'limited').length;
  return {total: rows.length, limited, regular: rows.length-limited,
    platforms: [...platforms].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0]))};
}
export function physicalPlayStatistics(data) {
  const titles = new Map();
  const normalize = title => String(title || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  const sourceId = url => String(url || '').match(/vndb\.org\/(v\d+)/)?.[1];
  const hasPlayed = game => ['playing','completed','on-hold','dropped','retired'].includes(game.status) || playtimeSeconds(game.playtime)>0;
  for (const row of physicalCopies(data.games, data.bundles)) {
    const entries = row.bundle ? row.included : [{game:row.game,label:row.game.title}];
    for (const entry of entries) {
      const game = entry.game || data.games.find(g=>normalize(g.title)===normalize(entry.label) || (sourceId(entry.sourceUrl) && sourceId(g.sources?.vndb)===sourceId(entry.sourceUrl)));
      const id = sourceId(game?.sources?.vndb) || sourceId(entry.sourceUrl);
      const key = id || normalize(game?.title || entry.label);
      if (!key) continue;
      const matches = data.games.filter(g=>(id && sourceId(g.sources?.vndb)===id) || normalize(g.title)===normalize(game?.title || entry.label));
      const state = matches.some(hasPlayed) ? 'played' : 'unplayed';
      if (!titles.has(key) || state==='played') titles.set(key,state);
    }
  }
  return {total:titles.size,...Object.fromEntries(['played','unplayed'].map(state=>[state,[...titles.values()].filter(s=>s===state).length]))};
}
export function profileHTML(data, esc, editable, renderCover = game => `<div class="cover cover-fallback"><strong>${esc(game.title)}</strong></div>`) {
  const physical = physicalStatistics(data), maxPhysical = Math.max(1,...physical.platforms.map(([,n])=>n));
  const s = statistics(data.games);
  const physicalPlay = physicalPlayStatistics(data);
  const physicalPlayPanel = `<article class="profile-panel"><div class="section-heading"><h2>Played vs. unplayed physical games</h2><span class="muted">${physicalPlay.total} games</span></div><p class="muted small">Each title counts once across owned editions. Playing on any platform counts as played. Wishlist excluded.</p><div class="bar-rows">${[['played','Played'],['unplayed','Unplayed']].map(([key,label])=>`<div class="bar-row"><span>${label}</span><strong>${physicalPlay[key]} <small>${physicalPlay.total?Math.round(physicalPlay[key]/physicalPlay.total*100):0}%</small></strong><div class="bar-track"><span style="width:${physicalPlay.total?physicalPlay[key]/physicalPlay.total*100:0}%"></span></div></div>`).join('')}</div></article>`;
  const favoriteCard = title => {
    const game = data.games.find(g=>g.title===title) || data.games.find(g=>normalizeSearch(g.title)===normalizeSearch(title));
    const artwork = renderCover(game || {title,copies:[]});
    const content = `${artwork}<span class="card-title">${esc(title)}</span>`;
    return game ? `<a class="game-card" href="#section=${sectionOf(game)}&game=${encodeURIComponent(game.id)}">${content}</a>` : `<div class="game-card">${content}</div>`;
  };
  const metric = (value,label,note) => `<article class="profile-metric"><span>${label}</span><strong>${value}</strong>${note?`<small>${note}</small>`:''}</article>`;
  const breakdown = section => {
    const games = data.games.filter(g=>sectionOf(g)===section);
    const rows=Object.entries(statusesFor(section)).map(([key,label])=>({key,label,count:games.filter(g=>g.status===key).length}));
    return `<article class="profile-panel"><div class="section-heading"><h2>${section==='games'?'Games':'Live service'}</h2><span class="muted">${games.length} entries</span></div><div class="status-bar" aria-hidden="true">${rows.filter(r=>r.count).map(r=>`<span class="segment status-${r.key}" style="flex:${r.count}"></span>`).join('')}</div><dl class="status-summary">${rows.map(r=>`<div><dt><i class="status-${r.key}"></i>${r.label}</dt><dd>${r.count}</dd></div>`).join('')}</dl></article>`;
  };
  const maxPlatform=Math.max(1,...s.platforms.map(([,n])=>n)), maxScore=Math.max(1,...s.scores.map(([,n])=>n));
  return `<div class="profile-heading"><div class="profile-identity">${data.profile?.picture?`<img class="profile-avatar" src="${esc(data.profile.picture)}" alt="${esc(data.profile.name)} profile picture">`:''}<div><h1>${esc(data.profile?.name || 'Gashin')}</h1><p class="muted profile-bio">${esc(data.profile?.bio ?? 'Games I’ve played and collected.')}</p></div></div>${editable?'<button id="edit-profile" class="button subtle">Edit profile</button>':''}</div>
  <div class="profile-metrics">${metric(s.total,'Total games','')}${metric(`${(s.seconds/86400).toFixed(1)} days`,'Recorded playtime',`${s.timed} ${s.timed === 1 ? 'game' : 'games'} with time recorded`)}${metric(s.mean==null?'—':s.mean.toFixed(2),'Average score',`${s.rated} rated games · out of 10`)}</div>
  <div class="profile-grid">${breakdown('games')}${physicalPlayPanel}
  <article class="profile-panel"><h2>Played platforms</h2><p class="muted small">One played platform per entry, including live service.</p><div class="bar-rows">${s.platforms.map(([p,n])=>`<a class="bar-row profile-stat-link" href="#section=games&history=all&platform=${encodeURIComponent(p)}"><span>${esc(p)}</span><strong>${n} <small>${s.total?Math.round(n/s.total*100):0}%</small></strong><div class="bar-track"><span style="width:${n/maxPlatform*100}%"></span></div></a>`).join('')||'<p class="muted">No games yet.</p>'}</div></article>
  <article class="profile-panel"><div class="section-heading"><h2>Physical platforms</h2><span class="muted">${physical.total} copies</span></div><p class="muted small">${physical.limited} limited editions · ${physical.regular} regular editions. Each copy or bundle counts once.</p><div class="bar-rows">${physical.platforms.map(([p,n])=>`<a class="bar-row profile-stat-link" href="#section=physical&edition=all&platform=${encodeURIComponent(p)}"><span>${esc(p)}</span><strong>${n} <small>${physical.total?Math.round(n/physical.total*100):0}%</small></strong><div class="bar-track"><span style="width:${n/maxPhysical*100}%"></span></div></a>`).join('')||'<p class="muted">No physical copies yet.</p>'}</div></article>
  <article class="profile-panel"><h2>Owned hardware</h2><div class="guide-lines">${(data.profile?.hardware || '').split('\n').map(line=>line.trim()).filter(Boolean).map(line=>`<p>${esc(line)}</p>`).join('')||'<p class="muted">No hardware recorded yet.</p>'}</div></article>
  <article class="profile-panel"><h2>Scores</h2><p class="muted small">${s.total-s.rated} unrated. Scores range from 1 to 10.</p><div class="score-chart">${s.scores.slice().reverse().map(([score,n])=>`<a class="profile-stat-link" href="#section=games&history=all&score=${score}"><span>${score}</span><div class="bar-track"><span style="width:${n/maxScore*100}%"></span></div><strong>${n}</strong></a>`).join('')}</div></article></div>
  ${Object.entries(favoriteCategories).map(([key,label])=>`<section class="profile-panel scoring-guide"><h2>${label}</h2>${(data.profile?.favorites?.[key]||[]).length?`<div class="favorite-shelf">${data.profile.favorites[key].map(favoriteCard).join('')}</div>`:'<p class="muted">No favorites selected yet.</p>'}</section>`).join('')}<section class="profile-panel scoring-guide"><h2>How I score games</h2><p class="muted">${esc(data.profile?.scoreIntro ?? 'My scores reflect how much I enjoyed a game, rather than an attempt to rate it objectively.')}</p><div class="guide-lines">${(data.profile?.scoringGuide ?? defaultGuide).split('\n').filter(Boolean).map(line=>`<p>${esc(line)}</p>`).join('')}</div></section>`;
}

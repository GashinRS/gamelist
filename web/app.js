import { normalizeSearch } from './search.js';
import { platformOptions, bindPlatformPicker } from './platform-picker.js';
import { createBundleEditor } from './bundle-editor.js';
import { profileHTML, defaultGuide, favoriteCategories } from './profile.js';
import { physicalCopies, physicalEntries, editionGroup, ownershipBadges, gamePhysicalOwnership } from './physical.js';
import { sectionOf, statusesFor, regularStatuses, liveStatuses, compareGames, platforms as allowedPlatforms, playtimeSeconds } from './collection-model.js';
const select = s => document.querySelector(s);
const selectAll = s => [...document.querySelectorAll(s)];
const labels = { all: 'All games', ...regularStatuses, ...liveStatuses };
let section = 'games';
let physicalEdition = 'limited';
let scoreFilter=null, routePlatform=null, allHistory=false;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeLink = url => { try { return new URL(url).protocol === 'https:' ? url : ''; } catch { return ''; } };
const imagePath = src => /^assets\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(src || '') ? src : '';
let data, token = '', status = 'all', view = 'grid', draft, toastTimer;
let importPayload = null, reviewed = false;
function toast(message) { select('#toast').textContent = message; select('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => select('#toast').hidden = true, 5500); }
async function api(route, body) {
  const response = await fetch(`api/${route}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Editor-Token': token }, body: JSON.stringify(body) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Request failed.'); return result;
}
function cover(game) {
  const owned = ownershipBadges(game, data?.bundles);
  const hue = [...game.title].reduce((n, c) => n + c.charCodeAt(0), 0) % 360;
  const fallback = `<div class="cover-fallback" style="--hue:${hue}"><small>GAME</small><strong>${esc(game.title)}</strong><span class="monogram" aria-hidden="true">${esc(game.title.slice(0, 1).toUpperCase())}</span></div>`;
  const restricted = game.metadata?.coverHidden || ['sensitive','unrated'].includes(game.metadata?.coverPolicy);
  const src = !restricted || (game.cover?.origin === 'manual' && game.cover?.sfwOverride) ? imagePath(game.cover?.src) : '';
  return `<div class="cover">${src ? `<img src="${esc(src)}" alt="${esc(game.title)} cover" loading="lazy">` : fallback}${game.rating != null ? `<span class="rating">★ ${esc(game.rating)}</span>` : ''}<div class="format-badges">${owned.physical ? '<span>Physical</span>' : ''}${owned.limited ? '<span>Special edition</span>' : ''}</div></div>`;
}
function handleBrokenImages() { selectAll('img').forEach(img => img.addEventListener('error', () => { const msg = document.createElement('span'); msg.textContent = 'Image unavailable'; msg.className = 'muted'; img.replaceWith(msg); }, { once: true })); }
function render() {
  const profile = section === 'profile', physical = section === 'physical';
  select('#profile-page').hidden = !profile; select('#list-page').hidden = profile; select('.intro').hidden = profile; select('#editor-toolbar').hidden = !token;
  select('#page-title').textContent = physical ? 'Physical collection' : section === 'live-service' ? 'Live service' : 'Games';
  select('.lede').textContent = (data.profile?.name || 'Gashin') + '’s collection';
  if (profile) renderProfile();
  const collection = data.games.filter(g => (allHistory && section==='games') || sectionOf(g) === section);
  const copies = [...collection.flatMap(g => g.copies), ...(data.bundles || []).filter(b=>b.contents.some(i=>collection.some(g=>g.id===i.gameId)))];
  const live = section === 'live-service';
  select('#sections').innerHTML = [['games','Games'],['live-service','Live service'],['physical','Physical collection'],['profile','Profile']].map(([s,label]) => `<a href="#section=${s}" ${s === section ? 'aria-current="page"' : ''}>${label}${s === 'profile' ? '' : `<span class="count">${s === 'physical' ? physicalCopies(data.games, data.bundles).length : data.games.filter(g => sectionOf(g) === s).length}</span>`}</a>`).join('');
  select('#add-game').textContent = physical ? '＋ Add physical copy' : '＋ Add game';
  select('.view-toggle').hidden = physical;
  select('#sort').closest('label').hidden = physical;
  if (physical) { renderPhysical(); return; }
  selectAll('#sort option[value^="completed"]').forEach(option => option.hidden = live);
  if (live && select('#sort').value.startsWith('completed')) select('#sort').value = 'title';
  select('#statuses').setAttribute('aria-label','Play status');
  select('#stats').innerHTML = (live ? [[collection.filter(g => g.status === 'playing').length,'Playing'],[collection.filter(g => g.status === 'retired').length,'Retired'],[copies.length,'Copies recorded']] : [[collection.filter(g => g.status === 'completed').length, 'Completed'], [physicalCopies(data.games, data.bundles).length, 'Physical copies']]).map(([n, l]) => `<div class="stat"><strong>${n.toLocaleString()}</strong><span>${l}</span></div>`).join('');
  select('#statuses').innerHTML = Object.entries({all:'All games', ...statusesFor(section)}).map(([s, label]) => `<button data-status="${s}" aria-pressed="${status === s}">${label}<span class="count">${s === 'all' ? collection.length : collection.filter(g => g.status === s).length}</span></button>`).join('');
  selectAll('#statuses button').forEach(b => b.onclick = () => {
    status = b.dataset.status;
    scoreFilter = null; routePlatform = null; allHistory = false;
    select('#search').value = ''; select('#platform').value = 'all';
    history.replaceState(null, '', '#section=' + section);
    render();
  });
  const platform = routePlatform ?? select('#platform').value;
  const platforms = [...new Set(collection.flatMap(g => [g.platform || 'Not recorded', ...g.copies.map(c => c.platform)]).filter(Boolean))].sort();
  select('#platform').innerHTML = '<option value="all">All platforms</option>' + platforms.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
  select('#platform').value = platforms.includes(platform) ? platform : 'all';
  const query = normalizeSearch(select('#search').value);
  let games = collection.filter(g => (status === 'all' || g.status === status)
    && (!query || normalizeSearch(`${g.title} ${g.notes} ${g.copies.map(c => c.edition).join(' ')}`).includes(query))
    && (select('#platform').value === 'all' || (g.platform || 'Not recorded') === select('#platform').value) && (scoreFilter===null || g.rating!=null && Math.round(g.rating)===scoreFilter));
  const sort = select('#sort').value;
  const compare = compareGames(sort);
  games.sort((a,b) => (live ? Number(b.status === 'playing') - Number(a.status === 'playing') : 0) || compare(a,b));
  select('#result-count').textContent = `${games.length} ${games.length === 1 ? 'game' : 'games'}${games.length !== collection.length ? ` of ${collection.length}` : ''}`;
  select('#shelf').className = 'shelf'; select('#shelf').hidden = view === 'list'; select('#list-table').hidden = view !== 'list';
  renderList(games, sort);
  select('#shelf').innerHTML = games.map(g => `<button class="game-card" data-game="${esc(g.id)}" aria-label="View ${esc(g.title)}">${cover(g)}<span class="card-title">${esc(g.title)}</span><span class="card-meta"><span>${esc(g.platform || 'Platform not recorded')}</span><span class="status-chip" data-status="${esc(g.status)}">${labels[g.status]}</span></span></button>`).join('');
  selectAll('[data-game]').forEach(b => b.onclick = () => { location.hash = `section=${section}&game=${encodeURIComponent(b.dataset.game)}`; });
  select('#empty').hidden = games.length > 0;
  if (!data.games.length) {
    select('#empty').innerHTML = `<span class="empty-icon" aria-hidden="true">▤</span><p class="eyebrow">A COLLECTION WAITING TO BE UNPACKED</p><h2>Your completed games belong here.</h2><p>${data.importInfo?.state === 'awaiting-export' ? 'Your HowLongToBeat profile reports 158 completed entries. The game titles haven’t been imported yet.' : 'Add your first game or import your completed list to start your shelf.'}</p>${token ? '<div class="actions"><button id="empty-import" class="button primary">Import completed list</button><button id="empty-add" class="button subtle">Add a game manually</button></div>' : '<span class="muted small">The collection is being prepared.</span>'}`;
    if (token) { select('#empty-import').onclick = openImport; select('#empty-add').onclick = () => openEditor(); }
  } else select('#empty').innerHTML = '<span class="empty-icon" aria-hidden="true">⌕</span><h2>No games on this shelf.</h2><p>Try another title, play status, or platform.</p><button id="empty-reset" class="button subtle">Clear filters</button>';
  if (select('#empty-reset')) select('#empty-reset').onclick = reset;
  if (!collection.length && live) select('#empty').innerHTML = '<span class="empty-icon" aria-hidden="true">▤</span><h2>Your live service shelf.</h2><p>Choose Live service in a game’s editor to move it here, then mark it Playing or Retired.</p>';
  select('#footer-note').textContent = `${profile ? data.games.length : collection.length} games · ${profile ? data.games.flatMap(g=>g.copies).length + (data.bundles || []).length : copies.length} copies recorded`;
  handleBrokenImages();
}
function copyArtwork(game, copy) {
  if(copy.cover?.publish && imagePath(copy.cover.src)) return `<div class="copy-art"><img src="${esc(copy.cover.src)}" alt="${esc(copy.edition)} cover" loading="lazy"></div>`;
  const photo = copy.photos.find(p=>p.publish && imagePath(p.src));
  return photo ? `<div class="copy-art"><img src="${esc(photo.src)}" alt="${esc(copy.edition)}" loading="lazy"></div>` : `<div class="copy-art">${cover({...game, rating:null, copies:[]})}</div>`;
}
function renderPhysical() {
  const all = physicalEntries(data.games, data.bundles);
  const matchesEdition = (copy,type) => type==='wishlist' ? copy.ownership==='wishlist' : copy.ownership!=='wishlist' && (type==='all'||editionGroup(copy)===type);

  select('#stats').innerHTML = [['limited','Limited editions'],['standard','Regular editions']].map(([type,label])=>`<div class="stat"><strong>${all.filter(({copy})=>matchesEdition(copy,type)).length}</strong><span>${label}</span></div>`).join('');
  select('#statuses').setAttribute('aria-label','Edition type');
  select('#statuses').innerHTML = [['all','All owned'],['limited','Limited edition'],['standard','Regular edition'],['wishlist','Wishlist']].map(([type,label])=>`<button data-edition="${type}" aria-pressed="${physicalEdition===type}">${label}<span class="count">${all.filter(({copy})=>matchesEdition(copy,type)).length}</span></button>`).join('');
  selectAll('[data-edition]').forEach(b=>b.onclick=()=>{physicalEdition=b.dataset.edition;render();});
  const previous = routePlatform ?? select('#platform').value;
  const platforms = [...new Set(all.map(({copy})=>copy.platform || 'Not recorded').filter(Boolean))].sort();
  select('#platform').innerHTML = '<option value="all">All platforms</option>'+platforms.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('');
  select('#platform').value = platforms.includes(previous) ? previous : 'all';
  const query = normalizeSearch(select('#search').value);
  const rows = all.filter(({game,copy})=>matchesEdition(copy,physicalEdition) && (select('#platform').value==='all'||(copy.platform || 'Not recorded')===select('#platform').value) && normalizeSearch(`${game.title} ${copy.edition} ${copy.notes}`).includes(query)).sort((a,b)=>a.game.title.localeCompare(b.game.title)||a.copy.edition.localeCompare(b.copy.edition));
  select('#shelf').hidden=false;select('#list-table').hidden=true;select('#shelf').className='shelf physical-shelf';
  select('#shelf').innerHTML=rows.map(({game,copy,bundle},i)=>{
    const photoCount=copy.photos.filter(p=>p.publish).length;
    return `<button class="game-card physical-card" data-physical="${i}">${copyArtwork(game,copy)}<span class="card-title">${esc(copy.edition)}</span><span class="physical-game-title">${bundle ? copy.contents.length + ' included ' + (copy.contents.length === 1 ? 'game' : 'games') : esc(game.title)}</span><span class="card-meta">${esc(copy.platform||'Platform not recorded')}${copy.region ? ' · '+esc(copy.region) : ''}</span>${photoCount ? `<span class="small muted">${photoCount} collection ${photoCount===1?'photo':'photos'}</span>` : ''}</button>`;
  }).join('');
  selectAll('[data-physical]').forEach(b=>b.onclick=()=>{const {game,copy,bundle}=rows[Number(b.dataset.physical)];if(bundle){location.hash='section=physical&bundle='+encodeURIComponent(copy.id);return;}location.hash=`section=physical&game=${encodeURIComponent(game.id)}&copy=${encodeURIComponent(copy.id)}`;});
  select('#result-count').textContent=`${rows.length} physical ${rows.length===1?'copy':'copies'}`;
  select('#empty').hidden=rows.length>0;
  select('#empty').innerHTML=`<h2>${all.length ? 'No matching editions.' : 'No physical copies recorded yet.'}</h2><p>${token ? 'Add a physical copy, then upload photos of the box and its contents. Select Publish on the photos you want to show here.' : 'Physical editions and collection photos will appear here.'}</p>`;
  select('#footer-note').textContent=`${all.length} physical copies`;
  handleBrokenImages();
}
function physicalDetail(game, copy) {
  select('#detail-content').innerHTML=`<div class="detail-hero physical-detail">${copyArtwork(game,copy)}<div><span class="pill">${editionGroup(copy)==='limited'?'Limited edition':'Regular edition'}</span><h2>${esc(copy.edition)}</h2><p>${esc(game.title)}</p><p class="muted">${[copy.platform,copy.region,copy.language].filter(Boolean).map(esc).join(' · ')}</p><div class="source-links"><a href="#section=${sectionOf(game)}&game=${encodeURIComponent(game.id)}">Game details</a>${safeLink(copy.releaseUrl)?`<a href="${esc(copy.releaseUrl)}" target="_blank" rel="noreferrer">Release details ↗</a>`:''}</div>${token?'<button id="edit-copy" class="button primary">Edit copy & photos</button>':''}</div></div><div class="detail-body">${copy.notes?`<p class="edition-notes">${esc(copy.notes)}</p>`:''}<div class="photo-grid">${copy.photos.filter(p=>p.publish).map(p=>`<button data-photo="${esc(p.src)}" data-caption="${esc(p.caption)}"><img src="${esc(p.src)}" alt="${esc(p.caption||copy.edition)}"><span>${esc(p.caption)}</span></button>`).join('')}</div></div>`;
  if(token) select('#edit-copy').onclick=()=>openEditor(game);
  selectAll('[data-photo]').forEach(b=>b.onclick=()=>{ select('#lightbox-image').src=b.dataset.photo;select('#lightbox-image').alt=b.dataset.caption||copy.edition;select('#lightbox-caption').textContent=b.dataset.caption;select('#lightbox').showModal(); });
  if(!select('#detail').open)select('#detail').showModal();handleBrokenImages();
}
const openBundle = createBundleEditor({getData:()=>data, esc, upload:uploadImage, fetchCover:edition=>api('edition-cover',edition), save:async bundle=>{
  data=await api('bundle',bundle);section='physical';physicalEdition=bundle.ownership==='wishlist'?'wishlist':editionGroup(bundle);
  history.replaceState(null,'','#section=physical&bundle='+encodeURIComponent(bundle.id));render();detail();toast('Bundle saved. Build to update the public site.');
}});
function bundleDetail(bundle) {
  const game={title:bundle.edition,copies:[],cover:bundle.cover || null,metadata:bundle.metadata || null};
  physicalDetail(game,bundle);
  select('#detail-content .detail-hero h2 + p').remove();
  select('#detail-content .source-links a[href^="#section="]').remove();
  const contents=document.createElement('section');contents.className='bundle-contents';
  contents.innerHTML='<h3>Included games <span class="muted">/ '+bundle.contents.length+'</span></h3><ul>'+bundle.contents.map(item=>{
    const g=data.games.find(g=>g.id===item.gameId);
    if (!g) return '<li>'+ (safeLink(item.sourceUrl) ? '<a href="'+esc(item.sourceUrl)+'" target="_blank" rel="noreferrer">'+esc(item.label)+' ↗</a>' : esc(item.label)) + '<small class="muted">Not in play history</small></li>';
    return '<li><a href="#section='+sectionOf(g)+'&game='+encodeURIComponent(g.id)+'">'+esc(item.label||g.title)+'</a>'+(item.label && item.label!==g.title ? '<small class="muted">Tracked under '+esc(g.title)+'</small>' : '')+'</li>';
  }).join('')+'</ul>';
  select('#detail-content .detail-body').prepend(contents);
  if(token){select('#edit-copy').textContent='Edit bundle & photos';select('#edit-copy').onclick=()=>openBundle(bundle);}
}
select('#physical-bundle').onclick=()=>{select('#physical-picker').close();openBundle(null,physicalEdition==='wishlist');};
function addPhysical(game) {
  select('#physical-picker').close();openEditor(game);
  draft.copies.push({id:crypto.randomUUID(),format:'physical',edition:physicalEdition==='limited'?'Limited edition':'Regular edition',editionType:physicalEdition==='wishlist'?'standard':physicalEdition,ownership:physicalEdition==='wishlist'?'wishlist':'owned',platform:game?.platform||'',region:'',language:'',storefront:'',releaseUrl:'',notes:'',photos:[]});
  renderCopies();
  select('#copies-editor').lastElementChild?.scrollIntoView({block:'center'});
}
select('#physical-existing').onclick=()=>addPhysical(data.games.find(g=>g.id===select('#physical-game').value));
select('#physical-new').onclick=()=>addPhysical();
function renderList(games, sort) {
  const live = section === 'live-service';
  const columns = [['title','Name'],['rating','Score'],['playtime','Playtime'],...(!live ? [['completed','Completion date']] : [])];
  const active = key => key === 'title' ? sort.startsWith('title') : sort.startsWith(key);
  const ascending = key => key === 'title' ? sort === 'title' : sort.endsWith('-asc');
  const head = ([key,label]) => '<th scope="col" aria-sort="none"><button type="button" data-sort-column="' + key + '">' + label + (active(key) ? ascending(key) ? ' ↑' : ' ↓' : ' ↕') + '</button></th>';
  const duration = g => { const seconds = playtimeSeconds(g.playtime); return seconds == null ? '—' : Math.floor(seconds/3600).toLocaleString() + 'h ' + Math.floor(seconds%3600/60) + 'm'; };
  select('#list-table').innerHTML = '<table class="game-table"><caption class="sr-only">Games. Click a column heading to sort; click it again to reverse.</caption><thead><tr>' + head(columns[0]) + '<th scope="col">Platform</th><th scope="col">Status</th>' + columns.slice(1).map(head).join('') + '</tr></thead><tbody>' + games.map(g => '<tr><td><button type="button" class="list-game" data-game="' + esc(g.id) + '">' + cover(g) + '<span>' + esc(g.title) + '</span></button></td><td>' + esc(g.platform || '—') + '</td><td class="status-chip" data-status="' + esc(g.status) + '">' + labels[g.status] + '</td><td class="numeric">' + (g.rating == null ? '—' : esc(g.rating)) + '</td><td class="numeric">' + duration(g) + '</td>' + (!live ? '<td class="numeric">' + esc(g.completedOn || '—') + '</td>' : '') + '</tr>').join('') + '</tbody></table>';
  selectAll('[data-sort-column]').forEach(button => button.closest('th').setAttribute('aria-sort',
    active(button.dataset.sortColumn) ? ascending(button.dataset.sortColumn) ? 'ascending' : 'descending' : 'none'));
  selectAll('[data-sort-column]').forEach(button => button.onclick = () => {
    const key = button.dataset.sortColumn;
    select('#sort').value = key === 'title' ? (sort === 'title' ? 'title-desc' : 'title') : (sort === key ? key + '-asc' : key);
    render();
    select('#list-table [data-sort-column="' + key + '"]').focus();
  });
}
function reset() { scoreFilter=null;routePlatform=null;allHistory=false; status = 'all'; select('#search').value = ''; select('#platform').value = 'all'; select('#sort').value = section === 'live-service' ? 'title' : 'completed'; render(); }
function detail() {
  const bundleId = new URLSearchParams(location.hash.slice(1)).get('bundle');
  if(bundleId){ const bundle=(data.bundles||[]).find(b=>b.id===bundleId);if(bundle){bundleDetail(bundle);return;} }
  const id = new URLSearchParams(location.hash.slice(1)).get('game'); if (!id) { if (select('#detail').open) select('#detail').close(); return; }
  const g = data.games.find(g => g.id === id); if (!g) { toast('That game is not in this collection.'); return; }
  const copyId = new URLSearchParams(location.hash.slice(1)).get('copy');
  if (section === 'physical' && copyId) { const copy = g.copies.find(c=>c.id===copyId && c.format==='physical'); if (copy) { physicalDetail(g, copy); return; } }
  const ownership=gamePhysicalOwnership(g,data.bundles);
  const copies=ownership.copies;
  select('#detail-content').innerHTML = `<div class="detail-hero">${cover(g)}<div><div class="detail-tags"><span class="pill status-chip" data-status="${esc(g.status)}">${labels[g.status]}</span>${g.platform ? `<span class="pill">${esc(g.platform)}</span>` : ''}</div><h2>${esc(g.title)}</h2>${g.startedOn ? `<p class="muted">Started ${esc(g.startedOn)}</p>` : ''}${sectionOf(g) !== 'live-service' && g.completedOn ? `<p class="muted">Completed ${esc(g.completedOn)}</p>` : ''}${g.rating != null ? `<p>★ ${g.rating} <span class="muted">/ 10</span></p>` : ''}<div class="source-links">${Object.entries(g.sources).filter(([name, url]) => name !== 'hltb' && safeLink(url)).map(([name, url]) => `<a href="${esc(url)}" target="_blank" rel="noreferrer">${name === 'hltb' ? 'HowLongToBeat' : name.toUpperCase()} ↗</a>`).join('')}</div>${token ? '<button id="edit-current" class="button primary">Edit game</button>' : ''}</div></div><div class="detail-body">${g.notes ? `<p>${esc(g.notes)}</p>` : ''}<h3>Physical copies <span class="muted">/ ${copies.length}</span></h3>${!copies.length ? '<p class="muted">No standalone physical copies recorded.</p>' : copies.map(c => `<article class="copy-card"><span class="eyebrow">${esc(c.format)}${c.platform ? ` / ${esc(c.platform)}` : ''}</span><h4><a href="${c.editionId?'#section=physical&bundle='+encodeURIComponent(c.editionId):'#section=physical&game='+encodeURIComponent(g.id)+'&copy='+encodeURIComponent(c.id)}">${esc(c.edition)}</a></h4><p>${[c.region, c.language, c.storefront].filter(Boolean).map(esc).join(' · ')}</p>${c.notes ? `<p class="edition-notes">${esc(c.notes)}</p>` : ''}${safeLink(c.releaseUrl) ? `<a class="small" href="${esc(c.releaseUrl)}" target="_blank" rel="noreferrer">Release details ↗</a>` : ''}<div class="photo-grid">${c.photos.filter(p => p.publish).map(p => `<button data-photo="${esc(p.src)}" data-caption="${esc(p.caption)}"><img src="${esc(p.src)}" loading="lazy" alt="${esc(p.caption || c.edition)}"><span>${esc(p.caption)}</span></button>`).join('')}</div></article>`).join('')}</div>`;
  const ownedBundles = ownership.bundles;
  if(ownedBundles.length){ const box=document.createElement('section');box.className='owned-bundles';box.innerHTML='<h3>Included in owned bundles</h3>'+ownedBundles.map(b=>`<p><a href="#section=physical&bundle=${encodeURIComponent(b.id)}">${esc(b.edition)}</a> <br><span class="muted small">${esc(b.platform)} · ${b.contents.length} included ${b.contents.length===1?'game':'games'}</span></p>`).join('');select('#detail-content .detail-body').append(box);const noCopies=select('#detail-content .detail-body > p');if(noCopies?.textContent.startsWith('No standalone physical copies recorded.'))noCopies.textContent='No standalone copies recorded.';}
  const primaryMetadata = g.metadata?.vndb || g.metadata?.igdb;
  if (primaryMetadata) {
    const meta = document.createElement('section'); meta.className = 'metadata-details';
    const summary = (primaryMetadata.summary || '').replace(/\[url=[^\]]+]([^]*?)\[\/url]/g, '$1').replace(/\[\/?(?:b|i|u|spoiler)]/g, '');
    meta.innerHTML = `<p class="muted small">${[primaryMetadata.released, ...primaryMetadata.developers, ...primaryMetadata.genres].filter(Boolean).map(esc).join(' · ')}</p>${summary ? `<details><summary>About this game</summary><p>${esc(summary)}</p></details>` : ''}`;
    select('#detail-content .detail-body').prepend(meta);
    if (g.metadata.matchNote) { const note = document.createElement('p'); note.className = 'muted small'; note.textContent = g.metadata.matchNote; meta.append(note); }
  }
  if (g.playtime || g.playedStorefront) {
    const info = document.createElement('p'); info.className = 'muted';
    const hours = g.playtime && /^\d+:\d{2}:\d{2}$/.test(g.playtime) ? `${Number(g.playtime.split(':')[0])}h ${Number(g.playtime.split(':')[1])}m played` : g.playtime;
    info.textContent = [hours, g.playedStorefront ? `Played via ${g.playedStorefront}` : ''].filter(Boolean).join(' · ');
    select('#detail-content .detail-hero > div:last-child').append(info);
  }
  if (token) select('#edit-current').onclick = () => openEditor(g);
  selectAll('[data-photo]').forEach(b => b.onclick = () => { select('#lightbox-image').src = b.dataset.photo; select('#lightbox-image').alt = b.dataset.caption || 'Edition photo'; select('#lightbox-caption').textContent = b.dataset.caption; select('#lightbox').showModal(); });
  if (!select('#detail').open) select('#detail').showModal(); handleBrokenImages();
}
function openEditor(game) {
  draft = game ? structuredClone(game) : { id: crypto.randomUUID(), title: '', status: 'completed', platform: '', completedOn: '', rating: null, notes: '', sources: {}, cover: null, copies: [] };
  select('#editor-title').textContent = game ? 'EDIT GAME' : 'ADD A GAME';
  const form = select('#game-form');
  form.elements.platform.innerHTML = '<option value="">Not recorded</option>' + allowedPlatforms.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
  draft.section = game ? sectionOf(game) : section === 'live-service' ? section : 'games';
  if (!game) draft.status = section === 'live-service' ? 'playing' : section === 'physical' ? 'backlog' : 'completed';
  form.elements.section.value = draft.section;
  renderStatusOptions(draft.status);
  for (const key of ['title', 'status', 'platform', 'startedOn', 'completedOn', 'rating', 'notes', 'playedStorefront']) form.elements[key].value = draft[key] ?? '';
  form.elements.playtime.value = (draft.playtime || '').replace(/:[0-9]{2}$/, match => /^\d+:\d{2}:\d{2}$/.test(draft.playtime) ? '' : match);
  for (const key of ['igdb', 'vndb']) form.elements[key].value = draft.sources[key] || '';
  select('#save-error').textContent = ''; select('#cover-file').value = ''; renderCover(); renderCopies(); select('#editor').showModal();
}
function collectDraft() {
  const form = select('#game-form');
  draft.section = form.elements.section.value;
  for (const key of ['title', 'status', 'platform', 'startedOn', 'completedOn', 'notes', 'playedStorefront']) draft[key] = form.elements[key].value;
  const enteredTime = form.elements.playtime.value.trim();
  const previousMinutes = (draft.playtime || '').split(':').slice(0, 2).join(':');
  if (enteredTime !== previousMinutes) draft.playtime = enteredTime ? enteredTime + ':00' : '';
  draft.rating = form.elements.rating.value === '' ? null : Number(form.elements.rating.value);
  for (const key of ['igdb', 'vndb']) draft.sources[key] = form.elements[key].value;
}
function renderStatusOptions(preferred) {
  const form = select('#game-form'), live = form.elements.section.value === 'live-service';
  const options = statusesFor(form.elements.section.value);
  form.elements.status.innerHTML = Object.entries(options).map(([v,l]) => `<option value="${v}">${l}</option>`).join('');
  form.elements.status.value = Object.hasOwn(options, preferred) ? preferred : 'playing';
  form.elements.completedOn.closest('label').hidden = live;
  form.elements.completedOn.disabled = live;
}
select('#game-form').elements.section.onchange = () => renderStatusOptions(select('#game-form').elements.status.value);
function renderCover() {
  const m = draft.metadata, blocked = ['sensitive','unrated'].includes(m?.coverPolicy);
  select('#metadata-editor').innerHTML = `${m ? `<p class="muted small">${[m.igdb ? `IGDB: ${esc(m.igdb.title)}` : 'IGDB: no confirmed match', m.vndb ? `VNDB: ${esc(m.vndb.title)}` : 'VNDB: no confirmed match'].join('<br>')}</p>` : '<p class="muted">Fetch descriptions and cover candidates using the game title or database links.</p>'}${blocked ? `<p class="cover-warning">${m.coverPolicy === 'sensitive' ? 'The main cover is flagged as sensitive.' : 'The main cover has no reliable safety votes.'} It is hidden. Upload a SFW replacement below and confirm it is safe to publish.</p>` : ''}<div class="actions">${!blocked ? ['vndb','igdb'].filter(p => m?.[p]?.cover).map(p => `<button type="button" class="button subtle" data-cover-provider="${p}">Use ${p.toUpperCase()} cover</button>`).join('') : ''}</div>${m?.candidates?.length ? `<details class="match-candidates"><summary>Unconfirmed matches (${m.candidates.length})</summary><p class="muted small">Choose the correct game, then fetch again. This saves the database link.</p>${m.candidates.map((c,i) => `<button type="button" class="candidate" data-candidate="${i}"><span>${esc(c.provider.toUpperCase())}</span> ${esc(c.title)}</button>`).join('')}</details>` : ''}`;
  selectAll('[data-candidate]').forEach(b => b.onclick = () => {
    const c = m.candidates[Number(b.dataset.candidate)]; select('#game-form').elements[c.provider].value = c.url;
    toast(`${c.provider.toUpperCase()} link selected. Click Fetch to confirm the match.`);
  });
  selectAll('[data-cover-provider]').forEach(b => b.onclick = () => {
    const provider = b.dataset.coverProvider; draft.cover = { src: m[provider].cover, publish: true, origin: provider, sfwOverride: false }; draft.metadata.coverHidden = false; renderCover();
  });
  select('#cover-editor').innerHTML = draft.cover ? `<div class="photo-editor"><img src="${esc(draft.cover.src)}" alt="Selected cover"><div class="photo-controls"><label class="check-label"><input id="cover-publish" type="checkbox" ${draft.cover.publish ? 'checked' : ''}> Publish this cover</label>${draft.cover.origin === 'manual' || !draft.cover.origin ? `<label class="check-label"><input id="cover-sfw" type="checkbox" ${draft.cover.sfwOverride ? 'checked' : ''}> This replacement is SFW (override the hidden main cover)</label>` : `<span class="muted">Source: ${esc(draft.cover.origin.toUpperCase())}</span>`}<button id="cover-remove" class="text-button danger" type="button">Hide cover</button></div></div>` : '<p class="muted">No cover displayed. Upload a safe cover below, or select an available cover above.</p>';
  if (draft.cover) {
    select('#cover-publish').onchange = e => draft.cover.publish = e.target.checked;
    if (select('#cover-sfw')) select('#cover-sfw').onchange = e => draft.cover.sfwOverride = e.target.checked;
    select('#cover-remove').onclick = () => { draft.cover = null; if (draft.metadata) draft.metadata.coverHidden = true; renderCover(); };
  }
}
function renderCopies() {
  const field = (c, key, label, placeholder = '') => `<label>${label}<input data-field="${key}" value="${esc(c[key] || '')}" placeholder="${esc(placeholder)}"></label>`;
  select('#copies-editor').innerHTML = draft.copies.length ? draft.copies.map((c, i) => `<article class="copy-editor" data-copy="${i}"><div class="section-heading"><h4>COPY ${String(i + 1).padStart(2, '0')}</h4><button class="text-button danger remove-copy" type="button">Remove copy</button></div><div class="form-grid"><label>Ownership<select data-field="ownership"><option value="owned" ${c.ownership!=='wishlist'?'selected':''}>Owned</option><option value="wishlist" ${c.ownership==='wishlist'?'selected':''}>Wishlist</option></select></label><label>Edition type<select data-field="editionType">${[['standard','Regular edition'],['limited','Limited edition']].map(([v,l]) => `<option value="${v}" ${editionGroup(c) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${field(c, 'edition', 'Edition name', 'Japanese limited edition')}<label>Platform<select data-field="platform">${platformOptions(data,c.platform,esc,draft.copies.map(c=>c.platform))}</select></label>${field(c, 'region', 'Region', 'Japan')}${field(c, 'language', 'Language', 'Japanese')}${field(c, 'storefront', 'Store / storefront', 'Publisher store…')}${field(c, 'releaseUrl', 'Release URL', 'https://vndb.org/r…')}<label class="wide">Copy notes<textarea data-field="notes" rows="2" placeholder="Included extras, condition…">${esc(c.notes)}</textarea></label></div><div>${c.photos.map((p, j) => `<div class="photo-editor" data-photo-index="${j}"><img src="${esc(p.src)}" alt="Edition photo"><div class="photo-controls"><input class="photo-caption" type="text" value="${esc(p.caption)}" placeholder="Photo caption" aria-label="Photo caption"><label class="check-label"><input class="photo-publish" type="checkbox" ${p.publish ? 'checked' : ''}> Publish this photo</label><button class="text-button danger remove-photo" type="button">Remove photo</button></div></div>`).join('')}</div><label class="file-label">Add photos<input class="copy-upload" type="file" accept="image/jpeg,image/png,image/webp" multiple></label></article>`).join('') : '<p class="muted">No copies recorded yet. You can own a game without having played it, and vice versa.</p>';
  selectAll('.copy-editor').forEach(el => {
    const i = Number(el.dataset.copy), c = draft.copies[i];
    el.querySelectorAll('[data-field]').forEach(input => input.oninput = () => c[input.dataset.field] = input.value);
    bindPlatformPicker(el.querySelector('[data-field="platform"]'),()=>data,c.platform,esc,value=>c.platform=value,draft.copies.map(c=>c.platform));
    el.querySelector('.remove-copy').onclick = () => { draft.copies.splice(i, 1); renderCopies(); };
    el.querySelectorAll('[data-photo-index]').forEach(photo => {
      const j = Number(photo.dataset.photoIndex);
      photo.querySelector('.photo-caption').oninput = e => c.photos[j].caption = e.target.value;
      photo.querySelector('.photo-publish').onchange = e => c.photos[j].publish = e.target.checked;
      photo.querySelector('.remove-photo').onclick = () => { c.photos.splice(j, 1); renderCopies(); };
    });
    el.querySelector('.copy-upload').onchange = async e => {
      const input = e.target; input.disabled = true; select('#save-game').disabled = true;
      try { for (const file of input.files) c.photos.push({ ...await uploadImage(file), caption: '' }); renderCopies(); toast('Photos added. Select Publish for each image you want to share.'); }
      catch (error) { toast(error.message); } finally { input.disabled = false; select('#save-game').disabled = false; }
    };
  });
}
async function uploadImage(file) {
  if (file.size > 30 * 1024 * 1024) throw new Error('Choose an image smaller than 30 MB.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP image.');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const context = canvas.getContext('2d'); context.fillStyle = '#191c21'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  return api('image', { data: canvas.toDataURL('image/jpeg', 0.85) });
}
function openImport() { select('#importer').showModal(); }
function invalidateImport() { reviewed = false; select('#import-confirm').disabled = true; select('#import-review').textContent = ''; select('#import-error').textContent = ''; }
select('#import-file').onchange = async e => {
  invalidateImport(); const file = e.target.files[0]; if (!file) return;
  if (file.size > 10 * 1024 * 1024) { select('#import-error').textContent = 'Choose a file smaller than 10 MB.'; return; }
  importPayload = { text: await file.text(), format: file.name.split('.').pop().toLowerCase() };
  select('#import-text').value = ''; select('#import-review').textContent = `Selected ${file.name}. Review the import before adding games.`;
};
select('#import-text').oninput = () => { invalidateImport(); select('#import-file').value = ''; importPayload = { text: select('#import-text').value, format: 'txt' }; };
select('#import-check').onclick = async () => {
  select('#import-error').textContent = '';
  if (!importPayload?.text?.trim()) { select('#import-error').textContent = 'Choose a file or paste your completed titles.'; return; }
  select('#import-check').disabled = true;
  try { const result = await api('import', { ...importPayload, preview: true }); select('#import-review').innerHTML = `<p><strong>${result.added} new games</strong> · ${result.duplicates} duplicates · ${result.skipped} skipped</p><ul>${result.titles.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`; reviewed = true; select('#import-confirm').disabled = false; }
  catch (e) { select('#import-error').textContent = e.message; } finally { select('#import-check').disabled = false; }
};
select('#import-confirm').onclick = async () => {
  if (!reviewed) return; select('#import-confirm').disabled = true;
  try { const result = await api('import', importPayload); data = result.collection; render(); select('#importer').close(); toast(`Imported ${result.added} games. ${result.duplicates} duplicates left unchanged.`); invalidateImport(); }
  catch (e) { select('#import-error').textContent = e.message; select('#import-confirm').disabled = false; }
};
select('#game-form').onsubmit = async e => {
  e.preventDefault(); collectDraft(); select('#save-game').disabled = true; select('#save-error').textContent = '';
  if (draft.cover && ['sensitive','unrated'].includes(draft.metadata?.coverPolicy) && !(draft.cover.origin === 'manual' && draft.cover.sfwOverride)) {
    select('#save-error').textContent = 'Confirm that your replacement cover is SFW, or remove it to keep the main cover hidden.'; select('#save-game').disabled = false; return;
  }
  try {
    data = await api('game', draft); select('#editor').close(); section = section === 'physical' ? 'physical' : draft.section; status = 'all';
    const copyId = new URLSearchParams(location.hash.slice(1)).get('copy');
    const copyHash = section === 'physical' && draft.copies.some(c=>c.id===copyId && c.format==='physical') ? '&copy=' + encodeURIComponent(copyId) : '';
    history.replaceState(null, '', '#section=' + section + (select('#detail').open ? '&game=' + encodeURIComponent(draft.id) + copyHash : ''));
    render(); if (select('#detail').open) detail(); toast('Saved locally. Build the site when you’re ready to publish.');
  }
  catch (error) { select('#save-error').textContent = error.message; } finally { select('#save-game').disabled = false; }
};
select('#cover-file').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  e.target.disabled = true; select('#save-game').disabled = true;
  try { draft.cover = { ...await uploadImage(file), origin: 'manual', sfwOverride: false }; renderCover(); toast('Replacement added. Confirm it is SFW and select Publish to share it.'); }
  catch (error) { toast(error.message); } finally { e.target.disabled = false; select('#save-game').disabled = false; }
};
select('#add-copy').onclick = () => { draft.copies.push({ id: crypto.randomUUID(), format: 'physical', edition: 'Standard edition', editionType: 'standard', platform: draft.platform, region: '', language: '', storefront: '', releaseUrl: '', notes: '', photos: [] }); renderCopies(); };
select('#add-game').onclick = () => { if (section !== 'physical') return openEditor(); select('#physical-game').innerHTML = data.games.slice().sort((a,b)=>a.title.localeCompare(b.title)).map(g=>`<option value="${esc(g.id)}">${esc(g.title)}</option>`).join(''); select('#physical-existing').disabled = !data.games.length; select('#physical-picker').showModal(); };
select('#fetch-metadata').onclick = async () => {
  if (!select('#game-form').reportValidity()) return;
  const b = select('#fetch-metadata'); b.disabled = true; select('#save-game').disabled = true; b.textContent = 'Fetching…';
  collectDraft(); select('#save-error').textContent = '';
  try {
    data = await api('game', draft);
    data = await api('enrich', { id: draft.id });
    draft = structuredClone(data.games.find(g => g.id === draft.id));
    for (const p of ['igdb','vndb']) select('#game-form').elements[p].value = draft.sources[p] || '';
    renderCover(); render(); toast('Metadata saved. Sensitive covers remain hidden.');
  } catch (e) { select('#save-error').textContent = e.message; }
  finally { b.disabled = false; select('#save-game').disabled = false; b.textContent = 'Fetch from IGDB + VNDB'; }
};
select('#build').onclick = async () => { const button=select('#build');button.disabled=true;button.textContent='Building…';try { await api('build', {});toast('Build complete. Refresh the preview to see your saved changes.'); } catch (e) { toast(e.message); } finally {button.disabled=false;button.textContent='Build site';} };
select('#search').oninput = render; for (const id of ['platform', 'sort']) select(`#${id}`).onchange = () => {if(id==='platform')routePlatform=null;render();};
select('#reset').onclick = reset;
for (const v of ['grid', 'list']) select(`#${v}-view`).onclick = () => { view = v; select('#grid-view').setAttribute('aria-pressed', v === 'grid'); select('#list-view').setAttribute('aria-pressed', v === 'list'); render(); };
selectAll('[data-close]').forEach(b => b.onclick = () => select(`#${b.dataset.close}`).close());
select('#detail').addEventListener('close', () => { if (['game','bundle'].some(key=>new URLSearchParams(location.hash.slice(1)).has(key))) history.replaceState(null, '', '#section=' + section); });
function route() {
  const params = new URLSearchParams(location.hash.slice(1));
  const game = data.games.find(g => g.id === params.get('game'));
  const next = params.has('bundle') || params.get('section') === 'physical' ? 'physical' : game ? sectionOf(game) : ['live-service','physical','profile'].includes(params.get('section')) ? params.get('section') : 'games';
  if(params.has('score')||params.has('platform')){section=next;status='all';select('#search').value='';allHistory=params.get('history')==='all';scoreFilter=/^(?:[1-9]|10)$/.test(params.get('score')||'')?Number(params.get('score')):null;routePlatform=params.get('platform');if(next==='physical')physicalEdition='all';render();}
  else if (next !== section || (!params.has('game') && !params.has('bundle'))) { section = next; reset(); } else render();
  detail();
}
window.addEventListener('hashchange', () => data && route());
function renderProfile() {
  select('#profile-page').innerHTML = profileHTML(data, esc, Boolean(token), cover);
  handleBrokenImages();
  if (select('#edit-profile')) select('#edit-profile').onclick = () => {
    const form = select('#profile-form'), profile = data.profile || {};
    form.elements.picture.value = profile.picture || '';
    select('#profile-picture-file').value = '';
    const showPicture = () => {
      const src = form.elements.picture.value;
      select('#profile-picture-preview').innerHTML = src ? `<img class="profile-avatar" src="${esc(src)}" alt="Selected profile picture">` : '<p class="muted">No profile picture selected.</p>';
      select('#profile-picture-remove').hidden = !src;
    };
    showPicture();
    select('#profile-picture-remove').onclick = () => { form.elements.picture.value='';showPicture(); };
    select('#profile-picture-file').onchange = async e => {
      const file=e.target.files[0];if(!file)return;
      e.target.disabled=true;select('#save-profile').disabled=true;select('#profile-error').textContent='';
      try { const image=await uploadImage(file);form.elements.picture.value=image.src;showPicture(); }
      catch(error){select('#profile-error').textContent=error.message;}
      finally{e.target.disabled=false;select('#save-profile').disabled=false;}
    };
    const defaults = {hardware:'', name:'Gashin', bio:'Games I’ve played and collected.', scoreIntro:'My scores reflect how much I enjoyed a game, rather than an attempt to rate it objectively.', scoringGuide:defaultGuide};
    for (const key of Object.keys(defaults)) form.elements[key].value = profile[key] ?? defaults[key];
    select('#profile-favorites').innerHTML=Object.entries(favoriteCategories).map(([key,label])=>`<section class="form-section"><h3>${label}</h3>${Array.from({length:5},(_,i)=>`<label class="block-label">Game ${i+1}<input name="favorite-${key}-${i}" data-favorite-search autocomplete="off" maxlength="300" value="${esc(profile.favorites?.[key]?.[i]||'')}"><span class="favorite-suggestions" hidden></span></label>`).join('')}</section>`).join('')+`<datalist id="favorite-game-titles">${data.games.map(g=>`<option value="${esc(g.title)}"></option>`).join('')}</datalist>`;
    selectAll('[data-favorite-search]').forEach(input=>{
      const suggestions=input.nextElementSibling;
      const update=()=>{const query=normalizeSearch(input.value);const matches=query?data.games.filter(g=>normalizeSearch(g.title).includes(query)).slice(0,12):[];suggestions.innerHTML=matches.map(g=>`<button type="button" class="favorite-suggestion">${esc(g.title)}</button>`).join('');suggestions.hidden=!matches.length;[...suggestions.children].forEach((button,i)=>button.onclick=()=>{input.value=matches[i].title;suggestions.hidden=true;input.focus();});};
      input.oninput=update;input.onfocus=update;input.onkeydown=e=>{if(e.key==='Escape'){suggestions.hidden=true;e.stopPropagation();}};
      input.onblur=()=>setTimeout(()=>suggestions.hidden=true,150);
    });
    select('#profile-error').textContent = ''; select('#profile-editor').showModal();
  };
}
select('#profile-form').onsubmit = async e => {
  e.preventDefault(); select('#save-profile').disabled = true; select('#profile-error').textContent = '';
  try { const values=Object.fromEntries(new FormData(e.currentTarget));values.favorites=Object.fromEntries(Object.keys(favoriteCategories).map(key=>[key,Array.from({length:5},(_,i)=>(()=>{const value=values['favorite-'+key+'-'+i].trim();return data.games.find(g=>normalizeSearch(g.title)===normalizeSearch(value))?.title||value;})()).filter(Boolean)]));const saved=await api('profile', values);if(JSON.stringify(saved.profile.favorites)!==JSON.stringify(values.favorites)){select('#profile-error').textContent='Favorites were not saved. Restart the local editor and try again.';return;}data=saved; select('#profile-editor').close(); render(); toast('Profile saved. Build to update the public site.'); }
  catch(e) { select('#profile-error').textContent = e.message; }
  finally { select('#save-profile').disabled = false; }
};
async function init() {
  try {
    if (location.hostname === '127.0.0.1') {
      try { const session = await api('session'); token = session.token; } catch { /* Public preview has no editor API. */ }
    }
    data = token ? await api('collection') : await fetch('collection.json').then(r => { if (!r.ok) throw new Error('Could not load the collection.'); return r.json(); });
    select('#editor-toolbar').hidden = !token; if (token) select('#mode').textContent = 'LOCAL EDITOR'; route();
  } catch (e) { select('#result-count').textContent = 'Collection unavailable'; select('#empty').hidden = false; select('#empty').innerHTML = `<h2>Couldn’t load the shelf.</h2><p>${esc(e.message)} Try refreshing the page.</p>`; }
}
init();

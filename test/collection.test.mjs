import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, parseImport, mergeImport, exportPlaytime } from '../scripts/importer.mjs';
import { cleanGame, publicCollection, validate, normalizeDate } from '../scripts/lib.mjs';
import { matchCandidates, vnSafety } from '../scripts/providers.mjs';
import { enrichGame } from '../scripts/enrich.mjs';
import { sectionOf, compareGames } from '../web/collection-model.js';
import { statistics, playtimeSeconds, physicalStatistics } from '../web/profile.js';
import { physicalCopies, editionGroup, ownershipBadges } from '../web/physical.js';
import { existingPlatforms, bindPlatformPicker } from '../web/platform-picker.js';

test('platform picker includes played and owned platforms and restores cancelled additions',()=>{
  const data={games:[{platform:'PC',copies:[{platform:'PlayStation 5'},{platform:'PC'}]}],bundles:[{platform:'Nintendo Switch'}]};
  assert.deepEqual(existingPlatforms(data),['Nintendo Switch','PC','PlayStation 5']);
  const select={value:'PC'};let changed='';
  const oldWindow=globalThis.window;
  try {
    globalThis.window={prompt:()=>null};
    bindPlatformPicker(select,()=>data,'PC',s=>s,v=>changed=v);
    select.value='__add_platform__';select.onchange();assert.equal(select.value,'PC');assert.equal(changed,'');
    globalThis.window.prompt=()=> ' pc ';
    select.value='__add_platform__';select.onchange();assert.equal(changed,'PC');
    globalThis.window.prompt=()=> 'Sega Saturn';
    select.value='__add_platform__';select.onchange();assert.equal(changed,'Sega Saturn');
    assert.ok(existingPlatforms(data).includes('Sega Saturn'));
  } finally {globalThis.window=oldWindow;}
});

test('physical profile counts owned platforms and bundles once, excluding digital copies',()=>{
  const s=physicalStatistics({games:[{platform:'PC',copies:[{format:'physical',platform:'PlayStation 5',editionType:'limited'},{format:'physical',platform:'',editionType:'standard'},{format:'digital',platform:'PC'}]}],bundles:[{platform:'Nintendo Switch',editionType:'limited',contents:[{label:'A'},{label:'B'}]}]});
  assert.equal(s.total,3);assert.equal(s.limited,2);assert.equal(s.regular,1);
  assert.deepEqual(s.platforms,[['Nintendo Switch',1],['Not recorded',1],['PlayStation 5',1]]);
  assert.deepEqual(physicalStatistics({games:[]}).platforms,[]);
});

test('bundle counts once while linking multiple games and preserves game statistics',()=>{
  const d=validate({version:1,games:[{id:'a',title:'A',status:'completed',rating:8,playtime:'10:00:00'},{id:'b',title:'B',status:'backlog'}],bundles:[{id:'box',edition:'Box',contents:[{gameId:'a',label:''},{gameId:'b',label:'Episode 1'},{gameId:'b',label:'Episode 2'}],photos:[{src:'assets/private.jpg',publish:false},{src:'assets/public.jpg',publish:true}]}]});
  assert.equal(physicalCopies(d.games,d.bundles).length,1);
  assert.equal(statistics(d.games).seconds,36000);assert.equal(statistics(d.games).mean,8);
  const pub=publicCollection(d);assert.equal(pub.bundles[0].contents.length,3);assert.equal(pub.bundles[0].photos.length,1);
  assert.equal(d.bundles[0].photos.length,2);
  assert.throws(()=>validate({...d,bundles:[{contents:[{gameId:'missing'}]}]}));
  assert.throws(()=>validate({...d,bundles:[{contents:[]}]}));
});

test('physical collection counts individual editions and excludes digital copies',()=>{
  const g=cleanGame({title:'Game',status:'completed',copies:[{format:'physical',editionType:'standard'},{format:'physical',editionType:'collectors'},{format:'digital',editionType:'limited'}]});
  const rows=physicalCopies([g]);assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>editionGroup(r.copy)),['standard','limited']);
  assert.equal(g.copies[1].editionType,'limited');
  assert.equal(publicCollection({version:1,games:[g]}).games[0].copies.length,2);
});

test('played platforms are fixed and iOS is normalized to Mobile', () => {
  assert.equal(cleanGame({title:'Phone',status:'playing',platform:'iOS'}).platform,'Mobile');
  assert.equal(cleanGame({title:'New',status:'playing',platform:'Nintendo Switch 2'}).platform,'Nintendo Switch 2');
  assert.throws(()=>cleanGame({title:'Typo',status:'playing',platform:'Nintndo'}));
});
test('playtime sorting is numeric and missing times remain last',()=>{
  const games=[{title:'Unknown',playtime:''},{title:'Long',playtime:'100:00:00'},{title:'Short',playtime:'9:30:00'},{title:'Zero',playtime:'0:00:00'}];
  assert.deepEqual([...games].sort(compareGames('playtime')).map(g=>g.title),['Long','Short','Zero','Unknown']);
  assert.deepEqual([...games].sort(compareGames('playtime-asc')).map(g=>g.title),['Zero','Short','Long','Unknown']);
});

test('profile statistics count recorded time and rated games without inventing missing values', () => {
  assert.equal(playtimeSeconds('120:30:15'),433815);
  assert.equal(playtimeSeconds('--'),null); assert.equal(playtimeSeconds('1:99:00'),null);
  const s=statistics([{playtime:'25:00:00',rating:0,platform:'PC'},{playtime:'1:30:00',rating:8,platform:'PC'},{playtime:'',rating:null,platform:''}]);
  assert.equal(s.seconds,95400);assert.equal(s.timed,2);assert.equal(s.mean,4);assert.equal(s.rated,2);
  assert.deepEqual(s.platforms,[['PC',2],['Not recorded',1]]);
  assert.equal(statistics([]).mean,null);
});
test('profile text survives validation and public builds',()=>{
  const result=publicCollection({version:1,profile:{name:'Test',bio:'About',scoreIntro:'Personal',scoringGuide:'10 — Favourite'},games:[]});
  assert.equal(result.profile.scoringGuide,'10 — Favourite');assert.equal(result.profile.bio,'About');
});

test('live service only accepts playing and retired; old records stay regular', () => {
  assert.equal(sectionOf(cleanGame({title:'Old',status:'completed'})), 'games');
  for(const status of ['playing','retired']) assert.equal(publicCollection({version:1,games:[{title:'Live',section:'live-service',status}],profile:{}}).games[0].section,'live-service');
  assert.throws(()=>cleanGame({title:'Live',section:'live-service',status:'completed'}));
  assert.throws(()=>cleanGame({title:'Regular',status:'retired'}));
});
test('score and completion sorts put missing values last in both directions', () => {
  const games=[{title:'Missing',rating:null,completedOn:''},{title:'B',rating:0,completedOn:'2020'},{title:'A',rating:9,completedOn:'2024-03'}];
  for(const [sort,expected] of [['rating',['A','B','Missing']],['rating-asc',['B','A','Missing']],['completed',['A','B','Missing']],['completed-asc',['B','A','Missing']],['title-desc',['Missing','B','A']]]) assert.deepEqual([...games].sort(compareGames(sort)).map(g=>g.title),expected);
});
const collection = games => ({ version: 1, profile: { name: 'Test' }, games });

test('matching rejects ambiguous records and loose VNDB aliases', () => {
  assert.equal(matchCandidates('Game', [{name:'Game',id:1},{name:'Game',id:2}], 'igdb'), null);
  assert.equal(matchCandidates('Game', [{title:'Spin-off',aliases:['Game']}], 'vndb'), null);
  assert.equal(matchCandidates('Pokémon', [{name:'Pokemon',id:3}], 'igdb').id, 3);
});

test('VNDB safety requires votes and hides any sexual or violent rating', () => {
  const record = {image:{url:'https://t.vndb.org/cv/a.jpg',sexual:0,violence:0,votecount:3}};
  assert.equal(vnSafety(record), 'safe');
  for(const fields of [{sexual:0.01},{violence:1}]) assert.equal(vnSafety({image:{...record.image,...fields}}), 'sensitive');
  assert.equal(vnSafety({image:{...record.image,votecount:0}}), 'unrated');
  assert.equal(vnSafety({image:{...record.image,violence:null}}), 'unrated');
});

const fixtures = (sexual = 0, votes = 3) => {
  const downloads=[];
  return {downloads,services:{
    searchIGDB:async()=>[{id:1,name:'Game',url:'https://www.igdb.com/games/game',cover:{image_id:'cover'}}],
    searchVNDB:async()=>[{id:'v1',title:'Game',image:{url:'https://t.vndb.org/cv/a.jpg',sexual,violence:0,votecount:votes}}],
    downloadCover:async(url,name)=>{downloads.push(url);return `assets/${name}.jpg`;}
  }};
};
test('enrichment fetches both covers and prefers VNDB; sensitive/unrated VNs never fall back', async () => {
  const game={title:'Game',status:'completed',sources:{},copies:[]};
  const safe=fixtures(); const result=await enrichGame(game,{services:safe.services});
  assert.equal(safe.downloads.length,2);assert.equal(result.cover.origin,'vndb');
  for(const f of [fixtures(0.1),fixtures(0,0)]) {
    const blocked=await enrichGame(game,{services:f.services});
    assert.equal(blocked.cover,null);assert.equal(f.downloads.length,0);
    assert.equal(blocked.metadata.igdb.cover,null);
  }
});
test('manual SFW replacements survive refresh and unsafe covers cannot enter public output', async () => {
  const game={title:'Game',status:'completed',sources:{},copies:[],cover:{src:'assets/custom.jpg',origin:'manual',sfwOverride:true,publish:true}};
  const result=await enrichGame(game,{services:fixtures(1).services,refresh:true});
  const pub=publicCollection(collection([result])).games[0];
  assert.equal(pub.cover.src,'assets/custom.jpg');
  assert.equal(pub.metadata.igdb.cover,undefined);assert.equal(pub.metadata.candidates,undefined);
  for(const cover of [{...game.cover,sfwOverride:false},{...game.cover,origin:'igdb'}]) {
    assert.equal(publicCollection(collection([{...result,cover}])).games[0].cover,null);
  }
});

test('CSV preserves quoted commas, escaped quotes, multiline data and BOM', () => {
  const rows = parseCSV('\uFEFFGame Name,Platform,Notes\r\n"Title, Part II",PC,"Line 1\nLine ""2"""\r\n');
  assert.equal(rows.length, 1); assert.equal(rows[0].gamename, 'Title, Part II'); assert.equal(rows[0].notes, 'Line 1\nLine "2"');
});
test('completed imports do not invent ownership or ratings and skip other statuses', () => {
  const r = parseImport('Game Name,Game ID,Status,Platform,Rating\nA,123,Completed,PC,90\nB,456,Playing,Switch,8');
  assert.equal(r.games.length, 1); assert.equal(r.skipped, 1); assert.equal(r.games[0].sources.hltb, 'https://howlongtobeat.com/game/123');
  assert.deepEqual(r.games[0].copies, []); assert.equal(r.games[0].rating, null);
});
test('repeat imports preserve manual status, copies and notes', () => {
  const g = cleanGame({ title: 'A', status: 'playing', notes: 'Keep me', copies: [{ format: 'physical', edition: 'Limited', editionType: 'limited' }] });
  const result = mergeImport(collection([g]), parseImport('a\nB\nB', 'txt').games);
  assert.equal(result.added, 1); assert.equal(result.duplicates, 2); assert.equal(result.collection.games[0].status, 'playing');
  assert.equal(result.collection.games[0].copies[0].edition, 'Limited');
});
test('public data omits unapproved images but preserves multiple copies', () => {
  const g = cleanGame({ title: 'A', status: 'completed', cover: { src: 'assets/cover.jpg', publish: false }, copies: [
    { format: 'physical', photos: [{ src: 'assets/one.jpg', publish: true }, { src: 'assets/two.jpg', publish: false }] }, { format: 'physical' }
  ] });
  const pub = publicCollection(collection([g])); assert.equal(pub.games[0].cover, null); assert.equal(pub.games[0].copies.length, 2);
  assert.equal(pub.games[0].copies[0].photos.length, 1); assert.equal(g.copies[0].photos.length, 2);
});
test('invalid paths, duplicate IDs, malformed CSV and missing titles fail explicitly', () => {
  assert.throws(() => cleanGame({ title: 'A', status: 'completed', copies: [{ format: 'physical', photos: [{ src: '../.env', publish: true }] }] }));
  assert.throws(() => validate(collection([{ id: 'same', title: 'A', status: 'completed' }, { id: 'same', title: 'B', status: 'completed' }])));
  assert.throws(() => parseCSV('Title\n"unfinished')); assert.throws(() => parseImport('Weird column\nA'));
});
test('unsafe source links are rejected and HTML stays plain data', () => {
  const g = cleanGame({ title: '<script>alert(1)</script>', status: 'completed', sources: { igdb: 'javascript:alert(1)', vndb: 'https://vndb.org/v17' } });
  assert.equal(g.sources.igdb, undefined); assert.equal(g.sources.vndb, 'https://vndb.org/v17');
});
test('real HLTB full-export flags select only completed and preserve review scale and partial dates', () => {
  const csv = 'Title,Playing,Backlog,Completed,Platform,Completion Date,Review,Review Notes,General Notes,Progress,Storefront\nA,,,X,PC,2020-00-00,80,Good,Extra,25:30:00,Steam\nB,X,,,PC,,0,,,--,\nC,,X,,PC,,0,,,--,';
  const result = parseImport(csv);
  assert.equal(result.games.length, 1); assert.equal(result.skipped, 2);
  const g = result.games[0]; assert.equal(g.completedOn, '2020'); assert.equal(g.rating, 8); assert.equal(g.notes, 'Good\n\nExtra');
  assert.equal(g.playtime, '25:30:00'); assert.equal(g.playedStorefront, 'Steam'); assert.equal(g.copies.length, 0);
});
test('partial dates keep known precision and invalid dates are discarded', () => {
  assert.equal(normalizeDate('2019-04-00'), '2019-04'); assert.equal(normalizeDate('2019-00-00'), '2019');
  assert.equal(normalizeDate('2024-02-29'), '2024-02-29'); assert.equal(normalizeDate('2023-02-29'), ''); assert.equal(normalizeDate('0000-00-00'), '');
});

test('unlinked owned titles survive editing and publishing without creating play history',()=>{
  const d=validate({version:1,games:[],bundles:[{id:'box',edition:'Box',contents:[{label:'Owned title',sourceUrl:'https://vndb.org/v83'}]}]});
  assert.equal(d.games.length,0);assert.equal(statistics(d.games).seconds,0);
  assert.equal(physicalCopies(d.games,d.bundles).length,1);
  const pub=publicCollection(d);assert.deepEqual(pub.bundles[0].contents,[{gameId:'',label:'Owned title',sourceUrl:'https://vndb.org/v83'}]);
  assert.throws(()=>validate({...d,bundles:[{contents:[{gameId:'',label:'   '}]}]}));
  assert.equal(validate({...d,bundles:[{contents:[{label:'Title',sourceUrl:'javascript:alert(1)'}]}]}).bundles[0].contents[0].sourceUrl,'');
});

test('physical-only cover art follows the same safety and publication rules as games',()=>{
 const base={version:1,games:[],bundles:[{id:'owned',edition:'Owned game',contents:[{label:'Owned game'}],cover:{src:'assets/safe.jpg',publish:true,origin:'vndb'},metadata:{coverPolicy:'safe'}}]};
 assert.equal(publicCollection(base).bundles[0].cover.src,'assets/safe.jpg');
 assert.equal(physicalCopies([],publicCollection(base).bundles)[0].game.cover.src,'assets/safe.jpg');
 const b=base.bundles[0];
 assert.equal(publicCollection({...base,bundles:[{...b,metadata:{coverPolicy:'sensitive'}}]}).bundles[0].cover,null);
 assert.equal(publicCollection({...base,bundles:[{...b,cover:{...b.cover,publish:false}}]}).bundles[0].cover,null);
 assert.equal(publicCollection(base).games.length,0);
});

test('start dates retain export precision and survive validation and publishing',()=>{
 const r=parseImport('Title,Start Date\nA,2024-03-00\nB,2023-00-00\nC,2024-02-29\nD,2023-02-29\nE,');
 assert.deepEqual(r.games.map(g=>g.startedOn),['2024-03','2023','2024-02-29','','']);
 assert.deepEqual(publicCollection({version:1,games:r.games}).games.map(g=>g.startedOn),['2024-03','2023','2024-02-29','','']);
 const live=cleanGame({title:'Live',section:'live-service',status:'retired',startedOn:'2020-01-01'});
 assert.equal(live.startedOn,'2020-01-01');
});

test('ownership badges include linked physical bundles without matching unlinked titles',()=>{
 const game={id:'owned',copies:[]};
 const bundles=[{format:'physical',editionType:'limited',contents:[{gameId:'owned'}]}];
 assert.deepEqual(ownershipBadges(game,bundles),{physical:true,limited:true});
 assert.deepEqual(ownershipBadges({id:'other',copies:[]},bundles),{physical:false,limited:false});
 assert.deepEqual(ownershipBadges({id:'regular',copies:[{format:'physical',editionType:'standard'}]}),{physical:true,limited:false});
});

test('HLTB uses the highest progress or completion time and preserves existing manual time on reimport',()=>{
 assert.equal(exportPlaytime({progress:'3:00:00',mainstory:'41:00:00'}),'41:00:00');
 assert.equal(exportPlaytime({progress:'110:00:00',mainstory:'60:00:00'}),'110:00:00');
 assert.equal(exportPlaytime({progress:'--',mainsides:'26:30:00'}),'26:30:00');
 const a=cleanGame({id:'a',title:'A',status:'completed',playtime:''});
 const b=cleanGame({id:'b',title:'B',status:'completed',playtime:'24:00:00'});
 const result=mergeImport({games:[a,b]},[cleanGame({...a,playtime:'41:00:00'}),cleanGame({...b,playtime:'6:00:00'})]);
 assert.equal(result.collection.games[0].playtime,'41:00:00');assert.equal(result.collection.games[1].playtime,'24:00:00');assert.equal(a.playtime,'');
});

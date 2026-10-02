export const regularStatuses = { playing: 'Playing', completed: 'Completed', backlog: 'Backlog', 'on-hold': 'On hold', dropped: 'Dropped' };
export const liveStatuses = { playing: 'Playing', retired: 'Retired' };
export const sectionOf = game => game.section === 'live-service' ? 'live-service' : 'games';
export const statusesFor = section => section === 'live-service' ? liveStatuses : regularStatuses;
export const platforms = ['Emulated', 'Mobile', 'Nintendo 3DS', 'Nintendo DS', 'Nintendo Switch', 'Nintendo Switch 2', 'PC', 'PlayStation 4', 'PlayStation Vita'];
export const normalizePlatform = value => /^ios$/i.test(String(value).trim()) ? 'Mobile' : /^(?:nintendo\s+)?switch$/i.test(String(value).trim()) ? 'Nintendo Switch' : String(value || '').trim();
export function playtimeSeconds(value) {
  const match = String(value || '').trim().match(/^(\d+):([0-5]\d)(?::([0-5]\d))?$/);
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] || 0) : null;
}
export function compareGames(sort) {
  return (a, b) => {
    const name = a.title.localeCompare(b.title);
    if (sort === 'title-desc') return -name;
    const rating = sort.startsWith('rating'), date = sort.startsWith('completed'), time = sort.startsWith('playtime');
    if (!rating && !date && !time) return name;
    const av = time ? playtimeSeconds(a.playtime) : rating ? a.rating : a.completedOn, bv = time ? playtimeSeconds(b.playtime) : rating ? b.rating : b.completedOn;
    const missing = v => v == null || v === '';
    if (missing(av) || missing(bv)) return missing(av) === missing(bv) ? name : missing(av) ? 1 : -1;
    const value = rating || time ? Number(av) - Number(bv) : av.localeCompare(bv);
    return (sort.endsWith('-asc') ? value : -value) || name;
  };
}

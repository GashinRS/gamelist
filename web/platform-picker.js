const addedPlatforms = new Set();
const addValue = '__add_platform__';
export function existingPlatforms(data, extra = []) {
  return [...new Set([...data.games.flatMap(g=>[g.platform,...(g.copies||[]).map(c=>c.platform)]),...(data.bundles||[]).map(b=>b.platform),...addedPlatforms,...extra].map(p=>p?.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}
export function platformOptions(data, current, esc, extra = []) {
  return '<option value="">Not recorded</option>'+existingPlatforms(data,[current,...extra]).map(p=>`<option value="${esc(p)}" ${p===current?'selected':''}>${esc(p)}</option>`).join('')+`<option value="${addValue}">Add new platform…</option>`;
}
export function bindPlatformPicker(select, getData, current, esc, onChange, extra = []) {
  let previous = current || '';
  select.oninput = null;
  select.onchange = () => {
    let value=select.value;
    if(value===addValue){
      const name=window.prompt('New platform name:');
      if(!name?.trim()){select.value=previous;return;}
      const trimmed=name.trim().slice(0,100);
      value=existingPlatforms(getData(),extra).find(p=>p.toLowerCase()===trimmed.toLowerCase())||trimmed;
      addedPlatforms.add(value);
      select.innerHTML=platformOptions(getData(),value,esc,extra);
      select.value=value;
    }
    previous=value;onChange(value);
  };
}

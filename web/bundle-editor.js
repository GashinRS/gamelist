import { platformOptions, bindPlatformPicker } from './platform-picker.js';
export function createBundleEditor({getData,save,upload,fetchCover,esc}) {
  const dialog=document.createElement('dialog');dialog.id='bundle-editor';document.body.append(dialog);
  let draft;
  function render() {
    const games=getData().games.slice().sort((a,b)=>a.title.localeCompare(b.title));
    const input=(key,label)=>`<label>${label}<input name="${key}" value="${esc(draft[key])}" ${key==='edition'?'required':''}></label>`;
    dialog.innerHTML=`<form><div class="dialog-top"><h2>Edit physical edition</h2><button type="button" class="icon-button" data-action="close" aria-label="Close edition editor">✕</button></div><div class="form-body"><div class="form-grid">${input('edition','Release / box name')}<label>Ownership<select name="ownership"><option value="owned" ${draft.ownership!=='wishlist'?'selected':''}>Owned</option><option value="wishlist" ${draft.ownership==='wishlist'?'selected':''}>Wishlist</option></select></label><label>Edition type<select name="editionType"><option value="limited" ${draft.editionType==='limited'?'selected':''}>Limited edition</option><option value="standard" ${draft.editionType==='standard'?'selected':''}>Regular edition</option></select></label><label>Platform<select name="platform">${platformOptions(getData(),draft.platform,esc)}</select></label>${input('region','Region')}${input('language','Language')}${input('releaseUrl','Release URL')}<label class="wide">Notes<textarea name="notes" rows="4">${esc(draft.notes)}</textarea></label></div><section class="form-section"><h3>Cover artwork</h3><p class="muted">Shown on the collection card. Cover artwork does not count as a collection photo.</p>${draft.cover ? `<div class="photo-editor"><img src="${esc(draft.cover.src)}" alt="Edition cover"><div class="photo-controls"><label class="check-label"><input type="checkbox" id="edition-cover-publish" ${draft.cover.publish?'checked':''}>Publish cover</label><button type="button" id="edition-cover-remove" class="text-button danger">Remove cover</button></div></div>` : ''}<button type="button" id="edition-fetch-cover" class="button subtle">Fetch cover from IGDB + VNDB</button><label class="file-label">Upload cover<input id="edition-cover-file" type="file" accept="image/jpeg,image/png,image/webp"></label></section><section class="form-section"><h3>Included games</h3><p class="muted">Link an existing game, or enter a title without adding it to your play history. Separate episodes can share one history entry.</p><div class="bundle-links">${draft.contents.map((item,i)=>`<div data-member="${i}" class="bundle-member"><label>Game<select data-key="gameId"><option value="">Not in play history</option>${games.map(g=>`<option value="${esc(g.id)}" ${g.id===item.gameId?'selected':''}>${esc(g.title)}</option>`).join('')}</select></label><label>Title (required if unlinked)<input data-key="label" value="${esc(item.label)}"></label><label>VNDB / source URL<input data-key="sourceUrl" type="url" value="${esc(item.sourceUrl || '')}"></label><button type="button" data-remove="${i}" class="text-button danger">Remove</button></div>`).join('')}</div><button type="button" data-action="add" class="button subtle">Add included game</button></section><section class="form-section"><h3>Box & contents photos</h3><p class="muted">The cover artwork is used on the collection card. Without a cover, the first published photo is used.</p>${draft.photos.map((p,i)=>`<div class="photo-editor"><img src="${esc(p.src)}" alt="Bundle photo"><div class="photo-controls"><input data-caption="${i}" aria-label="Photo caption" value="${esc(p.caption)}"><label class="check-label"><input type="checkbox" data-publish="${i}" ${p.publish?'checked':''}>Publish photo</label><button type="button" data-remove-photo="${i}" class="text-button danger">Remove photo</button></div></div>`).join('')}<label class="file-label">Add photos<input id="bundle-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple></label></section><p class="error" id="bundle-error" role="alert"></p></div><div class="dialog-bottom"><span class="muted">One box counts as one physical copy.</span><button class="button primary" id="save-bundle">Save edition</button></div></form>`;
    dialog.querySelectorAll('[name]').forEach(el=>el.oninput=()=>draft[el.name]=el.value);
    bindPlatformPicker(dialog.querySelector('[name="platform"]'),getData,draft.platform,esc,value=>draft.platform=value);
    dialog.querySelectorAll('[data-member]').forEach(row=>row.querySelectorAll('[data-key]').forEach(el=>el.oninput=()=>draft.contents[Number(row.dataset.member)][el.dataset.key]=el.value));
    dialog.querySelector('[data-action="close"]').onclick=()=>dialog.close();
    dialog.querySelector('[data-action="add"]').onclick=()=>{draft.contents.push({gameId:'',label:''});render();};
    dialog.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{draft.contents.splice(Number(b.dataset.remove),1);render();});
    dialog.querySelectorAll('[data-remove-photo]').forEach(b=>b.onclick=()=>{draft.photos.splice(Number(b.dataset.removePhoto),1);render();});
    dialog.querySelectorAll('[data-caption]').forEach(el=>el.oninput=()=>draft.photos[Number(el.dataset.caption)].caption=el.value);
    dialog.querySelectorAll('[data-publish]').forEach(el=>el.onchange=()=>draft.photos[Number(el.dataset.publish)].publish=el.checked);
    dialog.querySelector('#edition-fetch-cover').onclick=async e=>{
      const button=e.currentTarget;button.disabled=true;button.textContent='Fetching…';
      dialog.querySelector('#save-bundle').disabled=true;
      dialog.querySelector('#bundle-error').textContent='';
      try{const result=await fetchCover(draft);draft.cover=result.cover;draft.metadata=result.metadata;render();}
      catch(error){dialog.querySelector('#bundle-error').textContent=error.message;}
      finally{dialog.querySelector('#save-bundle').disabled=false;const current=dialog.querySelector('#edition-fetch-cover');current.disabled=false;current.textContent='Fetch cover from IGDB + VNDB';}
    };
    const coverPublish=dialog.querySelector('#edition-cover-publish');
    if(coverPublish)coverPublish.onchange=e=>draft.cover.publish=e.target.checked;
    const coverRemove=dialog.querySelector('#edition-cover-remove');
    if(coverRemove)coverRemove.onclick=()=>{draft.cover=null;render();};
    dialog.querySelector('#edition-cover-file').onchange=async e=>{
      const file=e.target.files[0];if(!file)return;
      dialog.querySelector('#save-bundle').disabled=true;
      try{draft.cover={...await upload(file),publish:true,origin:'manual',sfwOverride:true};render();}
      catch(error){dialog.querySelector('#bundle-error').textContent=error.message;}
      finally{dialog.querySelector('#save-bundle').disabled=false;}
    };
    dialog.querySelector('#bundle-photos').onchange=async e=>{
      dialog.querySelector('#save-bundle').disabled=true;e.target.disabled=true;
      try {for(const file of e.target.files) draft.photos.push({...await upload(file),caption:''});render();}
      catch(e){dialog.querySelector('#bundle-error').textContent=e.message;}
      finally{dialog.querySelector('#save-bundle').disabled=false;dialog.querySelector('#bundle-photos').disabled=false;}
    };
    dialog.querySelector('form').onsubmit=async e=>{
      e.preventDefault();dialog.querySelector('#save-bundle').disabled=true;
      try{await save(draft);dialog.close();}catch(e){dialog.querySelector('#bundle-error').textContent=e.message;}finally{dialog.querySelector('#save-bundle').disabled=false;}
    };
  }
  return (bundle,wishlist=false)=>{draft=bundle?structuredClone(bundle):{id:crypto.randomUUID(),format:'physical',ownership:wishlist?'wishlist':'owned',edition:'',editionType:'limited',platform:'',region:'',language:'',notes:'',releaseUrl:'',photos:[],contents:[{gameId:'',label:''}]};render();dialog.showModal();};
}

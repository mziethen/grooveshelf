// Collection queries: `key:value` filters run locally, the remaining words go to the server search.
const grades=['P','F','G','G+','VG','VG+','NM','M'];
const day=86400000;
const has={
  cover:r=>Boolean(r.cover_url),tracks:r=>Boolean(r.tracks?.length),tag:r=>Boolean(r.nfc_uid),
  release:r=>Boolean(r.discogs_release_id),location:r=>Boolean(r.storage_location),notes:r=>Boolean(r.notes),
  rating:r=>r.rating!=null,cond:r=>Boolean(r.media_condition||r.sleeve_condition),plays:r=>r.play_count>0
};
const known=new Set(['is','has','no','artist','title','album','format','loc','location','genre','style','year','plays','rating','cond','media','sleeve','played']);
function tokenize(text) {
  const tokens=[];const pattern=/(-?)([a-z]+):(?:"([^"]*)"|(\S*))|"([^"]*)"|(\S+)/gi;let match;
  while((match=pattern.exec(text))) {
    if(match[2])tokens.push({negate:Boolean(match[1]),key:match[2].toLowerCase(),value:(match[3]??match[4]??'').trim(),raw:match[0]});
    else tokens.push({text:match[5]??match[6],raw:match[0]});
  }
  return tokens;
}
function compare(spec,value,parse=Number) {
  const range=spec.match(/^(.+)\.\.(.+)$/);
  if(range){const low=parse(range[1]),high=parse(range[2]);if(low==null||high==null||Number.isNaN(low)||Number.isNaN(high))return null;return v=>v!=null&&v>=low&&v<=high;}
  const op=spec.match(/^(>=|<=|>|<|=)?(.+)$/);if(!op)return null;
  const target=parse(op[2]);if(target==null||Number.isNaN(target))return null;
  return {'>=':v=>v!=null&&v>=target,'<=':v=>v!=null&&v<=target,'>':v=>v!=null&&v>target,'<':v=>v!=null&&v<target}[op[1]]||(v=>v===target);
}
const grade=value=>{const index=grades.indexOf(String(value).toUpperCase());return index<0?null:index;};
const includes=(field,value)=>r=>String(field(r)||'').toLocaleLowerCase().includes(value.toLocaleLowerCase());
function filterFor({key,value}) {
  if(key==='is')return value==='fav'||value==='favorite'?r=>Boolean(r.favorite):null;
  if(key==='has'||key==='no'){const test=has[value];return test?(key==='no'?r=>!test(r):test):null;}
  if(!value)return null;
  if(key==='artist')return includes(r=>r.artist,value);
  if(key==='title'||key==='album')return includes(r=>r.title,value);
  if(key==='format')return includes(r=>r.format,value);
  if(key==='loc'||key==='location')return includes(r=>r.storage_location,value);
  if(key==='genre'||key==='style')return r=>[...(r.genres||[]),...(r.styles||[])].some(g=>g.toLocaleLowerCase().includes(value.toLocaleLowerCase()));
  if(key==='year'){const test=compare(value,null);return test&&(r=>test(r.year));}
  if(key==='plays'){const test=compare(value,null);return test&&(r=>test(r.play_count||0));}
  if(key==='rating'){if(value==='none')return r=>r.rating==null;const test=compare(value,null);return test&&(r=>test(r.rating));}
  if(key==='cond'||key==='media'||key==='sleeve'){const field=key==='sleeve'?'sleeve_condition':'media_condition';const test=compare(value,null,grade);return test&&(r=>test(grade(r[field]??'')));}
  if(key==='played'){
    if(value==='never')return r=>!r.last_played_at;
    const age=value.match(/^([<>])(\d+)([dwmy])$/);if(!age)return null;
    const span=Number(age[2])*{d:1,w:7,m:30,y:365}[age[3]]*day;
    return age[1]==='<'?r=>Boolean(r.last_played_at)&&Date.now()-Date.parse(r.last_played_at)<span:r=>!r.last_played_at||Date.now()-Date.parse(r.last_played_at)>span;
  }
  return null;
}
export function parseQuery(text) {
  const words=[],filters=[],chips=[],unknown=[];
  for(const token of tokenize(text||'')) {
    // Unknown prefixes remain ordinary search words, so titles containing a colon still match.
    if(token.text!=null||!known.has(token.key)){words.push(token.raw);continue;}
    const test=filterFor(token);
    if(!test){unknown.push(token.raw);continue;}
    filters.push(token.negate?r=>!test(r):test);chips.push(token.raw);
  }
  return {text:words.join(' '),chips,unknown,test:record=>filters.every(test=>test(record))};
}
export const VIEWS=[
  ['All copies',''],['Favorites','is:fav'],['Never played','played:never'],['No NFC tag','no:tag'],
  ['No cover','no:cover'],['No exact release','no:release'],['Ungraded','no:cond']
];

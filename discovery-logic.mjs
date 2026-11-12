export const FORMAT_LABELS = {shorts:'쇼츠',reels:'릴스',video:'일반 영상',blog:'블로그'};
export const TOPICS = ['커버력','밀착력','지속력과 무너짐','다크닝','들뜸·각질 부각','모공·요철 표현','촉촉함·건조함','번들거림','마스크 묻어남','색상과 호수 선택','수정 화장','재구매 의사','아쉬웠던 점'];
const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s·_\-]/g,'');
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function canonicalSource(value){
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password)throw Error('HTTPS 원문 주소가 필요합니다.');
  const host=url.hostname.replace(/^www\./,'');
  if(['youtube.com','m.youtube.com','youtu.be'].includes(host)){
    const id=host==='youtu.be'?url.pathname.slice(1):url.pathname.startsWith('/shorts/')?url.pathname.split('/')[2]:url.searchParams.get('v');
    if(!/^[\w-]{11}$/.test(id||''))throw Error('유튜브 게시물 ID가 올바르지 않습니다.');
    return {platform:'youtube',externalId:id,url:`https://www.youtube.com/watch?v=${id}`,key:`youtube:${id}`};
  }
  if(['blog.naver.com','m.blog.naver.com'].includes(host)){
    const match=url.pathname.match(/^\/([\w-]+)\/(\d+)\/?$/);
    if(!match)throw Error('블로그 개별 게시물 주소가 필요합니다.');
    return {platform:'naver',externalId:match[1]+'/'+match[2],url:`https://blog.naver.com/${match[1]}/${match[2]}`,key:`naver:${match[1]}/${match[2]}`};
  }
  if(host==='instagram.com'){
    const match=url.pathname.match(/^\/reel\/([\w-]+)\/?$/);
    if(!match)throw Error('릴스 원문 주소가 필요합니다.');
    return {platform:'instagram',externalId:match[1],url:`https://www.instagram.com/reel/${match[1]}/`,key:`instagram:${match[1]}`};
  }
  throw Error('지원하는 원문 플랫폼 주소가 아닙니다.');
}
export function searchProducts(products,query){
  const terms=String(query||'').trim().split(/\s+/).map(normalize).filter(Boolean);
  return products.filter(p=>terms.every(t=>normalize([p.name,p.brand,...p.aliases].join(' ')).includes(t)));
}
export function filterReviews(reviews,filters={}){
  const list=reviews.filter(r=>(!filters.product||r.productId===filters.product)&&(!filters.format||filters.format==='all'||r.format===filters.format)&&(!filters.topic||r.topics.includes(filters.topic))&&(!filters.skin||r.conditions.skinType?.value===filters.skin)&&(!filters.shade||r.conditions.shade?.value===filters.shade)&&(!filters.duration||r.conditions.duration?.value===filters.duration));
  return list.sort((a,b)=>{
    if(!a.publishedAt)return b.publishedAt?1:a.id.localeCompare(b.id);
    if(!b.publishedAt)return -1;
    return filters.sort==='oldest'?a.publishedAt.localeCompare(b.publishedAt):b.publishedAt.localeCompare(a.publishedAt);
  });
}
export function readRoute(hash){
  const [path='',query='']=String(hash||'').replace(/^#/,'').split('?');
  const params=new URLSearchParams(query);
  const [page,id]=path.split('/');
  const allowed=['home','search','product','saved','standards','privacy'];
  return {page:allowed.includes(page)?page:'home',id:id||'',q:params.get('q')||'',format:Object.hasOwn(FORMAT_LABELS,params.get('format'))?params.get('format'):'all',topic:params.get('topic')||'',skin:params.get('skin')||'',shade:params.get('shade')||'',duration:params.get('duration')||'',sort:params.get('sort')==='oldest'?'oldest':'newest',tab:params.get('tab')==='products'?'products':'reviews'};
}
export function routeHash(page,values={}){
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(values))if(value&&!['all','newest','reviews'].includes(value))params.set(key,value);
  return '#'+page+(params.size?'?'+params:'');
}
export function validSaved(value,ids){
  try{return [...new Set(JSON.parse(value)||[])].filter(id=>typeof id==='string'&&ids.has(id));}catch{return [];}
}
export function validateReview(r,products){
  if(!r.id||!products.some(p=>p.id===r.productId))throw Error('제품 연결을 확인하세요.');
  const canonical=canonicalSource(r.url);
  if(canonical.platform!==r.platform||canonical.externalId!==r.externalId)throw Error('원문 ID가 다릅니다.');
  if(!Object.hasOwn(FORMAT_LABELS,r.format)||((r.platform==='youtube')!==['shorts','video'].includes(r.format))||(r.platform==='naver'&&r.format!=='blog')||(r.platform==='instagram'&&r.format!=='reels'))throw Error('플랫폼과 콘텐츠 형식이 다릅니다.');
  if(!r.title||!r.author||!r.summary||!r.matchEvidence?.quote||!r.matchEvidence?.location)throw Error('원문 정보 또는 제품 일치 근거가 없습니다.');
  if(r.productVersion!==products.find(p=>p.id===r.productId).version)throw Error('제품 버전이 다릅니다.');
  if(r.publishedAt&&!/^\d{4}-\d{2}-\d{2}$/.test(r.publishedAt))throw Error('작성일 형식 오류');
  if(!Array.isArray(r.topics)||r.topics.some(t=>!TOPICS.includes(t)))throw Error('주제 태그를 확인하세요.');
  if(!r.disclosure||!['self_declared','not_observed'].includes(r.disclosure.kind)||!r.disclosure.checkedAreas?.length||!Array.isArray(r.disclosure.uncheckedAreas)||!r.disclosure.checkedAt||r.disclosure.findings?.length!==0)throw Error('광고 표기 검토가 완료되지 않았습니다.');
  if(r.disclosure.kind==='self_declared'&&(!r.disclosure.evidence?.quote||!r.disclosure.evidence?.location))throw Error('작성자 구매 표기 근거가 없습니다.');
  if(!r.review?.reviewedAt||!r.review?.reviewedBy||!r.link?.checkedAt||r.link.status!=='available')throw Error('검토 기록과 원문 접근 확인이 필요합니다.');
  if(r.platform==='youtube'&&r.format==='shorts'&&r.formatEvidence!=='youtube_shorts_surface')throw Error('쇼츠 형식 확인 근거가 없습니다.');
  for(const c of Object.values(r.conditions||{}))if(c&&(!c.value||!c.quote||!c.location))throw Error('사용 조건의 원문 근거가 없습니다.');
  return canonical;
}

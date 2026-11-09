const aliases={apple:'애플 에어팟',sony:'소니',logitech:'로지텍',illy:'일리',brita:'브리타','la roche-posay':'라로슈포제',lego:'레고',haribo:'하리보',downy:'다우니',balmuda:'발뮤다',crocs:'크록스',joy:'조이'};
export const normalizeSearch=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[\p{P}\p{S}\s]+/gu,'');

export function matchesProduct(product,query){
  const terms=String(query).trim().split(/\s+/).map(normalizeSearch).filter(Boolean);
  if(!terms.length)return true;
  const text=normalizeSearch([product.name,product.brand,aliases[String(product.brand||'').toLowerCase()],product.source,product.sourceTitle,product.categoryName,product.subtitle,product.lead,product.good,product.caution,...(product.tags||[]),...(product.reviews||[]).flatMap(review=>[review.topic,review.title,review.summary]),...(product.reviewAnalysis?.originalExcerpts||[]).map(review=>review.text)].join(' '));
  return terms.every(term=>text.includes(term));
}

export const platformSlug=source=>({'네이버 쇼핑':'naver','쿠팡':'coupang','11번가':'11st'}[source]||'other');
export function filterProducts(products,criteria,saved=new Set()){
  const positions=new Map(products.map((product,index)=>[product.id,index]));
  const numeric=(a,b,key)=>(Number.isFinite(b[key])?b[key]:-1)-(Number.isFinite(a[key])?a[key]:-1);
  return products.filter(product=>(criteria.page!=='saved'||saved.has(product.id))&&(!criteria.category||criteria.category==='all'||product.category===criteria.category)&&(!criteria.platform||criteria.platform==='all'||platformSlug(product.source)===criteria.platform)&&matchesProduct(product,criteria.query||''))
    .sort((a,b)=>criteria.sort==='name'?a.name.localeCompare(b.name,'ko'):criteria.sort==='rating'?numeric(a,b,'sourceRating')||numeric(a,b,'sourceReviewCount'):criteria.sort==='reviews'?numeric(a,b,'sourceReviewCount'):positions.get(a.id)-positions.get(b.id));
}

export function parseSelection(value,knownIds,limit=Infinity){
  try{const parsed=JSON.parse(value||'[]');return Array.isArray(parsed)?[...new Set(parsed.filter(id=>typeof id==='string'&&knownIds.has(id)))].slice(0,limit):[];}catch{return [];}
}

export function readRoute(hash,categoryNames){
  const raw=String(hash||'').replace(/^#/,'');
  const split=raw.indexOf('?'),path=split<0?raw:raw.slice(0,split),params=new URLSearchParams(split<0?'':raw.slice(split+1));
  const [requested,id='']=path.split('/');
  const page=['saved','compare','standards','privacy','product'].includes(requested)?requested:'home';
  let product=null;
  if(page==='product'){try{product=decodeURIComponent(id);}catch{product='';}}
  const platform=params.get('platform');
  return {page,product,category:Object.hasOwn(categoryNames,params.get('category'))?params.get('category'):'all',platform:['naver','coupang','11st'].includes(platform)?platform:'all',query:(params.get('q')||'').slice(0,80),sort:['reviews','rating','name','recommended'].includes(params.get('sort'))?params.get('sort'):'recommended'};
}

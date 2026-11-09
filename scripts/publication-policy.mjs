import {createHash} from 'node:crypto';

// A content hash detects changes after source review; it does not certify authenticity.
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export const contentDigest=product=>createHash('sha256').update(JSON.stringify(canonical(product))).digest('hex');

export function preparePublicCatalog(catalog,manifest){
  const ids=new Set();
  for(const product of catalog.products){
    if(ids.has(product.id))throw new Error(`Duplicate product: ${product.id}`);
    ids.add(product.id);
  }
  const approved=new Set();
  const products=manifest.approved.map(entry=>{
    if(approved.has(entry.id))throw new Error(`Duplicate approval: ${entry.id}`);
    approved.add(entry.id);
    const product=catalog.products.find(item=>item.id===entry.id);
    if(!product||contentDigest(product)!==entry.contentSha256)throw new Error(`Publication review required: ${entry.id}. Source, excerpts or summary changed.`);
    const analysis=product.reviewAnalysis;
    const reviewIds=new Set(analysis.reviewEvidence.map(review=>review.sourceReviewId));
    if(reviewIds.size!==analysis.reviewEvidence.length||reviewIds.size!==product.reviewSampleCount||analysis.reviewSampleCount!==product.reviewSampleCount)throw new Error(`Invalid sample count: ${product.id}`);
    if(!Number.isFinite(Date.parse(product.collectedAt)))throw new Error(`Missing collection date: ${product.id}`);
    if(!['https:','http:'].includes(new URL(product.sourceUrl).protocol))throw new Error(`Invalid source URL: ${product.id}`);
    for(const review of [...product.reviews,...analysis.reviewEvidence,...analysis.originalExcerpts]){
      if(!reviewIds.has(review.sourceReviewId)||review.sourceUrl!==product.sourceUrl)throw new Error(`Source mismatch: ${product.id}`);
    }
    for(const group of Object.values(analysis.mentionGroups).flat()){
      if(group.count!==new Set(group.reviewIds).size||group.count<1||group.reviewIds.some(id=>!reviewIds.has(id)))throw new Error(`Invalid topic evidence: ${product.id}:${group.id}`);
    }
    if(analysis.originalExcerpts.some(review=>!review.text?.trim())||analysis.originalExcerpts.reduce((sum,review)=>sum+review.text.trim().split(/\s+/).length,0)>25)throw new Error(`Invalid excerpts: ${product.id}`);
    const copy=structuredClone(product);delete copy.imageData;
    return copy;
  });
  if(!products.length)throw new Error('No reviewed products available for publication.');
  const sources=[...new Set(products.map(product=>product.source))];
  return {version:6,sourceCount:sources.length,sourceName:sources.join('·'),reviewSampleCount:products.reduce((s,p)=>s+p.reviewSampleCount,0),summaryCount:products.reduce((s,p)=>s+p.reviews.length,0),originalExcerptCount:products.reduce((s,p)=>s+p.reviewAnalysis.originalExcerpts.length,0),products};
}

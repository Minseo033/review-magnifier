import {createHash} from 'node:crypto';
import {validateReview} from '../discovery-logic.mjs';
function stable(value){return Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;}
export function reviewDigest(record){const {review,link,...content}=record;return createHash('sha256').update(JSON.stringify(stable(content))).digest('hex');}
export function prepareLibrary(registry){
  const ids=new Set(),sources=new Set(),reviews=[];
  for(const r of registry.reviews){
    if(ids.has(r.id))throw Error('후기 ID 중복: '+r.id);ids.add(r.id);
    if(r.review?.status!=='approved'||r.active!==true)continue;
    const authorization=registry.publicationAuthorization;
    const agentAuthorized=r.review.reviewerKind==='ai'&&authorization?.mode==='user_authorized_agent_review'&&authorization.authorizedAt&&authorization.instruction&&authorization.approved?.some(entry=>entry.id===r.id&&entry.contentSha256===reviewDigest(r));
    if((r.review.reviewerKind!=='human'&&!agentAuthorized)||!r.review.reason)throw Error('원문 검토와 공개 승인이 필요합니다: '+r.id);
    const source=validateReview(r,registry.products);
    if(r.review.contentSha256!==reviewDigest(r))throw Error('후기 변경 후 재검토 필요: '+r.id);
    if(sources.has(source.key))throw Error('같은 원문 중복: '+r.id);sources.add(source.key);
    reviews.push(r);
  }
  const products=registry.products.filter(p=>reviews.some(r=>r.productId===p.id));
  return {schemaVersion:1,updatedAt:registry.updatedAt,products,reviews};
}

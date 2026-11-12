import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {prepareLibrary} from './discovery-policy.mjs';
const root=new URL('../',import.meta.url),file=new URL('.local-data/rebuild/source-checks.json',root);
if(!existsSync(file))throw Error('이 검사는 비공개 원문 캐시가 있는 작업 환경에서만 실행합니다. 일반 빌드에는 캐시가 필요하지 않습니다.');
const snapshots=JSON.parse(readFileSync(file)),registry=JSON.parse(readFileSync(new URL('data/discovery-registry.json',root)));
const normalize=text=>String(text||'').replace(/[\s\u200b\ufeff]+/g,'');
for(const r of prepareLibrary(registry).reviews){
 const source=snapshots.find(s=>s.id===r.externalId.split('/').at(-1));assert.ok(source,r.id+' 원문 캐시 없음');
 const text=normalize(source.title+' '+(source.body||source.description||''));
 assert.equal(r.title,source.title,r.id+' 제목 변경');
 for(const quote of [r.excerpt,r.matchEvidence.quote,r.disclosure.evidence?.quote,...Object.values(r.conditions).filter(Boolean).map(c=>c.quote)].filter(Boolean))assert.ok(text.includes(normalize(quote)),r.id+' 근거 불일치: '+quote);
 if(r.platform==='youtube'){
  assert.equal(r.author,source.author);assert.equal(r.publishedAt,source.date.slice(0,10));assert.equal(r.durationSeconds,Number(source.seconds));
  assert.equal(source.paidOverlay,false,r.id+' 유료광고 메타데이터');
  if(r.format==='shorts')assert.equal(source.shortsEligible,true,r.id+' 쇼츠 근거');
 }
}
for(const r of registry.excluded){const source=snapshots.find(s=>s.id===r.id);assert.ok(source);assert.ok(normalize(source.title+' '+(source.body||source.description||'')).includes(normalize(r.evidence)));}
console.log('10개 공개 원문의 제목·발췌·조건 근거와 영상 메타데이터, 제외 2건의 고지를 비공개 캐시에 대조했습니다. 이미지·영상 장면 검증을 뜻하지 않습니다.');

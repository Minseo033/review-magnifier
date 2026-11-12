import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {prepareLibrary} from './discovery-policy.mjs';
const root=new URL('../',import.meta.url),read=name=>readFileSync(new URL(name,root),'utf8');
const approved=prepareLibrary(JSON.parse(read('data/discovery-registry.json')));
assert.deepEqual(JSON.parse(read('data/discovery.public.json')),approved,'공개 데이터가 승인 목록과 다릅니다.');
const expected=['.nojekyll','404.html','assets','discovery.bundle.js','discovery.css','index.html','robots.txt'];
assert.deepEqual(readdirSync(new URL('docs/',root)).sort(),expected.sort(),'예상하지 못한 파일이 공개 폴더에 있습니다.');
assert.deepEqual(readdirSync(new URL('docs/assets/',root)),['discovery']);
assert.deepEqual(readdirSync(new URL('docs/assets/discovery/',root)).sort(),['fwee-black.webp','mark.svg']);
const html=read('docs/index.html'),script=read('docs/discovery.bundle.js');
for(const name of ['discovery.css','discovery.bundle.js']){
 assert.equal(read('docs/'+name),read(name),'배포 복사본 불일치: '+name);
 const hash=createHash('sha256').update(read(name)).digest('hex').slice(0,12);assert.ok(html.includes(name+'?v='+hash));
}
assert.ok(html.includes('https://minseo033.github.io/review-magnifier/'));assert.ok(html.includes('noindex,nofollow'));
assert.ok(html.includes("script-src 'self'"));assert.ok(!html.includes('unsafe-inline'));
assert.ok(!/AirPods|11st\.co\.kr|catalog\.bundle|sqlite3|source-checks\.json/.test(script));
for(const r of approved.reviews)assert.ok(script.includes(r.externalId),'공개 후기 누락: '+r.id);
for(const r of JSON.parse(read('data/discovery-registry.json')).excluded)assert.ok(!script.includes(r.url),'제외 원문이 번들에 포함되어 있습니다.');
assert.ok(statSync(new URL('docs/discovery.bundle.js',root)).size<150000,'초기 스크립트 용량 증가');
assert.ok(statSync(new URL('docs/assets/discovery/fwee-black.webp',root)).size<100000);
console.log(`공개 파일·승인·원문 중복·버전 일치 확인: 제품 ${approved.products.length}개 / 후기 출처 ${approved.reviews.length}개. 원문·DB·제외 후보는 공개 빌드에 없습니다.`);

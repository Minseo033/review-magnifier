import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {prepareLibrary} from './discovery-policy.mjs';
const root=new URL('../',import.meta.url),read=name=>readFileSync(new URL(name,root),'utf8');
const registry=JSON.parse(read('data/discovery-registry.json')),approved=prepareLibrary(registry);
assert.deepEqual(JSON.parse(read('data/discovery.public.json')),approved,'공개 데이터가 승인 목록과 다릅니다.');
const expected=['.nojekyll','404.html','assets','discovery.bundle.js','discovery.data.js','discovery.css','index.html','robots.txt'];
assert.deepEqual(readdirSync(new URL('docs/',root)).sort(),expected.sort(),'예상하지 못한 파일이 공개 폴더에 있습니다.');
assert.deepEqual(readdirSync(new URL('docs/assets/',root)),['discovery']);
const images=[...new Set(approved.products.map(p=>p.image))];
assert.deepEqual(readdirSync(new URL('docs/assets/discovery/',root)).sort(),['mark.svg',...images.map(image=>image.slice('assets/discovery/'.length))].sort());
for(const image of images){
 assert.match(image,/^assets\/discovery\/[a-z0-9-]+\.webp$/);
 const bytes=readFileSync(new URL('docs/'+image,root));
 assert.ok(bytes.length<100000,'제품 사진 용량 초과: '+image);
 assert.equal(bytes.toString('ascii',0,4),'RIFF','제품 사진 포맷 오류: '+image);
 assert.equal(bytes.toString('ascii',8,12),'WEBP','제품 사진 포맷 오류: '+image);
 assert.deepEqual(bytes,readFileSync(new URL(image,root)),'제품 사진 복사본 불일치: '+image);
}
const html=read('docs/index.html'),script=read('docs/discovery.bundle.js'),content=read('docs/discovery.data.js');
for(const name of ['discovery.css','discovery.data.js','discovery.bundle.js']){
 assert.equal(read('docs/'+name),read(name),'배포 복사본 불일치: '+name);
 const hash=createHash('sha256').update(read(name)).digest('hex').slice(0,12);assert.ok(html.includes(name+'?v='+hash));
}
assert.ok(html.includes('https://minseo033.github.io/review-magnifier/'));assert.ok(html.includes('noindex,nofollow'));
assert.ok(html.includes("script-src 'self'"));assert.ok(!html.includes('unsafe-inline'));
assert.ok(!/AirPods|11st\.co\.kr|catalog\.bundle|sqlite3|source-checks\.json/.test(script+content));
assert.deepEqual(JSON.parse(content.slice('globalThis.__reviewLibrary='.length).trim().replace(/;$/,'')),approved);
assert.ok(html.indexOf('discovery.data.js')<html.indexOf('discovery.bundle.js'),'공개 데이터가 화면 코드보다 먼저 로드되어야 합니다.');
for(const r of approved.reviews)assert.ok(content.includes(r.externalId),'공개 후기 누락: '+r.id);
for(const r of registry.excluded)assert.ok(!content.includes(r.url),'제외 원문이 번들에 포함되어 있습니다.');
assert.ok(statSync(new URL('docs/discovery.bundle.js',root)).size<150000,'초기 스크립트 용량 증가');
assert.ok(statSync(new URL('docs/discovery.data.js',root)).size<500000,'공개 자료 용량 초과: 제품별 분할이 필요합니다.');
console.log(`공개 파일·승인·원문 중복·버전 일치 확인: 제품 ${approved.products.length}개 / 후기 출처 ${approved.reviews.length}개. 원문·DB·제외 후보는 공개 빌드에 없습니다.`);

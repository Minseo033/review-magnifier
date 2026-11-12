import {readFileSync,writeFileSync,mkdirSync,copyFileSync,rmSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {prepareLibrary} from './discovery-policy.mjs';
const root=new URL('../',import.meta.url),path=name=>new URL(name,root);
const library=prepareLibrary(JSON.parse(readFileSync(path('data/discovery-registry.json'))));
const productImages=[...new Set(library.products.map(p=>p.image))];
for(const image of productImages){
 if(typeof image!=='string'||!/^assets\/discovery\/[a-z0-9-]+\.webp$/.test(image))throw Error(`지원하지 않는 제품 이미지: ${image}`);
}
writeFileSync(path('data/discovery.public.json'),JSON.stringify(library,null,2)+'\n');
writeFileSync(path('discovery.data.js'),'globalThis.__reviewLibrary='+JSON.stringify(library)+';\n');
await build({entryPoints:[fileURLToPath(path('discovery.js'))],bundle:true,minify:true,charset:'utf8',target:'es2020',format:'iife',outfile:fileURLToPath(path('discovery.bundle.js')),plugins:[{name:'separate-public-library',setup(builder){builder.onLoad({filter:/discovery\.public\.json$/},()=>({contents:'export default globalThis.__reviewLibrary;',loader:'js'}));}}]});
mkdirSync(path('docs/assets/discovery'),{recursive:true});
// Only old generated copies are removed. Original assets, source data and SQLite remain.
for(const name of ['docs/catalog.css','docs/catalog.bundle.js','docs/boot.js','docs/assets/catalog','docs/assets/brand','docs/assets/reviews'])rmSync(path(name),{recursive:true,force:true});
let html=readFileSync(path('index.html'),'utf8');
for(const name of ['discovery.css','discovery.data.js','discovery.bundle.js']){
 const body=readFileSync(path(name));copyFileSync(path(name),path('docs/'+name));
 html=html.replace(`"${name}"`,`"${name}?v=${createHash('sha256').update(body).digest('hex').slice(0,12)}"`);
}
const images=['assets/discovery/mark.svg',...productImages];
for(const image of images)copyFileSync(path(image),path('docs/'+image));
for(const entry of readdirSync(path('docs/assets/discovery'),{withFileTypes:true})){
 const image='assets/discovery/'+entry.name;
 if(entry.isFile()&&/^[a-z0-9-]+\.webp$/.test(entry.name)&&!images.includes(image))rmSync(path('docs/'+image));
}
const url='https://minseo033.github.io/review-magnifier/';
html=html.replace('</head>',`<link rel="canonical" href="${url}"><meta property="og:type" content="website"><meta property="og:site_name" content="후기돋보기"><meta property="og:title" content="후기돋보기 · 사기 전, 내돈내산 후기부터"><meta property="og:description" content="제품별로 모은 후기에서 작성자의 구매 표시와 원문 출처를 함께 살펴보세요."><meta property="og:url" content="${url}"></head>`);
writeFileSync(path('docs/index.html'),html);
writeFileSync(path('docs/.nojekyll'),'');
writeFileSync(path('docs/robots.txt'),'User-agent: *\nDisallow: /\n');
writeFileSync(path('docs/404.html'),`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>주소를 찾을 수 없어요 · 후기돋보기</title><link rel="stylesheet" href="${url}discovery.css"></head><body><main class="container empty-state"><h1>주소를 찾을 수 없어요</h1><p>제품 검색에서 다시 찾아보세요.</p><a class="button" href="${url}">제품 후기 찾아보기</a></main></body></html>`);
console.log(`후기 탐색 서비스 준비: 제품 ${library.products.length}개, 원문 ${library.reviews.length}개. docs/에 공개 파일만 생성했습니다.`);

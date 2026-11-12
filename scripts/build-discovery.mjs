import {readFileSync,writeFileSync,mkdirSync,copyFileSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {buildSync} from 'esbuild';
import {prepareLibrary} from './discovery-policy.mjs';
const root=new URL('../',import.meta.url),path=name=>new URL(name,root);
const library=prepareLibrary(JSON.parse(readFileSync(path('data/discovery-registry.json'))));
writeFileSync(path('data/discovery.public.json'),JSON.stringify(library,null,2)+'\n');
buildSync({entryPoints:[fileURLToPath(path('discovery.js'))],bundle:true,minify:true,target:'es2020',format:'iife',outfile:fileURLToPath(path('discovery.bundle.js'))});
mkdirSync(path('docs/assets/discovery'),{recursive:true});
// Only old generated copies are removed. Original assets, source data and SQLite remain.
for(const name of ['docs/catalog.css','docs/catalog.bundle.js','docs/boot.js','docs/assets/catalog','docs/assets/brand','docs/assets/reviews'])rmSync(path(name),{recursive:true,force:true});
let html=readFileSync(path('index.html'),'utf8');
for(const name of ['discovery.css','discovery.bundle.js']){
 const body=readFileSync(path(name));copyFileSync(path(name),path('docs/'+name));
 html=html.replace(`"${name}"`,`"${name}?v=${createHash('sha256').update(body).digest('hex').slice(0,12)}"`);
}
for(const name of ['mark.svg','fwee-black.webp'])copyFileSync(path('assets/discovery/'+name),path('docs/assets/discovery/'+name));
const url='https://minseo033.github.io/review-magnifier/';
html=html.replace('</head>',`<link rel="canonical" href="${url}"><meta property="og:type" content="website"><meta property="og:site_name" content="후기돋보기"><meta property="og:title" content="후기돋보기 · 사기 전, 후기를 한곳에서"><meta property="og:description" content="쇼츠·영상·블로그의 사용 경험과 원문 출처를 한곳에서 살펴보세요."><meta property="og:url" content="${url}"></head>`);
writeFileSync(path('docs/index.html'),html);
writeFileSync(path('docs/.nojekyll'),'');
writeFileSync(path('docs/robots.txt'),'User-agent: *\nDisallow: /\n');
writeFileSync(path('docs/404.html'),`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>주소를 찾을 수 없어요 · 후기돋보기</title><link rel="stylesheet" href="${url}discovery.css"></head><body><main class="container empty-state"><h1>주소를 찾을 수 없어요</h1><p>제품 검색에서 다시 찾아보세요.</p><a class="button" href="${url}">제품 후기 찾아보기</a></main></body></html>`);
console.log(`후기 탐색 서비스 준비: 제품 ${library.products.length}개, 원문 ${library.reviews.length}개. docs/에 공개 파일만 생성했습니다.`);

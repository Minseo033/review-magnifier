"""Publish the reviewed UI and its static assets; no source corpus or database."""
from pathlib import Path
import shutil
import hashlib
import html as escape_html
import json

root=Path(__file__).resolve().parent.parent
site=root/'docs'
site.mkdir(exist_ok=True)
html=(root/'index.html').read_text()
config=json.loads((root/'config/site.json').read_text())
for name in ['catalog.css','boot.js','catalog.bundle.js']:
    shutil.copyfile(root/name,site/name)
    version=hashlib.sha256((root/name).read_bytes()).hexdigest()[:12]
    html=html.replace(f'"{name}"',f'"{name}?v={version}"')
assets=site/'assets'
for folder in ('catalog','brand'):
    (assets/folder).mkdir(parents=True,exist_ok=True)
    for file in (root/'assets'/folder).iterdir():
        if file.suffix in {'.webp','.png','.svg'}:
            shutil.copyfile(file,assets/folder/file.name)
url=config['url']
title='후기돋보기 — 제품은 한눈에, 후기는 자세히'
description=escape_html.escape(config['description'],quote=True)
meta=f'''<link rel="canonical" href="{url}">
<meta property="og:type" content="website"><meta property="og:locale" content="ko_KR"><meta property="og:site_name" content="후기돋보기">
<meta property="og:title" content="{title}"><meta property="og:description" content="{description}"><meta property="og:url" content="{url}">
<meta property="og:image" content="{url}assets/brand/share.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="후기돋보기, 제품은 한눈에 후기는 자세히">
<meta name="twitter:card" content="summary_large_image"><link rel="apple-touch-icon" href="assets/brand/apple-touch-icon.png">'''
html=html.replace('</head>',meta+'</head>')
catalog=json.loads((root/'data/catalog.json').read_text())
fallback='<section class="shell"><h2>공개 후기 원문 찾아보기</h2><p>검색·비교 기능을 사용하려면 JavaScript를 켜 주세요. 아래에서 각 판매처의 원문을 확인할 수 있어요.</p><ul>'+''.join(f'<li><a href="{escape_html.escape(p["sourceUrl"],quote=True)}">{escape_html.escape(p["brand"]+" "+p["name"])}</a> · 확인한 후기 표본 {p["reviewSampleCount"]}개</li>' for p in catalog['products'])+'</ul></section>'
start=html.index('<noscript>');end=html.index('</noscript>',start)+len('</noscript>')
html=html[:start]+'<noscript>'+fallback+'</noscript>'+html[end:]
indexing=config.get('indexing')=='public'
if indexing:
    html=html.replace('content="noindex,nofollow"','content="index,follow"')
(site/'index.html').write_text(html)
(site/'.nojekyll').touch()
(site/'robots.txt').write_text('User-agent: *\n'+('Allow: /\n' if indexing else 'Disallow: /\n'))
css_version=hashlib.sha256((root/'catalog.css').read_bytes()).hexdigest()[:12]
(site/'404.html').write_text('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>페이지를 찾을 수 없어요 — 후기돋보기</title><link rel="stylesheet" href="'+url+'catalog.css?v='+css_version+'"><body class="notfound"><main class="shell empty-state"><a class="brand" href="'+url+'"><img src="'+url+'assets/brand/icon.svg" width="40" height="40" alt="">후기돋보기</a><h1>페이지를 찾을 수 없어요.</h1><p>주소가 바뀌었거나 존재하지 않는 페이지예요.</p><a class="button primary" href="'+url+'">후기돋보기에서 제품 찾기</a></main></body></html>')
print('후기돋보기 UI·제품 사진·공유 이미지와 복구 페이지를 docs/에 준비했습니다.')

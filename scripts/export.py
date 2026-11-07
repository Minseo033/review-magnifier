from pathlib import Path
import zipfile, json, re, base64

root=Path(__file__).resolve().parent.parent
html=(root/'index.html').read_text()
css=(root/'catalog.css').read_text()
script=(root/'catalog.bundle.js').read_text()
# The hosted site keeps images separate; portable single HTML files remain self-contained.
for product in json.loads((root/'data/catalog.json').read_text())['products']:
 script=script.replace(product['image'],'data:image/webp;base64,'+base64.b64encode((root/product['image']).read_bytes()).decode())
script=script.replace('assets/brand/image-unavailable.svg','data:image/svg+xml;base64,'+base64.b64encode((root/'assets/brand/image-unavailable.svg').read_bytes()).decode())
script=((root/'boot.js').read_text()+'\n'+script).replace('</script','<\\/script')
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>','',html)
html=html.replace('<link rel="stylesheet" href="catalog.css">','<style>\n'+css+'\n</style>')
html=html.replace('<script defer src="boot.js"></script>','').replace('<script defer data-app src="catalog.bundle.js"></script>','')
html=html.replace('</body>','<script>\n'+script+'\n</script>\n</body>')
for name in ['후기돋보기_개선본.html','후기돋보기_리뷰중심.html']:(root/name).write_text(html)
allowed=['index.html','catalog.css','catalog.js','catalog-logic.mjs','boot.js','review-insights.js','catalog.bundle.js','package.json','package-lock.json','README.md','.gitignore','후기돋보기_개선본.html','후기돋보기_리뷰중심.html','개선내용.md','실행안내.md','ASSET_CREDITS.md','THIRD_PARTY_NOTICES.md','data/catalog.json','data/catalog.viewer.json','data/editorial.json','data/review-annotations.json','data/review-analysis.json','scripts/collect-catalog.py','scripts/prepare-catalog.mjs','scripts/prepare-review-insights.py','scripts/export.py','scripts/build-pages.py','scripts/build-brand.mjs','scripts/verify-release.py','tests/catalog-logic.test.mjs','tests/review-insights.test.mjs','config/site.json','docs-data/출시점검.md','.ui-craft/brief.md']
with zipfile.ZipFile(root/'후기돋보기_수정본.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for name in ['.env.example','scripts/schema.sql','scripts/data_store.py','scripts/naver_sources.py','scripts/public_sources.py','scripts/data-pipeline.py','config/naver-seeds.json','config/public-sources.json','config/household-sources.json','tests/test_data_pipeline.py','tests/test_public_sources.py','docs-data/저장과수집.md']:
  file=root/name
  if file.is_file():archive.write(file,'후기돋보기/'+name)
 for name in allowed:
  file=root/name
  if file.is_file():archive.write(file,'후기돋보기/'+name)
 for folder in ['assets/catalog','assets/brand']:
  for file in sorted((root/folder).rglob('*')):
   if file.is_file() and file.suffix in {'.webp','.png','.svg'}:
    archive.write(file,'후기돋보기/'+str(file.relative_to(root)))
print('실제 제품·리뷰 중심 단일 HTML과 전달용 묶음을 만들었습니다.')

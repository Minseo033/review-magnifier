from pathlib import Path
import zipfile, json

root=Path(__file__).resolve().parent.parent
html=(root/'index.html').read_text()
css=(root/'catalog.css').read_text()
script=(root/'catalog.bundle.js').read_text().replace('</script','<\\/script')
html=html.replace('<link rel="stylesheet" href="catalog.css">','<style>\n'+css+'\n</style>')
html=html.replace('<script defer src="catalog.bundle.js"></script>','')
html=html.replace('</body>','<script>\n'+script+'\n</script>\n</body>')
for name in ['후기돋보기_개선본.html','후기돋보기_리뷰중심.html']:(root/name).write_text(html)
allowed=['index.html','catalog.css','catalog.js','review-insights.js','catalog.bundle.js','package.json','package-lock.json','README.md','.gitignore','후기돋보기_개선본.html','후기돋보기_리뷰중심.html','개선내용.md','실행안내.md','ASSET_CREDITS.md','THIRD_PARTY_NOTICES.md','data/catalog.json','data/catalog.viewer.json','data/editorial.json','data/review-annotations.json','data/review-analysis.json','scripts/collect-catalog.py','scripts/prepare-catalog.mjs','scripts/prepare-review-insights.py','scripts/export.py','scripts/build-pages.py','.ui-craft/brief.md']
with zipfile.ZipFile(root/'후기돋보기_수정본.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for name in ['.env.example','scripts/schema.sql','scripts/data_store.py','scripts/naver_sources.py','scripts/public_sources.py','scripts/data-pipeline.py','config/naver-seeds.json','config/public-sources.json','tests/test_data_pipeline.py','tests/test_public_sources.py','docs-data/저장과수집.md']:
  file=root/name
  if file.is_file():archive.write(file,'후기돋보기/'+name)
 for name in allowed:
  file=root/name
  if file.is_file():archive.write(file,'후기돋보기/'+name)
 for folder in ['assets/catalog','reports/catalog']:
  for file in sorted((root/folder).rglob('*')):
   if file.is_file() and (folder.startswith('reports') or file.suffix=='.webp'):
    archive.write(file,'후기돋보기/'+str(file.relative_to(root)))
print('실제 제품·리뷰 중심 단일 HTML과 전달용 묶음을 만들었습니다.')

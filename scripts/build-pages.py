"""Publish only the three runtime files to the GitHub Pages source folder."""
from pathlib import Path
import shutil

root=Path(__file__).resolve().parent.parent
site=root/'docs'
site.mkdir(exist_ok=True)
for name in ['index.html','catalog.css','catalog.bundle.js']:
    shutil.copyfile(root/name,site/name)
(site/'.nojekyll').touch()
(site/'robots.txt').write_text('User-agent: *\nDisallow: /\n')
print('GitHub Pages 공개 파일 5개를 docs/에 준비했습니다.')

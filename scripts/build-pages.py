"""Publish only the three runtime files to the GitHub Pages source folder."""
from pathlib import Path
import shutil
import hashlib

root=Path(__file__).resolve().parent.parent
site=root/'docs'
site.mkdir(exist_ok=True)
html=(root/'index.html').read_text()
for name in ['catalog.css','catalog.bundle.js']:
    shutil.copyfile(root/name,site/name)
    version=hashlib.sha256((root/name).read_bytes()).hexdigest()[:12]
    html=html.replace(f'"{name}"',f'"{name}?v={version}"')
(site/'index.html').write_text(html)
(site/'.nojekyll').touch()
(site/'robots.txt').write_text('User-agent: *\nDisallow: /\n')
print('GitHub Pages 공개 파일 5개를 docs/에 준비했습니다.')

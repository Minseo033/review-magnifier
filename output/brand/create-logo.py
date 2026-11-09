from pathlib import Path
from fontTools.ttLib import TTCollection
from fontTools.pens.svgPathPen import SVGPathPen
root=Path.cwd();dest=root/'assets/brand'
collection=TTCollection('/System/Library/Fonts/AppleSDGothicNeo.ttc')
font=next(f for f in collection.fonts if any(n.nameID==2 and n.toUnicode()=='Bold' for n in f['name'].names))
glyphs=font.getGlyphSet();cmap=font.getBestCmap();units=font['head'].unitsPerEm
# The lens outline doubles as a speech bubble. The lower-left tail remains open visually at favicon size.
mark='<path d="M29 12.5C19.6 12.5 12 20.1 12 29.5c0 3.5 1.1 6.8 3 9.5l-2 8 8.2-2.4c2.3 1.1 4.9 1.7 7.8 1.7 9.4 0 17-7.5 17-16.8s-7.6-17-17-17Z"/><path d="m42 42 11 11M22 25h14M22 32h10"/>'
def svg(inner,vb):return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" fill="none">{inner}</svg>'
icon=svg('<rect width="64" height="64" rx="18" fill="#24644b"/><g stroke="#fff" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round">'+mark+'</g>','0 0 64 64')
(dest/'review-mark.svg').write_text(icon)
mono=svg('<g stroke="#24644b" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round">'+mark+'</g>','0 0 64 64')
(dest/'review-mark-mono.svg').write_text(mono)
x=0;paths=[]
for c in '후기돋보기':
 name=cmap[ord(c)];pen=SVGPathPen(glyphs);glyphs[name].draw(pen)
 paths.append(f'<path transform="translate({x} 0)" d="{pen.getCommands()}"/>')
 x+=font['hmtx'][name][0]-22
size=48;scale=size/units
word=f'<g transform="translate(86 58) scale({scale} {-scale})" fill="#203b30">'+''.join(paths)+'</g>'
width=round(86+x*scale+14)
logo=svg('<g transform="translate(4 8)">'+icon.replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">','').replace('</svg>','')+'</g>'+word,f'0 0 {width} 80')
(dest/'review-logo.svg').write_text(logo)
(dest/'review-logo-white.svg').write_text(logo.replace('#203b30','#ffffff').replace('#24644b','#ffffff').replace('stroke="#fff"','stroke="#24644b"'))
print('Created outlined Korean wordmark and scalable marks:',width,'× 80')

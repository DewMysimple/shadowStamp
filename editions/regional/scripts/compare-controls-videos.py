"""Compare the supplied original/previous clips against verified current captures.

Each paper's projected bounding-box HEIGHT is equalized with one uniform scale.
No perspective correction, rotation correction, stretching or image retouching.
"""
from pathlib import Path
import hashlib
import json
import math

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/controls-research'
FONTS='C:/Windows/Fonts/'
FONT=ImageFont.truetype(FONTS+'segoeui.ttf',18)
TITLE=ImageFont.truetype(FONTS+'seguisb.ttf',25)
SMALL=ImageFont.truetype(FONTS+'consola.ttf',15)

def frame(number,index):
    path=Path(f'C:/Users/Administrator/Desktop/{number}.mp4')
    cap=cv2.VideoCapture(str(path));cap.set(cv2.CAP_PROP_POS_FRAMES,index)
    ok,f=cap.read();cap.release()
    if not ok: raise RuntimeError(f'Cannot read {path} frame {index}')
    return Image.fromarray(cv2.cvtColor(f,cv2.COLOR_BGR2RGB)),path

def image(path):
    return Image.open(path).convert('RGB'),path

def bounds(points):
    p=np.array(points);return [float(p[:,0].min()),float(p[:,1].min()),float(p[:,0].max()),float(p[:,1].max())]

poses=json.loads((OUT/'final-comparison-poses.json').read_text(encoding='utf-8'))
craft=lambda state:next(p for p in poses[state]['poses'] if p['id']=='craft')
quad3=json.loads((OUT/'video-3-focused-quad.json').read_text(encoding='utf-8'))['frames'][48]['quad']
quad4=json.loads((OUT/'video-4-focused-quad.json').read_text(encoding='utf-8'))['frames'][48]['quad']

rows=[
    ('HOVER / surface light + paper response',[
        (*frame(1,70),[38,72,411,488],'1.mp4 / f070 / 2.917 s','Paper bounds manually estimated, +/- 5 px'),
        (*frame(2,40),[27,50,409,484],'2.mp4 / f040 / 1.667 s','Paper bounds manually estimated, +/- 5 px'),
        (*image(OUT/'final-gallery-hover.png'),bounds(craft('hover')['corners']),'New / actual hover / light time paused','Paper bounds from current projected GPU corners'),
    ]),
    ('FOCUSED / direction + restrained light',[
        (*frame(3,48),bounds(quad3),'3.mp4 / f048 / 2.000 s','Paper bounds from fitted outer edges'),
        (*frame(4,48),bounds(quad4),'4.mp4 / f048 / 2.000 s','Paper bounds from fitted outer edges'),
        (*image(OUT/'final-focused.png'),bounds(craft('focus')['corners']),'New / pointer upper right / light paused','Paper bounds from current projected GPU corners'),
    ])
]

pw,ph,gap,pad=490,600,18,24
canvas=Image.new('RGB',(pad*2+pw*3+gap*2,1486),'#e8e3d8')
draw=ImageDraw.Draw(canvas)
draw.text((pad,18),'STAMP SURFACE / ORIGINAL - PREVIOUS - CURRENT',font=TITLE,fill='#272921')
draw.text((pad,59),'Equal projected paper height; original aspect + pose preserved. No geometric correction.',font=FONT,fill='#66675e')
for col,label in enumerate(['ORIGINAL / USER RECORDING','PREVIOUS / USER RECORDING','CURRENT / VERIFIED CHROME']):
    draw.text((pad+col*(pw+gap),101),label,font=SMALL,fill='#484b40')

audit={'method':'Projected paper bounding-box height = 480 px in every panel; uniform resize only, centered by projected bounds. Gray padding shows area outside source recording. Original and previous use different mouse paths and times; no pixel-equivalence score.','inputs':[],'current_poses':{state:craft(state) for state in ['hover','focus']}}
for row,(heading,items) in enumerate(rows):
    y=138+row*650
    draw.text((pad,y),heading,font=TITLE,fill='#272921')
    for col,(source,path,box,caption,note) in enumerate(items):
        x=pad+col*(pw+gap);top=y+43
        paper_h=box[3]-box[1];scale=480/paper_h
        resized=source.resize((round(source.width*scale),round(source.height*scale)),Image.Resampling.LANCZOS)
        panel=Image.new('RGB',(pw,ph),'#cfccc4')
        cx=(box[0]+box[2])/2*scale;cy=(box[1]+box[3])/2*scale
        panel.paste(resized,(round(pw/2-cx),round(287-cy)))
        canvas.paste(panel,(x,top))
        draw.rectangle((x,top+556,x+pw,top+ph),fill='#e8e3d8')
        draw.text((x+4,top+563),caption,font=SMALL,fill='#454a3e')
        audit['inputs'].append({'row':row,'column':col,'path':str(path),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'source_size':list(source.size),'paper_bounds':box,'paper_bounds_method':note,'uniform_scale':scale,'caption':caption})
draw.text((pad,1449),'Different pointer paths, source print designs and capture scales. Current optical animation paused for reproducibility.',font=SMALL,fill='#62665b')
canvas.save(OUT/'video-original-previous-current.jpg',quality=94,subsampling=0)
(OUT/'video-original-previous-current.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'image':str(OUT/'video-original-previous-current.jpg'),'inputs':len(audit['inputs']),'size':list(canvas.size)},ensure_ascii=False))

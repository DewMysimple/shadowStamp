"""Final paper-preserving light evidence; compare only like stamps, never silver as a target."""
from pathlib import Path
import hashlib
import json
import math
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts' / 'fidelity-research'
states = json.loads((OUT / 'paper-light-verified.json').read_text(encoding='utf-8'))['states']
source = json.loads((OUT / 'ncs-live-material-observations.json').read_text(encoding='utf-8'))['bill']
FONT_FILE = 'C:/Windows/Fonts/msyh.ttc'
FONT = ImageFont.truetype(FONT_FILE, 17)
SMALL = ImageFont.truetype(FONT_FILE, 13)
TITLE = ImageFont.truetype(FONT_FILE, 27)
HEADING = ImageFont.truetype(FONT_FILE, 20)
record = {'status': 'final-paper-preserving-light', 'user_choice': '保留界面和印刷纸色，只改票内光与微细纸纹，不做浮雕或金属化。',
    'method': 'Exact remote DOM canvas / current GPU projected paper corner bounding boxes. User video before crop is manually estimated and marked. Equal paper-bbox height by uniform scaling; preserve pose and aspect. No similarity score.', 'rows': []}

def current_box(state, stamp):
    corners = next(item['corners'] for item in states[state]['poses'] if item['id'] == stamp)
    xs, ys = zip(*corners)
    return [min(xs), min(ys), max(xs)-min(xs), max(ys)-min(ys)]

reference_node = max((node for node in next(h['sample'] for h in source['hover'] if h['label'] == 'upperRight')['nodes'] if node['tag']=='CANVAS'), key=lambda node:node['width']*node['height'])
reference_box = [reference_node['x'], reference_node['y'], reference_node['width'], reference_node['height']]
rows = [
    {'title': 'NCS · 原站光影参考 / 本轮按用户选择保留绿纸印刷', 'cells': [
        ('bill-ncs-hover-upperRight.png', reference_box, '原站：NCS光影参考', 'remote DOM rectangle'),
        ('paper-light-craft-gallery.png', current_box('craftGallery','craft'), '本轮：悬停光影 / 绿纸保色', 'current gallery projected corners'),
        ('paper-light-craft-focus-lowerLeft.png', current_box('craftFocus','craft'), '本轮：聚焦光影 / 左下指针', 'current focus projected corners'),
    ]},
    {'title': 'Kensho · 用户录屏2修改前 / 本轮保留白纸与黑墨', 'cells': [
        ('latest-kensho-before-frame-060.png', [73,59,404,449], '修改前：2.mp4 第60帧 / 2.500s', 'manual estimated paper bounds in user recording'),
        ('paper-light-kensho-gallery.png', current_box('kenshoGallery','kensho'), '本轮：悬停光影 / 白纸黑墨', 'current gallery projected corners'),
        ('paper-light-kensho-focus-lowerLeft.png', current_box('kenshoFocus','kensho'), '本轮：聚焦光影 / 左下指针', 'current focus projected corners'),
    ]},
]
board = Image.new('RGB', (1460, 1174), '#e9e5da')
draw = ImageDraw.Draw(board)
draw.text((24,18), '最终光影对照 · 保留印刷，只改变光', font=TITLE, fill='#30372b')
draw.text((24,60), '用户选择：原界面、纸面配色与图案保留；允许微细纸纹，不做凸字浮雕或金属化。', font=FONT, fill='#6e775f')
for col, text in enumerate(['参考效果 / 修改前', '本轮光影（纸面保色）', '本轮聚焦（纸面保色）']):
    draw.text((24+col*480,100),text,font=HEADING,fill='#505c43')
for row_index, row in enumerate(rows):
    y = 149 + row_index*489
    draw.text((24,y),row['title'],font=HEADING,fill='#39432f')
    row_record={'title':row['title'],'cells':[]}
    for col,(filename,box,caption,method) in enumerate(row['cells']):
        image=Image.open(OUT/filename).convert('RGB')
        x0,y0,w,h=box;pad=h*.025
        crop=[max(0,math.floor(x0-pad)),max(0,math.floor(y0-pad)),min(image.width,math.ceil(x0+w+pad)),min(image.height,math.ceil(y0+h+pad))]
        fragment=image.crop(crop)
        scale=368/h
        fragment=fragment.resize((round(fragment.width*scale),round(fragment.height*scale)),Image.Resampling.LANCZOS)
        if fragment.width>444:raise RuntimeError('Comparison crop overflow')
        x=24+col*480;tile_y=y+38
        draw.rectangle((x,tile_y,x+444,tile_y+394),fill='#f4f0e8')
        board.paste(fragment,(x+(444-fragment.width)//2,tile_y+(394-fragment.height)//2))
        draw.text((x,tile_y+404),caption,font=SMALL,fill='#6f7764')
        row_record['cells'].append({'path':str((OUT/filename).relative_to(ROOT)),'input_sha256':hashlib.sha256((OUT/filename).read_bytes()).hexdigest(),'paper_bbox_xywh':box,'crop_ltrb':crop,'scale':scale,'bbox_method':method,'caption':caption})
    record['rows'].append(row_record)
draw.rectangle((16,1120,1444,1160),fill='#e1e5d5')
draw.text((24,1132),'底图、视口和指针轨迹不同；仅保留原比例等高缩放，未拉直、未换图，不计算逐像素相似度。',font=SMALL,fill='#67715a')
board.save(OUT/'final-light-comparison.jpg',quality=95)
(OUT/'final-light-comparison.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
print('final-light-comparison.jpg')

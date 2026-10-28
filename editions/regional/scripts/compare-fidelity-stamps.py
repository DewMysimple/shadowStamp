"""Same-stamp, same-state visual QA; no rectification, warping or similarity score."""
from pathlib import Path
import hashlib
import json
import math
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts' / 'fidelity-research'
CURRENT = json.loads((OUT / 'surface-verified.json').read_text(encoding='utf-8'))['states']
FONT_FILE = 'C:/Windows/Fonts/msyh.ttc'
FONT = ImageFont.truetype(FONT_FILE, 17)
SMALL = ImageFont.truetype(FONT_FILE, 13)
TITLE = ImageFont.truetype(FONT_FILE, 25)
HEADING = ImageFont.truetype(FONT_FILE, 20)
metadata = {'status': 'draft-superseded', 'user_choice': '保留原界面和印刷纸面，只改光；允许微细压纹，不要浮雕或金属化。', 'scope': 'Historical material experiment, NOT final delivery. Same stamp only; preserve screenshot aspect and pose. No image matching score.', 'boards': []}

def crop_and_fit(path, box, width=480, paper_height=410):
    image = Image.open(path).convert('RGB')
    x, y, w, h = box
    padding = h * .05
    crop = [max(0, math.floor(x-padding)), max(0, math.floor(y-padding)), min(image.width, math.ceil(x+w+padding)), min(image.height, math.ceil(y+h+padding))]
    fragment = image.crop(crop)
    scale = paper_height / h
    fragment = fragment.resize((round(fragment.width*scale), round(fragment.height*scale)), Image.Resampling.LANCZOS)
    if fragment.width > width:
        raise RuntimeError('A stamp crop would overflow its comparison column')
    return fragment, {'path': str(path.relative_to(ROOT)), 'input_sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'paper_bbox_xywh': box, 'crop_ltrb': crop, 'scale': scale}

def current_box(state, stamp):
    corners = next(item['corners'] for item in CURRENT[state]['poses'] if item['id'] == stamp)
    xs, ys = zip(*corners)
    return [min(xs), min(ys), max(xs)-min(xs), max(ys)-min(ys)]

for source_stamp, local_stamp, title in [('ncs', 'craft', 'NEW CRAFT SOCIETY'), ('kensho', 'kensho', 'KENSHO TECHNOLOGIES')]:
    source = json.loads((OUT / f'{source_stamp}-live-material-observations.json').read_text(encoding='utf-8'))['bill']
    board = Image.new('RGB', (1060, 1240), '#e9e5da')
    draw = ImageDraw.Draw(board)
    draw.text((24, 18), f'{title} · 中途研究稿', font=TITLE, fill='#30332b')
    draw.text((24, 61), '银材质/浮雕试验已被用户纸面保色选择替代；不是最终交付效果。', font=FONT, fill='#985e3a')
    draw.text((24, 94), '原站实测 / Chrome', font=FONT, fill='#505747')
    draw.text((548, 94), '中途材质试验 / 非最终目标', font=FONT, fill='#985e3a')
    entry = {'stamp': source_stamp, 'rows': []}
    for row, (kind, state, label) in enumerate([('gallery', local_stamp+'Gallery', '悬停 · 票面反射'), ('focus', local_stamp+'Focus', '聚焦 · 方向偏转与表面')]):
        top = 137 + row * 525
        draw.text((24, top), label, font=HEADING, fill='#30372b')
        if kind == 'gallery':
            snapshot = next(item['sample'] for item in source['hover'] if item['label'] == 'upperRight')
            source_path = OUT / f'bill-{source_stamp}-hover-upperRight.png'
        else:
            snapshot = source['focus']
            source_path = OUT / f'bill-{source_stamp}-focus.png'
        # These exact canvas DOM rectangles were captured with the screenshots.
        node = max((node for node in snapshot['nodes'] if node['tag'] == 'CANVAS'), key=lambda node:node['width']*node['height'])
        source_box = [node['x'], node['y'], node['width'], node['height']]
        local_path = OUT / f'verified-{local_stamp}-{kind}.png'
        local_box = current_box(state, local_stamp)
        row_entry = {'state': kind, 'reference': None, 'current': None}
        for col, (path, box, name) in enumerate([(source_path, source_box, 'reference'), (local_path, local_box, 'current')]):
            fragment, facts = crop_and_fit(path, box)
            left = 24 + col * 524
            tile_top = top + 38
            draw.rectangle((left, tile_top, left+488, tile_top+453), fill='#f2eee5')
            board.paste(fragment, (left+(488-fragment.width)//2, tile_top+(453-fragment.height)//2))
            draw.text((left, tile_top+459), f'{source_stamp.upper()} / {kind} / 原截图裁切', font=SMALL, fill='#73766a')
            row_entry[name] = facts
        entry['rows'].append(row_entry)
    draw.rectangle((16, 1191, 1044, 1229), fill='#eddbc9')
    draw.text((24, 1202), '中途研究稿：用户已明确不采用浮雕与金属化；不作为最终交付或一致性证明。', font=SMALL, fill='#985e3a')
    filename = f'same-stamp-{source_stamp}-draft.jpg'
    board.save(OUT / filename, quality=94)
    # Existing process-evidence paths also display the warning, never an unmarked stale result.
    board.save(OUT / f'same-stamp-{source_stamp}.jpg', quality=94)
    entry['output'] = filename
    metadata['boards'].append(entry)
    print(filename)
(OUT / 'same-stamp-comparison.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')

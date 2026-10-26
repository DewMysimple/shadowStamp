"""Read-only audit of the current two user videos; previous pass inputs stay separate."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts' / 'fidelity-research'
OUT.mkdir(parents=True, exist_ok=True)
FONT = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 15)

def contact(frames, indices, destination, title, fps, cols=8, tw=170, th=205):
    rows = (len(indices) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * (tw + 8) + 8, 48 + rows * (th + 28)), '#e8e3d8')
    draw = ImageDraw.Draw(sheet)
    draw.text((10, 12), title, font=FONT, fill='#282820')
    for j, i in enumerate(indices):
        im = Image.fromarray(cv2.cvtColor(frames[i], cv2.COLOR_BGR2RGB))
        im.thumbnail((tw, th))
        x = 8 + (j % cols) * (tw + 8)
        y = 44 + (j // cols) * (th + 28)
        sheet.paste(im, (x + (tw - im.width) // 2, y))
        draw.text((x, y + th + 3), f'{i:03d} {i/fps:.3f}s', font=FONT, fill='#282820')
    sheet.save(destination, quality=92)

report = {'observedAt': '2026-10-26', 'scope': 'Latest user 1.mp4 / 2.mp4; no source input writes', 'videos': []}
for number, label in ([] if '--source-only' in sys.argv else [(1, 'original-hover'), (2, 'latest-current-hover')]):
    path = Path(f'C:/Users/Administrator/Desktop/{number}.mp4')
    before = hashlib.sha256(path.read_bytes()).hexdigest()
    meta = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)], text=True))
    stream = next(s for s in meta['streams'] if s['codec_type'] == 'video')
    n, d = map(float, stream['avg_frame_rate'].split('/'))
    fps = n / d
    cap = cv2.VideoCapture(str(path))
    frames = []
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frames.append(frame)
    cap.release()
    prefix = f'{number}-{label}'
    contact(frames, list(range(0, len(frames), 4)), OUT / f'{prefix}-overview.jpg', f'{number}.mp4 / {label} / every fourth frame', fps, tw=210, th=260)
    sheets = []
    for start in range(0, len(frames), 48):
        filename = f'{prefix}-frames-{start:03d}-{min(start+47,len(frames)-1):03d}.jpg'
        contact(frames, list(range(start, min(start+48, len(frames)))), OUT / filename, f'{number}.mp4 / EVERY frame {start}-{min(start+47,len(frames)-1)}', fps)
        sheets.append(filename)
    for i in sorted(set([0, len(frames)-1, *(round((len(frames)-1)*f) for f in [.2,.4,.6,.8])])):
        ok, encoded = cv2.imencode('.png', frames[i])
        if not ok:
            raise RuntimeError('PNG encoding failed')
        (OUT / f'{prefix}-key-{i:03d}.png').write_bytes(encoded.tobytes())
    video = {'path': str(path), 'role': label, 'bytes': path.stat().st_size, 'sha256': before,
        'codec': stream['codec_name'], 'width': stream['width'], 'height': stream['height'],
        'fps': fps, 'frames': len(frames), 'video_duration': stream.get('duration'),
        'container_duration': meta['format']['duration'], 'all_frame_contact_sheets': sheets,
        'input_unchanged': before == hashlib.sha256(path.read_bytes()).hexdigest()}
    report['videos'].append(video)
    print(json.dumps(video))
if report['videos']:
    (OUT / 'latest-video-inputs.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

# The long source MP4 was already fully analyzed in docs/video-analysis.md.
# Revalidate identity/metadata, then inspect only the relevant three states.
source = next((ROOT / 'source').glob('*.mp4'))
source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
source_meta = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_frames,duration,avg_frame_rate', '-of', 'json', str(source)], text=True))
source_audit = {'path': str(source.relative_to(ROOT)), 'sha256': source_hash,
    'matches_previously_analyzed_input': source_hash == 'd96132ce5359963e783924cca2854286c831e6d08bb908ed8216c0b36845843c',
    'metadata': source_meta, 'current_pass_scope': 'Identity + metadata recheck and frames0/100/220 spot inspection. Full286-frame evidence retained in docs/video-analysis.md.',
    'spot_frames': []}
cap = cv2.VideoCapture(str(source))
for index in [0, 100, 220]:
    cap.set(cv2.CAP_PROP_POS_FRAMES, index)
    ok, frame = cap.read()
    if not ok:
        raise RuntimeError('Could not read original source spot frame')
    filename = f'external-source-frame-{index:03d}.jpg'
    im = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    im.save(OUT / filename, quality=94)
    if index == 100:
        im.crop((1400, 700, 2050, 1400)).save(OUT / 'external-source-hover-crop.jpg', quality=95)
    source_audit['spot_frames'].append({'frame': index, 'file': filename})
cap.release()
source_audit['input_unchanged'] = source_hash == hashlib.sha256(source.read_bytes()).hexdigest()
(OUT / 'external-source-audit.json').write_text(json.dumps(source_audit, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'source_sha256':source_hash,'source_matches_prior_audit':source_audit['matches_previously_analyzed_input']}))

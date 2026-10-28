"""Read all frames of the four user supplied comparisons; never alter inputs."""
from pathlib import Path
import hashlib
import json
import subprocess

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts' / 'controls-research'
OUT.mkdir(parents=True, exist_ok=True)
FONT = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 15)
LABELS = ['original-hover', 'previous-hover', 'original-focus', 'previous-focus']

def focused_quad(contour):
    """Fit virtual paper corners to long convex-hull edges, excluding corner cutouts."""
    hull=cv2.convexHull(contour).reshape(-1,2).astype(float)
    center=hull.mean(0);span=np.ptp(hull,axis=0)
    groups={key:[] for key in ['top','bottom','left','right']}
    for p,q in zip(hull,np.roll(hull,-1,axis=0)):
        delta=q-p;mid=(p+q)/2
        if abs(delta[0])>abs(delta[1]) and np.linalg.norm(delta)>span[0]*.12:
            groups['top' if mid[1]<center[1] else 'bottom'].extend([p,q])
        elif abs(delta[1])>abs(delta[0]) and np.linalg.norm(delta)>span[1]*.12:
            groups['left' if mid[0]<center[0] else 'right'].extend([p,q])
    if any(len(p)<2 for p in groups.values()): return None
    lines={}
    for k,p in groups.items():
        a=np.asarray(p)
        lines[k]=np.polyfit(a[:,0],a[:,1],1) if k in ['top','bottom'] else np.polyfit(a[:,1],a[:,0],1)
    def intersection(horizontal,vertical):
        a,b=lines[horizontal];c,d=lines[vertical]
        x=(c*b+d)/(1-c*a);return np.array([x,a*x+b])
    tl=intersection('top','left');tr=intersection('top','right');br=intersection('bottom','right');bl=intersection('bottom','left')
    return np.array([tl,tr,br,bl])

def contact(frames, indices, path, title, cols=8, tw=168, th=202):
    rows = (len(indices)+cols-1)//cols
    sheet = Image.new('RGB',(cols*(tw+8)+8,48+rows*(th+28)), '#e8e3d8')
    draw=ImageDraw.Draw(sheet)
    draw.text((10,12),title,font=FONT,fill='#282820')
    for j,i in enumerate(indices):
        im=Image.fromarray(cv2.cvtColor(frames[i],cv2.COLOR_BGR2RGB))
        im.thumbnail((tw,th))
        x=8+(j%cols)*(tw+8);y=44+(j//cols)*(th+28)
        sheet.paste(im,(x+(tw-im.width)//2,y))
        draw.text((x,y+th+3),f'{i:03d} {i/24:.3f}s',font=FONT,fill='#282820')
    sheet.save(path,quality=90)

audit={'status':'four_inputs_readable','originals_untouched':True,'videos':[]}
for number,label in enumerate(LABELS,1):
    path=Path(f'C:/Users/Administrator/Desktop/{number}.mp4')
    meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=codec_name,width,height,r_frame_rate,avg_frame_rate,nb_frames,duration','-show_entries','format=duration','-of','json',str(path)],text=True))
    cap=cv2.VideoCapture(str(path));frames=[]
    while True:
        ok,frame=cap.read()
        if not ok: break
        frames.append(frame)
    cap.release()
    stream=meta['streams'][0]
    metrics=[];quad_metrics=[]
    for i,frame in enumerate(frames):
        b,g,r=cv2.split(frame)
        if number in (3,4):
            # Focused paper has large contrast against the nearly black background.
            mask=np.uint8((r>80)&(g>80)&(b>65))*255
        else:
            # Track green print rather than white paper against a warm white page.
            mask=np.uint8((g.astype(float)>r+3.)&(g.astype(float)>b+1.)&(r<200))*255
        mask=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,np.ones((9,9),np.uint8))
        cs,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        c=max(cs,key=cv2.contourArea) if cs else np.zeros((1,1,2),np.int32)
        rect=cv2.minAreaRect(c); points=cv2.boxPoints(rect)
        metrics.append({'frame':i,'seconds':round(i/24,6),'rectangle':[[round(float(a),3) for a in p] for p in points],'center':[round(float(a),3) for a in rect[0]],'size':[round(float(a),3) for a in rect[1]],'angle':round(float(rect[2]),4),'contour_area':round(cv2.contourArea(c),1)})
        if number in (3,4):
            quad=focused_quad(c)
            if quad is not None:
                tl,tr,br,bl=quad
                left=np.linalg.norm(bl-tl);right=np.linalg.norm(br-tr);top=np.linalg.norm(tr-tl);bottom=np.linalg.norm(br-bl)
                quad_metrics.append({'frame':i,'seconds':round(i/24,6),'quad':quad.round(3).tolist(),'center':quad.mean(0).round(3).tolist(),'left_px':round(float(left),3),'right_px':round(float(right),3),'top_px':round(float(top),3),'bottom_px':round(float(bottom),3),'vertical_ratio':round(float(left/right),5),'horizontal_ratio':round(float(top/bottom),5)})
    prefix=f'video-{number}-{label}'
    contact(frames,list(range(0,len(frames),4)),OUT/f'{prefix}-overview.jpg',f'{number}.mp4 / {label} / every 4 frames',cols=8,tw=210,th=252)
    sheets=[]
    for start in range(0,len(frames),48):
        dest=OUT/f'{prefix}-frames-{start:03d}-{min(start+47,len(frames)-1):03d}.jpg'
        contact(frames,list(range(start,min(start+48,len(frames)))),dest,f'{number}.mp4 / {label} / EVERY frame {start}-{min(start+47,len(frames)-1)}')
        sheets.append(str(dest.relative_to(ROOT)))
    for i in [0,round((len(frames)-1)/3),round((len(frames)-1)*2/3),len(frames)-1]:
        ok,encoded=cv2.imencode('.png',frames[i])
        if not ok: raise RuntimeError('PNG encoding failed')
        (OUT/f'{prefix}-key-{i:03d}.png').write_bytes(encoded.tobytes())
    video={'path':str(path),'role':label,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'stream':stream,'container_duration':meta['format']['duration'],'decoded_frames':len(frames),'all_frame_contact_sheets':sheets,'measurement_caveat':'Automatic color masks approximate object rectangle; light variation and pointer occlusion can affect it. Not DOM geometry or exact perspective fitting.','frame_measurements':metrics}
    if quad_metrics:
        (OUT/f'video-{number}-focused-quad.json').write_text(json.dumps({'method':'Threshold paper against dark background; fit long convex-hull outer-edge segments; virtual corner intersections exclude corner cutouts. Estimated geometry with several-pixel uncertainty, not exact DOM.','frames':quad_metrics},indent=2),encoding='utf-8')
        video['focus_geometry_summary']={k:{'min':np.min([q[k] for q in quad_metrics],axis=0).tolist(),'max':np.max([q[k] for q in quad_metrics],axis=0).tolist()} for k in ['center','vertical_ratio','horizontal_ratio']}
    audit['videos'].append(video)
    print(json.dumps({k:v for k,v in video.items() if k!='frame_measurements'},ensure_ascii=False))
(OUT/'video-input-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')

# Actual-frame overlay makes the fitted perspective differences reviewable.
overlay=Image.new('RGB',(1374,1148),'#e8e3d8')
draw=ImageDraw.Draw(overlay)
for j,(number,index) in enumerate([(3,0),(3,48),(3,144),(4,0),(4,48),(4,112)]):
    measured=json.loads((OUT/f'video-{number}-focused-quad.json').read_text(encoding='utf-8'))['frames'][index]
    cap=cv2.VideoCapture(f'C:/Users/Administrator/Desktop/{number}.mp4')
    cap.set(cv2.CAP_PROP_POS_FRAMES,index);ok,frame=cap.read();cap.release()
    if not ok: raise RuntimeError('Could not reread focus evidence frame')
    im=Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB));ink=ImageDraw.Draw(im)
    p=measured['quad'];ink.line([tuple(q) for q in p]+[tuple(p[0])],fill='#e75440',width=4)
    im.thumbnail((450,520))
    x=j%3*458;y=j//3*574
    overlay.paste(im,(x+(450-im.width)//2,y+46))
    draw.text((x+8,y+8),f'{number}.mp4 f{index:03d} {index/24:.3f}s',font=FONT,fill='#282820')
overlay.save(OUT/'video-focus-geometry-evidence.jpg',quality=94)

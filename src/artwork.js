/* Original, deterministic print artwork. No downloaded images or third-party art. */

const W = 720;
const H = 900;

function seeded(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let v = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    v ^= v + Math.imul(v ^ (v >>> 7), 61 | v);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

function type(ctx, text, x, y, size = 23, color = '#34412d', family = 'monospace') {
  ctx.fillStyle = color;
  ctx.font = `${size}px ${family}`;
  ctx.fillText(text, x, y);
}

function roundBox(ctx, x, y, width, height, radius = 14) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function paperGrain(ctx, seed, strength = 14) {
  const random = seeded(seed);
  const tile = document.createElement('canvas');
  tile.width = 360;
  tile.height = 450;
  const grain = tile.getContext('2d');
  const pixels = grain.createImageData(tile.width, tile.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const n = Math.round(255 - random() * strength);
    pixels.data[i] = n;
    pixels.data[i + 1] = n;
    pixels.data[i + 2] = n - 2;
    pixels.data[i + 3] = 255;
  }
  grain.putImageData(pixels, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tile, 0, 0, W, H);
  ctx.restore();
}

// Marching squares of a smooth analytic field makes fine engraved contours.
// Each level is a batched Path2D; the field and print grain never change per frame.
function engravedContours(ctx, x, y, width, height) {
  const step = 4;
  const nx = Math.ceil(width / step);
  const ny = Math.ceil(height / step);
  const field = new Float32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const px = i * step;
      const py = j * step;
      const u = px / width;
      const v = py / height;
      const warpX = px + 22 * Math.sin(py * .017) + 12 * Math.cos(py * .041 + px * .007);
      const warpY = py + 26 * Math.sin(px * .015) + 11 * Math.sin(py * .021);
      let f = .23 * Math.sin(warpX * .024 + Math.sin(warpY * .011) * 2.1)
        + .21 * Math.cos(warpY * .018 + Math.cos(warpX * .012) * 2.2)
        + .12 * Math.sin((warpX + warpY) * .035)
        + .055 * Math.cos(warpX * .063 - warpY * .048);
      f += .42 * Math.exp(-((u - .28) ** 2 / .018 + (v - .34) ** 2 / .026));
      f -= .38 * Math.exp(-((u - .76) ** 2 / .019 + (v - .65) ** 2 / .018));
      field[j * (nx + 1) + i] = f;
    }
  }
  const low = -.8;
  const spacing = .023;
  const levels = 74;
  const paths = Array.from({ length: levels }, () => new Path2D());
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = field[j * (nx + 1) + i];
      const b = field[j * (nx + 1) + i + 1];
      const c = field[(j + 1) * (nx + 1) + i + 1];
      const d = field[(j + 1) * (nx + 1) + i];
      const first = Math.max(0, Math.ceil((Math.min(a, b, c, d) - low) / spacing));
      const last = Math.min(levels - 1, Math.floor((Math.max(a, b, c, d) - low) / spacing));
      for (let k = first; k <= last; k++) {
        const level = low + k * spacing;
        const points = [];
        if ((a > level) !== (b > level)) points.push([i + (level - a) / (b - a), j]);
        if ((b > level) !== (c > level)) points.push([i + 1, j + (level - b) / (c - b)]);
        if ((c > level) !== (d > level)) points.push([i + 1 - (level - c) / (d - c), j + 1]);
        if ((d > level) !== (a > level)) points.push([i, j + 1 - (level - d) / (a - d)]);
        for (let n = 0; n + 1 < points.length; n += 2) {
          paths[k].moveTo(x + points[n][0] * step, y + points[n][1] * step);
          paths[k].lineTo(x + points[n + 1][0] * step, y + points[n + 1][1] * step);
        }
      }
    }
  }
  ctx.lineWidth = .68;
  for (let i = 0; i < paths.length; i++) {
    ctx.strokeStyle = i % 5 === 0 ? 'rgba(52,78,43,.59)' : 'rgba(72,94,51,.40)';
    ctx.stroke(paths[i]);
  }
}

function organicIsland(ctx, x, y, rx, ry, phase = 0) {
  ctx.beginPath();
  for (let i = 0; i <= 110; i++) {
    const a = i / 110 * Math.PI * 2;
    const ripple = 1 + .15 * Math.sin(a * 3 + phase) + .10 * Math.cos(a * 5 - phase);
    const px = x + Math.cos(a) * rx * ripple;
    const py = y + Math.sin(a) * ry * ripple;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function craft(ctx) {
  const x = 57, y = 55, width = 606, height = 790;
  ctx.save();
  roundBox(ctx, x, y, width, height, 15);
  ctx.clip();
  const green = ctx.createLinearGradient(80, 90, 610, 810);
  green.addColorStop(0, '#dce3c9');
  green.addColorStop(.28, '#b6d47f');
  green.addColorStop(.64, '#c4d992');
  green.addColorStop(1, '#e1e0c9');
  ctx.fillStyle = green;
  ctx.fillRect(x, y, width, height);
  const glazes = [[210,360,190,'rgba(127,170,82,.22)'], [525,485,260,'rgba(182,203,115,.26)'], [340,155,145,'rgba(242,230,195,.30)']];
  for (const [cx,cy,r,color] of glazes) {
    const glaze = ctx.createRadialGradient(cx,cy,0,cx,cy,r);
    glaze.addColorStop(0,color);glaze.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle = glaze;ctx.fillRect(x,y,width,height);
  }
  ctx.fillStyle = '#e1dfc9';
  organicIsland(ctx, 441, 270, 34, 45, .8);
  organicIsland(ctx, 520, 294, 27, 67, 1.3);
  organicIsland(ctx, 160, 451, 25, 41, 2.2);
  organicIsland(ctx, 230, 591, 45, 18, .5);
  organicIsland(ctx, 111, 288, 15, 27, .9);
  engravedContours(ctx,x,y,width,height);
  // Fine secondary engraving gives a continuous print even between contour levels.
  ctx.strokeStyle = 'rgba(95,115,64,.12)';
  ctx.lineWidth = .6;
  for (let row = 0; row < 170; row++) {
    const yy = y + row * 4.7;
    ctx.beginPath();
    for (let xx = x; xx <= x + width; xx += 3) {
      const py = yy + Math.sin(xx * .045 + row * .16) * 2.4 + Math.sin(xx * .018 - row * .1) * 3;
      if (xx === x) ctx.moveTo(xx,py);else ctx.lineTo(xx,py);
    }
    ctx.stroke();
  }
  // A quiet border of concentric irregular hairlines, like a hand-pulled proof.
  for (let inset = 6; inset < 29; inset += 3.2) {
    ctx.strokeStyle = `rgba(79,94,58,${inset < 12 ? .35 : .18})`;
    ctx.lineWidth = .6;
    roundBox(ctx,x+inset,y+inset,width-inset*2,height-inset*2,11);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(232,231,211,.23)';
  ctx.fillRect(99, 95, 240, 76);
  type(ctx,'NEW CRAFT',103,123,26,'#536748');
  type(ctx,'SOCIETY',103,154,26,'#536748');
  ctx.fillStyle = 'rgba(227,229,202,.20)';
  ctx.fillRect(477,779,142,34);
  type(ctx,'01/2025',485,805,25,'#5b704e');
  ctx.restore();
}

function kensho(ctx) {
  const random = seeded(8104);
  ctx.fillStyle = '#efefeb';ctx.fillRect(0,0,W,H);
  for (let i = 0; i < 1800; i++) {
    const x=45+random()*630,y=45+random()*810;
    ctx.fillStyle=`rgba(36,36,33,${random()*.09})`;
    ctx.fillRect(x,y,random()*2.8,random()*3.5);
  }
  type(ctx,'KENSHO',69,113,41,'#292a27');
  type(ctx,'TECHNOLOGIES',119,162,41,'#292a27');
  type(ctx,'05',70,300,44,'#292a27');
  type(ctx,'2025',505,300,44,'#292a27');
  ctx.fillStyle='#20221f';ctx.font='bold 500px Georgia';ctx.fillText('C',176,694);
  // A paper-coloured hairline spiral through the heavy letter suggests intaglio.
  ctx.save();
  ctx.globalCompositeOperation='source-atop';
  ctx.strokeStyle='rgba(238,238,229,.30)';ctx.lineWidth=.7;
  for(let j=0;j<130;j++) {
    const a=j*.048;ctx.beginPath();
    for(let p=0;p<150;p++) {
      const t=p/149*Math.PI*1.65;
      const r=126+j*.63+Math.sin(t*11+a)*3;
      const px=410+Math.cos(t)*r,py=507+Math.sin(t)*r;
      if(!p)ctx.moveTo(px,py);else ctx.lineTo(px,py);
    }
    ctx.stroke();
  }
  ctx.restore();
  type(ctx,'08',70,808,42,'#292a27');
  type(ctx,'FIELD / 001',420,808,21,'#55554c');
}

function specimen(ctx) {
  const random=seeded(13207);
  ctx.fillStyle='#d8d1bf';ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#c6bdab';ctx.fillRect(52,52,616,796);
  ctx.save();ctx.beginPath();ctx.rect(65,65,590,770);ctx.clip();
  ctx.strokeStyle='rgba(71,68,58,.11)';ctx.lineWidth=.8;
  for(let i=0;i<330;i++) {
    const x=70+i*1.8;ctx.beginPath();ctx.moveTo(x,70);ctx.lineTo(x+15*Math.sin(i*.13),790);ctx.stroke();
  }
  // An original botanical specimen, drawn from stems and etched leaves.
  const stems=[[360,718,306,160],[365,640,157,286],[359,584,550,268],[349,489,170,115],[356,400,494,115]];
  ctx.lineWidth=2;ctx.strokeStyle='#57594a';
  for(const [sx,sy,ex,ey] of stems) {
    ctx.beginPath();ctx.moveTo(sx,sy);ctx.bezierCurveTo(sx-25,sy-115,ex+25,ey+105,ex,ey);ctx.stroke();
    const dx=ex-sx,dy=ey-sy,len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len;
    for(let l=1;l<=7;l++) {
      const t=l/8;const px=sx+dx*t,py=sy+dy*t;
      for(const side of [-1,1]) {
        const size=32+Math.sin(t*Math.PI)*43;
        const tx=px+nx*size*side+dx*.10,ty=py+ny*size*side+dy*.10;
        ctx.fillStyle='rgba(79,83,64,.19)';
        ctx.beginPath();ctx.moveTo(px,py);ctx.quadraticCurveTo(px+nx*size*side,py+ny*size*side,tx,ty);ctx.quadraticCurveTo(tx+dx*.07,ty+dy*.07,px,py);ctx.fill();ctx.stroke();
        ctx.lineWidth=.55;
        for(let vein=1;vein<7;vein++) {
          const v=vein/7;ctx.beginPath();ctx.moveTo(px+(tx-px)*v,py+(ty-py)*v);ctx.lineTo(px+(tx-px)*v+dx*.05,py+(ty-py)*v+dy*.05);ctx.stroke();
        }
        ctx.lineWidth=1.2;
      }
    }
  }
  for(let i=0;i<5500;i++) {
    const x=65+random()*590,y=65+random()*770;
    ctx.fillStyle=`rgba(65,60,50,${random()*.12})`;ctx.fillRect(x,y,1,1);
  }
  ctx.restore();
  type(ctx,'Specimen.',78,786,49,'#4d4b40','Georgia');
  type(ctx,'BOTANICAL ARCHIVE  /  Nº 08',81,823,14,'#686457');
}

function mint(ctx) {
  const random=seeded(17118);
  const x=55,y=55,w=610,h=790;
  ctx.save();roundBox(ctx,x,y,w,h,13);ctx.clip();
  ctx.fillStyle='#b6d2be';ctx.fillRect(x,y,w,h);
  const colors=['#629e85','#80b69a','#d4debd','#9cbea2'];
  for(let i=0;i<32;i++) {
    ctx.fillStyle=colors[i%4];organicIsland(ctx,x+random()*w,y+random()*h,22+random()*83,28+random()*104,random()*6);
  }
  ctx.strokeStyle='rgba(231,237,211,.35)';ctx.lineWidth=.65;
  for(let j=0;j<115;j++) {
    ctx.beginPath();
    for(let i=0;i<155;i++) {
      const px=55+i*4,py=57+j*7+Math.sin(i*.12+j*.15)*9;
      if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
    }
    ctx.stroke();
  }
  ctx.fillStyle='rgba(243,242,215,.45)';
  for(let j=0;j<210;j++)for(let i=0;i<155;i++)ctx.fillRect(x+i*4,y+j*4,1.1,1.1);
  type(ctx,'POST / 06',92,113,20,'#dfebd3');
  ctx.save();ctx.translate(125,665);ctx.rotate(-.15);
  type(ctx,'onward',0,0,91,'#edf1d6','"Segoe Script", cursive');ctx.restore();
  type(ctx,'A SMALL NOTE FROM SOMEWHERE',90,809,16,'#e2ead1');ctx.restore();
}

function portrait(ctx, x, y, scale=1) {
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  ctx.fillStyle='#20221f';
  ctx.beginPath();ctx.moveTo(100,18);ctx.lineTo(239,65);ctx.lineTo(266,202);ctx.lineTo(190,135);ctx.lineTo(94,75);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#252722';ctx.lineWidth=6;ctx.lineJoin='round';
  ctx.beginPath();ctx.moveTo(106,73);ctx.bezierCurveTo(93,117,58,149,78,161);ctx.lineTo(106,174);ctx.lineTo(83,196);ctx.lineTo(117,216);ctx.lineTo(126,266);ctx.quadraticCurveTo(180,288,228,225);ctx.lineTo(244,196);ctx.stroke();
  ctx.beginPath();ctx.moveTo(117,125);ctx.lineTo(147,125);ctx.lineTo(160,136);ctx.moveTo(147,129);ctx.lineTo(140,143);ctx.moveTo(151,209);ctx.quadraticCurveTo(174,196,193,200);ctx.moveTo(159,265);ctx.lineTo(153,320);ctx.lineTo(259,351);ctx.moveTo(225,225);ctx.lineTo(224,296);ctx.lineTo(292,335);ctx.stroke();
  ctx.restore();
}

function gaohan(ctx) {
  ctx.fillStyle='#efefea';ctx.fillRect(0,0,W,H);
  type(ctx,'高',57,252,164,'#171a17','"Microsoft YaHei", sans-serif');
  type(ctx,'晗',57,438,164,'#171a17','"Microsoft YaHei", sans-serif');
  type(ctx,'GAO',65,566,75,'#171a17','Arial');
  type(ctx,'HAN',65,647,75,'#171a17','Arial');
  type(ctx,'DESIGN / OBSERVER',65,744,20,'#4d5048');
  ctx.save();ctx.beginPath();ctx.rect(322,67,330,699);ctx.clip();
  ctx.fillStyle='#e0e0d8';ctx.fillRect(322,67,330,699);
  ctx.strokeStyle='rgba(54,60,48,.11)';ctx.lineWidth=.6;
  for(let row=0;row<240;row++) {
    ctx.beginPath();ctx.moveTo(320,60+row*3);
    ctx.lineTo(658,65+row*3+Math.sin(row*.15)*8);ctx.stroke();
  }
  portrait(ctx,305,80,1.15);portrait(ctx,315,458,1.05);ctx.restore();
  type(ctx,'PORTRAITS OF A PRACTICE',65,814,19,'#585c51');
}

function nocturne(ctx) {
  const random=seeded(28031);
  const x=55,y=53,w=610,h=794;
  ctx.fillStyle='#242624';ctx.fillRect(x,y,w,h);
  ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
  ctx.strokeStyle='#c9ccbf';ctx.lineWidth=1.3;
  // Fine original perspective architecture, rather than a reused photograph.
  const vx=370,vy=45;
  for(let i=-6;i<23;i++) {
    const bx=i*44;ctx.beginPath();ctx.moveTo(vx,vy);ctx.lineTo(bx,875);ctx.stroke();
  }
  for(let j=0;j<29;j++) {
    const yy=120+j*j*.92;
    ctx.beginPath();ctx.moveTo(45,yy);ctx.quadraticCurveTo(360,yy-46,680,yy-7);ctx.stroke();
  }
  const blocks=[[118,152,111,455],[264,268,121,498],[429,108,146,624]];
  for(const [bx,by,bw,bh]of blocks) {
    ctx.fillStyle='rgba(29,32,29,.82)';ctx.fillRect(bx,by,bw,bh);
    ctx.strokeStyle='rgba(224,224,210,.64)';ctx.strokeRect(bx,by,bw,bh);
    for(let row=0;row<Math.floor(bh/18);row++)for(let col=0;col<Math.floor(bw/15);col++) {
      ctx.fillStyle=random()>.35?'rgba(211,215,193,.65)':'rgba(109,124,105,.30)';
      ctx.fillRect(bx+6+col*15,by+8+row*18,5+random()*3,7);
    }
  }
  for(let i=0;i<10500;i++) {
    ctx.fillStyle=`rgba(232,233,215,${random()*.27})`;
    ctx.fillRect(x+random()*w,y+random()*h,random()*1.7,random()*1.7);
  }
  type(ctx,'NOCTURNE',83,790,41,'#dedfd1','Georgia');
  type(ctx,'CITY STUDY / 05',87,822,17,'#b7bcae');ctx.restore();
}

function perforate(ctx) {
  ctx.save();ctx.globalCompositeOperation='destination-out';
  const horizontal=6,vertical=8,radius=24;
  ctx.fillStyle='#000';
  for(let i=0;i<horizontal;i++) {
    const x=(i+.5)*W/horizontal;
    ctx.beginPath();ctx.arc(x,0,radius,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(x,H,radius,0,Math.PI*2);ctx.fill();
  }
  for(let i=0;i<vertical;i++) {
    const y=(i+.5)*H/vertical;
    ctx.beginPath();ctx.arc(0,y,radius,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(W,y,radius,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}

const drawings={craft,kensho,specimen,mint,gaohan,nocturne};

/** Draw one complete print with a genuinely transparent perforated outline. */
export function createStampArtwork(kind, width=720, height=900) {
  const draw=drawings[kind];
  if(!draw)throw new Error(`Unknown stamp artwork: ${kind}`);
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(width));canvas.height=Math.max(1,Math.round(height));
  const ctx=canvas.getContext('2d');
  ctx.scale(canvas.width/W,canvas.height/H);
  ctx.fillStyle=kind==='specimen'?'#e0dbc9':'#f0eee3';
  ctx.fillRect(0,0,W,H);
  draw(ctx);
  paperGrain(ctx,7493+Object.keys(drawings).indexOf(kind)*811,kind==='craft'?16:21);
  // Ink flecks are stable print texture, not animated random noise.
  const random=seeded(440+Object.keys(drawings).indexOf(kind));
  for(let i=0;i<1450;i++) {
    ctx.fillStyle=`rgba(74,67,47,${random()*.07})`;
    ctx.fillRect(random()*W,random()*H,.7+random(),.7+random());
  }
  // All edge cuts are last, and their centres lie exactly on the outer edge.
  perforate(ctx);
  return canvas;
}

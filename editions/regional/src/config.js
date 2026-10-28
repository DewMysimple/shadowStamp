export const EXHIBITION = Object.freeze({
  enterDuration: 0.46,
  returnDuration: 0.56,
  reducedDuration: 0.1,
  hoverResponse: 0.085,
  blur: 11,
  mobileBlur: 6,
  maxDpr: 1.75,
  paper: '#fbf7f1',
  dark: '#22201c',
});

export const SERIES = Object.freeze([
  { id: 'all', label: '全部12张', title: '全部系列', edition: 'COLLECTIONS 001–003' },
  { id: 'guangdong', label: '广东篇', title: '狮醒岭南', edition: 'COLLECTION 001 · GUANGDONG' },
  { id: 'china', label: '中国篇', title: '狮舞九州', edition: 'COLLECTION 002 · CHINA' },
  { id: 'world', label: '世界篇', title: '狮跃四海', edition: 'COLLECTION 003 · WORLD' },
]);

export const STAMPS = Object.freeze([
  {
    id: 'foshan', series: 'guangdong', number: '01', place: '佛山', english: 'FOSHAN',
    title: '狮起南海', name: '佛山 · 狮起南海', caption: '南狮根脉 · 武艺之乡',
    story: '从佛山祖庙的灰塑屋脊，到南拳与醒狮相伴的节庆记忆。',
    design: '黑面张飞狮以低机位近景入画，黑毛与深金纹样衬出沉着威势。',
    ratio: 45 / 65, image: '/assets/stamps/01-foshan.png',
  },
  {
    id: 'guangzhou', series: 'guangdong', number: '02', place: '广州', english: 'GUANGZHOU',
    title: '花城采青', name: '广州 · 花城采青', caption: '广府年俗 · 木棉花城',
    story: '醒狮循着红绳采青，穿过骑楼与木棉花相映的广州街景。',
    design: '金黄狮身向上探身，鲜红木棉与翠绿生菜把画面串成纵向动势。',
    ratio: 45 / 65, image: '/assets/stamps/02-guangzhou.png',
  },
  {
    id: 'heshan', series: 'guangdong', number: '03', place: '鹤山', english: 'HESHAN',
    title: '灵狮猫步', name: '鹤山 · 灵狮猫步', caption: '七星鼓韵 · 水乡竹影',
    story: '鹤山狮舞的机敏步伐，在鼓点与水乡景致间轻巧展开。',
    design: '青绿与鹅黄狮身低伏回望，前爪轻落鼓面，形成舒展的横向曲线。',
    ratio: 45 / 65, image: '/assets/stamps/03-heshan.png',
  },
  {
    id: 'suixi', series: 'guangdong', number: '04', place: '遂溪', english: 'SUIXI',
    title: '高桩腾跃', name: '遂溪 · 高桩腾跃', caption: '雷州半岛 · 勇气与速度',
    story: '遂溪高桩醒狮在高低错落的桩阵之间完成腾跃。',
    design: '紫银狮身斜向冲出，金橙飘带与朱红高桩把速度延伸到海天之间。',
    ratio: 45 / 65, image: '/assets/stamps/04-suixi.png',
  },
  {
    id: 'beijing', series: 'china', number: '05', place: '北京', english: 'BEIJING',
    title: '京华太狮', name: '北京 · 京华太狮', caption: '庙会花会 · 黄蓝双狮',
    story: '北京传统庙会中的双狮相戏，连起古建、铜铃与节庆人群。',
    design: '金黄与靛蓝两只太狮围绕绣球错位互动，横向展开庙会场景。',
    ratio: 60 / 45, image: '/assets/stamps/05-beijing.png',
  },
  {
    id: 'tianyang', series: 'china', number: '06', place: '田阳', english: 'TIANYANG',
    title: '壮乡飞狮', name: '田阳 · 壮乡飞狮', caption: '壮锦纹样 · 铜鼓山河',
    story: '黄绿双狮跃过高台，铜鼓与壮乡山水构成节庆背景。',
    design: '前后错位的双狮沿着台柱飞跃，靛蓝壮锦纹样连接舞台和服饰。',
    ratio: 60 / 45, image: '/assets/stamps/06-tianyang.png',
  },
  {
    id: 'quanzhou', series: 'china', number: '07', place: '泉州', english: 'QUANZHOU',
    title: '闽南狮阵', name: '泉州 · 闽南狮阵', caption: '红砖古厝 · 武艺传承',
    story: '狮头低伏穿行武阵，周围的阵法表演让泉州街巷成为舞台。',
    design: '朱红狮身横向推进，红砖厝与燕尾脊托住前景狮阵的力量感。',
    ratio: 60 / 45, image: '/assets/stamps/07-quanzhou.png',
  },
  {
    id: 'hongkong', series: 'china', number: '08', place: '香港', english: 'HONG KONG',
    title: '港城狮跃', name: '香港 · 港城狮跃', caption: '都市节庆 · 双狮竞舞',
    story: '醒狮在唐楼与港岛天际线之间穿行，街头节庆充满城市活力。',
    design: '宝蓝狮前探采青，洋红狮随后跃起；前后景动作彼此呼应。',
    ratio: 60 / 45, image: '/assets/stamps/08-hongkong.png',
  },
  {
    id: 'singapore', series: 'world', number: '09', place: '新加坡', english: 'SINGAPORE',
    title: '狮庆南洋', name: '新加坡 · 狮庆南洋', caption: '牛车水 · 南洋花砖',
    story: '采青舞步落在牛车水街巷，热带植物与节庆灯笼相互映衬。',
    design: '薄荷绿、柠檬黄与暖红醒狮沿红绳向上采青，形成长幅节奏。',
    ratio: 40 / 75, image: '/assets/stamps/09-singapore.png',
  },
  {
    id: 'kualalumpur', series: 'world', number: '10', place: '吉隆坡', english: 'KUALA LUMPUR',
    title: '雄狮竞跃', name: '吉隆坡 · 雄狮竞跃', caption: '高桩竞技 · 城市天际',
    story: '高桩腾跃在热带城市节庆中展开，双子塔远远映入天际。',
    design: '紫黑狮身以银金刺绣提亮，朱红桩阵与竖向都市轮廓强化速度。',
    ratio: 40 / 75, image: '/assets/stamps/10-kualalumpur.png',
  },
  {
    id: 'sanfrancisco', series: 'world', number: '11', place: '旧金山', english: 'SAN FRANCISCO',
    title: '金山狮影', name: '旧金山 · 金山狮影', caption: '华埠巡游 · 社群记忆',
    story: '华埠巡游把狮舞、鼓乐和街坊人群连在一起，金门桥隐约入景。',
    design: '橘金狮回望观者，身体继续向前，灯笼沿华埠街道延伸至城市远景。',
    ratio: 40 / 75, image: '/assets/stamps/11-sanfrancisco.png',
  },
  {
    id: 'london', series: 'world', number: '12', place: '伦敦', english: 'LONDON',
    title: '伦敦狮韵', name: '伦敦 · 伦敦狮韵', caption: '唐人街 · 文化交流',
    story: '伦敦唐人街的狮舞在中式牌楼与英伦街景之间延续。',
    design: '蓝银醒狮昂首而立，红灯笼、牌楼与钟楼在同一街道纵深相遇。',
    ratio: 40 / 75, image: '/assets/stamps/12-london.png',
  },
]);

const SERIES_INDEX = Object.freeze({ guangdong: 0, china: 1, world: 2 });

/** Shared CSS-pixel layout: the frame viewport, collection heading and four paper cells. */
export function getExhibitionLayout(width, height) {
  const mobile = width < 800;
  if (!mobile) {
    // User's marked composition: a dominant frame (~59% visible width),
    // with the four stamps kept inside the smaller right-hand display.
    const frameWidth = width * .615;
    const frameHeight = frameWidth * .53;
    const gridHeight = frameWidth / 1.05 / 2;
    const gridY = Math.max(205, height * .48 - gridHeight / 2);
    const frame = { x: width * .014, y: gridY + gridHeight / 2 - frameHeight / 2,
      width: frameWidth, height: frameHeight };
    const collection = { x: width * .645, y: gridY - 61, width: width * .33, bottom: gridY + gridHeight };
    const grid = { x: collection.x, y: gridY, width: collection.width, height: gridHeight };
    return { mobile, margin: frame.x, frame, collection, grid };
  }
  const margin = mobile ? 20 : Math.max(30, Math.min(64, width * .035));
  const usable = width - margin * 2;
  const gap = mobile ? 0 : Math.max(36, width * .04);
  const column = mobile ? usable : (usable - gap) / 2;
  const frameWidth = column;
  const frameHeight = frameWidth * .53;
  const frameY = mobile ? 104 : Math.max(144, (height - frameHeight) / 2 - 12);
  const frame = { x: margin, y: frameY, width: frameWidth, height: frameHeight };
  const collection = { x: mobile ? margin : margin + column + gap,
    y: mobile ? frameY + frameHeight + 58 : 145,
    width: column, bottom: height - (mobile ? 65 : 83) };
  const grid = { x: collection.x, y: collection.y + 61, width: column,
    height: Math.max(120, collection.bottom - collection.y - 61) };
  return { mobile, margin, frame, collection, grid };
}

/** Category views retain each original ratio in two rows without any overlap. */
export function getHome(stamp, width, height, selectedSeries = 'guangdong') {
  const { grid } = getExhibitionLayout(width, height);
  const peers = STAMPS.filter(item => item.series === stamp.series);
  const index = Math.max(0, peers.findIndex(item => item.id === stamp.id));
  const overview = selectedSeries === 'all';
  const rows = overview ? 6 : 2;
  const cellWidth = grid.width / 2;
  const cellHeight = grid.height / rows;
  const row = Math.floor(index / 2) + (overview ? (SERIES_INDEX[stamp.series] ?? 0) * 2 : 0);
  const w = Math.min(cellWidth * .76, cellHeight * .85 * stamp.ratio);
  return { x: grid.x + cellWidth * (index % 2 + .5), y: grid.y + cellHeight * (row + .5),
    width: w, height: w / stamp.ratio, angle: 0, z: 2 + index };
}

export function getFocus(stamp, width, height, parameters = {}) {
  const mobile = width < 700;
  const focusHeight = parameters.focusHeight ?? 0.565;
  const maxHeight = height * (mobile ? Math.min(0.8, focusHeight * 0.64 / 0.565) : focusHeight);
  const widthLimit = width * (mobile ? 0.72 : (parameters.focusWidth ?? 0.295));
  const w = Math.min(widthLimit, maxHeight * stamp.ratio, 650);
  const halfWidth = w / 2 + 18, halfHeight = w / stamp.ratio / 2 + 55;
  const safe = (value, min, max) => Math.min(max, Math.max(min, value));
  const x = safe(width * (mobile ? 0.5 : (parameters.focusX ?? 0.5)), halfWidth, width - halfWidth);
  const y = safe(height * (parameters.focusY ?? 0.5), halfHeight, height - halfHeight);
  return { x, y, width: w, height: w / stamp.ratio, angle: 0 };
}

# Postal Studies · 光与纸的交互展览

React + Vite + 原生 Three.js。悬停邮票表面的自然斑驳光影来自用户「幽兰」场景8的光场与散焦算法，原工程保持只读。背景为静态暖白纸面。

## 运行

需要 Node.js 22.12+（本机验证为24.16）。在本目录运行：

```powershell
npm install
npm run dev
```

打开终端打印的地址，默认 [http://127.0.0.1:4173/](http://127.0.0.1:4173/)。端口占用时 Vite 会选择后续端口。

- 悬停邮票后，柔软的暖光和有机影形在票内渐显，随鼠标移动与时间变化，移出渐隐。纸面背景保持静止。
- 悬停也显示名称、抬升当前票并虚化其他票；点选进入暗色聚焦。
- 点击、右上返回或 Escape 退出；触屏直接点选。
- 聚焦后可在票内继续移动鼠标或拖动手指，引导局部光照。支持键盘和减少动态偏好。
- 左上角“参数控件”实时调节悬停/聚焦偏转、透视、转场、票面光影与场景8形态；支持预设、单组/全部重置、本机自动保存及JSON导入导出。聚焦后仍可调参，固定光影预览便于边调边看。

本轮已分析用户桌面的4段对比录屏，补上原站聚焦时的透视和朝指针微偏转，减弱上一版较深的大块光纹。[参数使用与差异说明](docs/parameter-guide.md)。

用户后续明确要求光效作用在**悬停邮票表面**，最终版本不显示票面彩虹色带、不把动态光影铺在背景上，也不提供额外的背景光影模式。

## 构建与验证

```powershell
npm run build
npm run test
# 保持开发服务启动，再开一个终端：
npm run test:browser
npm run test:light
npm run test:controls
```

浏览器脚本使用本机安装的 Chrome（Playwright channel: chrome），不要求下载额外浏览器。其他端口可设置 `VERIFY_URL`。主脚本在真实浏览器中验证14项交互/响应式/资源/回退，并把截图和报告写入 `artifacts/verification/`。票内光影专项脚本、`final-report.json` 与 `light-motion.webm` 在 `artifacts/light-study/`。该目录早期编号图为研究过程，不代表最终作用位置。`npm run preview -- --port 4174` 可预览生产构建。

## 代码与参数

| 文件 | 职责 |
| --- | --- |
| `src/App.jsx` | 语义按钮、键盘说明、模式切换和无WebGL纸面回退 |
| `src/config.js` | 六票布局/角度/尺寸/层级、虚化与聚焦时间 |
| `src/parameters.js`、`src/ParameterPanel.jsx` | 四组实时参数、预设、验证、保存与导入导出 |
| `src/artwork.js` | 六种固定seed的原创印刷图案和真实alpha齿孔 |
| `src/rendering/StampGallery.js` | 一个renderer、一个RAF、统一坐标/输入/生命周期 |
| `src/rendering/StampMaterial.js` | 局部UV采样光场、按hover强度合成纸面暖光、连续alpha虚化 |
| `src/rendering/DappledLight.js` | 384×480邮票光场、强度/速度/颜色/柔化/覆盖范围/开关与缓存 |
| `src/rendering/dappledShaders.js` | 场景8原始光场、50采样散焦、静态纸面输出 |
| `src/motion.js` | 可在中途反向的统一聚焦进度 |

没有运行时远程图片、字体或CDN依赖。邮票图案由代码生成；没有把视频帧或网站素材当成网页纹理。

## 研究与交付记录

- [研究总览](docs/research.md)、[实际网页观察](docs/web-research.md)
- [视频286帧分析](docs/video-analysis.md)、[幽兰场景8审计](docs/scene8-audit.md)
- [架构](docs/architecture.md)、[画面对比](docs/visual-comparison.md)
- [工程验收与文件清单](docs/validation.md)
- [本轮4段视频分析](docs/controls-video-analysis.md)、[网站重新实测](docs/controls-web-research.md)、[场景8参数映射](docs/controls-scene8.md)

初始工作区只有MP4，未包含任务书所称的既有镭射Shader。未修改或删除此类旧代码；最终纸面材质为新建模块，可在取得原资产后替换适配。六枚图案为原创近似设计，并不等于复原原网站所有插画。参考视频不含退出或手机画面，这两部分为本工程独立实现。

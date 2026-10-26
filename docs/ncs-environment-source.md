# NCS 原站环境与橙色光源：源码核实

2026-10-26 实际读取公开 JS，并在真实 Chrome 中记录 NCS 悬停时的 WebGL uniform。原站的橙色有明确的独立点光源：`#FFE0B0`、强度 `.65`、距票面高度 `.45`；环境图由中性 RoomEnvironment 生成。票面还叠加另一路 RGB 斑驳光，该调用链由本轮材质审计另行记录。

完整的 URL、SHA、零起始字符偏移与事实表见[环境源码记录](../artifacts/ncs-light-source/env-source-audit.json)。实时 GPU 记录见[env-runtime.json](../artifacts/ncs-light-source/env-runtime.json)。报告只保留参数和定位，不把原站实现作为产品资产。

| 层 | NCS 实际值 | 源码与运行证据 |
| --- | --- | --- |
| 环境图 | `PMREMGenerator` 从 RoomEnvironment 生成，sigma `.04`；强度 `1` | [专用引擎](https://billguo.me/_next/static/immutable/chunks/1tsv4_hr1pvu5.js) 字符616；实时 envMapIntensity=1 |
| 环境方向 | 未额外旋转 | 专用引擎无环境旋转赋值；实时 envMapRotation 为单位矩阵 |
| 主方向灯 | `#fff4e6`，强度 `1.6`；方向由指针控制，高度参数 `.4` | 引擎字符789、10545、11431；实时线性 RGB `1.6 / 1.447458 / 1.266077` |
| 橙色点灯 | `#FFE0B0`，强度 `.65`，位置 `(lx, -ly, .45)`；distance `0`，decay `2` | 引擎字符875、10545、11431；实时线性 RGB `.65 / .484513 / .282200` |
| 半球补光 | 天空白、地色 `#9a8f7d`，强度 `.32` | 引擎字符828；实时天空 `.32 / .32 / .32`，地面 `.103406 / .087897 / .065625` |
| 色彩输出 | NeutralToneMapping，曝光 `.57`，输出 sRGB | 引擎字符9778；真实 shader 包含 Neutral 和 sRGB 输出转换，实时曝光 `.57` |

这些 NCS 数字是最终配置覆盖后的值，不是引擎构造器的初始占位值。点灯颜色先通过 THREE.Color 转为线性工作色，再乘 `.65`；记录的 GPU 三通道与该换算逐项一致。方向灯、半球地色亦做了同样核对。点灯采用平方距离衰减，距离上限 `0` 表示不设截断；其有限高度使暖橙照明在指针附近集中，纸纹法线再改变局部反射。

实时 pointLights 的 Z 值 `-2.706875757…` 是相机空间坐标。相机 Z 为 `.5 / tan(9°) = 3.156875757…`，故该值对应世界坐标的灯高 `.45`。不能将负数解释成灯位于邮票背后。

[RoomEnvironment 源码](https://billguo.me/_next/static/immutable/chunks/4579-lwkikfr3.js)中，内部点灯为白色，强度900、distance28、decay2；六组发光盒也是白色，强度50、50、17、43、20、100。当前 NCS 未选 studio；引擎中的四灯板 studio 环境是其他材质分支，其偏暖底部灯板颜色 `#f3eadb` 不应算作当前 NCS 的橙色来源。没有从外部橙色 HDR 图载入 NCS 环境的证据。

原站的色彩流程是：印刷图按 sRGB 读取，法线/高度按无颜色空间读取；灯光颜色在线性空间进行物理照明，Neutral 按 `.57` 曝光压缩高光，然后转回 sRGB。将这些 hex 颜色直接当作显示空间的全票面色罩，会改变色彩关系；调整时应保留橙色局部光、浅暖主光、中性环境和阴影的各自作用。

引擎也有斑驳图驱动高光的条件分支，但 NCS 默认 `dappleCoupling=0`，该分支不活跃。真实起作用的 RGB 光场合成及 `.26` tint 属于另一条 Canvas multiply 路径；不能仅看到 shader 注释便认定橙色由该高光门控产生。本报告未把场景8的珊瑚色调机械当作 NCS 整体底色。

本次研究只读原站；未改产品源码、幽兰工程、用户视频或参考图片。检查命令 `node artifacts/ncs-light-source/env-runtime.mjs` 与 `node artifacts/ncs-light-source/env-source-audit.mjs` 均完成，后者核对颜色换算、环境强度/旋转、曝光与来源 SHA。网站原始代码仅缓存在 ignored 临时目录，研究记录不复制整包。

# browser-extension-video-miniplayer

视频小窗 Mini Player Chrome / Edge / Arc 等 Chromium 浏览器扩展：当页面主视频滚出视口时，在右下角显示可操控的小播放框。 功能 - 自动识别页面主视频（优先正在播放、面积较大的 `<video>`） - 主播放框可见时隐藏小窗；滚出后显示右下角小窗 - 小窗实时镜像画面（canvas），播放/暂停、进度条控制原视频 - 点击画面或「↺」平滑滚回主视频

## 用途与 Target 判定

网页视频小窗浏览器扩展

- 移动端：不适用
- 智能硬件：不适用

## 目标平台

本目录**不是**需双 Target 交付的消费级 App（见用途）。按实际形态维护即可。

## 技术栈信号

- 检测到：browser-extension

## 命令

```bash
# Chrome → 扩展程序 → 加载已解压的扩展程序 → 选本目录
npm test   # 若有
```

## 助手约束

- Loop：先定可验证 Done 与停止条件；每切片过验证环；失败回灌；详见 docs/LOOP_ENGINEERING.md
- Harness：遵循根 AGENTS「Harness Engineering」；Guide=本文件，Sensor=测试/CI；同类失误二次须沉淀规则或测试（棘轮）。详见 docs/HARNESS_ENGINEERING.md
- 遵循仓库根 `AGENTS.md`：通用性/扩展性、分阶段里程碑、默认双 Target（**仅当用途适合**）
- 可选 Target 未做时可搁置；不要为不适用形态硬加 APK/穿戴
- 改动保持聚焦；公共逻辑抽到 shared/`tools/`，禁止静默失败

# TOEIC Visual Vocabulary

React、TypeScript、Vite 的纯静态词汇学习网站。真实 Excel 导入 626 条记录，分成 13 个 List。每条解释独立保留。系统朗读使用 Web Speech API，不生成音频文件，不使用付费服务。

## Windows PowerShell 安装与启动

安装 Node.js 22+（包含 npm）和 Python 3.10+，然后在项目目录运行：

```powershell
npm install
python -m pip install -r requirements.txt
npm run dev
```

打开终端显示的 http://127.0.0.1:5173/ 。编辑启动命令为 `npm run dev:edit`，在页面顶部开启「图片编辑」。编辑模式使用浏览器草稿与 ZIP 导出，不运行本地写盘 API。

```powershell
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:browser
python scripts/test_import.py
python scripts/validate_data.py
npm run build
```

## 导入 Excel、添加 List

将源文件放到 `data-source/英语学习.xlsx`，工作表名为 `3500词搞定托业考试_0829`，第一行表头，B～J 为词汇字段。运行 `npm run import`，每 50 条自动生成一个 List，末尾不足 50 条正常。空单词行跳过，同名不同释义不去重。

也可运行 `python scripts/import_excel.py "新文件.xlsx"`。重导入匹配原始内容签名及重复记录的出现顺序，保留 ID、图片、笔记及词汇编辑。新增记录分配新 ID。原始 Excel 中已经改变含义或例句的行视为新记录，需要手动检查图片关联；不按拼写猜测迁移。新导入需包含希望保留的全部源记录。旧 List 文件不会自动删除，manifest 决定网站可见的 List。

## 学习与朗读

左侧搜索覆盖全部 List。点击 List 切换，位置和设置自动保存。底部播放、暂停/恢复、停止、上一条、下一条和起点控制朗读；卡片喇叭从任意词汇开始。播放期间点击其他卡片可跳词。

暂停保留当前词汇与字段，点击「恢复播放」继续。方块「停止」清空朗读任务、回到当前 List 第 1 条并保存序号，下次播放从第 1 条开始。停止时点击其他词条可选择新的起点，顶部位置、卡片高亮和底部序号同步更新。

朗读设置支持英语/中文语音、英美偏好、语速、音调、音量、字段组合、上下调整顺序、字段与词条重复、间隔、当前词循环和 List 循环。改变设置或 List 会取消旧任务。没有字段时不启动播放。中英字段使用独立 utterance。

显示设置支持图文比例、文字大小、字段隐藏、图片模式覆盖文字、颜色、字号、透明背景与位置。看图猜词模式点击图片揭示。自动跟随可设顶部/中央/底部，手动滚动暂时停止跟随后可点击重新跟随。

Windows 的语音由系统与浏览器提供，需要时在系统语言设置安装中文、英语语音。Android、iPhone、iPad 的可用 Voice、暂停恢复与连续播放能力受浏览器及系统限制。必须由用户点击触发播放。切到后台自动暂停，返回后手动恢复；不能保证锁屏持续朗读。可开启 Screen Wake Lock，通常要求 HTTPS 或 localhost，浏览器不支持时提示。

## 图片与词汇编辑

开启「图片编辑」，点击词条选中后 Ctrl+V 粘贴；也可拖入对应图片区域，或点击添加图片选择多个 JPG、PNG、WebP。限制单文件 25 MB。默认 WebP 压缩，最长边 1600px，质量 0.82，可调整或关闭以保留原格式。解码按图片方向处理，失败提示，不会替换原图。

可编辑宽度、高度、缩放、旋转、contain/cover、位置、描述，排序、设默认、删除或更换。第一张为默认，图文学习显示所有关联图片。点击放大按钮查看大图。词条下方可修改字段、音标、词性、标签和笔记。

图片窗口默认按原图比例随屏幕宽度调整高度，旧图片的固定高度不再默认生效。图片编辑可选择原图、4:3、1:1、16:9 或自定义固定高度，只有选择固定高度时高度输入才生效。手机和平板竖屏使用上下布局。大图查看提供适应屏幕与放大细节，放大后可滑动查看；横向场景图在手机竖屏完整展示时上下留空是正常现象，不需要重新裁图。

手机和平板的内容区独立滚动，在底部播放栏上方预留空间，纯文字和纯图片模式均不会被播放栏遮挡。横屏纯图片模式还会根据可用屏幕高度缩小完整图片，播放栏使用紧凑布局。长词条朗读时从卡片顶部定位，详情可在内容区域继续滑动。宽度不超过 1100px 时 List 导航使用抽屉。

草稿及图片 Blob 存在当前浏览器 IndexedDB，刷新恢复；临时 Blob URL 仅用于展示，不存入 JSON。隐私模式、清除浏览器数据或存储配额可能影响草稿，建议及时导出。

## 将修改保存到仓库

「导出修改」下载 ZIP，包括受影响的完整 List JSON、真实图片和 `deleted-files.json`。建议使用安全导入工具，避免直接解压遗漏删除文件：

```powershell
python scripts/apply_export.py "$env:USERPROFILE\Downloads\toeic-modifications.zip"
python scripts/validate_data.py
npm run build
git add .
git commit -m "Add vocabulary images"
git push
```

导出不会自动清空草稿。确认本地文件与已发布网站正确后，可在编辑设置清除草稿。浏览器不能无授权修改磁盘；ZIP + 本地脚本为所有支持浏览器的保存方案。

## GitHub Pages

仓库 Settings → Pages → Source 选择 GitHub Actions。向 main 或 master 推送后，工作流安装依赖、类型检查、Lint、测试、构建并部署。可手动运行工作流。`base: './'` 和统一 asset() 使 JSON/图片兼容 `https://用户名.github.io/仓库名/`。HashRouter 不需要服务器回退路由。Python、Excel 与本地导入脚本不进入 dist。

本项目尚需提交和推送才会触发远端部署。公开页面没有 GitHub 写入 API；用户本地编辑不会更改发布内容。

## 手动真实设备验证

在 Windows/Android/iOS 分别选英语与中文语音，连续播放到第 25 条检查高亮与滚动；暂停恢复，快速换 List 和词条，确认没有旧语音回调。测试手机横竖屏、抽屉和底部控制栏。粘贴/拖入多图，修改大小与覆盖层，刷新确认草稿，导出后执行 apply_export，再检查生产预览。后台、锁屏和屏幕常亮须用真实设备验证，CI 使用 Mock SpeechSynthesis。

## 扩展

类型、Zustand 设置、独立 SpeechPlayer 和 IndexedDB/ZIP 服务分离，可添加听写、测验或记忆卡片页面。数据由 JSON 驱动，组件不包含词汇示例数据。

# Story Review 维护说明

List 01 的最后一个词条之后有「Story Review — 故事复习」。展开后可独立朗读故事；不会自动把故事当作第 51 条词汇，也不会改动原有 items。List 02 等没有 Story 的列表保持原有行为。

当前故事《河畔礼堂重开之夜》有 4 个角色、5 个场景、35 条中英文对话。目标 ID 从真实 List 01 的全部 50 条记录生成，同形不同义仍按不同记录计数。

## 使用

- 播放模式为英语、中文或英中双语。双语按照同一句英语、中文，再进入下一句的顺序播放。
- 默认故事英语语速 0.8，中文语速 1.2，与词汇播放器的语速独立保存。
- 上一句、下一句、上一场景、下一场景更新角色、台词、图片与词汇提示。暂停时跳句保持暂停，点击继续才开始新句。
- 调整故事语速、朗读模式或角色声音会取消旧语音，保留当前句，点击播放按新设置重读该句。数字输入可先清空再输入，失焦/回车才提交；空白失焦恢复原值。
- 角色英语声音优先使用不同 en-US 系统 Voice，声音不足时共享；没有可用声音时尝试浏览器默认语音。角色性别是角色信息，不保证设备上存在相同性别音色。
- 角色 Voice 选择按故事和角色 ID 保存。中文复用主应用的中文 Voice，音调和音量也复用主应用设置。声音列表异步加载后会更新选项，同一播放会话保持角色分配。
- 单词和故事使用同一语音通道：开始任何一个就会停止另一个。收起故事、切换 List、离开页面会取消故事播放；后台隐藏时暂停。不能保证手机锁屏、后台或系统 TTS 暂停行为，需实机验证。
- 支持混合、图片优先和文字优先布局。手机采用上下布局，复用主应用字号和纸色背景。故事播放时隐藏底部词汇控制栏，使用故事自己的控制按钮。
- 高亮来自当前 List 的目标单词及常见词形，下面按当前句的 targetWordIds 显示具体词义。覆盖数表示故事使用的词汇记录数，不代表用户已经掌握的数量；应用没有将浏览位置当作掌握程度。

## 增加 list02 故事

1. 读取 `public/data/list02.json` 全部 items，复制其全部稳定 ID 到目标列表。不能只按拼写去重。
2. 以 `public/stories/list01.story.json` 为结构参考，创建 `public/stories/list02.story.json`，将 listId 改成 list02，id 改成 list02-story。
3. 用完整情节编写中英文场景对话，声明 characters，每句填写有效 speakerId 和对应含义的 targetWordIds。Scene ID、Line ID 在故事内必须唯一。所有行必须有非空中英文。
4. 把 `list02` 加入 `public/stories/manifest.json` 的 listIds。应用只为当前 List 加载对应故事，不会一次下载所有故事；manifest 未列出的 List 不请求 Story JSON。
5. 运行：

```powershell
python scripts/validate_story.py public/data/list02.json public/stories/list02.story.json
npm run typecheck
npm run lint
npm test
npm run test:browser
npm run build
```

JSON 的运行时验证在 `src/story/data.ts`；不合法故事会在自己的模块中报告错误，不阻断词汇列表。

## 添加故事图片

图片路径使用相对 public 的路径，如 `images/stories/list02/scene01.webp`。将实际 WebP 放在 `public/images/stories/list02/scene01.webp`，不写 public 前缀、仓库名或绝对 URL。使用统一 asset() 与 Vite BASE_URL，适配 GitHub Pages 子路径。

推荐 21:9，前端 contain 保留完整人物，也支持 16:9 与原图比例。当前句的 image 优先，其次场景 image；句图加载失败时尝试场景图，场景图也失败则显示占位，不中断朗读。会预加载下一句对应图片。

本次未生成图片。List 01 配置了 scene01.webp～scene05.webp 五个待添加路径，目前显示占位；可参考 `docs/story-image-prompts.md` 制图。Line 的 image 默认为 null，需要单句切换画面时改为对应 WebP 路径。

## 校验与人工审校

```powershell
npm run story:validate
python scripts/test_story.py
python scripts/validate_story.py --strict-images
```

工具输出总记录数、目标数、已使用/未使用 ID、覆盖率、无效 ID、重复 ID、未知角色、缺失中英文、缺失图片和词形匹配警告。覆盖不足、结构错误会返回非零退出码；未提供图片默认报告但不导致失败，`--strict-images` 会要求图片全部存在。

当前 List 01 为 50/50（100%）记录标注覆盖，全部标注词均在台词中找到匹配词形。工具支持常见变化（如 gaping、stampeded、paparazzi），但不能证明多义词语义、翻译、情节或图像内容正确。每次修改后仍需人工通读；新增不规则词形可扩充 Python FORMS 和 TypeScript targetPattern，并补充测试。

语音自动化测试用 Mock SpeechSynthesis 覆盖语音分配、语言/语速、暂停后的 onend、快速跳句旧回调、完成/错误和互斥。浏览器测试还验证模块位置、场景/图片切换、无 Story 列表、空白输入、手机横竖屏、平板和图片缺失。实际设备声音、锁屏与全屏效果仍需在 Windows、Android Chrome、iPhone/iPad 上手动验证。

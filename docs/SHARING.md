# 社区分享草稿 / Community sharing drafts

以下仅为待发布文案，尚未发送到任何社区或账号。发布前请确认 Release 中已经有可下载文件，并根据最终发布说明同步安装与数据更新状态。演示媒体均为构造数据，不是实战录像。

## 中文

标题：做了个 OMG 选技能辅助的中文 Beta：模型技能混排，直接给本手首选

玩技能征召时，比起满屏不同颜色的提示，我更想知道「这一手先拿什么」。所以基于 Tiarin Hino 的 Ability Draft Plus 做了一个中文分支，叫 Ability Draft Plus CN Beta。

主要改了这几件事：

- 技能和模型放在一个池子里排，直接给第一推荐和两个备选，前十角标更明显。
- 告诉它你的席位、模型、已有技能和几号位后会重新算；再次识别时移除被拿走的选项。
- 敌人拿到强组合的一半后，右侧继续提示已有和缺少的组件，方便判断是否值得截胡。
- 技能、模型名称使用 Dota 2 的简体中文名称，推荐理由也用中文解释。

数据基础来自 Windrun；识别和悬浮层来自原项目。这版排名是实验性的规则评分，不是 AI 算出的本局胜率，也没有经过「能提升多少胜率」的验证。截胡只在自身收益接近最优、证据比较充分时改变首选，不会单纯因为某个组合的胜率很高就硬抢。

仓库与演示：https://github.com/rubickguo/ability-draft-plus
Beta 发布页：https://github.com/rubickguo/ability-draft-plus/releases/tag/v3.2.1-beta.1
原项目：https://github.com/Tiarin-Hino/ability-draft-plus

页面里的动图使用构造数据和实际推荐组件，主要展示模型／技能信息变化后怎么重排，不是实战截图。安装文件、联网更新数据的可用性和已知限制，请先看 Release 说明。

欢迎反馈「这局拿到这些东西时，你应该推荐谁」的具体案例。最好附版本号、分辨率、自己的模型与技能，并遮住截图昵称；不需要上传个人数据库或完整日志。

## English

Title: Ability Draft Plus CN Beta — one mixed ranking for models and abilities, with contextual pick advice

I wanted an Ability Draft helper that answers “what should I pick now?” instead of showing several competing highlights. This community fork of Tiarin Hino's Ability Draft Plus focuses on that, with a Simplified Chinese interface and explanations.

It ranks hero models and abilities together, gives one top recommendation plus two alternatives, and recalculates when your model, owned skills, draft seat or preferred role changes. Rescanning removes drafted options. The combination panel keeps enemy half-combos visible and identifies the missing piece, so you can consider a useful denial without losing sight of your own build.

Statistics come from Windrun, and recognition and overlay foundations come from the upstream project. The recommendation score is an experimental heuristic, not a predicted match win rate. Denial can change the top pick only when your own alternatives are close and the enemy-threat evidence is sufficiently strong. No improvement in match results is claimed.

Repository and demo: https://github.com/rubickguo/ability-draft-plus
Beta release: https://github.com/rubickguo/ability-draft-plus/releases/tag/v3.2.1-beta.1
Original project: https://github.com/Tiarin-Hino/ability-draft-plus

The demo uses synthetic inputs with the real recommendation engine and UI; it is not gameplay footage. Check the release notes for available Windows packages, online data-update status and known limitations. New recommendation text currently prioritizes Chinese; this is not a fully translated English fork.

Concrete draft examples are welcome: your model and skills, what the app recommended, and what you think it should have recommended. Please redact player names and avoid uploading personal databases, credentials or full private logs.

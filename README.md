# 4D4Y 浏览器插件 (4d4y-browser)

DSH(DeepSeek Harness)常驻插件——4D4Y 论坛专属浏览器。在 GUI 内直接浏览 https://www.4d4y.com/ 的版块、帖子与楼层,支持登录、发帖、回复、多图上传与黑名单屏蔽。

> 4D4Y 是 Discuz! 7.2 老论坛(GBK 编码)。本插件不依赖 iframe,而是对接站点真实页面接口(`index.php` / `forumdisplay.php` / `viewthread.php`),由插件侧完成抓取、GBK 转码与结构化解析;图片由浏览器直接加载远程 CDN,不经中转,速度最快。

## 功能

- **浏览**:首页版块卡片(分类/简介/主题数/最后发表)、版块帖子列表(置顶/分类标签/回复/查看/最后回复)、帖子楼层(作者/用户组/在线状态/帖子数/积分/注册时间)
- **图片**:缩略图优先 + 原图兜底、原生懒加载、同一楼层连续图片横向并排、点击看原图
- **登录**:按官方流程(表单哈希 + MD5 密码)登录,cookie 保存本地,登录后显示生活版区等更多版块
- **发帖 / 回复**:支持 bbcode、主题分类必选(分类版块)、多张图片上传(走站点官方 swfupload 接口,正文内联展示)
- **黑名单屏蔽**:一键开关,拉取站点黑名单列表,自动隐藏黑名单用户楼层
- **界面**:全屏面板(保留 GUI 左侧边栏)、配色跟随 GUI 主题、16px 字号、版本号状态栏

## 安装

1. 将 `4d4y-browser` 目录复制到 `C:\Users\<you>\.dsh\profiles\node_modules\4d4y-browser`
2. 在 `C:\Users\<you>\.dsh\profiles\web\cordis.patch.yml` 的 `- insert:` 列表中加入:

```yaml
    - id: 4d4y-browser
      name: 4d4y-browser
```

3. 重启 dsh(静态插件在启动时加载),侧边栏底部出现「4D4Y」按钮,点击打开浏览器面板

## 使用

- 点击侧边栏「4D4Y」打开面板;工具栏:首页 / 后退 / 前进 / 刷新、登录/登出、黑名单开关、关闭
- 首次使用点「登录」输入 4D4Y 账号(密码仅按官方流程加密提交,不保存;cookie 保存在本地 `~/.dsh/4d4y-cookies.txt`)
- 版块页点「发新主题」(分类版块需先选主题分类),帖子页点「回复本主题」;均可「📷 添加图片(可多选)」

## 技术要点

- **抓取**:`curl`(带浏览器 UA)抓取 Discuz 页面,`TextDecoder('gbk')` 流式解码,正则解析为结构化 JSON
- **发帖编码**:站点为 GBK,中文标题/内容经 PowerShell 精确转 GBK 后以 multipart 提交,避免乱码
- **图片上传**:逐张调用站点 `misc.php?action=swfupload&operation=upload` 获取附件 ID,发帖时以 `attachnew[aid][description]` 标记并插入 `[attachimg]aid[/attachimg]` 正文标签
- **安全**:仅请求 4d4y.com 域名;密码不在命令行/日志出现;临时文件随用随删

## 版本

当前 **v0.5**(版本策略:从 0.1 起步小步递增,功能全部完成定格 1.0)

## License

[MIT](LICENSE)

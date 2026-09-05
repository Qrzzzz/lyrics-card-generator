# 自定义 Windows 安装界面

安装包仍由 electron-builder / NSIS 生成。正常打开 Setup 时，NSIS 在获取安装引擎互斥锁之前，从自身资源释放独立 WPF 窗口，并等待它退出。WPF 使用本机 .NET Framework 4.8，无需启动 Electron、Next.js、WebView2 或联网下载界面依赖。

窗口的标题栏、按钮、输入框、复选框由 `build/installer/Setup.xaml` 定义。默认窗口 460 × 440 DIP，仅显示图标、版本号和安装按钮；右上角切换语言，安装按钮旁的箭头在同一个窗口右侧展开更多选项，展开宽度 760 DIP。安装路径、安装范围、桌面快捷方式集中在侧栏。开始安装后侧栏收起，在原位置呈现状态和完成操作。

正常 Setup 使用跟随 Windows 应用主题的纯深色或纯浅色，高对比度采用系统颜色。DWM 背景材质明确设为 `DWMSBT_NONE`，客户区不再覆盖透明遮罩。此前选择了系统最亮版本 Desktop Acrylic，又叠加暗色遮罩；系统失焦实色回退也会改变观感。接口回读成功不能作为材质视觉验收通过的证据。本轮取消默认亚克力，以确定的深浅色保证效果，不宣称 Windows 无法实现良好亚克力。

仅开发预览允许 `--material acrylic`，用于后续单独调查；正常安装入口不启用。六种语言来自 `build/installer/locales.json`。
## 安装契约

- WPF 调用同一个原始 Setup EXE 的 `/S` 模式，不自行复制应用或改写安装注册表。
- 现有静默和更新调用直接走 NSIS。正常入口的 `/D`、`/allusers` 和 `/currentuser` 会预填到定制窗口。
- 当前用户和所有用户安装分别传递原生安装范围参数；只有所有用户安装引擎请求 UAC，界面留在原来的用户进程。
- 路径参数始终最后传递并保留 Unicode/空格。拒绝系统目录、磁盘根目录、UNC 和参数分隔字符。
- 桌面快捷方式通过 electron-builder 的 `--no-desktop-shortcut` 控制。
- 检测到正在运行的应用时要求先保存并退出。定制入口不会强制结束编辑器。
- 进度条表示安装进程仍在执行，不展示估算百分比。文件写入开始后禁止取消/关闭，不通过杀进程中断 NSIS。安装前可直接关闭，UAC 取消后可重试。
- 完成页要求同时满足：成功退出码、NSIS 在文件/注册表/快捷方式写入后发出的随机内核事件、目标 EXE 存在、注册表安装路径匹配。退出码 0 本身不足以表示成功。
- 完成事件只授权当前用户和管理员。提权进程不会向界面指定的普通文件写入完成标记。
- Windows 设置中的卸载仍使用 electron-builder 的原生卸载器；本次重做对象是 Setup 窗口。

## 本地构建和验证

```powershell
npm run installer-theme:test
npm run desktop:build
```

`desktop:prepare` 在 Windows 上编译并嵌入 WPF 外壳。编译产物仅位于 `dist-desktop/installer`，不进入已安装应用。Windows 构建使用系统 .NET Framework C# 编译器，不引入新的 npm/NuGet 依赖。

已有 unpacked 候选时，可仅重新生成安装包；这验证安装器变更，不等同于重新验证整个应用源码：

```powershell
node scripts/build-installer-shell.mjs
$packaged = (Resolve-Path release/win-unpacked).Path
node node_modules/electron-builder/cli.js --win nsis --x64 --publish never --projectDir dist-desktop/app --prepackaged $packaged '-c.directories.buildResources=../../build' '-c.directories.output=../../release/minimal-installer'
./scripts/test-custom-installer.ps1 -Installer ./release/minimal-installer/Lyrics.Card.Generator.Setup.6.2.12.exe
```

集成测试会拒绝覆盖已有安装或已有快捷方式，在临时 Unicode/空格路径执行真实新装、同版本覆盖和静默卸载。报告位于 `dist-desktop/installer/integration.txt`。所有用户/UAC、跨版本升级以及其他 Windows 版本仍需单独验收。

仅检查界面时：

```powershell
./dist-desktop/installer/LyricsSetup.exe --preview --version 6.2.12
./dist-desktop/installer/LyricsSetup.exe --preview --locale fr --state done
./dist-desktop/installer/LyricsSetup.exe --preview --theme light --expanded
```

`--preview` 禁止启动安装和应用。`--capture <绝对PNG路径>` 生成应用自己的 WPF 排版渲染和 DWM 属性回读 JSON；PNG 本身不包含桌面背景，不能替代真实合成材质的窗口验收。


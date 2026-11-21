# 第三方组件

- PDF 文本读取使用 Mozilla PDF.js 5.6.205。框架的 Apache License 2.0 全文位于 `vendor/pdf-engine.json` 的 `license` 字段，随附 CMap 和标准字体的版权与许可原文位于 `notices` 字段。工作台将同一份说明随引擎嵌入本地页面。
- 市场清单采用 IANA 时区数据库的国家和地区代码以及代表坐标。数据文件与来源位于 [src/regions.js](src/regions.js)。
- Windows 桌面版使用 Microsoft Edge WebView2。构建脚本通过 `WEBVIEW2_SDK_CORE` 和 `WEBVIEW2_SDK_LOADER` 接受相应的 .NET 程序集与 x64 加载器。使用者可从 Microsoft 获取 [WebView2 SDK](https://www.nuget.org/packages/Microsoft.Web.WebView2/) 和 [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。

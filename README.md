# hcf2023

> 来自 https://hcf2023.top/

设备检测 - 安卓还是苹果

由于原网站已无法访问，故开此 Github 仓库用于留档

__仅做技术交流使用，请谨慎使用！！！__


* 检测到非苹果设备时，会在后台启用 WebGL 渲染消耗性能造成卡顿

* 临时禁用 WebGL 渲染：
  * 使用 `index.html?disablecanvas` 访问即可


高级检查 API 返回结果示例（`/api/client-hints`）：

```json
{
    "success": true,
    "timestamp": "2025-10-02T03:30:53.323Z",
    "clientHints": {
        "userAgent": "\"Google Chrome\";v=\"130\", \"Chromium\";v=\"130\", \"Not.A/Brand\";v=\"99\"",
        "mobile": false,
        "platform": "Windows",
        "platformVersion": null,
        "arch": null,
        "model": null,
        "fullVersion": null,
        "fullVersionList": null
    },
    "detectedOS": "Windows",
    "isMobile": false,
    "hasHighEntropyData": false,
    "serverSupport": {
        "acceptCH": true,
        "permissionsPolicy": true,
        "criticalCH": true,
        "https": true
    }
}
```

## 在内网暴露与查看日志

本项目默认监听端口为 3000，且现在支持通过环境变量 `PORT` 与 `HOST` 覆盖（默认 `HOST=0.0.0.0`，便于在内网中访问）。服务会把每次请求以一行 JSON（JSONL）写到标准输出，便于日志收集与分析。

在 Windows PowerShell 中示例：

```powershell
$env:PORT = '3000'
$env:HOST = '0.0.0.0'    # 或者指定内网某个具体地址
node server.js
```

说明：
- 将 `HOST` 设为 `0.0.0.0` 可以让局域网内其它机器通过本机 IP 访问该服务。
- 日志格式为 JSON，例如：

```json
{"time":"2025-10-02T03:30:53.323Z","method":"GET","url":"/","status":200,"duration_ms":"2.345","remote_ip":"::1","user_agent":"..."}
```

安全提醒：在开放到内网或公网时，请注意不要在不受信的网络中暴露敏感接口；必要时配合防火墙或反向代理做访问控制。
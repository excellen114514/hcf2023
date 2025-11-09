// server.js
const os = require('os');
const http = require('http');
const fs = require('fs/promises');
const path = require('path');

// 定义服务器的端口与绑定地址（支持环境变量以便在不同环境中覆盖）
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
// 将 HOST 默认为 0.0.0.0 以便在内网中可访问；可通过环境变量覆盖（例如 HOST=127.0.0.1）
const HOST = process.env.HOST || '0.0.0.0';
// 静态文件目录
const PUBLIC_DIR = path.join(__dirname, 'public');
// API 路径
const API_PATH = '/api/client-hints';
const WEBGL_API_PATH = '/api/webgl-control';
const SERVER_SUPPORT = {
    "acceptCH": true,
    "permissionsPolicy": true,
    "criticalCH": true,
    "https": false 
};

function getLocalIPv4() {
  const networkInterfaces = os.networkInterfaces();
  
  for (const interfaceName in networkInterfaces) {
    const interfaces = networkInterfaces[interfaceName];
    
    for (const iface of interfaces) {
      // 筛选条件：IPv4协议、非内部地址（非回环地址）、非Docker等虚拟接口
      if (iface.family === 'IPv4' && !iface.internal) {
        // 优先选择以太网或无线网络接口
        if (interfaceName.includes('eth') || interfaceName.includes('en') || 
            interfaceName.includes('wlan') || interfaceName.includes('无线')) {
          return iface.address;
        }
      }
    }
  }
  
  // 如果没有找到优先接口，返回第一个符合条件的IPv4地址
  for (const interfaceName in networkInterfaces) {
    const interfaces = networkInterfaces[interfaceName];
    for (const iface of interfaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  
  return '127.0.0.1'; // 如果都没找到，返回本地回环地址
}

function getContentType(filePath) {
    const extname = path.extname(filePath);
    switch (extname) {
        case '.html':
            return 'text/html';
        case '.css':
            return 'text/css';
        case '.js':
            return 'application/javascript';
        case '.json':
            return 'application/json';
        case '.png':
            return 'image/png';
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        default:
            return 'application/octet-stream';
    }
}


/**
 * 辅助函数：去除 Client Hints 值首尾的引号。
 * Client Hints 头部值在 HTTP 标准中可能包含引号（例如 "Windows"），
 * Node.js 读到的是带引号的字符串。
 * @param {string | null} value 原始的 Client Hint 字符串值
 * @returns {string | null} 清理后的值
 */
function cleanClientHintValue(value) {
    if (typeof value === 'string') {
        // 使用正则表达式移除字符串开头和结尾可能存在的引号 (包括空格)
        return value.trim().replace(/^"|"$/g, '');
    }
    return value;
}


/**
 * 从 HTTP 请求头中提取 Client Hints 数据，并将其格式化为您需要的结构
 * **关键修改：使用 cleanClientHintValue 清理了有引号的字段。**
 * @param {http.IncomingMessage} req 请求对象
 * @returns {object} 格式化后的 clientHints 对象
 */
function extractClientHints(req) {
    const headers = req.headers;

    // 清理后的 Client Hints 对象
    const clientHints = {
        // --- 低熵提示 (Low-Entropy Hints) ---
        // userAgent 和 fullVersionList 不去除内部引号
        "userAgent": headers['sec-ch-ua'] || req.headers['user-agent'] || null, 
        "mobile": headers['sec-ch-ua-mobile'] === '?1', 
        "platform": cleanClientHintValue(headers['sec-ch-ua-platform']),

        // --- 高熵提示 (High-Entropy Hints) ---
        "platformVersion": cleanClientHintValue(headers['sec-ch-ua-platform-version']),
        "arch": cleanClientHintValue(headers['sec-ch-ua-arch']),
        "model": cleanClientHintValue(headers['sec-ch-ua-model']),
        "fullVersion": cleanClientHintValue(headers['sec-ch-ua-full-version']),
        "fullVersionList": headers['sec-ch-ua-full-version-list'] || null, // 不去除内部引号
    };
    
    // 基础 user-agent 解析 (使用清理后的值)
    const isMobile = clientHints.mobile; 
    const detectedOS = clientHints.platform || 'Unknown'; 

    // 检查是否有任何高熵数据被发送
    const hasHighEntropyData = !!(clientHints.platformVersion || clientHints.arch || clientHints.model || clientHints.fullVersion || clientHints.fullVersionList);

    return {
        clientHints,
        detectedOS,
        isMobile,
        hasHighEntropyData
    };
}


// ... (CH_HEADERS, PERMISSIONS_POLICY, CRITICAL_CH 常量与之前版本相同) ...

const CH_HEADERS = [
    'Sec-CH-UA', 'Sec-CH-UA-Mobile', 'Sec-CH-UA-Platform', 
    'Sec-CH-UA-Platform-Version', 'Sec-CH-UA-Arch', 'Sec-CH-UA-Model', 
    'Sec-CH-UA-Full-Version', 'Sec-CH-UA-Full-Version-List'
].join(', ');

const PERMISSIONS_POLICY = 'ch-ua=*, ch-ua-arch=*, ch-ua-full-version=*, ch-ua-full-version-list=*, ch-ua-mobile=*, ch-ua-model=*, ch-ua-platform=*, ch-ua-platform-version=*';

const CRITICAL_CH = 'Sec-CH-UA-Platform, Sec-CH-UA-Mobile';


/**
 * 处理 HTTP 请求的函数 (与之前版本逻辑相同)
 */
async function requestListener(req, res) {
    const url = req.url;

    // --- 请求日志：记录开始时间，并在响应完成后输出方法、URL、状态、耗时、来源 IP、User-Agent ---
    const start = process.hrtime.bigint();
    const remoteIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '-';
    const userAgent = req.headers['user-agent'] || '-';

    // 在响应完成时记录日志
    res.on('finish', () => {
        try {
            const end = process.hrtime.bigint();
            const durationMs = Number(end - start) / 1e6; // 纳秒转毫秒
            const log = {
                time: new Date().toISOString(),
                method: req.method,
                url: req.url,
                status: res.statusCode,
                duration_ms: durationMs.toFixed(3),
                remote_ip: remoteIp,
                user_agent: userAgent
            };
            // 简单输出为 JSON，方便日志收集（也可改为更可读的字符串）
            console.log(JSON.stringify(log));
        } catch (err) {
            console.error('Error logging request:', err);
        }
    });

     // --- 1.1 处理 WebGL 控制 API 请求 ---
    if (url === WEBGL_API_PATH && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const { action, enabled } = data;
                
                // 记录 WebGL 控制请求
                console.log('WebGL control request:', { action, enabled, remoteIp, userAgent });
                
                const responseData = {
                    "success": true,
                    "action": action,
                    "enabled": enabled,
                    "timestamp": new Date().toISOString(),
                    "message": `WebGL ${enabled ? 'enabled' : 'disabled'} successfully`
                };

                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                });
                
                res.end(JSON.stringify(responseData, null, 2));
            } catch (error) {
                console.error('Error processing WebGL control request:', error);
                res.writeHead(400, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({
                    "success": false,
                    "error": "Invalid JSON payload"
                }));
            }
        });
        return;
    }

    // --- 1.2 处理 WebGL 控制 OPTIONS 请求 (CORS) ---
    if (url === WEBGL_API_PATH && req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }

    // --- 1. 处理 API 请求 ---
    if (url === API_PATH) {
        const { clientHints, detectedOS, isMobile, hasHighEntropyData } = extractClientHints(req);

        const responseData = {
            "success": true,
            "timestamp": new Date().toISOString(), 
            clientHints,
            detectedOS,
            isMobile,
            hasHighEntropyData,
            "serverSupport": SERVER_SUPPORT
        };

        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Accept-CH': CH_HEADERS,
            'Permissions-Policy': PERMISSIONS_POLICY,
            'Critical-CH': CRITICAL_CH
        });
        
        res.end(JSON.stringify(responseData, null, 2));
        return;
    }

    // --- 2. 处理静态文件请求 ---
    
    let filePath = url === '/' ? '/index.html' : url;
    const fullPath = path.join(PUBLIC_DIR, filePath);

    if (!fullPath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden: Access outside public directory is not allowed.');
        return;
    }
    
    try {
        const data = await fs.readFile(fullPath);
        const contentType = getContentType(fullPath);
        
        res.writeHead(200, { 
            'Content-Type': contentType,
            'Accept-CH': CH_HEADERS,
            'Permissions-Policy': PERMISSIONS_POLICY
        });
        res.end(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end(`<h1>404 Not Found</h1><p>The requested URL ${url} was not found on this server.</p>`);
        } else {
            console.error(`Error reading file ${fullPath}:`, error);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('500 Internal Server Error');
        }
    }
}

// 创建 HTTP 服务器
const server = http.createServer(requestListener);

// 启动服务器
server.listen(PORT, HOST, () => {
    const localIP = getLocalIPv4();
    console.log(`Server running at:`);
    console.log(`  Local: http://localhost:${PORT}/`);
    console.log(`  Network: http://${localIP}:${PORT}/ (bound host=${HOST})`);
    console.log(`API endpoints:`);
    console.log(`  Client Hints: http://${localIP}:${PORT}${API_PATH}`);
    console.log(`  WebGL Control: http://${localIP}:${PORT}${WEBGL_API_PATH}`);
    console.log('Request logs will be written to stdout as JSON lines.');
});
# RoboMate Center 服务器部署指南

你是服务器端的 AI 助手，请严格按照以下步骤在服务器上完成部署。

---

## 项目信息

- **项目名称：** RoboMate Center（Arduino 机器人 AI 语音控制中心）
- **技术栈：** Node.js 20 + Express + SQLite + Tailwind CSS 3
- **进程管理：** PM2
- **反向代理：** Caddy（自动 HTTPS）
- **域名：** lenghuai.xyz
- **服务端口：** Node 监听 3000，Caddy 代理 443 → 3000
- **Web Serial API：** 必须 HTTPS，这是用 Caddy 的原因

---

## 第一步：安装基础环境

**本服务器为 Alibaba Cloud Linux（基于 RHEL/CentOS），使用 dnf 包管理器，不是 apt。**

```bash
# Node.js 20 LTS（NodeSource RPM 源）
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo -E bash -
sudo dnf install -y nodejs git

# 验证 Node.js
node -v    # 应显示 v20.x.x
npm -v     # 应显示 10.x.x

# PM2 全局安装
sudo npm install -g pm2
pm2 -v     # 验证

# Caddy（官方二进制安装，适用于非 COPR 系统如 Alibaba Cloud Linux）
curl -OL "https://github.com/caddyserver/caddy/releases/latest/download/caddy_linux_amd64.tar.gz"
sudo tar -xzf caddy_linux_amd64.tar.gz -C /usr/local/bin caddy
sudo chmod +x /usr/local/bin caddy
rm -f caddy_linux_amd64.tar.gz

# 创建 Caddy 用户（以非 root 运行）
sudo groupadd --system caddy
sudo useradd --system --gid caddy --create-home --home-dir /var/lib/caddy --shell /usr/sbin/nologin --comment "Caddy Web Server" caddy

# 手动创建 systemd 服务文件
sudo tee /etc/systemd/system/caddy.service << 'UNITEOF'
[Unit]
Description=Caddy Web Server
Documentation=https://caddyserver.com/docs/
After=network.target network-online.target
Requires=network-online.target

[Service]
Type=notify
User=caddy
Group=caddy
ExecStart=/usr/local/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile
TimeoutStopSec=5s
LimitNOFILE=1048576
LimitNPROC=512
PrivateTmp=true
ProtectSystem=full
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
UNITEOF

# 创建 Caddy 配置目录
sudo mkdir -p /etc/caddy

# 重载 systemd 并启动
sudo systemctl daemon-reload
sudo systemctl enable caddy

caddy version  # 验证
```

---

## 第二步：拉取代码并安装依赖

```bash
# 创建应用目录
sudo mkdir -p /opt/robomate-center
sudo chown $USER:$USER /opt/robomate-center

# 克隆项目
git clone https://github.com/120-xd/robomate-center.git /opt/robomate-center
cd /opt/robomate-center
git checkout LH1

# 安装依赖（--production=false 保留 devDependencies，因为需要 tailwindcss 编译 CSS）
npm ci --production=false

# 编译 Tailwind CSS
npm run build:css
```

---

## 第三步：创建 .env 环境变量文件

在 `/opt/robomate-center/.env` 创建文件，内容如下（替换 API key）：

```
PORT=3000
NODE_ENV=production
DB_PATH=./data/robomate.db
DEEPSEEK_API_KEY=sk-你的真实API密钥
```

用命令写入：

```bash
cat > /opt/robomate-center/.env << 'DOTENV'
PORT=3000
NODE_ENV=production
DB_PATH=./data/robomate.db
DEEPSEEK_API_KEY=请替换为真实密钥
DOTENV
```

---

## 第四步：配置 Caddy 反向代理

将以下内容写入 `/etc/caddy/Caddyfile`（覆盖原有内容）：

```caddy
lenghuai.xyz {
    reverse_proxy localhost:3000

    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
    }
}
```

用命令写入：

```bash
sudo tee /etc/caddy/Caddyfile << 'CADDYEOF'
lenghuai.xyz {
    reverse_proxy localhost:3000

    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
    }
}
CADDYEOF
```

重载 Caddy（会自动为 lenghuai.xyz 申请 Let's Encrypt 证书）：

```bash
sudo systemctl reload caddy
```

验证 Caddy 状态：

```bash
sudo systemctl status caddy
```

---

## 第五步：PM2 启动 + 设置开机自启

项目根目录已有 `ecosystem.config.js`，内容：

```js
module.exports = {
  apps: [
    {
      name: 'robomate-center',
      script: 'server/index.js',
      cwd: '/opt/robomate-center',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/opt/robomate-center/logs/pm2-error.log',
      out_file: '/opt/robomate-center/logs/pm2-out.log',
      merge_logs: true,
      max_memory_restart: '512M',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 10000,
      listen_timeout: 15000,
    },
  ],
};
```

执行：

```bash
cd /opt/robomate-center

# 启动应用
pm2 start ecosystem.config.js

# 保存 PM2 进程列表（重启后恢复）
pm2 save

# 设置 PM2 开机自启
pm2 startup systemd
# ↑ 执行它输出的那行 sudo 命令，类似：
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME
```

---

## 第六步：防火墙配置

**Alibaba Cloud Linux 使用 firewalld，不是 ufw。**

```bash
# 确保 firewalld 运行中
sudo systemctl start firewalld
sudo systemctl enable firewalld

# 开放端口
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --reload

# 验证
sudo firewall-cmd --list-services
sudo firewall-cmd --list-ports
```

**注意：不要暴露 3000 端口**，所有外部流量走 Caddy 443 进来。

**此外还要检查阿里云安全组**（阿里云控制台 → ECS → 安全组），确保入方向规则中 80 和 443 端口已放行，否则即使 firewalld 开了，公网也访问不到。

---

## 第七步：验证部署

```bash
# 1. PM2 进程状态
pm2 status
# robomate-center 应显示 status: online

# 2. 查看启动日志，确认没有报错
pm2 logs robomate-center --lines 30 --nostream

# 3. 本地健康检查
curl http://localhost:3000/api/health

# 4. 公网 HTTPS 访问
curl https://lenghuai.xyz/api/health
```

预期健康检查返回：

```json
{"status":"ok","uptime":xx,"timestamp":"..."}
```

---

## 日常更新命令

以后要更新代码，在服务器上执行：

```bash
cd /opt/robomate-center
git pull origin LH1
npm ci --production=false
npm run build:css
pm2 reload robomate-center --update-env
pm2 save
```

也可以用项目自带的部署脚本：

```bash
cd /opt/robomate-center
chmod +x deploy.sh
./deploy.sh <分支名>
```

---

## 故障排查

| 问题 | 检查项 |
|------|--------|
| Caddy 启动失败 | `sudo systemctl status caddy` 看日志；确认域名 DNS 已指向服务器 IP |
| 网站打不开 | `pm2 status` 确认 Node 进程 online；`curl http://localhost:3000/api/health` 测试本地 |
| 提示「不是私密连接」 | Caddy 证书申请需要域名 DNS 已生效 + 80 端口可从公网访问，等待 1-2 分钟后重试 |
| PM2 反复重启 | `pm2 logs robomate-center --lines 50` 看错误信息；确认 .env 文件存在且路径正确 |
| DeepSeek 不生效 | 检查 .env 中 DEEPSEEK_API_KEY 是否正确；不配置也能用本地降级解析 |

---

## 重要提醒

1. **DEEPSEEK_API_KEY 要填写真实的 API key**，位置在 `/opt/robomate-center/.env`
2. **域名 DNS 必须先指向服务器 IP**，否则 Caddy 无法申请 SSL 证书
3. 项目使用 Web Serial API 连接机器人，**用户浏览器也必须通过 HTTPS 访问**，所以 HTTPS 是刚需
4. SQLite 数据库在 `data/robomate.db`，不要删除

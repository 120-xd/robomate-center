# RoboMate Center 服务器部署指南

你是服务器端的 AI 助手，请严格按照以下步骤在服务器上完成部署。

---

## 项目信息

- **项目名称：** RoboMate Center（Arduino 机器人 AI 语音控制中心）
- **技术栈：** Node.js 20 + Express + SQLite + Tailwind CSS 3
- **进程管理：** PM2
- **反向代理：** Nginx + Let's Encrypt 证书（首选）或 Caddy（备选）
- **域名：** lenghuai.xyz
- **服务端口：** Node 监听 3000，Nginx 代理 443 → 3000
- **Web Serial API：** 必须 HTTPS，因此必须配置 SSL 证书

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

# Nginx（Alibaba Cloud Linux 自带源，无需外网）
sudo dnf install -y nginx

# 验证
nginx -v
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

## 第四步：配置 Nginx 反向代理

### 4.1 先申请 SSL 证书（Let's Encrypt）

```bash
# 安装 certbot
sudo dnf install -y certbot python3-certbot-nginx

# 申请证书
sudo certbot certonly --nginx -d lenghuai.xyz --non-interactive --agree-tos --email 你的邮箱
```

如果 certbot 也连不上外网，去阿里云控制台 → SSL 证书 → 免费证书申请，下载 nginx 格式的证书文件（.pem 和 .key），手动上传到 `/etc/nginx/certs/`。

### 4.2 写入 Nginx 配置

```bash
sudo tee /etc/nginx/conf.d/robomate.conf << 'NGXEOF'
server {
    listen 443 ssl http2;
    server_name lenghuai.xyz;

    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    # 安全头
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header Referrer-Policy strict-origin-when-cross-origin;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# HTTP → HTTPS 跳转
server {
    listen 80;
    server_name lenghuai.xyz;
    return 301 https://$host$request_uri;
}
NGXEOF
```

如果用的是 certbot 自动申请的证书，证书路径通常是：
- `ssl_certificate /etc/letsencrypt/live/lenghuai.xyz/fullchain.pem;`
- `ssl_certificate_key /etc/letsencrypt/live/lenghuai.xyz/privkey.pem;`

需要相应修改配置文件。

### 4.3 创建证书目录（如果用阿里云证书）

```bash
sudo mkdir -p /etc/nginx/certs
# 把证书文件上传到这里后继续
```

### 4.4 测试并启动 Nginx

```bash
# 测试配置语法
sudo nginx -t

# 如果语法 ok，启动
sudo systemctl enable --now nginx
sudo systemctl status nginx
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

**注意：不要暴露 3000 端口**，所有外部流量走 Nginx 443 进来。

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
| Nginx 启动失败 | `sudo nginx -t` 检查配置语法；`sudo systemctl status nginx` 看日志 |
| SSL 证书问题 | 证书路径是否正确；域名 DNS 是否指向服务器 IP |
| 网站打不开 | `pm2 status` 确认 Node 进程 online；`curl http://localhost:3000/api/health` 测试本地 |
| 提示「不是私密连接」 | 证书是否过期（`certbot renew`）；证书路径是否匹配域名 |
| PM2 反复重启 | `pm2 logs robomate-center --lines 50` 看错误信息；确认 .env 文件存在且路径正确 |
| DeepSeek 不生效 | 检查 .env 中 DEEPSEEK_API_KEY 是否正确；不配置也能用本地降级解析 |

---

## 重要提醒

1. **DEEPSEEK_API_KEY 要填写真实的 API key**，位置在 `/opt/robomate-center/.env`
2. **域名 DNS 必须先指向服务器 IP**，否则无法申请 SSL 证书
3. 项目使用 Web Serial API 连接机器人，**用户浏览器也必须通过 HTTPS 访问**，所以 HTTPS 是刚需
4. SQLite 数据库在 `data/robomate.db`，不要删除
5. **如果 certbot 也连不上外网**，去阿里云控制台申请免费 SSL 证书（一年有效），下载 nginx 格式的证书文件（.pem 和 .key），放到 `/etc/nginx/certs/`

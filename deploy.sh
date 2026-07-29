#!/usr/bin/env bash
# -------------------------------------------------------------------
# RoboMate Center - 一键部署脚本
# 用法: ./deploy.sh
# 需要先完成初次环境搭建（见 README 部署部分）
# -------------------------------------------------------------------
set -euo pipefail

APP_DIR="/opt/robomate-center"
BRANCH="${1:-main}"

echo "========================================"
echo "  RoboMate Center - Deploy"
echo "  Branch: $BRANCH"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

cd "$APP_DIR"

# 1. 拉取最新代码
echo "[1/5] Pulling latest code..."
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

# 2. 安装/更新依赖
echo "[2/5] Installing dependencies..."
npm ci --production=false

# 3. 编译 Tailwind CSS
echo "[3/5] Building Tailwind CSS..."
npm run build:css

# 4. 重启服务（0 秒停机）
echo "[4/5] Restarting PM2..."
pm2 reload ecosystem.config.js --update-env

# 5. 确认状态
echo "[5/5] Checking status..."
pm2 status robomate-center
pm2 save

echo ""
echo "Deploy complete!"
echo "========================================"

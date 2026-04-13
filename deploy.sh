#!/bin/bash
# ============================================================
# deploy.sh —— 在【服务器】上执行，完成所有安装和启动
# 用法: bash deploy.sh
# ============================================================
set -e

APP_DIR="/opt/novel-ai"

echo "==> [1/6] 安装系统依赖..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs nginx
npm install -g pm2

echo "==> [2/6] 创建应用目录..."
mkdir -p $APP_DIR

echo "==> [3/6] 拷贝文件（请确保已将项目上传到 /tmp/novel-ai）..."
cp -r /tmp/novel-ai/* $APP_DIR/

echo "==> [4/6] 安装后端依赖..."
cd $APP_DIR/server
npm install --production

echo "==> [5/6] 配置 Nginx..."
cp $APP_DIR/nginx.conf /etc/nginx/sites-available/novel-ai
ln -sf /etc/nginx/sites-available/novel-ai /etc/nginx/sites-enabled/novel-ai
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> [6/6] 启动应用..."
cd $APP_DIR
pm2 start ecosystem.config.js
pm2 save
pm2 startup | tail -1 | bash

echo ""
echo "✅ 部署完成！访问 http://$(curl -s ifconfig.me)"

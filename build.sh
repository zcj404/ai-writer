#!/bin/bash
# ============================================================
# build.sh —— 在【本地】执行，打包项目准备上传
# ============================================================
set -e

echo "==> 构建前端..."
cd client
npm install
npm run build
cd ..

echo "==> 打包项目..."
mkdir -p /tmp/novel-ai
cp -r server /tmp/novel-ai/
cp -r client/build /tmp/novel-ai/client/
cp ecosystem.config.js nginx.conf /tmp/novel-ai/

echo "✅ 打包完成，文件在 /tmp/novel-ai"
echo "上传命令: scp -r /tmp/novel-ai root@<服务器IP>:/tmp/"

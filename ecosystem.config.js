{
  "apps": [{
    "name": "novel-ai",
    "script": "src/index.js",
    "cwd": "/opt/novel-ai/server",
    "instances": 1,
    "autorestart": true,
    "watch": false,
    "env": {
      "NODE_ENV": "production",
      "PORT": "3001"
    }
  }]
}

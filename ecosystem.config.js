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
      // 日志配置
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/opt/robomate-center/logs/pm2-error.log',
      out_file: '/opt/robomate-center/logs/pm2-out.log',
      merge_logs: true,
      // 自动重启
      max_memory_restart: '512M',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      // 优雅退出
      kill_timeout: 10000,
      wait_ready: false,
      listen_timeout: 15000,
    },
  ],
};

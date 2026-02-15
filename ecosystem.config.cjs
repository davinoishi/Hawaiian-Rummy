module.exports = {
  apps: [{
    name: 'hawaiian-rummy',
    script: 'server/index.ts',
    interpreter: 'node',
    interpreter_args: '--import tsx',
    autorestart: true,
    watch: false,
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
  }],
};

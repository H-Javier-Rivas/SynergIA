module.exports = {
  apps: [
    {
      name: "synergia",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "src/index.ts",
      interpreter: "node",
      env: {
        NODE_ENV: "development",
      },
      autorestart: true,
      max_memory_restart: '1G',
      node_args: ["--no-deprecation"]
    },
    {
      name: "synergia-tutor",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "src/index.ts",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        INSTANCE_ID: "tutor"
      },
      autorestart: true,
      max_memory_restart: '1G',
      node_args: ["--no-deprecation"]
    },
    {
      name: "synergia-estadistica",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "src/index.ts",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        INSTANCE_ID: "estadistica"
      },
      autorestart: true,
      max_memory_restart: '1G',
      node_args: ["--no-deprecation"]
    }
  ],
};

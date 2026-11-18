const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: { baseURL: 'http://localhost:7654', headless: true },
  webServer: {
    command: 'python3 -m http.server 7654 --directory dashboard',
    port: 7654,
    reuseExistingServer: true,
  },
});

module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  testMatch: ["**/__tests__/**/*.test.ts", "**/?(*.)+(spec|test).ts"],
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  moduleFileExtensions: ["ts", "js", "json"],
  collectCoverageFrom: [
    "test/**/*.ts",
    "!test/**/*.d.ts",
    "!test/composable-cow/**",
    "!test/utils/**",
    "!test/setup/**",
  ],
  globalSetup: "<rootDir>/test/setup/jest-setup.ts",
  maxWorkers: 1, // Run tests sequentially to avoid race conditions
  verbose: true,
};

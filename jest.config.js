const base = { preset: 'ts-jest', testEnvironment: 'node', moduleFileExtensions: ['js', 'json', 'ts'] };
module.exports = {
  testTimeout: 30000,
  projects: [
    { ...base, displayName: 'unit', rootDir: 'src', testRegex: '.*\\.spec\\.ts$' },
    { ...base, displayName: 'e2e', rootDir: 'test', setupFiles: ['<rootDir>/setup-env.ts'], testRegex: '.*\\.e2e-spec\\.ts$' },
  ],
};

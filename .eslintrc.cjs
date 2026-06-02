module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  // Fixtures are real C3 exports (test data), not project code — C3 codegen (e.g. ts-defs/*.d.ts)
  // uses `var`/`Function`, which our rules forbid. Never lint fixture content.
  ignorePatterns: ["test/fixtures/"],
  env: {
    es6: true,
    node: true,
  },
  rules: {
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-explicit-any": "off",
  },
};

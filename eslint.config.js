const js = require("@eslint/js");

module.exports = [
    js.configs.recommended,
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: {
                process: "readonly",
                console: "readonly",
                module: "readonly",
                require: "readonly",
                __dirname: "readonly",
                setInterval: "readonly",
                setTimeout: "readonly",
                Buffer: "readonly"
            }
        },
        rules: {
            "no-unused-vars": "warn",
            "no-console": "off",
            "no-undef": "error"
        }
    }
];
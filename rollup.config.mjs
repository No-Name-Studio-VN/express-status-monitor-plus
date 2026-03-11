import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import postcss from 'rollup-plugin-postcss';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');

// ── HTML Minification Plugin ─────────────────────────────────
function htmlMinify() {
    return {
        name: 'html-minify',
        writeBundle() {
            const input = fs.readFileSync(
                path.join(__dirname, 'src/public/index.html'),
                'utf8',
            );

            const minified = input
                .replace(/<!--(?!\s*\{)[\s\S]*?-->/g, '')  // Strip HTML comments (preserve Handlebars)
                .replace(/>\s+</g, '><')                    // Collapse whitespace between tags
                .replace(/\s{2,}/g, ' ')                    // Collapse runs of whitespace
                .replace(/^\s+/gm, '')                      // Trim leading whitespace per line
                .replace(/\n{2,}/g, '\n')                   // Collapse blank lines
                .trim();

            fs.mkdirSync(DIST, { recursive: true });
            fs.writeFileSync(path.join(DIST, 'index.html'), minified);

            const pct = ((1 - Buffer.byteLength(minified) / Buffer.byteLength(input)) * 100).toFixed(1);
            console.log(`  HTML → dist/index.html  (${(Buffer.byteLength(minified) / 1024).toFixed(1)} KB, ${pct}% smaller)`);
        },
    };
}

// ── Rollup Configuration ─────────────────────────────────────
export default {
    input: 'src/public/javascripts/app.js',

    output: {
        file: 'dist/app.min.js',
        format: 'iife',
        sourcemap: false,
        name: 'ExpressStatusMonitor',
    },

    plugins: [
        // Resolve bare imports (chart.js, socket.io-client, etc.)
        resolve({ browser: true }),

        // Convert CommonJS modules to ES modules
        commonjs(),

        // Extract & minify CSS
        postcss({
            extract: path.resolve('dist/styles.min.css'),
            minimize: true,
            sourceMap: false,
        }),

        // Minify JS
        terser({
            format: { comments: false },
            compress: { drop_console: false, passes: 2 },
        }),

        // Minify HTML (runs after bundle is written)
        htmlMinify(),
    ],
};

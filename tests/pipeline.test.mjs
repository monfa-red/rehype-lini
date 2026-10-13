/**
 * The plugin in bare unified pipelines, held against the `lini` binary and
 * against the remark plugin.
 *
 * The claim this package makes is that a code block draws what the compiler
 * draws, so the test compiles the same source both ways and demands the same
 * figure. It compares trees rather than bytes: the figure reaches the page as
 * parsed elements, and serialising a tree writes `<defs></defs>` where the
 * compiler wrote `<defs/>`. Same element, same attributes, same DOM.
 *
 * The second claim is that it draws what `remark-lini-lang` draws: both are
 * adapters over one engine, so the same page through either must come out as
 * the same HTML, byte for byte.
 *
 * The binary is found at `LINI_BIN`, or the sibling checkout's release build.
 * Without one the binary comparisons skip, unless `LINI_BIN_REQUIRED=1` says a
 * missing binary is a failure rather than a quiet pass.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluate } from '@mdx-js/mdx';
import { fromHtml } from 'hast-util-from-html';
import { toHtml } from 'hast-util-to-html';
import { createElement } from 'react';
import * as runtime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import rehypeParse from 'rehype-parse';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import remarkLini from 'remark-lini-lang';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

import rehypeLini from '../dist/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');
const BIN = process.env.LINI_BIN ?? join(HERE, '../../lini/target/release/lini');
const REQUIRED = process.env.LINI_BIN_REQUIRED === '1';

/** Run Markdown through the plugin, as a site's own pipeline would. */
function run(markdown, path, before = []) {
	return unified()
		.use(remarkParse)
		.use(remarkRehype)
		.use(before)
		.use(rehypeLini)
		.use(rehypeStringify)
		.processSync({ value: markdown, path });
}

/** The page the plugin renders. */
function render(markdown, path) {
	return run(markdown, path).toString();
}

/** The same page through the remark plugin. */
function renderRemark(markdown, path) {
	return unified()
		.use(remarkParse)
		.use(remarkLini)
		.use(remarkRehype)
		.use(rehypeStringify)
		.processSync({ value: markdown, path })
		.toString();
}

/** An HTML page through the plugin, no Markdown anywhere. */
function runHtml(html, path) {
	return unified()
		.use(rehypeParse, { fragment: true })
		.use(rehypeLini)
		.use(rehypeStringify)
		.processSync({ value: html, path });
}

/**
 * The compiled figure in a rendered page. The toggle carries an inline icon, so
 * "the first `<svg>`" is the chevron; only the compiler's output has an `xmlns`.
 */
function svgOf(html) {
	const at = html.indexOf('<svg xmlns=');
	const end = html.lastIndexOf('</svg>');
	assert.ok(at !== -1 && end !== -1, 'the page has no figure');
	return html.slice(at, end + '</svg>'.length);
}

/** One spelling for both sides: parsed, then serialised the same way. */
function normalise(svg) {
	return toHtml(fromHtml(svg, { fragment: true }));
}

/** What the binary draws for `source`, compiled in `dir` so a local `src:` resolves there. */
function binary(source, dir) {
	const file = join(dir ?? mkdtempSync(join(tmpdir(), 'rehype-lini-')), 'fence.lini');
	writeFileSync(file, source);
	return execFileSync(BIN, [file], { encoding: 'utf8' });
}

/**
 * How often `needle` occurs in the page's markup. The `<style>` blocks are taken
 * out first: the stylesheet names every class the counts look for.
 */
function count(html, needle) {
	return html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '').split(needle).length - 1;
}

const available = existsSync(BIN);
if (!available && REQUIRED) throw new Error(`LINI_BIN_REQUIRED=1 but no binary at ${BIN}`);
const compare = { skip: available ? false : `no lini binary at ${BIN}` };

// A fence on line 1 means the source starts on line 2, so the engine pads it
// with one blank line to keep diagnostics pointing at the .md. The binary is
// handed that same padded source.
const FENCE = 'a -> b\n';
const PAGE = '```lini\n' + FENCE + '```\n';
const PADDED = '\n' + FENCE;

test('a fence draws what the binary draws', compare, () => {
	assert.equal(normalise(svgOf(render(PAGE, 'page.md'))), normalise(binary(PADDED).trimEnd()));
});

test('a local image reaches the compiler as bytes', compare, () => {
	const fence = '|image| { src: "logo.svg"; width: 40; height: 40 }\n';
	const svg = svgOf(render('```lini\n' + fence + '```\n', join(FIXTURES, 'page.md')));
	assert.match(svg, /data:image\/svg\+xml|<svg/, 'the image did not embed');
	assert.equal(normalise(svg), normalise(binary('\n' + fence, FIXTURES).trimEnd()));
});

// Every arrangement the info string offers, both spellings of the separator,
// an error, a warning and a listing inside a list item.
const SHOWROOM = [
	'# Showroom',
	'',
	'```lini',
	'cat -> dog -> bird',
	'```',
	'',
	'```lini figure-only',
	'|oval| "figure-only"',
	'```',
	'',
	'```lini,code-only',
	'|oval| "never compiled"',
	'```',
	'',
	'- a list item',
	'',
	'  ```lini figure-code',
	'  |oval| "figure first"',
	'  ```',
	'',
	'```lini code-figure bogusword',
	'|oval| "code first"',
	'```',
	'',
	'```lini',
	'|box| { bogus: 1 }',
	'```',
	'',
	'```js',
	'const x = 1;',
	'```',
	'',
].join('\n');

// Byte for byte, but for one newline: `remark-rehype` writes one between the
// stylesheet and the first figure, which reach it as two blocks.
test('a page draws exactly what the remark plugin draws', () => {
	const remark = renderRemark(SHOWROOM, 'page.md').replace('</style>\n<div', '</style><div');
	assert.equal(render(SHOWROOM, 'page.md'), remark);
});

test('the fence words arrange the block, with either separator', () => {
	const html = render(SHOWROOM, 'page.md');
	assert.equal(count(html, '<div class="lini-figure"'), 4);
	assert.equal(count(html, '<div class="lini-source">'), 4);
	assert.equal(count(html, 'class="lini-view-toggle"'), 1);
	assert.equal(count(html, 'lini-open'), 2);
	assert.equal(count(html, 'lini-error'), 1);
	assert.match(html, /<pre><code class="language-js">const x = 1;\n<\/code><\/pre>/, 'a foreign block was touched');
});

// Every compiled figure carries a `<style>` of its own, so the bundled sheet is
// counted by the one line only it declares.
const SHEET = /@layer lini\.defaults,\s*remark-lini;/g;

test('a page without a fence gets no stylesheet', () => {
	assert.equal(render('# Just prose\n', 'page.md').match(SHEET), null);
});

test('a page with two fences carries the stylesheet once', () => {
	assert.equal(render(PAGE + '\n' + PAGE, 'page.md').match(SHEET)?.length, 1);
});

test('bundledCss: false leaves the stylesheet out', () => {
	const html = unified()
		.use(remarkParse)
		.use(remarkRehype)
		.use(rehypeLini, { bundledCss: false })
		.use(rehypeStringify)
		.processSync(PAGE)
		.toString();
	assert.equal(html.match(SHEET), null);
	assert.match(html, /lini-figure/);
});

// The compiler's diagnostics land on the file, placed at the compiler's own
// line and column, the location kept out of the reason so a host that prints
// it does not print it twice.
test('a diagnostic is a message on the file, placed where the compiler put it', () => {
	const page = '# Title\n\n```lini\n|box| { bogus: 1 }\n```\n';
	const [message, ...rest] = run(page, 'page.md').messages;
	assert.equal(rest.length, 0);
	assert.equal(message.reason, "unknown property 'bogus'");
	assert.equal(message.ruleId, 'unknown-property');
	assert.equal(message.source, 'lini');
	assert.deepEqual([message.line, message.column], [4, 9]);
});

test('an unknown fence word is a message at the fence', () => {
	const [message] = run('# Title\n\n```lini bogusword\na -> b\n```\n', 'page.md').messages;
	assert.match(message.reason, /unknown word `bogusword`/);
	assert.deepEqual([message.line, message.column], [3, 1]);
});

// `rehype-raw` re-parses the tree and drops `data.meta` on the way, so the
// plugin goes before it; positions survive either way.
test('before rehype-raw, the fence words and the lines hold', () => {
	const page = '# Title\n\n<div>raw</div>\n\n```lini figure-only\n|box| { bogus: 1 }\n```\n';
	const file = unified()
		.use(remarkParse)
		.use(remarkRehype, { allowDangerousHtml: true })
		.use(rehypeLini)
		.use(rehypeRaw)
		.use(rehypeStringify)
		.processSync({ value: page, path: 'page.md' });
	assert.deepEqual([file.messages[0].line, file.messages[0].column], [6, 9]);
	assert.match(String(file), /<div>raw<\/div>/);
});

test('an HTML code block draws, its lines counted from the HTML', () => {
	const html = '<p>Intro</p>\n<pre><code class="language-lini">a -> b\n|box| { bogus: 1 }\n</code></pre>\n';
	const file = runHtml(html, 'page.html');
	assert.deepEqual([file.messages[0].line, file.messages[0].column], [3, 9]);
	assert.match(String(file), /lini-error/);
	const good = String(runHtml('<pre><code class="language-lini">a -> b</code></pre>', 'page.html'));
	assert.match(good, /<svg xmlns=/);
});

// Docusaurus and Astro's MDX move the info string to a `metastring` property.
test('a metastring property carries the fence words', () => {
	const html = '<pre><code class="language-lini" metastring="code-only">a -> b</code></pre>';
	const out = String(runHtml(html, 'page.html'));
	assert.match(out, /lini-source/);
	assert.doesNotMatch(out, /<svg xmlns=/);
});

test('inline code and other blocks are left alone', () => {
	const html =
		'<p><code class="language-lini">a -> b</code></p>' +
		'<pre><code class="language-lini">a -> b</code><code>x</code></pre>';
	assert.equal(String(runHtml(html, 'page.html')), html);
});

// MDX has no raw HTML and resolves every element through the host's component
// map, so this is where a plugin that emits markup breaks.
test('an MDX page compiles and renders the figures', async () => {
	const mdx = [
		'export const who = "world"',
		'',
		'# Hello {who} — prose',
		'',
		'```lini figure-code',
		'a -> b',
		'```',
		'',
		'<div>jsx</div>',
		'',
		'```lini',
		'a -> b -> c',
		'```',
		'',
	].join('\n');
	const mod = await evaluate(
		{ value: mdx, path: join(FIXTURES, 'page.mdx') },
		{ ...runtime, rehypePlugins: [rehypeLini] },
	);
	const html = renderToStaticMarkup(createElement(mod.default));
	assert.equal(count(html, '<svg xmlns='), 2);
	assert.equal(html.split('<style>@layer lini.defaults').length - 1, 1);
	assert.equal(count(html, 'lini-figure-block'), 2);
	assert.match(html, /--lini-w: ?[0-9]/, 'the figure lost its natural width');
	for (const c of ['–', '—', '‘', '’', '“', '”']) {
		assert.ok(!svgOf(html).includes(c), `a figure carries smart punctuation (${c})`);
	}
});

// A toggle's id is built from the file and the line, and two HTML blocks can
// share a line; a tree without positions puts every block on the same one.
test('two blocks on one line get toggles of their own', () => {
	const block = '<pre><code class="language-lini">a -> b</code></pre>';
	const html = String(runHtml(block + block, 'page.html'));
	const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
	assert.equal(ids.length, 2);
	assert.notEqual(ids[0], ids[1]);
	const fors = [...html.matchAll(/ for="([^"]+)"/g)].map((m) => m[1]);
	assert.deepEqual(fors, ids);
});

test('an unknown word in an HTML block is reported at its tag', () => {
	const html = '<p>Intro</p>\n<pre><code class="language-lini" metastring="bogusword">a -> b</code></pre>\n';
	const file = runHtml(html, 'page.html');
	assert.deepEqual([file.messages[0].line, file.messages[0].column], [2, 1]);
});

test('an error is fatal on the file, a warning is not', () => {
	const [warning, error] = run('```lini bogusword\n|box| { bogus: 1 }\n```\n', 'page.md').messages;
	assert.equal(warning.fatal, false);
	assert.equal(error.fatal, true);
});

test('the figure is placed at the block, and nothing inside it is placed', () => {
	let figure;
	unified()
		.use(remarkParse)
		.use(remarkRehype)
		.use(rehypeLini, { bundledCss: false })
		.use(() => (tree) => {
			figure = tree.children.find((node) => node.properties?.className?.includes('lini-figure-block'));
		})
		.use(rehypeStringify)
		.processSync({ value: '# Title\n\n```lini\na -> b\n```\n', path: 'page.md' });
	assert.deepEqual(figure.position.start, { line: 3, column: 1, offset: 9 });
	assert.equal(figure.children[0].position, undefined);
});

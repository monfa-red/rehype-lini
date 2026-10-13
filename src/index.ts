/**
 * rehype-lini — ```` ```lini ```` code blocks to inline SVG, at build time.
 *
 * [Lini](https://lini.rs) is one small language for diagrams: flowcharts,
 * charts, sequences, mindmaps, trees, schematics and technical drawings all come
 * out of the same fence. The compiler is linked as a WebAssembly module, not
 * shelled out to, so installing this package is the whole toolchain.
 *
 * ```js
 * import rehypeLini from 'rehype-lini';
 * unified().use(remarkParse).use(remarkRehype).use(rehypeLini).use(rehypeStringify);
 * ```
 *
 * The figures themselves are drawn by `remark-lini-lang/core`, the engine the
 * remark plugin and the Astro integration share, so a fence draws the same
 * figure under all three.
 */

import type { Element, Root, RootContent } from 'hast';
import { toString } from 'hast-util-to-string';
import { fenceWords, renderer } from 'remark-lini-lang/core';
import type { LiniOptions } from 'remark-lini-lang/core';
import { SKIP, visit } from 'unist-util-visit';
import type { VFile } from 'vfile';

export { liniCss } from 'remark-lini-lang/core';

/** How a site tunes what the code blocks turn into. */
export type Options = LiniOptions;

/** The class a code block's language arrives as: ```` ```lini ```` is `language-lini`. */
const LANGUAGE = 'language-';

/**
 * A rehype plugin that compiles every ```` ```lini ```` code block — a `<pre>`
 * holding a `<code class="language-lini">` — to inline SVG.
 *
 * It has to run before a syntax highlighter, which would otherwise claim the
 * block first and leave nothing here to find.
 */
export default function rehypeLini(options?: Readonly<Options> | null) {
	return function (tree: Root, file: VFile): undefined {
		const render = renderer(file, options ?? {});

		visit(tree, 'element', function (node, index, parent) {
			if (node.tagName !== 'pre' || !parent || index === undefined) return undefined;
			const code = codeOf(node);
			if (!code) return undefined;
			const words = fenceWords(language(code), meta(code));
			if (!words) return undefined;

			const replacement = render({
				// Markdown's converter ends the text with the fence's last newline.
				source: toString(code).replace(/\n$/, ''),
				words,
				position: node.position,
				// From Markdown the text has no position of its own, and the source
				// starts under the fence. From HTML it does, and it starts there.
				sourceLine: code.children[0]?.position?.start.line,
			});
			// The stylesheet rides in front of the first figure as a second element,
			// so one block can become two; skipping past them keeps the walk out of
			// what was just put in.
			(parent.children as RootContent[]).splice(index, 1, ...replacement);
			return [SKIP, index + replacement.length];
		});
	};
}

/** The `<code>` a `<pre>` holds when it is a code block and nothing else. */
function codeOf(pre: Element): Element | undefined {
	const [code, ...rest] = pre.children.filter(
		(child) => !(child.type === 'text' && child.value.trim() === ''),
	);
	if (rest.length > 0 || code?.type !== 'element' || code.tagName !== 'code') return undefined;
	return code;
}

/**
 * The language class without its prefix. The class is the info string's first
 * word whole, so ```` ```lini,figure ```` arrives as `lini,figure` and
 * `fenceWords` splits it.
 */
function language(code: Element): string | undefined {
	const classes = code.properties.className;
	if (!Array.isArray(classes)) return undefined;
	const found = classes.find((c) => typeof c === 'string' && c.startsWith(LANGUAGE));
	return typeof found === 'string' ? found.slice(LANGUAGE.length) : undefined;
}

/**
 * The rest of the info string. Markdown's converter (`mdast-util-to-hast`) keeps
 * it on `data.meta`; Docusaurus and Astro's MDX copy it to a `metastring`
 * property, and `rehype-raw` drops the former, so either may be the one left.
 */
function meta(code: Element): string | undefined {
	const fromData = (code.data as { meta?: unknown } | undefined)?.meta;
	if (typeof fromData === 'string') return fromData;
	const fromProperty = code.properties['metastring'];
	return typeof fromProperty === 'string' ? fromProperty : undefined;
}

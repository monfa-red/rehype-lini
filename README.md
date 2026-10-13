# rehype-lini

**` ```lini ` code blocks in Markdown, MDX and HTML, compiled to inline SVG at build time.**

[Lini](https://lini.rs) is one small language for diagrams: flowcharts, charts,
sequences, mindmaps, trees, ER schemas, circuit schematics and dimensioned
technical drawings all come out of the same fence. This
[rehype](https://github.com/rehypejs/rehype) plugin draws them.

```
npm install rehype-lini
```

The compiler comes with it as a WebAssembly module, so installing this package
is the whole toolchain. No binary on `PATH`, no Docker, no network at build
time.

## Use it

````js
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeLini from 'rehype-lini';
import rehypeStringify from 'rehype-stringify';

const file = await unified()
  .use(remarkParse)
  .use(remarkRehype)
  .use(rehypeLini)
  .use(rehypeStringify)
  .process('```lini\ncat -> dog -> bird\n```');
````

Every `<pre><code class="language-lini">` is swapped for parsed elements, so you
don't need `allowDangerousHtml`, and it works under MDX, which has no raw HTML
at all.

**Put it before your syntax highlighter.** `@shikijs/rehype`,
`rehype-pretty-code` and the like rewrite code blocks, and a block they get to
first is no longer one this plugin can find. Put it before `rehype-raw` too,
which drops the words after `lini` on the fence.

### Docusaurus

```js
// docusaurus.config.js
import rehypeLini from 'rehype-lini';

export default {
  presets: [['classic', { docs: { rehypePlugins: [rehypeLini] } }]],
};
```

That covers the docs. The blog and standalone pages each take their own
`rehypePlugins`, so add it to `blog` and `pages` too if they have figures.
Docusaurus highlights code later, in its own `CodeBlock` component, so there's
nothing to reorder.

### Next.js (MDX)

```js
// next.config.mjs
import createMDX from '@next/mdx';

const withMDX = createMDX({ options: { rehypePlugins: ['rehype-lini'] } });

export default withMDX({ pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'] });
```

Pass the plugin by name. Turbopack, which `next build` uses by default since
Next 16, refuses functions in these options.

### Astro

Use [`astro-lini`](https://github.com/monfa-red/astro-lini). It draws the same
figures from the Markdown tree, before Astro's highlighter runs, and it also
works with Sätteri, Astro's default Markdown processor, which doesn't run rehype
plugins.

## What a block becomes

A figure, and a toggle that shows the source that drew it, unless the fence asks
for something else:

| Fence | You get |
|---|---|
| ` ```lini ` | the figure, with the source one click away |
| ` ```lini figure-only ` | the figure alone |
| ` ```lini code-only ` | the source alone, highlighted, never compiled |
| ` ```lini figure-code ` | both, stacked, no toggle |
| ` ```lini code-figure ` | both, source first, no toggle |

A comma works as the separator too: ` ```lini,figure-only `.

## Images

An `|image| { src: "…" }` naming a local file resolves against the directory of
the file being processed, and the bytes are handed to the compiler. You get the
same embedding and the same output as the `lini` binary. `https://` URLs and
`data:` URIs pass through untouched.

## Styling

The stylesheet rides along in a `<style>` in front of the first figure on each
page that has one, which is what makes the install one line. It sits in
`@layer remark-lini` (named for the package the engine lives in), so any
unlayered rule in your own CSS wins without `!important`.

To own the styling yourself, pass `{ bundledCss: false }` and ship the sheet
`liniCss()` returns. It's the whole thing: the figure wrapper, the toggle, and
the palette for the highlighted source.

Every Lini colour is a `light-dark()` pair keyed on `color-scheme`, so binding
that property to your theme is the whole light/dark integration. No script, no
re-render on toggle.

## Errors

A block that fails to compile becomes a visible error box and the build still
finishes, so one bad diagram never costs you the rest of the site.

Every diagnostic is a message on the file, at its real line and column in your
document, with the compiler's name for it as the `ruleId` (`unknown-property`,
say). Next and Docusaurus never print a file's messages, so each one goes to
stderr as well:

```
lini: docs/intro.mdx:14:9: error: unknown property 'bogus'
```

## Options

| Option | Default | What it does |
|---|---|---|
| `bundledCss` | `true` | Ship the styling with the figures. `false` to provide it yourself. |

## The language

Six lines: a type define, a container, and two links Lini routes for you.

````
```lini
{ |svc::box| { fill: --teal-wash; stroke: --teal-ink } }

|group| "Services" [ |svc#api| "API"; |svc#auth| "Auth" ]
|svc#db| "Postgres"

api  -> db "read"
auth -> db "write"
```
````

The rest of the grammar is in the [tour](https://lini.rs/docs/tour/language.html).

## Security

This is for content you trust, like your own docs. An image's `src` can name
any file the build can read, and its bytes end up in the page. The figures come
out as inline SVG plus a `<style>`. Lini doesn't emit scripts and refuses
`javascript:` links, but `rehype-sanitize` strips both SVG and `<style>`, so if
you sanitize, do it before this plugin runs.

## Related

- [`remark-lini-lang`](https://github.com/monfa-red/remark-lini): the same
  figures as a remark plugin, and the engine this one runs on.
- [`astro-lini`](https://github.com/monfa-red/astro-lini): the Astro integration.
- [`mdbook-lini`](https://github.com/monfa-red/mdbook-lini): the same fences in
  an mdBook.

## Licence

MIT.

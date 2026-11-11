# skia-canvas-with-twemoji

### A drop-in skia-canvas that draws emoji as Twemoji

```js
ctx.fillText("Hello 👋", 50, 50)
```

## Install
```console
$ npm i skia-canvas-with-twemoji
```

## Usage
Import from `skia-canvas-with-twemoji` instead of `skia-canvas`. Everything skia-canvas exports is re-exported, with a `Canvas` whose contexts draw emoji as Twemoji in `fillText`, `strokeText` and `measureText`.

```js
import { Canvas } from "skia-canvas-with-twemoji"

const canvas = new Canvas(512, 512)
const ctx = canvas.getContext("2d")

ctx.font = "40px Arial"
ctx.textAlign = "center"
ctx.fillText("Pizza 🍕 time", 256, 100)
```

Drawing is synchronous and follows the context's `font`, `textAlign`, `textBaseline`, `direction`, fill, stroke, shadow and transform, the same as the native methods. Text without emoji, and any text while `textWrap` is on, goes straight to the native methods.

`measureText` measures emoji as they are drawn. Its font bounding box grows to fit the emoji when they are larger than the font.

## Functions

### `patch(ctx)`
Gives a context that was not created by this package's `Canvas` (eg one from `skia-canvas` directly) the same emoji-aware `fillText`, `strokeText` and `measureText`. Returns the context.

```js
import { Canvas } from "skia-canvas"
import { patch } from "skia-canvas-with-twemoji"

const ctx = patch(new Canvas(512, 512).getContext("2d"))
ctx.fillText("Hello 👋", 50, 50)
```

### `fillText(ctx, text, x, y, maxWidth)`
### `strokeText(ctx, text, x, y, maxWidth)`
### `measureText(ctx, text)`
The same as the context methods, for a context that has not been patched.

```js
import { Canvas } from "skia-canvas"
import { fillText, strokeText, measureText } from "skia-canvas-with-twemoji"

const ctx = new Canvas(512, 512).getContext("2d")
ctx.font = "40px Arial"

const { width } = measureText(ctx, "Nice 👍🏽 one")
strokeText(ctx, "Nice 👍🏽 one", 50, 100)
fillText(ctx, "Nice 👍🏽 one", 50, 100, 150)
```

### `splitText(text)`
Splits text into text and emoji segments.

```js
import { splitText } from "skia-canvas-with-twemoji"

splitText("Nice 👍🏽 one")
// [
//   { type: "text", text: "Nice " },
//   { type: "emoji", text: "👍🏽", codepoint: "1f44d-1f3fd" },
//   { type: "text", text: " one" }
// ]
```

### `twemojiVersion`
The Twemoji release in use, or `null` when none could be downloaded. It changes when a background update finishes.

```js
import { twemojiVersion } from "skia-canvas-with-twemoji"

console.log(twemojiVersion) // "v17.0.3"
```

## Context properties
- emojiScale
  - `ctx.emojiScale = 1.25`
  - Emoji size relative to the font size
  - Default `1`
- emojiSpacing
  - `ctx.emojiSpacing = 0.1`
  - Space on each side of an emoji, relative to the font size
  - Default `0.05`

```js
import { Canvas } from "skia-canvas-with-twemoji"

const ctx = new Canvas(512, 512).getContext("2d")
ctx.font = "40px Arial"
ctx.emojiScale = 1.5
ctx.emojiSpacing = 0.1
ctx.fillText("Big 🔥 emoji", 50, 100)
```

## Twemoji
Emoji come from the latest [jdecked/twemoji](https://github.com/jdecked/twemoji) release, cached in a `.cache` folder inside the package.

- The first import downloads the latest release before it resolves. If that fails, a warning is logged and emoji are drawn with the system emoji font, as plain skia-canvas would draw them
- Later imports use the cache straight away, check GitHub for a newer release in the background, and switch to it once downloaded. If that fails, a warning is logged and the cached release stays in use
- Only the release in use is kept: older releases and unfinished downloads are deleted at startup and after each update
- An emoji missing from the release is drawn with the system emoji font

Emoji are matched with [emoji-regex](https://github.com/mathiasbynens/emoji-regex). `©`, `®` and `™` are only treated as emoji when followed by the U+FE0F variation selector.
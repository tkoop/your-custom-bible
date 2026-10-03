# CHAPTER FILE FORMAT

Rules for writing `public/translations/<translation>/<book-slug>-<chapter>.html`.

This is the contract between the two halves of the chapter build: stage 1
(`compile.mjs` for the BSB, one file per translation) writes the chapter with
its you spans, divine names, verse ids, footnotes and Words of Christ already
marked up, and stage 2 (`decorate.mjs`, shared by every translation) adds the
spelling and case variants. So a translation that already has the you and lord
attributes in its HTML needs a stage 1 that does the rest, and no changes to
stage 2 at all.

## File

- Write one HTML fragment per chapter.
- Do not include `<!DOCTYPE>`, `<html>`, `<head>`, `<body>`, `<meta>`,
  `<title>`, `<script>`, `<style>`, or any `on*` attribute.
- Wrap the whole file in `<div class="calibre2">` … `</div>`.
- Write no trailing newline.

## Verse numbers

- Emit every verse number as exactly this, with N replaced by the verse number:

  ```html
  <span class="reftext" id="v23">23</span>
  ```

- Make the number in the `id` and the number in the text identical.
- Make the marker a direct child of a `<p>`.
- Make the marker a leaf element with no children.
- Put no whitespace between the marker and the first word of the verse.
- Order the markers ascending, in document order.
- Do not duplicate an `id`.
- Do not add any `data-*` verse attribute.
- Do not emit `<span class="reftext">` with no `id`.

## Verse text

- Put every word of scripture inside a `<p>`.
- Put non-scripture inserts (inscriptions, section labels) in a `<div>`, not a
  `<p>`.
- Allow only these `<div>` classes: `calibre2`, `fn`, `calibre8`, `inscrip1`.

## Headings

- Emit major headings as `<p class="hdg">`.
- Emit subheadings as `<p class="subhdg">`.
- Put the cross-reference list inside the heading, after a `<br>`, wrapped in a
  span:

  ```html
  <p class="hdg">The Two Paths<br class="calibre2"><span class="cross1">(Matthew 5:3–12; Luke 6:20–23)</span></p>
  ```

- Keep `.cross1` inside a `<p>` whose class list contains `hdg`.
- Use `<br>` to break a heading across lines.

## Case variants

- Emit all three variants whenever a word's printed form depends on the case
  setting.
- Emit them in immediate sequence with no whitespace, comment, or newline
  between the tags.
- Emit them in any order.

  ```html
  <span class='cap'>Heaven</span><span class='nocap'>heaven</span><span class='bsb'>Heaven</span>
  ```

- Emit `<span class='cap'>…</span><span class='bsb'>…</span>` as a pair when the
  lowercase form equals the BSB form.
- Never emit `.bsb` on its own.
- Never nest `.cap` inside `.cap`.
- Never combine `.lord` with `.cap`, `.nocap`, or `.bsb`.

## you / your / yours

- Wrap every occurrence of `you`, `your`, `yours`, `You`, `Your`, `Yours`, `YOU`,
  `YOUR`, `YOURS` in a leaf span.
- Set `data-word` to the original word exactly as it appears.
- Set the class to `youpl` for plural and `yousg` for singular.

  ```html
  <span class='yousg' data-word='you'>you</span>
  <span class='youpl' data-word='Your'>Your</span>
  ```

- Never rewrite `data-word`.
- Never add children to the span.
- Never add `<sup>` to the span.

## Divine names

- Wrap every occurrence of the divine name in a span.
- Set `data-name` to the original rendering.
- Use `.lord` normally and `.caplord` for the all-caps form.

  ```html
  <span class="lord" data-name="The LORD">The LORD</span>
  <span class="lord" data-name="the LORD">the LORD</span>
  <span class="lord" data-name="LORD">LORD</span>
  <span class="caplord" data-name="THE LORD">THE LORD</span>
  ```

- Never omit `data-name`.
- Never add children to the span.
- Never nest `.lord` inside `.lord`.

## Spelling variants

- Emit all three variants whenever a word has British and American spellings.
- Emit them in immediate sequence with no whitespace between the tags.
- Give every one of them exactly one variant class from `ca`, `gb`, `us`.

  ```html
  <span class='spell ca'>colour</span><span class='spell gb'>colour</span><span class='spell us'>color</span>
  ```

## Footnotes

- Mark each footnote in the verse text with a `<span class="fn">` holding the
  letter.
- Put no space before the marker and one space after it.

  ```html
  God.”<span class="fn">f</span> Next words…
  ```

- Put the footnote block at the end of the file, as a sibling of the scripture,
  not nested inside it.
- Put nothing after it except the wrapper's `</div>`.
- Omit the block entirely when a chapter has no footnotes.
- Give the block one `id="fn"` anchor and no other.

  ```html
  <div class="fn">
    <a class="pcalibre2 pcalibre1 pcalibre pcalibre3" id="fn"></a>
    <b class="calibre4">Footnotes:</b>
    <span class="fnverse">21</span> <span class="footnotesbot">f</span> Some translators close this quotation after verse 15.
  </div>
  ```

- Put footnote text directly in the `div.fn`, not inside an `<i>` or `<b>`.

## Words of Christ

- Add the bare class `woc` to each element that should render red.

  ```html
  <span class="woc">direct speech</span>
  <p class="reg1 woc">a whole paragraph of speech</p>
  ```

- Do not add `woc` to a `.reftext`, a `.hdg`, or the `div.fn` wrapper.

## Whitespace

- Put spaces between ordinary words freely.
- Put no whitespace between the three case-variant spans.
- Put no whitespace between the three spelling-variant spans.
- Put no whitespace between a verse marker and the word after it.

## Forbidden

- Do not emit `<sup>` anywhere.
- Do not emit `<script>`, `<style>`, or event-handler attributes.
- Do not put scripture text outside a `<p>`.
- Do not reorder or renumber verses.
- Do not emit only some of the case variants or spelling variants.

## Reserved class names

- Do not use these names outside a chapter file: `version`, `hdg`, `subhdg`,
  `fn`, `reftext`, `cross`, `cross1`, `spell`, `cap`, `nocap`, `bsb`, `lord`,
  `caplord`, `youpl`, `yousg`, `woc`.

## Other class names

- Use any of these freely: `reg1`, `indent`, `indent1stline`, `indentred`,
  `tab1stline`, `fnverse`, `footnotesbot`, `calibre2`, `calibre3`, `calibre4`,
  `calibre6`, `calibre8`, `pcalibre`, `pcalibre1`, `pcalibre2`, `pcalibre3`.
- Use any other class name freely.

## Before finishing

- Confirm every `.reftext` matches `^<span class="reftext" id="v(\d+)">\1</span>$`.
- Confirm every `.reftext` is a direct child of a `<p>`.
- Confirm the `id` numbers ascend with no gaps and no duplicates.
- Confirm `grep -c '<sup' <file>` returns 0.
- Confirm no whitespace separates any two adjacent case-variant or
  spelling-variant spans.
- Confirm every `.spell` span has exactly one of `ca`, `gb`, `us`.
- Confirm every `.lord` and `.caplord` span has `data-name`.
- Confirm every `.yousg` and `.youpl` span has `data-word` from the nine allowed
  values.
- Confirm `div.fn`, if present, is the last element before the wrapper's
  `</div>`.
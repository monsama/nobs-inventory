/* The html`` template: values are escaped, html`` parts and lists nest, false and null give nothing. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html, rawHtml } from '../public/js/html.js';

test('values are escaped, nested html is kept', () => {
  const name = '<img src=x onerror=alert(1)> & "q"';
  assert.equal(String(html`<b title="${name}">${name}</b>`), '<b title="&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;">&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;</b>');
  assert.equal(String(html`<ul>${['a<', 'b'].map(x => html`<li>${x}</li>`)}</ul>`), '<ul><li>a&lt;</li><li>b</li></ul>');
  assert.equal(String(html`<p>${rawHtml('<svg></svg>')}</p>`), '<p><svg></svg></p>');
});

test('false, null and undefined give nothing; 0 and true are text', () => {
  assert.equal(String(html`[${false}${null}${undefined}${0}${true}]`), '[0true]');
  assert.equal(`x${html`<i>${"'"}</i>`}`, 'x<i>&#39;</i>');
});

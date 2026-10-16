import { assert } from "chai";
import { compileCustomCss } from "../src/customCss";

// CSSOM fixtures isolate the compiler from a particular browser's serializer.
// Production parsing is delegated to the host browser in an inert document.
function fixture(rules: unknown[]) {
  const state = { source: "", removed: false, created: false };
  const style = {
    set textContent(value: string) {
      state.source = value;
    },
    sheet: { cssRules: rules },
    remove() {
      state.removed = true;
    },
  };
  const doc = {
    implementation: {
      createHTMLDocument() {
        state.created = true;
        return {
          createElement: () => style,
          head: { appendChild() {} },
        };
      },
    },
  } as unknown as Document;
  return { doc, state };
}

function styleRule(selectorText: string, cssText = "color: red;") {
  return { type: 1, selectorText, style: { cssText } };
}

describe("custom CSS isolation", function () {
  it("constrains every selector's target, including sibling selectors", function () {
    const { doc } = fixture([
      styleRule("button, [data-llm-companion-root] ~ #zotero-pane"),
    ]);
    const result = compileCustomCss(doc, "button { color: red; }");
    assert.include(
      result,
      ":is(button):is([data-llm-companion-root][data-llm-companion-root][data-llm-companion-root][data-llm-companion-root], [data-llm-companion-root][data-llm-companion-root][data-llm-companion-root][data-llm-companion-root] *)",
    );
    assert.include(
      result,
      ":is([data-llm-companion-root] ~ #zotero-pane):is([data-llm-companion-root][data-llm-companion-root][data-llm-companion-root][data-llm-companion-root], [data-llm-companion-root][data-llm-companion-root][data-llm-companion-root][data-llm-companion-root] *)",
    );
  });

  it("preserves commas inside functional selectors and attributes", function () {
    const { doc } = fixture([styleRule(':is(button, input), [title="a,b"]')]);
    const result = compileCustomCss(doc, "button { color: red; }");
    assert.include(result, ":is(:is(button, input)):is(");
    assert.include(result, ':is([title="a,b"]):is(');
  });

  it("maps :root and & to plugin roots and preserves variables", function () {
    const { doc, state } = fixture([styleRule(":root", "--llm-accent: pink;")]);
    const result = compileCustomCss(doc, "& { --llm-accent: pink; }");
    assert.equal(
      state.source,
      "[data-llm-companion-root] { --llm-accent: pink; }",
    );
    assert.include(result, ":is([data-llm-companion-root]):is(");
    assert.include(result, "--llm-accent: pink;");
    assert.isTrue(state.removed);
  });

  it("keeps pseudo-elements after the target guard", function () {
    const { doc } = fixture([styleRule("button::before, p:first-line")]);
    const result = compileCustomCss(doc, "button::before { content: 'x'; }");
    assert.include(result, "[data-llm-companion-root] *)::before");
    assert.include(result, "[data-llm-companion-root] *):first-line");
  });

  it("recurses through media and supports rules", function () {
    const { doc } = fixture([
      {
        type: 4,
        conditionText: "(max-width: 600px)",
        cssRules: [
          {
            type: 12,
            conditionText: "(display: grid)",
            cssRules: [styleRule("input")],
          },
        ],
      },
    ]);
    const result = compileCustomCss(
      doc,
      "@media (max-width: 600px) { input { color: red; } }",
    );
    assert.include(result, "@media (max-width: 600px)");
    assert.include(result, "@supports (display: grid)");
    assert.include(result, ":is(input):is(");
  });

  for (const source of [
    '@import "https://example.com/style.css";',
    "@font-face { font-family: custom; }",
    "@keyframes pulse { from { opacity: 0; } }",
    "@page { margin: 0; }",
    "@property --host { syntax: '*'; inherits: true; }",
    "@namespace url(http://example.com);",
    "button { background: url(https://example.com/track); }",
    'button { background: image-set("https://example.com/image.png" 1x); }',
    "button { -moz-binding: something; }",
    "button { background: u\\72l(https://example.com); }",
  ]) {
    it(`rejects unsafe CSS before creating a parsing document: ${source}`, function () {
      const { doc, state } = fixture([]);
      assert.throws(() => compileCustomCss(doc, source));
      assert.isFalse(state.created);
    });
  }

  it("ignores resource-looking text inside comments and strings", function () {
    const { doc } = fixture([
      styleRule("button::after", 'content: "url(x) @import";'),
    ]);
    assert.doesNotThrow(() =>
      compileCustomCss(
        doc,
        '/* @import url(x); */ button::after { content: "url(x) @import"; }',
      ),
    );
  });

  it("rejects unbalanced input and empty parser results", function () {
    const { doc } = fixture([]);
    assert.throws(
      () => compileCustomCss(doc, "button { color: red;"),
      "unclosed",
    );
    assert.throws(
      () => compileCustomCss(doc, "button { color: red; ]}"),
      "unbalanced",
    );
    assert.throws(
      () => compileCustomCss(doc, "not valid CSS"),
      "No valid CSS rules",
    );
  });

  it("cleans up the parser even if an unsupported CSSOM rule is returned", function () {
    const { doc, state } = fixture([{ type: 7 }]);
    assert.throws(() => compileCustomCss(doc, "button { color: red; }"));
    assert.isTrue(state.removed);
  });

  it("treats clearing custom CSS as a valid operation", function () {
    const { doc, state } = fixture([]);
    assert.equal(compileCustomCss(doc, " \n "), "");
    assert.isFalse(state.created);
  });
});

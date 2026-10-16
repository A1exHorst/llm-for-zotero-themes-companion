const ROOT = "[data-llm-companion-root]";
// Give user rules precedence over theme tokens and component selectors.
const GUARD = ROOT.repeat(4);
const MEMBERSHIP = `:is(${GUARD}, ${GUARD} *)`;

/**
 * Compile user CSS in an inert document, then constrain every matched element
 * to a plugin root. A prefix alone is insufficient: `& ~ *` could escape it.
 * Global at-rules and resource loads are deliberately outside this API.
 */
export function compileCustomCss(doc: Document, source: string): string {
  if (!source.trim()) return "";
  if (source.length > 100_000) {
    throw new Error("Custom CSS is limited to 100,000 characters.");
  }
  const prepared = prepareSource(source);
  const inert = doc.implementation.createHTMLDocument("");
  const style = inert.createElement("style");
  style.textContent = prepared;
  inert.head.appendChild(style);
  try {
    if (!style.sheet) throw new Error("The CSS parser is unavailable.");
    const result = compileRules(style.sheet.cssRules);
    if (!result.trim()) {
      throw new Error("No valid CSS rules were found. Check the CSS syntax.");
    }
    return result;
  } finally {
    style.remove();
  }
}

function prepareSource(source: string): string {
  let plain = "";
  let output = "";
  let quote = "";
  const brackets: string[] = [];
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    // Escapes can disguise resource functions, at-rules and global selectors.
    // Reject instead of attempting a second, subtly different CSS tokenizer.
    if (char === "\\") {
      throw new Error("CSS escape sequences are not supported in custom CSS.");
    }
    if (!quote && char === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end < 0) throw new Error("Custom CSS contains an unclosed comment.");
      output += " ";
      plain += " ";
      i = end + 1;
      continue;
    }
    if (quote) {
      output += char;
      plain += " ";
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      output += char;
      plain += " ";
      continue;
    }
    if ("{[(".includes(char)) brackets.push(char);
    if ("}])".includes(char)) {
      const expected = { "}": "{", "]": "[", ")": "(" }[char];
      if (brackets.pop() !== expected) {
        throw new Error("Custom CSS contains unbalanced brackets.");
      }
    }
    output += char === "&" ? ROOT : char;
    plain += char;
  }
  if (quote || brackets.length) {
    throw new Error("Custom CSS contains an unclosed string or block.");
  }
  for (const match of plain.matchAll(/@([\w-]+)/g)) {
    if (!/^(media|supports)$/i.test(match[1])) {
      throw new Error(
        `@${match[1]} is not supported. Use style rules, @media or @supports.`,
      );
    }
  }
  if (
    /\b(?:url|(?:-webkit-)?image-set|image|src|element|-moz-element)\s*\(/i.test(
      plain,
    )
  ) {
    throw new Error(
      "Custom CSS cannot load resources or reference external elements.",
    );
  }
  if (/-moz-binding\s*:|\bbehavior\s*:/i.test(plain)) {
    throw new Error("Executable CSS properties are not supported.");
  }
  return output;
}

function compileRules(rules: CSSRuleList): string {
  return Array.from(rules)
    .map((rule) => {
      if (rule.type === 1) {
        const style = rule as CSSStyleRule;
        // CSS nesting is intentionally unsupported on Zotero 7's Firefox 115.
        if (
          (style as CSSStyleRule & { cssRules?: CSSRuleList }).cssRules?.length
        ) {
          throw new Error(
            "Use separate selectors instead of nested CSS rules.",
          );
        }
        const selectors = splitSelectors(style.selectorText).map(scopeSelector);
        return `${selectors.join(", ")} { ${style.style.cssText} }`;
      }
      if (rule.type === 4 || rule.type === 12) {
        const group = rule as CSSMediaRule | CSSSupportsRule;
        const name = rule.type === 4 ? "media" : "supports";
        return `@${name} ${group.conditionText} {\n${compileRules(group.cssRules)}\n}`;
      }
      throw new Error("Only style rules, @media and @supports are supported.");
    })
    .join("\n");
}

function splitSelectors(selector: string): string[] {
  const result: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  for (let i = 0; i < selector.length; i++) {
    const char = selector[i];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth--;
    else if (char === "," && !depth) {
      result.push(selector.slice(start, i).trim());
      start = i + 1;
    }
  }
  result.push(selector.slice(start).trim());
  return result;
}

function scopeSelector(selector: string): string {
  selector = selector.replace(/:root\b/g, ROOT);
  // Pseudo-elements must remain outside :is(), and after the membership guard.
  const pseudo = selector.match(
    /(::[\w-]+(?:\([^()]*\))?|:(?:before|after|first-line|first-letter))$/i,
  );
  const suffix = pseudo?.[0] || "";
  const target = suffix ? selector.slice(0, -suffix.length) : selector;
  if (target.includes("::")) {
    throw new Error("Unsupported pseudo-element selector in custom CSS.");
  }
  return `:is(${target || "*"})${MEMBERSHIP}${suffix}`;
}

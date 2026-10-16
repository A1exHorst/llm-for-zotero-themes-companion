export const HTML_NS = "http://www.w3.org/1999/xhtml";

export function createElement<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  props?: Partial<HTMLElementTagNameMap[K]>,
): HTMLElementTagNameMap[K] {
  const element = doc.createElementNS(HTML_NS, tag) as HTMLElementTagNameMap[K];
  if (className) element.className = className;
  if (props) Object.assign(element, props);
  return element;
}

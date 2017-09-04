/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";
const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * The svg tag names' list is taken from:  https://www.w3.org/TR/SVG/eltindex.html
 * Notice that the svg tag <a> is missing, since it would be overridden by the namesake
 * html tag in `DOM` object.
 * In order to create a svg's <a> element, the namespace needs to be explict.
 *
 * For example:
 *   DOM.a({xmlns: "http://www.w3.org/2000/svg"});
 * or:
 *  h("svg:a");
 *
 */
const SVG_TAG_NAMES = [
  "altGlyph", "altGlyphDef", "altGlyphItem", "animate", "animateColor",
  "animateMotion", "animateTransform", "circle", "clipPath", "colorProfile",
  "cursor", "defs", "desc", "ellipse", "feBlend", "feColorMatrix",
  "feComponentTransfer", "feComposite", "feConvolveMatrix", "feDiffuseLighting",
  "feDisplacementMap", "feDistantLight", "feFlood", "feFuncA", "feFuncB",
  "feFuncG", "feFuncR", "feGaussianBlur", "feImage", "feMerge", "feMergeNode",
  "feMorphology", "feOffset", "fePointLight", "feSpecularLighting",
  "feSpotlight", "feTile", "feTurbulence", "filter", "font", "fontFace",
  "fontFaceFormat", "fontFaceName", "fontFaceSrc", "fontFaceUri",
  "foreignObject", "g", "glyph", "glyphRef", "hkern", "image", "line",
  "linearGradient", "marker", "mask", "metadata", "missingGlyph", "mpath",
  "path", "pattern", "polygon", "polyline", "radialGradient", "rect", "script",
  "set", "stop", "style", "switch", "symbol", "text", "textPath", "title",
  "tref", "tspan", "use", "view", "vkern"
];

const HTML_TAG_NAMES = [
  "a", "abbr", "acronym", "address", "applet", "area", "article", "aside", "audio", "b",
  "base", "basefont", "bdi", "bdo", "bgsound", "big", "blink", "blockquote", "body", "br",
  "button", "canvas", "caption", "center", "cite", "code", "col", "colgroup", "command",
  "content", "data", "datalist", "dd", "del", "details", "dfn", "dialog", "dir", "div",
  "dl", "dt", "element", "em", "embed", "fieldset", "figcaption", "figure", "font",
  "footer", "form", "frame", "frameset", "h1", "h2", "h3", "h4", "h5", "h6", "head",
  "header", "hgroup", "hr", "html", "i", "iframe", "image", "img", "input", "ins",
  "isindex", "kbd", "keygen", "label", "legend", "li", "link", "listing", "main", "map",
  "mark", "marquee", "math", "menu", "menuitem", "meta", "meter", "multicol", "nav",
  "nextid", "nobr", "noembed", "noframes", "noscript", "object", "ol", "optgroup",
  "option", "output", "p", "param", "picture", "plaintext", "pre", "progress", "q", "rb",
  "rbc", "rp", "rt", "rtc", "ruby", "s", "samp", "script", "section", "select", "shadow",
  "slot", "small", "source", "spacer", "span", "strike", "strong", "style", "sub",
  "summary", "sup", "svg", "table", "tbody", "td", "template", "textarea", "tfoot", "th",
  "thead", "time", "title", "tr", "track", "tt", "u", "ul", "var", "video", "wbr", "xmp"
];

const DOM = {};
const isVNode = (target) => "tagName" in target && "properties" in target;
const matchSelector = (selector) =>
  selector ? selector.match(/[\w+_-]+|[#.][^#.]+/g) : [];

function createVNode(selector, properties, ...args) {
  let parts = matchSelector(selector);
  let id = "";
  let classes = [];
  let tagName = "div";

  properties = properties || {};

  for (let part of parts) {
    if (part[0] === "#") {
      id = part.substr(1);
    } else if (part[0] === ".") {
      classes.push(part.substr(1));
    } else if (part.startsWith("svg:")) {
      tagName = part.substr(4);
      properties.xmlns = SVG_NS;
    } else {
      if (part === "svg") {
        properties.xmlns = SVG_NS;
      }
      tagName = part;
    }
  }

  if (id && !("id" in properties)) {
    properties.id = id;
  }

  if (!properties.xmlns) {
    tagName = tagName.toUpperCase();
  }

  if ("className" in properties) {
    classes.push(properties.className);
  }

  if (classes.length > 0) {
    if ("class" in properties) {
      properties.className = properties.class;
      delete properties.class;
    }

    properties.className = classes.join(" ");
  }

  // filters out both undefined and null values
  let children = [].concat(...args).filter(v => v != null);
  return { tagName, properties, children };
}

/**
 *
 */
function h(selector, first, ...rest) {
  if (typeof first === "string") {
    let isClassOrId = ".#".includes(first[0]);

    if (rest[0] && isVNode(rest[0])) {
      if (isClassOrId) {
        return createVNode(selector + first, {}, ...rest);
      }
      return createVNode(selector, {}, first, ...rest);
    }
    if (isClassOrId) {
      return createVNode(selector + first, ...rest);
    }
    return createVNode(selector, {}, first, ...rest);
  } else if (typeof first === "object") {
    if (first === null) {
      return createVNode(selector, {}, ...rest);
    } else if (isVNode(first)) {
      return createVNode(selector, {}, first, ...rest);
    } else if (Array.isArray(first)) {
      return createVNode(selector, {}, ...first, ...rest);
    }
  }
  return createVNode(selector, first, ...rest);
  // return createVNode(first || "", ...rest);
}
exports.h = h;

HTML_TAG_NAMES.forEach(tagName => {
  DOM[tagName] = (first, ...rest) => h(tagName, first, ...rest);
});

SVG_TAG_NAMES.forEach(tagName => {
  DOM[tagName] = (first, ...rest) => h("svg:" + tagName, first, ...rest);
});
exports.DOM = DOM;

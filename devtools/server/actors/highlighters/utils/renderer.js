/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const _formatters = Symbol("renderer/formatters");

function defaultStyleFormatter(value) {
  if (typeof value === "object" && value !== null) {
    return Object.keys(value)
                    .reduce((r, k) => {
                      r.push(k + ":" + value[k]);
                      return r;
                    }, []).join(";");
  }

  return value;
}

class Renderer {
  constructor(document) {
    this.document = document;
    this[_formatters] = {};

    this.setFormatterFor("style", defaultStyleFormatter);
  }

  setFormatterFor(name, formatter) {
    this[_formatters][name] = formatter;
  }

  render(vtree) {
    let { document } = this;

    // Strings just convert to #text Nodes:
    if (typeof vtree === "string") {
      return document.createTextNode(vtree);
    }

    // create a DOM element with the nodeName of our VDOM element:
    let { nodeName } = vtree;

    let n;
    if (vtree.attributes.xmlns) {
      n = document.createElementNS(vtree.properties.xmlns, nodeName);
    } else {
      n = document.createElement(nodeName);
    }

    // copy attributes onto the new node:
    let a = vtree.properties;
    Object.keys(a).forEach(k => {
      if (k === "xmlns") {
        return;
      }

      let formatter = this[_formatters][k];
      let v = a[k];

      if (formatter) {
        v = formatter(v);
      }

      n.setAttribute(k, v);
    });

    // render (build) and then append child nodes:
    (vtree.children || []).forEach(c => n.appendChild(this.render(c)));

    return n;
  }
}
exports.Renderer = Renderer;


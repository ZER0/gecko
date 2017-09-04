/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {
  CanvasFrameAnonymousContentHelper,
} = require("./utils/anonymous-content");
const { DOM } = require("./utils/hyper-script");
const { Renderer } = require("./utils/renderer.js");

const toKebabCase = text =>
  text.replace(/[A-Z]+/g, (a) => "-" + a.toLowerCase()).substr(1);

class BaseHighlighter {
  constructor(env) {
    this.env = env;

    let typeName = this.constructor.typeName || this.constructor.name;
    let className = toKebabCase(typeName).replace(/-highlighter/, "");
    let prefix = className + "-";

    let renderer = new Renderer(env.document);
    let prefixFormatter = value => prefix + value;

    let container = renderer.render(DOM.div(".highlighter-container." + className));

    renderer.setFormatterFor("id", prefixFormatter);
    renderer.setFormatterFor("class", prefixFormatter);

    this.markup = new CanvasFrameAnonymousContentHelper(env,
      () => container.appendChild(renderer.render(this.build(DOM))).parentNode, prefix);
  }

  destroy() {
    this.markup.destroy();
  }
}
exports.BaseHighlighter = BaseHighlighter;

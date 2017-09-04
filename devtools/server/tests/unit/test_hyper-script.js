/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { h, DOM } = require("devtools/server/actors/highlighters/utils/hyper-script");

const TESTS = {
  "test h is a function"() {
    equal(typeof h, "function");
  },

  "test h returns a vnode, and div by default"() {
    equal(h().tagName, "DIV");
  },

  "test h defaults tagName to uppercase"() {
    equal(h("").tagName, "DIV");
    equal(h("div").tagName, "DIV");
  },

  "test h preserves tagName case if namespace is given"() {
    equal(h("test", { xmlns: "http://www.w3.org/XML/1998/namespace" }).tagName, "test");
  },

  "test h has props"() {
    equal(h("div", {
      foo: "bar"
    }).properties.foo, "bar");
  },

  "test h with text"() {
    let node = h("div", "text");
    equal(node.children[0], "text");
  },

  "test h with child"() {
    let node = h("div", h("span"));

    equal(node.children[0].tagName, "SPAN");
  },

  "test h with children"() {
    let node = h("div", [h("span")]);

    equal(node.children[0].tagName, "SPAN");
  },

  "test h with null"() {
    let node = h("div", null);
    let node2 = h("div", [null]);

    equal(node.children.length, 0);
    equal(node2.children.length, 0);
  },

  "test h with undefined"() {
    let node = h("div", undefined);
    let node2 = h("div", [undefined]);

    equal(node.children.length, 0);
    equal(node2.children.length, 0);
  },

  "test h with class"() {
    let node = h(".foo");
    equal(node.properties.className, "foo");
  },

  "test h with id"() {
    let node = h("#foo");

    equal(node.properties.id, "foo");
  },

  "test h with empty string"() {
    let node = h("");

    equal(node.tagName, "DIV");
  },

  "test h with two classes"() {
    let node = h(".foo", { className: "bar" });

    equal(node.properties.className, "foo bar");
  },

  "test h with two ids"() {
    let node = h("#foo", { id: "bar" });

    equal(node.properties.id, "bar");
  },

  "test svg default namespace"() {
    let node = h("svg:circle");

    equal(node.tagName, "circle");
    equal(node.properties.xmlns, "http://www.w3.org/2000/svg");
  },

  "test svg element has svg namespace"() {
    let node = h("svg");

    equal(node.tagName, "svg");
    equal(node.properties.xmlns, "http://www.w3.org/2000/svg");
  },

  "test DOM factories are equivalent to h"() {
    let { span, div, b } = DOM;

    let node = h("div", "#foo.bar", {"className": "baz"}, h("span", h("b", "hello")));
    let node2 = div("#foo.bar", {"className": "baz"}, span(b("hello")));

    deepEqual(node, node2);
  },

  "test DOM factories with no arguments"() {
    let { div } = DOM;

    let node = div();
    equal(node.tagName, "DIV");
    deepEqual(node.properties, {});
    equal(node.children.length, 0);
  },

  "test DOM factories with selector as first argument"() {
    let { div } = DOM;

    let node = div("#foo.bar");

    equal(node.tagName, "DIV");
    equal(node.properties.id, "foo");
    equal(node.properties.className, "bar");
    equal(Object.keys(node.properties).length, 2);
    equal(node.children.length, 0);
  },

  "test DOM factories with props as first argument"() {
    let { div } = DOM;

    let node = div({className: "foo bar"});

    equal(node.tagName, "DIV");
    equal(node.properties.className, "foo bar");
    equal(Object.keys(node.properties).length, 1);
    equal(node.children.length, 0);
  },

  "test DOM factories with child as first argument"() {
    let { div, span } = DOM;

    let node = div(span());
    equal(node.children[0].tagName, "SPAN");
  },

  "test DOM factories with children as first argument"() {
    let { div, span } = DOM;

    let node = div([span(), span(), span()]);
    let node2 = div(span(), span(), span());

    deepEqual(node, node2);

    equal(node.tagName, "DIV");
    deepEqual(node.properties, {});
    equal(node.children.length, 3);

    equal(node.children[0].tagName, "SPAN");
    equal(node.children[1].tagName, "SPAN");
    equal(node.children[2].tagName, "SPAN");
  },

  "test DOM factories with props as first argument and children"() {
    let { div, span } = DOM;

    let node = div({"className": "foo"}, span(), span());

    equal(node.tagName, "DIV");
    equal(node.properties.className, "foo");
    equal(node.children.length, 2);

    equal(node.children[0].tagName, "SPAN");
    equal(node.children[1].tagName, "SPAN");
  },
};

const run = (tests) => (async function () {
  for (let name of Object.keys(tests)) {
    do_print(name);
    if (tests[name].length === 1) {
      await (new Promise(resolve => tests[name](resolve)));
    } else {
      await tests[name]();
    }
  }
});

add_task(run(TESTS));

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const versions = ["7.2.14", "7.2.15", "7.3.1"];
const kernels = versions.flatMap((version) =>
  ["aarch64", "x86_64"].map((architecture) => ({
    version, architecture, revision: 2,
    package: `kernel/${version}/r2/${architecture}/vmlinux-${version}.tar.zst`,
  })),
);

async function openPage({ path = "/", catalog = { kernels }, status = 200 } = {}) {
  const events = new Map();
  const requests = [];
  const history = [];
  const window = {
    location: new URL(path, "https://registry.example"),
    addEventListener(name, handler) { events.set(name, handler); },
  };
  class Element {
    constructor(tag) {
      this.tag = tag;
      this.children = [];
      this.events = new Map();
    }
    set textContent(value) { this.children = [{ textContent: value }]; }
    get textContent() { return this.children.map((child) => child.textContent).join(""); }
    set href(value) { this.url = new URL(value, window.location).href; }
    get href() { return this.url; }
    appendChild(child) { this.children.push(child); return child; }
    addEventListener(name, handler) { this.events.set(name, handler); }
  }
  const listing = new Element("pre");
  const document = {
    getElementById: () => listing,
    createTextNode: (textContent) => ({ textContent }),
    createElement: (tag) => new Element(tag),
  };
  vm.runInNewContext(source, {
    document, window, URLSearchParams,
    history: {
      pushState(_state, _title, href) {
        history.push(window.location.href);
        window.location = new URL(href, window.location);
      },
    },
    fetch: async (url) => {
      requests.push(url);
      assert.equal(url, "/kernel/catalog.json");
      return { ok: status === 200, status, json: async () => catalog };
    },
  });
  await setImmediate();
  const links = () => listing.children.filter((child) => child.tag === "a");
  return {
    requests, links,
    text: () => listing.textContent,
    url: () => window.location.href,
    click(label) {
      const link = links().find((item) => item.textContent.trim() === label);
      assert.ok(link, `missing link: ${label}`);
      link.events.get("click")({ button: 0, preventDefault() {} });
    },
    back() {
      window.location = new URL(history.pop());
      events.get("popstate")();
    },
  };
}

test("loads kernels without requesting the deleted image catalog", async () => {
  const page = await openPage();
  assert.deepEqual(page.requests, ["/kernel/catalog.json"]);
  assert.match(page.text(), /Kernels\//);
  assert.doesNotMatch(page.text(), /Images\/|alpine|rocky|ubuntu/);
  assert.equal(page.links()[0].href, "https://registry.example/?path=kernel");
});

test("lists all three versions newest first", async () => {
  const page = await openPage({ path: "/?path=kernel" });
  assert.deepEqual(page.links().map((link) => link.textContent), [
    "../", "catalog.json", "7.3.1/", "7.2.15/", "7.2.14/",
  ]);
  assert.equal(page.links()[1].href, "https://registry.example/kernel/catalog.json");
});

test("direct links expose all revisioned packages and their actual checksums", async () => {
  for (const kernel of kernels) {
    const page = await openPage({ path: `/?path=kernel/${kernel.version}/${kernel.architecture}` });
    const archive = page.links().find((link) => link.download?.endsWith(".tar.zst"));
    const sums = page.links().find((link) => link.download === "SHA256SUMS");
    assert.equal(archive.href, `https://registry.example/${kernel.package}`);
    assert.equal(sums.href, `https://registry.example/${kernel.package.replace(/[^/]+$/, "SHA256SUMS")}`);
  }
});

test("supports legacy four-segment kernel package paths", async () => {
  const legacy = { version: "7.1.8", architecture: "x86_64", package: "kernel/7.1.8/x86_64/vmlinux-7.1.8.tar.zst" };
  const page = await openPage({ path: "/?path=kernel/7.1.8/x86_64", catalog: { kernels: [legacy] } });
  assert.ok(page.links().some((link) => link.href.endsWith(legacy.package)));
  assert.ok(page.links().some((link) => link.href.endsWith("kernel/7.1.8/x86_64/SHA256SUMS")));
});

test("navigation and browser back preserve the kernel hierarchy", async () => {
  const page = await openPage();
  page.click("kernel/");
  page.click("7.3.1/");
  page.click("x86_64/");
  assert.equal(page.url(), "https://registry.example/?path=kernel/7.3.1/x86_64");
  assert.match(page.text(), /vmlinux-7.3.1.tar.zst/);
  page.back();
  assert.deepEqual(page.links().map((link) => link.textContent), ["../", "aarch64/", "x86_64/"]);
});

test("rejects non-kernel, mismatched, and invalid revision paths", async () => {
  const invalid = [
    { version: "7.3.1", architecture: "x86_64", package: "alpine/7.3.1/x86_64/package.tar.zst" },
    { version: "7.3.1", architecture: "aarch64", package: "kernel/7.3.1/r2/x86_64/package.tar.zst" },
    { version: "7.3.1", architecture: "x86_64", package: "kernel/7.3.1/next/x86_64/package.tar.zst" },
    { version: "..", architecture: "x86_64", package: "kernel/../x86_64/package.tar.zst" },
  ];
  const page = await openPage({ catalog: { kernels: invalid } });
  assert.match(page.text(), /No kernels published/);
});

test("reports kernel catalog errors instead of silently hiding kernels", async () => {
  const page = await openPage({ status: 404 });
  assert.equal(page.text(), "Could not load kernel/catalog.json: HTTP 404\n");
  const malformed = await openPage({ catalog: {} });
  assert.match(malformed.text(), /Invalid kernel catalog/);
});

test("index.html and old clean paths retain their logical directory", async () => {
  const index = await openPage({ path: "/index.html" });
  assert.match(index.text(), /Kernels\//);
  const clean = await openPage({ path: "/kernel/7.3.1/x86_64/" });
  assert.match(clean.text(), /vmlinux-7.3.1.tar.zst/);
});

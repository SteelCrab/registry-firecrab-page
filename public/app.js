"use strict";

const listing = document.getElementById("listing");

function derivePath() {
  const query = new URLSearchParams(window.location.search);
  const pathParam = query.get("path");
  const pathname = window.location.pathname === "/index.html" ? "/" : window.location.pathname;
  const raw = pathParam !== null ? pathParam : pathname;
  return raw.split("/").filter(Boolean);
}

let currentPath = derivePath();
let records = [];

function appendText(value) {
  listing.appendChild(document.createTextNode(value));
}

function appendLink(label, href, download) {
  const link = document.createElement("a");
  link.textContent = label;
  link.href = href;
  if (download) {
    link.download = download;
  }
  listing.appendChild(link);
  appendText("\n");
  return link;
}

function appendDirectoryLink(label, parts) {
  const link = appendLink(label, directoryUrl(parts));
  link.addEventListener("click", (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    if (link.href !== window.location.href) {
      history.pushState(null, "", link.href);
    }
    currentPath = parts;
    render(records);
  });
}

function directoryUrl(parts) {
  if (parts.length === 0) {
    return "/";
  }
  // R2 only rewrites the root to index.html. Query paths also work on reload.
  return `/?path=${parts.map(encodeURIComponent).join("/")}`;
}

function packageUrl(packagePath) {
  return `/${packagePath.split("/").map(encodeURIComponent).join("/")}`;
}

function compareNames(left, right) {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function uniqueSorted(values) {
  return [...new Set(values)].sort(compareNames);
}

function parseKernel(kernel) {
  if (!kernel || typeof kernel.package !== "string") {
    return null;
  }

  const parts = kernel.package.split("/");
  if (
    ![4, 5].includes(parts.length) ||
    parts.some((part) => !part || part === "." || part === ".." || part.includes("\\"))
  ) {
    return null;
  }

  const [distribution, version] = parts;
  const architecture = parts.at(-2);
  const filename = parts.at(-1);

  if (
    distribution !== "kernel" ||
    version !== kernel.version ||
    architecture !== kernel.architecture ||
    (parts.length === 5 && !/^r[1-9]\d*$/.test(parts[2]))
  ) {
    return null;
  }

  return {
    version,
    architecture,
    filename,
    packagePath: kernel.package,
    checksumPath: `${parts.slice(0, -1).join("/")}/SHA256SUMS`,
  };
}

function render(records) {
  const pathLabel = currentPath.length ? `/${currentPath.join("/")}/` : "/";
  document.title = `Index of ${pathLabel}`;
  listing.textContent = `Index of ${pathLabel}\n${"=".repeat(9 + pathLabel.length)}\n\n`;

  if (currentPath.length !== 0) {
    appendDirectoryLink("../", currentPath.slice(0, -1));
  }

  if (currentPath.length === 0) {
    appendText("Kernels/\n");
    appendDirectoryLink("  kernel/", ["kernel"]);
    if (!records.length) {
      appendText("No kernels published.\n");
    }
    return;
  }

  if (currentPath[0] !== "kernel") {
    appendText("Not found\n");
    return;
  }

  if (currentPath.length === 1) {
    appendLink("catalog.json", "/kernel/catalog.json");
    appendText("\n");
    const versions = records.map((record) => record.version);
    for (const version of uniqueSorted(versions).reverse()) {
      appendDirectoryLink(`${version}/`, [...currentPath, version]);
    }
    return;
  }

  if (currentPath.length === 2) {
    const architectures = records
      .filter((record) => record.version === currentPath[1])
      .map((record) => record.architecture);
    for (const architecture of uniqueSorted(architectures)) {
      appendDirectoryLink(`${architecture}/`, [...currentPath, architecture]);
    }
    return;
  }

  if (currentPath.length === 3) {
    const packages = records
      .filter(
        (record) =>
          record.version === currentPath[1] &&
          record.architecture === currentPath[2],
      )
      .sort((left, right) => compareNames(left.filename, right.filename));
    for (const kernel of packages) {
      appendLink(kernel.filename, packageUrl(kernel.packagePath), kernel.filename);
    }
    for (const checksum of uniqueSorted(packages.map((kernel) => kernel.checksumPath))) {
      appendLink("SHA256SUMS", packageUrl(checksum), "SHA256SUMS");
    }
    return;
  }

  appendText("Not found\n");
}

window.addEventListener("popstate", () => {
  currentPath = derivePath();
  render(records);
});

function fetchCatalog(url) {
  return fetch(url, { cache: "no-store" }).then((response) => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  });
}

fetchCatalog("/kernel/catalog.json")
  .then((catalog) => {
    if (!Array.isArray(catalog.kernels)) {
      throw new Error("Invalid kernel catalog");
    }
    records = catalog.kernels.map(parseKernel).filter(Boolean);
    render(records);
  })
  .catch((error) => {
    listing.textContent = `Could not load kernel/catalog.json: ${error.message}\n`;
  });

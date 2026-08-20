"use strict";

const listing = document.getElementById("listing");

// A path can arrive two ways: a clean URL like /kernel/7.1.8/ (what every
// link on this page now generates and what a shared/bookmarked link looks
// like), or the legacy /index.html?path=kernel/7.1.8 query form (kept
// working for old links). ?path=, when present, wins.
function derivePath() {
  const query = new URLSearchParams(window.location.search);
  const pathParam = query.get("path");
  const raw = pathParam !== null ? pathParam : window.location.pathname;
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

// Directory links are navigated client-side (pushState), so a click never
// hits the network: R2 has no real object at these clean-path URLs, only
// /index.html and the actual package files. The href is still a real,
// shareable clean URL - it just needs a server-side rewrite (the same kind
// that already maps / to /index.html) to resolve on a fresh visit.
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
  return `/${parts.map(encodeURIComponent).join("/")}/`;
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

function parseImage(image) {
  if (!image || typeof image.package !== "string") {
    return null;
  }

  const parts = image.package.split("/").filter(Boolean);
  if (parts.length !== 4) {
    return null;
  }

  const [pathDistribution, pathVersion, pathArchitecture, filename] = parts;
  const distribution = image.distribution || pathDistribution;
  const version = image.distributionVersion || image.series || pathVersion;
  const architecture = image.architecture || pathArchitecture;

  if (
    distribution !== pathDistribution ||
    version !== pathVersion ||
    architecture !== pathArchitecture
  ) {
    return null;
  }

  return {
    distribution,
    version,
    architecture,
    filename,
    packagePath: image.package,
  };
}

function render(records) {
  const pathLabel = currentPath.length ? `/${currentPath.join("/")}/` : "/";
  document.title = `Index of ${pathLabel}`;
  listing.textContent = `Index of ${pathLabel}\n${"=".repeat(9 + pathLabel.length)}\n\n`;

  if (currentPath.length === 0) {
    appendLink("catalog.json", "/catalog.json");
    appendText("\n");
  } else {
    appendDirectoryLink("../", currentPath.slice(0, -1));
  }

  if (currentPath.length === 0) {
    const distributions = uniqueSorted(records.map((record) => record.distribution));
    const kernels = distributions.filter((distribution) => distribution === "kernel");
    const images = distributions.filter((distribution) => distribution !== "kernel");

    if (images.length) {
      appendText("Images/\n");
      for (const distribution of images) {
        appendDirectoryLink(`  ${distribution}/`, [distribution]);
      }
    }

    if (kernels.length) {
      if (images.length) {
        appendText("\n");
      }
      appendText("Kernels/\n");
      for (const distribution of kernels) {
        appendDirectoryLink(`  ${distribution}/`, [distribution]);
      }
    }
    return;
  }

  if (currentPath.length === 1) {
    const versions = records
      .filter((record) => record.distribution === currentPath[0])
      .map((record) => record.version);
    for (const version of uniqueSorted(versions)) {
      appendDirectoryLink(`${version}/`, [...currentPath, version]);
    }
    return;
  }

  if (currentPath.length === 2) {
    const architectures = records
      .filter(
        (record) =>
          record.distribution === currentPath[0] &&
          record.version === currentPath[1],
      )
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
          record.distribution === currentPath[0] &&
          record.version === currentPath[1] &&
          record.architecture === currentPath[2],
      )
      .sort((left, right) => compareNames(left.filename, right.filename));
    for (const image of packages) {
      appendLink(image.filename, packageUrl(image.packagePath), image.filename);
    }
    // Every published distribution/version/architecture directory ships a
    // shared SHA256SUMS alongside its packages, but it isn't a catalog.json
    // entry, so it's linked by directory convention rather than parsed data.
    if (packages.length) {
      appendLink(
        "SHA256SUMS",
        packageUrl([...currentPath, "SHA256SUMS"].join("/")),
        "SHA256SUMS",
      );
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

fetchCatalog("/catalog.json")
  .then((catalog) => {
    const images = Array.isArray(catalog.images) ? catalog.images : [];
    // The kernel catalog is published separately from the image catalog, so
    // it's fetched independently and merged. It's optional: a registry with
    // no published kernels has no /kernel/catalog.json at all.
    return fetchCatalog("/kernel/catalog.json")
      .then((kernelCatalog) =>
        Array.isArray(kernelCatalog.kernels) ? kernelCatalog.kernels : [],
      )
      .catch(() => [])
      .then((kernels) => [...images, ...kernels]);
  })
  .then((entries) => {
    records = entries.map(parseImage).filter(Boolean);
    render(records);
  })
  .catch((error) => {
    listing.textContent = `Could not load catalog.json: ${error.message}\n`;
  });

"use strict";

const listing = document.getElementById("listing");
const query = new URLSearchParams(window.location.search);
const currentPath = (query.get("path") || "")
  .split("/")
  .filter(Boolean);

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
}

function directoryUrl(parts) {
  if (parts.length === 0) {
    return "/";
  }
  return `/index.html?path=${encodeURIComponent(parts.join("/"))}`;
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
    appendLink("../", directoryUrl(currentPath.slice(0, -1)));
  }

  if (currentPath.length === 0) {
    const distributions = uniqueSorted(records.map((record) => record.distribution));
    const kernels = distributions.filter((distribution) => distribution === "kernel");
    const images = distributions.filter((distribution) => distribution !== "kernel");

    if (images.length) {
      appendText("Images/\n");
      for (const distribution of images) {
        appendLink(`  ${distribution}/`, directoryUrl([distribution]));
      }
    }

    if (kernels.length) {
      if (images.length) {
        appendText("\n");
      }
      appendText("Kernels/\n");
      for (const distribution of kernels) {
        appendLink(`  ${distribution}/`, directoryUrl([distribution]));
      }
    }
    return;
  }

  if (currentPath.length === 1) {
    const versions = records
      .filter((record) => record.distribution === currentPath[0])
      .map((record) => record.version);
    for (const version of uniqueSorted(versions)) {
      appendLink(`${version}/`, directoryUrl([...currentPath, version]));
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
      appendLink(`${architecture}/`, directoryUrl([...currentPath, architecture]));
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
    const records = entries.map(parseImage).filter(Boolean);
    render(records);
  })
  .catch((error) => {
    listing.textContent = `Could not load catalog.json: ${error.message}\n`;
  });

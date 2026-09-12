const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "public");

const copyFile = (source, destination) => {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
};

const copyDir = (source, destination) => {
  if (!fs.existsSync(source)) return;
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDir(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      copyFile(sourcePath, destinationPath);
    }
  }
};

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (/^(?:index|viewer|shared|[0-9A-Za-z_-]+)\.html$/.test(entry.name) || /^[0-9]{3}\.html$/.test(entry.name)) {
    copyFile(path.join(root, entry.name), path.join(output, entry.name));
  }
  if (entry.name === "invitation-data.json" || entry.name === "robots.txt" || entry.name === "sitemap.xml") {
    copyFile(path.join(root, entry.name), path.join(output, entry.name));
  }
}

copyDir(path.join(root, "assets"), path.join(output, "assets"));

console.log(`Built public static output at ${path.relative(root, output)}`);

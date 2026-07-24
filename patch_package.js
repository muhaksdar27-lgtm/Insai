const fs = require('fs');
let pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.engines = { node: ">=20.0.0" };
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + "\n");
console.log("Patched package.json successfully");

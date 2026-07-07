const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(__dirname, 'node_modules/@expo/cli/build/src/start/server/metro/externals.js');

if (fs.existsSync(targetFile)) {
  let content = fs.readFileSync(targetFile, 'utf8');
  const patch = '  if (moduleId.includes(":")) { console.log("Skipping illegal Windows path for:", moduleId); return; }';
  
  if (content.includes('const shimDir =') && !content.includes('moduleId.includes(":")')) {
    const lines = content.split('\n');
    const targetIndex = lines.findIndex(line => line.includes('const shimDir ='));
    
    if (targetIndex !== -1) {
      lines.splice(targetIndex, 0, patch);
      const newContent = lines.join('\n');
      fs.writeFileSync(targetFile, newContent);
      console.log('✅ Successfully patched @expo/cli to ignore modules with colons on Windows.');
    }
  } else {
    console.log('ℹ️ @expo/cli is already patched or target line not found.');
  }
} else {
  console.log('❌ node_modules not found. Run npm install first.');
}

// Ensure tslib provides a default export for interoperability
try {
  const tslibPath = path.resolve(__dirname, 'node_modules/tslib/tslib.js');
  if (fs.existsSync(tslibPath)) {
    let tContent = fs.readFileSync(tslibPath, 'utf8');
    const shim = '\n// Compatibility shim: ensure default export exists for CommonJS/ESM interop\nif (typeof module !== "undefined" && module.exports && typeof module.exports.default === "undefined") {\n  module.exports.default = module.exports;\n}\n';
    if (!tContent.includes('module.exports.default')) {
      fs.appendFileSync(tslibPath, shim, 'utf8');
      console.log('✅ Patched tslib to add default export shim.');
    } else {
      console.log('ℹ️ tslib already contains default export shim.');
    }
  } else {
    console.log('ℹ️ tslib not found in node_modules; skipping shim.');
  }
} catch (err) {
  console.error('⚠️ Failed to patch tslib:', err.message);
}

// Patch Metro Server to handle <anonymous> ENOENT errors on Windows
const metroServerFile = path.resolve(__dirname, 'node_modules/metro/src/Server.js');
if (fs.existsSync(metroServerFile)) {
  let mContent = fs.readFileSync(metroServerFile, 'utf8');
  const mPatch = "if (filePath.includes('<anonymous>')) { return null; }";
  const mTarget = /const source = fs\.readFileSync\(filePath, 'utf8'\);/g;

  if (mContent.match(mTarget) && !mContent.includes("filePath.includes('<anonymous>')")) {
    const newMContent = mContent.replace(mTarget, (match) => `${mPatch}\n    ${match}`);
    fs.writeFileSync(metroServerFile, newMContent, 'utf8');
    console.log('✅ Successfully patched Metro Server to ignore anonymous paths.');
  } else {
    console.log('ℹ️ Metro Server already patched or target line not found.');
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Fix @react-navigation/elements web export bug: Metro cannot resolve this
// package's relative "./assets/*.png" icon imports on web (reproducible on
// a clean install, unrelated to any app code — confirmed via debug tracing
// that the files exist on disk at the exact resolved path but Metro's
// resolver still reports them missing, in both `static` and `single` web
// output modes). Workaround: inline the 5 icon files this package ships
// (back-icon, back-icon-mask, clear-icon, close-icon, search-icon) as
// base64 data URIs directly in the compiled files that import them,
// bypassing Metro's asset resolution for this package entirely. Purely
// cosmetic navigation icons — no behavior change, just how the bytes get
// loaded.
try {
  const rnElementsDir = path.resolve(__dirname, 'node_modules/@react-navigation/elements/lib/module');
  const rnElementsFiles = [
    path.join(rnElementsDir, 'index.js'),
    path.join(rnElementsDir, 'Header/Header.js'),
    path.join(rnElementsDir, 'Header/HeaderBackButton.js'),
    path.join(rnElementsDir, 'Header/HeaderSearchBar.js'),
  ];
  const pngImportRe = /import\s+(\w+)\s+from\s+['"](\.{1,2}\/assets\/[\w.@-]+\.png)['"];?\n?/g;
  let anyPatched = false;

  for (const file of rnElementsFiles) {
    if (!fs.existsSync(file)) continue;
    let content = fs.readFileSync(file, 'utf8');
    const dir = path.dirname(file);
    let changedThisFile = false;

    content = content.replace(pngImportRe, (match, varName, relPath) => {
      const absPath = path.resolve(dir, relPath);
      if (!fs.existsSync(absPath)) return match; // asset missing entirely, leave as-is
      const b64 = fs.readFileSync(absPath).toString('base64');
      changedThisFile = true;
      return `const ${varName} = { uri: 'data:image/png;base64,${b64}' };\n`;
    });

    if (changedThisFile) {
      fs.writeFileSync(file, content, 'utf8');
      anyPatched = true;
    }
  }

  if (anyPatched) {
    console.log('✅ Patched @react-navigation/elements to inline icons as base64 (fixes web export).');
  } else {
    console.log('ℹ️ @react-navigation/elements already patched, or package not found/changed shape.');
  }
} catch (err) {
  console.error('⚠️ Failed to patch @react-navigation/elements:', err.message);
}
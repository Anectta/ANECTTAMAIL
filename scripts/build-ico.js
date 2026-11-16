const fs = require('fs');
const path = require('path');
const pngToIcoPkg = require('png-to-ico');
const pngToIco = pngToIcoPkg.default || pngToIcoPkg;

async function buildIco() {
  try {
    const iconSizes = [
      path.join(__dirname, '../build/icon_16.png'),
      path.join(__dirname, '../build/icon_24.png'),
      path.join(__dirname, '../build/icon_32.png'),
      path.join(__dirname, '../build/icon_48.png'),
      path.join(__dirname, '../build/icon_64.png'),
      path.join(__dirname, '../build/icon_128.png'),
      path.join(__dirname, '../build/icon_256.png'),
    ];

    const buf = await pngToIco(iconSizes);
    const icoPath = path.join(__dirname, '../build/icon.ico');
    fs.writeFileSync(icoPath, buf);
    console.log(`Generated ICO: ${icoPath} (${buf.length} bytes)`);

    // Copy to public/favicon.ico
    fs.writeFileSync(path.join(__dirname, '../public/favicon.ico'), buf);
    console.log('Copied to public/favicon.ico');

    // Copy to build/installerIcon.ico and build/uninstallerIcon.ico
    fs.writeFileSync(path.join(__dirname, '../build/installerIcon.ico'), buf);
    fs.writeFileSync(path.join(__dirname, '../build/uninstallerIcon.ico'), buf);
    console.log('Copied installerIcon and uninstallerIcon');
  } catch (err) {
    console.error('Error generating ICO:', err);
    process.exit(1);
  }
}

buildIco();

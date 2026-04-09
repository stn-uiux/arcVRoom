import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Correctly navigate from scripts/ to the root directory
const rootDir = path.join(__dirname, '..');
const materialsDir = path.join(rootDir, 'public', 'materials');
const outputFile = path.join(rootDir, 'src', 'material_manifest.json');

try {
  if (!fs.existsSync(materialsDir)) {
    console.log('Materials directory not found at:', materialsDir);
    process.exit(1);
  }

  const files = fs.readdirSync(materialsDir)
    .filter(file => /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(file));

  fs.writeFileSync(outputFile, JSON.stringify(files, null, 2), 'utf8');
  console.log(`Successfully generated manifest with ${files.length} textures.`);
  console.log(`Updated: ${outputFile}`);
} catch (err) {
  console.error('Error generating material manifest:', err);
  process.exit(1);
}

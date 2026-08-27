const fs = require('fs');

// Fix CatalogView.ts
let cat = fs.readFileSync('extension/src/ui/CatalogView.ts', 'utf8');
cat = cat.replace('private apiClient = new ApiClient();', 'constructor(private apiClient: ApiClient) {}');
fs.writeFileSync('extension/src/ui/CatalogView.ts', cat);

// Fix extension.ts
let ext = fs.readFileSync('extension/src/extension.ts', 'utf8');
ext = ext.replace('const catalogProvider = new CatalogViewProvider();', 'const catalogProvider = new CatalogViewProvider(apiClient);');
fs.writeFileSync('extension/src/extension.ts', ext);

const fs = require('fs');
const path = require('path');

function sanitizeApiUrl() {
  return `const getApiUrl = () => {
  let url = import.meta.env.VITE_API_URL || '/api';
  if (url.endsWith('/')) url = url.slice(0, -1);
  if (url.startsWith('http') && !url.endsWith('/api')) url += '/api';
  return url;
};
const API_URL = getApiUrl();`;
}

function walkSync(dir, filelist = []) {
  fs.readdirSync(dir).forEach(file => {
    const dirFile = path.join(dir, file);
    if (fs.statSync(dirFile).isDirectory()) {
      filelist = walkSync(dirFile, filelist);
    } else if (dirFile.endsWith('.ts') || dirFile.endsWith('.tsx')) {
      filelist.push(dirFile);
    }
  });
  return filelist;
}

const files = walkSync(path.join(process.cwd(), 'frontend', 'src'));
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes("const API_URL = import.meta.env.VITE_API_URL || '/api';")) {
    content = content.replace("const API_URL = import.meta.env.VITE_API_URL || '/api';", sanitizeApiUrl());
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated ' + file);
  }
});

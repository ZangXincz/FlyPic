const dbPool = require('./database/dbPool');

const db = dbPool.acquire('C:\\Users\\qingy\\Pictures\\商品图片包');
const rows = db.db.prepare('SELECT id, path, thumbnail_path FROM images LIMIT 5').all();
console.log('Sample images:', JSON.stringify(rows, null, 2));

const countWithThumb = db.db.prepare('SELECT COUNT(*) as count FROM images WHERE thumbnail_path IS NOT NULL').get();
const countTotal = db.db.prepare('SELECT COUNT(*) as count FROM images').get();

console.log(`\nImages with thumbnail: ${countWithThumb.count} / ${countTotal.count}`);

dbPool.release('C:\\Users\\qingy\\Pictures\\商品图片包');

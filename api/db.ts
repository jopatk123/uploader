/**
 * SQLite 数据库初始化与管理
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { POINTS_DATA } from './points-data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据目录：优先使用 DATA_DIR 环境变量（Docker 挂载），否则使用项目下 data 目录
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.sqlite');
const STORAGE_DIR = path.join(DATA_DIR, 'storage');
const TEMP_CHUNK_DIR = path.join(DATA_DIR, 'temp_chunk');

// 确保目录存在
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(STORAGE_DIR, { recursive: true });
fs.mkdirSync(TEMP_CHUNK_DIR, { recursive: true });

// 初始化数据库
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * 初始化表结构与固定点位数据
 */
export function initDatabase() {
  // 点位基础表
  db.exec(`
    CREATE TABLE IF NOT EXISTS point_info (
      id INTEGER PRIMARY KEY,
      city TEXT NOT NULL,
      district TEXT NOT NULL,
      lon REAL NOT NULL,
      lat REAL NOT NULL,
      shore_type TEXT NOT NULL
    )
  `);

  // 点位素材记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS point_material (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      point_id INTEGER NOT NULL UNIQUE,
      img_path TEXT,
      video_path TEXT,
      upload_time DATETIME,
      FOREIGN KEY (point_id) REFERENCES point_info(id)
    )
  `);

  // 迁移：为旧库增加备选素材字段（img_path_alt / video_path_alt）
  migrateAddColumn('point_material', 'img_path_alt', 'TEXT');
  migrateAddColumn('point_material', 'video_path_alt', 'TEXT');

  // 导入140条固定点位数据（如不存在）
  const insertPoint = db.prepare(
    'INSERT OR IGNORE INTO point_info (id, city, district, lon, lat, shore_type) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertMaterial = db.prepare(
    'INSERT OR IGNORE INTO point_material (point_id) VALUES (?)'
  );

  const importAll = db.transaction(() => {
    for (const p of POINTS_DATA) {
      insertPoint.run(p.id, p.city, p.district, p.lon, p.lat, p.shore_type);
      insertMaterial.run(p.id);
    }
  });
  importAll();
}

/**
 * 安全添加列（若已存在则跳过）
 */
function migrateAddColumn(table: string, column: string, type: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    console.log(`[db] 迁移: ${table}.${column} 已添加`);
  }
}

export { db, DATA_DIR, STORAGE_DIR, TEMP_CHUNK_DIR, DB_PATH };

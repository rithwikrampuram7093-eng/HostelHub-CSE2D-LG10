const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("hostelhub.db");

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS residents (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    block TEXT NOT NULL,
    UNIQUE (block, name)
  );

  CREATE TABLE IF NOT EXISTS allotments (
    id INTEGER PRIMARY KEY,
    resident_id INTEGER NOT NULL UNIQUE REFERENCES residents(id),
    room_id INTEGER NOT NULL UNIQUE REFERENCES rooms(id)
  );
`);

module.exports = db;
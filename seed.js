const db = require("./db");

const addRoom = db.prepare(`
  INSERT INTO rooms (name, block)
  VALUES (?, ?)
  ON CONFLICT (block, name) DO NOTHING
`);

addRoom.run("101", "A");
addRoom.run("102", "A");
addRoom.run("201", "B");
addRoom.run("202", "B");

const rooms = db.prepare("SELECT id, name, block FROM rooms ORDER BY id").all();
console.table(rooms);
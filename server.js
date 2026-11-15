const express = require("express");
const db = require("./db");

const app = express();
app.use(express.json());

function positiveInteger(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (!/^[1-9]\d*$/.test(String(value))) return null;

  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

app.get("/", (req, res) => {
  res.send("HostelHub is running!");
});

// List rooms with pagination, block search, and an optional free-room filter.
app.get("/rooms", (req, res) => {
  const page = positiveInteger(req.query.page ?? "1");
  const limit = positiveInteger(req.query.limit ?? "5");

  if (!page || !limit) {
    return res.status(400).json({
      error: "Page and limit must be positive whole numbers."
    });
  }

  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) {
    return res.status(400).json({ error: "Page number is too large." });
  }

  const conditions = [];
  const params = [];

  if (req.query.block !== undefined) {
    const block = cleanText(req.query.block);
    if (!block) {
      return res.status(400).json({ error: "Enter a block name." });
    }
    conditions.push("rooms.block = ? COLLATE NOCASE");
    params.push(block);
  }

  if (req.query.available === "true") {
    conditions.push(
      "NOT EXISTS (SELECT 1 FROM allotments WHERE allotments.room_id = rooms.id)"
    );
  }

  const where = conditions.length ? " WHERE " + conditions.join(" AND ") : "";

  const total = db.prepare(
    `SELECT COUNT(*) AS total FROM rooms${where}`
  ).get(...params).total;

  const data = db.prepare(
    `SELECT id, name, block FROM rooms${where} ORDER BY id LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  res.json({ total, page, data });
});

// Get one room.
app.get("/rooms/:id", (req, res) => {
  const room = db.prepare("SELECT * FROM rooms WHERE id = ?").get(req.params.id);
  if (!room) return res.status(404).json({ error: "Room not found." });
  res.json(room);
});

// Add a room.
app.post("/rooms", (req, res) => {
  const name = cleanText(req.body?.name);
  const block = cleanText(req.body?.block);

  if (!name || !block) {
    return res.status(400).json({ error: "Room name and block are required." });
  }

  const result = db.prepare(
    "INSERT INTO rooms (name, block) VALUES (?, ?)"
  ).run(name, block);

  res.status(201).json({ id: Number(result.lastInsertRowid), name, block });
});

// Update a room.
app.put("/rooms/:id", (req, res) => {
  const name = cleanText(req.body?.name);
  const block = cleanText(req.body?.block);

  if (!name || !block) {
    return res.status(400).json({ error: "Room name and block are required." });
  }

  const result = db.prepare(
    "UPDATE rooms SET name = ?, block = ? WHERE id = ?"
  ).run(name, block, req.params.id);

  if (!result.changes) return res.status(404).json({ error: "Room not found." });
  res.json({ id: Number(req.params.id), name, block });
});

// Delete a room.
app.delete("/rooms/:id", (req, res) => {
  const result = db.prepare("DELETE FROM rooms WHERE id = ?").run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Room not found." });
  res.status(204).end();
});

// List residents.
app.get("/residents", (req, res) => {
  res.json(db.prepare("SELECT id, name FROM residents ORDER BY id").all());
});

// Add a resident.
app.post("/residents", (req, res) => {
  const name = cleanText(req.body?.name);
  if (!name) return res.status(400).json({ error: "Resident name is required." });

  const result = db.prepare("INSERT INTO residents (name) VALUES (?)").run(name);
  res.status(201).json({ id: Number(result.lastInsertRowid), name });
});

// Join all three tables to show who occupies each allotted room.
app.get("/allotments", (req, res) => {
  const rows = db.prepare(`
    SELECT a.id, r.name AS resident_name, m.name AS room_name, m.block
    FROM allotments AS a
    JOIN residents AS r ON r.id = a.resident_id
    JOIN rooms AS m ON m.id = a.room_id
    ORDER BY a.id
  `).all();

  res.json(rows);
});

// Allot a room to a resident.
app.post("/allotments", (req, res) => {
  const residentId = positiveInteger(req.body?.resident_id);
  const roomId = positiveInteger(req.body?.room_id);

  if (!residentId || !roomId) {
    return res.status(400).json({
      error: "resident_id and room_id must be positive whole numbers."
    });
  }

  const resident = db.prepare("SELECT id FROM residents WHERE id = ?").get(residentId);
  const room = db.prepare("SELECT id FROM rooms WHERE id = ?").get(roomId);

  if (!resident) return res.status(404).json({ error: "Resident not found." });
  if (!room) return res.status(404).json({ error: "Room not found." });

  const result = db.prepare(
    "INSERT INTO allotments (resident_id, room_id) VALUES (?, ?)"
  ).run(residentId, roomId);

  res.status(201).json({
    id: Number(result.lastInsertRowid),
    resident_id: residentId,
    room_id: roomId
  });
});

// Release an allotment so the room becomes available again.
app.delete("/allotments/:id", (req, res) => {
  const result = db.prepare("DELETE FROM allotments WHERE id = ?").run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Allotment not found." });
  res.status(204).end();
});

// Return readable errors for invalid JSON and database conflicts.
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body must be valid JSON." });
  }
  if (err.message.includes("UNIQUE constraint failed: rooms.")) {
    return res.status(409).json({ error: "That room already exists in this block." });
  }
  if (err.message.includes("UNIQUE constraint failed: allotments.")) {
    return res.status(409).json({ error: "The room or resident already has an allotment." });
  }
  if (err.message.includes("FOREIGN KEY constraint failed")) {
    return res.status(409).json({ error: "Release the allotment before deleting the room." });
  }

  console.error(err);
  res.status(500).json({ error: "Server error." });
});

app.listen(3000, () => {
  console.log("HostelHub server started at http://localhost:3000");
});
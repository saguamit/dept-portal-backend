// ===============================
// Department Portal Backend
// Node.js + Express + Supabase (PostgreSQL)
// ===============================

const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Middleware ----------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- Ensure upload folders exist ----------
["uploads", "uploads/syllabus", "uploads/mentors"].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// ---------- PostgreSQL (Supabase) Connection ----------
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

db.query("SELECT 1")
  .then(() => console.log("✅ Supabase DB connected"))
  .catch(err => console.error("❌ DB connection error:", err.message));

// =================================================
// API: GET CLASSES
// =================================================
app.get("/api/classes", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT DISTINCT class_name FROM class_semester_info ORDER BY class_name"
    );
    res.json(result.rows);
  } catch {
    res.status(500).json([]);
  }
});

// =================================================
// API: GET SEMESTERS
// =================================================
app.get("/api/semesters", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT DISTINCT semester FROM class_semester_info WHERE class_name=$1 ORDER BY semester",
      [req.query.class]
    );
    res.json(result.rows);
  } catch {
    res.status(500).json([]);
  }
});

// =================================================
// API: GET SECTIONS
// =================================================
app.get("/api/sections", async (req, res) => {
  try {
    const result = await db.query(
      `
      SELECT DISTINCT section
      FROM class_semester_info
      WHERE class_name=$1
        AND semester=$2
        AND section IS NOT NULL
        AND TRIM(section) <> ''
      `,
      [req.query.class, req.query.semester]
    );
    res.json(result.rows);
  } catch {
    res.status(500).json([]);
  }
});

// =================================================
// API: GET FINAL DETAILS
// =================================================
app.get("/api/details", async (req, res) => {
  const className = req.query.class?.trim();
  const semester = Number(req.query.semester);
  const section = (req.query.section || "").trim();

  try {
    let result;

    if (section) {
      result = await db.query(
        `
        SELECT *
        FROM class_semester_info
        WHERE TRIM(class_name)=$1
          AND semester=$2
          AND TRIM(section)=$3
        LIMIT 1
        `,
        [className, semester, section]
      );
    } else {
      result = await db.query(
        `
        SELECT *
        FROM class_semester_info
        WHERE TRIM(class_name)=$1
          AND semester=$2
          AND (section IS NULL OR TRIM(section)='')
        LIMIT 1
        `,
        [className, semester]
      );
    }

    if (result.rows.length === 0) return res.json(null);
    res.json(result.rows[0]);
  } catch {
    res.status(500).json(null);
  }
});

// =================================================
// FILE UPLOAD SETUP
// =================================================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.fieldname === "syllabus") {
      cb(null, path.join(__dirname, "uploads/syllabus"));
    } else if (file.fieldname === "mentor_photo") {
      cb(null, path.join(__dirname, "uploads/mentors"));
    }
  },
  filename: function (req, file, cb) {
    const safeName = file.originalname.replace(/\s+/g, "_");
    cb(null, Date.now() + "_" + safeName);
  }
});

const upload = multer({ storage });
app.use("/uploads", express.static("uploads"));

// =================================================
// ADMIN: ADD RECORD
// =================================================
app.post(
  "/api/admin/add",
  upload.fields([
    { name: "syllabus", maxCount: 1 },
    { name: "mentor_photo", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const {
        class_name,
        semester,
        section,
        academic_year,
        mentor_name,
        designation,
        contact,
        timetable_link
      } = req.body;

      const syllabusPath = req.files.syllabus
        ? "/uploads/syllabus/" + req.files.syllabus[0].filename
        : null;

      const photoPath = req.files.mentor_photo
        ? "/uploads/mentors/" + req.files.mentor_photo[0].filename
        : null;

     await db.query(
  `
  INSERT INTO public.class_semester_info
  (class_name, semester, section, academic_year,
   mentor_name, designation, contact,
   timetable_link, syllabus_link, mentor_photo)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
  `,
  [
    String(class_name || "").trim(),
    Number(semester),
    String(section || "").trim(),
    String(academic_year || "").trim(),
    String(mentor_name || "").trim(),
    String(designation || "").trim(),
    String(contact || "").trim(),
    timetable_link ? String(timetable_link).trim() : null,
    syllabusPath,
    photoPath
  ]
);


      res.json({ message: "Record added successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Insert failed" });
    }
  }
);

// =================================================
// ADMIN: GET RECORDS
// =================================================
app.get("/api/admin/records", async (req, res) => {
  try {
    const result = await db.query(
      `
      SELECT id, class_name, semester, section,
             mentor_name, designation
      FROM class_semester_info
      ORDER BY class_name, semester
      `
    );
    res.json(result.rows);
  } catch {
    res.status(500).json([]);
  }
});

// =================================================
// ADMIN: UPDATE RECORD
// =================================================
app.put("/api/admin/update/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      class_name,
      semester,
      section,
      academic_year,
      mentor_name,
      designation,
      contact,
      timetable_link
    } = req.body;

    await db.query(
      `
      UPDATE class_semester_info
      SET class_name=$1, semester=$2, section=$3, academic_year=$4,
          mentor_name=$5, designation=$6, contact=$7, timetable_link=$8
      WHERE id=$9
      `,
      [
        class_name?.trim(),
        semester,
        section?.trim() || "",
        academic_year?.trim(),
        mentor_name?.trim(),
        designation?.trim(),
        contact?.trim(),
        timetable_link?.trim(),
        id
      ]
    );

    res.json({ message: "Record updated successfully" });
  } catch {
    res.status(500).json({ error: "Update failed" });
  }
});

// =================================================
// ADMIN: DELETE RECORD
// =================================================
app.delete("/api/admin/delete/:id", async (req, res) => {
  try {
    await db.query(
      "DELETE FROM class_semester_info WHERE id=$1",
      [req.params.id]
    );
    res.json({ message: "Record deleted successfully" });
  } catch {
    res.status(500).json({ error: "Delete failed" });
  }
});

// =================================================
// START SERVER
// =================================================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});


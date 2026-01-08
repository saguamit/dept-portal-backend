// ===============================
// Department Portal Backend
// Node.js + Express + MySQL
// ===============================

const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const multer = require("multer");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Middleware ----------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- MySQL Connection ----------
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});

db.connect(err => {
  if (err) {
    console.error("❌ MySQL connection error:", err.message);
    return;
  }
  console.log("✅ MySQL connected successfully");
});

// =================================================
// API: GET CLASSES
// =================================================
app.get("/api/classes", (req, res) => {
  const sql = "SELECT DISTINCT class_name FROM class_semester_info";
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json([]);
    res.json(result);
  });
});

// =================================================
// API: GET SEMESTERS
// =================================================
app.get("/api/semesters", (req, res) => {
  const sql =
    "SELECT DISTINCT semester FROM class_semester_info WHERE class_name=?";
  db.query(sql, [req.query.class], (err, result) => {
    if (err) return res.status(500).json([]);
    res.json(result);
  });
});

// =================================================
// API: GET SECTIONS
// =================================================
app.get("/api/sections", (req, res) => {
  const sql = `
    SELECT DISTINCT section
    FROM class_semester_info
    WHERE class_name=?
      AND semester=?
      AND section IS NOT NULL
      AND section!=''
  `;
  db.query(
    sql,
    [req.query.class, req.query.semester],
    (err, result) => {
      if (err) return res.status(500).json([]);
      res.json(result);
    }
  );
});

// =================================================
// API: GET FINAL DETAILS
// =================================================
app.get("/api/details", (req, res) => {
  const className = req.query.class?.trim();
  const semester = Number(req.query.semester);
  const section = (req.query.section || "").trim();

  let sql, params;

  if (section) {
    sql = `
      SELECT *
      FROM class_semester_info
      WHERE TRIM(class_name)=?
        AND semester=?
        AND TRIM(section)=?
      LIMIT 1
    `;
    params = [className, semester, section];
  } else {
    sql = `
      SELECT *
      FROM class_semester_info
      WHERE TRIM(class_name)=?
        AND semester=?
        AND (section IS NULL OR TRIM(section)='')
      LIMIT 1
    `;
    params = [className, semester];
  }

  db.query(sql, params, (err, result) => {
    if (err) return res.status(500).json(null);
    if (result.length === 0) return res.json(null);
    res.json(result[0]);
  });
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

// Serve uploaded files
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
  (req, res) => {
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

    const sql = `
      INSERT INTO class_semester_info
      (class_name, semester, section, academic_year,
       mentor_name, designation, contact,
       timetable_link, syllabus_link, mentor_photo)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `;

    db.query(
      sql,
      [
        class_name?.trim(),
        semester,
        section?.trim() || "",
        academic_year?.trim(),
        mentor_name?.trim(),
        designation?.trim(),
        contact?.trim(),
        timetable_link?.trim(),
        syllabusPath,
        photoPath
      ],
      err => {
        if (err) return res.status(500).json({ error: "Insert failed" });
        res.json({ message: "Record added successfully" });
      }
    );
  }
);

// =================================================
// ADMIN: GET RECORDS
// =================================================
app.get("/api/admin/records", (req, res) => {
  const sql = `
    SELECT id, class_name, semester, section,
           mentor_name, designation
    FROM class_semester_info
    ORDER BY class_name, semester
  `;
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json([]);
    res.json(result);
  });
});

// =================================================
// ADMIN: UPDATE RECORD
// =================================================
app.put("/api/admin/update/:id", (req, res) => {
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

  const sql = `
    UPDATE class_semester_info
    SET class_name=?, semester=?, section=?, academic_year=?,
        mentor_name=?, designation=?, contact=?, timetable_link=?
    WHERE id=?
  `;

  db.query(
    sql,
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
    ],
    err => {
      if (err) return res.status(500).json({ error: "Update failed" });
      res.json({ message: "Record updated successfully" });
    }
  );
});

// =================================================
// ADMIN: DELETE RECORD
// =================================================
app.delete("/api/admin/delete/:id", (req, res) => {
  db.query(
    "DELETE FROM class_semester_info WHERE id=?",
    [req.params.id],
    err => {
      if (err) return res.status(500).json({ error: "Delete failed" });
      res.json({ message: "Record deleted successfully" });
    }
  );
});

// =================================================
// START SERVER
// =================================================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

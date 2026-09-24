const debug = require("debug")("blogt-api:posts-route");

const express = require("express");
const router = express.Router();

const path = require("path");
const fs = require("fs").promises;
const postsDir = path.join(__dirname, "..", "posts");
debug("Posts directory:", postsDir);

const MEDIA_BASE = process.env.MEDIA_BASE || "https://objects.ekskog.net";

const {
  getPostsArray,
  getPostsFrom,
  formatDate,
  updateTagsIndexForPost,
  getSortedDates,
  getNext,
  getPrev,
  parseBlogEntry,
} = require("../utils/utils");

// GET LATEST 10 POSTS
router.get("/", async (req, res) => {
  try {
    const dates = await getSortedDates();
    if (!dates.length) return res.status(404).json({ error: "No posts found" });
    const latest = dates[dates.length - 1];
    debug(`[MAIN] Latest post date: ${latest}`);
    const postsArray = await getPostsArray(latest);
    res.send(postsArray);
  } catch (err) {
    debug("Error fetching posts: %O", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new post
router.post("/:date", async (req, res) => {
  try {
    const { title, tags = [], content = "" } = req.body;
    const { date } = req.params;

    debug("Editing post for: ", date);

    const [day, month, year] = [
      date.slice(0, 2),
      date.slice(2, 4),
      date.slice(4, 8),
    ];

    const dirPath = path.join(postsDir, year, month);
    debug("Save at: ", dirPath);
    await fs.mkdir(dirPath, { recursive: true });

    const dateLine = `Date: ${date}`;
    const tagsLine = `Tags: ${tags.join(", ")}`;
    const titleLine = `Title: ${title}`;
    const newEntry = [dateLine, tagsLine, titleLine, content].join("\n");

    const filePath = path.join(dirPath, `${day}.md`);
    await fs.writeFile(filePath, newEntry, "utf-8");

    updateTagsIndexForPost(date, title, tags).catch((err) =>
      debug("tag index update failed: %O", err)
    );

    res
      .status(201)
      .json({ message: "Post created", path: `${year}/${month}/${day}.md` });
  } catch (error) {
    debug("Error creating post: %O", error);
    res.status(500).json({ error: "Failed to create post" });
  }
});

// Get structured details for a single post using DDMMYYYY
router.get("/details/:date", async (req, res) => {
  const { date } = req.params;
  debug("Details request for date:", date);

  const [day, month, year] = [
    date.slice(0, 2),
    date.slice(2, 4),
    date.slice(4, 8),
  ];
  const filePath = path.join(postsDir, year, month, `${day}.md`);
  debug("File path:", filePath);

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = await parseBlogEntry(raw);

    const [prev, next] = await Promise.all([getPrev(date), getNext(date)]);

    const imageUrl = `${MEDIA_BASE}/blotpix/${year}/${month}/${day}.jpeg`;
    const blogEntry = {
      date: parsed.date,
      title: parsed.title,
      tags: parsed.tags,
      content: parsed.content,
      htmlContent: null,
      prev,
      next,
      imageUrl,
    };

    res.json(blogEntry);
  } catch (error) {
    debug("Error reading post file: %O", error);
    if (error.code === "ENOENT") {
      return res.status(404).json({ error: "Post not found" });
    }
    res.status(500).json({ error: "Failed to load post" });
  }
});

// Update an existing post using DDMMYYYY
router.put("/:date", async (req, res) => {
  let { date } = req.params;
  debug("Update request for date:", date);

  const { title, tags = [], content = "" } = req.body;
  debug("Update data:", { date, title, tags, content });

  if (!title) {
    return res.status(400).json({ error: "title is required" });
  }
  let normalizedTags = tags;
  if (!Array.isArray(normalizedTags) && typeof normalizedTags === "string") {
    normalizedTags = normalizedTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(normalizedTags) || normalizedTags.length === 0) {
    return res
      .status(400)
      .json({ error: "tags must be a non-empty array or CSV string" });
  }
  const [, day, month, year] = date.match(/(\d{2})(\d{2})(\d{4})/);
  const filePath = path.join(postsDir, year, month, `${day}.md`);
  debug("File path:", filePath);

  try {
    await fs.access(filePath);

    const dateLine = `Date: ${date}`;
    const tagsLine = `Tags: ${normalizedTags.join(", ")}`;
    const titleLine = `Title: ${title}`;
    const body = [dateLine, tagsLine, titleLine, content].join("\n");

    await fs.writeFile(filePath, body, "utf-8");
    await updateTagsIndexForPost(`${day}${month}${year}`, title, normalizedTags);

    const ddmmyyyy = `${day}${month}${year}`;
    const [prev, next] = await Promise.all([getPrev(ddmmyyyy), getNext(ddmmyyyy)]);

    const imageUrl = `${MEDIA_BASE}/blotpix/${year}/${month}/${day}.jpeg`;

    res.json({
      date,
      title,
      tags,
      content,
      htmlContent: null,
      prev,
      next,
      imageUrl,
    });
  } catch (error) {
    debug("Error updating post: %O", error);
    if (error.code === "ENOENT") {
      return res.status(404).json({ error: "Post not found" });
    }
    res.status(500).json({ error: "Failed to update post" });
  }
});

/**
 * GET /post/from/:startDate
 *
 * Same feed-pagination semantics as `GET /posts/from/:startDate` (both delegate to
 * `getPostsFrom` in `utils/utils.js`). `/posts/from/` is the path the blog feed uses;
 * this alias is kept for compatibility.
 */
router.get("/from/:startDate", async (req, res) => {
  const { startDate } = req.params;
  debug("[MAIN] Posts from date:", startDate);

  if (!/^\d{8}$/.test(startDate)) {
    return res.status(400).json({ error: "Invalid date format. Use DDMMYYYY." });
  }

  try {
    const postsArray = await getPostsFrom(startDate);

    if (!postsArray.length) {
      return res.status(404).json({ error: "No posts found" });
    }

    res.send(postsArray);
  } catch (err) {
    debug("Error fetching posts from date: %O", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:dateString", async (req, res) => {
  const { dateString } = req.params;

  if (!/^\d{8}$/.test(dateString)) {
    return res.status(400).send("Invalid date format. Use DDMMYYYY.");
  }

  const day = dateString.slice(0, 2);
  const month = dateString.slice(2, 4);
  const year = dateString.slice(4, 8);

  let filePath = path.join(postsDir, year, month, `${day}.md`);
  debug("File path:", filePath);

  const postsArray = [];

  try {
    const data = await fs.readFile(filePath, "utf-8");
    postsArray.push(data);
    res.send(postsArray);
  } catch (err) {
    debug("Error reading post file: %O", err);
    res.status(404).send("Post not found");
  }
});

module.exports = router;

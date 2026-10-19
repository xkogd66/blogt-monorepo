var express = require("express");
var router = express.Router();

const path = require("path");
const fs = require("fs").promises;
const { ddmmyyyyToSortKey } = require("../utils/utils");
var debug =require("debug")("blogt-api:tags-route");

let filePath = path.join(__dirname, "..", "posts", "tags_index.json");
debug(`[routes] tags index path: ${filePath}`);

// GET /tags/:tagName -> [{date, title}] newest-first, deduped by date.
// Case-insensitive substring match against tag names ("leeves" hits both
// "freeleeves" and "free leeves town loop"); no match -> [].
// Backs the blogtv "search by tag" page.
router.get("/:tagName", async (req, res) => {
  var { tagName } = req.params;
  tagName = decodeURIComponent(tagName); // Decode the tag name to handle multi-word and special characters

  const normalizedTag = tagName.toLowerCase().trim();
  try {
    const tagsIndexRaw = await fs.readFile(filePath, "utf-8");
    const tagIndex = JSON.parse(tagsIndexRaw);
    const byDate = new Map();
    if (normalizedTag) {
      for (const [tag, posts] of Object.entries(tagIndex)) {
        if (tag.includes(normalizedTag)) posts.forEach((p) => byDate.set(p.date, p));
      }
    }
    let postFiles = [...byDate.values()].sort(
      (a, b) => ddmmyyyyToSortKey(b.date) - ddmmyyyyToSortKey(a.date)
    );
    debug(`[routes] found ${postFiles.length} occurrences of ${tagName}`);

    res.send(postFiles);
  } catch (error) {
    console.error("Error reading tags index:", error);
    res.status(500).send("Failed to fetch tag data");
  }
});

module.exports = router;

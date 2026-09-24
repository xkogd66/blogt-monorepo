const debug = require("debug")("blogt-api:utils");
const path = require("path");
const fs = require("fs").promises;
const postsDir = path.join(__dirname, "..", "posts");

let _sortedDates = null;
let _loadingDates = null;

const ddmmyyyyToSortKey = (d) =>
  parseInt(`${d.slice(4)}${d.slice(2, 4)}${d.slice(0, 2)}`, 10);

async function loadSortedDates() {
  const result = [];
  const years = await fs.readdir(postsDir);
  for (const year of years) {
    const yearPath = path.join(postsDir, year);
    if (!(await fs.stat(yearPath)).isDirectory()) continue;
    const months = await fs.readdir(yearPath);
    for (const month of months) {
      const monthPath = path.join(yearPath, month);
      if (!(await fs.stat(monthPath)).isDirectory()) continue;
      const days = await fs.readdir(monthPath);
      for (const dayFile of days) {
        if (!dayFile.endsWith(".md")) continue;
        const day = dayFile.slice(0, 2);
        result.push(`${day}${month}${year}`);
      }
    }
  }
  result.sort((a, b) => ddmmyyyyToSortKey(a) - ddmmyyyyToSortKey(b));
  return result;
}

async function getSortedDates() {
  if (_sortedDates) return _sortedDates;
  if (!_loadingDates) {
    _loadingDates = loadSortedDates().then((d) => {
      _sortedDates = d;
      _loadingDates = null;
      return d;
    });
  }
  return _loadingDates;
}

function invalidateDateCache() {
  _sortedDates = null;
  _loadingDates = null;
}

const findLatestPost = async () => {
  let latestPostDate = null;
  let latestPostPath = null;

  try {
    const years = await fs.readdir(postsDir);
    for (const year of years) {
      const yearPath = path.join(postsDir, year);
      if (!(await fs.stat(yearPath)).isDirectory()) continue;

      const monthsDir = path.join(postsDir, year);
      const months = await fs.readdir(monthsDir);

      for (const month of months) {
        const monthPath = path.join(monthsDir, month);
        if (!(await fs.stat(monthPath)).isDirectory()) continue;

        const daysDir = path.join(monthsDir, month);
        const days = await fs.readdir(daysDir);

        for (const day of days) {
          const dayRegex = /^(0[1-9]|[12][0-9]|3[01])\.md$/;
          if (!dayRegex.test(day)) continue;
          if (!day.endsWith(".md")) continue;

          const postPath = path.join(year, month, day);
          const dateParts = postPath.split("/");
          const postDate = new Date(
            `${dateParts[0]}-${dateParts[1]}-${dateParts[2].replace(".md", "")}`
          );

          if (!latestPostDate || postDate > latestPostDate) {
            latestPostDate = postDate;
            latestPostPath = postPath;
          }
        }
      }
    }

    return { latestPostPath, latestPostDate };
  } catch (error) {
    throw new Error("Could not retrieve post files");
  }
};

async function getNext(dateString) {
  const dates = await getSortedDates();
  const idx = dates.indexOf(dateString);
  return idx >= 0 && idx < dates.length - 1 ? dates[idx + 1] : undefined;
}

async function getPrev(dateString) {
  const dates = await getSortedDates();
  const idx = dates.indexOf(dateString);
  return idx > 0 ? dates[idx - 1] : undefined;
}

const formatDate = async (dateString) => {
  const date = new Date(dateString);

  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = date.getUTCDate().toString().padStart(2, "0");

  let formatted = `${day}${month}${year}`;
  return formatted;
};

/**
 * Resolves a DDMMYYYY request to the feed page that starts at (or below) it.
 *
 * The feed pages backwards by passing the date of the oldest post a client already
 * has. That cursor may be any calendar date (including days with no post), so it has
 * to be snapped onto a date that actually holds a post before `getPostsArray` can
 * walk back from it.
 *
 * Returns the date to start the batch at, or `null` when there is nothing to serve
 * (empty archive). Returns:
 *  - the requested date itself when it is a real post date (start the batch there);
 *  - the newest post strictly *older* than the request when the request falls between
 *    posts or on a gap date (the client cannot have seen that older post yet);
 *  - the archive tail when the request predates every post, so a cursor that has run
 *    off the end still yields the last page instead of dead-ending.
 */
async function resolveFeedStart(requestedDate) {
  const dates = await getSortedDates();
  if (!dates.length) return null;

  const requestedKey = ddmmyyyyToSortKey(requestedDate);
  // `dates` is ascending, so the last date <= the request is the newest match.
  let anchor = null;
  for (const date of dates) {
    if (ddmmyyyyToSortKey(date) <= requestedKey) anchor = date;
    else break;
  }

  // Request predates every post: serve the tail (oldest page) rather than nothing.
  if (!anchor) return dates[0];

  // Gap date or a date between posts: the request is not itself a post, so the batch
  // must start strictly below it — the client has not seen those older posts yet.
  if (anchor !== requestedDate) return getPrev(anchor);

  // Exact post date: start the batch here (that post is the boundary the caller has).
  return anchor;
}

/**
 * Returns up to `postsPerPage` posts, newest first, starting at (or strictly below)
 * `requestedDate` (DDMMYYYY) — see `resolveFeedStart` for the resolution rules.
 *
 * Pass the date of the oldest post already rendered as `requestedDate` and the next
 * batch continues below it, so consecutive batches are contiguous and never repeat a
 * boundary post.
 */
const getPostsFrom = async (requestedDate, postsPerPage = 10) => {
  const start = await resolveFeedStart(requestedDate);
  if (!start) return [];

  return getPostsArray(start, postsPerPage);
};

const getPostsArray = async (dateString, postsPerPage = 10) => {
  try {
    const postsArray = [];

    for (let i = 0; i < postsPerPage; i++) {
      const day = dateString.slice(0, 2);
      const month = dateString.slice(2, 4);
      const year = dateString.slice(4, 8);
      let filePath = path.join(postsDir, year, month, `${day}.md`);
      debug("File path:", filePath);

      try {
        const data = await fs.readFile(filePath, "utf-8");
        postsArray.push(data);
        dateString = await getPrev(dateString);
        if (!dateString) break;
      } catch (err) {
        debug(err);
        dateString = await getPrev(dateString);
        if (!dateString) break;
      }
    }
    return postsArray;
  } catch (error) {
    debug("Error fetching posts:", error);
    return [];
  }
};

async function updateTagsIndexForPost(date, title, tags) {
  const indexPath = path.join(postsDir, "tags_index.json");
  let index = {};
  try {
    const raw = await fs.readFile(indexPath, "utf-8");
    index = JSON.parse(raw);
  } catch (err) {
    if (err.code !== "ENOENT") debug("tags_index.json read/parse error: %O", err);
  }

  for (const tag of Object.keys(index)) {
    index[tag] = index[tag].filter((e) => e.date !== date);
    if (index[tag].length === 0) delete index[tag];
  }

  const normalizedTags = tags.map((t) => t.toLowerCase()).filter(Boolean);
  for (const tag of normalizedTags) {
    if (!index[tag]) index[tag] = [];
    index[tag].push({ date, title });
    index[tag].sort((a, b) => ddmmyyyyToSortKey(b.date) - ddmmyyyyToSortKey(a.date));
  }

  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");
  invalidateDateCache();
}

async function updateTagsIndex() {
  const index = {};

  const years = await fs.readdir(postsDir);
  for (const year of years) {
    const yearPath = path.join(postsDir, year);
    if (!(await fs.stat(yearPath)).isDirectory()) continue;

    const months = await fs.readdir(yearPath);
    for (const month of months) {
      const monthPath = path.join(yearPath, month);
      if (!(await fs.stat(monthPath)).isDirectory()) continue;

      const days = await fs.readdir(monthPath);
      for (const dayFile of days) {
        if (!dayFile.endsWith(".md")) continue;

        const day = dayFile.slice(0, 2);
        const date = `${day}${month}${year}`;
        const filePath = path.join(monthPath, dayFile);
        const fileContents = await fs.readFile(filePath, "utf-8");
        const parsed = await parseBlogEntry(fileContents);
        const tags = (parsed.tags || [])
          .map((t) => t.toLowerCase())
          .filter(Boolean);
        const title = (parsed.title || "").trim();

        for (const tag of tags) {
          if (!index[tag]) index[tag] = [];
          index[tag].push({ date, title });
        }
      }
    }
  }

  for (const tag of Object.keys(index)) {
    index[tag].sort((a, b) => ddmmyyyyToSortKey(b.date) - ddmmyyyyToSortKey(a.date));
  }

  await fs.writeFile(
    path.join(postsDir, "tags_index.json"),
    JSON.stringify(index, null, 2),
    "utf-8"
  );

  return index;
}

async function parseBlogEntry(blob) {
  const lines = blob.split("\n");

  let title = "";
  let tags = [];
  let date = "";

  let metadataEndIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") {
      metadataEndIndex = i + 1;
      break;
    }

    const titleMatch = line.match(/^Title:\s*(.*)/i);
    if (titleMatch) {
      title = titleMatch[1].trim();
      metadataEndIndex = i + 1;
      continue;
    }

    const tagsMatch = line.match(/^Tags:\s*(.*)/i);
    if (tagsMatch) {
      tags = tagsMatch[1]
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      metadataEndIndex = i + 1;
      continue;
    }

    const dateMatch = line.match(/^Date:\s*(.*)/i);
    if (dateMatch) {
      date = dateMatch[1].trim();
      metadataEndIndex = i + 1;
      continue;
    }

    metadataEndIndex = i;
    break;
  }

  if (metadataEndIndex === 0) metadataEndIndex = Math.min(lines.length, 3);

  const content = lines.slice(metadataEndIndex).join("\n").trim();

  return { title, tags, date, content };
}

module.exports = {
  findLatestPost,
  getNext,
  getPrev,
  getPostsArray,
  getPostsFrom,
  resolveFeedStart,
  formatDate,
  updateTagsIndex,
  updateTagsIndexForPost,
  getSortedDates,
  invalidateDateCache,
  parseBlogEntry,
};

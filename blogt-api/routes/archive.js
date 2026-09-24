const debug = require('debug')('blogt-api:archive-route');
const express = require('express');
const router = express.Router();

const path = require('path');
const fs = require('fs').promises;
const postsDir = path.join(__dirname, '..', 'posts');

const { getPostsFrom } = require('../utils/utils');

/**
 * GET /posts/from/:startDate
 *
 * Returns up to 10 posts, newest first, continuing the feed strictly backwards from
 * `startDate` (DDMMYYYY). This is the pagination primitive behind the blog feed's
 * infinite scroll: pass the date of the oldest post you already have and the next
 * batch continues below it, so no post is ever served twice.
 *
 * `startDate` may be any calendar date — it is snapped to the newest existing post
 * not newer than the request, and a date older than the whole archive returns the
 * archive tail rather than a 404. See `getPostsFrom` in `utils/utils.js`.
 */
router.get('/from/:startDate', async (req, res) => {
	const { startDate } = req.params;
	debug('Posts from date:', startDate);

	if (!/^\d{8}$/.test(startDate)) {
		return res.status(400).json({ error: 'Invalid date format. Use DDMMYYYY.' });
	}

	try {
		const postsArray = await getPostsFrom(startDate);

		if (!postsArray.length) {
			return res.status(404).json({ error: 'No posts found' });
		}

		res.send(postsArray);
	} catch (err) {
		debug('Error fetching posts from date: %O', err);
		res.status(500).json({ error: 'Internal server error' });
	}
});

router.get('/archives', async (req, res) => {
	let filePath = path.join(postsDir, `archive.json`);
	debug('File path:', filePath);

	try {
		const data = await fs.readFile(filePath, 'utf-8');
		const jsonData = JSON.parse(data);
		res.json(jsonData);
	} catch (err) {
		console.error('Error reading archives file:', err);
		res.status(500).send('Failed to fetch archives.');
	}
});

router.get('/buildarchives', async (req, res) => {
	try {
		const buildArchives = async (dir) => {
			const items = await fs.readdir(dir, { withFileTypes: true });
			const structure = {};

			for (const item of items) {
				const itemPath = path.join(dir, item.name);

				if (item.isDirectory()) {
					structure[item.name] = await buildArchives(itemPath);
				} else if (item.isFile() && item.name.endsWith('.md')) {
					const day = path.basename(item.name, '.md');
					if (!structure.files) structure.files = [];
					structure.files.push(day);
				}
			}

			return structure.files ? structure.files : structure;
		};

		const archives = await buildArchives(postsDir);

		const formatArchives = (rawStructure) => {
			const formatted = {};
			for (const year in rawStructure) {
				if (typeof rawStructure[year] === 'object') {
					formatted[year] = {};
					for (const month in rawStructure[year]) {
						if (Array.isArray(rawStructure[year][month])) {
							formatted[year][month] = rawStructure[year][month];
						}
					}
				}
			}
			return formatted;
		};

		const formattedArchives = formatArchives(archives);
		res.json(formattedArchives);
	} catch (err) {
		console.error('Error building archives:', err);
		res.status(500).send('Failed to fetch archives.');
	}
});

module.exports = router;

const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const chokidar = require('chokidar');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

// --- HTTP Server Setup ---
// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));
// Middleware for JSON body parsing
app.use(express.json());

const server = app.listen(PORT, () => {
    console.log(`HTTP Server listening on port ${PORT}`);
});

// --- WebSocket Server Setup ---
const wss = new WebSocket.Server({ server }); // Attach WebSocket server to the HTTP server

wss.on('connection', ws => {
    console.log('Client connected via WebSocket');
    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// Simple "hello world" to confirm backend is running
app.get('/api/hello', (req, res) => {
    res.json({ message: 'Hello from the backend!' });
});

// --- Vault Management ---
let vaultPath = null;
let watcher = null; // Chokidar watcher instance

// Endpoint to set the vault path
app.post('/api/vault/set-path', (req, res) => {
    const { path: newPath } = req.body;
    if (!newPath) {
        return res.status(400).json({ error: 'Path is required' });
    }

    // Basic validation: Check if path exists and is a directory
    fs.stat(newPath, (err, stats) => {
        if (err) {
            console.error(`Error accessing path ${newPath}:`, err);
            return res.status(400).json({ error: `Invalid path: ${err.message}` });
        }
        if (!stats.isDirectory()) {
            return res.status(400).json({ error: 'Path is not a directory' });
        }

        // If watcher exists, close it before setting new path
        if (watcher) {
            watcher.close().then(() => console.log('Previous watcher closed'));
        }

        vaultPath = newPath;
        console.log(`Vault path set to: ${vaultPath}`);

        // Initialize Chokidar watcher
        watcher = chokidar.watch(path.join(vaultPath, '**/*.md'), {
            ignored: /(^|[\/\\])\../, // ignore dotfiles
            persistent: true,
            ignoreInitial: true // Don't fire 'add' events for existing files on startup
        });

        watcher
            .on('add', filePath => {
                console.log(`File ${filePath} has been added`);
                broadcast({ type: 'file-event', event: 'add', filename: path.basename(filePath) });
            })
            .on('change', filePath => {
                console.log(`File ${filePath} has been changed`);
                broadcast({ type: 'file-event', event: 'change', filename: path.basename(filePath) });
            })
            .on('unlink', filePath => {
                console.log(`File ${filePath} has been removed`);
                broadcast({ type: 'file-event', event: 'unlink', filename: path.basename(filePath) });
            })
            .on('error', error => console.error(`Watcher error: ${error}`))
            .on('ready', () => console.log('Initial scan complete. Ready for changes.'));

        res.json({ message: `Vault path set to: ${vaultPath}. Watching for changes.` });
    });
});

// Endpoint to list .md files in the vault
app.get('/api/notes', async (req, res) => {
    if (!vaultPath) {
        return res.status(400).json({ error: 'Vault path not set' });
    }
    try {
        const files = await fs.readdir(vaultPath);
        const mdFiles = files.filter(file => file.endsWith('.md'));
        res.json(mdFiles);
    } catch (error) {
        console.error('Error reading vault directory:', error);
        res.status(500).json({ error: 'Failed to read notes from vault' });
    }
});

// Endpoint to save/update a note
app.post('/api/notes/:noteName', async (req, res) => {
    if (!vaultPath) {
        return res.status(400).json({ error: 'Vault path not set' });
    }

    const noteName = req.params.noteName;
    const { content } = req.body;

    if (typeof content !== 'string') {
        return res.status(400).json({ error: 'Content must be a string' });
    }

    // Basic security: ensure noteName doesn't try to escape the vault path
    if (noteName.includes('..') || noteName.includes('/') || !noteName.endsWith('.md')) {
        return res.status(400).json({ error: 'Invalid note name format. Must end with .md and not contain path traversals.' });
    }

    const filePath = path.join(vaultPath, noteName);

    try {
        // We could check if the file exists first if we only want to update existing ones,
        // but for simplicity, this will also create a new file if it doesn't exist,
        // which can be a feature (creating new notes by saving).
        // However, for a strict "update", an existence check would be fs.pathExists(filePath)

        await fs.writeFile(filePath, content, 'utf-8');
        console.log(`Note saved: ${filePath}`);
        res.json({ message: `Note '${noteName}' saved successfully.` });
    } catch (error) {
        console.error(`Error saving note ${noteName}:`, error);
        res.status(500).json({ error: `Failed to save note: ${noteName}. ${error.message}` });
    }
});

// Endpoint to get the content of a specific note
app.get('/api/notes/:noteName', async (req, res) => {
    if (!vaultPath) {
        return res.status(400).json({ error: 'Vault path not set' });
    }
    const noteName = req.params.noteName;
    // Basic security: ensure noteName doesn't try to escape the vault path (e.g., by containing '..')
    if (noteName.includes('..') || noteName.includes('/')) {
        return res.status(400).json({ error: 'Invalid note name' });
    }

    const filePath = path.join(vaultPath, noteName);

    try {
        // Check if the file actually exists and is within the vault (redundant due to readdir but good practice)
        if (! (await fs.pathExists(filePath)) ) {
            return res.status(404).json({ error: 'Note not found' });
        }
        // Ensure it's a file
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) {
            return res.status(400).json({ error: 'Requested path is not a file' });
        }

        const rawContent = await fs.readFile(filePath, 'utf-8');

        if (noteName.endsWith('.graph.md')) {
            const graphRegex = /```json_graph\s*([\s\S]*?)\s*```/;
            const match = rawContent.match(graphRegex);

            if (match && match[1]) {
                try {
                    const graphData = JSON.parse(match[1]);
                    // Remove the graph block from the markdown content
                    const markdownContent = rawContent.replace(graphRegex, '').trim();
                    return res.json({
                        name: noteName,
                        type: 'graph',
                        graphData: graphData,
                        markdownContent: markdownContent
                    });
                } catch (parseError) {
                    console.error(`Error parsing JSON from graph block in ${noteName}:`, parseError);
                    // Fallback to treating as a regular markdown file if JSON is invalid
                    return res.json({ name: noteName, type: 'markdown', content: rawContent });
                }
            } else {
                // No json_graph block found, treat as regular markdown with a graph extension
                return res.json({ name: noteName, type: 'markdown', content: rawContent });
            }
        } else {
            // Regular .md file
            res.json({ name: noteName, type: 'markdown', content: rawContent });
        }
    } catch (error) {
        console.error(`Error reading note ${noteName}:`, error);
        res.status(500).json({ error: `Failed to read note: ${noteName}` });
    }
});


app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const chokidar = require('chokidar');
const WebSocket = require('ws');
const { google } = require('googleapis'); // Added for Google Drive API
const yaml = require('js-yaml'); // Added for YAML frontmatter parsing

const app = express();
const PORT = process.env.PORT || 3000;

// --- Google Drive API Configuration (Placeholders) ---
// IMPORTANT: These values need to be obtained from Google Cloud Console
// and should be set via environment variables or a secure, gitignored config file.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'YOUR_GOOGLE_CLIENT_SECRET';
// This redirect URI must be registered in your Google Cloud Console credentials
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/drive/auth/google/callback';

const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
);

// Placeholder for storing tokens (in a real app, use a database or secure store)
let googleDriveTokens = null;

// Scopes required for Google Drive API access
const GOOGLE_DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly']; // Start with read-only

// --- Middleware Setup ---
// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));
// Middleware for JSON body parsing - IMPORTANT: Must be before routes that need it
app.use(express.json());

// --- Google Drive Auth Endpoints ---

// Endpoint to initiate OAuth flow
app.get('/api/drive/auth/initiate', (req, res) => {
    if (GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID' || GOOGLE_CLIENT_SECRET === 'YOUR_GOOGLE_CLIENT_SECRET') {
        return res.status(500).json({
            error: 'Google Drive API credentials not configured on the server.',
            message: 'Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.'
        });
    }
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline', // Request a refresh token
        scope: GOOGLE_DRIVE_SCOPES,
    });
    // In a real scenario, you would redirect the user:
    // res.redirect(authUrl);
    // For now, return the URL for the frontend to handle (e.g., open in new tab)
    res.json({ authUrl: authUrl });
});

// Endpoint for Google to redirect back to after user consent
app.get('/api/drive/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) {
        return res.status(400).json({ error: 'Authorization code missing from Google callback.' });
    }
    try {
        // Exchange authorization code for tokens
        // const { tokens } = await oauth2Client.getToken(code);
        // oauth2Client.setCredentials(tokens);
        // googleDriveTokens = tokens; // Store tokens (e.g., in session, database, or a file for server-wide use)

        // For now, just simulate token storage and success
        googleDriveTokens = { access_token: `mock_access_token_for_${code}`, refresh_token: 'mock_refresh_token' };
        oauth2Client.setCredentials(googleDriveTokens); // So the client instance has them for future calls

        console.log('Google Drive tokens obtained (mocked):', googleDriveTokens);
        // res.redirect('/'); // Redirect to the main page or a success page
        res.send(`
            <html>
                <body>
                    <h1>Authentication Successful!</h1>
                    <p>Google Drive connected. You can close this tab/window.</p>
                    <script>
                        // Optionally, inform the main app window if opened via popup
                        // window.opener && window.opener.postMessage('google-auth-success', '*');
                        // setTimeout(() => window.close(), 1000);
                    </script>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('Error exchanging Google auth code for tokens:', error.message);
        res.status(500).json({ error: 'Failed to authenticate with Google Drive.', details: error.message });
    }
});

// --- Search API Endpoint ---
app.get('/api/search/all-notes-content', async (req, res) => {
    if (!vaultPath) {
        return res.status(400).json({ error: 'Vault path not set' });
    }

    try {
        const allFiles = await fs.readdir(vaultPath);
        const notesToProcess = allFiles.filter(file => file.endsWith('.md') || file.endsWith('.graph.md'));

        const processedNotes = [];

        for (const noteName of notesToProcess) {
            const filePath = path.join(vaultPath, noteName); // This is the correct, single declaration
            const originalRawContent = await fs.readFile(filePath, 'utf-8');

            // const filePath = path.join(vaultPath, noteName); // REMOVE THIS DUPLICATE
            const stats = await fs.stat(filePath); // Uses the filePath from above
            const modifiedTime = stats.mtimeMs;

            const { frontmatter, contentAfterFrontmatter } = parseFrontmatter(originalRawContent);
            let textFromFrontmatter = '';
            let indexedTags = [];

            if (frontmatter) {
                // Convert frontmatter object to a searchable string
                // Only include string or array of string values
                Object.entries(frontmatter).forEach(([key, value]) => {
                    if (key === 'tags') {
                        if (typeof value === 'string') {
                            indexedTags.push(`tag_${value.toLowerCase().replace(/\s+/g, '_')}`);
                            textFromFrontmatter += value + ' '; // Also add to general content
                        } else if (Array.isArray(value)) {
                            value.forEach(item => {
                                if (typeof item === 'string') {
                                    indexedTags.push(`tag_${item.toLowerCase().replace(/\s+/g, '_')}`);
                                    textFromFrontmatter += item + ' '; // Also add to general content
                                }
                            });
                        }
                    } else if (typeof value === 'string') {
                        textFromFrontmatter += value + ' ';
                    } else if (Array.isArray(value)) {
                        value.forEach(item => {
                            if (typeof item === 'string') {
                                textFromFrontmatter += item + ' ';
                            }
                        });
                    }
                });
            }

            let mainContentForIndex = contentAfterFrontmatter;
            let graphText = '';

            if (noteName.endsWith('.graph.md')) {
                const graphRegex = /```json_graph\s*([\s\S]*?)\s*```/;
                // Use contentAfterFrontmatter for graph parsing, as frontmatter is already stripped
                const match = contentAfterFrontmatter.match(graphRegex);

                // The markdown part for a graph file is contentAfterFrontmatter with graph block removed
                let markdownPartForGraphFile = contentAfterFrontmatter.replace(graphRegex, '').trim();

                if (match && match[1]) {
                    try {
                        const graphData = JSON.parse(match[1]);
                        if (graphData.nodes && Array.isArray(graphData.nodes)) {
                            graphData.nodes.forEach(node => {
                                if (node.label) graphText += node.label + ' ';
                                if (node.content) graphText += node.content + ' ';
                            });
                        }
                        // content for .graph.md = markdown part (after FM, outside graph) + graph text
                        mainContentForIndex = `${markdownPartForGraphFile} ${graphText}`.trim();
                    } catch (parseError) {
                        console.warn(`Could not parse graph JSON in ${noteName} for search indexing (all-notes): ${parseError.message}. Indexing content after frontmatter.`);
                        // Fallback: mainContentForIndex is already contentAfterFrontmatter
                        // but if graph block was crucial, it might be better to use originalRawContent minus frontmatter block.
                        // For now, contentAfterFrontmatter is the base.
                    }
                } else {
                     // No graph block found, mainContentForIndex is contentAfterFrontmatter
                     mainContentForIndex = contentAfterFrontmatter;
                }
            }
            // Combine frontmatter text with the main content for indexing
            const combinedContentToIndex = `${textFromFrontmatter} ${mainContentForIndex}`.trim();
            processedNotes.push({
                name: noteName,
                content: combinedContentToIndex,
                processedTags: indexedTags,
                modifiedTime: modifiedTime
            });
        }
        res.json(processedNotes);
    } catch (error) {
        console.error('Error fetching all notes content for search:', error);
        res.status(500).json({ error: 'Failed to fetch notes content for search index.' });
    }
});

// API Endpoint to create a new note
app.post('/api/notes/create', async (req, res) => {
    if (!vaultPath) {
        return res.status(400).json({ error: 'Vault path not set' });
    }

    const { filename } = req.body;

    if (!filename || typeof filename !== 'string') {
        return res.status(400).json({ error: 'Filename is required and must be a string.' });
    }

    // Validate filename
    if (!filename.endsWith('.md')) {
        // For now, only .md. Could be extended to .graph.md later.
        return res.status(400).json({ error: 'Filename must end with .md' });
    }
    if (filename.includes('/') || filename.includes('..')) {
        return res.status(400).json({ error: 'Filename cannot contain path traversal characters.' });
    }
    // A more robust validation might check for other invalid characters depending on OS.
    // For example: /[\x00-\x1f\x7f<>:"/\\|?*]+/g

    const sanitizedFilename = path.basename(filename); // Extra safety, though previous checks should cover
    if (sanitizedFilename !== filename) {
         return res.status(400).json({ error: 'Invalid filename characters detected after sanitization.'});
    }


    const filePath = path.join(vaultPath, sanitizedFilename);

    try {
        const exists = await fs.pathExists(filePath);
        if (exists) {
            return res.status(409).json({ error: `File '${sanitizedFilename}' already exists.` });
        }

        // Create the file with some default content (e.g., a title based on filename)
        const title = sanitizedFilename.replace(/\.md$/, ''); // Remove .md for title
        const defaultContent = `# ${title}\n\n`;
        await fs.writeFile(filePath, defaultContent, 'utf-8');

        console.log(`New note created: ${filePath}`);
        res.status(201).json({ message: `Note '${sanitizedFilename}' created successfully.`, filename: sanitizedFilename });

    } catch (error) {
        console.error(`Error creating note ${sanitizedFilename}:`, error);
        res.status(500).json({ error: `Failed to create note '${sanitizedFilename}'. ${error.message}` });
    }
});


// Helper function to parse YAML frontmatter
function parseFrontmatter(rawContent) {
    const frontmatterRegex = /^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]+/;
    const match = rawContent.match(frontmatterRegex);

    if (match && match[1]) {
        try {
            const frontmatter = yaml.load(match[1]);
            const content = rawContent.substring(match[0].length);
            return { frontmatter, contentAfterFrontmatter: content, rawContent };
        } catch (e) {
            console.warn('Failed to parse YAML frontmatter:', e.message);
            // If parsing fails, treat the whole thing as content
            return { frontmatter: null, contentAfterFrontmatter: rawContent, rawContent };
        }
    }
    // No frontmatter found
    return { frontmatter: null, contentAfterFrontmatter: rawContent, rawContent };
}


// --- Google Drive File Operations Endpoints ---

// Endpoint to list files from Google Drive
app.get('/api/drive/list-files', async (req, res) => {
    if (!googleDriveTokens || !googleDriveTokens.access_token) {
        return res.status(401).json({ error: 'Not authenticated with Google Drive. Please connect first.' });
    }
    // Ensure the client has credentials set from the stored tokens
    // This should ideally be done more robustly, e.g., on each API call or via middleware
    if (!oauth2Client.credentials.access_token && googleDriveTokens) {
        oauth2Client.setCredentials(googleDriveTokens);
    }

    try {
        // const drive = google.drive({ version: 'v3', auth: oauth2Client });
        // const response = await drive.files.list({
        //     pageSize: 20, // List up to 20 files/folders
        //     fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink)',
        //     // q: "'root' in parents and trashed = false", // Example: list files in root, not trashed
        //     // To list files in a specific folder: q: "'<FOLDER_ID>' in parents and trashed = false"
        // });
        // res.json(response.data.files || []);

        // Placeholder response as we can't make actual API calls without full setup
        console.log('Attempting to list Google Drive files (mocked response).');
        const mockFiles = [
            { id: 'mock_drive_id_1', name: 'My Presentation.gslides', mimeType: 'application/vnd.google-apps.presentation', webViewLink: '#' },
            { id: 'mock_drive_id_2', name: 'Project Document.gdoc', mimeType: 'application/vnd.google-apps.document', webViewLink: '#' },
            { id: 'mock_drive_id_3', name: 'notes_from_drive.md', mimeType: 'text/markdown', webViewLink: '#' },
            { id: 'mock_drive_id_folder', name: 'My Drive Folder', mimeType: 'application/vnd.google-apps.folder', webViewLink: '#' },
        ];
        res.json(mockFiles);

    } catch (error) {
        console.error('Error listing Google Drive files:', error.message);
        if (error.response && error.response.data && error.response.data.error === 'invalid_grant') {
             // Token might be expired or revoked
            googleDriveTokens = null; // Clear stored tokens
            oauth2Client.setCredentials(null);
             return res.status(401).json({ error: 'Google Drive authentication error (token invalid). Please re-authenticate.', details: error.message });
        }
        res.status(500).json({ error: 'Failed to list files from Google Drive.', details: error.message });
    }
});

// Endpoint to check authentication status
app.get('/api/drive/auth/status', (req, res) => {
    if (googleDriveTokens && googleDriveTokens.access_token) {
        // In a real app, you might also want to check if the access token is expired
        // and use the refresh token if necessary. For now, just check existence.
        res.json({ isAuthenticated: true, message: 'Authenticated with Google Drive.' });
    } else {
        res.json({ isAuthenticated: false, message: 'Not authenticated with Google Drive.' });
    }
});

// --- Global Error Handling Middleware ---
// This should be the last middleware added before app.listen.
// Catches errors from synchronous code in route handlers, or errors passed to next().
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error("Global error handler caught an error:", err.stack || err);

    // If headers have already been sent, delegate to the default Express error handler
    if (res.headersSent) {
        return next(err);
    }

    res.status(err.status || 500).json({
        error: err.message || 'An unexpected server error occurred.',
        // Optionally, include more detail in development, but be cautious in production
        details: process.env.NODE_ENV === 'development' && err.stack ? err.stack : undefined
    });
});

// --- HTTP Server Setup ---
// Note: express.static and express.json were moved to the top of the file.

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

        const originalRawContent = await fs.readFile(filePath, 'utf-8');
        const { frontmatter, contentAfterFrontmatter, rawContent: fullRawContentForEditor } = parseFrontmatter(originalRawContent);

        if (noteName.endsWith('.graph.md')) {
            // Use contentAfterFrontmatter for graph parsing
            const graphRegex = /```json_graph\s*([\s\S]*?)\s*```/;
            const match = contentAfterFrontmatter.match(graphRegex);

            if (match && match[1]) {
                try {
                    const graphData = JSON.parse(match[1]);
                    const markdownContentOnly = contentAfterFrontmatter.replace(graphRegex, '').trim();
                    return res.json({
                        name: noteName,
                        type: 'graph',
                        frontmatter: frontmatter,
                        graphData: graphData,
                        markdownContent: markdownContentOnly, // Markdown after frontmatter AND outside graph block
                        rawContent: fullRawContentForEditor // Full original content for editor
                    });
                } catch (parseError) {
                    console.error(`Error parsing JSON from graph block in ${noteName}:`, parseError);
                    // Fallback: return with frontmatter (if any) and the contentAfterFrontmatter as main content
                    return res.json({
                        name: noteName,
                        type: 'markdown', // Treat as markdown if graph block is broken
                        frontmatter: frontmatter,
                        content: contentAfterFrontmatter,
                        rawContent: fullRawContentForEditor
                    });
                }
            } else {
                // No json_graph block found, treat as regular markdown (but it's a .graph.md file)
                // The content is whatever was after potential frontmatter
                return res.json({
                    name: noteName,
                    type: 'markdown',
                    frontmatter: frontmatter,
                    content: contentAfterFrontmatter,
                    rawContent: fullRawContentForEditor
                });
            }
        } else {
            // Regular .md file
            res.json({
                name: noteName,
                type: 'markdown',
                frontmatter: frontmatter,
                content: contentAfterFrontmatter, // Content after potential frontmatter
                rawContent: fullRawContentForEditor // Full original content for editor
            });
        }
    } catch (error) {
        console.error(`Error reading note ${noteName}:`, error);
        res.status(500).json({ error: `Failed to read note: ${noteName}` });
    }
});

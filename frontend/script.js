document.addEventListener('DOMContentLoaded', () => {
    const vaultPathInput = document.getElementById('vault-path-input');
    const setVaultPathButton = document.getElementById('set-vault-path-button');
    const vaultStatus = document.getElementById('vault-status');
    const notesList = document.getElementById('notes-list');
    const notesListStatus = document.getElementById('notes-list-status');
    const backendStatus = document.getElementById('backend-status');
    const currentNoteTitle = document.getElementById('current-note-title');
    const noteContentDisplay = document.getElementById('note-content-display'); // Now hidden
    const noteContentPreview = document.getElementById('note-content-preview'); // For HTML preview
    const noteContentEdit = document.getElementById('note-content-edit'); // The editor
    const saveNoteButton = document.getElementById('save-note-button');
    const saveStatus = document.getElementById('save-status');
    const graphViewSection = document.getElementById('graph-view-section');
    const graphContainer = document.getElementById('graph-container');
    let visNetwork = null; // To hold the Vis.js Network instance

    let currentOpenNoteName = null; // To keep track of the currently open note for saving
    let currentOpenNoteType = 'markdown'; // 'markdown' or 'graph'

    // Google Drive UI Elements
    const gdriveAuthStatus = document.getElementById('gdrive-auth-status');
    const gdriveConnectButton = document.getElementById('gdrive-connect-button');
    const gdriveFilesContainer = document.getElementById('gdrive-files-container');
    const gdriveFilesList = document.getElementById('gdrive-files-list');
    const gdriveFilesStatus = document.getElementById('gdrive-files-status');

    // Search UI Elements
    const searchInput = document.getElementById('search-input');
    const searchResultsContainer = document.getElementById('search-results-container');
    const searchResultsList = document.getElementById('search-results-list');
    const searchResultsStatus = document.getElementById('search-results-status');

    let lunrIndex = null; // To hold the Lunr.js index instance


    // Test backend connection
    fetch('/api/hello')
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            backendStatus.textContent = `HTTP: ${data.message}`;
        })
        .catch(error => {
            console.error('Error fetching from backend:', error);
            backendStatus.textContent = 'Could not connect to backend HTTP. Is the server running?';
            backendStatus.style.color = 'red';
        });

    // --- WebSocket Setup ---
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}`;
    let socket;

    function connectWebSocket() {
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            console.log('WebSocket connection established');
            backendStatus.textContent += ' | WS Connected';
            backendStatus.style.color = 'green';
        };

        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            console.log('WebSocket message received:', message);

            if (message.type === 'file-event') {
                handleFileEvent(message);
            }
        };

        socket.onclose = () => {
            console.log('WebSocket connection closed. Attempting to reconnect...');
            backendStatus.textContent += ' | WS Disconnected';
            backendStatus.style.color = 'orange';
            // Simple reconnect logic
            setTimeout(connectWebSocket, 5000);
        };

        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            backendStatus.textContent += ' | WS Error';
            backendStatus.style.color = 'red';
            // No need to call connectWebSocket here, onclose will handle it
        };
    }

    connectWebSocket(); // Initial connection attempt

    function handleFileEvent(message) {
        const { event, filename } = message;
        console.log(`File event: ${event} for ${filename}`);
        // Show a small notification to the user
        const notification = document.createElement('div');
        notification.textContent = `File system: '${filename}' was ${event === 'add' ? 'added' : event === 'unlink' ? 'removed' : 'changed'}.`;
        notification.style.position = 'fixed';
        notification.style.bottom = '50px';
        notification.style.left = '20px';
        notification.style.backgroundColor = '#333';
        notification.style.color = 'white';
        notification.style.padding = '10px';
        notification.style.borderRadius = '5px';
        notification.style.zIndex = '1000';
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.remove();
        }, 4000);


        if (event === 'add' || event === 'unlink') {
            fetchAndDisplayNotes(); // Refresh the notes list
        } else if (event === 'change') {
            if (filename === currentOpenNoteName) {
                // The currently open note was changed externally
                // Simple approach: just reload it.
                // Advanced: check if editor is dirty and ask user.
                console.log(`Currently open note '${filename}' changed externally. Reloading.`);
                loadNoteContent(filename);
            }
        }
    }

    // Function to fetch and display notes
    async function fetchAndDisplayNotes() {
        notesList.innerHTML = ''; // Clear current list
        notesListStatus.textContent = 'Loading notes...';
        try {
            const response = await fetch('/api/notes');
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            const notes = await response.json();
            if (notes.length === 0) {
                notesListStatus.textContent = 'No .md files found in the vault.';
            } else {
                notes.forEach(noteName => {
                    const listItem = document.createElement('li');
                    listItem.textContent = noteName;
                    listItem.addEventListener('click', () => loadNoteContent(noteName));
                    notesList.appendChild(listItem);
                });
                notesListStatus.textContent = ''; // Clear status if notes are found
            }
        } catch (error) {
            console.error('Error fetching notes:', error);
            notesListStatus.textContent = `Error: ${error.message}`;
            notesListStatus.style.color = 'red';
        }
    }

    // Event listener for setting vault path
    setVaultPathButton.addEventListener('click', async () => {
        const path = vaultPathInput.value.trim();
        if (!path) {
            vaultStatus.textContent = 'Please enter a vault path.';
            vaultStatus.style.color = 'orange';
            return;
        }

        vaultStatus.textContent = 'Setting vault path...';
        vaultStatus.style.color = '#333';

        try {
            const response = await fetch('/api/vault/set-path', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ path }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `HTTP error! status: ${response.status}`);
            }

            vaultStatus.textContent = result.message;
            vaultStatus.style.color = 'green';
            // After setting vault, fetch and display notes
            await fetchAndDisplayNotes();
            // After notes are listed, build the search index
            await buildSearchIndex();

        } catch (error) {
            console.error('Error setting vault path:', error);
            vaultStatus.textContent = `Error: ${error.message}`;
            vaultStatus.style.color = 'red';
            notesList.innerHTML = ''; // Clear notes list on error
            notesListStatus.textContent = 'Vault path not set or invalid.';
        }
    });

    // Initial state for notes list
    notesListStatus.textContent = 'Set vault path to see notes.';

    // Function to load and display a single note's content
    async function loadNoteContent(noteName) {
        currentOpenNoteName = null; // Reset while loading
        currentOpenNoteType = 'markdown'; // Default to markdown
        saveStatus.textContent = ''; // Clear save status
        saveStatus.className = 'status-message';
        currentNoteTitle.textContent = `Loading ${noteName}...`;
        noteContentEdit.value = 'Fetching content...';
        noteContentPreview.innerHTML = '<p>Fetching preview...</p>';
        noteContentDisplay.textContent = ''; // Clear the hidden static display
        graphViewSection.style.display = 'none'; // Hide graph section by default
        if (visNetwork) {
            visNetwork.destroy(); // Destroy previous graph instance if any
            visNetwork = null;
        }


        try {
            const response = await fetch(`/api/notes/${encodeURIComponent(noteName)}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            const noteData = await response.json();

            currentNoteTitle.textContent = noteData.name;
            currentOpenNoteName = noteData.name;
            currentOpenNoteType = noteData.type || 'markdown';

            if (currentOpenNoteType === 'graph') {
                noteContentEdit.value = noteData.markdownContent + "\n\n```json_graph\n" + JSON.stringify(noteData.graphData, null, 2) + "\n```"; // Show full content in editor

                if (typeof marked === 'function') {
                    noteContentPreview.innerHTML = marked.parse(noteData.markdownContent);
                } else {
                    noteContentPreview.innerHTML = '<p style="color:red;">Error: Markdown parser (marked.js) not loaded.</p>';
                }

                if (noteData.graphData && typeof vis !== 'undefined') {
                    graphViewSection.style.display = 'block';
                    const nodes = new vis.DataSet(noteData.graphData.nodes);
                    const edges = new vis.DataSet(noteData.graphData.edges);
                    const data = { nodes: nodes, edges: edges };
                    const options = {
                        physics: {
                            stabilization: true,
                            barnesHut: {
                                gravitationalConstant: -10000,
                                springConstant: 0.002,
                                springLength: 150
                            }
                        },
                        interaction: {
                            tooltipDelay: 200,
                            hideEdgesOnDrag: true
                        },
                        nodes: {
                            shape: 'ellipse', // Default shape
                            font: {
                                size: 14,
                                face: 'arial'
                            }
                        },
                        edges: {
                            font: {
                                size: 12,
                                face: 'arial',
                                align: 'horizontal'
                            },
                            arrows: {
                                to: { enabled: true, scaleFactor: 1 }
                            },
                            smooth: {
                                type: 'continuous'
                            }
                        }
                    };
                    visNetwork = new vis.Network(graphContainer, data, options);
                } else {
                    graphContainer.innerHTML = '<p style="color:red;">Could not load graph data or Vis.js library.</p>';
                }

            } else { // 'markdown' type
                noteContentEdit.value = noteData.content;
                if (typeof marked === 'function') {
                    noteContentPreview.innerHTML = marked.parse(noteData.content);
                } else {
                    noteContentPreview.innerHTML = '<p style="color:red;">Error: Markdown parser (marked.js) not loaded.</p>';
                }
                graphViewSection.style.display = 'none';
            }

        } catch (error) {
            console.error(`Error loading note ${noteName}:`, error);
            currentNoteTitle.textContent = `Error loading ${noteName}`;
            noteContentEdit.value = `Failed to load content: ${error.message}`;
            noteContentPreview.innerHTML = `<p style="color:red;">Failed to load preview: ${error.message}</p>`;
            currentOpenNoteName = null;
            graphViewSection.style.display = 'none';
        }
    }

    // Event listener for real-time Markdown editing
    noteContentEdit.addEventListener('input', () => {
        saveStatus.textContent = ''; // Clear save status on edit
        saveStatus.className = 'status-message';

        const currentMarkdown = noteContentEdit.value;

        if (currentOpenNoteType === 'graph') {
            // For graph files, try to extract markdown part for preview
            // This is a simplified approach; a more robust parser would be needed for live graph editing
            const graphRegex = /```json_graph\s*([\s\S]*?)\s*```/;
            const markdownPart = currentMarkdown.replace(graphRegex, '').trim();
            if (typeof marked === 'function') {
                noteContentPreview.innerHTML = marked.parse(markdownPart);
            }
            // Live updating of the vis.js graph from editor changes is complex and deferred to an "edit graph" feature.
        } else { // 'markdown'
            if (typeof marked === 'function') {
                noteContentPreview.innerHTML = marked.parse(currentMarkdown);
            }
        }
    });

    // Event listener for saving the note
    saveNoteButton.addEventListener('click', async () => {
        if (!currentOpenNoteName) {
            saveStatus.textContent = 'No note is currently open to save.';
            saveStatus.className = 'status-message error';
            return;
        }

        const contentToSave = noteContentEdit.value;
        saveStatus.textContent = 'Saving...';
        saveStatus.className = 'status-message';

        try {
            const response = await fetch(`/api/notes/${encodeURIComponent(currentOpenNoteName)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ content: contentToSave }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `HTTP error! status: ${response.status}`);
            }

            saveStatus.textContent = result.message;
            saveStatus.className = 'status-message success';
        } catch (error) {
            console.error('Error saving note:', error);
            saveStatus.textContent = `Error: ${error.message}`;
            saveStatus.className = 'status-message error';
        }

        // Optionally, clear status after a few seconds
        setTimeout(() => {
            if (saveStatus.textContent !== 'Saving...') { // Don't clear if another save started
                 saveStatus.textContent = '';
                 saveStatus.className = 'status-message';
            }
        }, 5000);
    });

    // --- Google Drive UI Logic ---
    async function checkGDriveAuthStatus() {
        try {
            gdriveAuthStatus.innerHTML = '<p>Status: Checking...</p>';
            const response = await fetch('/api/drive/auth/status');
            const data = await response.json();

            if (data.isAuthenticated) {
                gdriveAuthStatus.innerHTML = `<p style="color: green;">Status: Connected to Google Drive. (${data.message || ''})</p>`;
                gdriveConnectButton.style.display = 'none';
                gdriveFilesContainer.style.display = 'block';
                fetchGDriveFiles();
            } else {
                gdriveAuthStatus.innerHTML = `<p style="color: orange;">Status: Not connected. (${data.message || ''})</p>`;
                gdriveConnectButton.style.display = 'block';
                gdriveFilesContainer.style.display = 'none';
            }
        } catch (error) {
            console.error('Error checking Google Drive auth status:', error);
            gdriveAuthStatus.innerHTML = '<p style="color: red;">Status: Error checking connection.</p>';
            gdriveConnectButton.style.display = 'block'; // Show button to allow retry
        }
    }

    gdriveConnectButton.addEventListener('click', async () => {
        try {
            gdriveAuthStatus.innerHTML = '<p>Status: Initiating connection...</p>';
            const response = await fetch('/api/drive/auth/initiate');
            const data = await response.json();

            if (response.ok && data.authUrl) {
                gdriveAuthStatus.innerHTML = '<p>Status: Redirecting to Google for authentication... Please follow the instructions in the new tab/window.</p>';
                // Open the auth URL in a new tab. User will be redirected to /api/drive/auth/google/callback
                // which should then ideally close itself or notify this page.
                // For now, we'll rely on polling or manual refresh after user completes auth.
                const authWindow = window.open(data.authUrl, '_blank', 'width=600,height=700');

                // Basic polling to check status after a short while, assuming user completes auth
                // A more robust solution would use window.postMessage from the callback page or server-sent events.
                let pollCount = 0;
                const maxPolls = 12; // Poll for 2 minutes (12 * 10s)
                const pollInterval = setInterval(async () => {
                    pollCount++;
                    const statusResponse = await fetch('/api/drive/auth/status');
                    const statusData = await statusResponse.json();
                    if (statusData.isAuthenticated || (authWindow && authWindow.closed) || pollCount >= maxPolls) {
                        clearInterval(pollInterval);
                        checkGDriveAuthStatus(); // Refresh UI based on final status
                        if (authWindow && !authWindow.closed) {
                           // authWindow.close(); // Close if still open and we got a status or timed out
                        }
                    }
                }, 10000); // Poll every 10 seconds

            } else {
                throw new Error(data.error || 'Failed to get authentication URL.');
            }
        } catch (error) {
            console.error('Error initiating Google Drive connection:', error);
            gdriveAuthStatus.innerHTML = `<p style="color: red;">Status: Error initiating connection: ${error.message}</p>`;
        }
    });

    async function fetchGDriveFiles() {
        gdriveFilesStatus.textContent = 'Loading Drive files...';
        gdriveFilesList.innerHTML = '';
        try {
            const response = await fetch('/api/drive/list-files');
            if (!response.ok) {
                const errorData = await response.json();
                 // If 401, it might mean tokens are bad, so re-check auth status
                if (response.status === 401) {
                    checkGDriveAuthStatus();
                }
                throw new Error(errorData.error || `HTTP Error: ${response.status}`);
            }
            const files = await response.json();
            if (files.length === 0) {
                gdriveFilesStatus.textContent = 'No files found or accessible in Google Drive.';
            } else {
                files.forEach(file => {
                    const listItem = document.createElement('li');
                    listItem.textContent = `${file.name} (${file.mimeType})`;
                    // Add click listener later for handling drive files [[drive://file.id]]
                    // listItem.addEventListener('click', () => handleDriveFileClick(file.id, file.name));
                    gdriveFilesList.appendChild(listItem);
                });
                gdriveFilesStatus.textContent = ''; // Clear status
            }
        } catch (error) {
            console.error('Error fetching Google Drive files:', error);
            gdriveFilesStatus.textContent = `Error: ${error.message}`;
            gdriveFilesStatus.style.color = 'red';
        }
    }

    // Initial check for Google Drive Auth Status
    checkGDriveAuthStatus();

    // --- Search Indexing Logic ---
    async function buildSearchIndex() {
        if (!vaultPathInput.value) { // Or some other check if vault is truly set
            console.log("Vault path not set, skipping search index build.");
            lunrIndex = null; // Ensure index is cleared if vault is not set
            // Optionally clear search UI if vault becomes unset
            searchInput.value = '';
            searchResultsContainer.style.display = 'none';
            searchResultsList.innerHTML = '';
            searchResultsStatus.textContent = '';
            return;
        }

        console.log("Building search index...");
        searchResultsStatus.textContent = "Building search index...";
        searchResultsContainer.style.display = 'block'; // Show container while building

        try {
            const response = await fetch('/api/search/all-notes-content');
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP Error: ${response.status}`);
            }
            const notesData = await response.json();

            if (typeof lunr === 'undefined') {
                console.error("Lunr.js not loaded!");
                searchResultsStatus.textContent = "Error: Search library not loaded.";
                return;
            }

            lunrIndex = lunr(function () {
                this.ref('name'); // Document reference (filename)
                this.field('name', { boost: 10 }); // Boost filename matches
                this.field('content');

                notesData.forEach(function (doc) {
                    this.add(doc);
                }, this);
            });
            console.log("Search index built successfully.");
            searchResultsStatus.textContent = `Indexed ${notesData.length} notes. Ready to search.`;
            // Keep search results container visible if index is built, but clear list
            searchResultsList.innerHTML = '';
            if (searchInput.value === '') { // Only hide if search input is empty
                 // searchResultsStatus.textContent = 'Ready to search.'; // More accurate
            }


        } catch (error) {
            console.error('Error building search index:', error);
            lunrIndex = null;
            searchResultsStatus.textContent = `Error building search index: ${error.message}`;
            searchResultsStatus.style.color = 'red';
        }
    }

    // Modify the setVaultPathButton event listener to call buildSearchIndex
    // (This is an existing listener, we need to find it and add the call)
    // The original call to fetchAndDisplayNotes() is fine to keep.
    // We will find the successful vault set part and add buildSearchIndex() there.


    // --- Search Execution & Display Logic ---
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim();

        if (!lunrIndex) {
            searchResultsStatus.textContent = "Search index not built yet or failed to build.";
            searchResultsContainer.style.display = 'block';
            searchResultsList.innerHTML = '';
            return;
        }

        if (query === '') {
            searchResultsList.innerHTML = '';
            searchResultsStatus.textContent = 'Type to search.'; // Or clear it
            // Keep container visible if index is ready, or hide:
            // searchResultsContainer.style.display = 'none';
            if (lunrIndex) searchResultsStatus.textContent = `Indexed ${Object.keys(lunrIndex.documentStore.docs).length} notes. Ready to search.`;
            else searchResultsStatus.textContent = '';
            return;
        }

        try {
            const results = lunrIndex.search(query);
            searchResultsList.innerHTML = ''; // Clear previous results

            if (results.length === 0) {
                searchResultsStatus.textContent = 'No results found.';
            } else {
                searchResultsStatus.textContent = `${results.length} result(s) found:`;
                results.forEach(result => {
                    const listItem = document.createElement('li');
                    listItem.textContent = result.ref; // result.ref is the filename
                    // Highlight matched terms (simple example, could be more advanced)
                    // result.matchData.metadata contains info about term matches
                    // For example:
                    // Object.keys(result.matchData.metadata).forEach(term => {
                    //    if (result.matchData.metadata[term].content) { // if term matched in content
                    //        // could add more info or styling
                    //    }
                    // });

                    listItem.addEventListener('click', () => {
                        loadNoteContent(result.ref);
                        // Optionally clear search after clicking a result
                        // searchInput.value = '';
                        // searchResultsList.innerHTML = '';
                        // searchResultsStatus.textContent = '';
                        // searchResultsContainer.style.display = 'none';
                    });
                    searchResultsList.appendChild(listItem);
                });
            }
            searchResultsContainer.style.display = 'block';
        } catch (error) {
            console.error("Error during search:", error);
            searchResultsStatus.textContent = "Error during search.";
            searchResultsList.innerHTML = '';
            searchResultsContainer.style.display = 'block';
        }
    });

});


// Helper to find and modify existing listener (conceptual, actual modification below)
// Locate: setVaultPathButton.addEventListener('click', async () => { ...
// Inside its try block, after vaultStatus.style.color = 'green';
// And after await fetchAndDisplayNotes();
// Add: await buildSearchIndex();

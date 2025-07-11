if (typeof marked?.marked?.parse === 'function') {
    marked = marked.marked;
}

document.addEventListener('DOMContentLoaded', () => {
    const vaultPathInput = document.getElementById('vault-path-input');
    const setVaultPathButton = document.getElementById('set-vault-path-button');
    const vaultStatus = document.getElementById('vault-status');
    const notesList = document.getElementById('notes-list');
    const notesListStatus = document.getElementById('notes-list-status');
    const backendStatus = document.getElementById('backend-status');
    const currentNoteTitle = document.getElementById('current-note-title');
    const noteContentDisplay = document.getElementById('note-content-display');
    const noteContentPreview = document.getElementById('note-content-preview');
    const noteContentEdit = document.getElementById('note-content-edit');
    const saveNoteButton = document.getElementById('save-note-button');
    const saveStatus = document.getElementById('save-status');
    const graphViewSection = document.getElementById('graph-view-section');
    const graphContainer = document.getElementById('graph-container');
    let visNetwork = null;

    let currentOpenNoteName = null;
    let currentOpenNoteType = 'markdown';


    const gdriveAuthStatus = document.getElementById('gdrive-auth-status');
    const gdriveConnectButton = document.getElementById('gdrive-connect-button');
    const gdriveFilesContainer = document.getElementById('gdrive-files-container');
    const gdriveFilesList = document.getElementById('gdrive-files-list');
    const gdriveFilesStatus = document.getElementById('gdrive-files-status');


    const searchInput = document.getElementById('search-input');
    const searchResultsContainer = document.getElementById('search-results-container');
    const searchResultsList = document.getElementById('search-results-list');
    const searchResultsStatus = document.getElementById('search-results-status');
    const searchSortSelect = document.getElementById('search-sort-select');
    const noteMetadataDisplay = document.getElementById('note-metadata-display');

    let lunrIndex = null;
    let currentSearchResults = []; // To store results for re-sorting
    let allNotesDataForSearch = []; // To store note content for snippet generation


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

            setTimeout(connectWebSocket, 5000);
        };

        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            backendStatus.textContent += ' | WS Error';
            backendStatus.style.color = 'red';

        };
    }

    connectWebSocket();

    function handleFileEvent(message) {
        const { event, filename } = message;
        console.log(`File event: ${event} for ${filename}`);

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
            fetchAndDisplayNotes();
        } else if (event === 'change') {
            if (filename === currentOpenNoteName) {



                console.log(`Currently open note '${filename}' changed externally. Reloading.`);
                loadNoteContent(filename);
            }
        }
    }


    async function fetchAndDisplayNotes() {
        notesList.innerHTML = '';
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
                notesListStatus.textContent = '';
            }
        } catch (error) {
            console.error('Error fetching notes:', error);
            notesListStatus.textContent = `Error: ${error.message}`;
            notesListStatus.style.color = 'red';
        }
    }


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

            await fetchAndDisplayNotes();

            await buildSearchIndex();

        } catch (error) {
            console.error('Error setting vault path:', error);
            vaultStatus.textContent = `Error: ${error.message}`;
            vaultStatus.style.color = 'red';
            notesList.innerHTML = '';
            notesListStatus.textContent = 'Vault path not set or invalid.';
        }
    });


    notesListStatus.textContent = 'Set vault path to see notes.';


    async function loadNoteContent(noteName) {
        currentOpenNoteName = null;
        currentOpenNoteType = 'markdown';
        saveStatus.textContent = '';
        saveStatus.className = 'status-message';
        currentNoteTitle.textContent = `Loading ${noteName}...`;
        noteContentEdit.value = 'Fetching content...';
        noteContentPreview.innerHTML = '<p>Fetching preview...</p>';
        noteContentDisplay.textContent = '';
        graphViewSection.style.display = 'none';
        noteMetadataDisplay.style.display = 'none';
        noteMetadataDisplay.innerHTML = '';
        if (visNetwork) {
            visNetwork.destroy();
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


            if (noteData.frontmatter && Object.keys(noteData.frontmatter).length > 0) {
                const fmTitle = document.createElement('h4');
                fmTitle.textContent = 'Metadata (Frontmatter):';
                noteMetadataDisplay.appendChild(fmTitle);
                const pre = document.createElement('pre');
                pre.textContent = JSON.stringify(noteData.frontmatter, null, 2);
                noteMetadataDisplay.appendChild(pre);
                noteMetadataDisplay.style.display = 'block';
            } else {
                noteMetadataDisplay.style.display = 'none';
            }


            noteContentEdit.value = noteData.rawContent || '';


            if (currentOpenNoteType === 'graph') {

                if (typeof marked === 'function') {
                    noteContentPreview.innerHTML = marked.parse(noteData.markdownContent || '');
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
                            shape: 'ellipse',
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

            } else {

                if (typeof marked === 'function') {
                    noteContentPreview.innerHTML = marked.parse(noteData.content || '');
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


    noteContentEdit.addEventListener('input', () => {
        saveStatus.textContent = '';
        saveStatus.className = 'status-message';

        const currentMarkdown = noteContentEdit.value;

        if (currentOpenNoteType === 'graph') {


            const graphRegex = /```json_graph\s*([\s\S]*?)\s*```/;
            const markdownPart = currentMarkdown.replace(graphRegex, '').trim();
            if (typeof marked === 'function') {
                noteContentPreview.innerHTML = marked.parse(markdownPart);
            }

        } else {
            if (typeof marked === 'function') {
                noteContentPreview.innerHTML = marked.parse(currentMarkdown);
            }
        }
    });


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


        setTimeout(() => {
            if (saveStatus.textContent !== 'Saving...') {
                 saveStatus.textContent = '';
                 saveStatus.className = 'status-message';
            }
        }, 5000);
    });


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
            gdriveConnectButton.style.display = 'block';
        }
    }

    gdriveConnectButton.addEventListener('click', async () => {
        try {
            gdriveAuthStatus.innerHTML = '<p>Status: Initiating connection...</p>';
            const response = await fetch('/api/drive/auth/initiate');
            const data = await response.json();

            if (response.ok && data.authUrl) {
                gdriveAuthStatus.innerHTML = '<p>Status: Redirecting to Google for authentication... Please follow the instructions in the new tab/window.</p>';



                const authWindow = window.open(data.authUrl, '_blank', 'width=600,height=700');



                let pollCount = 0;
                const maxPolls = 12;
                const pollInterval = setInterval(async () => {
                    pollCount++;
                    const statusResponse = await fetch('/api/drive/auth/status');
                    const statusData = await statusResponse.json();
                    if (statusData.isAuthenticated || (authWindow && authWindow.closed) || pollCount >= maxPolls) {
                        clearInterval(pollInterval);
                        checkGDriveAuthStatus();
                        if (authWindow && !authWindow.closed) {

                        }
                    }
                }, 10000);

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


                    gdriveFilesList.appendChild(listItem);
                });
                gdriveFilesStatus.textContent = '';
            }
        } catch (error) {
            console.error('Error fetching Google Drive files:', error);
            gdriveFilesStatus.textContent = `Error: ${error.message}`;
            gdriveFilesStatus.style.color = 'red';
        }
    }


    checkGDriveAuthStatus();


    async function buildSearchIndex() {
        if (!vaultPathInput.value) {
            console.log("Vault path not set, skipping search index build.");
            lunrIndex = null;

            searchInput.value = '';
            searchResultsContainer.style.display = 'none';
            searchResultsList.innerHTML = '';
            searchResultsStatus.textContent = '';
            return;
        }

        console.log("Building search index...");
        searchResultsStatus.textContent = "Building search index...";
        searchResultsContainer.style.display = 'block';

        try {
            const response = await fetch('/api/search/all-notes-content');
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP Error: ${response.status}`);
            }
            const notesData = await response.json();
            allNotesDataForSearch = notesData; // Store for snippet generation

            if (typeof lunr === 'undefined') {
                console.error("Lunr.js not loaded!");
                searchResultsStatus.textContent = "Error: Search library not loaded.";
                return;
            }

            lunrIndex = lunr(function () {
                this.ref('name');
                this.field('name', { boost: 10 });
                this.field('content');
                this.field('processedTags'); // Add the new field for tags

                notesData.forEach(function (doc) {
                    // doc will be like { name: "...", content: "...", processedTags: ["tag_foo", "tag_bar"] }
                    this.add(doc);
                }, this);
            });
            console.log("Search index built successfully.");
            searchResultsStatus.textContent = `Indexed ${notesData.length} notes. Ready to search.`;

            searchResultsList.innerHTML = '';
            if (searchInput.value === '') {

            }


        } catch (error) {
            console.error('Error building search index:', error);
            lunrIndex = null;
            searchResultsStatus.textContent = `Error building search index: ${error.message}`;
            searchResultsStatus.style.color = 'red';
        }
    }








    searchInput.addEventListener('input', () => {
        let query = searchInput.value.trim();
        let searchTerms = query;

        if (!lunrIndex) {
            searchResultsStatus.textContent = "Search index not built yet or failed to build.";
            searchResultsContainer.style.display = 'block';
            searchResultsList.innerHTML = '';
            return;
        }

        if (query === '') {
            searchResultsList.innerHTML = '';
            searchResultsStatus.textContent = 'Type to search.';


            if (lunrIndex) searchResultsStatus.textContent = `Indexed ${Object.keys(lunrIndex.documentStore.docs).length} notes. Ready to search.`;
            else searchResultsStatus.textContent = '';
            return;
        }

        // Handle specific field queries, e.g., tags:
        const tagQueryMatch = query.match(/^tags?:\s*([\w-]+)/i);
        if (tagQueryMatch && tagQueryMatch[1]) {
            const tagName = tagQueryMatch[1].toLowerCase().replace(/\s+/g, '_');
            // Construct a query that targets the processedTags field
            // Also, if there's text after the tags: query, include it as a general search term
            const remainingQuery = query.substring(tagQueryMatch[0].length).trim();
            if (remainingQuery) {
                searchTerms = `processedTags:tag_${tagName} ${remainingQuery}`;
            } else {
                searchTerms = `processedTags:tag_${tagName}`;
            }
            console.log("Executing tag search:", searchTerms);
        } else {
            searchTerms = query; // Default search if no specific prefix
        }


        try {
            // Perform the search
            const rawResults = lunrIndex.search(searchTerms);

            // Map raw Lunr results to include full note data for easier sorting and snippet generation
            currentSearchResults = rawResults.map(result => {
                const noteDetail = allNotesDataForSearch.find(n => n.name === result.ref);
                return {
                    ...result, // Includes ref, score, matchData
                    note: noteDetail // Includes name, content, processedTags, modifiedTime
                };
            });

            renderSearchResults(); // New function to handle sorting and display

        } catch (error) {
            console.error("Error during search:", error);
            searchResultsStatus.textContent = "Error during search.";
            searchResultsList.innerHTML = '';
            searchResultsContainer.style.display = 'block';
        }
    }); // Added missing parenthesis for addEventListener

    // Event listener for the sort dropdown
    searchSortSelect.addEventListener('change', () => {
        // When sort order changes, re-render the existing search results
        renderSearchResults();
    });


    function renderSearchResults() {
        searchResultsList.innerHTML = ''; // Clear previous results
        const sortBy = searchSortSelect.value;

        // Sort currentSearchResults if needed
        if (sortBy === 'date_desc') {
            currentSearchResults.sort((a, b) => (b.note?.modifiedTime || 0) - (a.note?.modifiedTime || 0));
        } else if (sortBy === 'date_asc') {
            currentSearchResults.sort((a, b) => (a.note?.modifiedTime || 0) - (b.note?.modifiedTime || 0));
        }
        // For 'relevance', Lunr's default order is used, so no explicit sort needed here if currentSearchResults are fresh from Lunr.
        // If re-rendering from a stored state that might have been sorted differently, might need to re-fetch or re-sort by score.
        // However, since searchInput triggers a new search, `currentSearchResults` will be relevance-sorted initially.

        if (currentSearchResults.length === 0) {
            searchResultsStatus.textContent = 'No results found.';
        } else {
            searchResultsStatus.textContent = `${currentSearchResults.length} result(s) found:`;
            currentSearchResults.forEach(result => { // result now contains 'note' property
                const listItem = document.createElement('li');
                const titleLink = document.createElement('a');
                    titleLink.href = '#';
                    titleLink.textContent = result.ref; // Note name
                    titleLink.addEventListener('click', (e) => {
                        e.preventDefault();
                        loadNoteContent(result.ref);
                    });
                    listItem.appendChild(titleLink);

                    // Snippet generation using result.note and result.matchData
                    // const noteData = allNotesDataForSearch.find(n => n.name === result.ref); // No longer needed, result.note has it
                    const noteData = result.note;

                    if (noteData && result.matchData && result.matchData.metadata) {
                        let snippetText = '';
                        const snippetLength = 150; // Characters
                        let termsFound = [];

                        // Collect all search terms that were found in this document
                        for (const token in result.matchData.metadata) {
                            if (result.matchData.metadata[token].content) { // Check 'content' field first
                                termsFound.push(token);
                            } else if (result.matchData.metadata[token].name) { // Then 'name'
                                 termsFound.push(token);
                            } else if (result.matchData.metadata[token].processedTags) { // Then 'processedTags'
                                // For tags, we might not want a snippet from the tag itself,
                                // but this structure allows for it if desired.
                                // termsFound.push(token.startsWith('tag_') ? token.substring(4) : token);
                            }
                        }

                        if (termsFound.length > 0 && noteData.content) {
                            const fullContent = noteData.content;
                            let bestSnippet = '';
                            let maxScore = -1;

                            // Try to find the best snippet containing any of the matched terms
                            // This is a simple approach: take the first term found in 'content'
                            for (const term of termsFound) {
                                const termPositions = result.matchData.metadata[term]?.content?.position;
                                if (termPositions && termPositions.length > 0) {
                                    const pos = termPositions[0][0]; // Start position of the first occurrence
                                    const start = Math.max(0, pos - Math.floor(snippetLength / 3));
                                    const end = Math.min(fullContent.length, pos + Math.floor(2 * snippetLength / 3));

                                    snippetText = (start > 0 ? '...' : '') +
                                                  fullContent.substring(start, end) +
                                                  (end < fullContent.length ? '...' : '');

                                    // Simple highlighting (can be improved with regex for multiple terms)
                                    const highlightTerm = term; // The actual term from Lunr's metadata
                                    const regex = new RegExp(`(${highlightTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                                    snippetText = snippetText.replace(regex, '<mark>$1</mark>');
                                    bestSnippet = snippetText;
                                    break; // Use the first term found in content for simplicity
                                }
                            }
                             if (bestSnippet) {
                                const snippetDiv = document.createElement('div');
                                snippetDiv.className = 'search-result-snippet';
                                snippetDiv.innerHTML = bestSnippet; // Use innerHTML because of <mark>
                                listItem.appendChild(snippetDiv);
                            }
                        }
                    }
                    searchResultsList.appendChild(listItem);
                });
            searchResultsContainer.style.display = 'block';
        }
    } // End of renderSearchResults function


    const createNewNoteButton = document.getElementById('create-new-note-button');
    if (createNewNoteButton) {
        createNewNoteButton.addEventListener('click', async () => {

            if (!vaultPathInput.value.trim()) {
                alert("Please set a vault path before creating a new note.");
                return;
            }

            let newFilename = window.prompt("Enter filename for the new note (e.g., my_new_note.md):");

            if (newFilename === null) {
                return;
            }
            newFilename = newFilename.trim();

            if (!newFilename) {
                alert("Filename cannot be empty.");
                return;
            }

            if (!newFilename.endsWith('.md')) {
                newFilename += '.md';
            }


            if (newFilename.length < 4) {
                alert("Invalid filename. Please provide a more descriptive name for your note.");
                return;
            }


            const invalidCharsRegex = /[<>:"/\\|?*\x00-\x1f]/;
            if (invalidCharsRegex.test(newFilename)) {
                alert("Filename contains invalid characters (e.g., <, >, :, \", /, \\, |, ?, *). Please use a valid filename.");
                return;
            }

            try {

                const titleFromFilename = newFilename.replace(/\.md$/, '');


                const response = await fetch('/api/notes/create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },

                    body: JSON.stringify({ filename: newFilename }),
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || `HTTP Error: ${response.status}`);
                }




                const saveStatusLikeElement = document.getElementById('notes-list-status');
                if (saveStatusLikeElement) {
                    saveStatusLikeElement.textContent = result.message;
                    saveStatusLikeElement.style.color = 'green';
                    setTimeout(() => {
                        if (saveStatusLikeElement.textContent === result.message) saveStatusLikeElement.textContent = '';
                    }, 3000);
                }



                await fetchAndDisplayNotes();

                loadNoteContent(result.filename);

                await buildSearchIndex();


            } catch (error) {
                console.error('Error creating new note:', error);
                alert(`Failed to create note: ${error.message}`);
            }
        });
    } else {
        console.warn("#create-new-note-button not found. UI might be outdated.");
    }

});

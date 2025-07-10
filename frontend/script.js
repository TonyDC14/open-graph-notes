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

    let currentOpenNoteName = null; // To keep track of the currently open note for saving

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
        saveStatus.textContent = ''; // Clear save status
        saveStatus.className = 'status-message';
        currentNoteTitle.textContent = `Loading ${noteName}...`;
        noteContentEdit.value = 'Fetching content...'; // Populate textarea
        noteContentPreview.innerHTML = '<p>Fetching HTML preview...</p>';
        noteContentDisplay.textContent = ''; // Clear the hidden static display


        try {
            const response = await fetch(`/api/notes/${encodeURIComponent(noteName)}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            const noteData = await response.json();

            currentNoteTitle.textContent = noteData.name;
            currentOpenNoteName = noteData.name; // Set the current note name

            // Populate the textarea with the note content
            noteContentEdit.value = noteData.content;

            // Initial parse and preview
            if (typeof marked === 'function') {
                noteContentPreview.innerHTML = marked.parse(noteData.content);
            } else {
                noteContentPreview.innerHTML = '<p style="color:red;">Error: Markdown parser (marked.js) not loaded.</p>';
                console.error("marked.js not found. Make sure it's included in your HTML.");
            }

        } catch (error) {
            console.error(`Error loading note ${noteName}:`, error);
            currentNoteTitle.textContent = `Error loading ${noteName}`;
            noteContentEdit.value = `Failed to load content: ${error.message}`;
            noteContentPreview.innerHTML = `<p style="color:red;">Failed to load preview: ${error.message}</p>`;
            currentOpenNoteName = null;
        }
    }

    // Event listener for real-time Markdown editing
    noteContentEdit.addEventListener('input', () => {
        saveStatus.textContent = ''; // Clear save status on edit
        saveStatus.className = 'status-message';
        if (typeof marked === 'function') {
            const markdownText = noteContentEdit.value;
            noteContentPreview.innerHTML = marked.parse(markdownText);
        } else {
            // This error should ideally only show once if marked is missing
            noteContentPreview.innerHTML = '<p style="color:red;">Error: Markdown parser (marked.js) not loaded.</p>';
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
});

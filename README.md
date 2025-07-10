# Local-First Knowledge Management System

A simple local-first knowledge management system inspired by Obsidian, built with Node.js, Express, and vanilla JavaScript. It operates on a local folder of Markdown files.

## Features

*   **Local Vault:** Operates on a user-specified local directory (your "vault") of `.md` files.
*   **Markdown Editor:** Edit Markdown files with a side-by-side real-time HTML preview.
*   **File Operations:**
    *   List notes from the vault.
    *   Read and display note content.
    *   Save changes back to the `.md` files.
*   **File System Watching:** Automatically detects external changes (add, modify, delete) to notes in the vault and updates the UI (e.g., refreshes note list, reloads an open note if changed externally). Uses WebSockets for real-time communication.

## Prerequisites

*   [Docker](https://www.docker.com/get-started) installed on your system.

## How to Run (using Docker)

1.  **Clone the repository (if you haven't already):**
    ```bash
    git clone <repository_url>
    cd <repository_directory>
    ```

2.  **Build the Docker image:**
    Open your terminal in the project's root directory (where the `Dockerfile` is located) and run:
    ```bash
    docker build -t knowledge-system .
    ```

3.  **Prepare your notes vault directory:**
    Create a directory on your host machine where you want to store your Markdown notes. For example:
    *   macOS/Linux: `mkdir ~/my_notes_vault`
    *   Windows: `mkdir C:\Users\YourUser\my_notes_vault`

4.  **Run the Docker container:**
    You need to map a port from your host to the container's port 3000, and you **must** mount your notes vault directory into the container. The application inside the container will expect the vault to be at `/app/notes_vault_in_container`.

    Replace `/path/on/your/host/my_notes_vault` with the actual absolute path to the vault directory you created in the previous step.

    *   **macOS/Linux:**
        ```bash
        docker run -d -p 3000:3000 -v /path/on/your/host/my_notes_vault:/app/notes_vault_in_container --name ks-app knowledge-system
        ```
        Example:
        ```bash
        docker run -d -p 3000:3000 -v ~/my_notes_vault:/app/notes_vault_in_container --name ks-app knowledge-system
        ```

    *   **Windows (Command Prompt/PowerShell):**
        ```bash
        docker run -d -p 3000:3000 -v C:\Users\YourUser\my_notes_vault:/app/notes_vault_in_container --name ks-app knowledge-system
        ```
        (Remember to replace `C:\Users\YourUser\my_notes_vault` with your actual path)

    *   `-d`: Runs the container in detached mode (in the background).
    *   `-p 3000:3000`: Maps port 3000 on your host to port 3000 in the container.
    *   `-v /path/on/your/host/my_notes_vault:/app/notes_vault_in_container`: Mounts your local notes directory into the container at the path `/app/notes_vault_in_container`. **This internal path is important for the next step.**
    *   `--name ks-app`: Assigns a name to your running container for easier management.

5.  **Access the application:**
    Open your web browser and go to:
    [http://localhost:3000](http://localhost:3000)

## How to Use the Application

1.  **Set the Vault Path:**
    *   Once the application is open in your browser, you'll see a "Vault Path" input field.
    *   You **must** enter the path *inside the container* that you mapped your notes to. Based on the `docker run` command examples above, this path is:
        ```
        /app/notes_vault_in_container
        ```
    *   Enter this path and click "Set Vault".
    *   Your notes from the mounted directory should now appear in the "Notes" list.

2.  **Basic Operations:**
    *   **View a note:** Click on a note name in the list.
    *   **Edit a note:** The content will appear in the "Markdown Editor". Type to make changes. The "HTML Preview" will update in real-time.
    *   **Save a note:** Click the "Save Note" button.

## Development (Local - Without Docker)

If you want to run the application locally for development without Docker:

1.  **Prerequisites:**
    *   [Node.js](https://nodejs.org/) (version 18.x or later recommended).
    *   npm (usually comes with Node.js).

2.  **Setup & Run Backend:**
    ```bash
    cd backend
    npm install
    node server.js
    ```
    The backend server will start, typically on port 3000.

3.  **Access Frontend:**
    Open the `frontend/index.html` file directly in your web browser.
    *   On macOS: `open ../frontend/index.html` (if you are in the `backend` directory)
    *   On Linux: `xdg-open ../frontend/index.html`
    *   On Windows: You can double-click the `index.html` file or use `start ..\frontend\index.html`.

    When running locally like this, you would provide the actual absolute path to your notes vault on your machine (e.g., `/Users/yourname/my_notes_vault` or `C:\Users\YourUser\my_notes_vault`) in the UI.

---

*This is a basic implementation. More features like graph views, advanced search, and plugin systems are planned for the future.*

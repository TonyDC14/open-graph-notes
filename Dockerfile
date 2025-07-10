# Stage 1: Build the backend
FROM node:18-alpine AS builder

WORKDIR /app/backend

# Copy package.json and package-lock.json (if available)
COPY backend/package*.json ./

# Install backend dependencies
RUN npm install

# Copy the rest of the backend code
COPY backend/ ./

# Stage 2: Setup the runtime environment
FROM node:18-alpine

WORKDIR /app

# Copy frontend files
COPY frontend/ ./frontend/

# Copy backend from builder stage
COPY --from=builder /app/backend ./backend/

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
# The server.js is now expected to be at ./backend/server.js
CMD ["node", "backend/server.js"]

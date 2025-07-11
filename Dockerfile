# Stage 1: Build the backend
FROM node:18-alpine AS builder

WORKDIR /app/backend

# Copy package.json and package-lock.json
COPY backend/package*.json ./

# Install backend dependencies
RUN npm install

# Copy the rest of the backend source code
COPY backend/ ./

# Stage 2: Final runtime image
FROM node:18-alpine

WORKDIR /app

# Copy frontend files (if static or separately handled)
COPY frontend/ ./frontend/

# Copy backend code from the builder stage
COPY --from=builder /app/backend ./backend/
# Copy backend node_modules from the builder stage
COPY --from=builder /app/backend/node_modules ./backend/node_modules

# Expose the application port
EXPOSE 3000

# Start the backend server
CMD ["node", "backend/server.js"]


# Use a Node.js LTS image
FROM node:20

# Create app directory
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy all source files including auth/.env
COPY . .
COPY auth/.env ./auth/.env

# Set the port Cloud Run will use
ENV PORT=8080
EXPOSE 8080

# Start the server
CMD ["node", "server.js"]

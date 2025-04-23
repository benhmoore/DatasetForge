FROM node:18-slim

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Define volume before installing dependencies
VOLUME ["/app/node_modules"]

# Install dependencies (use only one installation method)
RUN npm ci

# Copy the rest of the application
COPY . .

# Make sure Tailwind config and PostCSS config are set up properly
COPY postcss.config.js tailwind.config.js ./

# Ensure CSS processing works
RUN npx tailwindcss init -p --force

# Expose the port
EXPOSE 3000

# Command to run the application
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
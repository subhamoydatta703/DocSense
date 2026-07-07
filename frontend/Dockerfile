# Build Stage
FROM node:20-slim AS builder
WORKDIR /usr/src/app

# Copy package configurations
COPY package.json package-lock.json ./

# Install dependencies (frozen lockfile)
RUN npm ci

# Copy source code and config files
COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts eslint.config.js tailwind.config.js postcss.config.js index.html ./
COPY src/ ./src
COPY public/ ./public

# Declare build arguments
ARG VITE_API_URL
ARG VITE_CLERK_PUBLISHABLE_KEY

# Expose them as environment variables during build time
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY

# Build the application (outputs to dist/)
RUN npm run build

# Serve Stage
FROM nginx:alpine
COPY --from=builder /usr/src/app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
